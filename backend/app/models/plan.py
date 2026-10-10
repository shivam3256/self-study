from sqlalchemy import Column, String, Boolean, Integer, Numeric, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import TenantScopedModel

class PlanShift(TenantScopedModel):
    __tablename__ = "plan_shifts"

    plan_id = Column(String(36), ForeignKey("plans.id", ondelete="CASCADE"), nullable=False, index=True)
    shift_id = Column(String(36), ForeignKey("shifts.id", ondelete="CASCADE"), nullable=False, index=True)

    plan = relationship("Plan", back_populates="plan_shifts")
    shift = relationship("Shift")


class Plan(TenantScopedModel):
    __tablename__ = "plans"

    name = Column(String(100), nullable=False)  # "Monthly Full Day", "Quarterly Morning", etc.
    code = Column(String(50), nullable=False)
    duration_days = Column(Integer, default=30, nullable=False)
    duration_months = Column(Integer, default=1, nullable=False)
    price = Column(Numeric(10, 2), nullable=False)
    shift_type = Column(String(50), default="single_shift", nullable=True)  # legacy fallback
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    zone_id = Column(String(100), nullable=True)

    tenant = relationship("Tenant", back_populates="plans")
    payments = relationship("Payment", back_populates="plan")
    plan_shifts = relationship("PlanShift", back_populates="plan", cascade="all, delete-orphan", lazy="selectin")
    shifts = relationship("Shift", secondary="plan_shifts", lazy="selectin", viewonly=True)

