from datetime import date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.tenant import User
from app.models.student import Student
from app.models.desk import Desk
from app.models.attendance import Attendance
from app.models.payment import Payment

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@router.get("/summary")
async def get_dashboard_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_user.tenant_id
    today = date.today()

    # Aggregate metrics
    total_desks = await db.scalar(select(func.count(Desk.id)).where(Desk.tenant_id == tenant_id))
    active_students = await db.scalar(select(func.count(Student.id)).where(
        Student.tenant_id == tenant_id, Student.status == "active"
    ))
    today_checkins = await db.scalar(select(func.count(Attendance.id)).where(
        Attendance.tenant_id == tenant_id, Attendance.date == today
    ))
    
    # Revenue Metrics
    rev_today = await db.scalar(select(func.sum(Payment.final_amount)).where(
        Payment.tenant_id == tenant_id, Payment.payment_date == today
    ))
    rev_month = await db.scalar(select(func.sum(Payment.final_amount)).where(
        Payment.tenant_id == tenant_id,
        func.extract('month', Payment.payment_date) == today.month
    ))

    # Expiry Metrics
    expiring_soon = await db.scalar(select(func.count(Student.id)).where(
        Student.tenant_id == tenant_id,
        Student.status == "active",
        Student.expiry_date <= today + timedelta(days=7)
    ))

    return {
        "total_desks": total_desks or 0,
        "total_active_students": active_students or 0,
        "today_checkins_count": today_checkins or 0,
        "revenue_today": float(rev_today or 0),
        "revenue_this_month": float(rev_month or 0),
        "overall_occupancy_percentage": int((today_checkins / total_desks * 100)) if total_desks > 0 else 0,
        "expiring_soon_count": expiring_soon or 0,
        "overdue_students_count": 0, # Placeholder for overdue logic
        "shifts_breakdown": [], # Placeholder for shift-specific logic
        "total_occupied_desks_now": today_checkins
    }