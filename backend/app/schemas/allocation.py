from typing import Optional
from pydantic import BaseModel, ConfigDict
from datetime import date, datetime

class AllocationCreate(BaseModel):
    student_id: str
    desk_id: str
    shift_id: str
    start_date: date
    end_date: date

class AllocationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    student_id: str
    desk_id: str
    shift_id: str
    start_date: date
    end_date: date
    status: str
    created_at: datetime
    
    # Joined metadata for presentation
    student_name: Optional[str] = None
    desk_number: Optional[str] = None
    shift_name: Optional[str] = None

class VacateRequest(BaseModel):
    notes: Optional[str] = None

