from datetime import datetime, date
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import List, Optional
from pydantic import BaseModel

from app.core.database import get_db, get_utc_now
from app.core.deps import get_current_user
from app.models.tenant import User
from app.models.student import Student
from app.models.attendance import Attendance

router = APIRouter(prefix="/attendance", tags=["Attendance"])

class CheckInRequest(BaseModel):
    student_id: Optional[str] = None
    method: str = "qr"

@router.post("/check-in/{qr_token}")
async def student_check_in(
    qr_token: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # 1. Find student by QR token within this tenant
    query = select(Student).where(
        Student.tenant_id == current_user.tenant_id,
        Student.qr_code_token == qr_token
    )
    res = await db.execute(query)
    student = res.scalar_one_or_none()

    if not student:
        raise HTTPException(status_code=404, detail="Student not found or invalid token")
    
    if student.status != "active":
        raise HTTPException(status_code=403, detail=f"Student membership is {student.status}")

    # 2. Check if already checked in today
    today = date.today()
    existing_query = select(Attendance).where(
        Attendance.tenant_id == current_user.tenant_id,
        Attendance.student_id == student.id,
        Attendance.date == today,
        Attendance.check_out_time == None
    )
    existing_res = await db.execute(existing_query)
    if existing_res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Student already checked in")

    # 3. Create record
    attendance = Attendance(
        tenant_id=current_user.tenant_id,
        student_id=student.id,
        date=today,
        check_in_time=get_utc_now(),
        method="qr"
    )
    db.add(attendance)
    await db.commit()
    return {"status": "success", "student_name": student.full_name}

@router.post("/check-in")
async def manual_check_in(
    payload: CheckInRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not payload.student_id:
        raise HTTPException(status_code=400, detail="Student ID required for manual check-in")
    
    res = await db.execute(select(Student).where(
        Student.id == payload.student_id, 
        Student.tenant_id == current_user.tenant_id
    ))
    student = res.scalar_one_or_none()
    
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    today = date.today()
    existing = await db.execute(select(Attendance).where(
        Attendance.student_id == student.id,
        Attendance.date == today,
        Attendance.check_out_time == None
    ))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Student already checked in")

    attendance = Attendance(
        tenant_id=current_user.tenant_id,
        student_id=student.id,
        date=today,
        check_in_time=get_utc_now(),
        method=payload.method
    )
    db.add(attendance)
    await db.commit()
    return {"status": "success", "student_name": student.full_name}

@router.post("/check-out/{student_id}")
async def student_check_out(
    student_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Attendance).where(
        Attendance.tenant_id == current_user.tenant_id,
        Attendance.student_id == student_id,
        Attendance.check_out_time == None
    ).order_by(Attendance.check_in_time.desc())
    
    res = await db.execute(query)
    attendance = res.scalar_one_or_none()
    
    if not attendance:
        raise HTTPException(status_code=404, detail="No active check-in session found")
    
    attendance.check_out_time = get_utc_now()
    await db.commit()
    return {"status": "success"}