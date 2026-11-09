"""
Comprehensive tests for the unified post-authentication onboarding flow.
Covers:
  1. Unverified token is rejected on workspace routes with 403 EMAIL_NOT_VERIFIED.
  2. Incomplete token (verified email, tenant_id=None) gets 403 PROFILE_INCOMPLETE on workspace routes.
  3. /auth/me allows incomplete users and returns profile_complete=False.
  4. /auth/setup-workspace validates fields (study center name, owner name, city, phone) and rejects unverified users.
  5. /auth/setup-workspace called twice creates exactly one tenant (idempotent).
  6. /auth/setup-workspace called concurrently creates exactly one tenant.
  7. Existing complete user logs in unchanged and can access workspace routes.
  8. Full email signup lifecycle: signup -> verify OTP -> setup workspace -> access workspace route.
  9. In-flight pending_* data is preserved across email verification and prefilled in /auth/me.
"""
import asyncio
import json
import time
import jwt
import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select, func, delete

from app.main import app
from app.core.config import settings
from app.core.database import AsyncSessionLocal, get_utc_now
from app.core.rate_limit import clear_rate_limits
from app.core.security import get_password_hash, create_access_token, decode_access_token
from app.models.tenant import Tenant, User
from app.models.otp import EmailOTP
from app.services.otp_service import hash_otp_code
from app.services.email_service import mock_sent_emails
from app.api.v1.auth import seed_tenant_defaults


# ---------------------------------------------------------------------------
# Fixtures & Helpers
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def reset_state(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "mock")
    mock_sent_emails.clear()
    clear_rate_limits()


async def _create_test_user(
    db,
    *,
    email: str,
    email_verified: bool = False,
    with_tenant: bool = False,
    pending_library: str = None,
    pending_phone: str = None,
    pending_city: str = None
) -> User:
    """Helper to create test users in various onboarding states."""
    hashed = await asyncio.to_thread(get_password_hash, "TestPassword123!")
    tenant_id = None

    if with_tenant:
        uid = uuid.uuid4().hex[:6]
        tenant = Tenant(
            name=f"Test Library {uid}",
            slug=f"test-lib-{uid}",
            owner_name="Test Owner",
            email=email,
            phone="9876543210",
            subscription_tier="pro",
            subscription_status="active",
        )
        db.add(tenant)
        await db.flush()
        seed_tenant_defaults(db, tenant.id)
        tenant_id = tenant.id

    user = User(
        tenant_id=tenant_id,
        full_name="Test Owner",
        email=email,
        hashed_password=hashed,
        role="owner",
        is_active=True,
        email_verified=email_verified,
        email_verified_at=get_utc_now() if email_verified else None,
        pending_library_name=pending_library,
        pending_phone=pending_phone,
        pending_city=pending_city,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def _plant_signup_otp(db, user: User, code: str = "123456", pending_password_hash: str = None) -> EmailOTP:
    """Insert a known signup_verify OTP for a user."""
    from datetime import timedelta
    otp = EmailOTP(
        user_id=user.id,
        code_hash=hash_otp_code(code),
        purpose="signup_verify",
        expires_at=get_utc_now() + timedelta(minutes=10),
        attempts=0,
        pending_password_hash=pending_password_hash
    )
    db.add(otp)
    await db.commit()
    return otp


def _make_mock_google_token(email: str, name: str = "Google User", verified: bool = True) -> str:
    """Creates a JWT mocking Google Identity Services ID token."""
    return jwt.encode(
        {
            "iss": "https://accounts.google.com",
            "aud": settings.GOOGLE_CLIENT_ID,
            "email": email,
            "name": name,
            "email_verified": verified,
            "exp": time.time() + 3600
        },
        key="mock-test-secret-32-bytes-long-key!",
        algorithm="HS256"
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_unverified_token_rejected_on_workspace_routes():
    """Unverified token must be rejected with 403 EMAIL_NOT_VERIFIED on workspace routes."""
    async with AsyncSessionLocal() as db:
        user = await _create_test_user(db, email=f"unver_{uuid.uuid4().hex[:6]}@example.com", email_verified=False)
        token = create_access_token(
            subject=user.id,
            tenant_id=None,
            role=user.role,
            email=user.email,
            profile_complete=False
        )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/v1/plans", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 403
        data = res.json()
        assert data["detail"]["code"] == "EMAIL_NOT_VERIFIED"


@pytest.mark.asyncio
async def test_incomplete_token_gets_403_profile_incomplete():
    """Incomplete token (verified email, tenant_id=None) must receive 403 PROFILE_INCOMPLETE on workspace routes."""
    async with AsyncSessionLocal() as db:
        user = await _create_test_user(db, email=f"incomp_{uuid.uuid4().hex[:6]}@example.com", email_verified=True, with_tenant=False)
        token = create_access_token(
            subject=user.id,
            tenant_id=None,
            role=user.role,
            email=user.email,
            profile_complete=False
        )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/v1/plans", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 403
        data = res.json()
        assert data["detail"]["code"] == "PROFILE_INCOMPLETE"


@pytest.mark.asyncio
async def test_onboarding_me_endpoint_allows_incomplete_user():
    """The /auth/me route must allow incomplete users and reflect profile_complete=False."""
    async with AsyncSessionLocal() as db:
        user = await _create_test_user(
            db,
            email=f"me_{uuid.uuid4().hex[:6]}@example.com",
            email_verified=True,
            with_tenant=False,
            pending_library="Apex Study Room",
            pending_phone="9876543210",
            pending_city="Delhi"
        )
        token = create_access_token(
            subject=user.id,
            tenant_id=None,
            role=user.role,
            email=user.email,
            profile_complete=False
        )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        data = res.json()
        assert data["profile_complete"] is False
        assert data["email"] == user.email
        assert data["pending_library_name"] == "Apex Study Room"
        assert data["pending_phone"] == "9876543210"
        assert data["pending_city"] == "Delhi"


@pytest.mark.asyncio
async def test_setup_workspace_validates_fields():
    """Field validation: rejects unverified users, invalid phone numbers, and too-short strings."""
    async with AsyncSessionLocal() as db:
        unver_user = await _create_test_user(db, email=f"unv_{uuid.uuid4().hex[:6]}@example.com", email_verified=False)
        unver_token = create_access_token(subject=unver_user.id, tenant_id=None, email=unver_user.email, profile_complete=False)

        ver_user = await _create_test_user(db, email=f"ver_{uuid.uuid4().hex[:6]}@example.com", email_verified=True)
        ver_token = create_access_token(subject=ver_user.id, tenant_id=None, email=ver_user.email, profile_complete=False)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Reject unverified user
        res = await client.post(
            "/api/v1/auth/setup-workspace",
            headers={"Authorization": f"Bearer {unver_token}"},
            json={"library_name": "My Study", "owner_name": "John Doe", "phone": "9876543210", "city": "Mumbai"}
        )
        assert res.status_code == 403
        assert res.json()["detail"]["code"] == "EMAIL_NOT_VERIFIED"

        # 2. Reject short library name
        res = await client.post(
            "/api/v1/auth/setup-workspace",
            headers={"Authorization": f"Bearer {ver_token}"},
            json={"library_name": " ", "owner_name": "John Doe", "phone": "9876543210", "city": "Mumbai"}
        )
        assert res.status_code == 422

        # 3. Reject invalid phone number
        res = await client.post(
            "/api/v1/auth/setup-workspace",
            headers={"Authorization": f"Bearer {ver_token}"},
            json={"library_name": "My Study Hub", "owner_name": "John Doe", "phone": "12345", "city": "Mumbai"}
        )
        assert res.status_code == 422


@pytest.mark.asyncio
async def test_setup_workspace_twice_creates_one_tenant():
    """Calling /auth/setup-workspace twice sequentially must create exactly one tenant (idempotent)."""
    async with AsyncSessionLocal() as db:
        user = await _create_test_user(db, email=f"twice_{uuid.uuid4().hex[:6]}@example.com", email_verified=True)
        token = create_access_token(subject=user.id, tenant_id=None, email=user.email, profile_complete=False)

    payload = {
        "library_name": "Idempotent Study Lounge",
        "owner_name": "Deepak Sharma",
        "phone": "+91 98765 43210",
        "city": "Bengaluru"
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # First call
        res1 = await client.post("/api/v1/auth/setup-workspace", headers={"Authorization": f"Bearer {token}"}, json=payload)
        assert res1.status_code == 200
        data1 = res1.json()
        tenant1_id = data1["tenant"]["id"]
        token1 = data1["access_token"]

        # Second call using original token
        res2 = await client.post("/api/v1/auth/setup-workspace", headers={"Authorization": f"Bearer {token}"}, json=payload)
        assert res2.status_code == 200
        data2 = res2.json()
        assert data2["tenant"]["id"] == tenant1_id

        # Third call using new token
        res3 = await client.post("/api/v1/auth/setup-workspace", headers={"Authorization": f"Bearer {token1}"}, json=payload)
        assert res3.status_code == 200
        assert res3.json()["tenant"]["id"] == tenant1_id

    # Verify database contains exactly one tenant linked to this user
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).where(User.id == user.id))
        refreshed_user = res.scalar_one()
        assert refreshed_user.tenant_id == tenant1_id

        tenant_count = await db.execute(select(func.count(Tenant.id)).where(Tenant.id == tenant1_id))
        assert tenant_count.scalar() == 1


@pytest.mark.asyncio
async def test_setup_workspace_concurrent_creates_one_tenant():
    """Concurrent calls to /auth/setup-workspace must result in exactly one tenant."""
    async with AsyncSessionLocal() as db:
        user = await _create_test_user(db, email=f"conc_{uuid.uuid4().hex[:6]}@example.com", email_verified=True)
        token = create_access_token(subject=user.id, tenant_id=None, email=user.email, profile_complete=False)

    payload = {
        "library_name": "Concurrent Study Hub",
        "owner_name": "Anil Verma",
        "phone": "9876543210",
        "city": "Delhi"
    }

    # Number of concurrent requests: 20
    concurrent_requests = 20

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        async def send_req(i: int):
            try:
                return await client.post(
                    "/api/v1/auth/setup-workspace",
                    headers={"Authorization": f"Bearer {token}"},
                    json={
                        "library_name": f"Concurrent Study Hub {i}",
                        "owner_name": "Anil Verma",
                        "phone": "9876543210",
                        "city": "Delhi"
                    }
                )
            except Exception as e:
                return e

        tasks = [send_req(i) for i in range(concurrent_requests)]
        responses = await asyncio.gather(*tasks)

    async with AsyncSessionLocal() as db:
        # (a) count tenants created for that user's email
        res = await db.execute(select(Tenant).where(Tenant.email == user.email))
        created_tenants = res.scalars().all()
        print(f"\n[CONCURRENCY_TEST_RESULT] Concurrent requests: {concurrent_requests}, Tenant count in DB: {len(created_tenants)}")
        assert len(created_tenants) == 1, f"Expected exactly 1 tenant, found {len(created_tenants)}"

        # (b) whether user.tenant_id points to an existing tenant
        user_res = await db.execute(select(User).where(User.id == user.id))
        refreshed_user = user_res.scalar_one()
        assert refreshed_user.tenant_id is not None
        assert refreshed_user.tenant_id == created_tenants[0].id


@pytest.mark.asyncio
async def test_existing_complete_user_logs_in_unchanged():
    """Existing complete user logs in unchanged and can immediately access workspace routes."""
    unique = uuid.uuid4().hex[:6]
    email = f"complete_{unique}@example.com"

    async with AsyncSessionLocal() as db:
        user = await _create_test_user(db, email=email, email_verified=True, with_tenant=True)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        login_res = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "TestPassword123!"}
        )
        assert login_res.status_code == 200
        data = login_res.json()
        assert data["user"]["profile_complete"] is True
        assert data["tenant"] is not None
        assert data["tenant"]["id"] == user.tenant_id

        # Access workspace route
        token = data["access_token"]
        plans_res = await client.get("/api/v1/plans", headers={"Authorization": f"Bearer {token}"})
        assert plans_res.status_code == 200


@pytest.mark.asyncio
async def test_email_signup_full_lifecycle():
    """
    End-to-end lifecycle:
      1. Signup (email + password only) -> user created unverified with no tenant.
      2. Login attempt -> blocked with 403 EMAIL_NOT_VERIFIED.
      3. Verify OTP -> marks email verified, returns token with tenant_id=None, profile_complete=False.
      4. Setup workspace -> creates tenant, seeds defaults, returns new complete token.
      5. Workspace route -> succeeds with 200 OK.
    """
    unique = uuid.uuid4().hex[:6]
    email = f"lifecycle_{unique}@example.com"
    pwd = "LifecyclePassword123!"

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Step 1: Signup
        signup_res = await client.post("/api/v1/auth/signup", json={"email": email, "password": pwd})
        assert signup_res.status_code == 200
        assert signup_res.json()["email_verified"] is False

        # Step 2: Attempt Login -> blocked
        login_blocked = await client.post("/api/v1/auth/login", json={"email": email, "password": pwd})
        assert login_blocked.status_code == 403
        assert login_blocked.json()["detail"]["code"] == "EMAIL_NOT_VERIFIED"

        # Plant known OTP directly
        async with AsyncSessionLocal() as db:
            user = (await db.execute(select(User).where(User.email == email))).scalar_one()
            await _plant_signup_otp(db, user, "888999")

        # Step 3: Verify Email
        verify_res = await client.post("/api/v1/auth/verify-email", json={"email": email, "code": "888999"})
        assert verify_res.status_code == 200
        verify_data = verify_res.json()
        assert verify_data["tenant"] is None
        assert verify_data["user"]["profile_complete"] is False
        incomplete_token = verify_data["access_token"]

        # Step 3b: Incomplete token cannot access workspace route
        blocked_plans = await client.get("/api/v1/plans", headers={"Authorization": f"Bearer {incomplete_token}"})
        assert blocked_plans.status_code == 403
        assert blocked_plans.json()["detail"]["code"] == "PROFILE_INCOMPLETE"

        # Step 4: Setup Workspace
        setup_res = await client.post(
            "/api/v1/auth/setup-workspace",
            headers={"Authorization": f"Bearer {incomplete_token}"},
            json={
                "library_name": "Vidya Reading Room",
                "owner_name": "Vidya Sagar",
                "phone": "9812345678",
                "city": "Jaipur",
                "address": "123 Main Road",
                "state": "Rajasthan",
                "pincode": "302001"
            }
        )
        assert setup_res.status_code == 200
        setup_data = setup_res.json()
        assert setup_data["user"]["profile_complete"] is True
        assert setup_data["tenant"]["name"] == "Vidya Reading Room"
        complete_token = setup_data["access_token"]

        # Step 5: Workspace route succeeds with complete token
        plans_ok = await client.get("/api/v1/plans", headers={"Authorization": f"Bearer {complete_token}"})
        assert plans_ok.status_code == 200
        plans_list = plans_ok.json()
        assert len(plans_list) >= 3  # Seeded defaults


@pytest.mark.asyncio
async def test_inflight_pending_data_prefilled():
    """In-flight users with pending_* fields must have their data preserved on verification and exposed in /auth/me."""
    unique = uuid.uuid4().hex[:6]
    email = f"inflight_{unique}@example.com"
    pwd = "InflightPassword123!"

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Signup with legacy fields
        signup_res = await client.post(
            "/api/v1/auth/signup",
            json={
                "email": email,
                "password": pwd,
                "library_name": "Inflight Study Lounge",
                "owner_name": "Ravi Kumar",
                "phone": "9876543210",
                "city": "Pune"
            }
        )
        assert signup_res.status_code == 200

        # Plant in-flight pending data on the user (simulating legacy registration) and OTP
        async with AsyncSessionLocal() as db:
            user = (await db.execute(select(User).where(User.email == email))).scalar_one()
            user.pending_library_name = "Inflight Study Lounge"
            user.pending_phone = "9876543210"
            user.pending_city = "Pune"
            await db.commit()
            await _plant_signup_otp(db, user, "654321")

        verify_res = await client.post("/api/v1/auth/verify-email", json={"email": email, "code": "654321"})
        assert verify_res.status_code == 200
        token = verify_res.json()["access_token"]

        # Check /auth/me for prefilled pending values
        me_res = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me_res.status_code == 200
        me_data = me_res.json()
        assert me_data["pending_library_name"] == "Inflight Study Lounge"
        assert me_data["pending_phone"] == "9876543210"
        assert me_data["pending_city"] == "Pune"


@pytest.mark.asyncio
async def test_security_google_auth_clears_attacker_password_and_invalidates_otps():
    """
    Security test:
      Attacker signs up with victim's email + password, creating an unverified user.
      Victim authenticates with Google.
      Server must neutralize attacker password by overwriting it with unguessable random bytes
      and purge pending OTPs. Attacker password login must fail with 401.
    """
    unique = uuid.uuid4().hex[:6]
    victim_email = f"victim_{unique}@example.com"
    attacker_password = "AttackerStolenPassword123!"

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Attacker signs up with victim's email
        signup_res = await client.post(
            "/api/v1/auth/signup",
            json={"email": victim_email, "password": attacker_password}
        )
        assert signup_res.status_code == 200

        # Verify user exists and is unverified with an active OTP
        async with AsyncSessionLocal() as db:
            user = (await db.execute(select(User).where(User.email == victim_email))).scalar_one()
            assert user.email_verified is False
            otp_count = (await db.execute(select(func.count(EmailOTP.id)).where(EmailOTP.user_id == user.id))).scalar()
            assert otp_count >= 1

        # 2. Legitimate victim signs in via Google
        google_token = _make_mock_google_token(victim_email, name="Victim User")
        google_res = await client.post("/api/v1/auth/google", json={"credential": google_token})
        assert google_res.status_code == 200
        google_data = google_res.json()
        assert google_data["is_new_user"] is True
        assert google_data["tenant"] is None

        # Verify pending OTPs were invalidated in DB
        async with AsyncSessionLocal() as db:
            refreshed_user = (await db.execute(select(User).where(User.email == victim_email))).scalar_one()
            assert refreshed_user.email_verified is True
            otp_count = (await db.execute(select(func.count(EmailOTP.id)).where(EmailOTP.user_id == user.id))).scalar()
            assert otp_count == 0

        # 3. Attacker tries to log in with their pre-registered password -> MUST FAIL WITH 401
        attacker_login = await client.post(
            "/api/v1/auth/login",
            json={"email": victim_email, "password": attacker_password}
        )
        assert attacker_login.status_code == 401
        assert "invalid email or password" in attacker_login.json()["detail"].lower()


@pytest.mark.asyncio
async def test_login_otp_sent_only_after_password_verified_and_cooldown_applies():
    """
    Login test:
      - Wrong password fails with 401 and sends NO OTP.
      - Correct password on unverified user sends OTP (1 email).
      - Immediate repeated login triggers 60s cooldown and does NOT send duplicate email.
    """
    unique = uuid.uuid4().hex[:6]
    email = f"logcooldown_{unique}@example.com"
    correct_password = "CorrectSecret123!"

    async with AsyncSessionLocal() as db:
        user = await _create_test_user(db, email=email, email_verified=False)
        # Manually set known hashed password
        from app.core.security import get_password_hash
        user.hashed_password = await asyncio.to_thread(get_password_hash, correct_password)
        await db.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Wrong password
        wrong_res = await client.post("/api/v1/auth/login", json={"email": email, "password": "WrongPassword!"})
        assert wrong_res.status_code == 401
        assert len(mock_sent_emails) == 0

        # 2. Correct password (first attempt) -> OTP sent
        ok1_res = await client.post("/api/v1/auth/login", json={"email": email, "password": correct_password})
        assert ok1_res.status_code == 403
        data1 = ok1_res.json()["detail"]
        assert data1["code"] == "EMAIL_NOT_VERIFIED"
        assert len(mock_sent_emails) == 1

        # 3. Correct password (second attempt immediately) -> 60s cooldown, no second email
        ok2_res = await client.post("/api/v1/auth/login", json={"email": email, "password": correct_password})
        assert ok2_res.status_code == 403
        data2 = ok2_res.json()["detail"]
        assert data2["code"] == "EMAIL_NOT_VERIFIED"
        assert data2.get("resend_cooldown_seconds", 0) > 0
        assert len(mock_sent_emails) == 1  # Still 1, cooldown prevented duplicate dispatch


@pytest.mark.asyncio
async def test_new_google_user_then_setup_workspace():
    """New Google user authenticates (tenant=None), then completes setup-workspace."""
    unique = uuid.uuid4().hex[:6]
    email = f"new_goog_{unique}@example.com"

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Google sign-in
        cred = _make_mock_google_token(email, name="New Google User")
        auth_res = await client.post("/api/v1/auth/google", json={"credential": cred})
        assert auth_res.status_code == 200
        auth_data = auth_res.json()
        assert auth_data["is_new_user"] is True
        assert auth_data["tenant"] is None
        incomplete_token = auth_data["access_token"]

        # 2. Setup workspace
        setup_res = await client.post(
            "/api/v1/auth/setup-workspace",
            headers={"Authorization": f"Bearer {incomplete_token}"},
            json={
                "library_name": "Google Onboarded Hub",
                "owner_name": "New Google User",
                "phone": "9876543210",
                "city": "Hyderabad"
            }
        )
        assert setup_res.status_code == 200
        setup_data = setup_res.json()
        assert setup_data["user"]["profile_complete"] is True
        assert setup_data["tenant"]["name"] == "Google Onboarded Hub"
        complete_token = setup_data["access_token"]

        # 3. Access workspace route
        plans_res = await client.get("/api/v1/plans", headers={"Authorization": f"Bearer {complete_token}"})
        assert plans_res.status_code == 200


@pytest.mark.asyncio
async def test_google_signin_on_existing_password_account():
    """Existing password user with an active workspace logs in seamlessly via Google."""
    unique = uuid.uuid4().hex[:6]
    email = f"existing_pwd_{unique}@example.com"

    async with AsyncSessionLocal() as db:
        user = await _create_test_user(db, email=email, email_verified=True, with_tenant=True)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cred = _make_mock_google_token(email, name="Existing User")
        auth_res = await client.post("/api/v1/auth/google", json={"credential": cred})
        assert auth_res.status_code == 200
        data = auth_res.json()
        assert data["is_new_user"] is False
        assert data["tenant"] is not None
        assert data["tenant"]["id"] == user.tenant_id


@pytest.mark.asyncio
async def test_verify_email_creates_no_tenant():
    """verify-email marks user verified but must NOT create a tenant or workspace record."""
    unique = uuid.uuid4().hex[:6]
    email = f"notenant_{unique}@example.com"

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/api/v1/auth/signup", json={"email": email, "password": "TestPassword123!"})

        async with AsyncSessionLocal() as db:
            user = (await db.execute(select(User).where(User.email == email))).scalar_one()
            await _plant_signup_otp(db, user, "333444")

        res = await client.post("/api/v1/auth/verify-email", json={"email": email, "code": "333444"})
        assert res.status_code == 200
        data = res.json()
        assert data["tenant"] is None
        assert data["user"]["profile_complete"] is False

    async with AsyncSessionLocal() as db:
        refreshed_user = (await db.execute(select(User).where(User.email == email))).scalar_one()
        assert refreshed_user.email_verified is True
        assert refreshed_user.tenant_id is None

        tenant_count = (await db.execute(select(func.count(Tenant.id)).where(Tenant.email == email))).scalar()
        assert tenant_count == 0


@pytest.mark.asyncio
async def test_resend_verification_generic_response_for_known_and_unknown_emails():
    """resend-otp returns the exact same generic message for unknown and known emails (zero enumeration)."""
    unknown_email = f"unknown_{uuid.uuid4().hex[:6]}@example.com"
    known_email = f"known_{uuid.uuid4().hex[:6]}@example.com"

    async with AsyncSessionLocal() as db:
        await _create_test_user(db, email=known_email, email_verified=False)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res1 = await client.post("/api/v1/auth/resend-otp", json={"email": unknown_email})
        assert res1.status_code == 200
        msg1 = res1.json()["message"]

        res2 = await client.post("/api/v1/auth/resend-otp", json={"email": known_email})
        assert res2.status_code == 200
        msg2 = res2.json()["message"]

        assert msg1 == msg2 == "If an unverified account exists with this email, a verification code has been sent."


@pytest.mark.asyncio
async def test_slug_collision_between_different_users_handled():
    """Two different users choosing the same library name receive distinct slugs without error."""
    unique_lib = f"Pinnacle {uuid.uuid4().hex[:6]}"
    expected_slug = unique_lib.lower().replace(" ", "-")

    async with AsyncSessionLocal() as db:
        user1 = await _create_test_user(db, email=f"user1_{uuid.uuid4().hex[:6]}@example.com", email_verified=True)
        token1 = create_access_token(subject=user1.id, tenant_id=None, email=user1.email, profile_complete=False)

        user2 = await _create_test_user(db, email=f"user2_{uuid.uuid4().hex[:6]}@example.com", email_verified=True)
        token2 = create_access_token(subject=user2.id, tenant_id=None, email=user2.email, profile_complete=False)

    payload = {
        "library_name": unique_lib,
        "owner_name": "Owner Name",
        "phone": "9876543210",
        "city": "Kolkata"
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res1 = await client.post("/api/v1/auth/setup-workspace", headers={"Authorization": f"Bearer {token1}"}, json=payload)
        assert res1.status_code == 200
        slug1 = res1.json()["tenant"]["slug"]

        res2 = await client.post("/api/v1/auth/setup-workspace", headers={"Authorization": f"Bearer {token2}"}, json=payload)
        assert res2.status_code == 200
        slug2 = res2.json()["tenant"]["slug"]

        assert slug1 != slug2
        assert slug1 == expected_slug
        assert slug2 == f"{expected_slug}-1"


@pytest.mark.asyncio
async def test_verify_email_wrong_code_for_verified_user_returns_error_and_no_token():
    """POST /auth/verify-email with a wrong code for an already-verified user must return 400 and NO token."""
    email = f"verified_victim_{uuid.uuid4().hex[:6]}@example.com"
    async with AsyncSessionLocal() as db:
        await _create_test_user(db, email=email, email_verified=True, with_tenant=True)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/auth/verify-email", json={"email": email, "code": "999999"})
        assert res.status_code == 400
        assert "access_token" not in res.json()


@pytest.mark.asyncio
async def test_signup_on_verified_user_with_no_tenant_returns_409_and_leaves_password_unchanged():
    """Verified user with tenant_id=None, then signup with same email must return 409 and NOT change password."""
    email = f"verified_notenant_{uuid.uuid4().hex[:6]}@example.com"
    async with AsyncSessionLocal() as db:
        user = await _create_test_user(db, email=email, email_verified=True, with_tenant=False)
        original_hash = user.hashed_password

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/auth/signup", json={"email": email, "password": "BrandNewPassword999!"})
        assert res.status_code == 409

    async with AsyncSessionLocal() as db:
        refreshed = (await db.execute(select(User).where(User.email == email))).scalar_one()
        assert refreshed.hashed_password == original_hash
        assert refreshed.email_verified is True
        assert refreshed.tenant_id is None


@pytest.mark.asyncio
async def test_resend_otp_for_verified_incomplete_user_sends_no_email():
    """Verified user with tenant_id=None calling /auth/resend-otp receives generic response and 0 emails are sent."""
    email = f"verified_inc_{uuid.uuid4().hex[:6]}@example.com"
    async with AsyncSessionLocal() as db:
        await _create_test_user(db, email=email, email_verified=True, with_tenant=False)

    mock_sent_emails.clear()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/auth/resend-otp", json={"email": email})
        assert res.status_code == 200
        assert res.json()["message"] == "If an unverified account exists with this email, a verification code has been sent."
        assert len(mock_sent_emails) == 0


@pytest.mark.asyncio
async def test_signup_does_not_allow_attacker_to_replace_pending_password():
    """
    Victim signs up (pwd A), attacker signs up same email (pwd B),
    victim verifies with original OTP -> login with B fails (401), login with A succeeds (200).
    """
    email = f"target_{uuid.uuid4().hex[:6]}@example.com"
    pwd_a = "VictimPass123!"
    pwd_b = "AttackerPass999!"

    # 1. Victim signs up with password A
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res1 = await client.post("/api/v1/auth/signup", json={"email": email, "password": pwd_a})
        assert res1.status_code == 200

        # Retrieve user and plant victim's known OTP
        async with AsyncSessionLocal() as db:
            user = (await db.execute(select(User).where(User.email == email))).scalar_one()
            await _plant_signup_otp(db, user, "111222", pending_password_hash=user.pending_password_hash)

        # Clear rate limits
        clear_rate_limits()

        # 2. Attacker signs up with same email and password B
        res2 = await client.post("/api/v1/auth/signup", json={"email": email, "password": pwd_b})
        assert res2.status_code == 200

        # 3. Victim verifies with original OTP ("111222")
        res_verify = await client.post("/api/v1/auth/verify-email", json={"email": email, "code": "111222"})
        assert res_verify.status_code == 200

        # 4. Login with B must fail (401 Unauthorized)
        login_b = await client.post("/api/v1/auth/login", json={"email": email, "password": pwd_b})
        assert login_b.status_code == 401

        # 5. Login with A must succeed (200 OK)
        login_a = await client.post("/api/v1/auth/login", json={"email": email, "password": pwd_a})
        assert login_a.status_code == 200


@pytest.mark.asyncio
async def test_google_auth_takes_over_unverified_row_clears_pending_and_sets_google_name(monkeypatch):
    """When google auth encounters an unverified row, it sets full_name = google_name and clears pending_* fields."""
    email = f"takeover_{uuid.uuid4().hex[:6]}@example.com"
    async with AsyncSessionLocal() as db:
        user = await _create_test_user(
            db,
            email=email,
            email_verified=False,
            with_tenant=False,
            pending_library="Attacker Library",
            pending_phone="9999999999",
            pending_city="Attacker City"
        )
        user.pending_address = "Attacker Address"
        user.pending_state = "Attacker State"
        user.pending_pincode = "111111"
        user.pending_additional_email = "attacker@leak.com"
        await _plant_signup_otp(db, user, "777888")
        await db.commit()

    from app.api.v1 import auth as auth_module
    monkeypatch.setattr(auth_module.settings, "GOOGLE_CLIENT_ID", "mock-client-id")
    monkeypatch.setattr(jwt, "decode", lambda *args, **kwargs: {
        "iss": "accounts.google.com",
        "aud": "mock-client-id",
        "email": email,
        "name": "Legitimate Google User",
        "email_verified": True,
        "exp": time.time() + 3600
    })

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/auth/google", json={"credential": "mock_google_jwt"})
        assert res.status_code == 200
        data = res.json()
        assert data["user"]["full_name"] == "Legitimate Google User"
        assert data["user"]["pending_library_name"] is None
        assert data["user"]["pending_phone"] is None
        assert data["user"]["pending_city"] is None
        assert data["user"]["pending_address"] is None
        assert data["user"]["pending_state"] is None
        assert data["user"]["pending_pincode"] is None
        assert data["user"]["pending_additional_email"] is None

    async with AsyncSessionLocal() as db:
        refreshed = (await db.execute(select(User).where(User.email == email))).scalar_one()
        assert refreshed.full_name == "Legitimate Google User"
        assert refreshed.pending_library_name is None
        assert refreshed.pending_phone is None
        assert refreshed.pending_city is None
        assert refreshed.pending_address is None
        assert refreshed.pending_state is None
        assert refreshed.pending_pincode is None
        assert refreshed.pending_additional_email is None
        assert refreshed.email_verified is True
        otps = (await db.execute(select(EmailOTP).where(EmailOTP.user_id == refreshed.id))).scalars().all()
        assert len(otps) == 0


@pytest.mark.asyncio
async def test_verify_email_unbound_otp_leaves_password_unchanged():
    """If the redeemed OTP has no bound password hash, hashed_password remains unchanged even if user.pending_password_hash exists."""
    email = f"unbound_otp_{uuid.uuid4().hex[:6]}@example.com"
    original_pwd = "OriginalPassword123!"
    unbound_pwd = "UnboundPassword456!"
    original_hash = await asyncio.to_thread(get_password_hash, original_pwd)
    unbound_hash = await asyncio.to_thread(get_password_hash, unbound_pwd)

    async with AsyncSessionLocal() as db:
        user = User(
            tenant_id=None,
            full_name="Unbound Test",
            email=email,
            hashed_password=original_hash,
            pending_password_hash=unbound_hash,
            role="owner",
            is_active=True,
            email_verified=False
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        # Plant OTP with pending_password_hash = None (unbound)
        await _plant_signup_otp(db, user, code="654321", pending_password_hash=None)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/auth/verify-email", json={"email": email, "code": "654321"})
        assert res.status_code == 200

        # Login with original password must succeed
        login_orig = await client.post("/api/v1/auth/login", json={"email": email, "password": original_pwd})
        assert login_orig.status_code == 200

        # Login with unbound password must fail
        login_unbound = await client.post("/api/v1/auth/login", json={"email": email, "password": unbound_pwd})
        assert login_unbound.status_code == 401

    async with AsyncSessionLocal() as db:
        refreshed = (await db.execute(select(User).where(User.email == email))).scalar_one()
        assert refreshed.hashed_password == original_hash
        assert refreshed.pending_password_hash is None
        assert refreshed.email_verified is True


@pytest.mark.asyncio
async def test_combined_failed_attempt_limit_across_all_live_otps():
    """Enforces combined failed-attempt limit per user & purpose across ALL live OTPs (not per OTP)."""
    email = f"combined_otps_{uuid.uuid4().hex[:6]}@example.com"
    async with AsyncSessionLocal() as db:
        user = await _create_test_user(db, email=email, email_verified=False)
        # Create 3 live OTPs
        await _plant_signup_otp(db, user, code="111111")
        await _plant_signup_otp(db, user, code="222222")
        await _plant_signup_otp(db, user, code="333333")

    clear_rate_limits()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # First 4 wrong guesses: each returns 400
        for i in range(4):
            clear_rate_limits()
            res = await client.post("/api/v1/auth/verify-email", json={"email": email, "code": f"99999{i}"})
            assert res.status_code == 400
            assert "Incorrect" in res.json()["detail"]

        # 5th wrong guess: reaches the combined max attempts (5) -> locks all live OTPs
        clear_rate_limits()
        res5 = await client.post("/api/v1/auth/verify-email", json={"email": email, "code": "999995"})
        assert res5.status_code in (400, 429)
        assert "Too many failed attempts" in res5.json()["detail"]

        # 6th attempt with a CORRECT code of one of the 3 live OTPs must now fail because all were invalidated
        clear_rate_limits()
        res_correct = await client.post("/api/v1/auth/verify-email", json={"email": email, "code": "111111"})
        assert res_correct.status_code in (400, 429)

    async with AsyncSessionLocal() as db:
        otps = (await db.execute(select(EmailOTP).where(EmailOTP.user_id == user.id))).scalars().all()
        assert len(otps) == 3
        for o in otps:
            assert o.consumed_at is not None


@pytest.mark.asyncio
async def test_google_auth_rejects_unverified_email_token_without_db_change(monkeypatch):
    """Google auth must reject ID tokens with email_verified=False with 403 BEFORE touching the database."""
    email = f"unverified_google_{uuid.uuid4().hex[:6]}@example.com"

    from app.api.v1 import auth as auth_module
    monkeypatch.setattr(auth_module.settings, "GOOGLE_CLIENT_ID", "mock-client-id")
    monkeypatch.setattr(jwt, "decode", lambda *args, **kwargs: {
        "iss": "accounts.google.com",
        "aud": "mock-client-id",
        "email": email,
        "name": "Unverified User",
        "email_verified": False,
        "exp": time.time() + 3600
    })

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/auth/google", json={"credential": "mock_google_jwt"})
        assert res.status_code == 403
        assert "not verified" in res.json()["detail"].lower()

    # Confirm user was NOT created in DB
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        assert user is None


@pytest.mark.asyncio
async def test_login_unverified_user_returns_403_contract():
    """
    Login contract for an unverified user:
    Must return HTTP 403 FORBIDDEN with detail containing:
      code: "EMAIL_NOT_VERIFIED"
      email: <user.email>
      resend_cooldown_seconds: <integer>
    """
    unique = uuid.uuid4().hex[:6]
    email = f"unver_contract_{unique}@example.com"
    pwd = "ContractPassword123!"

    async with AsyncSessionLocal() as db:
        user = await _create_test_user(db, email=email, email_verified=False)
        user.hashed_password = await asyncio.to_thread(get_password_hash, pwd)
        await db.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/auth/login", json={"email": email, "password": pwd})
        assert res.status_code == 403
        data = res.json()["detail"]
        assert data["code"] == "EMAIL_NOT_VERIFIED"
        assert data["email"] == email
        assert "resend_cooldown_seconds" in data
        assert isinstance(data["resend_cooldown_seconds"], int)


@pytest.mark.asyncio
async def test_google_takeover_hashed_password_is_bcrypt_and_login_returns_401_not_500():
    """
    Google takeover sets hashed_password to a real bcrypt hash of random bytes (never '' or None).
    A subsequent password login attempt for that email returns 401, not 500.
    """
    unique = uuid.uuid4().hex[:6]
    email = f"takeover_bcrypt_{unique}@example.com"
    original_attacker_pwd = "AttackerPassword123!"

    # 1. Attacker creates unverified account with password
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        signup_res = await client.post(
            "/api/v1/auth/signup",
            json={"email": email, "password": original_attacker_pwd}
        )
        assert signup_res.status_code == 200

        # 2. Legitimate user takes over via Google
        google_token = _make_mock_google_token(email, name="Legit Google User")
        google_res = await client.post("/api/v1/auth/google", json={"credential": google_token})
        assert google_res.status_code == 200

        # Verify hashed_password in DB is non-empty, not None, and is a valid bcrypt hash
        async with AsyncSessionLocal() as db:
            user = (await db.execute(select(User).where(User.email == email))).scalar_one()
            assert user.hashed_password is not None
            assert user.hashed_password != ""
            assert user.hashed_password.startswith("$2")  # bcrypt format

        # 3. Attempt password login -> Must return 401 Unauthorized, NOT 500 Internal Server Error
        login_res = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": original_attacker_pwd}
        )
        assert login_res.status_code == 401
        assert "invalid email or password" in login_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_attacker_signup_b_victim_signup_a_resend_verify_b_fails_a_succeeds():
    """
    (a) Attacker signs up first with password B.
        Victim signs up with password A.
        Victim uses Resend to get a fresh OTP.
        Victim verifies using the code from Resend.
        Login with password B must return 401.
        Login with password A must return 200.
    """
    unique = uuid.uuid4().hex[:6]
    email = f"scenario_a_{unique}@example.com"
    pwd_b = "AttackerPasswordB123!"
    pwd_a = "VictimPasswordA123!"

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Attacker signs up first with password B
        res1 = await client.post("/api/v1/auth/signup", json={"email": email, "password": pwd_b})
        assert res1.status_code == 200

        # 2. Victim signs up same email with password A
        res2 = await client.post("/api/v1/auth/signup", json={"email": email, "password": pwd_a})
        assert res2.status_code == 200

        # Simulate cooldown elapsed so Resend is permitted
        from datetime import timedelta
        async with AsyncSessionLocal() as db:
            user = (await db.execute(select(User).where(User.email == email))).scalar_one()
            prev_otp = (await db.execute(
                select(EmailOTP).where(EmailOTP.user_id == user.id).order_by(EmailOTP.created_at.desc())
            )).scalars().first()
            if prev_otp:
                prev_otp.created_at = get_utc_now() - timedelta(seconds=70)
                await db.commit()

        # 3. Victim uses Resend OTP
        resend_res = await client.post("/api/v1/auth/resend-otp", json={"email": email})
        assert resend_res.status_code == 200

        # Get the latest OTP created by resend
        async with AsyncSessionLocal() as db:
            user = (await db.execute(select(User).where(User.email == email))).scalar_one()
            latest_otp = (await db.execute(
                select(EmailOTP).where(EmailOTP.user_id == user.id, EmailOTP.consumed_at.is_(None))
                .order_by(EmailOTP.created_at.desc())
            )).scalars().first()
            assert latest_otp is not None
            assert latest_otp.pending_password_hash is not None
            from app.core.security import verify_password
            assert verify_password(pwd_a, latest_otp.pending_password_hash)

            # Plant a known code on this OTP for verification test
            from app.services.otp_service import hash_otp_code
            latest_otp.code_hash = hash_otp_code("789123")
            await db.commit()

        # 4. Victim verifies using the resend OTP code
        verify_res = await client.post("/api/v1/auth/verify-email", json={"email": email, "code": "789123"})
        assert verify_res.status_code == 200

        # 5. Attacker tries login with password B -> MUST RETURN 401
        login_b = await client.post("/api/v1/auth/login", json={"email": email, "password": pwd_b})
        assert login_b.status_code == 401

        # 6. Victim logs in with password A -> MUST RETURN 200
        login_a = await client.post("/api/v1/auth/login", json={"email": email, "password": pwd_a})
        assert login_a.status_code == 200
        assert login_a.json()["access_token"] is not None
        assert login_a.json()["user"]["email_verified"] is True


@pytest.mark.asyncio
async def test_signup_close_tab_login_returns_403_then_verify_works():
    """
    (b) User signs up.
        Closes tab and later attempts login with the signup password.
        Login returns 403 EMAIL_NOT_VERIFIED and generates a new OTP bound to pending_password_hash.
        User then verifies with the new OTP code and can log in successfully.
    """
    unique = uuid.uuid4().hex[:6]
    email = f"scenario_b_{unique}@example.com"
    pwd = "SignupPassword123!"

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. User signs up
        signup_res = await client.post("/api/v1/auth/signup", json={"email": email, "password": pwd})
        assert signup_res.status_code == 200

        # Verify hashed_password in DB is dummy bcrypt, and real hash is in pending_password_hash
        async with AsyncSessionLocal() as db:
            user = (await db.execute(select(User).where(User.email == email))).scalar_one()
            from app.core.security import verify_password
            assert not verify_password(pwd, user.hashed_password)
            assert verify_password(pwd, user.pending_password_hash)

        # 2. "Close tab" -> attempt login with signup password
        login_res = await client.post("/api/v1/auth/login", json={"email": email, "password": pwd})
        assert login_res.status_code == 403
        data = login_res.json()["detail"]
        assert data["code"] == "EMAIL_NOT_VERIFIED"
        assert data["email"] == email
        assert "resend_cooldown_seconds" in data

        # Plant a known code on the OTP generated by login
        async with AsyncSessionLocal() as db:
            user = (await db.execute(select(User).where(User.email == email))).scalar_one()
            latest_otp = (await db.execute(
                select(EmailOTP).where(EmailOTP.user_id == user.id, EmailOTP.consumed_at.is_(None))
                .order_by(EmailOTP.created_at.desc())
            )).scalars().first()
            assert latest_otp is not None
            assert latest_otp.pending_password_hash is not None
            assert verify_password(pwd, latest_otp.pending_password_hash)
            from app.services.otp_service import hash_otp_code
            latest_otp.code_hash = hash_otp_code("445566")
            await db.commit()

        # 3. Verify with the OTP code sent during login
        verify_res = await client.post("/api/v1/auth/verify-email", json={"email": email, "code": "445566"})
        assert verify_res.status_code == 200

        # Now login returns 200
        login_ok = await client.post("/api/v1/auth/login", json={"email": email, "password": pwd})
        assert login_ok.status_code == 200


@pytest.mark.asyncio
async def test_legacy_unverified_row_still_works():
    """
    (c) A legacy unverified row (where password hash is in hashed_password and pending_password_hash is None)
        can still log in (returns 403 EMAIL_NOT_VERIFIED), receive an OTP, verify, and log in successfully.
    """
    unique = uuid.uuid4().hex[:6]
    email = f"legacy_unver_{unique}@example.com"
    pwd = "LegacyPassword123!"

    # Create legacy row: pending_password_hash is None, hashed_password is real hash, email_verified is False
    async with AsyncSessionLocal() as db:
        user = User(
            tenant_id=None,
            full_name="Legacy User",
            email=email,
            hashed_password=await asyncio.to_thread(get_password_hash, pwd),
            pending_password_hash=None,
            role="owner",
            is_active=True,
            email_verified=False,
            email_verified_at=None,
        )
        db.add(user)
        await db.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Login with wrong password -> 401
        wrong_login = await client.post("/api/v1/auth/login", json={"email": email, "password": "WrongPassword!"})
        assert wrong_login.status_code == 401

        # 2. Login with correct password -> 403 EMAIL_NOT_VERIFIED
        login_res = await client.post("/api/v1/auth/login", json={"email": email, "password": pwd})
        assert login_res.status_code == 403
        assert login_res.json()["detail"]["code"] == "EMAIL_NOT_VERIFIED"

        # Plant known OTP code
        async with AsyncSessionLocal() as db:
            user = (await db.execute(select(User).where(User.email == email))).scalar_one()
            latest_otp = (await db.execute(
                select(EmailOTP).where(EmailOTP.user_id == user.id, EmailOTP.consumed_at.is_(None))
                .order_by(EmailOTP.created_at.desc())
            )).scalars().first()
            assert latest_otp is not None
            from app.services.otp_service import hash_otp_code
            latest_otp.code_hash = hash_otp_code("112233")
            await db.commit()

        # 3. Verify OTP
        verify_res = await client.post("/api/v1/auth/verify-email", json={"email": email, "code": "112233"})
        assert verify_res.status_code == 200

        # 4. Login returns 200
        final_login = await client.post("/api/v1/auth/login", json={"email": email, "password": pwd})
        assert final_login.status_code == 200
        assert final_login.json()["user"]["email_verified"] is True


@pytest.mark.asyncio
async def test_signup_ignores_and_does_not_store_library_details():
    """Signup must ignore library_name, phone, city, address, state, pincode, additional_email and not store them."""
    unique = uuid.uuid4().hex[:6]
    email = f"ignore_{unique}@example.com"
    pwd = "IgnoreFieldsPassword123!"

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/auth/signup",
            json={
                "email": email,
                "password": pwd,
                "owner_name": "Test Owner",
                "library_name": "Ignored Library",
                "phone": "+91 98765 43210",
                "city": "Jaipur",
                "address": "123 Street",
                "state": "Rajasthan",
                "pincode": "302001",
                "additional_email": "alt@example.com"
            }
        )
        assert res.status_code == 200

    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.email == email))).scalar_one()
        assert user.full_name == ""
        assert user.pending_library_name is None
        assert user.pending_phone is None
        assert user.pending_city is None
        assert user.pending_address is None
        assert user.pending_state is None
        assert user.pending_pincode is None
        assert user.pending_additional_email is None


@pytest.mark.asyncio
async def test_setup_workspace_integrity_error_retry_succeeds_with_200(monkeypatch):
    """
    Forcing an IntegrityError on the first workspace creation attempt (e.g. slug collision)
    must be recovered by the retry loop, returning 200 and exactly one tenant, not a 500.
    """
    unique = uuid.uuid4().hex[:6]
    email = f"slug_retry_{unique}@example.com"
    collision_slug = f"forced-collision-{unique}"

    async with AsyncSessionLocal() as db:
        # Pre-seed an existing tenant that occupies collision_slug
        existing_tenant = Tenant(
            name="Existing Duplicate Hub",
            slug=collision_slug,
            owner_name="Pre-existing Owner",
            email=f"pre_{unique}@example.com",
            phone="9876543210",
            subscription_tier="pro",
            subscription_status="active"
        )
        db.add(existing_tenant)
        user = await _create_test_user(db, email=email, email_verified=True)
        await db.commit()
        token = create_access_token(subject=user.id, tenant_id=None, email=user.email, profile_complete=False)

    import app.api.v1.auth as auth_module
    original_generate_slug = auth_module.generate_unique_slug
    slug_call_count = 0

    async def patched_generate_unique_slug(db_session, base_name):
        nonlocal slug_call_count
        slug_call_count += 1
        if slug_call_count == 1:
            # Force first create attempt to hit unique constraint on Tenant.slug
            return collision_slug
        return await original_generate_slug(db_session, base_name)

    monkeypatch.setattr(auth_module, "generate_unique_slug", patched_generate_unique_slug)

    payload = {
        "library_name": "Slug Retry Study Center",
        "owner_name": "Retry Owner",
        "phone": "9876543210",
        "city": "Bengaluru"
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/auth/setup-workspace",
            headers={"Authorization": f"Bearer {token}"},
            json=payload
        )
        assert res.status_code == 200, f"Expected 200 on retry, got {res.status_code}: {res.text}"
        data = res.json()
        assert data["tenant"]["id"] is not None
        assert data["tenant"]["slug"] != collision_slug

    assert slug_call_count >= 2, "generate_unique_slug should have been called at least twice (1 collision + 1 retry)"

    async with AsyncSessionLocal() as db:
        res = await db.execute(select(Tenant).where(Tenant.email == email))
        user_tenants = res.scalars().all()
        assert len(user_tenants) == 1, f"Expected exactly 1 tenant, found {len(user_tenants)}"

        user_res = await db.execute(select(User).where(User.id == user.id))
        refreshed_user = user_res.scalar_one()
        assert refreshed_user.tenant_id == user_tenants[0].id


@pytest.mark.asyncio
async def test_complete_user_posting_invalid_fields_gets_200_with_matching_tenant_claim():
    """(a) A complete user posting invalid fields gets 200 with a new token whose tenant_id claim matches."""
    unique = uuid.uuid4().hex[:6]
    email = f"complete_{unique}@example.com"
    async with AsyncSessionLocal() as db:
        user = await _create_test_user(db, email=email, email_verified=True)
        tenant = Tenant(
            name=f"Complete Library {unique}",
            slug=f"complete-library-{unique}",
            owner_name="Original Owner",
            email=user.email,
            phone="9876543210",
            city="Jaipur",
            subscription_tier="pro",
            subscription_status="active"
        )
        db.add(tenant)
        await db.flush()
        user.tenant_id = tenant.id
        user.role = "owner"
        await db.commit()
        tenant_id = tenant.id

        token = create_access_token(
            subject=user.id,
            tenant_id=tenant_id,
            email=user.email,
            role="owner",
            profile_complete=True
        )

    # Post invalid fields: short library_name, short owner_name, invalid phone, empty city
    invalid_payload = {
        "library_name": " ",
        "owner_name": "x",
        "phone": "not-a-phone",
        "city": ""
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/auth/setup-workspace",
            headers={"Authorization": f"Bearer {token}"},
            json=invalid_payload
        )
        assert res.status_code == 200, f"Expected 200 for complete user, got {res.status_code}: {res.text}"
        data = res.json()
        assert data["tenant"]["id"] == tenant_id
        new_token = data["access_token"]
        claims = decode_access_token(new_token)
        assert claims is not None
        assert claims["tenant_id"] == tenant_id
        assert claims["profile_complete"] is True


@pytest.mark.asyncio
async def test_incomplete_user_posting_invalid_fields_gets_422():
    """(b) A user without a workspace posting invalid fields still gets 422."""
    unique = uuid.uuid4().hex[:6]
    email = f"incomplete_{unique}@example.com"
    async with AsyncSessionLocal() as db:
        user = await _create_test_user(db, email=email, email_verified=True)
        token = create_access_token(
            subject=user.id,
            tenant_id=None,
            email=user.email,
            role="owner",
            profile_complete=False
        )

    invalid_payload = {
        "library_name": " ",
        "owner_name": "x",
        "phone": "not-a-phone",
        "city": ""
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/auth/setup-workspace",
            headers={"Authorization": f"Bearer {token}"},
            json=invalid_payload
        )
        assert res.status_code == 422, f"Expected 422 for incomplete user posting invalid fields, got {res.status_code}: {res.text}"
        detail_msg = res.json().get("detail")
        assert "Study center name must be at least 2 characters" in str(detail_msg)


@pytest.mark.asyncio
async def test_get_me_returns_tenant_id_for_complete_user_and_null_for_incomplete():
    """
    Assert GET /auth/me returns tenant_id for a complete user and null for an incomplete user.
    Confirm hashed_password and pending_password_hash are NOT present in the JSON response.
    """
    unique = uuid.uuid4().hex[:6]
    complete_email = f"complete_me_{unique}@example.com"
    incomplete_email = f"incomplete_me_{unique}@example.com"

    # 1. Complete user with workspace
    async with AsyncSessionLocal() as db:
        complete_user = await _create_test_user(db, email=complete_email, email_verified=True, with_tenant=True)
        complete_token = create_access_token(
            subject=complete_user.id,
            tenant_id=complete_user.tenant_id,
            email=complete_user.email,
            profile_complete=True
        )
        tenant_id = complete_user.tenant_id

    # 2. Incomplete user without workspace
    async with AsyncSessionLocal() as db:
        incomplete_user = await _create_test_user(db, email=incomplete_email, email_verified=True, with_tenant=False)
        incomplete_token = create_access_token(
            subject=incomplete_user.id,
            tenant_id=None,
            email=incomplete_user.email,
            profile_complete=False
        )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Request for complete user
        res_complete = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {complete_token}"})
        assert res_complete.status_code == 200
        json_complete = res_complete.json()
        print("\n[RAW_JSON_COMPLETE_USER]:")
        print(json.dumps(json_complete, indent=2))

        # Assertions for complete user
        assert json_complete["tenant_id"] == tenant_id
        assert json_complete["tenant_id"] is not None
        assert "hashed_password" not in json_complete
        assert "pending_password_hash" not in json_complete

        # Request for incomplete user
        res_incomplete = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {incomplete_token}"})
        assert res_incomplete.status_code == 200
        json_incomplete = res_incomplete.json()
        print("\n[RAW_JSON_INCOMPLETE_USER]:")
        print(json.dumps(json_incomplete, indent=2))

        # Assertions for incomplete user
        assert json_incomplete["tenant_id"] is None
        assert "hashed_password" not in json_incomplete
        assert "pending_password_hash" not in json_incomplete





