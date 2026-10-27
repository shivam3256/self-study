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
from app.models.allocation import SeatAllocation, AllocationShift
from app.models.plan import Plan
from app.schemas.dashboard import DashboardSummary, ShiftOccupancyStat
from sqlalchemy.orm import selectinload

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
    full_shifts_res = await db.execute(
        select(Shift.id).where(Shift.tenant_id == tenant_id, Shift.code == "FULL")
    )
    full_shift_ids = [row[0] for row in full_shifts_res.all()]

    shifts_breakdown = []
    for s in shifts:
        target_shift_ids = [s.id]
        if s.code != "FULL":
            target_shift_ids.extend([fid for fid in full_shift_ids if fid != s.id])

        occ_count = await db.scalar(
            select(func.count(func.distinct(AllocationShift.seat_id))).where(
                AllocationShift.tenant_id == tenant_id,
                AllocationShift.status == "active",
                AllocationShift.shift_id.in_(target_shift_ids),
                AllocationShift.start_date <= today,
                AllocationShift.end_date >= today
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


@router.get("/kpi-trends")
async def get_dashboard_kpi_trends(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_user.tenant_id
    today = date.today()
    last_week_date = today - timedelta(days=7)
    yesterday = today - timedelta(days=1)

    # 1. Occupancy rate comparison (vs 7 days ago)
    total_desks = await db.scalar(select(func.count(Desk.id)).where(Desk.tenant_id == tenant_id, Desk.is_active == True)) or 0
    occ_now = await db.scalar(select(func.count(func.distinct(SeatAllocation.desk_id))).where(
        SeatAllocation.tenant_id == tenant_id,
        SeatAllocation.status == "active",
        SeatAllocation.start_date <= today,
        SeatAllocation.end_date >= today
    )) or 0
    occ_last_week = await db.scalar(select(func.count(func.distinct(SeatAllocation.desk_id))).where(
        SeatAllocation.tenant_id == tenant_id,
        SeatAllocation.status == "active",
        SeatAllocation.start_date <= last_week_date,
        SeatAllocation.end_date >= last_week_date
    )) or 0

    rate_now = round((occ_now / total_desks * 100), 1) if total_desks > 0 else 0.0
    rate_last_week = round((occ_last_week / total_desks * 100), 1) if total_desks > 0 else 0.0

    occupancy_trend = None
    if rate_last_week > 0:
        diff_pct = round(((rate_now - rate_last_week) / rate_last_week) * 100, 1)
        occupancy_trend = {
            "diff_pct": diff_pct,
            "direction": "up" if diff_pct > 0 else ("down" if diff_pct < 0 else "neutral"),
            "label": "vs last week"
        }

    # 2. Active students comparison (vs 7 days ago)
    active_now = await db.scalar(select(func.count(Student.id)).where(
        Student.tenant_id == tenant_id, Student.status == "active"
    )) or 0
    active_last_week = await db.scalar(select(func.count(Student.id)).where(
        Student.tenant_id == tenant_id,
        Student.join_date <= last_week_date,
        or_(Student.expiry_date == None, Student.expiry_date >= last_week_date)
    )) or 0
    active_students_trend = None
    if active_last_week > 0:
        diff_pct = round(((active_now - active_last_week) / active_last_week) * 100, 1)
        active_students_trend = {
            "diff_pct": diff_pct,
            "direction": "up" if diff_pct > 0 else ("down" if diff_pct < 0 else "neutral"),
            "label": "vs last week"
        }

    # 3. Revenue today vs yesterday
    rev_today = await db.scalar(select(func.sum(Payment.final_amount)).where(
        Payment.tenant_id == tenant_id, Payment.payment_date == today
    )) or 0
    rev_yesterday = await db.scalar(select(func.sum(Payment.final_amount)).where(
        Payment.tenant_id == tenant_id, Payment.payment_date == yesterday
    )) or 0
    rev_today_trend = None
    if rev_yesterday > 0:
        diff_pct = round(((float(rev_today) - float(rev_yesterday)) / float(rev_yesterday)) * 100, 1)
        rev_today_trend = {
            "diff_pct": diff_pct,
            "direction": "up" if diff_pct > 0 else ("down" if diff_pct < 0 else "neutral"),
            "label": "vs yesterday"
        }

    # 4. Expiring soon (7d) vs 7 days ago
    expiring_now = await db.scalar(select(func.count(Student.id)).where(
        Student.tenant_id == tenant_id,
        Student.status == "active",
        Student.expiry_date != None,
        Student.expiry_date >= today,
        Student.expiry_date <= today + timedelta(days=7)
    )) or 0
    expiring_last_week = await db.scalar(select(func.count(Student.id)).where(
        Student.tenant_id == tenant_id,
        Student.status == "active",
        Student.expiry_date != None,
        Student.expiry_date >= last_week_date,
        Student.expiry_date <= last_week_date + timedelta(days=7)
    )) or 0
    expiring_soon_trend = None
    if expiring_last_week > 0:
        diff_pct = round(((expiring_now - expiring_last_week) / expiring_last_week) * 100, 1)
        expiring_soon_trend = {
            "diff_pct": diff_pct,
            "direction": "up" if diff_pct > 0 else ("down" if diff_pct < 0 else "neutral"),
            "label": "vs last week"
        }

    return {
        "occupancy": occupancy_trend,
        "active_students": active_students_trend,
        "revenue_today": rev_today_trend,
        "expiring_soon": expiring_soon_trend
    }


@router.get("/revenue-trend")
async def get_dashboard_revenue_trend(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_user.tenant_id
    today = date.today()
    start_date = today - timedelta(days=29)

    q = (
        select(
            Payment.payment_date,
            func.sum(Payment.final_amount).label("daily_total")
        )
        .where(
            Payment.tenant_id == tenant_id,
            Payment.payment_date >= start_date,
            Payment.payment_date <= today
        )
        .group_by(Payment.payment_date)
        .order_by(Payment.payment_date.asc())
    )
    res = await db.execute(q)
    results = {row[0]: float(row[1] or 0) for row in res.all()}

    data = []
    total_period = 0.0
    for i in range(30):
        d = start_date + timedelta(days=i)
        amt = results.get(d, 0.0)
        total_period += amt
        data.append({
            "date": d.isoformat(),
            "label": d.strftime("%d %b"),
            "amount": amt
        })

    return {
        "period_days": 30,
        "total_revenue": round(total_period, 2),
        "data": data
    }


@router.get("/dues-soon")
async def get_dashboard_dues_soon(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_user.tenant_id
    today = date.today()
    window_end = today + timedelta(days=7)

    q = (
        select(Student)
        .options(
            selectinload(Student.allocations).selectinload(SeatAllocation.plan),
            selectinload(Student.payments).selectinload(Payment.plan)
        )
        .where(
            Student.tenant_id == tenant_id,
            Student.status.in_(["active", "expired"]),
            Student.expiry_date != None,
            Student.expiry_date <= window_end
        )
        .order_by(Student.expiry_date.asc())
        .limit(5)
    )
    res = await db.execute(q)
    students = res.scalars().all()

    dues = []
    for s in students:
        plan_name = None
        if s.allocations:
            sorted_allocs = sorted(s.allocations, key=lambda a: a.end_date or date.min, reverse=True)
            if sorted_allocs and sorted_allocs[0].plan:
                plan_name = sorted_allocs[0].plan.name
        
        if not plan_name and s.payments:
            sorted_pays = sorted(s.payments, key=lambda p: p.created_at, reverse=True)
            for p in sorted_pays:
                if p.plan:
                    plan_name = p.plan.name
                    break

        if not plan_name:
            plan_name = "Seat Membership"

        days_diff = (s.expiry_date - today).days
        is_overdue = days_diff < 0

        dues.append({
            "id": s.id,
            "student_name": s.full_name,
            "phone": s.phone,
            "plan_name": plan_name,
            "expiry_date": s.expiry_date.isoformat(),
            "days_diff": abs(days_diff),
            "is_overdue": is_overdue,
            "status_text": f"{abs(days_diff)}d overdue" if is_overdue else ("Due today" if days_diff == 0 else f"Due in {days_diff}d")
        })

    return dues


@router.get("/attendance-trend")
async def get_dashboard_attendance_trend(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    tenant_id = current_user.tenant_id
    today = date.today()
    start_date = today - timedelta(days=6)

    q = (
        select(
            Attendance.date,
            func.count(Attendance.id).label("checkin_count")
        )
        .where(
            Attendance.tenant_id == tenant_id,
            Attendance.date >= start_date,
            Attendance.date <= today
        )
        .group_by(Attendance.date)
        .order_by(Attendance.date.asc())
    )
    res = await db.execute(q)
    results = {row[0]: int(row[1] or 0) for row in res.all()}

    data = []
    for i in range(7):
        d = start_date + timedelta(days=i)
        cnt = results.get(d, 0)
        data.append({
            "date": d.isoformat(),
            "day_label": d.strftime("%a"),
            "full_label": d.strftime("%d %b"),
            "count": cnt,
            "is_today": d == today
        })

    today_count = results.get(today, 0)
    return {
        "today_count": today_count,
        "data": data
    }