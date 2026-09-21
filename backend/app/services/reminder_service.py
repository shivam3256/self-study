from datetime import date, timedelta
from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.models.student import Student
from app.models.tenant import Tenant
from app.models.reminder import ReminderLog
from app.core.config import settings

class ReminderService:
    @staticmethod
    async def process_tenant_reminders(db: AsyncSession, tenant_id: str) -> Dict[str, Any]:
        today = date.today()
        seven_days = today + timedelta(days=7)
        three_days = today + timedelta(days=3)
        one_day = today + timedelta(days=1)

        tenant_res = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
        tenant = tenant_res.scalar_one_or_none()
        if not tenant:
            return {"sent": 0, "errors": ["Tenant not found"]}

        # Find active students with expiry dates
        query = (
            select(Student)
            .options(selectinload(Student.allocations))
            .where(
                Student.tenant_id == tenant_id,
                Student.status == "active",
                Student.expiry_date != None
            )
        )
        res = await db.execute(query)
        students = res.scalars().all()

        sent_count = 0
        logs = []
        tasks_to_dispatch = []

        for student in students:
            reminder_type = None
            if student.expiry_date == seven_days:
                reminder_type = "7_days_before"
            elif student.expiry_date == three_days:
                reminder_type = "3_days_before"
            elif student.expiry_date == one_day:
                reminder_type = "1_day_before"
            elif student.expiry_date < today:
                reminder_type = "overdue"

            if not reminder_type:
                continue

            # Check if reminder of this type was already sent today
            log_check = await db.execute(
                select(ReminderLog).where(
                    ReminderLog.tenant_id == tenant_id,
                    ReminderLog.student_id == student.id,
                    ReminderLog.reminder_type == reminder_type
                )
            )
            already_sent = log_check.scalars().first()
            if already_sent:
                continue

            expiry_formatted = student.expiry_date.strftime('%d-%b-%Y')
            if reminder_type == "overdue":
                msg = (
                    f"Hello {student.full_name}, your membership at *{tenant.name}* expired on *{expiry_formatted}*. "
                    f"Please renew your subscription to secure your reserved desk. "
                    f"Contact us at {tenant.phone or 'the front desk'}."
                )
            else:
                msg = (
                    f"Hello {student.full_name}, this is a gentle reminder that your membership at *{tenant.name}* "
                    f"is expiring on *{expiry_formatted}*. "
                    f"Please renew to ensure uninterrupted access. Contact: {tenant.phone or 'the reception'}."
                )

            reminder_log = ReminderLog(
                tenant_id=tenant_id,
                student_id=student.id,
                reminder_type=reminder_type,
                channel="whatsapp",
                status="pending",
                message=msg,
                provider_response="Queued for WhatsApp delivery"
            )
            db.add(reminder_log)
            await db.flush()
            
            tasks_to_dispatch.append((reminder_log.id, student.phone, msg))
            sent_count += 1
            logs.append({"student": student.full_name, "type": reminder_type, "phone": student.phone})

        await db.commit()

        # Dispatch to Celery worker only after successful DB commit
        from app.worker import celery_app
        for log_id, phone, msg in tasks_to_dispatch:
            celery_app.send_task("app.worker.send_whatsapp_task", args=[log_id, phone, msg])

        return {"sent_count": sent_count, "logs": logs}
