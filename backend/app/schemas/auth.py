from typing import Optional
from pydantic import BaseModel, EmailStr, ConfigDict
from datetime import datetime

class TenantRegisterRequest(BaseModel):
    # Tenant details
    library_name: str
    owner_name: str
    email: EmailStr
    phone: str
    password: str
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class GoogleAuthRequest(BaseModel):
    """Google OAuth flow: frontend sends the ID token credential from Google Identity Services."""
    credential: str  # Google ID token (JWT)
    library_name: Optional[str] = None  # Required only for first-time registration via Google
    phone: Optional[str] = None
    city: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"
    tenant: "TenantResponse"

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    full_name: str
    email: str
    role: str
    is_active: bool
    created_at: datetime

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
    logo_url: Optional[str] = None
    subscription_tier: str
    subscription_status: str
    currency: str
    operating_hours: str
    is_active: bool
    created_at: datetime

class TenantUpdateRequest(BaseModel):
    name: Optional[str] = None
    owner_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    logo_url: Optional[str] = None
    currency: Optional[str] = None
    operating_hours: Optional[str] = None

TokenResponse.model_rebuild()


