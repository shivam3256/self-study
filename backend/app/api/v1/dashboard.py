from datetime import date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_


from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.tenant import User
from app.models.student import Student
from app.models.desk import Desk
from app.models.attendance import Attendance
from app.models.payment import Payment

from app.models.shift import Shift
from app.models.allocation import SeatAllocation
from app.schemas.dashboard import DashboardSummary, ShiftOccupancyStat

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@router.get("/summary")
async def get_dashboard_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_user.tenant_id
    today = date.today()

    # Aggregate metrics
    total_desks = await db.scalar(select(func.count(Desk.id)).where(Desk.tenant_id == tenant_id, Desk.is_active == True))
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
        Student.expiry_date != None,
        Student.expiry_date >= today,
        Student.expiry_date <= today + timedelta(days=7)
    ))

    overdue_count = await db.scalar(select(func.count(Student.id)).where(
        Student.tenant_id == tenant_id,
        Student.status.in_(["active", "expired"]),
        Student.expiry_date != None,
        Student.expiry_date < today
    ))

    # Calculate active occupied desks now (active allocations covering today)
    occupied_desks_now = await db.scalar(select(func.count(func.distinct(SeatAllocation.desk_id))).where(
        SeatAllocation.tenant_id == tenant_id,
        SeatAllocation.status == "active",
        SeatAllocation.start_date <= today,
        SeatAllocation.end_date >= today
    ))

    # Shifts breakdown calculation
    shifts_res = await db.execute(
        select(Shift).where(Shift.tenant_id == tenant_id, Shift.is_active == True).order_by(Shift.start_time.asc())
    )
    shifts = shifts_res.scalars().all()
    shifts_breakdown = []
    for s in shifts:
        # Count active allocations for this shift or full day
        is_match = (
            (SeatAllocation.shift_id == s.id)
            if s.code == "FULL"
            else or_(SeatAllocation.shift_id == s.id, SeatAllocation.shift.has(code="FULL"))
        )
        occ_count = await db.scalar(
            select(func.count(func.distinct(SeatAllocation.desk_id))).where(
                SeatAllocation.tenant_id == tenant_id,
                SeatAllocation.status == "active",
                SeatAllocation.start_date <= today,
                SeatAllocation.end_date >= today,
                is_match
            )
        ) or 0
        cap = s.capacity if s.capacity > 0 else (total_desks or 1)
        rate = round((occ_count / cap * 100), 1) if cap > 0 else 0.0
        shifts_breakdown.append({
            "shift_id": s.id,
            "shift_name": s.name,
            "shift_code": s.code,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "capacity": cap,
            "occupied_count": occ_count,
            "occupancy_rate": rate
        })

    tot_d = total_desks or 0
    occ_d = occupied_desks_now or 0
    overall_occ_pct = round((occ_d / tot_d * 100), 1) if tot_d > 0 else 0.0

    return {
        "total_desks": tot_d,
        "total_active_students": active_students or 0,
        "today_checkins_count": today_checkins or 0,
        "revenue_today": float(rev_today or 0),
        "revenue_this_month": float(rev_month or 0),
        "overall_occupancy_percentage": overall_occ_pct,
        "expiring_soon_count": expiring_soon or 0,
        "overdue_students_count": overdue_count or 0,
        "shifts_breakdown": shifts_breakdown,
        "total_occupied_desks_now": occ_d
    }