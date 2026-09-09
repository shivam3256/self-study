from datetime import date, timedelta
from decimal import Decimal
from typing import Optional
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.payment import Payment
from app.models.student import Student
from app.models.plan import Plan
from app.schemas.payment import PaymentCreate

class PaymentService:
    @staticmethod
    async def record_payment(
        db: AsyncSession,
        tenant_id: str,
        data: PaymentCreate
    ) -> Payment:
        # Validate student
        student_query = select(Student).where(Student.id == data.student_id, Student.tenant_id == tenant_id)
        student_res = await db.execute(student_query)
        student = student_res.scalar_one_or_none()
        if not student:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

        # Plan if provided
        plan = None
        duration_days = 30
        if data.plan_id:
            plan_query = select(Plan).where(Plan.id == data.plan_id, Plan.tenant_id == tenant_id)
            plan_res = await db.execute(plan_query)
            plan = plan_res.scalar_one_or_none()
            if plan:
                duration_days = plan.duration_days

        payment_date = data.payment_date or date.today()
        
        # Determine period start
        if data.period_start:
            period_start = data.period_start
        elif student.expiry_date and student.expiry_date >= payment_date:
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

        # Update student expiry date and status
        if not student.expiry_date or student.expiry_date < period_end:
            student.expiry_date = period_end
        if student.status == "expired":
            student.status = "active"

        await db.commit()
        await db.refresh(payment)
        return payment
