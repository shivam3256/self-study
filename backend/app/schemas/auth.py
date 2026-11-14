from typing import Optional, List
from decimal import Decimal
from pydantic import BaseModel, EmailStr, ConfigDict, Field
from datetime import datetime

class ShiftSetupItem(BaseModel):
    name: str
    start_time: str
    end_time: str
    code: Optional[str] = None
    capacity: Optional[int] = 50

class PlanSetupItem(BaseModel):
    name: str
    price: Decimal
    duration_days: int = 30
    duration_months: int = 1
    code: Optional[str] = None
    shift_indices: Optional[List[int]] = None
    shift_names: Optional[List[str]] = None
    description: Optional[str] = None

class FloorSetupItem(BaseModel):
    name: str
    seat_count: int

class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    # Optional legacy fields for backward compatibility
    library_name: Optional[str] = None
    owner_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    additional_email: Optional[str] = None

class SetupWorkspaceRequest(BaseModel):
    library_name: Optional[str] = None
    owner_name: Optional[str] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    additional_email: Optional[str] = None
    shifts: Optional[List[ShiftSetupItem]] = None
    plans: Optional[List[PlanSetupItem]] = None
    floors: Optional[List[FloorSetupItem]] = None

# Backward compatibility alias
TenantRegisterRequest = SignupRequest

class SignupResponse(BaseModel):
    success: bool = True
    message: str
    email: str
    resend_cooldown_seconds: int = 60
    email_verified: bool = False

class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str

class ResendOTPRequest(BaseModel):
    email: EmailStr

class ResendOTPResponse(BaseModel):
    success: bool = True
    message: str
    email: str
    resend_cooldown_seconds: int = 60

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class GoogleAuthRequest(BaseModel):
    """Google OAuth flow: frontend sends the ID token credential from Google Identity Services."""
    credential: str  # Google ID token (JWT)
    library_name: Optional[str] = None  # Required only for first-time registration via Google
    owner_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    additional_email: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"
    tenant: Optional["TenantResponse"] = None

class GoogleAuthResponse(BaseModel):
    is_new_user: bool = False
    email: Optional[str] = None
    name: Optional[str] = None
    access_token: Optional[str] = None
    token_type: Optional[str] = "bearer"
    user: Optional["UserResponse"] = None
    tenant: Optional["TenantResponse"] = None

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: Optional[str] = None
    full_name: str
    email: str
    role: str
    is_active: bool
    email_verified: bool = False
    email_verified_at: Optional[datetime] = None
    profile_complete: bool = False
    created_at: datetime
    # Prefill data for in-flight onboarding
    pending_library_name: Optional[str] = None
    pending_phone: Optional[str] = None
    pending_city: Optional[str] = None
    pending_address: Optional[str] = None
    pending_state: Optional[str] = None
    pending_pincode: Optional[str] = None
    pending_additional_email: Optional[str] = None

class TenantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: str
    owner_name: Optional[str] = None
    email: str
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    additional_email: Optional[str] = None
    logo_url: Optional[str] = None
    subscription_tier: str
    subscription_status: str
    currency: str
    operating_hours: str
    grace_period_days: int = 30
    is_active: bool
    created_at: datetime

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ForgotPasswordResponse(BaseModel):
    success: bool = True
    message: str

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str
    new_password: str

class ResetPasswordResponse(BaseModel):
    success: bool = True
    message: str

class TenantUpdateRequest(BaseModel):
    name: Optional[str] = None
    owner_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    additional_email: Optional[str] = None
    logo_url: Optional[str] = None
    currency: Optional[str] = None
    operating_hours: Optional[str] = None
    grace_period_days: Optional[int] = None

TokenResponse.model_rebuild()
GoogleAuthResponse.model_rebuild()
