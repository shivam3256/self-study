from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict

class ExpenseBase(BaseModel):
    title: str
    category: str = "miscellaneous"  # electricity, rent, salary, internet, maintenance, cleaning, stationery, miscellaneous, custom
    amount: float
    expense_date: date = date.today()
    payment_mode: str = "upi"  # upi, cash, bank_transfer, card, cheque
    vendor_name: Optional[str] = None
    is_recurring: bool = False
    recurring_day: Optional[int] = None
    receipt_url: Optional[str] = None
    remarks: Optional[str] = None

class ExpenseCreate(ExpenseBase):
    pass

class ExpenseUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[float] = None
    expense_date: Optional[date] = None
    payment_mode: Optional[str] = None
    vendor_name: Optional[str] = None
    is_recurring: Optional[bool] = None
    recurring_day: Optional[int] = None
    receipt_url: Optional[str] = None
    remarks: Optional[str] = None

class ExpenseResponse(ExpenseBase):
    id: str
    tenant_id: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class CategoryBreakdownItem(BaseModel):
    category: str
    label: str
    total_amount: float
    count: int
    percentage: float

class MonthlyTrendItem(BaseModel):
    month_label: str
    year: int
    month: int
    income: float
    expenses: float
    net_profit: float
    profit_margin_pct: float

class BudgetSummaryResponse(BaseModel):
    month: int
    year: int
    month_name: str
    total_income: float
    total_expenses: float
    net_profit: float
    profit_margin_pct: float
    is_profitable: bool
    expense_to_income_ratio: float
    active_students_count: int
    paid_students_count: int
    category_breakdown: List[CategoryBreakdownItem]
    monthly_trend: List[MonthlyTrendItem]
    recent_expenses: List[ExpenseResponse]
