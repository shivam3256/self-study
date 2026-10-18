import calendar
import secrets
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import List, Optional, Dict, Any
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from sqlalchemy.orm import selectinload

from app.models.locker import Locker, LockerAssignment
from app.models.student import Student
from app.models.plan import Plan
from app.models.payment import Payment
from app.models.allocation import Allocation
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
from app.schemas.payment import ReceiptDetailResponse, ReceiptLineItem
from app.core.locker_config import (
    LOCKER_PRORATE_MID_PERIOD,
    LOCKER_ALIGN_WITH_SEAT_EXPIRY,
    MAX_ACTIVE_LOCKERS_PER_STUDENT,
    calculate_locker_fee,
)
from app.core.database import get_utc_now
from app.services.allocation_service import AllocationService

def add_months_to_date(start: date, months: int) -> date:
    """Adds N months and subtracts 1 day for inclusive end date."""
    m = start.month - 1 + months
    y = start.year + m // 12
    m = m % 12 + 1
    max_day = calendar.monthrange(y, m)[1]
    target_day = min(start.day, max_day)
    target_date = date(y, m, target_day)
    return target_date - timedelta(days=1)


class LockerService:
    @staticmethod
    def _compute_status(locker: Locker, active_assignment: Optional[LockerAssignment]) -> tuple[str, int]:
        """Calculates computed status and overdue days."""
        if locker.status == "maintenance":
            return "maintenance", 0
        if active_assignment and active_assignment.status == "active":
            today = date.today()
            if active_assignment.paid_until < today:
                overdue_days = (today - active_assignment.paid_until).days
                return "overdue", overdue_days
            return "assigned", 0
        return "available", 0

    @classmethod
    def format_locker_response(cls, locker: Locker, active_assignment: Optional[LockerAssignment] = None) -> LockerResponse:
        assignment = active_assignment
        if assignment is None and "assignments" in locker.__dict__ and locker.assignments:
            assignment = next((a for a in locker.assignments if a.status == "active"), None)

        comp_status, overdue_days = cls._compute_status(locker, assignment)

        assign_resp = None
        student_name = None
        if assignment:
            has_student = "student" in assignment.__dict__ and assignment.student is not None
            student_name = assignment.student.full_name if has_student else None
            assign_resp = LockerAssignmentResponse(
                id=assignment.id,
                tenant_id=assignment.tenant_id,
                locker_id=assignment.locker_id,
                student_id=assignment.student_id,
                student_name=student_name,
                student_phone=assignment.student.phone if has_student else None,
                student_admission_number=assignment.student.admission_number if has_student else None,
                start_date=assignment.start_date,
                paid_until=assignment.paid_until,
                monthly_fee=assignment.monthly_fee,
                deposit_amount=assignment.deposit_amount,
                deposit_returned=assignment.deposit_returned,
                status=assignment.status,
                ended_at=assignment.ended_at,
                notes=assignment.notes,
                overdue_days=overdue_days
            )

        return LockerResponse(
            id=locker.id,
            tenant_id=locker.tenant_id,
            label=locker.label,
            monthly_fee=locker.monthly_fee,
            status=locker.status,
            computed_status=comp_status,
            current_assignment=assign_resp,
            student_name=student_name,
            created_at=locker.created_at
        )

    @classmethod
    async def get_locker_map(cls, db: AsyncSession, tenant_id: str) -> LockerMapSummary:
        query = (
            select(Locker)
            .options(
                selectinload(Locker.assignments).selectinload(LockerAssignment.student)
            )
            .where(Locker.tenant_id == tenant_id)
        )
        res = await db.execute(query)
        lockers = res.scalars().all()

        # Natural sort helper for labels like L-1, L-2, L-10
        def natural_sort_key(l: Locker):
            import re
            parts = re.split(r'(\d+)', l.label)
            return [int(p) if p.isdigit() else p.lower() for p in parts]

        sorted_lockers = sorted(lockers, key=natural_sort_key)

        formatted = []
        vacant_cnt = 0
        assigned_cnt = 0
        overdue_cnt = 0
        maint_cnt = 0

        for l in sorted_lockers:
            item = cls.format_locker_response(l)
            formatted.append(item)
            if item.computed_status == "available":
                vacant_cnt += 1
            elif item.computed_status == "assigned":
                assigned_cnt += 1
            elif item.computed_status == "overdue":
                overdue_cnt += 1
            elif item.computed_status == "maintenance":
                maint_cnt += 1

        return LockerMapSummary(
            total=len(formatted),
            vacant=vacant_cnt,
            assigned=assigned_cnt,
            overdue=overdue_cnt,
            maintenance=maint_cnt,
            lockers=formatted
        )

    @classmethod
    async def get_locker(cls, db: AsyncSession, tenant_id: str, locker_id: str) -> LockerResponse:
        query = (
            select(Locker)
            .options(selectinload(Locker.assignments).selectinload(LockerAssignment.student))
            .where(Locker.id == locker_id, Locker.tenant_id == tenant_id)
        )
        res = await db.execute(query)
        locker = res.scalar_one_or_none()
        if not locker:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Locker not found.")
        active_alloc = next((a for a in locker.assignments if a.status == "active"), None)
        return cls.format_locker_response(locker, active_alloc)

    @classmethod
    async def create_locker(cls, db: AsyncSession, tenant_id: str, data: LockerCreate) -> LockerResponse:
        label_clean = data.label.strip()
        existing = await db.scalar(
            select(Locker).where(Locker.tenant_id == tenant_id, Locker.label == label_clean)
        )
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Locker '{label_clean}' already exists.")

        locker = Locker(
            tenant_id=tenant_id,
            label=label_clean,
            monthly_fee=data.monthly_fee,
            status="available"
        )
        db.add(locker)
        await db.commit()
        await db.refresh(locker)
        return cls.format_locker_response(locker)

    @classmethod
    async def bulk_create_lockers(cls, db: AsyncSession, tenant_id: str, data: LockerBulkCreate) -> List[Dict[str, Any]]:
        prefix = data.prefix.strip()
        existing_res = await db.execute(
            select(Locker.label).where(Locker.tenant_id == tenant_id)
        )
        existing_labels = set(existing_res.scalars().all())

        created = []
        skipped = []
        fee = data.effective_monthly_fee

        for i in range(data.count):
            num = data.start_number + i
            label = f"{prefix}{num}"
            if label in existing_labels:
                skipped.append(label)
                continue

            locker = Locker(
                tenant_id=tenant_id,
                label=label,
                monthly_fee=fee,
                status="available"
            )
            db.add(locker)
            existing_labels.add(label)
            created.append(locker)

        await db.commit()
        return [
            {
                "id": l.id,
                "label": l.label,
                "monthly_fee": float(l.monthly_fee),
                "status": l.status
            }
            for l in created
        ]

    @classmethod
    async def update_locker(cls, db: AsyncSession, tenant_id: str, locker_id: str, data: LockerUpdate) -> LockerResponse:
        query = (
            select(Locker)
            .options(selectinload(Locker.assignments).selectinload(LockerAssignment.student))
            .where(Locker.id == locker_id, Locker.tenant_id == tenant_id)
        )
        res = await db.execute(query)
        locker = res.scalar_one_or_none()
        if not locker:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Locker not found.")

        active_alloc = next((a for a in locker.assignments if a.status == "active"), None)

        if data.label:
            clean_label = data.label.strip()
            if clean_label != locker.label:
                # Check uniqueness
                dup = await db.scalar(
                    select(Locker).where(Locker.tenant_id == tenant_id, Locker.label == clean_label, Locker.id != locker_id)
                )
                if dup:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Locker label '{clean_label}' already exists.")
                locker.label = clean_label

        if data.monthly_fee is not None:
            locker.monthly_fee = data.monthly_fee

        if data.status:
            if data.status == "maintenance" and active_alloc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot put locker under maintenance while an active assignment exists. Please release it first."
                )
            if data.status in ("available", "maintenance"):
                # If reverting from maintenance to available, ensure it's not marked available if assigned
                if data.status == "available" and active_alloc:
                    locker.status = "assigned"
                else:
                    locker.status = data.status

        await db.commit()
        await db.refresh(locker)
        return cls.format_locker_response(locker, active_alloc)

    @classmethod
    async def delete_locker(cls, db: AsyncSession, tenant_id: str, locker_id: str) -> None:
        query = (
            select(Locker)
            .options(selectinload(Locker.assignments))
            .where(Locker.id == locker_id, Locker.tenant_id == tenant_id)
        )
        res = await db.execute(query)
        locker = res.scalar_one_or_none()
        if not locker:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Locker not found.")

        has_active = any(a.status == "active" for a in locker.assignments)
        if has_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot delete locker '{locker.label}' because it is currently assigned. Please release the locker first."
            )

        await db.delete(locker)
        await db.commit()

    @classmethod
    async def assign_locker(cls, db: AsyncSession, tenant_id: str, locker_id: str, data: LockerAssignRequest) -> Dict[str, Any]:
        """Atomically assign a locker to a student with optional upfront payment."""
        # 1. Fetch locker
        query = (
            select(Locker)
            .options(selectinload(Locker.assignments))
            .where(Locker.id == locker_id, Locker.tenant_id == tenant_id)
        )
        res = await db.execute(query)
        locker = res.scalar_one_or_none()
        if not locker:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Locker not found.")

        if locker.status == "maintenance":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Locker '{locker.label}' is under maintenance and cannot be assigned.")

        # Check existing active assignment on this locker
        has_active = any(a.status == "active" for a in locker.assignments)
        if has_active:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Locker '{locker.label}' already has an active student assignment.")

        # 2. Fetch and validate student
        stu_q = select(Student).where(Student.id == data.student_id, Student.tenant_id == tenant_id)
        stu_res = await db.execute(stu_q)
        student = stu_res.scalar_one_or_none()
        if not student:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")
        if student.status not in ("active",):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot assign locker to inactive student (status: {student.status}).")

        # 3. Check student doesn't already have an active locker
        existing_stu_alloc = await db.scalar(
            select(LockerAssignment)
            .options(selectinload(LockerAssignment.locker))
            .where(
                LockerAssignment.tenant_id == tenant_id,
                LockerAssignment.student_id == student.id,
                LockerAssignment.status == "active"
            )
        )
        if existing_stu_alloc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Student already has an active locker (Locker {existing_stu_alloc.locker.label}). Maximum {MAX_ACTIVE_LOCKERS_PER_STUDENT} active locker allowed per student."
            )

        # 4. Dates & Fees
        start_date = data.start_date or date.today()
        fee_rate = data.monthly_fee if data.monthly_fee is not None else locker.monthly_fee
        deposit = data.deposit_amount or Decimal("0.00")

        # Compute initial paid_until
        months = data.months or 1
        if data.should_collect_payment:
            paid_until = add_months_to_date(start_date, months)
        else:
            # If not paid immediately, paid_until is start_date - 1 day so it is marked due
            paid_until = start_date - timedelta(days=1)

        assignment = LockerAssignment(
            tenant_id=tenant_id,
            locker_id=locker.id,
            student_id=student.id,
            start_date=start_date,
            paid_until=paid_until,
            monthly_fee=fee_rate,
            deposit_amount=deposit,
            deposit_returned=False,
            status="active",
            notes=data.remarks
        )
        db.add(assignment)
        locker.status = "assigned"
        await db.flush()

        payment_obj = None
        receipt_obj = None
        # 5. Handle upfront payment if requested
        if data.should_collect_payment:
            calculated_fee = calculate_locker_fee(fee_rate, months, start_date)
            current_year = date.today().year
            count_res = await db.execute(select(func.count(Payment.id)).where(Payment.tenant_id == tenant_id))
            seq_num = (count_res.scalar_one() or 0) + 1
            receipt_no = f"REC-{current_year}-{seq_num:04d}"

            # Create locker fee payment row
            payment_obj = Payment(
                tenant_id=tenant_id,
                student_id=student.id,
                locker_assignment_id=assignment.id,
                payment_type="locker",
                receipt_number=receipt_no,
                receipt_id=receipt_no,
                amount=calculated_fee,
                discount=Decimal("0.00"),
                final_amount=calculated_fee,
                payment_mode=data.payment_mode or "upi",
                transaction_reference=data.ref_number,
                payment_date=date.today(),
                period_start=start_date,
                period_end=paid_until,
                next_due_date=paid_until,
                status="paid",
                remarks=f"Initial locker {locker.label} rent for {months} month(s)."
            )
            db.add(payment_obj)

            # If deposit > 0, track deposit payment row separately
            if deposit > 0:
                dep_payment = Payment(
                    tenant_id=tenant_id,
                    student_id=student.id,
                    locker_assignment_id=assignment.id,
                    payment_type="deposit",
                    receipt_number=f"{receipt_no}-DEP",
                    receipt_id=receipt_no,
                    amount=deposit,
                    discount=Decimal("0.00"),
                    final_amount=deposit,
                    payment_mode=data.payment_mode or "upi",
                    transaction_reference=data.transaction_reference,
                    payment_date=date.today(),
                    period_start=start_date,
                    period_end=paid_until,
                    next_due_date=paid_until,
                    status="paid",
                    remarks=f"Refundable security deposit for locker {locker.label}."
                )
                db.add(dep_payment)

        await db.commit()
        await db.refresh(assignment)

        # Load student relations
        assignment.student = student
        assignment.locker = locker

        return {
            "assignment": LockerAssignmentResponse.model_validate(assignment),
            "payment_id": payment_obj.id if payment_obj else None,
            "receipt_number": payment_obj.receipt_number if payment_obj else None
        }

    @classmethod
    async def renew_locker(cls, db: AsyncSession, tenant_id: str, locker_id: str, data: LockerRenewRequest) -> Dict[str, Any]:
        """Extends a locker's paid_until date by N months and records a locker payment."""
        query = (
            select(LockerAssignment)
            .options(selectinload(LockerAssignment.locker), selectinload(LockerAssignment.student))
            .where(
                LockerAssignment.tenant_id == tenant_id,
                LockerAssignment.locker_id == locker_id,
                LockerAssignment.status == "active"
            )
        )
        res = await db.execute(query)
        assignment = res.scalar_one_or_none()
        if not assignment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active assignment found for this locker.")

        today = date.today()
        months = data.months or 1
        # Determine period start: if never paid (paid_until < start_date), start from start_date
        if assignment.paid_until < assignment.start_date:
            period_start = assignment.start_date
        else:
            period_start = assignment.paid_until + timedelta(days=1)

        new_paid_until = add_months_to_date(period_start, months)

        # Determine fee
        amount = data.amount if data.amount is not None else (assignment.monthly_fee * Decimal(str(months)))
        discount = data.discount or Decimal("0.00")
        final_amount = max(Decimal("0.00"), amount - discount)

        # Generate receipt
        current_year = today.year
        count_res = await db.execute(select(func.count(Payment.id)).where(Payment.tenant_id == tenant_id))
        seq_num = (count_res.scalar_one() or 0) + 1
        receipt_no = f"REC-{current_year}-{seq_num:04d}"

        payment = Payment(
            tenant_id=tenant_id,
            student_id=assignment.student_id,
            locker_assignment_id=assignment.id,
            payment_type="locker",
            receipt_number=receipt_no,
            receipt_id=receipt_no,
            amount=amount,
            discount=discount,
            final_amount=final_amount,
            payment_mode=data.payment_mode or "upi",
            transaction_reference=data.ref_number,
            payment_date=today,
            period_start=period_start,
            period_end=new_paid_until,
            next_due_date=new_paid_until,
            status="paid",
            remarks=data.remarks or f"Locker {assignment.locker.label} renewal for {months} month(s)."
        )
        db.add(payment)

        # Update assignment paid_until
        assignment.paid_until = new_paid_until
        await db.commit()
        await db.refresh(assignment)

        return {
            "assignment": LockerAssignmentResponse.model_validate(assignment),
            "payment_id": payment.id,
            "receipt_number": receipt_no,
            "new_paid_until": new_paid_until
        }

    @classmethod
    async def release_locker(cls, db: AsyncSession, tenant_id: str, locker_id: str, data: LockerReleaseRequest) -> Dict[str, Any]:
        """Releases an assigned locker, marking assignment ended and freeing the locker."""
        query = (
            select(LockerAssignment)
            .options(selectinload(LockerAssignment.locker), selectinload(LockerAssignment.student))
            .where(
                LockerAssignment.tenant_id == tenant_id,
                LockerAssignment.locker_id == locker_id,
                LockerAssignment.status == "active"
            )
        )
        res = await db.execute(query)
        assignment = res.scalar_one_or_none()
        if not assignment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active assignment found for this locker.")

        assignment.status = "ended"
        assignment.ended_at = get_utc_now()
        assignment.deposit_returned = data.refund_deposit
        if data.notes:
            assignment.notes = f"{assignment.notes or ''}\nRelease note: {data.notes}".strip()

        # Update locker status to available
        locker_q = select(Locker).where(Locker.id == locker_id, Locker.tenant_id == tenant_id)
        locker = (await db.execute(locker_q)).scalar_one()
        locker.status = "available"

        await db.commit()
        await db.refresh(assignment)
        return {
            "success": True,
            "message": f"Locker '{assignment.locker.label}' released successfully.",
            "deposit_refunded": data.refund_deposit,
            "deposit_amount": assignment.deposit_amount
        }

    @classmethod
    async def change_student(cls, db: AsyncSession, tenant_id: str, locker_id: str, data: LockerChangeStudentRequest) -> Dict[str, Any]:
        """Transfers active locker to a new student."""
        query = (
            select(LockerAssignment)
            .options(selectinload(LockerAssignment.locker))
            .where(
                LockerAssignment.tenant_id == tenant_id,
                LockerAssignment.locker_id == locker_id,
                LockerAssignment.status == "active"
            )
        )
        res = await db.execute(query)
        old_assignment = res.scalar_one_or_none()
        if not old_assignment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active assignment found for this locker.")

        # Check new student
        new_stu = await db.scalar(
            select(Student).where(Student.id == data.new_student_id, Student.tenant_id == tenant_id)
        )
        if not new_stu or new_stu.status != "active":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected replacement student is invalid or inactive.")

        # Check new student has no active locker
        existing_alloc = await db.scalar(
            select(LockerAssignment).where(
                LockerAssignment.tenant_id == tenant_id,
                LockerAssignment.student_id == new_stu.id,
                LockerAssignment.status == "active"
            )
        )
        if existing_alloc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected replacement student already has an active locker.")

        # End old assignment
        old_assignment.status = "ended"
        old_assignment.ended_at = get_utc_now()
        old_assignment.deposit_returned = not data.transfer_deposit
        old_assignment.notes = f"{old_assignment.notes or ''}\nTransferred to {new_stu.full_name} on {date.today()}".strip()

        # Create new assignment
        new_assignment = LockerAssignment(
            tenant_id=tenant_id,
            locker_id=locker_id,
            student_id=new_stu.id,
            start_date=data.start_date or date.today(),
            paid_until=old_assignment.paid_until,
            monthly_fee=old_assignment.monthly_fee,
            deposit_amount=old_assignment.deposit_amount if data.transfer_deposit else Decimal("0.00"),
            deposit_returned=False,
            status="active",
            notes=data.notes
        )
        db.add(new_assignment)
        await db.commit()
        await db.refresh(new_assignment)
        new_assignment.student = new_stu
        new_assignment.locker = old_assignment.locker

        return {
            "message": f"Locker transferred to {new_stu.full_name}.",
            "new_assignment": LockerAssignmentResponse.model_validate(new_assignment)
        }

    @classmethod
    async def get_student_active_locker(cls, db: AsyncSession, tenant_id: str, student_id: str) -> Optional[LockerAssignmentResponse]:
        """Returns the active locker assignment for a student, if any."""
        query = (
            select(LockerAssignment)
            .options(selectinload(LockerAssignment.locker), selectinload(LockerAssignment.student))
            .where(
                LockerAssignment.tenant_id == tenant_id,
                LockerAssignment.student_id == student_id,
                LockerAssignment.status == "active"
            )
        )
        res = await db.execute(query)
        assignment = res.scalar_one_or_none()
        if not assignment:
            return None

        today = date.today()
        overdue_days = (today - assignment.paid_until).days if assignment.paid_until < today else 0

        resp = LockerAssignmentResponse.model_validate(assignment)
        resp.overdue_days = overdue_days
        resp.student_name = assignment.student.full_name if assignment.student else None
        resp.student_phone = assignment.student.phone if assignment.student else None
        resp.locker_label = assignment.locker.label if assignment.locker else None
        resp.label = assignment.locker.label if assignment.locker else None
        return resp

    @classmethod
    async def record_combined_payment(cls, db: AsyncSession, tenant_id: str, data: CombinedPaymentRequest) -> ReceiptDetailResponse:
        """Atomic combined payment for Seat + Locker. Creates TWO payment rows under one shared receipt."""
        # 1. Student check
        student = await db.scalar(
            select(Student).where(Student.id == data.student_id, Student.tenant_id == tenant_id)
        )
        if not student:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

        # 2. Plan check
        plan = await db.scalar(
            select(Plan).options(selectinload(Plan.plan_shifts)).where(Plan.id == data.plan_id, Plan.tenant_id == tenant_id)
        )
        if not plan:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membership plan not found.")

        # 3. Locker active assignment check
        locker_assignment = await db.scalar(
            select(LockerAssignment)
            .options(selectinload(LockerAssignment.locker))
            .where(
                LockerAssignment.tenant_id == tenant_id,
                LockerAssignment.student_id == student.id,
                LockerAssignment.status == "active"
            )
        )
        if not locker_assignment:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Student does not have an active locker assignment to renew."
            )

        today = date.today()

        # 4. Generate shared receipt number
        current_year = today.year
        count_res = await db.execute(select(func.count(Payment.id)).where(Payment.tenant_id == tenant_id))
        total_payments = count_res.scalar_one() or 0
        shared_receipt_id = f"REC-{current_year}-{(total_payments + 1):04d}"

        # 5. Determine Seat Dates
        seat_start = data.seat_period_start or data.period_start
        if not seat_start:
            if student.expiry_date and student.expiry_date >= today:
                seat_start = student.expiry_date + timedelta(days=1)
            else:
                seat_start = today

        seat_end = data.seat_period_end or data.period_end
        if not seat_end:
            seat_end = seat_start + timedelta(days=plan.duration_days - 1)

        seat_amount_val = data.seat_amount if data.seat_amount is not None else Decimal(str(plan.price))
        seat_final = max(Decimal("0.00"), seat_amount_val - data.seat_discount)

        # Create Seat Payment Row
        seat_payment = Payment(
            tenant_id=tenant_id,
            student_id=student.id,
            plan_id=plan.id,
            receipt_number=f"{shared_receipt_id}-S",
            receipt_id=shared_receipt_id,
            payment_type="seat",
            amount=seat_amount_val,
            discount=data.seat_discount,
            final_amount=seat_final,
            payment_mode=data.payment_mode,
            transaction_reference=data.ref_number,
            payment_date=today,
            period_start=seat_start,
            period_end=seat_end,
            next_due_date=seat_end,
            status="paid",
            remarks=data.remarks or f"Seat Plan: {plan.name}"
        )
        db.add(seat_payment)

        # 6. Determine Locker Dates
        months = data.locker_months or 1
        if locker_assignment.paid_until < locker_assignment.start_date:
            locker_start = locker_assignment.start_date
        elif locker_assignment.paid_until >= today:
            locker_start = locker_assignment.paid_until + timedelta(days=1)
        else:
            locker_start = today

        locker_end = add_months_to_date(locker_start, months)
        locker_amount_val = data.locker_amount if data.locker_amount is not None else (Decimal(str(locker_assignment.monthly_fee)) * Decimal(str(months)))
        locker_final = max(Decimal("0.00"), locker_amount_val - data.locker_discount)

        # Create Locker Payment Row
        locker_payment = Payment(
            tenant_id=tenant_id,
            student_id=student.id,
            locker_assignment_id=locker_assignment.id,
            receipt_number=f"{shared_receipt_id}-L",
            receipt_id=shared_receipt_id,
            payment_type="locker",
            amount=locker_amount_val,
            discount=data.locker_discount,
            final_amount=locker_final,
            payment_mode=data.payment_mode,
            transaction_reference=data.ref_number,
            payment_date=today,
            period_start=locker_start,
            period_end=locker_end,
            next_due_date=locker_end,
            status="paid",
            remarks=data.remarks or f"Locker {locker_assignment.locker.label} ({months} month(s))"
        )
        db.add(locker_payment)

        # 7. Update Student seat allocation/expiry & Locker paid_until
        locker_assignment.paid_until = locker_end

        if not student.expiry_date or student.expiry_date < seat_end:
            student.expiry_date = seat_end
        if student.status in ("expired", "suspended"):
            student.status = "active"

        # Update or renew seat allocation
        existing_alloc_q = (
            select(Allocation)
            .options(selectinload(Allocation.allocation_shifts))
            .where(
                Allocation.tenant_id == tenant_id,
                Allocation.student_id == student.id,
                Allocation.status.in_(["active", "overdue"])
            )
            .order_by(Allocation.end_date.desc())
        )
        existing_alloc = (await db.execute(existing_alloc_q)).scalars().first()

        requested_seat_id = data.seat_id
        if existing_alloc:
            if requested_seat_id and requested_seat_id != existing_alloc.seat_id:
                await AllocationService.change_allocation(
                    db=db,
                    tenant_id=tenant_id,
                    allocation_id=existing_alloc.id,
                    new_seat_id=requested_seat_id,
                    new_plan_id=plan.id,
                    start_date=seat_start,
                    end_date=seat_end,
                    auto_commit=False
                )
            else:
                await AllocationService.renew_allocation(
                    db=db,
                    tenant_id=tenant_id,
                    student_id=student.id,
                    plan_id=plan.id,
                    duration_days=plan.duration_days,
                    auto_commit=False
                )
        elif requested_seat_id:
            from app.schemas.allocation import AllocationCreate
            alloc_data = AllocationCreate(
                student_id=student.id,
                plan_id=plan.id,
                seat_id=requested_seat_id,
                start_date=seat_start,
                end_date=seat_end
            )
            await AllocationService.allocate_seat(
                db=db,
                tenant_id=tenant_id,
                data=alloc_data,
                auto_commit=False
            )

        # Atomic commit
        await db.commit()
        await db.refresh(seat_payment)
        await db.refresh(locker_payment)

        # 8. Build ReceiptDetailResponse with Line Items
        from app.models.tenant import Tenant
        tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one()

        line_items = [
            ReceiptLineItem(
                payment_id=seat_payment.id,
                payment_type="seat",
                item_type="seat",
                description=f"Seat Plan: {plan.name}",
                period_start=seat_start,
                period_end=seat_end,
                amount=seat_amount_val,
                discount=data.seat_discount,
                final_amount=seat_final
            ),
            ReceiptLineItem(
                payment_id=locker_payment.id,
                payment_type="locker",
                item_type="locker",
                description=f"Locker {locker_assignment.locker.label} ({months} Month{'s' if months > 1 else ''})",
                period_start=locker_start,
                period_end=locker_end,
                amount=locker_amount_val,
                discount=data.locker_discount,
                final_amount=locker_final
            )
        ]

        total_final = seat_final + locker_final
        total_amount = seat_amount_val + locker_amount_val
        total_discount = data.seat_discount + data.locker_discount

        return ReceiptDetailResponse(
            id=seat_payment.id,
            tenant_id=tenant_id,
            student_id=student.id,
            plan_id=plan.id,
            locker_assignment_id=locker_assignment.id,
            receipt_number=shared_receipt_id,
            receipt_id=shared_receipt_id,
            payment_type="seat+locker",
            amount=total_amount,
            discount=total_discount,
            final_amount=total_final,
            payment_mode=data.payment_mode,
            transaction_reference=data.transaction_reference,
            payment_date=today,
            period_start=min(seat_start, locker_start),
            period_end=max(seat_end, locker_end),
            next_due_date=min(seat_end, locker_end),
            status="paid",
            remarks=data.remarks or "Combined Seat + Locker Payment",
            created_at=seat_payment.created_at,
            student_name=student.full_name,
            student_phone=student.phone,
            plan_name=f"{plan.name} + Locker {locker_assignment.locker.label}",
            locker_label=locker_assignment.locker.label,
            library_name=tenant.name,
            library_address=tenant.address,
            library_phone=tenant.phone,
            library_email=tenant.email,
            currency=tenant.currency,
            line_items=line_items,
            combined_total=total_final
        )
