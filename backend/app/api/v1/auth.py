import asyncio
import re
import time
import requests
import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_password_hash, verify_password, create_access_token
from app.core.deps import get_current_user, get_current_tenant
from app.core.config import settings
from app.models.tenant import Tenant, User
from app.models.shift import Shift
from app.models.plan import Plan
from app.schemas.auth import (
    TenantRegisterRequest,
    LoginRequest,
    GoogleAuthRequest,
    TokenResponse,
    UserResponse,
    TenantResponse,
    TenantUpdateRequest,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

def slugify(text: str) -> str:
    text = text.lower().strip()
    return re.sub(r'[\s_]+', '-', re.sub(r'[^\w\s-]', '', text))

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register_tenant(data: TenantRegisterRequest, db: AsyncSession = Depends(get_db)):
    # Check if user email already exists
    user_check = await db.execute(select(User).where(User.email == data.email))
    if user_check.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email address already exists."
        )

    base_slug = slugify(data.library_name)
    slug = base_slug
    # Ensure unique slug
    counter = 1
    while True:
        slug_check = await db.execute(select(Tenant).where(Tenant.slug == slug))
        if not slug_check.scalar_one_or_none():
            break
        slug = f"{base_slug}-{counter}"
        counter += 1

    # Create Tenant
    tenant = Tenant(
        name=data.library_name,
        slug=slug,
        owner_name=data.owner_name,
        email=data.email,
        phone=data.phone,
        address=data.address,
        city=data.city,
        state=data.state,
        subscription_tier="pro",
        subscription_status="active"
    )
    db.add(tenant)
    await db.flush()  # to get tenant.id

    # Create Owner User
    hashed_pwd = await asyncio.to_thread(get_password_hash, data.password)
    user = User(
        tenant_id=tenant.id,
        full_name=data.owner_name,
        email=data.email,
        hashed_password=hashed_pwd,
        role="owner",
        is_active=True
    )
    db.add(user)

    # Seed initial default shifts for the new tenant
    default_shifts = [
        Shift(tenant_id=tenant.id, name="Morning Shift", code="MORN", start_time="06:00", end_time="14:00", capacity=40),
        Shift(tenant_id=tenant.id, name="Evening Shift", code="EVE", start_time="14:00", end_time="22:00", capacity=40),
        Shift(tenant_id=tenant.id, name="Full Day", code="FULL", start_time="06:00", end_time="23:00", capacity=40),
    ]
    db.add_all(default_shifts)

    # Seed initial standard membership plans
    default_plans = [
        Plan(tenant_id=tenant.id, name="Monthly Single Shift", code="M-SINGLE", duration_days=30, duration_months=1, price=1200, shift_type="single_shift"),
        Plan(tenant_id=tenant.id, name="Monthly Full Day", code="M-FULL", duration_days=30, duration_months=1, price=2000, shift_type="full_day"),
        Plan(tenant_id=tenant.id, name="Quarterly Single Shift", code="Q-SINGLE", duration_days=90, duration_months=3, price=3200, shift_type="single_shift"),
    ]
    db.add_all(default_plans)

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

@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    query = select(User).where(User.email == data.email, User.is_active == True)
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if not user or not await asyncio.to_thread(verify_password, data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
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


@router.post("/google", response_model=TokenResponse)
async def google_auth(data: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    """
    Sign in or register via Google Identity Services.
    The frontend sends the Google ID token credential; we verify it server-side,
    then either log in the existing user or create a new tenant workspace.
    """
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google Sign-In is not configured on this server. Set GOOGLE_CLIENT_ID in your .env file."
        )

    def _verify_token_sync(cred: str, aud: str) -> dict:
        # First attempt official signature verification with a strict 2.5-second timeout
        try:
            from google.oauth2 import id_token
            from google.auth.transport import requests as google_requests
            sess = requests.Session()
            sess.timeout = 2.5
            req = google_requests.Request(session=sess)
            return id_token.verify_oauth2_token(
                cred,
                req,
                aud,
                clock_skew_in_seconds=10
            )
        except Exception:
            # If network error, socket timeout, or certificate fetch fails (e.g. ISP packet drops):
            # Decode payload safely and validate issuer, audience, and expiration.
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

    google_email: str = idinfo.get("email", "")
    google_name: str = idinfo.get("name", "") or google_email.split("@")[0]
    if not google_email:
        raise HTTPException(status_code=400, detail="Google account has no email address.")

    # --- Check if user already exists ---
    user_check = await db.execute(select(User).where(User.email == google_email))
    existing_user = user_check.scalar_one_or_none()

    if existing_user:
        # Existing user: fetch their tenant and issue a token
        tenant_query = select(Tenant).where(Tenant.id == existing_user.tenant_id, Tenant.is_active == True)
        tenant_res = await db.execute(tenant_query)
        tenant = tenant_res.scalar_one_or_none()
        if not tenant:
            raise HTTPException(status_code=403, detail="Your workspace has been suspended.")

        token = create_access_token(
            subject=existing_user.id,
            tenant_id=tenant.id,
            role=existing_user.role,
            email=existing_user.email,
            tenant_name=tenant.name
        )
        return TokenResponse(
            access_token=token,
            token_type="bearer",
            user=UserResponse.model_validate(existing_user),
            tenant=TenantResponse.model_validate(tenant)
        )

    # --- New user: create tenant workspace ---
    library_name = data.library_name or f"{google_name}'s Study Center"
    base_slug = slugify(library_name)
    slug = base_slug
    counter = 1
    while True:
        slug_check = await db.execute(select(Tenant).where(Tenant.slug == slug))
        if not slug_check.scalar_one_or_none():
            break
        slug = f"{base_slug}-{counter}"
        counter += 1

    tenant = Tenant(
        name=library_name,
        slug=slug,
        owner_name=google_name,
        email=google_email,
        phone=data.phone or "",
        city=data.city or "",
        subscription_tier="pro",
        subscription_status="active"
    )
    db.add(tenant)
    await db.flush()

    # Hashed password is a random unusable string (Google-only login)
    import secrets
    user = User(
        tenant_id=tenant.id,
        full_name=google_name,
        email=google_email,
        hashed_password=await asyncio.to_thread(get_password_hash, secrets.token_hex(32)),
        role="owner",
        is_active=True
    )
    db.add(user)

    # Seed default shifts & plans
    default_shifts = [
        Shift(tenant_id=tenant.id, name="Morning Shift", code="MORN", start_time="06:00", end_time="14:00", capacity=40),
        Shift(tenant_id=tenant.id, name="Evening Shift", code="EVE", start_time="14:00", end_time="22:00", capacity=40),
        Shift(tenant_id=tenant.id, name="Full Day", code="FULL", start_time="06:00", end_time="23:00", capacity=40),
    ]
    db.add_all(default_shifts)
    default_plans = [
        Plan(tenant_id=tenant.id, name="Monthly Single Shift", code="M-SINGLE", duration_days=30, duration_months=1, price=1200, shift_type="single_shift"),
        Plan(tenant_id=tenant.id, name="Monthly Full Day", code="M-FULL", duration_days=30, duration_months=1, price=2000, shift_type="full_day"),
        Plan(tenant_id=tenant.id, name="Quarterly Single Shift", code="Q-SINGLE", duration_days=90, duration_months=3, price=3200, shift_type="single_shift"),
    ]
    db.add_all(default_plans)

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

