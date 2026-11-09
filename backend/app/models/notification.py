from sqlalchemy import Column, String, DateTime, Text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.core.database import TenantScopedModel, get_utc_now

class Notification(TenantScopedModel):
    __tablename__ = "notifications"

    type = Column(String(50), nullable=False, index=True)  # whatsapp_failed, membership_expiring, birthday
    student_id = Column(String(36), ForeignKey("students.id", ondelete="CASCADE"), nullable=True, index=True)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    dedupe_key = Column(String(255), nullable=False, index=True)
    read_at = Column(DateTime(timezone=True), nullable=True)
    dismissed_at = Column(DateTime(timezone=True), nullable=True)

    student = relationship("Student")

    __table_args__ = (
        UniqueConstraint("tenant_id", "dedupe_key", name="uq_tenant_notification_dedupe"),
    )

