import asyncio
import httpx
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import select, update

from app.core.config import settings
from app.models.tenant import Tenant

try:
    from celery import Celery
    from celery.schedules import crontab
    celery_app = Celery("worker", broker=settings.REDIS_URL, backend=settings.REDIS_URL)
    HAS_CELERY = True
except ImportError:
    HAS_CELERY = False
    class MockCelery:
        def task(self, *args, **kwargs):
            def decorator(f):
                return f
            return decorator
        
        def send_task(self, name, args=None, kwargs=None):
            args = args or []
            if name in ("app.worker.send_whatsapp_task", "app.worker.send_sms_task") and args:
                try:
                    loop = asyncio.get_running_loop()
                    loop.create_task(_send_whatsapp_async(*args))
                except RuntimeError:
                    asyncio.run(_send_whatsapp_async(*args))

    celery_app = MockCelery()

if HAS_CELERY:
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
    name="app.worker.send_whatsapp_task",
    autoretry_for=(Exception,),
    retry_backoff=True,
    max_retries=5,
    retry_jitter=True
)
def send_whatsapp_task(log_id: str, phone: str, message: str):
    """
    Asynchronous task to deliver WhatsApp reminder message via WhatsApp Meta Cloud API.
    """
    return asyncio.run(_send_whatsapp_async(log_id, phone, message))

# Backward compatibility alias for any queued tasks
@celery_app.task(name="app.worker.send_sms_task")
def send_sms_task(log_id: str, phone: str, message: str):
    return send_whatsapp_task(log_id, phone, message)

async def _send_whatsapp_async(log_id: str, phone: str, message: str):
    status = "failed"
    response_text = ""
    
    # Format phone number for WhatsApp Meta Cloud API (E.164 without +, e.g., 919876543210)
    clean_phone = "".join(filter(str.isdigit, phone))
    if clean_phone.startswith("91") and len(clean_phone) > 10:
        pass  # already includes country code
    elif len(clean_phone) == 10:
        clean_phone = "91" + clean_phone

    # Check if Meta Cloud API credentials are provided or if running in mock mode
    is_meta = (
        getattr(settings, "WHATSAPP_PROVIDER", "mock") == "meta" or 
        bool(getattr(settings, "WHATSAPP_ACCESS_TOKEN", None) and getattr(settings, "WHATSAPP_PHONE_NUMBER_ID", None))
    )

    if not is_meta or settings.WHATSAPP_PROVIDER == "mock":
        status = "sent"
        response_text = "Delivered via WhatsApp (Mock Provider)"
    else:
        try:
            url = f"https://graph.facebook.com/{settings.WHATSAPP_API_VERSION}/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages"
            headers = {
                "Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}",
                "Content-Type": "application/json"
            }
            payload = {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": clean_phone,
                "type": "text",
                "text": {
                    "preview_url": False,
                    "body": message
                }
            }
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                resp_json = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
                
                if 200 <= resp.status_code < 300:
                    msg_id = (resp_json.get("messages", [{}])[0].get("id")) if resp_json.get("messages") else "OK"
                    status = "sent"
                    response_text = f"Delivered via WhatsApp Meta Cloud API (Message ID: {msg_id})"
                else:
                    err_detail = resp_json.get("error", {}).get("message", resp.text)
                    status = "failed"
                    response_text = f"WhatsApp API Error ({resp.status_code}): {err_detail}"
        except Exception as e:
            status = "failed"
            response_text = f"WhatsApp delivery failed: {str(e)}"

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
        raise Exception(f"WhatsApp delivery failed for log {log_id}: {response_text}")

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