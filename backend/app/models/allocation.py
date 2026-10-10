from sqlalchemy import Column, String, Date, ForeignKey, Index
from sqlalchemy.orm import relationship, synonym
from app.core.database import TenantScopedModel

class Allocation(TenantScopedModel):
    __tablename__ = "allocations"

    student_id = Column(String(36), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    plan_id = Column(String(36), ForeignKey("plans.id", ondelete="SET NULL"), nullable=True, index=True)
    seat_id = Column(String(36), ForeignKey("desks.id", ondelete="CASCADE"), nullable=False, index=True)
    
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    status = Column(String(50), default="active", nullable=False, index=True)  # active, overdue, expired, cancelled

    desk_id = synonym("seat_id")

    student = relationship("Student", back_populates="allocations")
    desk = relationship("Desk", back_populates="allocations")
    plan = relationship("Plan")
    allocation_shifts = relationship(
        "AllocationShift",
        back_populates="allocation",
        cascade="all, delete-orphan",
        lazy="selectin"
    )

    def __init__(self, **kwargs):
        shift_id = kwargs.pop("shift_id", None)
        desk_id = kwargs.pop("desk_id", None)
        if desk_id and "seat_id" not in kwargs:
            kwargs["seat_id"] = desk_id
        super().__init__(**kwargs)
        if shift_id:
            ash = AllocationShift(
                tenant_id=self.tenant_id,
                shift_id=shift_id,
                seat_id=self.seat_id,
                start_date=self.start_date,
                end_date=self.end_date,
                status=self.status or "active"
            )
            self.allocation_shifts.append(ash)

    @property
    def shift_id(self):
        if self.allocation_shifts:
            return self.allocation_shifts[0].shift_id
        return None

    @property
    def shift(self):
        if self.allocation_shifts:
            return self.allocation_shifts[0].shift
        return None

    __table_args__ = (
        Index("ix_alloc_tenant_seat_status", "tenant_id", "seat_id", "status"),
        Index("ix_alloc_tenant_student_status", "tenant_id", "student_id", "status"),
    )


class AllocationShift(TenantScopedModel):
    __tablename__ = "allocation_shifts"

    allocation_id = Column(String(36), ForeignKey("allocations.id", ondelete="CASCADE"), nullable=False, index=True)
    shift_id = Column(String(36), ForeignKey("shifts.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Denormalized columns for fast queries and exclusion constraint
    seat_id = Column(String(36), ForeignKey("desks.id", ondelete="CASCADE"), nullable=False, index=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    status = Column(String(50), default="active", nullable=False, index=True)

    allocation = relationship("Allocation", back_populates="allocation_shifts")
    shift = relationship("Shift", back_populates="allocation_shifts")
    desk = relationship("Desk")

    __table_args__ = (
        Index("ix_alloc_shifts_tenant_seat_shift_status", "tenant_id", "seat_id", "shift_id", "status"),
    )


# Alias for backwards compatibility
SeatAllocation = Allocation
