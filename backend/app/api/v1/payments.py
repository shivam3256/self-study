from datetime import date
from typing import List, Optional
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user, get_current_tenant
from app.models.tenant import User, Tenant
from app.models.payment import Payment
from app.models.student import Student
from app.models.plan import Plan
from app.schemas.payment import PaymentCreate, PaymentResponse, ReceiptDetailResponse
from app.services.payment_service import PaymentService

router = APIRouter(prefix="/payments", tags=["Payments & Receipts"])

@router.get("", response_model=List[PaymentResponse])
async def list_payments(
    student_id: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(Payment)
        .options(
            selectinload(Payment.student),
            selectinload(Payment.plan)
        )
        .where(Payment.tenant_id == current_user.tenant_id)
    )
    if student_id:
        query = query.where(Payment.student_id == student_id)

    query = query.order_by(Payment.created_at.desc()).offset(skip).limit(limit)
    res = await db.execute(query)
    payments = res.scalars().all()

    output = []
    for p in payments:
        resp = PaymentResponse.model_validate(p)
        if p.student:
            resp.student_name = p.student.full_name
            resp.student_phone = p.student.phone
        if p.plan:
            resp.plan_name = p.plan.name
        output.append(resp)
    return output

@router.post("", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def record_payment(
    data: PaymentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    payment = await PaymentService.record_payment(db, current_user.tenant_id, data)
    
    # Reload with student & plan
    query = (
        select(Payment)
        .options(
            selectinload(Payment.student),
            selectinload(Payment.plan)
        )
        .where(Payment.id == payment.id)
    )
    res = await db.execute(query)
    loaded = res.scalar_one()

    resp = PaymentResponse.model_validate(loaded)
    if loaded.student:
        resp.student_name = loaded.student.full_name
        resp.student_phone = loaded.student.phone
    if loaded.plan:
        resp.plan_name = loaded.plan.name
    return resp

@router.get("/{payment_id}/receipt", response_model=ReceiptDetailResponse)
async def get_receipt(
    payment_id: str,
    current_user: User = Depends(get_current_user),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(Payment)
        .options(
            selectinload(Payment.student),
            selectinload(Payment.plan)
        )
        .where(Payment.id == payment_id, Payment.tenant_id == current_user.tenant_id)
    )
    res = await db.execute(query)
    payment = res.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment record not found.")

    resp = ReceiptDetailResponse(
        id=payment.id,
        tenant_id=payment.tenant_id,
        student_id=payment.student_id,
        plan_id=payment.plan_id,
        receipt_number=payment.receipt_number,
        amount=payment.amount,
        discount=payment.discount,
        final_amount=payment.final_amount,
        payment_mode=payment.payment_mode,
        transaction_reference=payment.transaction_reference,
        payment_date=payment.payment_date,
        period_start=payment.period_start,
        period_end=payment.period_end,
        next_due_date=payment.next_due_date,
        status=payment.status,
        remarks=payment.remarks,
        created_at=payment.created_at,
        student_name=payment.student.full_name if payment.student else "Student",
        student_phone=payment.student.phone if payment.student else "",
        plan_name=payment.plan.name if payment.plan else "Custom Plan",
        library_name=tenant.name,
        library_address=tenant.address,
        library_phone=tenant.phone,
        library_email=tenant.email,
        currency=tenant.currency
    )
    return resp

@router.get("/outstanding-dues")
async def get_outstanding_dues(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    today = date.today()
    # Query students whose expiry_date is null or less than today, or expiring within 7 days
    query = (
        select(Student)
        .where(
            Student.tenant_id == current_user.tenant_id,
            Student.status.in_(["active", "expired"]),
            Student.expiry_date != None,
            Student.expiry_date <= today
        )
        .order_by(Student.expiry_date.asc())
    )
    res = await db.execute(query)
    overdue_students = res.scalars().all()

    dues_list = []
    for s in overdue_students:
        days_overdue = (today - s.expiry_date).days if s.expiry_date else 0
        dues_list.append({
            "student_id": s.id,
            "student_name": s.full_name,
            "phone": s.phone,
            "admission_number": s.admission_number,
            "expiry_date": s.expiry_date.isoformat() if s.expiry_date else None,
            "days_overdue": days_overdue,
            "status": s.status
        })

    return {
        "count": len(dues_list),
        "dues": dues_list
    }
