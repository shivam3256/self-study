from typing import Optional
from decimal import Decimal
from pydantic import BaseModel, ConfigDict
from datetime import date, datetime

class PaymentCreate(BaseModel):
    student_id: str
    plan_id: Optional[str] = None
    locker_assignment_id: Optional[str] = None
    seat_id: Optional[str] = None
    desk_id: Optional[str] = None
    payment_type: str = "seat"  # seat, locker, deposit
    amount: Decimal
    discount: Decimal = Decimal("0.00")
    payment_mode: str = "upi"  # cash, upi, card, netbanking
    transaction_reference: Optional[str] = None
    payment_date: Optional[date] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    remarks: Optional[str] = None
    receipt_id: Optional[str] = None

class ReceiptLineItem(BaseModel):
    payment_id: str
    payment_type: str  # seat, locker, deposit
    item_type: Optional[str] = None
    description: str
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    amount: Decimal
    discount: Decimal = Decimal("0.00")
    final_amount: Decimal

class PaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    student_id: str
    plan_id: Optional[str] = None
    locker_assignment_id: Optional[str] = None
    receipt_number: str
    receipt_id: Optional[str] = None
    payment_type: str = "seat"
    amount: Decimal
    discount: Decimal
    final_amount: Decimal
    payment_mode: str
    transaction_reference: Optional[str] = None
    payment_date: date
    period_start: date
    period_end: date
    next_due_date: date
    status: str
    remarks: Optional[str] = None
    created_at: datetime
    
    student_name: Optional[str] = None
    student_phone: Optional[str] = None
    plan_name: Optional[str] = None
    locker_label: Optional[str] = None


class ReceiptDetailResponse(PaymentResponse):
    library_name: str
    library_address: Optional[str] = None
    library_phone: Optional[str] = None
    library_email: Optional[str] = None
    currency: str = "INR"
    line_items: list[ReceiptLineItem] = []
    combined_total: Optional[Decimal] = None

