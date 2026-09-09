import secrets
from datetime import date, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.tenant import User
from app.models.student import Student
from app.models.allocation import SeatAllocation
from app.models.desk import Desk
from app.models.shift import Shift
from app.schemas.student import StudentCreate, StudentUpdate, StudentResponse

router = APIRouter(prefix="/students", tags=["Students"])

@router.get("", response_model=List[StudentResponse])
async def list_students(
    search: Optional[str] = Query(None, description="Search by name, phone, admission number"),
    status: Optional[str] = Query(None, description="Filter by status: active, paused, expired, suspended"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(Student)
        .options(
            selectinload(Student.allocations).selectinload(SeatAllocation.desk),
            selectinload(Student.allocations).selectinload(SeatAllocation.shift)
        )
        .where(Student.tenant_id == current_user.tenant_id)
    )

    if status:
        query = query.where(Student.status == status)

    if search:
        search_pattern = f"%{search.strip()}%"
        query = query.where(
            or_(
                Student.full_name.ilike(search_pattern),
                Student.phone.ilike(search_pattern),
                Student.admission_number.ilike(search_pattern)
            )
        )

    query = query.order_by(Student.created_at.desc()).offset(skip).limit(limit)
    res = await db.execute(query)
    students = res.scalars().all()

    output = []
    for s in students:
        resp = StudentResponse.model_validate(s)
        # Find active allocation
        active_alloc = next((a for a in s.allocations if a.status == "active"), None)
        if active_alloc:
            if active_alloc.desk:
                resp.current_desk_number = active_alloc.desk.desk_number
            if active_alloc.shift:
                resp.current_shift_name = active_alloc.shift.name
        output.append(resp)

    return output

@router.post("", response_model=StudentResponse, status_code=status.HTTP_201_CREATED)
async def create_student(
    data: StudentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Auto-generate admission number if not given
    admission_number = data.admission_number
    if not admission_number:
        count_query = select(func.count(Student.id)).where(Student.tenant_id == current_user.tenant_id)
        count_res = await db.execute(count_query)
        total = count_res.scalar_one() or 0
        admission_number = f"STU-{(total + 101):04d}"

    # Generate unique QR code token for student
    qr_token = secrets.token_urlsafe(16)

    student = Student(
        tenant_id=current_user.tenant_id,
        admission_number=admission_number,
        full_name=data.full_name,
        phone=data.phone,
        email=str(data.email) if data.email else None,
        photo_url=data.photo_url,
        id_proof_type=data.id_proof_type,
        id_proof_number=data.id_proof_number,
        address=data.address,
        emergency_contact_name=data.emergency_contact_name,
        emergency_contact_phone=data.emergency_contact_phone,
        join_date=data.join_date or date.today(),
        expiry_date=data.expiry_date,
        qr_code_token=qr_token,
        notes=data.notes,
        status="active"
    )
    db.add(student)
    await db.commit()
    await db.refresh(student)
    return StudentResponse.model_validate(student)

@router.get("/{student_id}", response_model=StudentResponse)
async def get_student(
    student_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(Student)
        .options(
            selectinload(Student.allocations).selectinload(SeatAllocation.desk),
            selectinload(Student.allocations).selectinload(SeatAllocation.shift)
        )
        .where(Student.id == student_id, Student.tenant_id == current_user.tenant_id)
    )
    res = await db.execute(query)
    student = res.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

    resp = StudentResponse.model_validate(student)
    active_alloc = next((a for a in student.allocations if a.status == "active"), None)
    if active_alloc:
        if active_alloc.desk:
            resp.current_desk_number = active_alloc.desk.desk_number
        if active_alloc.shift:
            resp.current_shift_name = active_alloc.shift.name
    return resp

@router.put("/{student_id}", response_model=StudentResponse)
async def update_student(
    student_id: str,
    data: StudentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Student).where(Student.id == student_id, Student.tenant_id == current_user.tenant_id)
    res = await db.execute(query)
    student = res.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

    update_dict = data.model_dump(exclude_unset=True)
    if "email" in update_dict and update_dict["email"] is not None:
        update_dict["email"] = str(update_dict["email"])

    for field, value in update_dict.items():
        setattr(student, field, value)

    await db.commit()
    await db.refresh(student)
    return StudentResponse.model_validate(student)

@router.post("/{student_id}/pause", response_model=StudentResponse)
async def pause_membership(
    student_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Student).where(Student.id == student_id, Student.tenant_id == current_user.tenant_id)
    res = await db.execute(query)
    student = res.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

    if student.status == "paused":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Membership is already paused.")

    student.status = "paused"
    student.paused_at = date.today()
    await db.commit()
    await db.refresh(student)
    return StudentResponse.model_validate(student)

@router.post("/{student_id}/resume", response_model=StudentResponse)
async def resume_membership(
    student_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Student).where(Student.id == student_id, Student.tenant_id == current_user.tenant_id)
    res = await db.execute(query)
    student = res.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

    if student.status != "paused":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Student is not currently paused.")

    # Extend expiry date by the duration paused
    if student.paused_at and student.expiry_date:
        days_paused = (date.today() - student.paused_at).days
        if days_paused > 0:
            student.expiry_date = student.expiry_date + timedelta(days=days_paused)

    student.status = "active"
    student.paused_at = None
    await db.commit()
    await db.refresh(student)
    return StudentResponse.model_validate(student)

@router.delete("/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_student(
    student_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Student).where(Student.id == student_id, Student.tenant_id == current_user.tenant_id)
    res = await db.execute(query)
    student = res.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

    await db.delete(student)
    await db.commit()
    return None
