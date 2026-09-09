from sqlalchemy import Column, String, Boolean, Integer, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import TenantScopedModel

class Shift(TenantScopedModel):
    __tablename__ = "shifts"

    name = Column(String(100), nullable=False)  # e.g., "Morning Shift", "Evening Shift", "Full Day"
    code = Column(String(50), nullable=False)   # e.g., "MORN", "EVE", "FULL"
    start_time = Column(String(10), nullable=False)  # "06:00"
    end_time = Column(String(10), nullable=False)    # "14:00"
    is_active = Column(Boolean, default=True, nullable=False)
    capacity = Column(Integer, default=50, nullable=False)

    tenant = relationship("Tenant", back_populates="shifts")
    allocations = relationship("SeatAllocation", back_populates="shift", cascade="all, delete-orphan")
