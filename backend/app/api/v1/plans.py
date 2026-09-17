from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.tenant import User
from app.models.plan import Plan
from app.schemas.plan import PlanCreate, PlanUpdate, PlanResponse

router = APIRouter(prefix="/plans", tags=["Plans"])

@router.get("", response_model=List[PlanResponse])
async def list_plans(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Plan).where(Plan.tenant_id == current_user.tenant_id).order_by(Plan.price.asc())
    res = await db.execute(query)
    plans = res.scalars().all()
    return [PlanResponse.model_validate(p) for p in plans]

@router.post("", response_model=PlanResponse, status_code=status.HTTP_201_CREATED)
async def create_plan(
    data: PlanCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    plan = Plan(
        tenant_id=current_user.tenant_id,
        name=data.name,
        code=data.code.upper(),
        duration_days=data.duration_days,
        duration_months=data.duration_months,
        price=data.price,
        shift_type=data.shift_type,
        description=data.description,
        is_active=data.is_active
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return PlanResponse.model_validate(plan)

@router.put("/{plan_id}", response_model=PlanResponse)
async def update_plan(
    plan_id: str,
    data: PlanUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Plan).where(Plan.id == plan_id, Plan.tenant_id == current_user.tenant_id)
    res = await db.execute(query)
    plan = res.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found.")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(plan, field, value)

    await db.commit()
    await db.refresh(plan)
    return PlanResponse.model_validate(plan)

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

