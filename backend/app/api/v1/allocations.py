from datetime import date, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.tenant import User
from app.models.allocation import Allocation, AllocationShift
from app.models.plan import Plan, PlanShift
from app.schemas.allocation import AllocationCreate, AllocationResponse, VacateRequest, ReassignRequest, RenewalRequest
from app.schemas.desk import DeskResponse
from app.services.allocation_service import AllocationService

router = APIRouter(prefix="/allocations", tags=["Seat Allocations"])

def format_allocation_response(a: Allocation) -> AllocationResponse:
    resp = AllocationResponse.model_validate(a)
    if a.student:
        resp.student_name = a.student.full_name
    if a.desk:
        resp.desk_number = a.desk.desk_number
        resp.desk_id = a.desk.id
    
    shift_names = []
    shift_ids = []
    if a.allocation_shifts:
        for ash in a.allocation_shifts:
            shift_ids.append(ash.shift_id)
            if ash.shift:
                shift_names.append(ash.shift.name)
    resp.shift_names = shift_names
    resp.shift_ids = shift_ids
    resp.shift_name = " / ".join(shift_names) if shift_names else None
    resp.shift_id = shift_ids[0] if shift_ids else None
    return resp

@router.get("", response_model=List[AllocationResponse])
async def list_allocations(
    status_filter: Optional[str] = Query("active", description="active, overdue, expired, cancelled"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(Allocation)
        .options(
            selectinload(Allocation.student),
            selectinload(Allocation.desk),
            selectinload(Allocation.allocation_shifts).selectinload(AllocationShift.shift),
            selectinload(Allocation.plan)
        )
        .where(Allocation.tenant_id == current_user.tenant_id)
    )
    if status_filter and status_filter != "all":
        query = query.where(Allocation.status == status_filter)

    query = query.order_by(Allocation.created_at.desc())
    res = await db.execute(query)
    allocations = res.scalars().all()
    return [format_allocation_response(a) for a in allocations]

@router.get("/available-desks", response_model=List[DeskResponse])
async def get_available_desks(
    plan_id: Optional[str] = Query(None, description="Target Plan ID"),
    shift_id: Optional[str] = Query(None, description="Target Shift ID (legacy)"),
    start_date: Optional[date] = Query(None, description="Start date (default today)"),
    end_date: Optional[date] = Query(None, description="End date"),
    gender: Optional[str] = Query(None, description="Student gender for ladies_only filtering"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    target_start = start_date or date.today()
    target_end = end_date
    shift_ids: List[str] = []
    zone_id = None

    if plan_id:
        plan_q = (
            select(Plan)
            .options(selectinload(Plan.plan_shifts))
            .where(Plan.id == plan_id, Plan.tenant_id == current_user.tenant_id)
        )
        plan_res = await db.execute(plan_q)
        plan = plan_res.scalar_one_or_none()
        if not plan:
            return []
        shift_ids = [ps.shift_id for ps in plan.plan_shifts]
        zone_id = plan.zone_id
        if not target_end:
            target_end = target_start + timedelta(days=plan.duration_days - 1)
    elif shift_id:
        shift_ids = [shift_id]
        if not target_end:
            target_end = target_start

    if not target_end:
        target_end = target_start

    desks = await AllocationService.get_available_seats(
        db=db,
        tenant_id=current_user.tenant_id,
        shift_ids=shift_ids,
        start_date=target_start,
        end_date=target_end,
        zone_id=zone_id,
        gender=gender
    )
    return [DeskResponse.model_validate(d) for d in desks]

@router.post("", response_model=AllocationResponse, status_code=status.HTTP_201_CREATED)
async def create_allocation(
    data: AllocationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    allocation = await AllocationService.allocate_seat(db, current_user.tenant_id, data)
    
    # Reload with relationships
    query = (
        select(Allocation)
        .options(
            selectinload(Allocation.student),
            selectinload(Allocation.desk),
            selectinload(Allocation.allocation_shifts).selectinload(AllocationShift.shift),
            selectinload(Allocation.plan)
        )
        .where(Allocation.id == allocation.id)
    )
    res = await db.execute(query)
    loaded = res.scalar_one()
    return format_allocation_response(loaded)

@router.post("/{allocation_id}/reassign", response_model=AllocationResponse)
async def reassign_allocation(
    allocation_id: str,
    data: ReassignRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    allocation = await AllocationService.reassign_seat(db, current_user.tenant_id, allocation_id, data)
    
    query = (
        select(Allocation)
        .options(
            selectinload(Allocation.student),
            selectinload(Allocation.desk),
            selectinload(Allocation.allocation_shifts).selectinload(AllocationShift.shift),
            selectinload(Allocation.plan)
        )
        .where(Allocation.id == allocation.id)
    )
    res = await db.execute(query)
    loaded = res.scalar_one()
    return format_allocation_response(loaded)

@router.post("/{allocation_id}/renew", response_model=AllocationResponse)
async def renew_allocation_endpoint(
    allocation_id: str,
    body: Optional[RenewalRequest] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Fetch allocation to identify student
    alloc_q = select(Allocation).where(Allocation.id == allocation_id, Allocation.tenant_id == current_user.tenant_id)
    alloc_res = await db.execute(alloc_q)
    existing = alloc_res.scalar_one_or_none()
    if not existing:
        raise HTTPException(status_code=404, detail="Allocation not found.")

    allocation = await AllocationService.renew_allocation(
        db=db,
        tenant_id=current_user.tenant_id,
        student_id=existing.student_id,
        plan_id=body.plan_id if body else None,
        duration_days=body.duration_days if body else None
    )

    query = (
        select(Allocation)
        .options(
            selectinload(Allocation.student),
            selectinload(Allocation.desk),
            selectinload(Allocation.allocation_shifts).selectinload(AllocationShift.shift),
            selectinload(Allocation.plan)
        )
        .where(Allocation.id == allocation.id)
    )
    res = await db.execute(query)
    loaded = res.scalar_one()
    return format_allocation_response(loaded)

@router.post("/{allocation_id}/vacate", response_model=AllocationResponse)
async def vacate_allocation(
    allocation_id: str,
    body: Optional[VacateRequest] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    allocation = await AllocationService.vacate_seat(
        db, current_user.tenant_id, allocation_id, notes=body.notes if body else ""
    )
    query = (
        select(Allocation)
        .options(
            selectinload(Allocation.student),
            selectinload(Allocation.desk),
            selectinload(Allocation.allocation_shifts).selectinload(AllocationShift.shift),
            selectinload(Allocation.plan)
        )
        .where(Allocation.id == allocation.id)
    )
    res = await db.execute(query)
    loaded = res.scalar_one()
    return format_allocation_response(loaded)
