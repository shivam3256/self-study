from typing import Optional
from pydantic import BaseModel, ConfigDict
from datetime import datetime

class DeskCreate(BaseModel):
    desk_number: str
    zone: str = "Main Hall"
    row: int = 1
    column: int = 1
    category: str = "ac"  # general, ac, ladies_only, premium
    is_active: bool = True
    notes: Optional[str] = None

class DeskUpdate(BaseModel):
    desk_number: Optional[str] = None
    zone: Optional[str] = None
    row: Optional[int] = None
    column: Optional[int] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None

class DeskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    desk_number: str
    zone: str
    row: int
    column: int
    category: str
    is_active: bool
    notes: Optional[str] = None
    created_at: datetime


class DeskSeatMapItem(BaseModel):
    id: str
    desk_number: str
    zone: str
    row: int
    column: int
    category: str
    is_active: bool
    
    # Dynamic occupancy fields based on shift query
    is_occupied: bool = False
    allocation_id: Optional[str] = None
    student_id: Optional[str] = None
    student_name: Optional[str] = None
    student_phone: Optional[str] = None
    shift_name: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
