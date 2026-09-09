from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.core.database import BaseModel, get_utc_now

class Tenant(BaseModel):
    __tablename__ = "tenants"

    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, index=True, nullable=False)
    owner_name = Column(String(255), nullable=True)
    email = Column(String(255), nullable=False, index=True)
    phone = Column(String(50), nullable=True)
    address = Column(Text, nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    pincode = Column(String(20), nullable=True)
    logo_url = Column(String(500), nullable=True)
    
    # Subscription status for SaaS platform
    subscription_tier = Column(String(50), default="pro", nullable=False)
    subscription_status = Column(String(50), default="active", nullable=False)
    subscription_expires_at = Column(DateTime(timezone=True), nullable=True)
    
    currency = Column(String(10), default="INR", nullable=False)
    operating_hours = Column(String(100), default="06:00 AM - 11:00 PM", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    users = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    students = relationship("Student", back_populates="tenant", cascade="all, delete-orphan")
    shifts = relationship("Shift", back_populates="tenant", cascade="all, delete-orphan")
    plans = relationship("Plan", back_populates="tenant", cascade="all, delete-orphan")
    desks = relationship("Desk", back_populates="tenant", cascade="all, delete-orphan")

class User(BaseModel):
    __tablename__ = "users"

    tenant_id = Column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    full_name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), default="owner", nullable=False)  # owner, manager, front_desk
    is_active = Column(Boolean, default=True, nullable=False)
    last_login_at = Column(DateTime(timezone=True), nullable=True)

    tenant = relationship("Tenant", back_populates="users")
