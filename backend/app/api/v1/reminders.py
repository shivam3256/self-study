from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.tenant import User
from app.models.reminder import ReminderLog
from app.services.reminder_service import ReminderService

router = APIRouter(prefix="/reminders", tags=["Payment Reminders"])

@router.post("/trigger")
async def trigger_reminders(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await ReminderService.process_tenant_reminders(db, current_user.tenant_id)
    return result

@router.get("/logs")
async def get_reminder_logs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(ReminderLog)
        .options(selectinload(ReminderLog.student))
        .where(ReminderLog.tenant_id == current_user.tenant_id)
        .order_by(ReminderLog.sent_at.desc())
        .limit(50)
    )
    res = await db.execute(query)
    logs = res.scalars().all()

    return [
        {
            "id": l.id,
            "student_name": l.student.full_name if l.student else "Student",
            "phone": l.student.phone if l.student else "",
            "reminder_type": l.reminder_type,
            "channel": l.channel,
            "status": l.status,
            "message": l.message,
            "sent_at": l.sent_at.isoformat(),
            "provider_response": l.provider_response
        }
        for l in logs
    ]

@router.post("/retry/{log_id}")
async def retry_reminder(
    log_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(ReminderLog)
        .options(selectinload(ReminderLog.student))
        .where(ReminderLog.id == log_id, ReminderLog.tenant_id == current_user.tenant_id)
    )
    res = await db.execute(query)
    log = res.scalar_one_or_none()
    
    if not log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Log not found")
    
    if not log.student:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Associated student not found")

    log.status = "pending"
    log.provider_response = "Manual retry queued"
    await db.commit()

    from app.worker import celery_app
    celery_app.send_task("app.worker.send_whatsapp_task", args=[log.id, log.student.phone, log.message])
    
    return {"status": "success", "message": "WhatsApp retry task dispatched"}
