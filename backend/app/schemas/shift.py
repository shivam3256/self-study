from typing import Optional
from pydantic import BaseModel, ConfigDict
from datetime import datetime

class ShiftCreate(BaseModel):
    name: str
    code: str
    start_time: str
    end_time: str
    capacity: int = 50
    is_active: bool = True

class ShiftUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    capacity: Optional[int] = None
    is_active: Optional[bool] = None

class ShiftResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    name: str
    code: str
    start_time: str
    end_time: str
    capacity: int
    is_active: bool
    created_at: datetime

