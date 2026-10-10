from typing import Optional, List
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from app.schemas.shift import ShiftResponse

class PlanCreate(BaseModel):
    name: str
    code: str
    duration_days: int = 30
    duration_months: int = 1
    price: Decimal
    shift_ids: List[str] = Field(..., min_length=1, description="List of included shift IDs (at least one required)")
    shift_type: Optional[str] = "custom"
    description: Optional[str] = None
    zone_id: Optional[str] = None
    is_active: bool = True

class PlanUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    duration_days: Optional[int] = None
    duration_months: Optional[int] = None
    price: Optional[Decimal] = None
    shift_ids: Optional[List[str]] = Field(None, min_length=1, description="List of included shift IDs")
    shift_type: Optional[str] = None
    description: Optional[str] = None
    zone_id: Optional[str] = None
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
    shift_type: Optional[str] = None
    description: Optional[str] = None
    zone_id: Optional[str] = None
    is_active: bool
    shift_ids: List[str] = []
    shifts: List[ShiftResponse] = []
    created_at: datetime
