from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.tenant import User
from app.models.shift import Shift
from app.schemas.shift import ShiftCreate, ShiftUpdate, ShiftResponse

router = APIRouter(prefix="/shifts", tags=["Shifts"])

@router.get("", response_model=List[ShiftResponse])
async def list_shifts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Shift).where(Shift.tenant_id == current_user.tenant_id).order_by(Shift.start_time.asc())
    res = await db.execute(query)
    shifts = res.scalars().all()
    return [ShiftResponse.model_validate(s) for s in shifts]

@router.post("", response_model=ShiftResponse, status_code=status.HTTP_201_CREATED)
async def create_shift(
    data: ShiftCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    shift = Shift(
        tenant_id=current_user.tenant_id,
        name=data.name,
        code=data.code.upper(),
        start_time=data.start_time,
        end_time=data.end_time,
        capacity=data.capacity,
        is_active=data.is_active
    )
    db.add(shift)
    await db.commit()
    await db.refresh(shift)
    return ShiftResponse.model_validate(shift)

@router.put("/{shift_id}", response_model=ShiftResponse)
async def update_shift(
    shift_id: str,
    data: ShiftUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Shift).where(Shift.id == shift_id, Shift.tenant_id == current_user.tenant_id)
    res = await db.execute(query)
    shift = res.scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shift not found.")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(shift, field, value)

    await db.commit()
    await db.refresh(shift)
    return ShiftResponse.model_validate(shift)
