import asyncio
import httpx
from celery import Celery
from celery.schedules import crontab
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import select, update

from app.core.config import settings
from app.models.tenant import Tenant
from app.services.reminder_service import ReminderService

celery_app = Celery("worker", broker=settings.REDIS_URL, backend=settings.REDIS_URL)

@celery_app.on_after_configure.connect
def setup_periodic_tasks(sender, **kwargs):
    # Trigger daily at 8 AM to check for expiring memberships across all tenants
    sender.add_periodic_task(
        crontab(hour=8, minute=0),
        send_daily_reminders.s(),
        name="send-daily-reminders-8am"
    )

@celery_app.task
def send_daily_reminders():
    """
    Synchronous entry point for Celery to process all tenants' reminders.
    """
    return asyncio.run(_process_all_tenants())

@celery_app.task(
    name="app.worker.send_sms_task",
    autoretry_for=(Exception,),
    retry_backoff=True,
    max_retries=5,
    retry_jitter=True
)
def send_sms_task(log_id: str, phone: str, message: str):
    """
    Asynchronous task to deliver SMS via configured gateway.
    """
    return asyncio.run(_send_sms_async(log_id, phone, message))

async def _send_sms_async(log_id: str, phone: str, message: str):
    status = "failed"
    response_text = ""
    
    # Clean phone number (remove non-digits for most Indian gateways)
    clean_phone = "".join(filter(str.isdigit, phone))
    if clean_phone.startswith("91") and len(clean_phone) > 10:
        pass # already has country code
    elif len(clean_phone) == 10:
        clean_phone = "91" + clean_phone

    # Integration logic
    if settings.SMS_PROVIDER == "mock":
        status = "sent"
        response_text = "Delivered (Mock Provider)"
    elif settings.SMS_PROVIDER == "msg91":
        try:
            async with httpx.AsyncClient() as client:
                # Using MSG91 Flow API structure
                resp = await client.post(
                    "https://api.msg91.com/api/v5/flow/",
                    headers={
                        "authkey": settings.SMS_API_KEY,
                        "Content-Type": "application/json"
                    },
                    json={
                        "template_id": "DEFAULT_TEMPLATE", 
                        "sender": settings.SMS_SENDER_ID,
                        "mobiles": clean_phone,
                        "var1": message
                    }
                )
                response_text = resp.text
                resp.raise_for_status()
                status = "sent"
        except Exception as e:
            response_text = str(e)
    elif settings.SMS_PROVIDER == "fast2sms":
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "https://www.fast2sms.com/dev/bulkV2",
                    headers={"authorization": settings.SMS_API_KEY},
                    json={"route": "q", "message": message, "language": "english", "numbers": clean_phone}
                )
                response_text = resp.text
                resp.raise_for_status()
                status = "sent"
        except Exception as e:
            response_text = str(e)

    # Update the ReminderLog in database
    from app.models.reminder import ReminderLog
    engine = create_async_engine(settings.DATABASE_URL)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as db:
        await db.execute(
            update(ReminderLog)
            .where(ReminderLog.id == log_id)
            .values(status=status, provider_response=response_text)
        )
        await db.commit()
    await engine.dispose()

    if status != "sent":
        raise Exception(f"SMS delivery failed for log {log_id}: {response_text}")

async def _process_all_tenants():
    engine = create_async_engine(settings.DATABASE_URL)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    
    async with session_factory() as db:
        # Fetch all active tenants to ensure multi-tenant processing
        query = select(Tenant).where(Tenant.is_active == True)
        res = await db.execute(query)
        tenants = res.scalars().all()
        
        for tenant in tenants:
            await ReminderService.process_tenant_reminders(db, tenant.id)
    
    await engine.dispose()