from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, ConfigDict

class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    type: str
    student_id: Optional[str] = None
    student_name: Optional[str] = None
    student_phone: Optional[str] = None
    title: str
    body: str
    dedupe_key: str
    created_at: datetime
    read_at: Optional[datetime] = None
    dismissed_at: Optional[datetime] = None

class NotificationListResponse(BaseModel):
    unread_count: int
    notifications: List[NotificationResponse]

