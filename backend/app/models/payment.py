from datetime import date
from sqlalchemy import Column, String, Date, Numeric, Text, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.core.database import TenantScopedModel

class Payment(TenantScopedModel):
    __tablename__ = "payments"

    student_id = Column(String(36), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    plan_id = Column(String(36), ForeignKey("plans.id", ondelete="SET NULL"), nullable=True, index=True)
    locker_assignment_id = Column(String(36), ForeignKey("locker_assignments.id", ondelete="SET NULL"), nullable=True, index=True)
    
    receipt_number = Column(String(100), nullable=False, index=True)
    receipt_id = Column(String(100), nullable=True, index=True)  # Shared identifier linking combined payments under one receipt
    payment_type = Column(String(50), default="seat", nullable=False)  # seat, locker, deposit
    amount = Column(Numeric(10, 2), nullable=False)
    discount = Column(Numeric(10, 2), default=0.00, nullable=False)
    final_amount = Column(Numeric(10, 2), nullable=False)
    
    payment_mode = Column(String(50), default="upi", nullable=False)  # cash, upi, card, netbanking
    transaction_reference = Column(String(100), nullable=True)
    
    payment_date = Column(Date, default=date.today, nullable=False)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    next_due_date = Column(Date, nullable=False)
    
    status = Column(String(50), default="paid", nullable=False)  # paid, pending, partial, refunded
    remarks = Column(Text, nullable=True)

    student = relationship("Student", back_populates="payments")
    plan = relationship("Plan", back_populates="payments")
    locker_assignment = relationship("LockerAssignment", back_populates="payments")

    __table_args__ = (
        Index("ix_payment_tenant_student", "tenant_id", "student_id"),
        Index("ix_payment_receipt", "tenant_id", "receipt_number"),
        Index("ix_payment_receipt_id", "tenant_id", "receipt_id"),
        Index("ix_payment_type", "tenant_id", "payment_type"),
    )
