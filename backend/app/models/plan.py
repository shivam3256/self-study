from sqlalchemy import Column, String, Boolean, Integer, Numeric, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import TenantScopedModel

class Plan(TenantScopedModel):
    __tablename__ = "plans"

    name = Column(String(100), nullable=False)  # "Monthly Full Day", "Quarterly Morning", etc.
    code = Column(String(50), nullable=False)
    duration_days = Column(Integer, default=30, nullable=False)
    duration_months = Column(Integer, default=1, nullable=False)
    price = Column(Numeric(10, 2), nullable=False)
    shift_type = Column(String(50), default="single_shift", nullable=False)  # "single_shift", "full_day", "custom"
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    tenant = relationship("Tenant", back_populates="plans")
    payments = relationship("Payment", back_populates="plan")
