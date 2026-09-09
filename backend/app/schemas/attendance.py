from typing import Optional
from pydantic import BaseModel, ConfigDict
from datetime import date, datetime

class CheckInRequest(BaseModel):
    student_id: Optional[str] = None
    qr_code_token: Optional[str] = None
    method: str = "qr"

class AttendanceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    student_id: str
    date: date
    check_in_time: datetime
    check_out_time: Optional[datetime] = None
    method: str
    student_name: Optional[str] = None
    student_phone: Optional[str] = None
    desk_number: Optional[str] = None

