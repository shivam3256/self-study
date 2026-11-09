from datetime import timedelta, date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, update
from sqlalchemy.orm import selectinload

from app.core.database import get_db, get_utc_now
from app.core.deps import get_current_user
from app.models.tenant import User, Tenant
from app.models.notification import Notification
from app.models.student import Student
from app.models.reminder import ReminderLog
from app.schemas.notification import NotificationResponse, NotificationListResponse
from app.services.notification_service import NotificationService

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns active tenant notifications (newest first, excluding dismissed ones and
    older than 7 days) and the total unread count.
    Generates any pending expiry or birthday notifications idempotently before querying.
    """
    if not current_user.tenant_id:
        return NotificationListResponse(unread_count=0, notifications=[])

    # 1. Sync / generate fresh notifications for this tenant
    await NotificationService.generate_notifications_for_tenant(db, current_user.tenant_id)

    seven_days_ago = get_utc_now() - timedelta(days=7)

    base_filter = and_(
        Notification.tenant_id == current_user.tenant_id,
        Notification.dismissed_at.is_(None),
        Notification.created_at >= seven_days_ago
    )

    # 2. Compute unread count
    count_q = select(func.count(Notification.id)).where(
        base_filter,
        Notification.read_at.is_(None)
    )
    unread_res = await db.execute(count_q)
    unread_count = unread_res.scalar_one() or 0

    # 3. Retrieve newest notifications
    list_q = (
        select(Notification)
        .options(selectinload(Notification.student))
        .where(base_filter)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    items_res = await db.execute(list_q)
    notifications = items_res.scalars().all()

    output = []
    for n in notifications:
        s_name = n.student.full_name if n.student else None
        s_phone = n.student.phone if n.student else None
        output.append(
            NotificationResponse(
                id=n.id,
                tenant_id=n.tenant_id,
                type=n.type,
                student_id=n.student_id,
                student_name=s_name,
                student_phone=s_phone,
                title=n.title,
                body=n.body,
                dedupe_key=n.dedupe_key,
                created_at=n.created_at,
                read_at=n.read_at,
                dismissed_at=n.dismissed_at
            )
        )

    return NotificationListResponse(unread_count=unread_count, notifications=output)


@router.post("/read-all")
async def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Marks all active unread notifications as read for this tenant."""
    if not current_user.tenant_id:
        return {"status": "success", "count": 0}

    now_utc = get_utc_now()
    res = await db.execute(
        update(Notification)
        .where(
            Notification.tenant_id == current_user.tenant_id,
            Notification.read_at.is_(None),
            Notification.dismissed_at.is_(None)
        )
        .values(read_at=now_utc)
    )
    await db.commit()
    return {"status": "success", "count": res.rowcount}


@router.post("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Marks an individual notification as read."""
    q = select(Notification).where(
        Notification.id == notification_id,
        Notification.tenant_id == current_user.tenant_id
    )
    res = await db.execute(q)
    notif = res.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    if not notif.read_at:
        notif.read_at = get_utc_now()
        await db.commit()

    return {"status": "success", "id": notification_id}


@router.post("/{notification_id}/dismiss")
async def dismiss_notification(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Dismisses an individual notification (hides it from active views)."""
    q = select(Notification).where(
        Notification.id == notification_id,
        Notification.tenant_id == current_user.tenant_id
    )
    res = await db.execute(q)
    notif = res.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    now_utc = get_utc_now()
    notif.dismissed_at = now_utc
    if not notif.read_at:
        notif.read_at = now_utc
    await db.commit()

    return {"status": "success", "id": notification_id}


@router.post("/{notification_id}/retry-whatsapp")
async def retry_whatsapp_notification(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Re-sends the failed message using the existing WhatsApp send function,
    updates the log, and marks the notification resolved on success.
    On failure it returns a clear error.
    """
    q = (
        select(Notification)
        .options(selectinload(Notification.student))
        .where(
            Notification.id == notification_id,
            Notification.tenant_id == current_user.tenant_id
        )
    )
    res = await db.execute(q)
    notif = res.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    if notif.type != "whatsapp_failed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only failed WhatsApp notifications can be retried")

    # Extract log_id from dedupe_key ("whatsapp_failed:{log_id}")
    log_id = notif.dedupe_key.replace("whatsapp_failed:", "")
    log_q = (
        select(ReminderLog)
        .options(selectinload(ReminderLog.student))
        .where(
            ReminderLog.id == log_id,
            ReminderLog.tenant_id == current_user.tenant_id
        )
    )
    log_res = await db.execute(log_q)
    rem_log = log_res.scalar_one_or_none()
    if not rem_log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Associated WhatsApp log not found")

    student = rem_log.student or notif.student
    if not student or not student.phone or student.phone == "N/A":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Valid student phone number required for WhatsApp delivery")

    from app.worker import _send_whatsapp_async
    try:
        await _send_whatsapp_async(rem_log.id, student.phone, rem_log.message)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    now_utc = get_utc_now()
    notif.read_at = now_utc
    notif.dismissed_at = now_utc
    await db.commit()

    return {"status": "success", "message": "WhatsApp message delivered successfully"}


@router.post("/{notification_id}/send-birthday-wishes")
async def send_birthday_wishes(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Sends a default birthday WhatsApp message to the student and marks notification read."""
    q = (
        select(Notification)
        .options(selectinload(Notification.student))
        .where(
            Notification.id == notification_id,
            Notification.tenant_id == current_user.tenant_id
        )
    )
    res = await db.execute(q)
    notif = res.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    student = notif.student
    if not student or not student.phone or student.phone == "N/A":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Valid student phone number required for WhatsApp wishes")

    tenant_res = await db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    tenant = tenant_res.scalar_one_or_none()
    lib_name = tenant.name if tenant else "Apex Predator Library"

    msg = f"Happy Birthday {student.full_name}! 🎂 Wishing you grand success, health, and focus. Warm regards from all of us at {lib_name}."

    rem_log = ReminderLog(
        tenant_id=current_user.tenant_id,
        student_id=student.id,
        reminder_type="birthday",
        channel="whatsapp",
        status="pending",
        message=msg,
        provider_response="Queued for WhatsApp birthday wishes"
    )
    db.add(rem_log)
    await db.flush()

    from app.worker import _send_whatsapp_async
    try:
        await _send_whatsapp_async(rem_log.id, student.phone, msg)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to send wishes: {str(exc)}")

    now_utc = get_utc_now()
    notif.read_at = now_utc
    await db.commit()

    return {"status": "success", "message": f"Birthday wishes sent to {student.full_name}"}

