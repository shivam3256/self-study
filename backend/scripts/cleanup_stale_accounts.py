"""
Background cleanup script:
- Deletes expired OTP records.
- Deletes stale unverified users created > 48 hours ago who have no workspace / tenant_id.
"""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from datetime import timedelta
from sqlalchemy import delete, and_
from app.core.database import AsyncSessionLocal, get_utc_now
from app.models.otp import EmailOTP
from app.models.tenant import User

async def run_cleanup():
    print("Running cleanup for expired OTPs and stale unverified accounts...")
    now = get_utc_now()
    cutoff_unverified = now - timedelta(hours=48)

    async with AsyncSessionLocal() as db:
        # 1. Delete expired / consumed OTPs older than 24 hours
        otp_cutoff = now - timedelta(hours=24)
        del_otps = await db.execute(
            delete(EmailOTP).where(
                and_(
                    EmailOTP.expires_at < now,
                    EmailOTP.created_at < otp_cutoff
                )
            )
        )
        print(f"Deleted {del_otps.rowcount} expired/consumed OTP records.")

        # 2. Delete stale unverified users older than 48 hours with no tenant_id
        del_users = await db.execute(
            delete(User).where(
                and_(
                    User.email_verified == False,
                    User.tenant_id.is_(None),
                    User.created_at < cutoff_unverified
                )
            )
        )
        print(f"Deleted {del_users.rowcount} stale unverified user registrations.")

        await db.commit()
    print("Cleanup completed.")

if __name__ == "__main__":
    asyncio.run(run_cleanup())
