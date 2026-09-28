from datetime import date
from sqlalchemy import Column, String, Date, Numeric, Text, Boolean, Integer, Index
from sqlalchemy.orm import relationship
from app.core.database import TenantScopedModel

class Expense(TenantScopedModel):
    __tablename__ = "expenses"

    title = Column(String(255), nullable=False)
    category = Column(String(100), default="miscellaneous", nullable=False)  # electricity, rent, salary, internet, maintenance, cleaning, stationery, miscellaneous, custom
    amount = Column(Numeric(10, 2), nullable=False)
    expense_date = Column(Date, default=date.today, nullable=False, index=True)
    
    payment_mode = Column(String(50), default="upi", nullable=False)  # upi, cash, bank_transfer, card, cheque
    vendor_name = Column(String(255), nullable=True)  # e.g. "Tata Power", "Landlord Name", "Staff Name"
    
    is_recurring = Column(Boolean, default=False, nullable=False)
    recurring_day = Column(Integer, nullable=True)  # 1 to 31
    
    receipt_url = Column(String(500), nullable=True)
    remarks = Column(Text, nullable=True)

    tenant = relationship("Tenant", back_populates="expenses")

    __table_args__ = (
        Index("ix_expense_tenant_date", "tenant_id", "expense_date"),
        Index("ix_expense_tenant_category", "tenant_id", "category"),
    )
