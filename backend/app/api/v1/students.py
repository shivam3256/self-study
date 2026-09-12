from datetime import date, timedelta
import csv
import io
import secrets
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.tenant import User
from app.models.student import Student
from app.models.allocation import SeatAllocation
from app.schemas.student import StudentCreate, StudentUpdate, StudentResponse

router = APIRouter(prefix="/students", tags=["Students"])


# ─────────────────────────────────────────────
# CRUD: List students
# ─────────────────────────────────────────────
@router.get("", response_model=List[StudentResponse])
async def list_students(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Student)
        .options(selectinload(Student.allocations).selectinload(SeatAllocation.desk),
                 selectinload(Student.allocations).selectinload(SeatAllocation.shift))
        .where(Student.tenant_id == current_user.tenant_id)
    )
    if search:
        pattern = f"%{search}%"
        from sqlalchemy import or_
        query = query.where(
            or_(
                Student.full_name.ilike(pattern),
                Student.phone.ilike(pattern),
                Student.admission_number.ilike(pattern),
            )
        )
    if status and status != "all":
        query = query.where(Student.status == status)

    query = query.order_by(Student.created_at.desc()).offset(skip).limit(limit)
    res = await db.execute(query)
    students = res.scalars().all()

    output = []
    for s in students:
        resp = StudentResponse.model_validate(s)
        # Attach active allocation info
        active_alloc = next(
            (a for a in s.allocations if a.status == "active"), None
        )
        if active_alloc:
            resp.current_desk_number = active_alloc.desk.desk_number if active_alloc.desk else None
            resp.current_shift_name = active_alloc.shift.name if active_alloc.shift else None
        output.append(resp)
    return output


# ─────────────────────────────────────────────
# CRUD: Create student
# ─────────────────────────────────────────────
@router.post("", response_model=StudentResponse, status_code=201)
async def create_student(
    data: StudentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    adm_no = data.admission_number or f"ADM-{secrets.token_hex(4).upper()}"
    student = Student(
        tenant_id=current_user.tenant_id,
        admission_number=adm_no,
        full_name=data.full_name,
        phone=data.phone,
        email=data.email,
        id_proof_type=data.id_proof_type or "Aadhaar",
        id_proof_number=data.id_proof_number,
        address=data.address,
        emergency_contact_name=data.emergency_contact_name,
        emergency_contact_phone=data.emergency_contact_phone,
        join_date=data.join_date or date.today(),
        expiry_date=data.expiry_date,
        notes=data.notes,
        status="active",
        qr_code_token=secrets.token_urlsafe(16),
    )
    db.add(student)
    await db.commit()
    await db.refresh(student)
    resp = StudentResponse.model_validate(student)
    return resp


# ─────────────────────────────────────────────
# CRUD: Get single student
# ─────────────────────────────────────────────
@router.get("/{student_id}", response_model=StudentResponse)
async def get_student(
    student_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Student)
        .options(selectinload(Student.allocations).selectinload(SeatAllocation.desk),
                 selectinload(Student.allocations).selectinload(SeatAllocation.shift))
        .where(Student.id == student_id, Student.tenant_id == current_user.tenant_id)
    )
    res = await db.execute(query)
    student = res.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")
    resp = StudentResponse.model_validate(student)
    active_alloc = next((a for a in student.allocations if a.status == "active"), None)
    if active_alloc:
        resp.current_desk_number = active_alloc.desk.desk_number if active_alloc.desk else None
        resp.current_shift_name = active_alloc.shift.name if active_alloc.shift else None
    return resp


# ─────────────────────────────────────────────
# CRUD: Update student
# ─────────────────────────────────────────────
@router.put("/{student_id}", response_model=StudentResponse)
async def update_student(
    student_id: str,
    data: StudentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Student).where(Student.id == student_id, Student.tenant_id == current_user.tenant_id)
    res = await db.execute(query)
    student = res.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(student, field, value)

    await db.commit()
    await db.refresh(student)
    return StudentResponse.model_validate(student)


# ─────────────────────────────────────────────
# CRUD: Delete student
# ─────────────────────────────────────────────
@router.delete("/{student_id}", status_code=204)
async def delete_student(
    student_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Student).where(Student.id == student_id, Student.tenant_id == current_user.tenant_id)
    res = await db.execute(query)
    student = res.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")
    await db.delete(student)
    await db.commit()


# ─────────────────────────────────────────────
# Pause membership
# ─────────────────────────────────────────────
@router.post("/{student_id}/pause")
async def pause_student(
    student_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Student).where(Student.id == student_id, Student.tenant_id == current_user.tenant_id)
    res = await db.execute(query)
    student = res.scalar_one_or_none()

    if not student or student.status != "active":
        raise HTTPException(status_code=400, detail="Only active students can be paused")

    student.status = "paused"
    student.paused_at = date.today()
    await db.commit()
    return {"status": "paused"}


# ─────────────────────────────────────────────
# Resume membership
# ─────────────────────────────────────────────
@router.post("/{student_id}/resume")
async def resume_student(
    student_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Student).where(Student.id == student_id, Student.tenant_id == current_user.tenant_id)
    res = await db.execute(query)
    student = res.scalar_one_or_none()

    if not student or student.status != "paused":
        raise HTTPException(status_code=400, detail="Student is not in paused state")

    # Extend expiry date by the number of days paused
    days_paused = (date.today() - student.paused_at).days
    if days_paused > 0 and student.expiry_date:
        student.expiry_date = student.expiry_date + timedelta(days=days_paused)

    student.status = "active"
    student.paused_at = None
    await db.commit()
    return {"status": "resumed", "new_expiry": student.expiry_date}


# ─────────────────────────────────────────────
# CSV Import Template
# ─────────────────────────────────────────────
@router.get("/import-template")
async def get_import_template():
    """Download a CSV template for bulk student import."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "admission_number", "full_name", "phone", "email",
        "id_proof_type", "id_proof_number", "address",
        "emergency_contact_name", "emergency_contact_phone", "notes"
    ])
    writer.writerow([
        "ADM-1001", "John Doe", "9876543210", "john@example.com",
        "Aadhaar", "1234-5678-9012", "123 MG Road, Delhi",
        "Jane Doe", "9876543211", "UPSC Aspirant"
    ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=student_import_template.csv"}
    )


# ─────────────────────────────────────────────
# Bulk Import
# ─────────────────────────────────────────────
@router.post("/bulk-import")
async def bulk_import_students(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Bulk import students from a CSV or Excel file."""
    filename = file.filename.lower()
    is_csv = filename.endswith('.csv')
    is_excel = filename.endswith('.xlsx') or filename.endswith('.xls')

    if not (is_csv or is_excel):
        raise HTTPException(status_code=400, detail="Invalid file format. Please upload a CSV or Excel file.")

    content = await file.read()
    rows = []

    if is_csv:
        try:
            decoded_content = content.decode("utf-8")
            stream = io.StringIO(decoded_content)
            reader = csv.DictReader(stream)
            rows = list(reader)
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="Invalid file encoding. Use UTF-8.")
    elif is_excel:
        try:
            import pandas as pd
            df = pd.read_excel(io.BytesIO(content), dtype=str)
            df = df.where(pd.notnull(df), None)
            rows = df.to_dict('records')
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error reading Excel file: {str(e)}")

    imported_count = 0
    skipped_count = 0

    for row in rows:
        full_name = row.get("full_name")
        phone = row.get("phone")

        if not full_name or not phone:
            skipped_count += 1
            continue

        adm_no = row.get("admission_number") or f"ADM-{secrets.token_hex(4).upper()}"

        student = Student(
            tenant_id=current_user.tenant_id,
            admission_number=str(adm_no),
            full_name=str(full_name),
            phone=str(phone),
            email=row.get("email"),
            id_proof_type=row.get("id_proof_type", "Aadhaar"),
            id_proof_number=row.get("id_proof_number"),
            address=row.get("address"),
            emergency_contact_name=row.get("emergency_contact_name"),
            emergency_contact_phone=row.get("emergency_contact_phone"),
            notes=row.get("notes"),
            status="active",
            join_date=date.today(),
            qr_code_token=secrets.token_urlsafe(16)
        )
        db.add(student)
        imported_count += 1

    # Commit all imported students to the database
    await db.commit()

    return {"status": "success", "imported": imported_count, "skipped": skipped_count}