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

TokenResponse.model_rebuild()

