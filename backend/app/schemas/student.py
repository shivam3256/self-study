from typing import Optional
from pydantic import BaseModel, EmailStr, ConfigDict
from datetime import date, datetime

class StudentCreate(BaseModel):
    admission_number: Optional[str] = None
    full_name: str
    phone: str
    email: Optional[EmailStr] = None
    photo_url: Optional[str] = None
    id_proof_type: str = "Aadhaar"
    id_proof_number: Optional[str] = None
    address: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    join_date: Optional[date] = None
    expiry_date: Optional[date] = None
    notes: Optional[str] = None

class StudentUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    photo_url: Optional[str] = None
    id_proof_type: Optional[str] = None
    id_proof_number: Optional[str] = None
    address: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    status: Optional[str] = None
    expiry_date: Optional[date] = None
    notes: Optional[str] = None

class StudentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    admission_number: str
    full_name: str
    phone: str
    email: Optional[str] = None
    photo_url: Optional[str] = None
    id_proof_type: str
    id_proof_number: Optional[str] = None
    address: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    status: str
    join_date: date
    expiry_date: Optional[date] = None
    paused_at: Optional[date] = None
    qr_code_token: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    
    # Active allocation if any
    current_desk_number: Optional[str] = None
    current_shift_name: Optional[str] = None

