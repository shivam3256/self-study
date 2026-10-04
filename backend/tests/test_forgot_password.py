"""
Tests for the Forgot Password / Reset Password flow.
Covers:
  1. Success path — full forgot → reset cycle
  2. Wrong code increments attempts
  3. Expired code rejected
  4. Reused code rejected
  5. Unknown email → same generic 200 response
  6. Google-only user (no real password) can set one via reset
  7. Purpose isolation — signup OTP can't reset password and vice versa
"""
import asyncio
import pytest
import uuid
from datetime import timedelta
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select, and_

from app.main import app
from app.core.database import AsyncSessionLocal, get_utc_now
from app.core.rate_limit import clear_rate_limits
from app.core.security import get_password_hash, verify_password
from app.models.tenant import Tenant, User
from app.models.otp import EmailOTP
from app.models.shift import Shift
from app.models.plan import Plan
from app.services.otp_service import hash_otp_code
from app.services.email_service import mock_sent_emails


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def reset_state():
    mock_sent_emails.clear()
    clear_rate_limits()


def _signup_payload(unique: str, email: str) -> dict:
    return {
        "library_name": f"Reset Test Library {unique}",
        "owner_name": "Reset Owner",
        "phone": "9876543210",
        "city": "Delhi",
        "email": email,
        "password": "OldPassword1!",
    }


async def _create_verified_user(db, unique: str, email: str) -> User:
    """Create a fully verified user+tenant pair directly in the DB."""
    hashed = await asyncio.to_thread(get_password_hash, "OldPassword1!")
    tenant = Tenant(
        name=f"ResetLib {unique}",
        slug=f"reset-lib-{unique}",
        owner_name="Reset Owner",
        email=email,
        phone="9876543210",
        subscription_tier="pro",
        subscription_status="active",
    )
    db.add(tenant)
    await db.flush()

    user = User(
        tenant_id=tenant.id,
        full_name="Reset Owner",
        email=email,
        hashed_password=hashed,
        role="owner",
        is_active=True,
        email_verified=True,
        email_verified_at=get_utc_now(),
    )
    db.add(user)
    await db.flush()

    # Seed shifts so login doesn't fail
    from app.api.v1.auth import seed_tenant_defaults
    seed_tenant_defaults(db, tenant.id)

    await db.commit()
    await db.refresh(user)
    return user


async def _plant_reset_otp(db, user: User, code: str = "555111", *, expired: bool = False) -> EmailOTP:
    """Directly insert a known password_reset OTP for a user."""
    now = get_utc_now()
    otp = EmailOTP(
        user_id=user.id,
        purpose="password_reset",
        code_hash=hash_otp_code(code),
        expires_at=now - timedelta(minutes=15) if expired else now + timedelta(minutes=10),
        attempts=0,
        consumed_at=None,
    )
    db.add(otp)
    await db.commit()
    await db.refresh(otp)
    return otp


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_forgot_password_success_path():
    """
    Full cycle:
      1. POST /auth/forgot-password  → 200 generic message
      2. Set a known code hash in DB
      3. POST /auth/reset-password   → 200 success
      4. Verify hashed_password changed in DB
      5. Old password no longer works; new password logs in
    """
    transport = ASGITransport(app=app)
    unique = str(uuid.uuid4())[:8]
    email = f"reset_success_{unique}@example.com"

    async with AsyncSessionLocal() as db:
        user = await _create_verified_user(db, unique, email)
        original_hash = user.hashed_password

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Forgot password
        resp = await ac.post("/api/v1/auth/forgot-password", json={"email": email})
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "password-reset code has been sent" in data["message"]

    # 2. Plant a known code
    async with AsyncSessionLocal() as db:
        user_res = await db.execute(select(User).where(User.email == email))
        user = user_res.scalar_one()
        otp_res = await db.execute(
            select(EmailOTP).where(
                and_(EmailOTP.user_id == user.id, EmailOTP.purpose == "password_reset", EmailOTP.consumed_at.is_(None))
            )
        )
        otp = otp_res.scalar_one()
        otp.code_hash = hash_otp_code("123456")
        await db.commit()

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 3. Reset with correct code
        reset_resp = await ac.post("/api/v1/auth/reset-password", json={
            "email": email,
            "code": "123456",
            "new_password": "NewPassword2@",
        })
        assert reset_resp.status_code == 200
        rdata = reset_resp.json()
        assert rdata["success"] is True
        assert "sign in" in rdata["message"].lower()
        # Must NOT issue a token
        assert "access_token" not in rdata

    # 4. Verify password changed in DB
    async with AsyncSessionLocal() as db:
        user_res = await db.execute(select(User).where(User.email == email))
        updated_user = user_res.scalar_one()
        assert updated_user.hashed_password != original_hash
        assert await asyncio.to_thread(verify_password, "NewPassword2@", updated_user.hashed_password)
        assert not await asyncio.to_thread(verify_password, "OldPassword1!", updated_user.hashed_password)

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 5. New password can login; old password cannot
        login_ok = await ac.post("/api/v1/auth/login", json={"email": email, "password": "NewPassword2@"})
        assert login_ok.status_code == 200
        assert "access_token" in login_ok.json()

        login_fail = await ac.post("/api/v1/auth/login", json={"email": email, "password": "OldPassword1!"})
        assert login_fail.status_code == 401


@pytest.mark.asyncio
async def test_wrong_code_increments_attempts():
    """
    Submitting wrong codes increments otp.attempts.
    After 5 failed attempts the OTP is locked (429) and even the correct code
    is subsequently rejected.
    """
    transport = ASGITransport(app=app)
    unique = str(uuid.uuid4())[:8]
    email = f"reset_attempts_{unique}@example.com"

    async with AsyncSessionLocal() as db:
        user = await _create_verified_user(db, unique, email)
        await _plant_reset_otp(db, user, code="999888")

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 4 wrong attempts → 400 each time
        for _ in range(4):
            r = await ac.post("/api/v1/auth/reset-password", json={
                "email": email, "code": "000000", "new_password": "NewPassword2@"
            })
            assert r.status_code == 400
            assert "Incorrect" in r.json()["detail"]

        # 5th wrong attempt → locked (429)
        r5 = await ac.post("/api/v1/auth/reset-password", json={
            "email": email, "code": "000000", "new_password": "NewPassword2@"
        })
        assert r5.status_code == 429
        assert "Too many" in r5.json()["detail"]

        # Correct code after lock → still rejected
        r6 = await ac.post("/api/v1/auth/reset-password", json={
            "email": email, "code": "999888", "new_password": "NewPassword2@"
        })
        assert r6.status_code in (400, 429)

    # Confirm attempts were recorded in DB
    async with AsyncSessionLocal() as db:
        user_res = await db.execute(select(User).where(User.email == email))
        user = user_res.scalar_one()
        otp_res = await db.execute(
            select(EmailOTP).where(EmailOTP.user_id == user.id, EmailOTP.purpose == "password_reset")
        )
        otps = otp_res.scalars().all()
        # The OTP should be consumed/locked
        consumed = [o for o in otps if o.consumed_at is not None]
        assert len(consumed) >= 1


@pytest.mark.asyncio
async def test_expired_code_rejected():
    """An expired reset OTP must return 400 with 'expired' in the message."""
    transport = ASGITransport(app=app)
    unique = str(uuid.uuid4())[:8]
    email = f"reset_expired_{unique}@example.com"

    async with AsyncSessionLocal() as db:
        user = await _create_verified_user(db, unique, email)
        await _plant_reset_otp(db, user, code="112233", expired=True)

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/auth/reset-password", json={
            "email": email, "code": "112233", "new_password": "NewPassword2@"
        })
        assert resp.status_code == 400
        assert "expired" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_reused_code_rejected():
    """A consumed OTP cannot be used a second time."""
    transport = ASGITransport(app=app)
    unique = str(uuid.uuid4())[:8]
    email = f"reset_reuse_{unique}@example.com"

    async with AsyncSessionLocal() as db:
        user = await _create_verified_user(db, unique, email)
        await _plant_reset_otp(db, user, code="444555")

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # First use — success
        r1 = await ac.post("/api/v1/auth/reset-password", json={
            "email": email, "code": "444555", "new_password": "NewPassword2@"
        })
        assert r1.status_code == 200

        # Second use — must fail
        r2 = await ac.post("/api/v1/auth/reset-password", json={
            "email": email, "code": "444555", "new_password": "AnotherPass3#"
        })
        assert r2.status_code == 400


@pytest.mark.asyncio
async def test_unknown_email_returns_same_generic_response():
    """
    Submitting an email that doesn't exist must return the exact same
    200 generic response as a known email — no leakage.
    """
    transport = ASGITransport(app=app)
    known_email = "owner@apexlibrary.com"
    unknown_email = f"nobody_{uuid.uuid4().hex[:8]}@nonexistent-domain.xyz"

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        r_known = await ac.post("/api/v1/auth/forgot-password", json={"email": known_email})
        r_unknown = await ac.post("/api/v1/auth/forgot-password", json={"email": unknown_email})

    assert r_known.status_code == 200
    assert r_unknown.status_code == 200
    assert r_known.json()["message"] == r_unknown.json()["message"]
    assert r_known.json()["success"] == r_unknown.json()["success"]


@pytest.mark.asyncio
async def test_google_only_user_can_set_password():
    """
    A user created via Google (hashed_password is a random token, not a real password)
    must be able to reset their password and subsequently log in with it.
    """
    import secrets

    transport = ASGITransport(app=app)
    unique = str(uuid.uuid4())[:8]
    email = f"google_reset_{unique}@example.com"

    # Simulate a Google-only user: random, unknown hashed_password
    async with AsyncSessionLocal() as db:
        random_hash = await asyncio.to_thread(get_password_hash, secrets.token_hex(32))
        tenant = Tenant(
            name=f"Google Lib {unique}",
            slug=f"google-lib-{unique}",
            owner_name="Google User",
            email=email,
            phone="",
            subscription_tier="pro",
            subscription_status="active",
        )
        db.add(tenant)
        await db.flush()

        user = User(
            tenant_id=tenant.id,
            full_name="Google User",
            email=email,
            hashed_password=random_hash,
            role="owner",
            is_active=True,
            email_verified=True,
            email_verified_at=get_utc_now(),
        )
        db.add(user)
        from app.api.v1.auth import seed_tenant_defaults
        seed_tenant_defaults(db, tenant.id)
        await db.commit()
        await db.refresh(user)

    # Plant a known reset OTP
    async with AsyncSessionLocal() as db:
        user_res = await db.execute(select(User).where(User.email == email))
        user = user_res.scalar_one()
        await _plant_reset_otp(db, user, code="777666")

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Reset password
        r = await ac.post("/api/v1/auth/reset-password", json={
            "email": email, "code": "777666", "new_password": "GoogleNewPass5!"
        })
        assert r.status_code == 200, r.json()

        # Can now log in with the new password
        login_r = await ac.post("/api/v1/auth/login", json={"email": email, "password": "GoogleNewPass5!"})
        assert login_r.status_code == 200
        assert "access_token" in login_r.json()


@pytest.mark.asyncio
async def test_purpose_isolation_signup_otp_cannot_reset_password():
    """
    A signup_verify OTP must NOT be accepted by /auth/reset-password.
    A password_reset OTP must NOT be accepted by /auth/verify-email.
    """
    transport = ASGITransport(app=app)
    unique = str(uuid.uuid4())[:8]
    email = f"purpose_iso_{unique}@example.com"

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Create an unverified user via normal signup
        await ac.post("/api/v1/auth/signup", json={
            "library_name": f"IsoLib {unique}",
            "owner_name": "Iso Owner",
            "phone": "9000000001",
            "city": "Pune",
            "email": email,
            "password": "Password1!",
        })

    # Retrieve the signup OTP and set a known code
    async with AsyncSessionLocal() as db:
        user_res = await db.execute(select(User).where(User.email == email))
        user = user_res.scalar_one()
        signup_otp_res = await db.execute(
            select(EmailOTP).where(
                and_(EmailOTP.user_id == user.id, EmailOTP.purpose == "signup_verify", EmailOTP.consumed_at.is_(None))
            )
        )
        signup_otp = signup_otp_res.scalar_one()
        signup_otp.code_hash = hash_otp_code("SIGNUP")
        await db.commit()

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Use signup code against reset endpoint → must fail (no password_reset OTP exists)
        r1 = await ac.post("/api/v1/auth/reset-password", json={
            "email": email, "code": "SIGNUP", "new_password": "NewPassword2@"
        })
        assert r1.status_code == 400

    # Now plant a password_reset OTP
    async with AsyncSessionLocal() as db:
        user_res = await db.execute(select(User).where(User.email == email))
        user = user_res.scalar_one()
        await _plant_reset_otp(db, user, code="RESET1")

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Use reset code against verify-email endpoint → must fail
        r2 = await ac.post("/api/v1/auth/verify-email", json={"email": email, "code": "RESET1"})
        assert r2.status_code == 400
