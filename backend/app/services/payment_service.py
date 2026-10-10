from datetime import date, timedelta
from decimal import Decimal
from typing import Optional
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.models.payment import Payment
from app.models.student import Student
from app.models.plan import Plan
from app.models.allocation import Allocation
from app.schemas.payment import PaymentCreate
from app.schemas.allocation import AllocationCreate
from app.services.allocation_service import AllocationService

class PaymentService:
    @staticmethod
    async def record_payment(
        db: AsyncSession,
        tenant_id: str,
        data: PaymentCreate
    ) -> Payment:
        # 1. Validate student
        student_query = select(Student).where(Student.id == data.student_id, Student.tenant_id == tenant_id)
        student_res = await db.execute(student_query)
        student = student_res.scalar_one_or_none()
        if not student:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

        # 2. Plan if provided
        plan = None
        duration_days = 30
        if data.plan_id:
            plan_query = (
                select(Plan)
                .options(selectinload(Plan.plan_shifts))
                .where(Plan.id == data.plan_id, Plan.tenant_id == tenant_id)
            )
            plan_res = await db.execute(plan_query)
            plan = plan_res.scalar_one_or_none()
            if plan:
                duration_days = plan.duration_days

        payment_date = data.payment_date or date.today()
        
        # Determine period start
        if data.period_start:
            period_start = data.period_start
        elif student.expiry_date:
            period_start = student.expiry_date + timedelta(days=1)
        else:
            period_start = payment_date

        # Determine period end
        if data.period_end:
            period_end = data.period_end
        else:
            period_end = period_start + timedelta(days=duration_days - 1)

        next_due_date = period_end

        # Calculate final amount
        final_amount = data.amount - data.discount
        if final_amount < 0:
            final_amount = Decimal("0.00")

        # Generate unique sequential receipt number
        current_year = payment_date.year
        count_query = select(func.count(Payment.id)).where(Payment.tenant_id == tenant_id)
        count_res = await db.execute(count_query)
        total_payments = count_res.scalar_one() or 0
        receipt_number = f"REC-{current_year}-{(total_payments + 1):04d}"

        # 3. Create Payment record
        payment = Payment(
            tenant_id=tenant_id,
            student_id=data.student_id,
            plan_id=data.plan_id,
            receipt_number=receipt_number,
            amount=data.amount,
            discount=data.discount,
            final_amount=final_amount,
            payment_mode=data.payment_mode,
            transaction_reference=data.transaction_reference,
            payment_date=payment_date,
            period_start=period_start,
            period_end=period_end,
            next_due_date=next_due_date,
            status="paid",
            remarks=data.remarks
        )
        db.add(payment)

        # 4. Atomic Allocation Creation / Renewal
        # Check if student already has an active or overdue allocation
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
        existing_alloc_res = await db.execute(existing_alloc_q)
        existing_alloc = existing_alloc_res.scalars().first()

        requested_seat_id = data.seat_id or data.desk_id

        if existing_alloc:
            if requested_seat_id and requested_seat_id != existing_alloc.seat_id:
                # Student changed seat at renewal time: close old allocation and create new one
                await AllocationService.change_allocation(
                    db=db,
                    tenant_id=tenant_id,
                    allocation_id=existing_alloc.id,
                    new_seat_id=requested_seat_id,
                    new_plan_id=data.plan_id,
                    start_date=period_start,
                    end_date=period_end,
                    auto_commit=False
                )
            else:
                # Pure renewal: extends end_date of existing allocation without changing seat
                await AllocationService.renew_allocation(
                    db=db,
                    tenant_id=tenant_id,
                    student_id=student.id,
                    plan_id=data.plan_id,
                    duration_days=duration_days,
                    auto_commit=False
                )
        elif data.plan_id or requested_seat_id:
            # First-time allocation at billing time
            alloc_data = AllocationCreate(
                student_id=student.id,
                plan_id=data.plan_id,
                seat_id=requested_seat_id,
                start_date=period_start,
                end_date=period_end
            )
            await AllocationService.allocate_seat(
                db=db,
                tenant_id=tenant_id,
                data=alloc_data,
                auto_commit=False
            )

        # Update student expiry date and status
        if not student.expiry_date or student.expiry_date < period_end:
            student.expiry_date = period_end
        if student.status in ("expired", "suspended"):
            student.status = "active"

        # Commit atomically
        await db.commit()
        await db.refresh(payment)
        return payment
