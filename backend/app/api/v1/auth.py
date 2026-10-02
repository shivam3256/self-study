import asyncio
import re
import time
import requests
import jwt
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.core.database import get_db, get_utc_now
from app.core.security import get_password_hash, verify_password, create_access_token
from app.core.deps import get_current_user, get_current_tenant
from app.core.config import settings
from app.core.rate_limit import check_ip_rate_limit
from app.models.tenant import Tenant, User
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
from app.schemas.auth import (
    SignupRequest,
    SignupResponse,
    VerifyEmailRequest,
    ResendOTPRequest,
    ResendOTPResponse,
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


@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_200_OK)
@router.post("/register", response_model=SignupResponse, status_code=status.HTTP_200_OK)
async def signup(request: Request, data: SignupRequest, db: AsyncSession = Depends(get_db)):
    """
    Step 1 of Email/Password Registration:
    Validates input, creates or updates unverified user, and sends a 6-digit OTP code.
    No JWT token or workspace is issued until the email is verified.
    """
    check_ip_rate_limit(request, "auth_signup", max_requests=10, window_seconds=60)
    normalized_email = data.email.strip().lower()

    # Check if user already exists
    user_check = await db.execute(select(User).where(User.email == normalized_email))
    existing_user = user_check.scalar_one_or_none()

    # User is ONLY registered if verified AND workspace (tenant_id) exists
    if existing_user and existing_user.email_verified and existing_user.tenant_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address is already registered and verified. Please sign in or use Google sign-in if you registered with Google."
        )

    hashed_pwd = await asyncio.to_thread(get_password_hash, data.password)

    if existing_user and (not existing_user.email_verified or existing_user.tenant_id is None):
        # Update pending registration details for unverified/pending user (avoid duplicate rows)
        user = existing_user
        user.full_name = data.owner_name.strip()
        user.hashed_password = hashed_pwd
        user.email_verified = False
        user.email_verified_at = None
        user.pending_library_name = data.library_name.strip()
        user.pending_phone = data.phone.strip()
        user.pending_city = data.city.strip() if data.city else None
        user.pending_address = data.address.strip() if data.address else None
        user.pending_state = data.state.strip() if data.state else None
        user.pending_pincode = data.pincode.strip() if data.pincode else None
        user.pending_additional_email = data.additional_email.strip() if data.additional_email else None
    else:
        # Create unverified user record
        user = User(
            tenant_id=None,
            full_name=data.owner_name.strip(),
            email=normalized_email,
            hashed_password=hashed_pwd,
            role="owner",
            is_active=True,
            email_verified=False,
            email_verified_at=None,
            pending_library_name=data.library_name.strip(),
            pending_phone=data.phone.strip(),
            pending_city=data.city.strip() if data.city else None,
            pending_address=data.address.strip() if data.address else None,
            pending_state=data.state.strip() if data.state else None,
            pending_pincode=data.pincode.strip() if data.pincode else None,
            pending_additional_email=data.additional_email.strip() if data.additional_email else None
        )
        db.add(user)
        await db.flush()

    # Generate and send OTP
    success, cooldown, err_msg = await otp_service.create_and_send_otp(db, user, purpose="signup_verify")
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
    Validates 6-digit OTP. On success: marks user verified, creates the tenant workspace,
    seeds default shifts/plans, and issues a JWT session token in a single atomic transaction.
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

    # If already verified and tenant exists, return existing session (idempotent)
    if user.email_verified and user.tenant_id:
        tenant_res = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
        tenant = tenant_res.scalar_one_or_none()
        if tenant:
            token = create_access_token(
                subject=user.id,
                tenant_id=tenant.id,
                role=user.role,
                email=user.email,
                tenant_name=tenant.name
            )
            return TokenResponse(
                access_token=token,
                token_type="bearer",
                user=UserResponse.model_validate(user),
                tenant=TenantResponse.model_validate(tenant)
            )

    # Verify the code
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

    # Atomic Workspace Creation
    library_name = user.pending_library_name or f"{user.full_name}'s Study Hub"
    slug = await generate_unique_slug(db, library_name)

    tenant = Tenant(
        name=library_name,
        slug=slug,
        owner_name=user.full_name,
        email=user.email,
        phone=user.pending_phone or "",
        address=user.pending_address,
        city=user.pending_city,
        state=user.pending_state,
        pincode=user.pending_pincode,
        additional_email=user.pending_additional_email,
        subscription_tier="pro",
        subscription_status="active"
    )
    db.add(tenant)
    await db.flush()

    # Update user status
    user.email_verified = True
    user.email_verified_at = get_utc_now()
    user.tenant_id = tenant.id
    user.pending_library_name = None
    user.pending_phone = None
    user.pending_city = None
    user.pending_address = None
    user.pending_state = None
    user.pending_pincode = None
    user.pending_additional_email = None

    # Seed default shifts & membership plans
    seed_tenant_defaults(db, tenant.id)

    await db.commit()
    await db.refresh(tenant)
    await db.refresh(user)

    token = create_access_token(
        subject=user.id,
        tenant_id=tenant.id,
        role=user.role,
        email=user.email,
        tenant_name=tenant.name
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

    if not user or (user.email_verified and user.tenant_id is not None):
        # Generic response to prevent enumeration
        return ResendOTPResponse(
            success=True,
            message="If an unverified account exists with this email, a verification code has been sent.",
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
        message="A fresh verification code has been sent to your email.",
        email=normalized_email,
        resend_cooldown_seconds=cooldown
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    normalized_email = data.email.strip().lower()
    query = select(User).where(User.email == normalized_email, User.is_active == True)
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if not user or not await asyncio.to_thread(verify_password, data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    # If email is not verified or workspace was never created (tenant_id is None), block login and trigger verification flow
    if not user.email_verified or user.tenant_id is None:
        user.email_verified = False
        await otp_service.create_and_send_otp(db, user, purpose="signup_verify")
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "EMAIL_NOT_VERIFIED",
                "message": "Your email address is not verified. A verification code has been sent to your email.",
                "email": user.email
            }
        )

    # Fetch tenant
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
        tenant_name=tenant.name
    )

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
        tenant=TenantResponse.model_validate(tenant)
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
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
    google_email_verified: bool = idinfo.get("email_verified", True)

    if not google_email:
        raise HTTPException(status_code=400, detail="Google account has no email address.")

    # --- Check if user already exists ---
    user_check = await db.execute(select(User).where(User.email == google_email))
    existing_user = user_check.scalar_one_or_none()

    # User exists AND already has an active workspace -> log in directly
    if existing_user and existing_user.tenant_id:
        if not existing_user.email_verified and google_email_verified:
            existing_user.email_verified = True
            existing_user.email_verified_at = get_utc_now()
            await db.commit()

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
            tenant_name=tenant.name
        )
        return GoogleAuthResponse(
            is_new_user=False,
            access_token=token,
            token_type="bearer",
            user=UserResponse.model_validate(existing_user),
            tenant=TenantResponse.model_validate(tenant)
        )

    # User is new OR was registered without completing workspace setup
    if not data.library_name or not data.library_name.strip():
        return GoogleAuthResponse(
            is_new_user=True,
            email=google_email,
            name=google_name,
        )

    # --- Complete registration with provided library workspace details ---
    library_name = data.library_name.strip()
    owner_name = (data.owner_name or google_name).strip()
    phone = (data.phone or "").strip()
    address = (data.address or "").strip()
    city = (data.city or "").strip()
    state = (data.state or "").strip()
    pincode = (data.pincode or "").strip()
    additional_email = (data.additional_email or "").strip() or None

    slug = await generate_unique_slug(db, library_name)

    tenant = Tenant(
        name=library_name,
        slug=slug,
        owner_name=owner_name,
        email=google_email,
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

    import secrets
    if existing_user:
        user = existing_user
        user.tenant_id = tenant.id
        user.full_name = owner_name
        user.email_verified = google_email_verified
        user.email_verified_at = get_utc_now() if google_email_verified else None
        user.last_login_at = get_utc_now()
        user.pending_library_name = None
        user.pending_phone = None
        user.pending_city = None
    else:
        user = User(
            tenant_id=tenant.id,
            full_name=owner_name,
            email=google_email,
            hashed_password=await asyncio.to_thread(get_password_hash, secrets.token_hex(32)),
            role="owner",
            is_active=True,
            email_verified=google_email_verified,
            email_verified_at=get_utc_now() if google_email_verified else None,
            last_login_at=get_utc_now()
        )
        db.add(user)

    seed_tenant_defaults(db, tenant.id)

    await db.commit()
    await db.refresh(tenant)
    await db.refresh(user)

    token = create_access_token(
        subject=user.id,
        tenant_id=tenant.id,
        role=user.role,
        email=user.email,
        tenant_name=tenant.name
    )
    return GoogleAuthResponse(
        is_new_user=False,
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
        tenant=TenantResponse.model_validate(tenant)
    )
    return GoogleAuthResponse(
        is_new_user=False,
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
        tenant=TenantResponse.model_validate(tenant)
    )
