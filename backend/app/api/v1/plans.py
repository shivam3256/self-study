from typing import List, Tuple
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.tenant import User
from app.models.plan import Plan, PlanShift
from app.models.shift import Shift
from app.schemas.plan import PlanCreate, PlanUpdate, PlanResponse
from app.schemas.shift import ShiftResponse

router = APIRouter(prefix="/plans", tags=["Plans"])

def check_shifts_time_overlap(shifts: List[Shift]):
    """
    Validates whether any pair of building-block shifts overlap in time.
    Shifts format: "HH:MM" e.g. "06:00", "14:00"
    """
    for i in range(len(shifts)):
        for j in range(i + 1, len(shifts)):
            s1, s2 = shifts[i], shifts[j]
            # Convert HH:MM to minutes
            def to_mins(t_str: str) -> int:
                parts = (t_str or "00:00").split(":")
                return int(parts[0]) * 60 + int(parts[1]) if len(parts) >= 2 else 0

            start1, end1 = to_mins(s1.start_time), to_mins(s1.end_time)
            start2, end2 = to_mins(s2.start_time), to_mins(s2.end_time)

            if end1 <= start1:
                end1 += 24 * 60
            if end2 <= start2:
                end2 += 24 * 60

            # Overlap check
            if max(start1, start2) < min(end1, end2):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Included shifts '{s1.name}' ({s1.start_time}-{s1.end_time}) and "
                        f"'{s2.name}' ({s2.start_time}-{s2.end_time}) overlap in operating hours. "
                        "Building block shifts must be non-overlapping."
                    )
                )

def build_plan_response(p: Plan) -> PlanResponse:
    resp = PlanResponse.model_validate(p)
    shifts = []
    shift_ids = []
    if p.plan_shifts:
        for ps in p.plan_shifts:
            shift_ids.append(ps.shift_id)
            if ps.shift:
                shifts.append(ShiftResponse.model_validate(ps.shift))
    resp.shift_ids = shift_ids
    resp.shifts = shifts
    return resp

@router.get("", response_model=List[PlanResponse])
async def list_plans(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(Plan)
        .options(selectinload(Plan.plan_shifts).selectinload(PlanShift.shift))
        .where(Plan.tenant_id == current_user.tenant_id)
        .order_by(Plan.price.asc())
    )
    res = await db.execute(query)
    plans = res.scalars().all()
    return [build_plan_response(p) for p in plans]

@router.post("", response_model=PlanResponse, status_code=status.HTTP_201_CREATED)
async def create_plan(
    data: PlanCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not data.shift_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one operating shift is required for a membership plan."
        )

    # Validate shifts belong to tenant
    sh_res = await db.execute(
        select(Shift).where(
            Shift.id.in_(data.shift_ids),
            Shift.tenant_id == current_user.tenant_id,
            Shift.is_active == True
        )
    )
    shifts = list(sh_res.scalars().all())
    if len(shifts) != len(set(data.shift_ids)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="One or more selected shifts are invalid or inactive.")

    # Validate non-overlapping building blocks
    check_shifts_time_overlap(shifts)

    plan = Plan(
        tenant_id=current_user.tenant_id,
        name=data.name,
        code=data.code.upper(),
        duration_days=data.duration_days,
        duration_months=data.duration_months,
        price=data.price,
        shift_type=data.shift_type,
        description=data.description,
        zone_id=data.zone_id,
        is_active=data.is_active
    )
    db.add(plan)
    await db.flush()

    for sh in shifts:
        ps = PlanShift(
            tenant_id=current_user.tenant_id,
            plan_id=plan.id,
            shift_id=sh.id
        )
        db.add(ps)

    await db.commit()

    # Reload
    reloaded = await db.execute(
        select(Plan)
        .options(selectinload(Plan.plan_shifts).selectinload(PlanShift.shift))
        .where(Plan.id == plan.id)
    )
    plan_obj = reloaded.scalar_one()
    return build_plan_response(plan_obj)

@router.put("/{plan_id}", response_model=PlanResponse)
async def update_plan(
    plan_id: str,
    data: PlanUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(Plan)
        .options(selectinload(Plan.plan_shifts).selectinload(PlanShift.shift))
        .where(Plan.id == plan_id, Plan.tenant_id == current_user.tenant_id)
    )
    res = await db.execute(query)
    plan = res.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found.")

    update_dict = data.model_dump(exclude_unset=True)
    shift_ids = update_dict.pop("shift_ids", None)

    for field, value in update_dict.items():
        if field == "code" and value:
            setattr(plan, field, value.upper())
        else:
            setattr(plan, field, value)

    if shift_ids is not None:
        if not shift_ids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one operating shift is required.")
        sh_res = await db.execute(
            select(Shift).where(
                Shift.id.in_(shift_ids),
                Shift.tenant_id == current_user.tenant_id,
                Shift.is_active == True
            )
        )
        shifts = list(sh_res.scalars().all())
        if len(shifts) != len(set(shift_ids)):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="One or more selected shifts are invalid.")
        check_shifts_time_overlap(shifts)

        # Clear existing plan_shifts
        plan.plan_shifts.clear()
        for sh in shifts:
            plan.plan_shifts.append(
                PlanShift(tenant_id=current_user.tenant_id, plan_id=plan.id, shift_id=sh.id)
            )

    await db.commit()

    reloaded = await db.execute(
        select(Plan)
        .options(selectinload(Plan.plan_shifts).selectinload(PlanShift.shift))
        .where(Plan.id == plan.id)
    )
    plan_obj = reloaded.scalar_one()
    return build_plan_response(plan_obj)

@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_plan(
    plan_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Plan).where(Plan.id == plan_id, Plan.tenant_id == current_user.tenant_id)
    res = await db.execute(query)
    plan = res.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found.")

    await db.delete(plan)
    await db.commit()
