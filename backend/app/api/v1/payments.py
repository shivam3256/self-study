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
from app.models.locker import Locker, LockerAssignment
from app.schemas.payment import PaymentCreate, PaymentResponse, ReceiptDetailResponse, ReceiptLineItem
from app.services.payment_service import PaymentService

router = APIRouter(prefix="/payments", tags=["Payments & Receipts"])

@router.get("", response_model=List[PaymentResponse])
async def list_payments(
    student_id: Optional[str] = Query(None),
    payment_type: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(Payment)
        .options(
            selectinload(Payment.student),
            selectinload(Payment.plan),
            selectinload(Payment.locker_assignment).selectinload(LockerAssignment.locker)
        )
        .where(Payment.tenant_id == current_user.tenant_id)
    )
    if student_id:
        query = query.where(Payment.student_id == student_id)
    if payment_type and payment_type != "all":
        query = query.where(Payment.payment_type == payment_type)

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
        if p.locker_assignment and p.locker_assignment.locker:
            resp.locker_label = p.locker_assignment.locker.label
        output.append(resp)
    return output

@router.post("", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def record_payment(
    data: PaymentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    payment = await PaymentService.record_payment(db, current_user.tenant_id, data)
    
    # Reload with student & plan & locker
    query = (
        select(Payment)
        .options(
            selectinload(Payment.student),
            selectinload(Payment.plan),
            selectinload(Payment.locker_assignment).selectinload(LockerAssignment.locker)
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
    if loaded.locker_assignment and loaded.locker_assignment.locker:
        resp.locker_label = loaded.locker_assignment.locker.label
    return resp

@router.get("/{payment_id}/receipt", response_model=ReceiptDetailResponse)
async def get_receipt(
    payment_id: str,
    current_user: User = Depends(get_current_user),
    tenant: Tenant = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db)
):
    # Fetch target payment
    query = (
        select(Payment)
        .options(
            selectinload(Payment.student),
            selectinload(Payment.plan),
            selectinload(Payment.locker_assignment).selectinload(LockerAssignment.locker)
        )
        .where(Payment.id == payment_id, Payment.tenant_id == current_user.tenant_id)
    )
    res = await db.execute(query)
    payment = res.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment record not found.")

    # Find all payments sharing this receipt_id (for combined payments)
    target_receipt_id = payment.receipt_id or payment.receipt_number
    combined_query = (
        select(Payment)
        .options(
            selectinload(Payment.student),
            selectinload(Payment.plan),
            selectinload(Payment.locker_assignment).selectinload(LockerAssignment.locker)
        )
        .where(
            Payment.tenant_id == current_user.tenant_id,
            or_(
                Payment.receipt_id == target_receipt_id,
                Payment.receipt_number == target_receipt_id,
                Payment.id == payment.id
            )
        )
        .order_by(Payment.payment_type.desc())
    )
    all_payments = (await db.execute(combined_query)).scalars().all()

    # Build line items
    line_items = []
    total_amount = Decimal("0.00")
    total_discount = Decimal("0.00")
    total_final = Decimal("0.00")

    for p in all_payments:
        if p.payment_type == "seat":
            desc = f"Seat Plan: {p.plan.name if p.plan else 'Standard Desk Subscription'}"
        elif p.payment_type == "locker":
            lbl = p.locker_assignment.locker.label if (p.locker_assignment and p.locker_assignment.locker) else "Locker"
            desc = f"Locker {lbl} Rent"
        elif p.payment_type == "deposit":
            lbl = p.locker_assignment.locker.label if (p.locker_assignment and p.locker_assignment.locker) else ""
            desc = f"Refundable Security Deposit{' (Locker ' + lbl + ')' if lbl else ''}"
        else:
            desc = p.remarks or "Service Charge"

        line_items.append(
            ReceiptLineItem(
                payment_id=p.id,
                payment_type=p.payment_type,
                description=desc,
                period_start=p.period_start,
                period_end=p.period_end,
                amount=p.amount,
                discount=p.discount,
                final_amount=p.final_amount
            )
        )
        total_amount += p.amount
        total_discount += p.discount
        total_final += p.final_amount

    locker_lbl = payment.locker_assignment.locker.label if (payment.locker_assignment and payment.locker_assignment.locker) else None
    plan_nm = payment.plan.name if payment.plan else None
    if len(all_payments) > 1:
        types_str = " + ".join(dict.fromkeys(p.payment_type.capitalize() for p in all_payments))
        plan_nm = f"Combined Invoice ({types_str})"

    resp = ReceiptDetailResponse(
        id=payment.id,
        tenant_id=payment.tenant_id,
        student_id=payment.student_id,
        plan_id=payment.plan_id,
        locker_assignment_id=payment.locker_assignment_id,
        receipt_number=target_receipt_id,
        receipt_id=target_receipt_id,
        payment_type="combined" if len(all_payments) > 1 else payment.payment_type,
        amount=total_amount,
        discount=total_discount,
        final_amount=total_final,
        payment_mode=payment.payment_mode,
        transaction_reference=payment.transaction_reference,
        payment_date=payment.payment_date,
        period_start=min((p.period_start for p in all_payments), default=payment.period_start),
        period_end=max((p.period_end for p in all_payments), default=payment.period_end),
        next_due_date=min((p.next_due_date for p in all_payments), default=payment.next_due_date),
        status=payment.status,
        remarks=payment.remarks,
        created_at=payment.created_at,
        student_name=payment.student.full_name if payment.student else "Student",
        student_phone=payment.student.phone if payment.student else "",
        plan_name=plan_nm,
        locker_label=locker_lbl,
        library_name=tenant.name,
        library_address=tenant.address,
        library_phone=tenant.phone,
        library_email=tenant.email,
        currency=tenant.currency,
        line_items=line_items,
        combined_total=total_final
    )
    return resp

@router.get("/outstanding-dues")
async def get_outstanding_dues(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    today = date.today()
    # 1. Query students whose seat membership is expired
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
            "due_type": "seat",
            "student_id": s.id,
            "student_name": s.full_name,
            "phone": s.phone,
            "admission_number": s.admission_number,
            "expiry_date": s.expiry_date.isoformat() if s.expiry_date else None,
            "days_overdue": days_overdue,
            "status": s.status,
            "label": "Seat Membership"
        })

    # 2. Query overdue lockers (paid_until < today and status == 'active')
    from app.models.locker import LockerAssignment
    locker_dues_q = (
        select(LockerAssignment)
        .options(
            selectinload(LockerAssignment.student),
            selectinload(LockerAssignment.locker)
        )
        .where(
            LockerAssignment.tenant_id == current_user.tenant_id,
            LockerAssignment.status == "active",
            LockerAssignment.paid_until < today
        )
        .order_by(LockerAssignment.paid_until.asc())
    )
    locker_res = await db.execute(locker_dues_q)
    overdue_lockers = locker_res.scalars().all()

    for la in overdue_lockers:
        days_overdue = (today - la.paid_until).days
        dues_list.append({
            "due_type": "locker",
            "student_id": la.student_id,
            "student_name": la.student.full_name if la.student else "Student",
            "phone": la.student.phone if la.student else "",
            "admission_number": la.student.admission_number if la.student else "",
            "expiry_date": la.paid_until.isoformat(),
            "days_overdue": days_overdue,
            "status": "overdue",
            "locker_id": la.locker_id,
            "locker_label": la.locker.label if la.locker else "Locker",
            "monthly_fee": float(la.monthly_fee),
            "label": f"Locker {la.locker.label if la.locker else ''}"
        })

    return {
        "count": len(dues_list),
        "dues": dues_list
    }
