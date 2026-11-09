import calendar
from datetime import datetime, date, timedelta
from typing import List, Dict, Any, Optional
from zoneinfo import ZoneInfo
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload

from app.core.database import get_utc_now
from app.models.notification import Notification
from app.models.student import Student
from app.models.reminder import ReminderLog

KOLKATA_TZ = ZoneInfo("Asia/Kolkata")


def get_kolkata_today() -> date:
    """Returns today's date in Asia/Kolkata timezone, never UTC."""
    return datetime.now(KOLKATA_TZ).date()


def is_birthday_today(dob: Optional[date], today: Optional[date] = None) -> bool:
    """
    Check if today is the student's birthday in Asia/Kolkata.
    Includes leap year rule:
    If dob is Feb 29 (leap year birth) and the current year is not a leap year,
    the birthday should show on Feb 28.
    """
    if not dob:
        return False
    if today is None:
        today = get_kolkata_today()

    if dob.month == 2 and dob.day == 29:
        if calendar.isleap(today.year):
            return today.month == 2 and today.day == 29
        else:
            return today.month == 2 and today.day == 28

    return dob.month == today.month and dob.day == today.day


class NotificationService:
    @classmethod
    async def generate_notifications_for_tenant(
        cls,
        db: AsyncSession,
        tenant_id: str,
        target_date: Optional[date] = None
    ) -> int:
        """
        Idempotently generates notifications for a tenant:
        - Memberships expiring today (in Asia/Kolkata)
        - Birthdays today (in Asia/Kolkata, with leap-year handling)
        - Failed WhatsApp logs from the past 7 days
        Uses dedupe_key (unique per tenant) so existing read/dismissed state is preserved.
        """
        today = target_date or get_kolkata_today()
        seven_days_ago = get_utc_now() - timedelta(days=7)

        candidates: List[Dict[str, Any]] = []

        # 1. Memberships expiring today
        expiring_q = (
            select(Student)
            .where(
                Student.tenant_id == tenant_id,
                Student.status.in_(["active", "paused"]),
                Student.expiry_date == today
            )
        )
        res_expiring = await db.execute(expiring_q)
        expiring_students = res_expiring.scalars().all()

        for s in expiring_students:
            dedupe_key = f"membership_expiring:{s.id}:{today.isoformat()}"
            candidates.append({
                "type": "membership_expiring",
                "student_id": s.id,
                "title": f"{s.full_name}'s membership expires today",
                "body": f"Library membership for {s.full_name} is valid until today. Collect fee or send a reminder.",
                "dedupe_key": dedupe_key
            })

        # 2. Birthdays today
        birthday_q = (
            select(Student)
            .where(
                Student.tenant_id == tenant_id,
                Student.date_of_birth.is_not(None)
            )
        )
        res_birthdays = await db.execute(birthday_q)
        all_students_with_dob = res_birthdays.scalars().all()

        for s in all_students_with_dob:
            if is_birthday_today(s.date_of_birth, today):
                dedupe_key = f"birthday:{s.id}:{today.isoformat()}"
                candidates.append({
                    "type": "birthday",
                    "student_id": s.id,
                    "title": f"Today is {s.full_name}'s birthday",
                    "body": f"Wish {s.full_name} a happy birthday! Send warm wishes on WhatsApp.",
                    "dedupe_key": dedupe_key
                })

        # 3. Failed WhatsApp reminder logs from past 7 days
        failed_whatsapp_q = (
            select(ReminderLog)
            .options(selectinload(ReminderLog.student))
            .where(
                ReminderLog.tenant_id == tenant_id,
                ReminderLog.status == "failed",
                ReminderLog.sent_at >= seven_days_ago
            )
        )
        res_failed = await db.execute(failed_whatsapp_q)
        failed_logs = res_failed.scalars().all()

        for fl in failed_logs:
            s_name = fl.student.full_name if fl.student else "Student"
            dedupe_key = f"whatsapp_failed:{fl.id}"
            err_msg = fl.error_reason or fl.provider_response or "Failed to deliver WhatsApp reminder message"
            candidates.append({
                "type": "whatsapp_failed",
                "student_id": fl.student_id,
                "title": f"WhatsApp reminder failed for {s_name}",
                "body": err_msg,
                "dedupe_key": dedupe_key
            })

        if not candidates:
            return 0

        # 4. Filter out candidate keys that already exist in database
        candidate_keys = [c["dedupe_key"] for c in candidates]
        existing_q = select(Notification.dedupe_key).where(
            Notification.tenant_id == tenant_id,
            Notification.dedupe_key.in_(candidate_keys)
        )
        res_existing = await db.execute(existing_q)
        existing_keys = set(res_existing.scalars().all())

        new_count = 0
        for c in candidates:
            if c["dedupe_key"] not in existing_keys:
                notification = Notification(
                    tenant_id=tenant_id,
                    type=c["type"],
                    student_id=c.get("student_id"),
                    title=c["title"],
                    body=c["body"],
                    dedupe_key=c["dedupe_key"]
                )
                db.add(notification)
                existing_keys.add(c["dedupe_key"])
                new_count += 1

        if new_count > 0:
            await db.commit()

        return new_count

