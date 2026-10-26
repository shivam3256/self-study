from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field
from datetime import date, datetime

class AllocationCreate(BaseModel):
    student_id: str
    plan_id: Optional[str] = None
    seat_id: Optional[str] = None
    desk_id: Optional[str] = None  # alias for seat_id
    shift_id: Optional[str] = None  # legacy single shift
    shift_ids: Optional[List[str]] = None  # multi-shift explicit
    start_date: date
    end_date: Optional[date] = None

class AllocationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    student_id: str
    plan_id: Optional[str] = None
    seat_id: str
    desk_id: Optional[str] = None
    start_date: date
    end_date: date
    status: str
    created_at: datetime
    
    # Joined metadata for presentation
    student_name: Optional[str] = None
    desk_number: Optional[str] = None
    shift_names: List[str] = []
    shift_ids: List[str] = []
    shift_name: Optional[str] = None
    shift_id: Optional[str] = None

class VacateRequest(BaseModel):
    notes: Optional[str] = None

class ReassignRequest(BaseModel):
    new_seat_id: Optional[str] = None
    new_desk_id: Optional[str] = None
    new_shift_id: Optional[str] = None
    new_shift_ids: Optional[List[str]] = None
    new_plan_id: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    notes: Optional[str] = None

class RenewalRequest(BaseModel):
    plan_id: Optional[str] = None
    duration_days: Optional[int] = None

class ReplaceOccupantRequest(BaseModel):
    new_student_id: str
    shift_id: Optional[str] = None
    shift_ids: Optional[List[str]] = None
    plan_id: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
