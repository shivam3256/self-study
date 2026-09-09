from sqlalchemy import Column, String, Boolean, Integer, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import TenantScopedModel

class Desk(TenantScopedModel):
    __tablename__ = "desks"

    desk_number = Column(String(50), nullable=False, index=True)  # e.g., "A-01", "D-12"
    zone = Column(String(100), default="Main Hall", nullable=False)  # "Main Hall", "Quiet Zone", "Cabin A"
    row = Column(Integer, default=1, nullable=False)
    column = Column(Integer, default=1, nullable=False)
    category = Column(String(50), default="ac", nullable=False)  # "general", "ac", "ladies_only", "premium"
    is_active = Column(Boolean, default=True, nullable=False)
    notes = Column(Text, nullable=True)

    tenant = relationship("Tenant", back_populates="desks")
    allocations = relationship("SeatAllocation", back_populates="desk", cascade="all, delete-orphan")
