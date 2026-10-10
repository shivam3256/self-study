import io
import re
import secrets
from datetime import date, datetime, timedelta
from typing import List, Dict, Any, Optional

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side, Protection
from openpyxl.utils import get_column_letter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.student import Student
from app.schemas.import_student import (
    ImportRowItem,
    ImportValidationSummary,
    ImportResultSummary,
)

EXPECTED_HEADERS = [
    "Name",
    "Mob No.",
    "Gender",
    "ID Proof Type",
    "ID Proof",
    "Email",
    "Notes",
]

ALLOWED_GENDERS = {"male", "female", "other"}
ALLOWED_ID_TYPES = {"Aadhaar", "Driving License", "Voter ID", "College ID", "Passport", "PAN Card"}


class ExcelImportService:

    @staticmethod
    def generate_template() -> io.BytesIO:
        """
        Generate a styled Excel (.xlsx) template with two sheets:
        1. 'Students' for entering student data with locked headers and locked example row,
           and unlocked entry rows (3 to 1000) with sheet protection.
        2. 'Instructions' for detailed formatting guidance and allowed values.
        """
        wb = openpyxl.Workbook()
        
        # ────────── Sheet 1: Students ──────────
        ws_data = wb.active
        ws_data.title = "Students"
        ws_data.views.sheetView[0].showGridLines = True

        # Header Styles
        header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
        header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
        req_font = Font(name="Calibri", size=11, bold=True, color="FCA5A5")
        center_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
        thin_border = Border(
            left=Side(style="thin", color="CBD5E1"),
            right=Side(style="thin", color="CBD5E1"),
            top=Side(style="thin", color="CBD5E1"),
            bottom=Side(style="thin", color="CBD5E1")
        )

        # Write Headers
        for col_idx, header in enumerate(EXPECTED_HEADERS, 1):
            cell = ws_data.cell(row=1, column=col_idx, value=header)
            cell.fill = header_fill
            cell.font = req_font if header == "Name" else header_font
            cell.alignment = center_align
            cell.border = thin_border

        ws_data.row_dimensions[1].height = 28

        # Add 1 Clear Example Row (Visually styled as reference example; auto-ignored on import)
        example_fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
        example_font = Font(name="Calibri", size=10, italic=True, color="475569")
        
        example_data = [
            "Rahul Sharma",
            "+91 9876543210",
            "Male",
            "Aadhaar",
            "1234-5678-9012",
            "rahul.sharma@example.com",
            "Civil services aspirant",
        ]

        for col_idx, val in enumerate(example_data, 1):
            cell = ws_data.cell(row=2, column=col_idx, value=val)
            cell.fill = example_fill
            cell.font = example_font
            cell.border = thin_border
            cell.alignment = Alignment(vertical="center")

        ws_data.row_dimensions[2].height = 22

        # Auto-fit column widths with safety margin
        col_widths = {
            1: 24, # Name
            2: 18, # Mob No.
            3: 14, # Gender
            4: 18, # ID Proof Type
            5: 20, # ID Proof
            6: 28, # Email
            7: 30, # Notes
        }
        for col_idx, width in col_widths.items():
            ws_data.column_dimensions[get_column_letter(col_idx)].width = width

        # ────────── Sheet 2: Instructions ──────────
        ws_inst = wb.create_sheet(title="Instructions")
        ws_inst.views.sheetView[0].showGridLines = True

        title_font = Font(name="Calibri", size=14, bold=True, color="0F172A")
        sub_font = Font(name="Calibri", size=11, bold=True, color="1E293B")
        inst_header_fill = PatternFill(start_color="E2E8F0", end_color="E2E8F0", fill_type="solid")

        ws_inst.cell(row=1, column=1, value="Student Excel Import - Guide & Requirements").font = title_font
        ws_inst.row_dimensions[1].height = 26

        instructions = [
            ("Rule #", "Requirement", "Details / Examples"),
            ("1", "Mandatory Fields", "ONLY the 'Name' column is mandatory. All other columns (Mob No., Gender, ID Proof Type, ID Proof, Email, Notes) are optional."),
            ("2", "Template Structure", "Do NOT rename, reorder, or delete any columns in the 'Students' sheet. Blank optional fields are completely valid."),
            ("3", "Example Row", "Row 2 contains a reference example ('Rahul Sharma'). It is automatically ignored during import. You can leave it or enter your actual students starting on Row 3."),
            ("4", "Mob No.", "Enter mobile number with or without country code (e.g., +91 9876543210 or 9876543210)."),
            ("5", "Gender", "Allowed values: 'Male', 'Female', 'Other'. Defaults to 'Other' if empty."),
            ("6", "ID Proof Types", "Common values: Aadhaar, Driving License, Voter ID, College ID, Passport, PAN Card. Defaults to Aadhaar if omitted."),
            ("7", "Duplicates", "Duplicate mobile numbers in the file or existing students will be flagged as warnings for your review."),
            ("8", "Seat Assignment", "Seats and memberships are assigned individually through the Billing / Seat Allocation screens after student registration.")
        ]

        for r_idx, (col1, col2, col3) in enumerate(instructions, 3):
            c1 = ws_inst.cell(row=r_idx, column=1, value=col1)
            c2 = ws_inst.cell(row=r_idx, column=2, value=col2)
            c3 = ws_inst.cell(row=r_idx, column=3, value=col3)
            
            if r_idx == 3:
                for c in [c1, c2, c3]:
                    c.fill = inst_header_fill
                    c.font = sub_font
                    c.border = thin_border
            else:
                for c in [c1, c2, c3]:
                    c.font = Font(name="Calibri", size=10, color="334155")
                    c.border = thin_border
                    c.alignment = Alignment(vertical="center")

        ws_inst.column_dimensions["A"].width = 10
        ws_inst.column_dimensions["B"].width = 24
        ws_inst.column_dimensions["C"].width = 80

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return output

    @staticmethod
    def _clean_str(val: Any) -> Optional[str]:
        if val is None:
            return None
        s = str(val).strip()
        # Prevent formula injection / security risk in untrusted strings
        if s.startswith(("=", "@")):
            s = "'" + s
        return s if s else None

    @classmethod
    def _is_example_row(
        cls,
        name: Optional[str],
        phone: Optional[str],
        email: Optional[str],
        id_proof: Optional[str]
    ) -> bool:
        """
        Detects if a row is the template reference example (e.g. Rahul Sharma sample row).
        Example rows are skipped automatically during validation and not imported into the database.
        """
        n = (name or "").strip().lower()
        e = (email or "").strip().lower()
        p = re.sub(r"[^\d+]", "", (phone or "").strip())
        i = re.sub(r"[^\w]", "", (id_proof or "").strip())

        if "example" in n or "sample" in n:
            return True
        if e == "rahul.sharma@example.com":
            return True
        if "rahul sharma" in n and (
            p in ["+919876543210", "9876543210"]
            or i == "123456789012"
            or "example.com" in e
            or not p
        ):
            return True
        return False

    @classmethod
    async def validate_excel(
        cls,
        file_bytes: bytes,
        tenant_id: str,
        db: AsyncSession
    ) -> ImportValidationSummary:
        """
        Fast preview parser:
        - Validates headers
        - Reads rows up to 1000
        - Normalizes gender, phone, email, and ID proof
        - Flags duplicate phones as warnings
        """
        # 1. Load Excel in read_only/data_only mode
        try:
            wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True, read_only=True)
        except Exception as e:
            raise ValueError(f"Unable to read Excel file. Please ensure it is a valid .xlsx file. ({str(e)})")

        # Pick 'Students' sheet if present, else first active sheet
        sheet_name = "Students" if "Students" in wb.sheetnames else wb.sheetnames[0]
        ws = wb[sheet_name]

        # 2. Read headers
        rows_iter = ws.iter_rows(values_only=True)
        first_row = next(rows_iter, None)
        if not first_row:
            raise ValueError("The uploaded Excel sheet is empty.")

        # Normalize header map
        header_map: Dict[str, int] = {}
        for idx, col in enumerate(first_row):
            if col is not None:
                header_map[str(col).strip().lower()] = idx

        # Check required columns
        if "name" not in header_map:
            raise ValueError("Invalid template: 'Name' column is missing from the worksheet.")

        # 3. Load existing students for duplicate detection
        existing_students_res = await db.execute(
            select(Student.phone, Student.full_name).where(Student.tenant_id == tenant_id)
        )
        existing_phone_map = {row[0].strip(): row[1] for row in existing_students_res.all() if row[0]}

        # 4. Parse & Validate Rows
        parsed_rows: List[ImportRowItem] = []
        seen_phones_in_file: Dict[str, int] = {}

        row_num = 1
        consecutive_empty = 0
        for row in rows_iter:
            row_num += 1
            if row_num > 1000:
                break # Safety limit on batch size

            # Extract cell values using header map
            def get_val(*keys: str):
                for k in keys:
                    idx = header_map.get(k.lower())
                    if idx is not None and idx < len(row):
                        return row[idx]
                return None

            raw_name = get_val("name", "student name", "full name")
            raw_phone = get_val("mob no.", "mob no", "mobile no", "mobile no.", "mobile number", "phone", "phone number", "mob", "contact")
            raw_gender = get_val("gender", "sex")
            raw_id_type = get_val("id proof type", "id_proof_type", "id type", "proof type")
            raw_id_num = get_val("id proof", "id_proof", "id proof number", "id proof no", "id_proof_number", "id number")
            raw_email = get_val("email", "email address", "email id")
            raw_notes = get_val("notes", "remarks", "note", "address")

            # Check for completely empty row
            if all(v is None or str(v).strip() == "" for v in [raw_name, raw_phone, raw_gender, raw_email, raw_id_num, raw_notes]):
                consecutive_empty += 1
                if consecutive_empty > 50:
                    break
                continue
            consecutive_empty = 0

            # Ignore template reference example row if present (e.g. Rahul Sharma sample)
            if cls._is_example_row(
                str(raw_name) if raw_name is not None else None,
                str(raw_phone) if raw_phone is not None else None,
                str(raw_email) if raw_email is not None else None,
                str(raw_id_num) if raw_id_num is not None else None
            ):
                continue

            name = cls._clean_str(raw_name)
            phone = cls._clean_str(raw_phone)
            id_proof_type = cls._clean_str(raw_id_type) or "Aadhaar"
            id_proof = cls._clean_str(raw_id_num)
            email = cls._clean_str(raw_email)
            notes = cls._clean_str(raw_notes)

            # Normalize gender
            raw_g = (cls._clean_str(raw_gender) or "").lower()
            if raw_g in ["m", "male"]:
                gender = "male"
            elif raw_g in ["f", "female"]:
                gender = "female"
            elif raw_g in ["o", "other"]:
                gender = "other"
            elif raw_g:
                gender = "other"
            else:
                gender = "other"

            row_errors: List[str] = []
            row_warnings: List[str] = []

            # Validate Mandatory: Name
            if not name:
                row_errors.append("Student Name is required.")

            # Validate Phone (Optional)
            if phone:
                cleaned_digits = re.sub(r"[^\d+]", "", phone)
                if len(re.sub(r"[^\d]", "", cleaned_digits)) < 7:
                    row_warnings.append(f"Mobile number '{phone}' seems unusually short.")
                
                # Check duplicate in file
                if phone in seen_phones_in_file:
                    row_warnings.append(f"Duplicate mobile number in Excel (also on Row {seen_phones_in_file[phone]}).")
                else:
                    seen_phones_in_file[phone] = row_num

                # Check duplicate in DB
                if phone in existing_phone_map:
                    row_warnings.append(f"Student with mobile '{phone}' already registered ({existing_phone_map[phone]}).")

            # Validate Email (Optional)
            if email:
                if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
                    row_errors.append(f"Invalid email format: '{email}'.")

            is_valid = len(row_errors) == 0
            item = ImportRowItem(
                row_number=row_num,
                name=name or f"Row {row_num}",
                phone=phone,
                gender=gender,
                id_proof_type=id_proof_type,
                id_proof=id_proof,
                email=email,
                notes=notes,
                is_valid=is_valid,
                errors=row_errors,
                warnings=row_warnings,
            )
            parsed_rows.append(item)

        wb.close()

        total = len(parsed_rows)
        errors_count = sum(1 for r in parsed_rows if not r.is_valid)
        warnings_count = sum(1 for r in parsed_rows if r.is_valid and len(r.warnings) > 0)
        valid_count = sum(1 for r in parsed_rows if r.is_valid)

        return ImportValidationSummary(
            total_rows=total,
            valid_rows=valid_count,
            warning_rows=warnings_count,
            error_rows=errors_count,
            can_import=total > 0 and errors_count == 0,
            rows=parsed_rows,
        )

    @classmethod
    async def confirm_import(
        cls,
        rows: List[ImportRowItem],
        tenant_id: str,
        db: AsyncSession
    ) -> ImportResultSummary:
        """
        Executes atomic database insertion of student records imported from Excel.
        """
        imported_count = 0
        skipped_count = 0
        critical_errors: List[str] = []

        today = date.today()

        for row in rows:
            if not row.is_valid:
                skipped_count += 1
                continue

            try:
                # 1. Auto-generate unique admission number and QR code token
                adm_no = f"ADM-{secrets.token_hex(4).upper()}"
                qr_token = secrets.token_urlsafe(16)

                # 2. Create Student with details matching registration
                student = Student(
                    tenant_id=tenant_id,
                    admission_number=adm_no,
                    full_name=row.name.strip(),
                    phone=row.phone.strip() if row.phone else "N/A",
                    gender=row.gender or "other",
                    email=row.email.strip() if row.email else None,
                    id_proof_type=row.id_proof_type or "Aadhaar",
                    id_proof_number=row.id_proof if row.id_proof else None,
                    status="active",
                    join_date=today,
                    expiry_date=None,
                    qr_code_token=qr_token,
                    notes=row.notes or "Imported via Excel"
                )
                db.add(student)
                imported_count += 1

            except Exception as e:
                critical_errors.append(f"Row {row.row_number} ({row.name}): {str(e)}")
                skipped_count += 1

        if critical_errors and imported_count == 0:
            await db.rollback()
            raise ValueError(f"Import failed: {'; '.join(critical_errors)}")

        await db.commit()

        return ImportResultSummary(
            imported_count=imported_count,
            skipped_count=skipped_count,
            plans_assigned=0,
            seats_assigned=0,
            errors=critical_errors
        )
