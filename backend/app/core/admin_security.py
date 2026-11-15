import base64
import hashlib
import io
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import bcrypt
import jwt
import pyotp
import qrcode
from cryptography.fernet import Fernet

from app.core.config import settings

# Audience definitions for strict segregation from tenant tokens
AUDIENCE_ADMIN_ACCESS = "libma-admin"
AUDIENCE_ADMIN_2FA = "libma-admin-2fa"
AUDIENCE_ADMIN_REFRESH = "libma-admin-refresh"

REFRESH_COOKIE_NAME = "libma_admin_refresh"


def _get_fernet_instance() -> Fernet:
    """
    Return a Fernet cipher instance. If settings.ADMIN_FERNET_KEY is configured,
    use it; otherwise derive a deterministic 32-byte base64 key from ADMIN_SECRET_KEY.
    """
    key = settings.ADMIN_FERNET_KEY.strip()
    if not key:
        # Derive 32-byte key from ADMIN_SECRET_KEY with salt
        derived = hashlib.sha256((settings.ADMIN_SECRET_KEY + ":fernet-salt-2026").encode("utf-8")).digest()
        key = base64.urlsafe_b64encode(derived).decode("utf-8")
    elif len(key) != 44:
        # In case a raw passphrase was passed, hash to 32 bytes and base64-encode
        derived = hashlib.sha256(key.encode("utf-8")).digest()
        key = base64.urlsafe_b64encode(derived).decode("utf-8")
    return Fernet(key.encode("utf-8"))


def encrypt_totp_secret(plain_secret: str) -> str:
    """Encrypt TOTP secret using Fernet before storing in DB."""
    f = _get_fernet_instance()
    return f.encrypt(plain_secret.encode("utf-8")).decode("utf-8")


def decrypt_totp_secret(encrypted_secret: str) -> str:
    """Decrypt TOTP secret retrieved from DB."""
    f = _get_fernet_instance()
    return f.decrypt(encrypted_secret.encode("utf-8")).decode("utf-8")


def generate_totp_secret() -> str:
    """Generate a high-entropy 32-character base32 secret for pyotp."""
    return pyotp.random_base32()


def get_totp_provisioning_uri(secret: str, email: str) -> str:
    """Generate standard otpauth:// URI for authenticator apps."""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=email, issuer_name="LibMa Platform")


def generate_qr_code_data_uri(otpauth_uri: str) -> str:
    """Generate base64 data URI of QR code image (SVG) for enrollment without Pillow dependency."""
    import qrcode.image.svg
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=2,
        image_factory=qrcode.image.svg.SvgImage
    )
    qr.add_data(otpauth_uri)
    qr.make(fit=True)
    img = qr.make_image()
    buffered = io.BytesIO()
    img.save(buffered)
    b64_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
    return f"data:image/svg+xml;base64,{b64_str}"


def verify_totp_code(secret: str, code: str) -> bool:
    """Verify 6-digit TOTP code allowing 1 step (30s) clock drift."""
    clean_code = str(code).strip().replace(" ", "")
    if len(clean_code) != 6 or not clean_code.isdigit():
        return False
    totp = pyotp.TOTP(secret)
    return bool(totp.verify(clean_code, valid_window=1))


def normalize_recovery_code(code: str) -> str:
    """Normalize recovery code by stripping spaces, hyphens, and uppercase."""
    return code.strip().replace("-", "").replace(" ", "").upper()


def generate_recovery_codes(count: int = 10) -> List[str]:
    """Generate human-readable one-time recovery codes (e.g. ABCD-EFGH-JKMN)."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    codes = []
    for _ in range(count):
        part1 = "".join(secrets.choice(alphabet) for _ in range(4))
        part2 = "".join(secrets.choice(alphabet) for _ in range(4))
        codes.append(f"{part1}-{part2}")
    return codes


def hash_recovery_code(code: str) -> str:
    """Hash normalized recovery code using SHA-256 for fast constant-time lookup."""
    norm = normalize_recovery_code(code)
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()


def verify_and_consume_recovery_code(
    recovery_codes_hashed: List[str],
    provided_code: str
) -> Tuple[bool, List[str]]:
    """
    Check if normalized provided_code matches any hash in recovery_codes_hashed.
    If matched, returns (True, updated_hashes_list_with_code_removed).
    """
    if not recovery_codes_hashed or not provided_code:
        return False, recovery_codes_hashed

    provided_hash = hash_recovery_code(provided_code)
    for i, h in enumerate(recovery_codes_hashed):
        if secrets.compare_digest(h, provided_hash):
            updated = list(recovery_codes_hashed)
            updated.pop(i)
            return True, updated
    return False, recovery_codes_hashed


def hash_admin_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_admin_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8")
        )
    except Exception:
        return False


def create_admin_2fa_pending_token(
    admin_id: str,
    email: str,
    scope: str = "2fa_pending",
    expires_in_seconds: int = 300
) -> str:
    """Create short-lived (5 min) token strictly for 2FA verification/enrollment."""
    now = datetime.now(timezone.utc)
    payload: Dict[str, Any] = {
        "sub": admin_id,
        "email": email,
        "scope": scope,  # "2fa_pending" or "2fa_enroll_pending"
        "aud": AUDIENCE_ADMIN_2FA,
        "iat": now,
        "exp": now + timedelta(seconds=expires_in_seconds),
    }
    return jwt.encode(payload, settings.ADMIN_SECRET_KEY, algorithm=settings.ALGORITHM)


def create_admin_access_token(admin_id: str, email: str) -> str:
    """Create 15-minute admin access token with audience libma-admin."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES)
    payload: Dict[str, Any] = {
        "sub": admin_id,
        "email": email,
        "role": "platform_admin",
        "scope": "admin_access",
        "aud": AUDIENCE_ADMIN_ACCESS,
        "iat": now,
        "exp": expire,
    }
    return jwt.encode(payload, settings.ADMIN_SECRET_KEY, algorithm=settings.ALGORITHM)


def create_admin_refresh_token(admin_id: str, email: str) -> str:
    """Create 7-day admin refresh token with audience libma-admin-refresh."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=settings.ADMIN_REFRESH_TOKEN_EXPIRE_DAYS)
    payload: Dict[str, Any] = {
        "sub": admin_id,
        "email": email,
        "scope": "admin_refresh",
        "aud": AUDIENCE_ADMIN_REFRESH,
        "iat": now,
        "exp": expire,
    }
    return jwt.encode(payload, settings.ADMIN_SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_admin_token(
    token: str,
    expected_audience: str,
    expected_scope: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Decode admin token, validating signature against ADMIN_SECRET_KEY,
    expiration, and required audience & scope.
    """
    try:
        payload = jwt.decode(
            token,
            settings.ADMIN_SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            audience=expected_audience
        )
        if expected_scope and payload.get("scope") != expected_scope:
            return None
        return payload
    except jwt.PyJWTError:
        return None
