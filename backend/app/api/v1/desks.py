from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.tenant import User
from app.models.desk import Desk
from app.models.shift import Shift
from app.models.allocation import SeatAllocation
from app.schemas.desk import DeskCreate, DeskUpdate, DeskResponse, DeskSeatMapItem

router = APIRouter(prefix="/desks", tags=["Desks & Visual Seat Map"])

@router.get("", response_model=List[DeskResponse])
async def list_desks(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Desk).where(Desk.tenant_id == current_user.tenant_id).order_by(Desk.row.asc(), Desk.column.asc())
    res = await db.execute(query)
    desks = res.scalars().all()
    return [DeskResponse.model_validate(d) for d in desks]

@router.get("/seat-map", response_model=List[DeskSeatMapItem])
async def get_seat_map(
    shift_id: Optional[str] = Query(None, description="Filter occupancy by specific shift ID"),
    query_date: Optional[date] = Query(None, description="Check occupancy on date (default today)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    target_date = query_date or date.today()

    # 1. Fetch all active desks
    desk_query = select(Desk).where(
        Desk.tenant_id == current_user.tenant_id,
        Desk.is_active == True
    ).order_by(Desk.row.asc(), Desk.column.asc())
    desk_res = await db.execute(desk_query)
    desks = desk_res.scalars().all()

    # 2. Fetch active allocations for this date
    alloc_query = (
        select(SeatAllocation)
        .options(
            selectinload(SeatAllocation.student),
            selectinload(SeatAllocation.shift)
        )
        .where(
            SeatAllocation.tenant_id == current_user.tenant_id,
            SeatAllocation.status == "active",
            SeatAllocation.start_date <= target_date,
            SeatAllocation.end_date >= target_date
        )
    )
    alloc_res = await db.execute(alloc_query)
    active_allocations = alloc_res.scalars().all()

    # Create mapping desk_id -> allocation
    # If shift_id is provided, match either that shift or full-day shifts
    alloc_by_desk = {}
    for a in active_allocations:
        if shift_id:
            # Check if this allocation matches the shift or is a full day shift
            is_match = (a.shift_id == shift_id) or (a.shift and a.shift.code == "FULL")
            if is_match:
                alloc_by_desk[a.desk_id] = a
        else:
            # Without shift filter, any active allocation marks it occupied
            alloc_by_desk[a.desk_id] = a

    result: List[DeskSeatMapItem] = []
    for d in desks:
        alloc = alloc_by_desk.get(d.id)
        if alloc:
            result.append(
                DeskSeatMapItem(
                    id=d.id,
                    desk_number=d.desk_number,
                    zone=d.zone,
                    row=d.row,
                    column=d.column,
                    category=d.category,
                    is_active=d.is_active,
                    is_occupied=True,
                    allocation_id=alloc.id,
                    student_id=alloc.student_id,
                    student_name=alloc.student.full_name if alloc.student else "Student",
                    student_phone=alloc.student.phone if alloc.student else None,
                    shift_name=alloc.shift.name if alloc.shift else None,
                    start_date=alloc.start_date.isoformat(),
                    end_date=alloc.end_date.isoformat()
                )
            )
        else:
            result.append(
                DeskSeatMapItem(
                    id=d.id,
                    desk_number=d.desk_number,
                    zone=d.zone,
                    row=d.row,
                    column=d.column,
                    category=d.category,
                    is_active=d.is_active,
                    is_occupied=False
                )
            )

    return result

@router.post("", response_model=DeskResponse, status_code=status.HTTP_201_CREATED)
async def create_desk(
    data: DeskCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    desk = Desk(
        tenant_id=current_user.tenant_id,
        desk_number=data.desk_number,
        zone=data.zone,
        row=data.row,
        column=data.column,
        category=data.category,
        is_active=data.is_active,
        notes=data.notes
    )
    db.add(desk)
    await db.commit()
    await db.refresh(desk)
    return DeskResponse.model_validate(desk)

@router.post("/batch", response_model=List[DeskResponse], status_code=status.HTTP_201_CREATED)
async def batch_create_desks(
    desks_data: List[DeskCreate],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    new_desks = [
        Desk(
            tenant_id=current_user.tenant_id,
            desk_number=d.desk_number,
            zone=d.zone,
            row=d.row,
            column=d.column,
            category=d.category,
            is_active=d.is_active,
            notes=d.notes
        )
        for d in desks_data
    ]
    db.add_all(new_desks)
    await db.commit()
    return [DeskResponse.model_validate(d) for d in new_desks]
