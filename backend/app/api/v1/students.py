from datetime import date, timedelta
import csv
import io
import re
import secrets
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_, func
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.tenant import User
from app.models.student import Student
from app.models.attendance import Attendance
from app.models.allocation import Allocation, AllocationShift, SeatAllocation
from app.schemas.student import StudentCreate, StudentUpdate, StudentResponse, StudentSearchResult
from app.services.notification_service import get_kolkata_today
from app.schemas.import_student import (
    ImportValidationSummary,
    ImportConfirmRequest,
    ImportResultSummary,
)
from app.services.excel_import_service import ExcelImportService
from app.services.student_service import (
    generate_next_admission_number,
    get_next_admission_sequence_start,
)

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
        .options(
            selectinload(Student.allocations).selectinload(Allocation.desk),
            selectinload(Student.allocations).selectinload(Allocation.allocation_shifts).selectinload(AllocationShift.shift)
        )
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
        # Attach active or overdue allocation info
        active_alloc = next(
            (a for a in s.allocations if a.status in ("active", "overdue")), None
        )
        if active_alloc:
            resp.current_allocation_id = active_alloc.id
            resp.current_desk_id = active_alloc.seat_id
            resp.current_desk_number = active_alloc.desk.desk_number if active_alloc.desk else None
            if active_alloc.allocation_shifts:
                sh_names = [ash.shift.name for ash in active_alloc.allocation_shifts if ash.shift]
                resp.current_shift_name = " / ".join(sh_names) if sh_names else None
                resp.current_shift_id = active_alloc.allocation_shifts[0].shift_id
            resp.current_desk_category = active_alloc.desk.category if active_alloc.desk else None
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
    if data.admission_number and data.admission_number.strip():
        adm_no = data.admission_number.strip()
    else:
        adm_no = await generate_next_admission_number(db, current_user.tenant_id)

    student = Student(
        tenant_id=current_user.tenant_id,
        admission_number=adm_no,
        full_name=data.full_name,
        gender=data.gender,
        phone=data.phone,
        email=data.email,
        id_proof_type=data.id_proof_type or "Aadhaar",
        id_proof_number=data.id_proof_number,
        address=data.address,
        emergency_contact_name=data.emergency_contact_name,
        emergency_contact_phone=data.emergency_contact_phone,
        date_of_birth=data.date_of_birth,
        join_date=data.join_date or date.today(),
        expiry_date=data.expiry_date,
        notes=data.notes,
        status="active",
        qr_code_token=secrets.token_urlsafe(16),
    )
    db.add(student)
    await db.commit()
    await db.refresh(student)
    
    # Reload with allocations
    query = (
        select(Student)
        .options(
            selectinload(Student.allocations).selectinload(Allocation.desk),
            selectinload(Student.allocations).selectinload(Allocation.allocation_shifts).selectinload(AllocationShift.shift)
        )
        .where(Student.id == student.id)
    )
    res = await db.execute(query)
    loaded_student = res.scalar_one()

    resp = StudentResponse.model_validate(loaded_student)
    active_alloc = next((a for a in loaded_student.allocations if a.status in ("active", "overdue")), None)
    if active_alloc:
        resp.current_allocation_id = active_alloc.id
        resp.current_desk_id = active_alloc.seat_id
        resp.current_desk_number = active_alloc.desk.desk_number if active_alloc.desk else None
        if active_alloc.allocation_shifts:
            sh_names = [ash.shift.name for ash in active_alloc.allocation_shifts if ash.shift]
            resp.current_shift_name = " / ".join(sh_names) if sh_names else None
            resp.current_shift_id = active_alloc.allocation_shifts[0].shift_id
        resp.current_desk_category = active_alloc.desk.category if active_alloc.desk else None
    return resp


# ─────────────────────────────────────────────
# Search students (prefix-ranked, tenant-scoped)
# ─────────────────────────────────────────────
@router.get("/search", response_model=List[StudentSearchResult])
async def search_students(
    q: str = Query("", description="Search term for student name, phone or admission number"),
    limit: int = Query(8, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Find students fast by name, phone (ignoring spaces, dashes, +91), or admission number.
    Strictly scoped to current authenticated library/tenant.
    Ranks prefix matches above substring matches.
    Returns computed currently_inside and days_overdue fields.
    """
    if not current_user.tenant_id:
        return []

    raw_q = (q or "").strip()
    if len(raw_q) < 2:
        return []

    clean_q = raw_q.lower()
    clean_adm = clean_q.replace(" ", "").replace("-", "")
    clean_db_phone = func.replace(func.replace(func.replace(Student.phone, " ", ""), "-", ""), "+91", "")
    clean_db_adm = func.replace(func.replace(Student.admission_number, " ", ""), "-", "")

    conditions = [
        Student.full_name.ilike(f"%{clean_q}%"),
        Student.admission_number.ilike(f"%{clean_q}%"),
        clean_db_adm.ilike(f"%{clean_adm}%"),
    ]

    # Phone matching: match when search term is phone-like (digits, +, spaces, dashes)
    phone_clean_input = re.sub(r"[\s\-\+\(\)]", "", raw_q)
    is_phone_query = phone_clean_input.isdigit() and len(phone_clean_input) >= 2
    phone_digits = ""
    if is_phone_query:
        phone_digits = phone_clean_input
        if phone_digits.startswith("91") and len(phone_digits) > 10:
            phone_digits = phone_digits[2:]
        conditions.append(Student.phone.ilike(f"%{phone_digits}%"))
        conditions.append(clean_db_phone.ilike(f"%{phone_digits}%"))

    query = (
        select(Student)
        .options(
            selectinload(Student.allocations).selectinload(Allocation.desk),
            selectinload(Student.allocations).selectinload(Allocation.allocation_shifts).selectinload(AllocationShift.shift),
        )
        .where(
            Student.tenant_id == current_user.tenant_id,
            or_(*conditions)
        )
    )
    res = await db.execute(query)
    all_matched = res.scalars().all()

    # Ranking: Prefix matches above substring matches
    def rank_student(s: Student):
        name_l = (s.full_name or "").lower()
        adm_l = (s.admission_number or "").lower()
        st_phone_digits = re.sub(r"[^\d]", "", s.phone or "")
        if st_phone_digits.startswith("91") and len(st_phone_digits) > 10:
            st_phone_digits = st_phone_digits[2:]

        # Prefix checks
        is_exact = (clean_q == name_l or clean_q == adm_l or (phone_digits and phone_digits == st_phone_digits))
        is_adm_pfx = adm_l.startswith(clean_q) or (clean_adm and adm_l.replace("-", "").startswith(clean_adm))
        is_name_pfx = name_l.startswith(clean_q) or any(w.startswith(clean_q) for w in name_l.split())
        is_phone_pfx = bool(phone_digits and st_phone_digits.startswith(phone_digits))

        if is_exact:
            tier = 0
        elif is_adm_pfx:
            tier = 1
        elif is_name_pfx:
            tier = 2
        elif is_phone_pfx:
            tier = 3
        else:
            tier = 4  # Substring match

        return (tier, name_l)

    sorted_students = sorted(all_matched, key=rank_student)[:limit]

    if not sorted_students:
        return []

    today = get_kolkata_today()
    student_ids = [s.id for s in sorted_students]

    # Check which students are currently inside today
    att_q = select(Attendance.student_id).where(
        Attendance.tenant_id == current_user.tenant_id,
        Attendance.student_id.in_(student_ids),
        Attendance.date == today,
        Attendance.check_out_time.is_(None)
    )
    att_res = await db.execute(att_q)
    inside_student_ids = set(att_res.scalars().all())

    output: List[StudentSearchResult] = []
    for s in sorted_students:
        active_alloc = next(
            (a for a in s.allocations if a.status in ("active", "overdue")), None
        )
        desk_label = active_alloc.desk.desk_number if (active_alloc and active_alloc.desk) else None
        shift_label = None
        if active_alloc and active_alloc.allocation_shifts:
            sh_names = [ash.shift.name for ash in active_alloc.allocation_shifts if ash.shift]
            shift_label = " / ".join(sh_names) if sh_names else None

        days_od = None
        if s.expiry_date and s.expiry_date < today:
            days_od = (today - s.expiry_date).days

        output.append(
            StudentSearchResult(
                id=s.id,
                admission_number=s.admission_number,
                full_name=s.full_name,
                phone=s.phone,
                status=s.status,
                expiry_date=s.expiry_date,
                assigned_desk=desk_label,
                assigned_shift=shift_label,
                currently_inside=(s.id in inside_student_ids),
                days_overdue=days_od
            )
        )

    return output


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
        .options(
            selectinload(Student.allocations).selectinload(Allocation.desk),
            selectinload(Student.allocations).selectinload(Allocation.allocation_shifts).selectinload(AllocationShift.shift)
        )
        .where(Student.id == student_id, Student.tenant_id == current_user.tenant_id)
    )
    res = await db.execute(query)
    student = res.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")
    resp = StudentResponse.model_validate(student)
    active_alloc = next((a for a in student.allocations if a.status in ("active", "overdue")), None)
    if active_alloc:
        resp.current_allocation_id = active_alloc.id
        resp.current_desk_id = active_alloc.seat_id
        resp.current_desk_number = active_alloc.desk.desk_number if active_alloc.desk else None
        if active_alloc.allocation_shifts:
            sh_names = [ash.shift.name for ash in active_alloc.allocation_shifts if ash.shift]
            resp.current_shift_name = " / ".join(sh_names) if sh_names else None
            resp.current_shift_id = active_alloc.allocation_shifts[0].shift_id
        resp.current_desk_category = active_alloc.desk.category if active_alloc.desk else None
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

    if student.status == "left":
        await _execute_student_left_cleanup(db, current_user.tenant_id, student_id)

    await db.commit()
    await db.refresh(student)
    return StudentResponse.model_validate(student)


async def _execute_student_left_cleanup(db: AsyncSession, tenant_id: str, student_id: str):
    """Frees assigned seat and locker when a student is marked as Left."""
    # 1. Vacate all active/overdue seat allocations
    alloc_q = select(Allocation).options(selectinload(Allocation.allocation_shifts)).where(
        Allocation.student_id == student_id,
        Allocation.tenant_id == tenant_id,
        Allocation.status.in_(["active", "overdue"])
    )
    alloc_res = await db.execute(alloc_q)
    for alloc in alloc_res.scalars().all():
        alloc.status = "cancelled"
        for ash in alloc.allocation_shifts:
            ash.status = "cancelled"

    # 2. Release all active locker assignments
    from app.models.locker import LockerAssignment
    from app.core.database import get_utc_now
    locker_q = select(LockerAssignment).options(selectinload(LockerAssignment.locker)).where(
        LockerAssignment.student_id == student_id,
        LockerAssignment.tenant_id == tenant_id,
        LockerAssignment.status == "active"
    )
    locker_res = await db.execute(locker_q)
    for assign in locker_res.scalars().all():
        assign.status = "ended"
        assign.ended_at = get_utc_now()
        assign.notes = f"{assign.notes or ''}\nStudent marked as left".strip()
        if assign.locker:
            assign.locker.status = "available"


# ─────────────────────────────────────────────
# Mark student as left (releases seat & locker)
# ─────────────────────────────────────────────
@router.post("/{student_id}/left", response_model=StudentResponse)
async def mark_student_left(
    student_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Student).where(Student.id == student_id, Student.tenant_id == current_user.tenant_id)
    res = await db.execute(query)
    student = res.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")

    student.status = "left"
    await _execute_student_left_cleanup(db, current_user.tenant_id, student_id)
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
# Official Excel Import Endpoints
# ─────────────────────────────────────────────
@router.get("/import/template")
async def download_import_template(
    current_user: User = Depends(get_current_user),
):
    """Download official Excel (.xlsx) template for bulk student import."""
    template_stream = ExcelImportService.generate_template()
    return StreamingResponse(
        template_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": "attachment; filename=student_import_template.xlsx"
        }
    )


@router.post("/import/validate", response_model=ImportValidationSummary)
async def validate_import_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Validate an uploaded Excel (.xlsx) file and return row preview & validation summary."""
    filename = (file.filename or "").lower()
    if not (filename.endswith(".xlsx") or filename.endswith(".xls")):
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. Please upload an Excel (.xlsx) file."
        )

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="File size exceeds the 10MB limit."
        )

    try:
        summary = await ExcelImportService.validate_excel(
            file_bytes=content,
            tenant_id=current_user.tenant_id,
            db=db
        )
        return summary
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error processing Excel file: {str(e)}")


@router.post("/import/confirm", response_model=ImportResultSummary)
async def confirm_student_import(
    request: ImportConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Confirm and execute atomic import of validated student records."""
    if not request.rows:
        raise HTTPException(status_code=400, detail="No rows provided for import.")

    try:
        result = await ExcelImportService.confirm_import(
            rows=request.rows,
            tenant_id=current_user.tenant_id,
            db=db
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database import failed: {str(e)}")


# ─────────────────────────────────────────────
# CSV Import Template (Legacy)
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
    seq_num = await get_next_admission_sequence_start(db, current_user.tenant_id)

    for row in rows:
        full_name = row.get("full_name")
        phone = row.get("phone")

        if not full_name or not phone:
            skipped_count += 1
            continue

        raw_adm = row.get("admission_number")
        if raw_adm and str(raw_adm).strip():
            adm_no = str(raw_adm).strip()
        else:
            adm_no = f"ADM-{seq_num:04d}"
            seq_num += 1

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