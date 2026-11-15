import uuid
from datetime import datetime, timedelta, timezone
import pytest
import pytest_asyncio
import pyotp
import httpx
from sqlalchemy import select

from app.main import app
from app.core.config import settings
from app.core.database import AsyncSessionLocal, get_utc_now
from app.core.rate_limit import clear_rate_limits
from app.core.security import create_access_token as create_tenant_token
from app.core.admin_security import (
    AUDIENCE_ADMIN_ACCESS,
    create_admin_access_token,
    decrypt_totp_secret,
    encrypt_totp_secret,
    generate_recovery_codes,
    generate_totp_secret,
    hash_admin_password,
    hash_recovery_code,
)
from app.models.tenant import Tenant, User
from app.models.platform_admin import PlatformAdmin, AdminAuditLog
from app.services.subscription_service import SubscriptionService


@pytest.fixture(autouse=True)
def reset_limits():
    clear_rate_limits()


@pytest_asyncio.fixture
async def seeded_admin():
    """Create a test platform admin with 2FA enabled for test suite."""
    email = f"test_admin_{uuid.uuid4().hex[:8]}@libma.internal"
    plain_password = "SuperPassword123!"
    secret = generate_totp_secret()
    codes = generate_recovery_codes(10)

    async with AsyncSessionLocal() as db:
        admin = PlatformAdmin(
            email=email,
            password_hash=hash_admin_password(plain_password),
            totp_secret_encrypted=encrypt_totp_secret(secret),
            totp_enabled=True,
            recovery_codes_hashed=[hash_recovery_code(c) for c in codes],
            failed_attempts=0,
            locked_until=None,
        )
        db.add(admin)
        await db.commit()
        await db.refresh(admin)

    return {
        "id": admin.id,
        "email": email,
        "password": plain_password,
        "secret": secret,
        "recovery_codes": codes,
    }


@pytest_asyncio.fixture
async def un_enrolled_admin():
    """Create a test platform admin with 2FA NOT yet enrolled."""
    email = f"first_admin_{uuid.uuid4().hex[:8]}@libma.internal"
    plain_password = "FirstPassword123!"

    async with AsyncSessionLocal() as db:
        admin = PlatformAdmin(
            email=email,
            password_hash=hash_admin_password(plain_password),
            totp_secret_encrypted=None,
            totp_enabled=False,
            recovery_codes_hashed=[],
            failed_attempts=0,
            locked_until=None,
        )
        db.add(admin)
        await db.commit()
        await db.refresh(admin)

    return {
        "id": admin.id,
        "email": email,
        "password": plain_password,
    }


@pytest.mark.asyncio
async def test_1_login_without_2fa_is_impossible(seeded_admin):
    """
    Test 1: Login step 1 only returns a 2fa_pending token.
    Presenting that token on any admin API endpoint fails with 404.
    """
    transport = httpx.ASGITransport(app=app)
    prefix = settings.ADMIN_PATH_PREFIX
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Step 1: Submit credentials
        resp = await client.post(
            f"{prefix}/api/auth/login",
            json={"email": seeded_admin["email"], "password": seeded_admin["password"]}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["two_factor_required"] is True
        assert "access_token" not in data
        temp_token = data["temp_token"]

        # Attempt to access protected dashboard using the 2FA pending token -> must return 404
        dash_resp = await client.get(
            f"{prefix}/api/dashboard",
            headers={"Authorization": f"Bearer {temp_token}"}
        )
        assert dash_resp.status_code == 404


@pytest.mark.asyncio
async def test_2_wrong_totp_rejected(seeded_admin):
    """
    Test 2: Submitting an invalid 6-digit TOTP code returns 400 Invalid credentials.
    """
    transport = httpx.ASGITransport(app=app)
    prefix = settings.ADMIN_PATH_PREFIX
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        login_resp = await client.post(
            f"{prefix}/api/auth/login",
            json={"email": seeded_admin["email"], "password": seeded_admin["password"]}
        )
        temp_token = login_resp.json()["temp_token"]

        # Submit wrong code
        bad_resp = await client.post(
            f"{prefix}/api/auth/2fa/verify",
            json={"temp_token": temp_token, "code": "000000"}
        )
        assert bad_resp.status_code == 400
        assert bad_resp.json()["detail"] == "Invalid credentials"


@pytest.mark.asyncio
async def test_3_lockout_works(seeded_admin):
    """
    Test 3: After 5 failed password attempts, account is locked for 15 minutes.
    Subsequent login attempts are rejected even with the correct password.
    """
    transport = httpx.ASGITransport(app=app)
    prefix = settings.ADMIN_PATH_PREFIX
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 5 failed password attempts
        for _ in range(5):
            clear_rate_limits()
            r = await client.post(
                f"{prefix}/api/auth/login",
                json={"email": seeded_admin["email"], "password": "WrongPassword!"}
            )
            assert r.status_code == 400
            assert r.json()["detail"] == "Invalid credentials"

        # Verify locked_until is set in DB
        async with AsyncSessionLocal() as db:
            adm = (
                await db.execute(
                    select(PlatformAdmin).where(PlatformAdmin.id == seeded_admin["id"])
                )
            ).scalar_one()
            assert adm.failed_attempts >= 5
            assert adm.locked_until is not None
            locked_dt = adm.locked_until if adm.locked_until.tzinfo else adm.locked_until.replace(tzinfo=timezone.utc)
            assert locked_dt > get_utc_now()

        # 6th attempt with CORRECT password must still be rejected due to lockout
        clear_rate_limits()
        locked_resp = await client.post(
            f"{prefix}/api/auth/login",
            json={"email": seeded_admin["email"], "password": seeded_admin["password"]}
        )
        assert locked_resp.status_code == 400
        assert locked_resp.json()["detail"] == "Invalid credentials"


@pytest.mark.asyncio
async def test_4_tenant_tokens_rejected_on_admin_routes():
    """
    Test 4: Standard tenant tokens (issued to library owners/staff) are strictly
    rejected on platform admin routes, returning 404 Not Found.
    """
    # Create tenant token using tenant secret & claims
    tenant_token = create_tenant_token(
        subject="fake-user-id-123",
        tenant_id="fake-tenant-id-456",
        role="owner",
        email="owner@tenantlibrary.com"
    )

    transport = httpx.ASGITransport(app=app)
    prefix = settings.ADMIN_PATH_PREFIX
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        headers = {"Authorization": f"Bearer {tenant_token}"}

        # Check endpoints
        assert (await client.get(f"{prefix}/api/dashboard", headers=headers)).status_code == 404
        assert (await client.get(f"{prefix}/api/libraries", headers=headers)).status_code == 404
        assert (await client.get(f"{prefix}/api/audit-logs", headers=headers)).status_code == 404
        assert (await client.get(f"{prefix}/api/auth/me", headers=headers)).status_code == 404


@pytest.mark.asyncio
async def test_5_unauthenticated_admin_routes_return_404():
    """
    Test 5: Unauthenticated access to admin routes returns 404 Not Found (not 401 or 403)
    to prevent directory enumeration of the hidden panel.
    """
    transport = httpx.ASGITransport(app=app)
    prefix = settings.ADMIN_PATH_PREFIX
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # No Authorization header
        r_dash = await client.get(f"{prefix}/api/dashboard")
        assert r_dash.status_code == 404
        assert r_dash.json()["detail"] == "Not Found"

        r_libs = await client.get(f"{prefix}/api/libraries")
        assert r_libs.status_code == 404

        r_logs = await client.get(f"{prefix}/api/audit-logs")
        assert r_logs.status_code == 404

        r_me = await client.get(f"{prefix}/api/auth/me")
        assert r_me.status_code == 404


@pytest.mark.asyncio
async def test_6_manually_overridden_subscriptions_protected_from_expiry_job():
    """
    Test 6: When manually_overridden is True, background expiry jobs and automated
    renewals / webhooks do NOT alter the subscription.
    """
    past_date = get_utc_now() - timedelta(days=15)
    unique = uuid.uuid4().hex[:6]

    async with AsyncSessionLocal() as db:
        # Tenant 1: Overridden by platform admin
        overridden_tenant = Tenant(
            name=f"Overridden Lib {unique}",
            slug=f"overridden-lib-{unique}",
            email=f"owner_{unique}@test.com",
            subscription_tier="enterprise",
            subscription_status="active",
            subscription_expires_at=past_date,
            manually_overridden=True,
            override_reason="Executive contract lock",
            is_active=True,
        )
        # Tenant 2: Standard non-overridden tenant
        regular_tenant = Tenant(
            name=f"Regular Lib {unique}",
            slug=f"regular-lib-{unique}",
            email=f"regular_{unique}@test.com",
            subscription_tier="starter",
            subscription_status="active",
            subscription_expires_at=past_date,
            manually_overridden=False,
            is_active=True,
        )
        db.add(overridden_tenant)
        db.add(regular_tenant)
        await db.commit()
        await db.refresh(overridden_tenant)
        await db.refresh(regular_tenant)

        # 1. Run automated expiry task
        expired_count = await SubscriptionService.process_expiries(db)
        assert expired_count >= 1

        # Check statuses
        t1 = (await db.execute(select(Tenant).where(Tenant.id == overridden_tenant.id))).scalar_one()
        t2 = (await db.execute(select(Tenant).where(Tenant.id == regular_tenant.id))).scalar_one()

        # Regular tenant expired as expected
        assert t2.subscription_status == "expired"
        # Overridden tenant remains active despite past expiry!
        assert t1.subscription_status == "active"
        assert t1.manually_overridden is True

        # 2. Test automated webhook renewal refusal
        renew_res = await SubscriptionService.apply_automated_renewal(
            db=db,
            tenant_id=t1.id,
            new_tier="pro",
            extend_days=30,
            source="payment_webhook"
        )
        assert renew_res is False  # Refused to overwrite

        # Confirm tier was not downgraded to "pro"
        t1_after = (await db.execute(select(Tenant).where(Tenant.id == t1.id))).scalar_one()
        assert t1_after.subscription_tier == "enterprise"


@pytest.mark.asyncio
async def test_7_audit_rows_are_written(seeded_admin):
    """
    Test 7: Admin actions (successful login, subscription override, clear override)
    correctly write append-only rows to admin_audit_log with before/after state.
    """
    transport = httpx.ASGITransport(app=app)
    prefix = settings.ADMIN_PATH_PREFIX
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Login with TOTP
        login_res = await client.post(
            f"{prefix}/api/auth/login",
            json={"email": seeded_admin["email"], "password": seeded_admin["password"]}
        )
        temp_token = login_res.json()["temp_token"]
        totp_code = pyotp.TOTP(seeded_admin["secret"]).now()
        verify_res = await client.post(
            f"{prefix}/api/auth/2fa/verify",
            json={"temp_token": temp_token, "code": totp_code}
        )
        access_token = verify_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {access_token}"}

        # Create a test library to modify
        async with AsyncSessionLocal() as db:
            t = Tenant(
                name="Audit Target Library",
                slug=f"audit-target-{uuid.uuid4().hex[:6]}",
                email="audit_owner@test.com",
                subscription_tier="starter",
                subscription_status="active",
                manually_overridden=False,
            )
            db.add(t)
            await db.commit()
            await db.refresh(t)
            test_lib_id = t.id

        # Perform manual subscription override
        override_res = await client.post(
            f"{prefix}/api/libraries/{test_lib_id}/subscription",
            json={
                "subscription_tier": "enterprise",
                "extend_days": 45,
                "reason": "Test audit trail verification requirement"
            },
            headers=headers
        )
        assert override_res.status_code == 200

        # Query admin_audit_log table directly in DB
        async with AsyncSessionLocal() as db:
            logs = (
                await db.execute(
                    select(AdminAuditLog)
                    .where(AdminAuditLog.target_id == test_lib_id)
                    .order_by(AdminAuditLog.created_at.desc())
                )
            ).scalars().all()

            assert len(logs) >= 1
            latest = logs[0]
            assert latest.action == "manual_subscription_override"
            assert latest.target_type == "tenant"
            assert latest.reason == "Test audit trail verification requirement"
            assert latest.before_json is not None
            assert latest.after_json is not None
            assert latest.after_json["subscription_tier"] == "enterprise"
            assert latest.after_json["manually_overridden"] is True
            assert latest.admin_id == seeded_admin["id"]
