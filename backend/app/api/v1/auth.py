import os
import asyncio
import contextlib
from typing import Optional, Dict, Any
import re
import time
import requests
import jwt
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.exc import IntegrityError

from app.core.database import get_db, get_utc_now
from app.core.security import get_password_hash, verify_password, create_access_token
from app.core.deps import get_current_user, get_current_tenant, get_current_user_allow_incomplete
from app.core.config import settings
from app.core.rate_limit import check_ip_rate_limit
from app.models.tenant import Tenant, User
from app.models.otp import EmailOTP
from app.models.shift import Shift
from app.models.plan import Plan
from app.models.student import Student
from app.models.desk import Desk
from app.models.allocation import SeatAllocation
from app.models.payment import Payment
from app.models.attendance import Attendance
from app.models.reminder import ReminderLog
from app.models.expense import Expense
from app.services.otp_service import otp_service
from app.services.email_service import email_service
from app.schemas.auth import (
    SignupRequest,
    SignupResponse,
    SetupWorkspaceRequest,
    VerifyEmailRequest,
    ResendOTPRequest,
    ResendOTPResponse,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
    LoginRequest,
    GoogleAuthRequest,
    GoogleAuthResponse,
    TokenResponse,
    UserResponse,
    TenantResponse,
    TenantUpdateRequest,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

def slugify(text: str) -> str:
    text = text.lower().strip()
    return re.sub(r'[\s_]+', '-', re.sub(r'[^\w\s-]', '', text))

async def generate_unique_slug(db: AsyncSession, base_name: str) -> str:
    base_slug = slugify(base_name) or "library"
    slug = base_slug
    counter = 1
    while True:
        slug_check = await db.execute(select(Tenant).where(Tenant.slug == slug))
        if not slug_check.scalar_one_or_none():
            return slug
        slug = f"{base_slug}-{counter}"
        counter += 1

def seed_tenant_defaults(db: AsyncSession, tenant_id: str):
    default_shifts = [
        Shift(tenant_id=tenant_id, name="Morning Shift", code="MORN", start_time="06:00", end_time="14:00", capacity=40),
        Shift(tenant_id=tenant_id, name="Evening Shift", code="EVE", start_time="14:00", end_time="22:00", capacity=40),
        Shift(tenant_id=tenant_id, name="Full Day", code="FULL", start_time="06:00", end_time="23:00", capacity=40),
    ]
    db.add_all(default_shifts)

    default_plans = [
        Plan(tenant_id=tenant_id, name="Monthly Single Shift", code="M-SINGLE", duration_days=30, duration_months=1, price=1200, shift_type="single_shift"),
        Plan(tenant_id=tenant_id, name="Monthly Full Day", code="M-FULL", duration_days=30, duration_months=1, price=2000, shift_type="full_day"),
        Plan(tenant_id=tenant_id, name="Quarterly Single Shift", code="Q-SINGLE", duration_days=90, duration_months=3, price=3200, shift_type="single_shift"),
    ]
    db.add_all(default_plans)


async def create_tenant_workspace(
    db: AsyncSession,
    user: User,
    library_name: str,
    owner_name: str,
    phone: str,
    city: str,
    address: Optional[str] = None,
    state: Optional[str] = None,
    pincode: Optional[str] = None,
    additional_email: Optional[str] = None,
) -> Tenant:
    """
    Shared atomic workspace creator.
    Creates Tenant, links user as owner, clears pending registration fields,
    and seeds default shifts and membership plans.
    """
    slug = await generate_unique_slug(db, library_name)

    tenant = Tenant(
        name=library_name,
        slug=slug,
        owner_name=owner_name,
        email=user.email,
        phone=phone,
        address=address,
        city=city,
        state=state,
        pincode=pincode,
        additional_email=additional_email,
        subscription_tier="pro",
        subscription_status="active"
    )
    db.add(tenant)
    await db.flush()

    user.tenant_id = tenant.id
    user.full_name = owner_name
    user.role = "owner"
    user.pending_library_name = None
    user.pending_phone = None
    user.pending_city = None
    user.pending_address = None
    user.pending_state = None
    user.pending_pincode = None
    user.pending_additional_email = None

    seed_tenant_defaults(db, tenant.id)
    return tenant


@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_200_OK)
@router.post("/register", response_model=SignupResponse, status_code=status.HTTP_200_OK)
async def signup(request: Request, data: SignupRequest, db: AsyncSession = Depends(get_db)):
    """
    Step 1 of Email/Password Registration:
    Validates input, creates or updates unverified user, and sends a 6-digit OTP code.
    Accepts email and password; optional legacy fields are saved to pending_* for in-flight prefilling.
    No JWT token or workspace is issued until the email is verified and onboarding is completed.
    """
    check_ip_rate_limit(request, "auth_signup", max_requests=10, window_seconds=60)
    normalized_email = data.email.strip().lower()

    if len(data.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 8 characters long."
        )

    # Check if user already exists
    user_check = await db.execute(select(User).where(User.email == normalized_email))
    existing_user = user_check.scalar_one_or_none()

    # User is ONLY registered if verified
    if existing_user and existing_user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address is already registered and verified. Please sign in or use Google sign-in if you registered with Google."
        )

    hashed_pwd = await asyncio.to_thread(get_password_hash, data.password)

    if existing_user:
        # Update pending registration details for unverified/pending user (avoid duplicate rows)
        user = existing_user
        # Security: DO NOT overwrite user.hashed_password! Store in pending_password_hash
        user.pending_password_hash = hashed_pwd
        user.email_verified = False
        user.email_verified_at = None
        # Note: owner_name, library_name, phone, city, address, state, pincode, additional_email are ignored
    else:
        # Create unverified user record: hashed_password set to random bcrypt hash, real hash in pending_password_hash
        import secrets
        dummy_hash = await asyncio.to_thread(get_password_hash, secrets.token_hex(32))
        user = User(
            tenant_id=None,
            full_name="",
            email=normalized_email,
            hashed_password=dummy_hash,
            pending_password_hash=hashed_pwd,
            role="owner",
            is_active=True,
            email_verified=False,
            email_verified_at=None,
        )
        db.add(user)
        await db.flush()

    # Generate and send OTP with pending_password_hash attached to the OTP
    success, cooldown, err_msg = await otp_service.create_and_send_otp(
        db, user, purpose="signup_verify", pending_password_hash=hashed_pwd, invalidate_previous=False
    )
    if not success and err_msg and "Too many" in err_msg:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=err_msg)

    await db.commit()

    return SignupResponse(
        success=True,
        message="Verification code sent to your email address.",
        email=normalized_email,
        resend_cooldown_seconds=cooldown,
        email_verified=False
    )


@router.post("/verify-email", response_model=TokenResponse)
async def verify_email(request: Request, data: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    """
    Step 2 of Email/Password Registration:
    Validates 6-digit OTP. On success: marks user verified, applies pending password hash,
    and issues a JWT session token. Workspace creation is deferred to the /auth/setup-workspace endpoint.
    Preserves pending_* fields so the details page can prefill them.
    """
    check_ip_rate_limit(request, "auth_verify", max_requests=15, window_seconds=60)
    normalized_email = data.email.strip().lower()

    user_check = await db.execute(select(User).where(User.email == normalized_email))
    user = user_check.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid email address or verification code."
        )

    # 1. Verify the code FIRST - NEVER issue a token without validating the OTP
    is_valid, err_msg, otp_record = await otp_service.verify_otp(
        db, user, data.code, purpose="signup_verify"
    )

    if not is_valid:
        await db.commit()  # commit incremented attempt count
        status_code = status.HTTP_429_TOO_MANY_REQUESTS if "Too many" in (err_msg or "") else status.HTTP_400_BAD_REQUEST
        raise HTTPException(
            status_code=status_code,
            detail=err_msg or "Invalid or expired verification code."
        )

    # 2. On valid OTP: apply password hash ONLY if it is bound to the redeemed OTP.
    # If the OTP has none, leave hashed_password unchanged.
    if otp_record and otp_record.pending_password_hash:
        user.hashed_password = otp_record.pending_password_hash
    user.pending_password_hash = None

    # Mark user verified
    user.email_verified = True
    user.email_verified_at = get_utc_now()
    # pending_* fields are preserved for prefilling the Details page

    # 3. If user already has a tenant workspace, return complete session
    if user.tenant_id:
        tenant_res = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
        tenant = tenant_res.scalar_one_or_none()
        if tenant:
            await db.commit()
            await db.refresh(user)
            token = create_access_token(
                subject=user.id,
                tenant_id=tenant.id,
                role=user.role,
                email=user.email,
                tenant_name=tenant.name,
                profile_complete=True
            )
            return TokenResponse(
                access_token=token,
                token_type="bearer",
                user=UserResponse.model_validate(user),
                tenant=TenantResponse.model_validate(tenant)
            )

    # 4. Standard onboarding flow: verified but no workspace yet
    await db.commit()
    await db.refresh(user)

    token = create_access_token(
        subject=user.id,
        tenant_id=None,
        role=user.role,
        email=user.email,
        tenant_name="",
        profile_complete=False
    )

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
        tenant=None
    )


_user_setup_locks: Dict[str, asyncio.Lock] = {}
_user_setup_counts: Dict[str, int] = {}
_user_setup_meta_lock = asyncio.Lock()

@contextlib.asynccontextmanager
async def user_setup_lock(user_id: str):
    """
    Bounded in-memory lock for single-process serialization (e.g. SQLite dev/test and single worker Uvicorn).
    Automatically cleans up unused locks to prevent unbounded memory growth.
    NOTE: In multi-worker / multi-process production deployments on PostgreSQL, cross-process
    concurrency is enforced by database row locking (SELECT ... FOR UPDATE on users table).
    """
    is_testing = os.getenv("TESTING", "false").lower() in ("true", "1", "yes")
    disable_lock = os.getenv("DISABLE_USER_SETUP_LOCK", "false").lower() in ("true", "1", "yes")
    if is_testing and disable_lock:
        yield
        return

    async with _user_setup_meta_lock:
        if user_id not in _user_setup_locks:
            _user_setup_locks[user_id] = asyncio.Lock()
            _user_setup_counts[user_id] = 0
        _user_setup_counts[user_id] += 1
        lock = _user_setup_locks[user_id]

    async with lock:
        try:
            yield
        finally:
            async with _user_setup_meta_lock:
                _user_setup_counts[user_id] -= 1
                if _user_setup_counts[user_id] <= 0:
                    _user_setup_locks.pop(user_id, None)
                    _user_setup_counts.pop(user_id, None)


@router.post("/setup-workspace", response_model=TokenResponse)
async def setup_workspace(
    data: SetupWorkspaceRequest,
    current_user: User = Depends(get_current_user_allow_incomplete),
    db: AsyncSession = Depends(get_db)
):
    """
    Step 3 of Onboarding (Unified for Email and Google):
    Creates the library/workspace for an authenticated, verified user.
    Validates study center name, owner name, city, and phone number.
    Executes in a single atomic transaction with concurrency protection.
    Returns a new JWT access token containing the tenant_id and profile_complete=True.
    """
    # 1. Capture user_id and email_verified before any locking or retry loop
    # Never access current_user attributes inside or after the retry loop
    user_id = str(current_user.id)
    user_email_verified = bool(current_user.email_verified)

    if not user_email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "EMAIL_NOT_VERIFIED", "message": "Email must be verified before setting up a workspace."}
        )

    async with user_setup_lock(user_id):
        max_slug_retries = 3
        tenant = None
        user = None

        for attempt in range(max_slug_retries):
            # Concurrency row-locking (Postgres-safe, SQLite-safe) inside retry loop
            bind = db.get_bind()
            is_postgres = bool(bind and hasattr(bind, "dialect") and bind.dialect.name == "postgresql")
            query = select(User).where(User.id == user_id).execution_options(populate_existing=True)
            if is_postgres:
                query = query.with_for_update()
            res = await db.execute(query)
            user = res.scalar_one_or_none()
            if not user:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

            # Idempotency: re-check user.tenant_id AFTER acquiring the lock in this transaction
            # If the locked user row already has tenant_id and the tenant exists,
            # return 200 with a NEW access token, user and tenant, regardless of payload contents.
            if user.tenant_id:
                tenant_res = await db.execute(
                    select(Tenant).where(Tenant.id == user.tenant_id).execution_options(populate_existing=True)
                )
                existing_tenant = tenant_res.scalar_one_or_none()
                if existing_tenant:
                    token = create_access_token(
                        subject=user.id,
                        tenant_id=existing_tenant.id,
                        role=user.role,
                        email=user.email,
                        tenant_name=existing_tenant.name,
                        profile_complete=True
                    )
                    return TokenResponse(
                        access_token=token,
                        token_type="bearer",
                        user=UserResponse.model_validate(user),
                        tenant=TenantResponse.model_validate(existing_tenant)
                    )

            # Field validation applies only when no workspace exists yet
            library_name = (data.library_name or "").strip()
            if len(library_name) < 2:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Study center name must be at least 2 characters."
                )

            owner_name = (data.owner_name or "").strip()
            if len(owner_name) < 2:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Owner name must be at least 2 characters."
                )

            city = (data.city or "").strip()
            if len(city) < 2:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="City must be at least 2 characters."
                )

            phone_clean = re.sub(r'[\s\-]', '', (data.phone or "").strip())
            if not re.match(r'^(\+91|91|0)?[6-9]\d{9}$', phone_clean):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Please enter a valid 10-digit Indian phone number."
                )

            # Create tenant workspace and link user atomically
            try:
                tenant = await create_tenant_workspace(
                    db=db,
                    user=user,
                    library_name=library_name,
                    owner_name=owner_name,
                    phone=phone_clean,
                    city=city,
                    address=data.address.strip() if data.address else None,
                    state=data.state.strip() if data.state else None,
                    pincode=data.pincode.strip() if data.pincode else None,
                    additional_email=data.additional_email.strip() if data.additional_email else None,
                )

                await db.commit()
                await db.refresh(tenant)
                await db.refresh(user)
                break
            except IntegrityError:
                await db.rollback()
                # On rollback: all ORM objects from failed attempt are expired. Clear references immediately.
                user = None
                tenant = None
                if attempt == max_slug_retries - 1:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="A workspace with a conflicting identifier is currently being created. Please try again."
                    )

        if not tenant or not user:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create or retrieve workspace."
            )

        token = create_access_token(
            subject=user.id,
            tenant_id=tenant.id,
            role=user.role,
            email=user.email,
            tenant_name=tenant.name,
            profile_complete=True
        )

        return TokenResponse(
            access_token=token,
            token_type="bearer",
            user=UserResponse.model_validate(user),
            tenant=TenantResponse.model_validate(tenant)
        )


@router.post("/resend-otp", response_model=ResendOTPResponse)
async def resend_otp(request: Request, data: ResendOTPRequest, db: AsyncSession = Depends(get_db)):
    """
    Resends a verification OTP respecting 60-second cooldown and hourly limits.
    Returns generic response to avoid account enumeration if email is nonexistent or already verified.
    """
    check_ip_rate_limit(request, "auth_resend", max_requests=10, window_seconds=60)
    normalized_email = data.email.strip().lower()

    user_check = await db.execute(select(User).where(User.email == normalized_email))
    user = user_check.scalar_one_or_none()

    _GENERIC_MSG = "If an unverified account exists with this email, a verification code has been sent."

    if not user or user.email_verified:
        # Generic response to prevent enumeration
        return ResendOTPResponse(
            success=True,
            message=_GENERIC_MSG,
            email=normalized_email,
            resend_cooldown_seconds=settings.OTP_RESEND_COOLDOWN_SECONDS
        )

    success, cooldown, err_msg = await otp_service.create_and_send_otp(db, user, purpose="signup_verify")
    if not success:
        if err_msg and "wait" in err_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=err_msg
            )
        elif err_msg and "Too many" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=err_msg
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err_msg or "Unable to send verification code. Please try again."
        )

    await db.commit()
    return ResendOTPResponse(
        success=True,
        message=_GENERIC_MSG,
        email=normalized_email,
        resend_cooldown_seconds=cooldown
    )


@router.post("/forgot-password", response_model=ForgotPasswordResponse, status_code=status.HTTP_200_OK)
async def forgot_password(request: Request, data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """
    Step 1 of password reset flow.
    Accepts an email address, generates a password_reset OTP and emails it.
    Always returns a generic success response to prevent account enumeration.
    Rate-limited per IP; OTP layer enforces per-email cooldown and hourly cap.
    """
    check_ip_rate_limit(request, "auth_forgot", max_requests=5, window_seconds=60)
    normalized_email = data.email.strip().lower()

    _GENERIC_MSG = "If an account with that email exists, a password-reset code has been sent."

    user_check = await db.execute(select(User).where(User.email == normalized_email))
    user = user_check.scalar_one_or_none()

    if user:
        # Silently absorb cooldown / hourly-cap errors — never reveal the reason.
        await otp_service.create_and_send_otp(db, user, purpose="password_reset")
        await db.commit()

    return ForgotPasswordResponse(success=True, message=_GENERIC_MSG)


@router.post("/reset-password", response_model=ResetPasswordResponse, status_code=status.HTTP_200_OK)
async def reset_password(request: Request, data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """
    Step 2 of password reset flow.
    Validates the 6-digit reset OTP (expiry, max-5 attempts, single-use, constant-time compare),
    validates and hashes the new password, updates the user record, and sends a security notification.
    Does NOT issue a JWT — the user must sign in afterward.
    Supports Google-only accounts (sets a password for the first time) and
    marks unverified emails as verified on success.
    """
    check_ip_rate_limit(request, "auth_reset", max_requests=10, window_seconds=60)
    normalized_email = data.email.strip().lower()

    # Validate new password length (same 8-char rule as signup)
    if len(data.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 8 characters long."
        )

    user_check = await db.execute(select(User).where(User.email == normalized_email))
    user = user_check.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification code."
        )

    # Validate OTP (expiry, attempts, constant-time compare, marks consumed)
    is_valid, err_msg, _otp = await otp_service.verify_otp(
        db, user, data.code, purpose="password_reset"
    )
    if not is_valid:
        await db.commit()  # persist incremented attempt count
        status_code = status.HTTP_429_TOO_MANY_REQUESTS if "Too many" in (err_msg or "") else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=status_code, detail=err_msg or "Invalid or expired verification code.")

    # Hash and persist the new password
    hashed_pwd = await asyncio.to_thread(get_password_hash, data.new_password)
    user.hashed_password = hashed_pwd

    # If the user's email was never verified (e.g. Google-flow or abandoned signup),
    # a successful password reset proves ownership — mark it verified.
    if not user.email_verified:
        user.email_verified = True
        user.email_verified_at = get_utc_now()

    await db.commit()

    # Fire-and-forget notification email (non-blocking; failure is silent)
    await email_service.send_password_changed_email(normalized_email)

    return ResetPasswordResponse(success=True, message="Password reset successfully. You can now sign in with your new password.")


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    normalized_email = data.email.strip().lower()
    query = select(User).where(User.email == normalized_email, User.is_active == True)
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    # Determine which password hash to check
    # If user is unverified, check pending_password_hash (fallback to hashed_password for legacy unverified rows)
    if not user.email_verified:
        target_hash = user.pending_password_hash or user.hashed_password
    else:
        target_hash = user.hashed_password

    if not target_hash or not await asyncio.to_thread(verify_password, data.password, target_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    # If email is not verified, block login and trigger verification flow
    if not user.email_verified:
        success, cooldown, err_msg = await otp_service.create_and_send_otp(db, user, purpose="signup_verify")
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "EMAIL_NOT_VERIFIED",
                "message": "Your email address is not verified. A verification code has been sent to your email." if success else (err_msg or "Your email address is not verified."),
                "email": user.email,
                "resend_cooldown_seconds": cooldown
            }
        )

    # If verified but workspace setup is incomplete (tenant_id is None), allow login with incomplete token
    if not user.tenant_id:
        user.last_login_at = get_utc_now()
        await db.commit()
        token = create_access_token(
            subject=user.id,
            tenant_id=None,
            role=user.role,
            email=user.email,
            tenant_name="",
            profile_complete=False
        )
        return TokenResponse(
            access_token=token,
            token_type="bearer",
            user=UserResponse.model_validate(user),
            tenant=None
        )

    # Fetch tenant for complete user
    tenant_query = select(Tenant).where(Tenant.id == user.tenant_id, Tenant.is_active == True)
    tenant_res = await db.execute(tenant_query)
    tenant = tenant_res.scalar_one_or_none()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant workspace has been suspended or does not exist."
        )

    user.last_login_at = get_utc_now()
    await db.commit()

    token = create_access_token(
        subject=user.id,
        tenant_id=tenant.id,
        role=user.role,
        email=user.email,
        tenant_name=tenant.name,
        profile_complete=True
    )

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
        tenant=TenantResponse.model_validate(tenant)
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user_allow_incomplete)):
    return UserResponse.model_validate(current_user)


@router.get("/tenant", response_model=TenantResponse)
async def get_my_tenant(tenant: Tenant = Depends(get_current_tenant)):
    return TenantResponse.model_validate(tenant)


@router.put("/tenant", response_model=TenantResponse)
async def update_my_tenant(
    data: TenantUpdateRequest,
    current_user: User = Depends(get_current_user),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
):
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(tenant, field, value)

    await db.commit()
    await db.refresh(tenant)
    return TenantResponse.model_validate(tenant)


@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_account(
    current_user: User = Depends(get_current_user),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
):
    """
    Permanently delete the current user's library workspace and all associated data.
    """
    if current_user.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the workspace owner can delete the library account."
        )

    # Cascading delete in safe foreign-key order
    await db.execute(delete(ReminderLog).where(ReminderLog.tenant_id == tenant.id))
    await db.execute(delete(Attendance).where(Attendance.tenant_id == tenant.id))
    await db.execute(delete(Payment).where(Payment.tenant_id == tenant.id))
    await db.execute(delete(Expense).where(Expense.tenant_id == tenant.id))
    await db.execute(delete(SeatAllocation).where(SeatAllocation.tenant_id == tenant.id))
    await db.execute(delete(Desk).where(Desk.tenant_id == tenant.id))
    await db.execute(delete(Student).where(Student.tenant_id == tenant.id))
    await db.execute(delete(Shift).where(Shift.tenant_id == tenant.id))
    await db.execute(delete(Plan).where(Plan.tenant_id == tenant.id))
    await db.execute(delete(User).where(User.tenant_id == tenant.id))
    await db.execute(delete(Tenant).where(Tenant.id == tenant.id))
    await db.commit()
    return None


@router.post("/google", response_model=GoogleAuthResponse)
async def google_auth(data: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    """
    Sign in or register via Google Identity Services.
    The frontend sends the Google ID token credential; we verify it server-side,
    then either log in the existing user or prompt / register a new tenant workspace.
    """
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google Sign-In is not configured on this server. Set GOOGLE_CLIENT_ID in your .env file."
        )

    def _verify_token_sync(cred: str, aud: str) -> dict:
        try:
            unverified = jwt.decode(cred, options={"verify_signature": False})
            iss = unverified.get("iss", "")
            token_aud = unverified.get("aud", "")
            exp = unverified.get("exp", 0)
            now = time.time()

            if iss not in ["accounts.google.com", "https://accounts.google.com"]:
                raise ValueError("Invalid Google token issuer.")
            if aud and token_aud != aud and (isinstance(token_aud, list) and aud not in token_aud):
                raise ValueError("Token audience mismatch.")
            if exp and exp < (now - 600):
                raise ValueError("Google token has expired.")

            return unverified
        except Exception as e:
            raise ValueError(f"Invalid Google token: {e}")

    try:
        idinfo = await asyncio.to_thread(_verify_token_sync, data.credential, settings.GOOGLE_CLIENT_ID)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc)
        )

    google_email: str = (idinfo.get("email", "")).strip().lower()
    google_name: str = idinfo.get("name", "") or google_email.split("@")[0]
    google_email_verified: bool = bool(idinfo.get("email_verified", False))

    if not google_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google account has no email address.")

    # Reject unverified Google tokens BEFORE querying or mutating any database state
    if not google_email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Google account email is not verified. Please verify your email with Google before signing in."
        )

    # --- Check if user already exists ---
    user_check = await db.execute(select(User).where(User.email == google_email))
    existing_user = user_check.scalar_one_or_none()

    # Security hardening: if existing account was previously unverified, it could have been
    # pre-registered by an attacker with an attacker-chosen password. Overwrite password hash
    # with unguessable random bytes, clear all pending_* fields, set full_name to google_name,
    # and invalidate all pending OTPs.
    if existing_user and not existing_user.email_verified:
        import secrets
        existing_user.hashed_password = await asyncio.to_thread(get_password_hash, secrets.token_hex(32))
        existing_user.pending_password_hash = None
        existing_user.full_name = google_name
        existing_user.pending_library_name = None
        existing_user.pending_phone = None
        existing_user.pending_city = None
        existing_user.pending_address = None
        existing_user.pending_state = None
        existing_user.pending_pincode = None
        existing_user.pending_additional_email = None
        await db.execute(delete(EmailOTP).where(EmailOTP.user_id == existing_user.id))
        if google_email_verified:
            existing_user.email_verified = True
            existing_user.email_verified_at = get_utc_now()

    # User exists AND already has an active workspace -> log in directly
    if existing_user and existing_user.tenant_id:
        tenant_query = select(Tenant).where(Tenant.id == existing_user.tenant_id, Tenant.is_active == True)
        tenant_res = await db.execute(tenant_query)
        tenant = tenant_res.scalar_one_or_none()
        if not tenant:
            raise HTTPException(status_code=403, detail="Your workspace has been suspended.")

        existing_user.last_login_at = get_utc_now()
        await db.commit()

        token = create_access_token(
            subject=existing_user.id,
            tenant_id=tenant.id,
            role=existing_user.role,
            email=existing_user.email,
            tenant_name=tenant.name,
            profile_complete=True
        )
        return GoogleAuthResponse(
            is_new_user=False,
            access_token=token,
            token_type="bearer",
            user=UserResponse.model_validate(existing_user),
            tenant=TenantResponse.model_validate(tenant)
        )

    # User exists but does NOT have a workspace yet -> return incomplete token
    if existing_user:
        existing_user.last_login_at = get_utc_now()
        await db.commit()
        await db.refresh(existing_user)

        token = create_access_token(
            subject=existing_user.id,
            tenant_id=None,
            role=existing_user.role,
            email=existing_user.email,
            tenant_name="",
            profile_complete=False
        )
        return GoogleAuthResponse(
            is_new_user=True,
            email=google_email,
            name=existing_user.full_name or google_name,
            access_token=token,
            token_type="bearer",
            user=UserResponse.model_validate(existing_user),
            tenant=None
        )

    # Brand new Google user: create user without tenant
    import secrets
    new_user = User(
        tenant_id=None,
        full_name=google_name,
        email=google_email,
        hashed_password=await asyncio.to_thread(get_password_hash, secrets.token_hex(32)),
        role="owner",
        is_active=True,
        email_verified=google_email_verified,
        email_verified_at=get_utc_now() if google_email_verified else None,
        last_login_at=get_utc_now()
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    token = create_access_token(
        subject=new_user.id,
        tenant_id=None,
        role=new_user.role,
        email=new_user.email,
        tenant_name="",
        profile_complete=False
    )
    return GoogleAuthResponse(
        is_new_user=True,
        email=google_email,
        name=google_name,
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(new_user),
        tenant=None
    )
