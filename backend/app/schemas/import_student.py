from typing import List, Optional, Any
from pydantic import BaseModel, ConfigDict

class ImportRowItem(BaseModel):
    row_number: int
    name: str
    phone: Optional[str] = None
    gender: Optional[str] = "other"
    id_proof_type: Optional[str] = "Aadhaar"
    id_proof: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None
    
    # Deprecated fields retained as optional for API compatibility
    valid_upto: Optional[str] = None
    joining_date: Optional[str] = None
    seat: Optional[str] = None
    status: Optional[str] = None
    
    # Validation status
    is_valid: bool = True
    errors: List[str] = []
    warnings: List[str] = []
    
    # Resolved entity references
    resolved_desk_id: Optional[str] = None
    resolved_desk_number: Optional[str] = None
    resolved_shift_id: Optional[str] = None

class ImportValidationSummary(BaseModel):
    total_rows: int
    valid_rows: int
    warning_rows: int
    error_rows: int
    can_import: bool
    rows: List[ImportRowItem]

class ImportConfirmRequest(BaseModel):
    rows: List[ImportRowItem]

class ImportResultSummary(BaseModel):
    imported_count: int
    skipped_count: int
    plans_assigned: int = 0
    seats_assigned: int = 0
    errors: List[str] = []
