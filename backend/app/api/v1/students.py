from datetime import date, timedelta
import csv
import io
import secrets
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.tenant import User
from app.models.student import Student

router = APIRouter(prefix="/students", tags=["Students"])

@router.post("/{student_id}/pause")
async def pause_student(
    student_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
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

@router.post("/{student_id}/resume")
async def resume_student(
    student_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Student).where(Student.id == student_id, Student.tenant_id == current_user.tenant_id)
    res = await db.execute(query)
    student = res.scalar_one_or_none()

    if not student or student.status != "paused":
        raise HTTPException(status_code=400, detail="Student is not in paused state")

    # Logic: Extend expiry date by the number of days paused
    days_paused = (date.today() - student.paused_at).days
    if days_paused > 0 and student.expiry_date:
        student.expiry_date = student.expiry_date + timedelta(days=days_paused)

    student.status = "active"
    student.paused_at = None
    await db.commit()
    return {"status": "resumed", "new_expiry": student.expiry_date}

@router.get("/import-template")
async def get_import_template():
    """
    Download a CSV template for bulk student import.
    """
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

@router.post("/bulk-import")
async def bulk_import_students(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Bulk import students from a CSV or Excel file.
    """
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
            # Read all columns as strings to prevent phone numbers from becoming floats
            df = pd.read_excel(io.BytesIO(content), dtype=str)
            # Replace NaN/null values with None for consistency with SQL models
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

    return {"status": "success", "imported": imported_count, "skipped": skipped_count}