from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime

class DeskCreate(BaseModel):
    desk_number: str
    zone: str = "Floor A"
    row: int = 1
    column: int = 1
    category: str = "general"  # general, ac, ladies_only, premium
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
    
    # Optional occupancy info when loaded with active allocation
    is_occupied: Optional[bool] = None
    current_occupant: Optional[str] = None
    current_occupant_phone: Optional[str] = None
    current_shift_name: Optional[str] = None
    allocation_id: Optional[str] = None


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


# ─── Onboarding Floor Setup Schemas ───
class FloorSetupItem(BaseModel):
    name: str = Field(..., description="Name of the floor or zone, e.g. Floor A")
    seat_count: int = Field(..., ge=1, le=500, description="Number of seats on this floor (1-500)")

class OnboardingSeatsSetupRequest(BaseModel):
    floors: List[FloorSetupItem] = Field(..., min_length=1, description="List of floor configurations")

class OnboardingSeatsSetupResponse(BaseModel):
    success: bool
    message: str
    total_seats_created: int
    total_floors: int
    desks: List[DeskResponse]


# ─── Seat Management Bulk Operations ───
class DeskBulkCreateRequest(BaseModel):
    zone: str = Field(..., description="Zone / Floor name")
    count: int = Field(..., ge=1, le=200, description="Number of seats to add")
    category: str = "general"
    notes: Optional[str] = None

class DeskBulkUpdateRequest(BaseModel):
    desk_ids: List[str] = Field(..., min_length=1)
    zone: Optional[str] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None

class ZoneSummary(BaseModel):
    name: str
    total_seats: int
    active_seats: int
    occupied_seats: int

class ZoneRenameRequest(BaseModel):
    old_name: str
    new_name: str
