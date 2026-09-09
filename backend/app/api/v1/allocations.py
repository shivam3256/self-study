from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.tenant import User
from app.models.allocation import SeatAllocation
from app.schemas.allocation import AllocationCreate, AllocationResponse, VacateRequest
from app.services.allocation_service import AllocationService

router = APIRouter(prefix="/allocations", tags=["Seat Allocations"])

@router.get("", response_model=List[AllocationResponse])
async def list_allocations(
    status_filter: Optional[str] = Query("active", description="active, vacated, paused"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(SeatAllocation)
        .options(
            selectinload(SeatAllocation.student),
            selectinload(SeatAllocation.desk),
            selectinload(SeatAllocation.shift)
        )
        .where(SeatAllocation.tenant_id == current_user.tenant_id)
    )
    if status_filter:
        query = query.where(SeatAllocation.status == status_filter)

    query = query.order_by(SeatAllocation.created_at.desc())
    res = await db.execute(query)
    allocations = res.scalars().all()

    output = []
    for a in allocations:
        resp = AllocationResponse.model_validate(a)
        if a.student:
            resp.student_name = a.student.full_name
        if a.desk:
            resp.desk_number = a.desk.desk_number
        if a.shift:
            resp.shift_name = a.shift.name
        output.append(resp)
    return output

@router.post("", response_model=AllocationResponse, status_code=status.HTTP_201_CREATED)
async def create_allocation(
    data: AllocationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    allocation = await AllocationService.allocate_seat(db, current_user.tenant_id, data)
    
    # Reload with relationships
    query = (
        select(SeatAllocation)
        .options(
            selectinload(SeatAllocation.student),
            selectinload(SeatAllocation.desk),
            selectinload(SeatAllocation.shift)
        )
        .where(SeatAllocation.id == allocation.id)
    )
    res = await db.execute(query)
    loaded = res.scalar_one()

    resp = AllocationResponse.model_validate(loaded)
    if loaded.student:
        resp.student_name = loaded.student.full_name
    if loaded.desk:
        resp.desk_number = loaded.desk.desk_number
    if loaded.shift:
        resp.shift_name = loaded.shift.name
    return resp

@router.post("/{allocation_id}/vacate", response_model=AllocationResponse)
async def vacate_allocation(
    allocation_id: str,
    body: Optional[VacateRequest] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    allocation = await AllocationService.vacate_seat(db, current_user.tenant_id, allocation_id)
    return AllocationResponse.model_validate(allocation)
