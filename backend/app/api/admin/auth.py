from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_db, get_utc_now
from app.core.rate_limit import check_ip_rate_limit
from app.core.admin_deps import (
    check_admin_network_security,
    get_client_ip,
    get_user_agent,
    log_admin_action,
    require_platform_admin,
)
from app.core.admin_security import (
    AUDIENCE_ADMIN_2FA,
    AUDIENCE_ADMIN_REFRESH,
    REFRESH_COOKIE_NAME,
    create_admin_2fa_pending_token,
    create_admin_access_token,
    create_admin_refresh_token,
    decode_admin_token,
    decrypt_totp_secret,
    encrypt_totp_secret,
    generate_qr_code_data_uri,
    generate_recovery_codes,
    generate_totp_secret,
    get_totp_provisioning_uri,
    hash_recovery_code,
    verify_admin_password,
    verify_and_consume_recovery_code,
    verify_totp_code,
)
from app.models.platform_admin import PlatformAdmin
from app.schemas.platform_admin import (
    AdminAuthResponse,
    AdminEnroll2FARequest,
    AdminLoginRequest,
    AdminLoginResponse,
    AdminMeResponse,
    AdminVerify2FARequest,
)

admin_auth_router = APIRouter(prefix="/auth", tags=["Platform Admin Auth"])

GENERIC_ERROR_MSG = "Invalid credentials"


def is_account_locked(admin: PlatformAdmin, now) -> bool:
    if not admin.locked_until:
        return False
    locked = admin.locked_until if admin.locked_until.tzinfo else admin.locked_until.replace(tzinfo=timezone.utc)
    now_aware = now if now.tzinfo else now.replace(tzinfo=timezone.utc)
    return locked > now_aware


def set_admin_refresh_cookie(response: Response, refresh_token: str):
    """Set secure, httpOnly, SameSite=Strict cookie scoped to admin path."""
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="strict",
        path=settings.ADMIN_PATH_PREFIX,
        max_age=settings.ADMIN_REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
    )


def clear_admin_refresh_cookie(response: Response):
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path=settings.ADMIN_PATH_PREFIX,
        httponly=True,
        secure=True,
        samesite="strict"
    )


@admin_auth_router.post("/login", response_model=AdminLoginResponse)
async def admin_login(
    payload: AdminLoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    check_admin_network_security(request)
    client_ip = get_client_ip(request)
    ua = get_user_agent(request)

    # 1. IP and Account rate limit checks
    check_ip_rate_limit(request, key_prefix="admin_login_ip", max_requests=10, window_seconds=60)
    check_ip_rate_limit(request, key_prefix=f"admin_acc:{payload.email.lower()}", max_requests=10, window_seconds=60)

    # Add noindex header
    response.headers["X-Robots-Tag"] = "noindex, nofollow"

    # Query admin by email
    stmt = select(PlatformAdmin).where(PlatformAdmin.email == payload.email.lower().strip())
    res = await db.execute(stmt)
    admin = res.scalar_one_or_none()

    if not admin:
        # Avoid user enumeration: do mock verify
        verify_admin_password("dummy_password", "$2b$12$e8wUeO6bX6r5h4C5s6f7a.9xP5M4l3k2j1h0g9f8e7d6c5b4a3")
        await log_admin_action(
            db=db,
            action="admin_login_failed_unknown_email",
            target_type="platform_admin",
            reason="Unknown admin email",
            ip=client_ip,
            user_agent=ua,
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=GENERIC_ERROR_MSG)

    now = get_utc_now()

    # 2. Check if currently locked out
    if is_account_locked(admin, now):
        await log_admin_action(
            db=db,
            admin_id=admin.id,
            action="admin_login_rejected_locked",
            target_type="platform_admin",
            target_id=admin.id,
            reason=f"Account locked until {admin.locked_until.isoformat()}",
            ip=client_ip,
            user_agent=ua,
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=GENERIC_ERROR_MSG)

    # 3. Verify password
    if not verify_admin_password(payload.password, admin.password_hash):
        admin.failed_attempts += 1
        if admin.failed_attempts >= 5:
            admin.locked_until = now + timedelta(minutes=15)
            await log_admin_action(
                db=db,
                admin_id=admin.id,
                action="admin_account_locked",
                target_type="platform_admin",
                target_id=admin.id,
                reason="5 consecutive failed password attempts",
                ip=client_ip,
                user_agent=ua,
            )
        else:
            await log_admin_action(
                db=db,
                admin_id=admin.id,
                action="admin_login_failed_password",
                target_type="platform_admin",
                target_id=admin.id,
                reason=f"Failed attempt {admin.failed_attempts}",
                ip=client_ip,
                user_agent=ua,
            )
        await db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=GENERIC_ERROR_MSG)

    # Password is valid! Note: failed_attempts will be fully cleared once 2FA succeeds.
    # Check if 2FA is enrolled
    if not admin.totp_enabled:
        # Generate fresh secret and enroll
        plain_secret = generate_totp_secret()
        admin.totp_secret_encrypted = encrypt_totp_secret(plain_secret)
        await db.commit()

        provisioning_uri = get_totp_provisioning_uri(plain_secret, admin.email)
        qr_code_data = generate_qr_code_data_uri(provisioning_uri)
        temp_token = create_admin_2fa_pending_token(
            admin_id=admin.id,
            email=admin.email,
            scope="2fa_enroll_pending",
            expires_in_seconds=300
        )
        await log_admin_action(
            db=db,
            admin_id=admin.id,
            action="admin_2fa_enroll_initiated",
            target_type="platform_admin",
            target_id=admin.id,
            ip=client_ip,
            user_agent=ua,
        )
        return AdminLoginResponse(
            two_factor_required=True,
            enrollment_required=True,
            temp_token=temp_token,
            otpauth_uri=provisioning_uri,
            secret=plain_secret,
            qr_code=qr_code_data,
        )

    # 2FA already enabled -> issue 2fa_pending token
    temp_token = create_admin_2fa_pending_token(
        admin_id=admin.id,
        email=admin.email,
        scope="2fa_pending",
        expires_in_seconds=300
    )
    return AdminLoginResponse(
        two_factor_required=True,
        enrollment_required=False,
        temp_token=temp_token,
    )


@admin_auth_router.post("/2fa/enroll", response_model=AdminAuthResponse)
async def admin_enroll_2fa(
    payload: AdminEnroll2FARequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    check_admin_network_security(request)
    client_ip = get_client_ip(request)
    ua = get_user_agent(request)
    response.headers["X-Robots-Tag"] = "noindex, nofollow"

    token_data = decode_admin_token(
        token=payload.temp_token,
        expected_audience=AUDIENCE_ADMIN_2FA,
        expected_scope="2fa_enroll_pending"
    )
    if not token_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=GENERIC_ERROR_MSG)

    admin_id = token_data.get("sub")
    stmt = select(PlatformAdmin).where(PlatformAdmin.id == admin_id)
    res = await db.execute(stmt)
    admin = res.scalar_one_or_none()
    if not admin or not admin.totp_secret_encrypted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=GENERIC_ERROR_MSG)

    now = get_utc_now()
    if is_account_locked(admin, now):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=GENERIC_ERROR_MSG)

    plain_secret = decrypt_totp_secret(admin.totp_secret_encrypted)
    if not verify_totp_code(plain_secret, payload.code):
        admin.failed_attempts += 1
        if admin.failed_attempts >= 5:
            admin.locked_until = now + timedelta(minutes=15)
        await log_admin_action(
            db=db,
            admin_id=admin.id,
            action="admin_2fa_enroll_failed",
            target_type="platform_admin",
            target_id=admin.id,
            reason="Invalid TOTP enrollment code",
            ip=client_ip,
            user_agent=ua,
        )
        await db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=GENERIC_ERROR_MSG)

    # Valid code! Complete 2FA activation
    recovery_codes = generate_recovery_codes(10)
    admin.recovery_codes_hashed = [hash_recovery_code(rc) for rc in recovery_codes]
    admin.totp_enabled = True
    admin.failed_attempts = 0
    admin.locked_until = None
    admin.last_login_at = now
    await db.commit()

    await log_admin_action(
        db=db,
        admin_id=admin.id,
        action="admin_2fa_enrolled_success",
        target_type="platform_admin",
        target_id=admin.id,
        reason="Initial 2FA enrolled & 10 recovery codes issued",
        ip=client_ip,
        user_agent=ua,
    )

    access_token = create_admin_access_token(admin.id, admin.email)
    refresh_token = create_admin_refresh_token(admin.id, admin.email)
    set_admin_refresh_cookie(response, refresh_token)

    return AdminAuthResponse(
        access_token=access_token,
        token_type="bearer",
        admin_id=admin.id,
        email=admin.email,
        recovery_codes=recovery_codes,
    )


@admin_auth_router.post("/2fa/verify", response_model=AdminAuthResponse)
async def admin_verify_2fa(
    payload: AdminVerify2FARequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    check_admin_network_security(request)
    client_ip = get_client_ip(request)
    ua = get_user_agent(request)
    response.headers["X-Robots-Tag"] = "noindex, nofollow"

    token_data = decode_admin_token(
        token=payload.temp_token,
        expected_audience=AUDIENCE_ADMIN_2FA,
        expected_scope="2fa_pending"
    )
    if not token_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=GENERIC_ERROR_MSG)

    admin_id = token_data.get("sub")
    stmt = select(PlatformAdmin).where(PlatformAdmin.id == admin_id)
    res = await db.execute(stmt)
    admin = res.scalar_one_or_none()
    if not admin or not admin.totp_enabled or not admin.totp_secret_encrypted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=GENERIC_ERROR_MSG)

    now = get_utc_now()
    if is_account_locked(admin, now):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=GENERIC_ERROR_MSG)

    plain_secret = decrypt_totp_secret(admin.totp_secret_encrypted)
    is_valid_totp = verify_totp_code(plain_secret, payload.code)
    used_recovery_code = False

    if not is_valid_totp:
        # Check recovery codes
        matched, updated_hashes = verify_and_consume_recovery_code(
            admin.recovery_codes_hashed,
            payload.code
        )
        if matched:
            used_recovery_code = True
            admin.recovery_codes_hashed = updated_hashes
        else:
            admin.failed_attempts += 1
            if admin.failed_attempts >= 5:
                admin.locked_until = now + timedelta(minutes=15)
                await log_admin_action(
                    db=db,
                    admin_id=admin.id,
                    action="admin_account_locked_2fa",
                    target_type="platform_admin",
                    target_id=admin.id,
                    reason="5 consecutive failed 2FA attempts",
                    ip=client_ip,
                    user_agent=ua,
                )
            else:
                await log_admin_action(
                    db=db,
                    admin_id=admin.id,
                    action="admin_2fa_verify_failed",
                    target_type="platform_admin",
                    target_id=admin.id,
                    reason=f"Invalid TOTP/recovery code. Failed attempts: {admin.failed_attempts}",
                    ip=client_ip,
                    user_agent=ua,
                )
            await db.commit()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=GENERIC_ERROR_MSG)

    # Success!
    admin.failed_attempts = 0
    admin.locked_until = None
    admin.last_login_at = now
    await db.commit()

    action_label = "admin_login_success_recovery_code" if used_recovery_code else "admin_login_success"
    await log_admin_action(
        db=db,
        admin_id=admin.id,
        action=action_label,
        target_type="platform_admin",
        target_id=admin.id,
        reason="Recovery code consumed" if used_recovery_code else "TOTP verified",
        ip=client_ip,
        user_agent=ua,
    )

    access_token = create_admin_access_token(admin.id, admin.email)
    refresh_token = create_admin_refresh_token(admin.id, admin.email)
    set_admin_refresh_cookie(response, refresh_token)

    return AdminAuthResponse(
        access_token=access_token,
        token_type="bearer",
        admin_id=admin.id,
        email=admin.email,
    )


@admin_auth_router.post("/refresh", response_model=AdminAuthResponse)
async def admin_refresh_token_endpoint(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    check_admin_network_security(request)
    response.headers["X-Robots-Tag"] = "noindex, nofollow"

    refresh_token = request.cookies.get(REFRESH_COOKIE_NAME)
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")

    token_data = decode_admin_token(
        token=refresh_token,
        expected_audience=AUDIENCE_ADMIN_REFRESH,
        expected_scope="admin_refresh"
    )
    if not token_data:
        clear_admin_refresh_cookie(response)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")

    admin_id = token_data.get("sub")
    stmt = select(PlatformAdmin).where(PlatformAdmin.id == admin_id)
    res = await db.execute(stmt)
    admin = res.scalar_one_or_none()

    if not admin:
        clear_admin_refresh_cookie(response)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")

    now = get_utc_now()
    if is_account_locked(admin, now):
        clear_admin_refresh_cookie(response)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")

    # Issue new access token and rotate refresh token
    new_access_token = create_admin_access_token(admin.id, admin.email)
    new_refresh_token = create_admin_refresh_token(admin.id, admin.email)
    set_admin_refresh_cookie(response, new_refresh_token)

    return AdminAuthResponse(
        access_token=new_access_token,
        token_type="bearer",
        admin_id=admin.id,
        email=admin.email,
    )


@admin_auth_router.post("/logout")
async def admin_logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    check_admin_network_security(request)
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    clear_admin_refresh_cookie(response)
    return {"success": True, "message": "Logged out successfully"}


@admin_auth_router.get("/me", response_model=AdminMeResponse)
async def admin_get_me(
    current_admin: PlatformAdmin = Depends(require_platform_admin),
):
    return AdminMeResponse(
        id=current_admin.id,
        email=current_admin.email,
        totp_enabled=current_admin.totp_enabled,
        created_at=current_admin.created_at,
        last_login_at=current_admin.last_login_at,
    )
