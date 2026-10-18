from typing import Optional, List
from decimal import Decimal
from datetime import date, datetime
from pydantic import BaseModel, ConfigDict, Field

class LockerCreate(BaseModel):
    label: str = Field(..., min_length=1, max_length=50)
    monthly_fee: Decimal = Field(default=Decimal("0.00"), ge=0)

class LockerBulkCreate(BaseModel):
    prefix: str = Field(default="L-", max_length=20)
    start_number: int = Field(default=1, ge=1)
    count: int = Field(default=20, ge=1, le=200)
    monthly_fee: Optional[Decimal] = Field(default=None, ge=0)
    default_monthly_fee: Optional[Decimal] = Field(default=Decimal("300.00"), ge=0)

    @property
    def effective_monthly_fee(self) -> Decimal:
        if self.monthly_fee is not None:
            return self.monthly_fee
        return self.default_monthly_fee or Decimal("300.00")

class LockerUpdate(BaseModel):
    label: Optional[str] = Field(None, min_length=1, max_length=50)
    monthly_fee: Optional[Decimal] = Field(None, ge=0)
    status: Optional[str] = Field(None)  # "available", "maintenance"

class LockerAssignRequest(BaseModel):
    student_id: str
    start_date: Optional[date] = None
    monthly_fee: Optional[Decimal] = Field(None, ge=0)
    deposit_amount: Optional[Decimal] = Field(default=Decimal("0.00"), ge=0)
    collect_payment: Optional[bool] = None
    collect_payment_now: Optional[bool] = None
    months: int = Field(default=1, ge=1, le=24)
    payment_mode: str = "upi"
    reference_number: Optional[str] = None
    transaction_reference: Optional[str] = None
    remarks: Optional[str] = None
    idempotency_key: Optional[str] = None

    @property
    def should_collect_payment(self) -> bool:
        if self.collect_payment is not None:
            return self.collect_payment
        if self.collect_payment_now is not None:
            return self.collect_payment_now
        return False

    @property
    def ref_number(self) -> Optional[str]:
        return self.reference_number or self.transaction_reference

class LockerReleaseRequest(BaseModel):
    notes: Optional[str] = None
    refund_deposit: bool = True

class LockerChangeStudentRequest(BaseModel):
    new_student_id: str
    transfer_deposit: bool = True
    start_date: Optional[date] = None
    notes: Optional[str] = None

class LockerRenewRequest(BaseModel):
    months: int = Field(default=1, ge=1, le=36)
    payment_mode: str = "upi"
    amount: Optional[Decimal] = None
    discount: Decimal = Field(default=Decimal("0.00"), ge=0)
    reference_number: Optional[str] = None
    transaction_reference: Optional[str] = None
    remarks: Optional[str] = None
    idempotency_key: Optional[str] = None

    @property
    def ref_number(self) -> Optional[str]:
        return self.reference_number or self.transaction_reference

class LockerAssignmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    locker_id: str
    locker_label: Optional[str] = None
    label: Optional[str] = None
    student_id: str
    student_name: Optional[str] = None
    student_phone: Optional[str] = None
    student_admission_number: Optional[str] = None
    start_date: date
    paid_until: date
    monthly_fee: Decimal
    deposit_amount: Decimal
    deposit_returned: bool
    status: str
    ended_at: Optional[datetime] = None
    notes: Optional[str] = None
    overdue_days: int = 0

class LockerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    label: str
    monthly_fee: Decimal
    status: str  # DB status: available / assigned / maintenance
    computed_status: str  # available / assigned / overdue / maintenance
    current_assignment: Optional[LockerAssignmentResponse] = None
    student_name: Optional[str] = None
    created_at: datetime

class LockerMapSummary(BaseModel):
    total: int
    vacant: int
    assigned: int
    overdue: int
    maintenance: int
    lockers: List[LockerResponse]

class CombinedPaymentRequest(BaseModel):
    student_id: str
    # Seat fields
    plan_id: str
    seat_id: Optional[str] = None
    seat_amount: Optional[Decimal] = None
    seat_discount: Decimal = Decimal("0.00")
    period_start: Optional[date] = None
    seat_period_start: Optional[date] = None
    period_end: Optional[date] = None
    seat_period_end: Optional[date] = None
    # Locker fields
    locker_assignment_id: Optional[str] = None
    locker_months: int = Field(default=1, ge=1, le=36)
    locker_amount: Optional[Decimal] = None
    locker_discount: Decimal = Decimal("0.00")
    # Shared payment fields
    payment_mode: str = "upi"
    reference_number: Optional[str] = None
    transaction_reference: Optional[str] = None
    remarks: Optional[str] = None
    idempotency_key: Optional[str] = None

    @property
    def ref_number(self) -> Optional[str]:
        return self.reference_number or self.transaction_reference
