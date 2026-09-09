from sqlalchemy import Column, String, Date, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.core.database import TenantScopedModel

class SeatAllocation(TenantScopedModel):
    __tablename__ = "seat_allocations"

    student_id = Column(String(36), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    desk_id = Column(String(36), ForeignKey("desks.id", ondelete="CASCADE"), nullable=False, index=True)
    shift_id = Column(String(36), ForeignKey("shifts.id", ondelete="CASCADE"), nullable=False, index=True)
    
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    status = Column(String(50), default="active", nullable=False)  # active, paused, vacated

    student = relationship("Student", back_populates="allocations")
    desk = relationship("Desk", back_populates="allocations")
    shift = relationship("Shift", back_populates="allocations")

    __table_args__ = (
        Index("ix_alloc_tenant_desk_shift_status", "tenant_id", "desk_id", "shift_id", "status"),
    )
