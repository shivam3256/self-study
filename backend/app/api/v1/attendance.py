from datetime import date, datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.core.database import get_db, get_utc_now
from app.core.deps import get_current_user
from app.models.tenant import User
from app.models.student import Student
from app.models.attendance import Attendance
from app.models.allocation import SeatAllocation
from app.schemas.attendance import CheckInRequest, AttendanceResponse

router = APIRouter(prefix="/attendance", tags=["Attendance & QR Check-in"])

@router.get("/today", response_model=List[AttendanceResponse])
async def get_today_attendance(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    today = date.today()
    query = (
        select(Attendance)
        .options(
            selectinload(Attendance.student).selectinload(Student.allocations).selectinload(SeatAllocation.desk)
        )
        .where(
            Attendance.tenant_id == current_user.tenant_id,
            Attendance.date == today
        )
        .order_by(Attendance.check_in_time.desc())
    )
    res = await db.execute(query)
    records = res.scalars().all()

    output = []
    for r in records:
        resp = AttendanceResponse.model_validate(r)
        if r.student:
            resp.student_name = r.student.full_name
            resp.student_phone = r.student.phone
            active_alloc = next((a for a in r.student.allocations if a.status == "active"), None)
            if active_alloc and active_alloc.desk:
                resp.desk_number = active_alloc.desk.desk_number
        output.append(resp)
    return output

@router.post("/check-in", response_model=AttendanceResponse)
async def check_in(
    data: CheckInRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    student = None
    if data.qr_code_token:
        res = await db.execute(
            select(Student).where(
                Student.qr_code_token == data.qr_code_token,
                Student.tenant_id == current_user.tenant_id
            )
        )
        student = res.scalar_one_or_none()
    elif data.student_id:
        res = await db.execute(
            select(Student).where(
                Student.id == data.student_id,
                Student.tenant_id == current_user.tenant_id
            )
        )
        student = res.scalar_one_or_none()

    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not recognized.")

    if student.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Student account is currently {student.status}. Please resolve status first."
        )

    today = date.today()
    # Check if student already checked in today without check-out
    existing_check = await db.execute(
        select(Attendance).where(
            Attendance.tenant_id == current_user.tenant_id,
            Attendance.student_id == student.id,
            Attendance.date == today,
            Attendance.check_out_time == None
        )
    )
    existing = existing_check.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{student.full_name} is already checked in since {existing.check_in_time.strftime('%I:%M %p')}."
        )

    attendance = Attendance(
        tenant_id=current_user.tenant_id,
        student_id=student.id,
        date=today,
        check_in_time=get_utc_now(),
        method=data.method
    )
    db.add(attendance)
    await db.commit()
    await db.refresh(attendance)

    resp = AttendanceResponse.model_validate(attendance)
    resp.student_name = student.full_name
    resp.student_phone = student.phone
    return resp

@router.post("/check-out/{attendance_id}", response_model=AttendanceResponse)
async def check_out(
    attendance_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(Attendance)
        .options(selectinload(Attendance.student))
        .where(
            Attendance.id == attendance_id,
            Attendance.tenant_id == current_user.tenant_id
        )
    )
    res = await db.execute(query)
    attendance = res.scalar_one_or_none()
    if not attendance:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attendance record not found.")

    if attendance.check_out_time:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already checked out.")

    attendance.check_out_time = get_utc_now()
    await db.commit()
    await db.refresh(attendance)

    resp = AttendanceResponse.model_validate(attendance)
    if attendance.student:
        resp.student_name = attendance.student.full_name
        resp.student_phone = attendance.student.phone
    return resp
