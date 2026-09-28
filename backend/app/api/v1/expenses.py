import calendar
from datetime import date, datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, desc

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.tenant import User
from app.models.expense import Expense
from app.models.payment import Payment
from app.models.student import Student
from app.schemas.expense import (
    ExpenseCreate,
    ExpenseUpdate,
    ExpenseResponse,
    BudgetSummaryResponse,
    CategoryBreakdownItem,
    MonthlyTrendItem,
)

router = APIRouter(prefix="/expenses", tags=["Expenses & Budget"])

CATEGORY_LABELS = {
    "electricity": "Electricity & Power",
    "rent": "Property Rent",
    "salary": "Staff & Guard Salary",
    "internet": "WiFi & Internet",
    "maintenance": "Repairs & Maintenance",
    "cleaning": "Cleaning & Housekeeping",
    "stationery": "Stationery & Printing",
    "water": "Water & Refreshments",
    "miscellaneous": "Miscellaneous Charges",
    "custom": "Other Expenses",
}

@router.get("", response_model=List[ExpenseResponse])
async def list_expenses(
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    category: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Expense).where(Expense.tenant_id == current_user.tenant_id)

    if month and year:
        last_day = calendar.monthrange(year, month)[1]
        start_date = date(year, month, 1)
        end_date = date(year, month, last_day)
        query = query.where(Expense.expense_date >= start_date, Expense.expense_date <= end_date)
    elif year:
        start_date = date(year, 1, 1)
        end_date = date(year, 12, 31)
        query = query.where(Expense.expense_date >= start_date, Expense.expense_date <= end_date)

    if category and category != "all":
        query = query.where(Expense.category == category)

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.where(
            or_(
                Expense.title.ilike(term),
                Expense.vendor_name.ilike(term),
                Expense.remarks.ilike(term)
            )
        )

    query = query.order_by(Expense.expense_date.desc(), Expense.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    return result.scalars().all()

@router.post("", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
async def create_expense(
    data: ExpenseCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    expense = Expense(
        tenant_id=current_user.tenant_id,
        title=data.title.strip(),
        category=data.category.lower().strip(),
        amount=data.amount,
        expense_date=data.expense_date,
        payment_mode=data.payment_mode,
        vendor_name=data.vendor_name.strip() if data.vendor_name else None,
        is_recurring=data.is_recurring,
        recurring_day=data.recurring_day,
        receipt_url=data.receipt_url,
        remarks=data.remarks.strip() if data.remarks else None,
    )
    db.add(expense)
    await db.commit()
    await db.refresh(expense)
    return expense

@router.get("/summary", response_model=BudgetSummaryResponse)
async def get_budget_summary(
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    today = date.today()
    target_month = month or today.month
    target_year = year or today.year
    tenant_id = current_user.tenant_id

    # Month range
    last_day = calendar.monthrange(target_year, target_month)[1]
    start_date = date(target_year, target_month, 1)
    end_date = date(target_year, target_month, last_day)

    # 1. Total Income (Student payments in that month)
    income_res = await db.scalar(
        select(func.sum(Payment.final_amount)).where(
            Payment.tenant_id == tenant_id,
            Payment.payment_date >= start_date,
            Payment.payment_date <= end_date,
            Payment.status == "paid"
        )
    )
    total_income = float(income_res or 0.0)

    # 2. Total Expenses in that month
    expense_res = await db.scalar(
        select(func.sum(Expense.amount)).where(
            Expense.tenant_id == tenant_id,
            Expense.expense_date >= start_date,
            Expense.expense_date <= end_date
        )
    )
    total_expenses = float(expense_res or 0.0)

    # 3. Profit & Margin
    net_profit = round(total_income - total_expenses, 2)
    profit_margin_pct = round((net_profit / total_income * 100), 1) if total_income > 0 else (0.0 if total_expenses == 0 else -100.0)
    expense_to_income_ratio = round((total_expenses / total_income * 100), 1) if total_income > 0 else (0.0 if total_expenses == 0 else 100.0)

    # 4. Student metrics for this month
    active_students = await db.scalar(
        select(func.count(Student.id)).where(
            Student.tenant_id == tenant_id,
            Student.status == "active"
        )
    ) or 0

    paid_students = await db.scalar(
        select(func.count(func.distinct(Payment.student_id))).where(
            Payment.tenant_id == tenant_id,
            Payment.payment_date >= start_date,
            Payment.payment_date <= end_date,
            Payment.status == "paid"
        )
    ) or 0

    # 5. Category Breakdown
    cat_query = select(
        Expense.category,
        func.sum(Expense.amount).label("total"),
        func.count(Expense.id).label("count")
    ).where(
        Expense.tenant_id == tenant_id,
        Expense.expense_date >= start_date,
        Expense.expense_date <= end_date
    ).group_by(Expense.category)
    
    cat_results = (await db.execute(cat_query)).all()
    category_breakdown = []
    for cat, total, count in cat_results:
        tot_val = float(total or 0.0)
        pct = round((tot_val / total_expenses * 100), 1) if total_expenses > 0 else 0.0
        label = CATEGORY_LABELS.get(cat, cat.replace("_", " ").title())
        category_breakdown.append(
            CategoryBreakdownItem(
                category=cat,
                label=label,
                total_amount=tot_val,
                count=count,
                percentage=pct
            )
        )
    category_breakdown.sort(key=lambda x: x.total_amount, reverse=True)

    # 6. Monthly Trend (Past 6 months up to target month/year)
    monthly_trend = []
    for i in range(5, -1, -1):
        # Calculate date for i months ago
        # Approximate by stepping months
        m = target_month - i
        y = target_year
        while m <= 0:
            m += 12
            y -= 1
        
        m_last_day = calendar.monthrange(y, m)[1]
        m_start = date(y, m, 1)
        m_end = date(y, m, m_last_day)
        m_label = f"{calendar.month_abbr[m]} {y}"

        m_inc = float(await db.scalar(
            select(func.sum(Payment.final_amount)).where(
                Payment.tenant_id == tenant_id,
                Payment.payment_date >= m_start,
                Payment.payment_date <= m_end,
                Payment.status == "paid"
            )
        ) or 0.0)

        m_exp = float(await db.scalar(
            select(func.sum(Expense.amount)).where(
                Expense.tenant_id == tenant_id,
                Expense.expense_date >= m_start,
                Expense.expense_date <= m_end
            )
        ) or 0.0)

        m_profit = round(m_inc - m_exp, 2)
        m_margin = round((m_profit / m_inc * 100), 1) if m_inc > 0 else 0.0

        monthly_trend.append(
            MonthlyTrendItem(
                month_label=m_label,
                year=y,
                month=m,
                income=m_inc,
                expenses=m_exp,
                net_profit=m_profit,
                profit_margin_pct=m_margin
            )
        )

    # 7. Recent expenses for target month
    rec_query = select(Expense).where(
        Expense.tenant_id == tenant_id,
        Expense.expense_date >= start_date,
        Expense.expense_date <= end_date
    ).order_by(Expense.expense_date.desc(), Expense.created_at.desc()).limit(10)
    recent_expenses = (await db.execute(rec_query)).scalars().all()

    month_name = f"{calendar.month_name[target_month]} {target_year}"

    return BudgetSummaryResponse(
        month=target_month,
        year=target_year,
        month_name=month_name,
        total_income=total_income,
        total_expenses=total_expenses,
        net_profit=net_profit,
        profit_margin_pct=profit_margin_pct,
        is_profitable=(net_profit >= 0),
        expense_to_income_ratio=expense_to_income_ratio,
        active_students_count=active_students,
        paid_students_count=paid_students,
        category_breakdown=category_breakdown,
        monthly_trend=monthly_trend,
        recent_expenses=[ExpenseResponse.model_validate(e) for e in recent_expenses]
    )

@router.get("/{expense_id}", response_model=ExpenseResponse)
async def get_expense(
    expense_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Expense).where(
        Expense.id == expense_id,
        Expense.tenant_id == current_user.tenant_id
    )
    result = await db.execute(query)
    expense = result.scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    return expense

@router.put("/{expense_id}", response_model=ExpenseResponse)
async def update_expense(
    expense_id: str,
    data: ExpenseUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Expense).where(
        Expense.id == expense_id,
        Expense.tenant_id == current_user.tenant_id
    )
    result = await db.execute(query)
    expense = result.scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "title" and value:
            setattr(expense, field, value.strip())
        elif field == "category" and value:
            setattr(expense, field, value.lower().strip())
        elif field in ["vendor_name", "remarks"] and value is not None:
            setattr(expense, field, value.strip() if value else None)
        else:
            setattr(expense, field, value)

    await db.commit()
    await db.refresh(expense)
    return expense

@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(
    expense_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Expense).where(
        Expense.id == expense_id,
        Expense.tenant_id == current_user.tenant_id
    )
    result = await db.execute(query)
    expense = result.scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    await db.delete(expense)
    await db.commit()
    return None
