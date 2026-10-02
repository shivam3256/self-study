import secrets
import hmac
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, update, func

from app.core.config import settings
from app.core.database import get_utc_now
from app.models.tenant import User
from app.models.otp import EmailOTP
from app.services.email_service import email_service

def generate_otp_code() -> str:
    """Generate a cryptographically secure 6-digit OTP string."""
    return f"{secrets.randbelow(1000000):06d}"

def hash_otp_code(code: str) -> str:
    """Hash the OTP using HMAC-SHA256 with the server secret key."""
    return hmac.new(
        settings.OTP_SECRET.encode("utf-8"),
        code.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()

def verify_otp_code(plain_code: str, stored_hash: str) -> bool:
    """Compare the provided plain OTP against the stored hash in constant time."""
    candidate_hash = hash_otp_code(plain_code)
    return hmac.compare_digest(candidate_hash, stored_hash)


def ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


class OTPService:
    @staticmethod
    async def create_and_send_otp(
        db: AsyncSession,
        user: User,
        purpose: str = "signup_verify"
    ) -> Tuple[bool, int, Optional[str]]:
        """
        Generates and sends an OTP for the user and purpose.
        Returns: (success: bool, cooldown_seconds_remaining: int, error_message: Optional[str])
        """
        now = ensure_utc(get_utc_now())

        # 1. Check for active cooldown (60 seconds)
        recent_otp_query = select(EmailOTP).where(
            and_(
                EmailOTP.user_id == user.id,
                EmailOTP.purpose == purpose
            )
        ).order_by(EmailOTP.created_at.desc()).limit(1)

        recent_res = await db.execute(recent_otp_query)
        latest_otp = recent_res.scalar_one_or_none()

        if latest_otp and latest_otp.created_at:
            created_at = ensure_utc(latest_otp.created_at)
            elapsed = (now - created_at).total_seconds()
            if elapsed < settings.OTP_RESEND_COOLDOWN_SECONDS:
                remaining = int(settings.OTP_RESEND_COOLDOWN_SECONDS - elapsed)
                return False, remaining, f"Please wait {remaining} seconds before requesting another code."

        # 2. Check hourly cap (max 5 OTPs per hour)
        one_hour_ago = now - timedelta(hours=1)
        count_query = select(func.count(EmailOTP.id)).where(
            and_(
                EmailOTP.user_id == user.id,
                EmailOTP.purpose == purpose,
                EmailOTP.created_at >= one_hour_ago
            )
        )
        count_res = await db.execute(count_query)
        hourly_count = count_res.scalar() or 0

        if hourly_count >= settings.OTP_HOURLY_LIMIT:
            return False, 0, "Too many verification requests. Please try again in an hour."

        # 3. Invalidate previous unconsumed OTPs for this user & purpose
        await db.execute(
            update(EmailOTP)
            .where(
                and_(
                    EmailOTP.user_id == user.id,
                    EmailOTP.purpose == purpose,
                    EmailOTP.consumed_at.is_(None)
                )
            )
            .values(consumed_at=now)
        )

        # 4. Generate fresh OTP
        code = generate_otp_code()
        code_hash = hash_otp_code(code)
        expires_at = now + timedelta(minutes=settings.OTP_EXPIRY_MINUTES)

        otp_record = EmailOTP(
            user_id=user.id,
            purpose=purpose,
            code_hash=code_hash,
            expires_at=expires_at,
            attempts=0,
            consumed_at=None
        )
        db.add(otp_record)
        await db.flush()

        # 5. Send Email
        send_success = await email_service.send_otp_email(user.email, code, purpose=purpose)
        if not send_success:
            # Note: We still keep OTP so they can retry, but return friendly warning
            return True, settings.OTP_RESEND_COOLDOWN_SECONDS, "Email delivery in progress."

        return True, settings.OTP_RESEND_COOLDOWN_SECONDS, None

    @staticmethod
    async def verify_otp(
        db: AsyncSession,
        user: User,
        code: str,
        purpose: str = "signup_verify"
    ) -> Tuple[bool, Optional[str], Optional[EmailOTP]]:
        """
        Validates the supplied code for the user and purpose.
        Returns: (is_valid: bool, error_detail: Optional[str], otp_record: Optional[EmailOTP])
        """
        now = get_utc_now()
        clean_code = code.strip()

        # Find the latest unconsumed OTP for this user and purpose
        query = select(EmailOTP).where(
            and_(
                EmailOTP.user_id == user.id,
                EmailOTP.purpose == purpose,
                EmailOTP.consumed_at.is_(None)
            )
        ).order_by(EmailOTP.created_at.desc()).limit(1)

        result = await db.execute(query)
        otp = result.scalar_one_or_none()

        if not otp:
            return False, "Invalid or expired verification code. Please request a new code.", None

        # Check if expired
        # Make sure datetime comparison handles timezone awareness correctly
        exp = otp.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)

        if now > exp:
            otp.consumed_at = now
            await db.flush()
            return False, "Verification code has expired. Please request a new code.", None

        # Check attempts limit
        if otp.attempts >= settings.OTP_MAX_ATTEMPTS:
            otp.consumed_at = now
            await db.flush()
            return False, "Too many failed attempts. This code has been invalidated. Please request a new code.", None

        # Constant-time comparison
        is_match = verify_otp_code(clean_code, otp.code_hash)
        if not is_match:
            otp.attempts += 1
            if otp.attempts >= settings.OTP_MAX_ATTEMPTS:
                otp.consumed_at = now
                await db.flush()
                return False, "Too many failed attempts. This code has been invalidated. Please request a new code.", None
            await db.flush()
            return False, "Incorrect verification code. Please try again.", None

        # OTP is valid!
        otp.consumed_at = now
        await db.flush()
        return True, None, otp


otp_service = OTPService()
