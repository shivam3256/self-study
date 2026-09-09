from typing import Optional
from decimal import Decimal
from pydantic import BaseModel, ConfigDict
from datetime import datetime

class PlanCreate(BaseModel):
    name: str
    code: str
    duration_days: int = 30
    duration_months: int = 1
    price: Decimal
    shift_type: str = "single_shift"
    description: Optional[str] = None
    is_active: bool = True

class PlanUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    duration_days: Optional[int] = None
    duration_months: Optional[int] = None
    price: Optional[Decimal] = None
    shift_type: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class PlanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    name: str
    code: str
    duration_days: int
    duration_months: int
    price: Decimal
    shift_type: str
    description: Optional[str] = None
    is_active: bool
    created_at: datetime

