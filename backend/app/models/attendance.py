from datetime import date
from sqlalchemy import Column, String, Date, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.core.database import TenantScopedModel, get_utc_now

class Attendance(TenantScopedModel):
    __tablename__ = "attendance"

    student_id = Column(String(36), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(Date, default=date.today, nullable=False, index=True)
    check_in_time = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)
    check_out_time = Column(DateTime(timezone=True), nullable=True)
    method = Column(String(50), default="qr", nullable=False)  # qr, manual, card

    student = relationship("Student", back_populates="attendances")

    __table_args__ = (
        Index("ix_attendance_tenant_student_date", "tenant_id", "student_id", "date"),
    )
