from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_current_tenant
from app.models.tenant import User, Tenant
from app.schemas.locker import (
    LockerCreate,
    LockerBulkCreate,
    LockerUpdate,
    LockerAssignRequest,
    LockerReleaseRequest,
    LockerChangeStudentRequest,
    LockerRenewRequest,
    LockerResponse,
    LockerAssignmentResponse,
    LockerMapSummary,
    CombinedPaymentRequest,
)
from app.schemas.payment import ReceiptDetailResponse
from app.services.locker_service import LockerService

router = APIRouter(prefix="/lockers", tags=["Locker Management"])

@router.get("", response_model=LockerMapSummary)
@router.get("/map", response_model=LockerMapSummary)
async def get_lockers_map(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve full locker map for the tenant with computed occupancy/overdue status."""
    return await LockerService.get_locker_map(db, current_user.tenant_id)

@router.get("/{locker_id}", response_model=LockerResponse)
async def get_single_locker(
    locker_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get single locker details."""
    return await LockerService.get_locker(db, current_user.tenant_id, locker_id)

@router.post("", response_model=LockerResponse, status_code=status.HTTP_201_CREATED)
async def create_single_locker(
    data: LockerCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a single locker."""
    return await LockerService.create_locker(db, current_user.tenant_id, data)

@router.post("/bulk", status_code=status.HTTP_201_CREATED)
async def bulk_create_lockers(
    data: LockerBulkCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create multiple lockers in batch with sequential numbering."""
    return await LockerService.bulk_create_lockers(db, current_user.tenant_id, data)

@router.get("/students/{student_id}/active", response_model=Optional[LockerAssignmentResponse])
@router.get("/student/{student_id}/active", response_model=Optional[LockerAssignmentResponse])
async def get_student_active_locker(
    student_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get active locker assignment for a student, if any."""
    return await LockerService.get_student_active_locker(db, current_user.tenant_id, student_id)

@router.post("/combined-payment", response_model=ReceiptDetailResponse, status_code=status.HTTP_201_CREATED)
async def process_combined_payment(
    data: CombinedPaymentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Record combined Seat + Locker payment creating two distinct payment rows under one shared receipt."""
    return await LockerService.record_combined_payment(db, current_user.tenant_id, data)

@router.put("/{locker_id}", response_model=LockerResponse)
async def update_locker(
    locker_id: str,
    data: LockerUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update locker label, monthly fee, or status (e.g. mark maintenance)."""
    return await LockerService.update_locker(db, current_user.tenant_id, locker_id, data)

@router.delete("/{locker_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_locker(
    locker_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a locker. Blocked if an active assignment exists."""
    await LockerService.delete_locker(db, current_user.tenant_id, locker_id)

@router.post("/{locker_id}/assign")
async def assign_locker(
    locker_id: str,
    data: LockerAssignRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Assign locker to an active student with optional upfront fee collection."""
    return await LockerService.assign_locker(db, current_user.tenant_id, locker_id, data)

@router.post("/{locker_id}/renew")
async def renew_locker(
    locker_id: str,
    data: LockerRenewRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Renew locker subscription and extend paid_until date."""
    return await LockerService.renew_locker(db, current_user.tenant_id, locker_id, data)

@router.post("/{locker_id}/release")
async def release_locker(
    locker_id: str,
    data: LockerReleaseRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """End active locker assignment and free locker with deposit refund option."""
    return await LockerService.release_locker(db, current_user.tenant_id, locker_id, data)

@router.post("/{locker_id}/change-student")
async def change_student(
    locker_id: str,
    data: LockerChangeStudentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Transfer locker from current student to another student."""
    return await LockerService.change_student(db, current_user.tenant_id, locker_id, data)
