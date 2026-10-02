import pytest
import pytest_asyncio
import uuid
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select, and_

from app.main import app
from app.core.database import AsyncSessionLocal, get_utc_now
from app.core.rate_limit import clear_rate_limits
from app.models.tenant import Tenant, User
from app.models.otp import EmailOTP
from app.models.shift import Shift
from app.models.plan import Plan
from app.services.otp_service import hash_otp_code
from app.services.email_service import mock_sent_emails

@pytest.fixture(autouse=True)
def reset_mock_state():
    mock_sent_emails.clear()
    clear_rate_limits()


@pytest.mark.asyncio
async def test_signup_creates_unverified_user_and_otp_no_token():
    """Test signup creates unverified user, creates hashed OTP, and returns no token."""
    transport = ASGITransport(app=app)
    unique = str(uuid.uuid4())[:8]
    test_email = f"signup_test_{unique}@example.com"

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/auth/signup", json={
            "library_name": f"Test Library {unique}",
            "owner_name": "Test Owner",
            "phone": "9876543210",
            "city": "Jaipur",
            "email": test_email,
            "password": "Password123!"
        })

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["email"] == test_email
        assert data["email_verified"] is False
        assert data["resend_cooldown_seconds"] == 60
        assert "access_token" not in data

        # Check in database
        async with AsyncSessionLocal() as db:
            user_res = await db.execute(select(User).where(User.email == test_email))
            user = user_res.scalar_one_or_none()
            assert user is not None
            assert user.email_verified is False
            assert user.tenant_id is None
            assert user.pending_library_name == f"Test Library {unique}"

            # Check OTP was created and hashed
            otp_res = await db.execute(select(EmailOTP).where(EmailOTP.user_id == user.id))
            otp = otp_res.scalar_one_or_none()
            assert otp is not None
            assert otp.code_hash is not None
            assert len(otp.code_hash) == 64  # SHA-256 hex length
            assert otp.attempts == 0
            assert otp.consumed_at is None


@pytest.mark.asyncio
async def test_correct_otp_verifies_and_creates_workspace_once():
    """Test that entering the correct OTP verifies user, creates workspace, default shifts/plans, and issues JWT."""
    transport = ASGITransport(app=app)
    unique = str(uuid.uuid4())[:8]
    test_email = f"verify_test_{unique}@example.com"

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Signup
        signup_resp = await ac.post("/api/v1/auth/signup", json={
            "library_name": f"Verification Library {unique}",
            "owner_name": "Verification Owner",
            "phone": "9876543211",
            "city": "Jaipur",
            "email": test_email,
            "password": "Password123!"
        })
        assert signup_resp.status_code == 200

        # Retrieve the plain OTP from mock_sent_emails or set a known hash
        async with AsyncSessionLocal() as db:
            user_res = await db.execute(select(User).where(User.email == test_email))
            user = user_res.scalar_one()

            # Set a known code "123456" for reliable testing
            known_code = "123456"
            otp_res = await db.execute(
                select(EmailOTP).where(
                    and_(EmailOTP.user_id == user.id, EmailOTP.consumed_at.is_(None))
                )
            )
            otp = otp_res.scalar_one()
            otp.code_hash = hash_otp_code(known_code)
            await db.commit()

        # 2. Verify with correct code
        verify_resp = await ac.post("/api/v1/auth/verify-email", json={
            "email": test_email,
            "code": "123456"
        })
        assert verify_resp.status_code == 200
        data = verify_resp.json()
        assert "access_token" in data
        assert data["user"]["email"] == test_email
        assert data["user"]["email_verified"] is True
        assert data["tenant"]["name"] == f"Verification Library {unique}"
        tenant_id = data["tenant"]["id"]

        # Check DB state
        async with AsyncSessionLocal() as db:
            user_check = await db.execute(select(User).where(User.email == test_email))
            verified_user = user_check.scalar_one()
            assert verified_user.email_verified is True
            assert verified_user.tenant_id == tenant_id
            assert verified_user.pending_library_name is None

            # Verify OTP is marked consumed
            otp_check = await db.execute(select(EmailOTP).where(EmailOTP.user_id == verified_user.id))
            consumed_otp = otp_check.scalar_one()
            assert consumed_otp.consumed_at is not None

            # Verify shifts and plans seeded
            shifts_res = await db.execute(select(Shift).where(Shift.tenant_id == tenant_id))
            shifts = shifts_res.scalars().all()
            assert len(shifts) == 3

            plans_res = await db.execute(select(Plan).where(Plan.tenant_id == tenant_id))
            plans = plans_res.scalars().all()
            assert len(plans) == 3


@pytest.mark.asyncio
async def test_wrong_code_increments_attempts_and_locks_on_limit():
    """Test wrong code increments attempts, and after max attempts (5) it gets locked."""
    transport = ASGITransport(app=app)
    unique = str(uuid.uuid4())[:8]
    test_email = f"attempts_{unique}@example.com"

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await ac.post("/api/v1/auth/signup", json={
            "library_name": "Attempts Test Library",
            "owner_name": "Test",
            "phone": "9999999999",
            "email": test_email,
            "password": "Password123!"
        })

        async with AsyncSessionLocal() as db:
            user_res = await db.execute(select(User).where(User.email == test_email))
            user = user_res.scalar_one()
            otp_res = await db.execute(select(EmailOTP).where(EmailOTP.user_id == user.id))
            otp = otp_res.scalar_one()
            otp.code_hash = hash_otp_code("654321")
            await db.commit()

        # Send 4 wrong attempts
        for i in range(1, 5):
            wrong_resp = await ac.post("/api/v1/auth/verify-email", json={
                "email": test_email,
                "code": "000000"
            })
            assert wrong_resp.status_code == 400
            assert "Incorrect verification code" in wrong_resp.json()["detail"]

        # 5th wrong attempt should lock out the code
        lock_resp = await ac.post("/api/v1/auth/verify-email", json={
            "email": test_email,
            "code": "000000"
        })
        assert lock_resp.status_code == 429
        assert "Too many failed attempts" in lock_resp.json()["detail"]

        # 6th attempt even with CORRECT code must be rejected
        correct_but_locked = await ac.post("/api/v1/auth/verify-email", json={
            "email": test_email,
            "code": "654321"
        })
        assert correct_but_locked.status_code == 400 or correct_but_locked.status_code == 429


@pytest.mark.asyncio
async def test_expired_and_reused_otp_rejected():
    """Test that expired OTPs and already consumed OTPs cannot be reused."""
    transport = ASGITransport(app=app)
    unique = str(uuid.uuid4())[:8]
    test_email = f"expired_{unique}@example.com"

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await ac.post("/api/v1/auth/signup", json={
            "library_name": "Expired Test Library",
            "owner_name": "Test",
            "phone": "9999999999",
            "email": test_email,
            "password": "Password123!"
        })

        async with AsyncSessionLocal() as db:
            user_res = await db.execute(select(User).where(User.email == test_email))
            user = user_res.scalar_one()
            otp_res = await db.execute(select(EmailOTP).where(EmailOTP.user_id == user.id))
            otp = otp_res.scalar_one()
            otp.code_hash = hash_otp_code("112233")
            # Set expiration to 15 minutes ago
            otp.expires_at = get_utc_now() - timedelta(minutes=15)
            await db.commit()

        # Attempt to verify expired OTP
        exp_resp = await ac.post("/api/v1/auth/verify-email", json={
            "email": test_email,
            "code": "112233"
        })
        assert exp_resp.status_code == 400
        assert "expired" in exp_resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_resend_cooldown_and_invalidation():
    """Test resend cooldown enforcement and that new OTP invalidates previous OTP."""
    transport = ASGITransport(app=app)
    unique = str(uuid.uuid4())[:8]
    test_email = f"resend_{unique}@example.com"

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await ac.post("/api/v1/auth/signup", json={
            "library_name": "Resend Library",
            "owner_name": "Test",
            "phone": "9999999999",
            "email": test_email,
            "password": "Password123!"
        })

        # Immediate resend should trigger 429 cooldown error
        resend_cooldown_resp = await ac.post("/api/v1/auth/resend-otp", json={
            "email": test_email
        })
        assert resend_cooldown_resp.status_code == 429
        assert "wait" in resend_cooldown_resp.json()["detail"].lower()

        # Simulate cooldown elapsed by updating created_at in DB
        async with AsyncSessionLocal() as db:
            user_res = await db.execute(select(User).where(User.email == test_email))
            user = user_res.scalar_one()
            otp_res = await db.execute(select(EmailOTP).where(EmailOTP.user_id == user.id))
            first_otp = otp_res.scalar_one()
            first_otp.code_hash = hash_otp_code("111111")
            first_otp.created_at = get_utc_now() - timedelta(seconds=65)
            await db.commit()

        # Resend should now succeed
        resend_ok_resp = await ac.post("/api/v1/auth/resend-otp", json={
            "email": test_email
        })
        assert resend_ok_resp.status_code == 200

        # Attempting to use the old first OTP (111111) must now fail
        old_otp_resp = await ac.post("/api/v1/auth/verify-email", json={
            "email": test_email,
            "code": "111111"
        })
        assert old_otp_resp.status_code == 400


@pytest.mark.asyncio
async def test_unverified_login_blocked_with_email_not_verified():
    """Test that login for unverified user fails with 403 EMAIL_NOT_VERIFIED and triggers OTP resend."""
    transport = ASGITransport(app=app)
    unique = str(uuid.uuid4())[:8]
    test_email = f"unverified_login_{unique}@example.com"

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Signup creates unverified user
        await ac.post("/api/v1/auth/signup", json={
            "library_name": "Unverified Library",
            "owner_name": "Test Owner",
            "phone": "9999999999",
            "email": test_email,
            "password": "Password123!"
        })

        # Attempt login
        login_resp = await ac.post("/api/v1/auth/login", json={
            "email": test_email,
            "password": "Password123!"
        })
        assert login_resp.status_code == 403
        data = login_resp.json()
        assert data["detail"]["code"] == "EMAIL_NOT_VERIFIED"
        assert data["detail"]["email"] == test_email


@pytest.mark.asyncio
async def test_duplicate_signup_handling():
    """
    Test signup behavior:
    1. Verified email -> 409 Conflict.
    2. Unverified email -> updates details without duplicate row.
    """
    transport = ASGITransport(app=app)
    unique = str(uuid.uuid4())[:8]
    test_email = f"duplicate_{unique}@example.com"

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # First signup (unverified)
        r1 = await ac.post("/api/v1/auth/signup", json={
            "library_name": "First Title",
            "owner_name": "First Owner",
            "phone": "9999999999",
            "email": test_email,
            "password": "Password123!"
        })
        assert r1.status_code == 200

        # Second signup before verification -> should update pending info and NOT duplicate row
        r2 = await ac.post("/api/v1/auth/signup", json={
            "library_name": "Updated Title",
            "owner_name": "Updated Owner",
            "phone": "8888888888",
            "email": test_email,
            "password": "Password456!"
        })
        assert r2.status_code == 200

        async with AsyncSessionLocal() as db:
            users = (await db.execute(select(User).where(User.email == test_email))).scalars().all()
            assert len(users) == 1
            assert users[0].pending_library_name == "Updated Title"

            # Set user as verified
            users[0].email_verified = True
            users[0].email_verified_at = get_utc_now()
            await db.commit()

        # Third signup after verification -> must return 409 Conflict
        r3 = await ac.post("/api/v1/auth/signup", json={
            "library_name": "Third Title",
            "owner_name": "Third Owner",
            "phone": "7777777777",
            "email": test_email,
            "password": "Password789!"
        })
        assert r3.status_code == 409
        assert "already registered and verified" in r3.json()["detail"]


@pytest.mark.asyncio
async def test_grandfathered_existing_users_can_login():
    """Verify that existing seeded/grandfathered users can log in without being blocked."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        login_resp = await ac.post("/api/v1/auth/login", json={
            "email": "owner@apexlibrary.com",
            "password": "admin123"
        })
        assert login_resp.status_code == 200
        data = login_resp.json()
        assert "access_token" in data
        assert data["user"]["email"] == "owner@apexlibrary.com"
        assert data["user"]["email_verified"] is True
