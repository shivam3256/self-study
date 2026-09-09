from datetime import date, timedelta
from decimal import Decimal
from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.tenant import User
from app.models.student import Student
from app.models.desk import Desk
from app.models.shift import Shift
from app.models.allocation import SeatAllocation
from app.models.payment import Payment
from app.models.attendance import Attendance
from app.schemas.dashboard import DashboardSummary, ShiftOccupancyStat

router = APIRouter(prefix="/dashboard", tags=["Dashboard & Reports"])

@router.get("/summary", response_model=DashboardSummary)
async def get_dashboard_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_user.tenant_id
    today = date.today()
    seven_days_ahead = today + timedelta(days=7)
    month_start = date(today.year, today.month, 1)

    # 1. Total active students
    stu_count_query = select(func.count(Student.id)).where(
        Student.tenant_id == tenant_id,
        Student.status == "active"
    )
    total_active_students = (await db.execute(stu_count_query)).scalar_one() or 0

    # 2. Total active desks
    desk_count_query = select(func.count(Desk.id)).where(
        Desk.tenant_id == tenant_id,
        Desk.is_active == True
    )
    total_desks = (await db.execute(desk_count_query)).scalar_one() or 0

    # 3. Currently active allocations
    alloc_query = select(func.count(func.distinct(SeatAllocation.desk_id))).where(
        SeatAllocation.tenant_id == tenant_id,
        SeatAllocation.status == "active",
        SeatAllocation.start_date <= today,
        SeatAllocation.end_date >= today
    )
    total_occupied_desks_now = (await db.execute(alloc_query)).scalar_one() or 0

    overall_occupancy_percentage = 0.0
    if total_desks > 0:
        overall_occupancy_percentage = round((total_occupied_desks_now / total_desks) * 100, 1)

    # 4. Today check-ins
    checkin_query = select(func.count(Attendance.id)).where(
        Attendance.tenant_id == tenant_id,
        Attendance.date == today
    )
    today_checkins_count = (await db.execute(checkin_query)).scalar_one() or 0

    # 5. Revenue today
    rev_today_query = select(func.sum(Payment.final_amount)).where(
        Payment.tenant_id == tenant_id,
        Payment.payment_date == today,
        Payment.status == "paid"
    )
    revenue_today = (await db.execute(rev_today_query)).scalar_one() or Decimal("0.00")

    # 6. Revenue this month
    rev_month_query = select(func.sum(Payment.final_amount)).where(
        Payment.tenant_id == tenant_id,
        Payment.payment_date >= month_start,
        Payment.payment_date <= today,
        Payment.status == "paid"
    )
    revenue_this_month = (await db.execute(rev_month_query)).scalar_one() or Decimal("0.00")

    # 7. Expiring soon (next 7 days)
    expiring_query = select(func.count(Student.id)).where(
        Student.tenant_id == tenant_id,
        Student.status == "active",
        Student.expiry_date != None,
        Student.expiry_date >= today,
        Student.expiry_date <= seven_days_ahead
    )
    expiring_soon_count = (await db.execute(expiring_query)).scalar_one() or 0

    # 8. Overdue students
    overdue_query = select(func.count(Student.id)).where(
        Student.tenant_id == tenant_id,
        Student.status.in_(["active", "expired"]),
        Student.expiry_date != None,
        Student.expiry_date < today
    )
    overdue_students_count = (await db.execute(overdue_query)).scalar_one() or 0

    # 9. Shifts breakdown
    shifts_query = select(Shift).where(Shift.tenant_id == tenant_id, Shift.is_active == True)
    shifts = (await db.execute(shifts_query)).scalars().all()

    shifts_breakdown: List[ShiftOccupancyStat] = []
    for s in shifts:
        occ_query = select(func.count(SeatAllocation.id)).where(
            SeatAllocation.tenant_id == tenant_id,
            SeatAllocation.shift_id == s.id,
            SeatAllocation.status == "active",
            SeatAllocation.start_date <= today,
            SeatAllocation.end_date >= today
        )
        occ_count = (await db.execute(occ_query)).scalar_one() or 0
        cap = s.capacity if s.capacity > 0 else (total_desks or 1)
        rate = round((occ_count / cap) * 100, 1)

        shifts_breakdown.append(
            ShiftOccupancyStat(
                shift_id=s.id,
                shift_name=s.name,
                shift_code=s.code,
                start_time=s.start_time,
                end_time=s.end_time,
                capacity=cap,
                occupied_count=occ_count,
                occupancy_rate=rate
            )
        )

    return DashboardSummary(
        total_active_students=total_active_students,
        total_desks=total_desks,
        total_occupied_desks_now=total_occupied_desks_now,
        overall_occupancy_percentage=overall_occupancy_percentage,
        today_checkins_count=today_checkins_count,
        revenue_today=revenue_today,
        revenue_this_month=revenue_this_month,
        expiring_soon_count=expiring_soon_count,
        overdue_students_count=overdue_students_count,
        shifts_breakdown=shifts_breakdown
    )
