from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field

class AdminLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)

class AdminLoginResponse(BaseModel):
    two_factor_required: bool = True
    enrollment_required: bool = False
    temp_token: str
    otpauth_uri: Optional[str] = None
    secret: Optional[str] = None
    qr_code: Optional[str] = None

class AdminEnroll2FARequest(BaseModel):
    temp_token: str
    code: str = Field(..., min_length=6, max_length=6, description="6-digit authenticator code")

class AdminVerify2FARequest(BaseModel):
    temp_token: str
    code: str = Field(..., min_length=4, max_length=30, description="6-digit TOTP code or recovery code")

class AdminAuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    admin_id: str
    email: str
    recovery_codes: Optional[List[str]] = None

class AdminMeResponse(BaseModel):
    id: str
    email: str
    totp_enabled: bool
    created_at: datetime
    last_login_at: Optional[datetime] = None

# --- Dashboard Schemas ---

class SubscriptionMetrics(BaseModel):
    active: int = 0
    expired: int = 0
    trial: int = 0
    suspended: int = 0

class SignupMetrics(BaseModel):
    this_week: int = 0
    this_month: int = 0

class AdminDashboardResponse(BaseModel):
    total_libraries: int
    total_library_owners: int
    total_students: int
    subscriptions: SubscriptionMetrics
    mrr: float
    new_signups: SignupMetrics
    sms_sent_this_month: int

# --- Libraries List & Detail Schemas ---

class LibraryListItem(BaseModel):
    id: str
    name: str
    slug: str
    owner_name: Optional[str] = None
    email: str
    phone: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    subscription_tier: str
    subscription_status: str
    subscription_expires_at: Optional[datetime] = None
    manually_overridden: bool = False
    override_reason: Optional[str] = None
    overridden_at: Optional[datetime] = None
    is_active: bool = True
    created_at: datetime
    seats_count: int = 0
    lockers_count: int = 0
    students_count: int = 0

class LibraryListResponse(BaseModel):
    items: List[LibraryListItem]
    total: int
    page: int
    page_size: int
    total_pages: int

class LibraryUsageMetrics(BaseModel):
    seats_count: int = 0
    lockers_count: int = 0
    active_seat_allocations: int = 0
    active_locker_allocations: int = 0
    students_count: int = 0
    sms_total_count: int = 0
    sms_month_count: int = 0

class LibraryDetailResponse(BaseModel):
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
    subscription_tier: str
    subscription_status: str
    subscription_expires_at: Optional[datetime] = None
    manually_overridden: bool = False
    override_reason: Optional[str] = None
    overridden_by: Optional[str] = None
    overridden_at: Optional[datetime] = None
    is_active: bool = True
    created_at: datetime
    usage: LibraryUsageMetrics
    recent_activity: List[dict] = []

class ManualSubscriptionOverrideRequest(BaseModel):
    subscription_tier: Optional[str] = None
    subscription_status: Optional[str] = None
    subscription_expires_at: Optional[datetime] = None
    extend_days: Optional[int] = None
    is_active: Optional[bool] = None
    reason: str = Field(..., min_length=3, max_length=1000, description="Mandatory audit reason for override")

class ClearSubscriptionOverrideRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=1000, description="Mandatory audit reason for clearing override")

# --- Audit Log Schemas ---

class AdminAuditLogItem(BaseModel):
    id: str
    admin_id: Optional[str] = None
    admin_email: Optional[str] = None
    action: str
    target_type: str
    target_id: Optional[str] = None
    before_json: Optional[dict] = None
    after_json: Optional[dict] = None
    reason: Optional[str] = None
    ip: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: datetime

class AdminAuditLogResponse(BaseModel):
    items: List[AdminAuditLogItem]
    total: int
    page: int
    page_size: int
    total_pages: int
