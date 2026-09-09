from datetime import date
from sqlalchemy import Column, String, Date, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import TenantScopedModel

class Student(TenantScopedModel):
    __tablename__ = "students"

    admission_number = Column(String(50), nullable=False, index=True)
    full_name = Column(String(255), nullable=False, index=True)
    phone = Column(String(50), nullable=False, index=True)
    email = Column(String(255), nullable=True)
    photo_url = Column(String(500), nullable=True)
    
    id_proof_type = Column(String(50), default="Aadhaar", nullable=False)
    id_proof_number = Column(String(100), nullable=True)
    address = Column(Text, nullable=True)
    
    emergency_contact_name = Column(String(255), nullable=True)
    emergency_contact_phone = Column(String(50), nullable=True)
    
    status = Column(String(50), default="active", nullable=False, index=True)  # active, paused, expired, suspended
    join_date = Column(Date, default=date.today, nullable=False)
    expiry_date = Column(Date, nullable=True, index=True)
    paused_at = Column(Date, nullable=True)
    
    qr_code_token = Column(String(100), unique=True, index=True, nullable=True)
    notes = Column(Text, nullable=True)

    tenant = relationship("Tenant", back_populates="students")
    allocations = relationship("SeatAllocation", back_populates="student", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="student", cascade="all, delete-orphan")
    attendances = relationship("Attendance", back_populates="student", cascade="all, delete-orphan")
    reminders = relationship("ReminderLog", back_populates="student", cascade="all, delete-orphan")
