from sqlalchemy import Column, String, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import TenantScopedModel, get_utc_now

class ReminderLog(TenantScopedModel):
    __tablename__ = "reminder_logs"

    student_id = Column(String(36), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    reminder_type = Column(String(50), nullable=False)  # 7_days_before, 3_days_before, 1_day_before, overdue, custom
    channel = Column(String(50), default="sms", nullable=False)  # sms, whatsapp, email
    status = Column(String(50), default="sent", nullable=False)  # sent, failed, pending
    message = Column(Text, nullable=False)
    sent_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)
    provider_response = Column(Text, nullable=True)

    student = relationship("Student", back_populates="reminders")
