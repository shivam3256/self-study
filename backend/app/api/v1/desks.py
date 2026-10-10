import re
from datetime import date
from typing import List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, or_
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.tenant import User
from app.models.desk import Desk
from app.models.shift import Shift
from app.models.allocation import Allocation, AllocationShift, SeatAllocation
from app.schemas.desk import (
    DeskCreate,
    DeskUpdate,
    DeskResponse,
    DeskSeatMapItem,
    OnboardingSeatsSetupRequest,
    OnboardingSeatsSetupResponse,
    DeskBulkCreateRequest,
    DeskBulkUpdateRequest,
    ZoneSummary,
    ZoneRenameRequest
)

router = APIRouter(prefix="/desks", tags=["Desks & Visual Seat Map"])


def _extract_floor_prefix(floor_name: str, index: int) -> str:
    """Derives a short uppercase letter/prefix for seat naming (e.g. 'Floor A' -> 'A', 'Ground Floor' -> 'G')."""
    cleaned = floor_name.strip()
    # Check for single letter suffix or word e.g. "Floor A", "Zone B", "Hall-C"
    match = re.search(r'\b([A-Za-z])\b', cleaned)
    if match:
        return match.group(1).upper()
    # Check for first word character
    first_char_match = re.search(r'[A-Za-z]', cleaned)
    if first_char_match:
        return first_char_match.group(0).upper()
    # Fallback to index letter
    return chr(65 + (index % 26))


# ─────────────────────────────────────────────
# 1. List Desks with Occupancy Info
# ─────────────────────────────────────────────
@router.get("", response_model=List[DeskResponse])
async def list_desks(
    zone: Optional[str] = Query(None, description="Filter by zone"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(Desk)
        .options(
            selectinload(Desk.allocations).selectinload(Allocation.student),
            selectinload(Desk.allocations).selectinload(Allocation.allocation_shifts).selectinload(AllocationShift.shift)
        )
        .where(Desk.tenant_id == current_user.tenant_id)
    )
    if zone:
        query = query.where(Desk.zone == zone)
    if is_active is not None:
        query = query.where(Desk.is_active == is_active)

    query = query.order_by(Desk.zone.asc(), Desk.desk_number.asc())
    res = await db.execute(query)
    desks = res.scalars().all()

    today = date.today()
    output: List[DeskResponse] = []
    for d in desks:
        resp = DeskResponse.model_validate(d)
        active_alloc = next(
            (a for a in d.allocations if a.status in ("active", "overdue") and a.start_date <= today and a.end_date >= today),
            None
        )
        if active_alloc:
            resp.is_occupied = True
            resp.allocation_id = active_alloc.id
            resp.current_occupant = active_alloc.student.full_name if active_alloc.student else "Occupied"
            resp.current_occupant_phone = active_alloc.student.phone if active_alloc.student else None
            sh_names = [ash.shift.name for ash in active_alloc.allocation_shifts if ash.shift]
            resp.current_shift_name = " / ".join(sh_names) if sh_names else None
        else:
            resp.is_occupied = False
        output.append(resp)
    return output


@router.get("/available", response_model=List[DeskResponse])
async def get_available_seats(
    plan_id: Optional[str] = Query(None, description="Plan ID to calculate shifts and duration"),
    shift_id: Optional[str] = Query(None, description="Shift ID"),
    start_date: Optional[date] = Query(None, description="Start date (defaults to today)"),
    end_date: Optional[date] = Query(None, description="End date"),
    gender: Optional[str] = Query(None, description="Student gender"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    from app.services.allocation_service import AllocationService
    from app.models.plan import Plan
    from datetime import timedelta
    target_start = start_date or date.today()
    target_end = end_date
    shift_ids = []
    zone_id = None
    if plan_id:
        plan_res = await db.execute(
            select(Plan).options(selectinload(Plan.plan_shifts)).where(Plan.id == plan_id, Plan.tenant_id == current_user.tenant_id)
        )
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



# ─────────────────────────────────────────────
# 2. Visual Seat Map Query
# ─────────────────────────────────────────────
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
    ).order_by(Desk.zone.asc(), Desk.row.asc(), Desk.column.asc(), Desk.desk_number.asc())
    desk_res = await db.execute(desk_query)
    desks = desk_res.scalars().all()

    # 2. Fetch requested shift if shift_id is provided
    target_shift = None
    if shift_id:
        sh_res = await db.execute(
            select(Shift).where(Shift.id == shift_id, Shift.tenant_id == current_user.tenant_id)
        )
        target_shift = sh_res.scalar_one_or_none()

    # 3. Fetch active allocations for this date
    alloc_query = (
        select(Allocation)
        .options(
            selectinload(Allocation.student),
            selectinload(Allocation.allocation_shifts).selectinload(AllocationShift.shift)
        )
        .where(
            Allocation.tenant_id == current_user.tenant_id,
            Allocation.status.in_(["active", "overdue"]),
            Allocation.start_date <= target_date,
            Allocation.end_date >= target_date
        )
    )
    alloc_res = await db.execute(alloc_query)
    active_allocations = alloc_res.scalars().all()

    # Map desk_id -> list of matching allocations
    allocs_by_desk: Dict[str, List[Allocation]] = {}
    for a in active_allocations:
        shift_ids_for_a = [ash.shift_id for ash in a.allocation_shifts]
        if target_shift:
            is_match = (
                (target_shift.code == "FULL")
                or (target_shift.id in shift_ids_for_a)
                or any(ash.shift and ash.shift.code == "FULL" for ash in a.allocation_shifts)
            )
            if is_match:
                allocs_by_desk.setdefault(a.seat_id, []).append(a)
        else:
            allocs_by_desk.setdefault(a.seat_id, []).append(a)

    result: List[DeskSeatMapItem] = []
    for d in desks:
        matching_allocs = allocs_by_desk.get(d.id, [])
        if matching_allocs:
            primary_alloc = matching_allocs[0]
            if len(matching_allocs) > 1:
                combined_names = " / ".join(
                    f"{a.student.full_name} ({', '.join(ash.shift.name for ash in a.allocation_shifts if ash.shift)})"
                    for a in matching_allocs if a.student
                )
                combined_shifts = " / ".join(
                    ", ".join(ash.shift.name for ash in a.allocation_shifts if ash.shift)
                    for a in matching_allocs
                )
            else:
                combined_names = primary_alloc.student.full_name if primary_alloc.student else "Student"
                combined_shifts = " / ".join(ash.shift.name for ash in primary_alloc.allocation_shifts if ash.shift) or None

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
                    allocation_id=primary_alloc.id,
                    student_id=primary_alloc.student_id,
                    student_name=combined_names,
                    student_phone=primary_alloc.student.phone if primary_alloc.student else None,
                    shift_name=combined_shifts,
                    start_date=primary_alloc.start_date.isoformat(),
                    end_date=primary_alloc.end_date.isoformat()
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


# ─────────────────────────────────────────────
# 3. Phase 1: Onboarding Total Seats Setup
# ─────────────────────────────────────────────
@router.post("/onboarding-setup", response_model=OnboardingSeatsSetupResponse, status_code=status.HTTP_201_CREATED)
async def onboarding_seats_setup(
    payload: OnboardingSeatsSetupRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Idempotent, atomic floor & seat generator for onboarding setup.
    Creates seats <Prefix>-01, <Prefix>-02, ... linked to tenant and zone in a single transaction.
    """
    if not payload.floors or len(payload.floors) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one floor setup row is required.")

    # Validate duplicate floor names
    seen_names = set()
    for f in payload.floors:
        clean_name = f.name.strip()
        if not clean_name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Floor name cannot be empty.")
        if clean_name.lower() in seen_names:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Duplicate floor name '{clean_name}'. Each floor must have a unique name.")
        seen_names.add(clean_name.lower())
        if f.seat_count < 1 or f.seat_count > 500:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Seat count for '{clean_name}' must be between 1 and 500.")

    # Load existing desks for idempotency check
    existing_res = await db.execute(select(Desk).where(Desk.tenant_id == current_user.tenant_id))
    existing_desks = existing_res.scalars().all()
    existing_desk_numbers = {d.desk_number for d in existing_desks}

    new_desks: List[Desk] = []
    used_prefixes = set()

    for idx, floor in enumerate(payload.floors):
        floor_name = floor.name.strip()
        prefix = _extract_floor_prefix(floor_name, idx)
        
        # Ensure distinct prefix per floor in this batch
        if prefix in used_prefixes:
            prefix = f"{prefix}{idx + 1}"
        used_prefixes.add(prefix)

        for s_idx in range(1, floor.seat_count + 1):
            desk_num = f"{prefix}-{s_idx:02d}"
            
            # If already exists for this tenant, skip to preserve idempotency
            if desk_num in existing_desk_numbers:
                continue

            row_num = ((s_idx - 1) // 6) + 1
            col_num = ((s_idx - 1) % 6) + 1

            desk = Desk(
                tenant_id=current_user.tenant_id,
                desk_number=desk_num,
                zone=floor_name,
                row=row_num,
                column=col_num,
                category="general",
                is_active=True,
                notes=f"Auto-generated during onboarding setup ({floor_name})"
            )
            db.add(desk)
            new_desks.append(desk)
            existing_desk_numbers.add(desk_num)

    try:
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to complete seat onboarding setup: {str(e)}"
        )

    # Fetch all desks for tenant
    all_res = await db.execute(
        select(Desk).where(Desk.tenant_id == current_user.tenant_id).order_by(Desk.zone.asc(), Desk.desk_number.asc())
    )
    all_desks = all_res.scalars().all()

    return OnboardingSeatsSetupResponse(
        success=True,
        message=f"Successfully configured {len(payload.floors)} floor(s) with {len(all_desks)} total seat(s).",
        total_seats_created=len(new_desks),
        total_floors=len(payload.floors),
        desks=[DeskResponse.model_validate(d) for d in all_desks]
    )


# ─────────────────────────────────────────────
# 4. Create Single Desk
# ─────────────────────────────────────────────
@router.post("", response_model=DeskResponse, status_code=status.HTTP_201_CREATED)
async def create_desk(
    data: DeskCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    clean_num = data.desk_number.strip()
    if not clean_num:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Seat number is required.")

    # Check unique desk_number for tenant
    dup_res = await db.execute(
        select(Desk).where(Desk.tenant_id == current_user.tenant_id, Desk.desk_number == clean_num)
    )
    if dup_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Seat with number '{clean_num}' already exists in your library."
        )

    desk = Desk(
        tenant_id=current_user.tenant_id,
        desk_number=clean_num,
        zone=data.zone.strip() or "Main Hall",
        row=data.row,
        column=data.column,
        category=data.category.lower() if data.category else "general",
        is_active=data.is_active,
        notes=data.notes
    )
    db.add(desk)
    await db.commit()
    await db.refresh(desk)
    return DeskResponse.model_validate(desk)


# ─────────────────────────────────────────────
# 5. Bulk Add Seats to a Zone (Auto-numbering)
# ─────────────────────────────────────────────
@router.post("/bulk-add", response_model=List[DeskResponse], status_code=status.HTTP_201_CREATED)
async def bulk_add_desks(
    payload: DeskBulkCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    zone_name = payload.zone.strip()
    if not zone_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Zone name is required.")
    if payload.count < 1 or payload.count > 200:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Number of seats must be between 1 and 200.")

    # Find existing desks in this zone/tenant to continue numbering
    existing_res = await db.execute(
        select(Desk).where(Desk.tenant_id == current_user.tenant_id)
    )
    all_tenant_desks = existing_res.scalars().all()
    existing_numbers = {d.desk_number for d in all_tenant_desks}

    zone_desks = [d for d in all_tenant_desks if d.zone.lower() == zone_name.lower()]

    # Extract max number suffix
    prefix = _extract_floor_prefix(zone_name, 0)
    max_num = 0
    for d in zone_desks:
        m = re.search(r'(\d+)$', d.desk_number)
        if m:
            num = int(m.group(1))
            if num > max_num:
                max_num = num

    new_desks: List[Desk] = []
    current_num = max_num
    for _ in range(payload.count):
        current_num += 1
        desk_num = f"{prefix}-{current_num:02d}"
        
        # In case of collision across zones, increment until free
        while desk_num in existing_numbers:
            current_num += 1
            desk_num = f"{prefix}-{current_num:02d}"

        row_num = ((current_num - 1) // 6) + 1
        col_num = ((current_num - 1) % 6) + 1

        desk = Desk(
            tenant_id=current_user.tenant_id,
            desk_number=desk_num,
            zone=zone_name,
            row=row_num,
            column=col_num,
            category=payload.category.lower() if payload.category else "general",
            is_active=True,
            notes=payload.notes
        )
        db.add(desk)
        new_desks.append(desk)
        existing_numbers.add(desk_num)

    await db.commit()
    return [DeskResponse.model_validate(d) for d in new_desks]


# ─────────────────────────────────────────────
# 6. Zone Summaries & Management (Declared before /{desk_id})
# ─────────────────────────────────────────────
@router.get("/zones", response_model=List[ZoneSummary])
async def list_zones(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    today = date.today()
    
    # Query all desks for tenant
    desk_res = await db.execute(
        select(Desk).where(Desk.tenant_id == current_user.tenant_id)
    )
    desks = desk_res.scalars().all()

    # Query active allocations
    alloc_res = await db.execute(
        select(SeatAllocation.desk_id).where(
            SeatAllocation.tenant_id == current_user.tenant_id,
            SeatAllocation.status == "active",
            SeatAllocation.start_date <= today,
            SeatAllocation.end_date >= today
        )
    )
    occupied_desk_ids = set(alloc_res.scalars().all())

    zone_map: Dict[str, Dict[str, int]] = {}
    for d in desks:
        z = d.zone or "Main Hall"
        if z not in zone_map:
            zone_map[z] = {"total": 0, "active": 0, "occupied": 0}
        zone_map[z]["total"] += 1
        if d.is_active:
            zone_map[z]["active"] += 1
        if d.id in occupied_desk_ids:
            zone_map[z]["occupied"] += 1

    return [
        ZoneSummary(
            name=name,
            total_seats=data["total"],
            active_seats=data["active"],
            occupied_seats=data["occupied"]
        )
        for name, data in sorted(zone_map.items())
    ]


@router.put("/zones/rename")
async def rename_zone(
    payload: ZoneRenameRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    old_name = payload.old_name.strip()
    new_name = payload.new_name.strip()
    if not old_name or not new_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Both old and new zone names are required.")

    res = await db.execute(
        select(Desk).where(Desk.tenant_id == current_user.tenant_id, Desk.zone == old_name)
    )
    desks = res.scalars().all()
    if not desks:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Zone '{old_name}' has no seats.")

    for d in desks:
        d.zone = new_name

    await db.commit()
    return {"success": True, "message": f"Renamed zone from '{old_name}' to '{new_name}' across {len(desks)} seat(s)."}


@router.delete("/zones")
async def delete_zone(
    name: str = Query(..., description="Zone name to delete"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    clean_name = name.strip()
    res = await db.execute(
        select(Desk).where(Desk.tenant_id == current_user.tenant_id, Desk.zone == clean_name)
    )
    desks = res.scalars().all()
    if not desks:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Zone '{clean_name}' has no seats.")

    desk_ids = [d.id for d in desks]
    today = date.today()
    alloc_res = await db.execute(
        select(Allocation)
        .options(selectinload(Allocation.student), selectinload(Allocation.desk))
        .where(
            Allocation.tenant_id == current_user.tenant_id,
            Allocation.seat_id.in_(desk_ids),
            Allocation.status.in_(["active", "overdue"]),
            Allocation.end_date >= today
        )
    )
    conflict_allocs = alloc_res.scalars().all()
    if conflict_allocs:
        conflict_seats = ", ".join(f"'{a.desk.desk_number if a.desk else 'Desk'}' ({a.student.full_name if a.student else 'Student'})" for a in conflict_allocs[:3])
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete zone '{clean_name}'. It contains occupied seat(s): {conflict_seats}. Please vacate or reassign these seats first."
        )

    for d in desks:
        await db.delete(d)

    await db.commit()
    return {"success": True, "message": f"Deleted zone '{clean_name}' and all {len(desks)} seat(s)."}


# ─────────────────────────────────────────────
# 7. Update Single Desk
# ─────────────────────────────────────────────
@router.put("/{desk_id}", response_model=DeskResponse)
async def update_desk(
    desk_id: str,
    data: DeskUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(
        select(Desk).where(Desk.id == desk_id, Desk.tenant_id == current_user.tenant_id)
    )
    desk = res.scalar_one_or_none()
    if not desk:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Desk not found.")

    if data.desk_number is not None:
        clean_num = data.desk_number.strip()
        if not clean_num:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Seat number cannot be empty.")
        if clean_num != desk.desk_number:
            dup_res = await db.execute(
                select(Desk).where(
                    Desk.tenant_id == current_user.tenant_id,
                    Desk.desk_number == clean_num,
                    Desk.id != desk_id
                )
            )
            if dup_res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Seat with number '{clean_num}' already exists in your library."
                )
            desk.desk_number = clean_num

    if data.zone is not None:
        desk.zone = data.zone.strip()
    if data.category is not None:
        desk.category = data.category.lower()
    if data.is_active is not None:
        desk.is_active = data.is_active
    if data.row is not None:
        desk.row = data.row
    if data.column is not None:
        desk.column = data.column
    if data.notes is not None:
        desk.notes = data.notes

    await db.commit()
    await db.refresh(desk)
    return DeskResponse.model_validate(desk)


# ─────────────────────────────────────────────
# 8. Delete Desk (with Safety Rule against Active Allocations)
# ─────────────────────────────────────────────
@router.delete("/{desk_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_desk(
    desk_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # 1. Fetch desk
    res = await db.execute(
        select(Desk).where(Desk.id == desk_id, Desk.tenant_id == current_user.tenant_id)
    )
    desk = res.scalar_one_or_none()
    if not desk:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Desk not found.")

    # 2. Check for active or future allocations
    today = date.today()
    alloc_res = await db.execute(
        select(Allocation)
        .options(selectinload(Allocation.student))
        .where(
            Allocation.tenant_id == current_user.tenant_id,
            Allocation.seat_id == desk_id,
            Allocation.status.in_(["active", "overdue"]),
            Allocation.end_date >= today
        )
    )
    active_alloc = alloc_res.scalars().first()

    if active_alloc:
        occupant_name = active_alloc.student.full_name if active_alloc.student else "Student"
        occupant_phone = f" ({active_alloc.student.phone})" if active_alloc.student and active_alloc.student.phone else ""
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete seat {desk.desk_number}. It is currently assigned to {occupant_name}{occupant_phone} until {active_alloc.end_date}. Please vacate the seat or deactivate it instead."
        )

    await db.delete(desk)
    await db.commit()


