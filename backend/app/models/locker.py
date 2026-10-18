from datetime import date, datetime
from sqlalchemy import Column, String, Date, DateTime, Numeric, Boolean, Text, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.core.database import TenantScopedModel, get_utc_now

class Locker(TenantScopedModel):
    __tablename__ = "lockers"

    label = Column(String(50), nullable=False)
    monthly_fee = Column(Numeric(10, 2), default=0.00, nullable=False)
    status = Column(String(50), default="available", nullable=False)  # available, assigned, maintenance

    # Relationships
    tenant = relationship("Tenant")
    assignments = relationship("LockerAssignment", back_populates="locker", cascade="all, delete-orphan", lazy="selectin")

    __table_args__ = (
        Index("uq_tenant_locker_label", "tenant_id", "label", unique=True),
        Index("ix_lockers_tenant_status", "tenant_id", "status"),
    )

class LockerAssignment(TenantScopedModel):
    __tablename__ = "locker_assignments"

    locker_id = Column(String(36), ForeignKey("lockers.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(String(36), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)

    start_date = Column(Date, default=date.today, nullable=False)
    paid_until = Column(Date, nullable=False)
    monthly_fee = Column(Numeric(10, 2), nullable=False)
    deposit_amount = Column(Numeric(10, 2), default=0.00, nullable=False)
    deposit_returned = Column(Boolean, default=False, nullable=False)

    status = Column(String(50), default="active", nullable=False)  # active, ended
    ended_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)

    # Relationships
    locker = relationship("Locker", back_populates="assignments", lazy="selectin")
    student = relationship("Student", back_populates="locker_assignments", lazy="selectin")
    payments = relationship("Payment", back_populates="locker_assignment")

    __table_args__ = (
        # Partial unique index for one active assignment per locker
        Index(
            "uq_active_locker_assignment",
            "tenant_id",
            "locker_id",
            unique=True,
            sqlite_where=(Column("status") == "active"),
            postgresql_where=(Column("status") == "active")
        ),
        # Partial unique index to limit student to one active locker
        Index(
            "uq_active_student_locker",
            "tenant_id",
            "student_id",
            unique=True,
            sqlite_where=(Column("status") == "active"),
            postgresql_where=(Column("status") == "active")
        ),
        Index("ix_locker_assignments_dates", "tenant_id", "status", "paid_until"),
    )
