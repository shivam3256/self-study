import math
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import desc, asc, func, or_, select

from app.core.database import get_db, get_utc_now
from app.core.admin_deps import (
    get_client_ip,
    get_user_agent,
    log_admin_action,
    require_platform_admin,
)
from app.models.tenant import Tenant, User
from app.models.student import Student
from app.models.desk import Desk
from app.models.locker import Locker, LockerAssignment
from app.models.allocation import Allocation
from app.models.reminder import ReminderLog
from app.models.platform_admin import PlatformAdmin, AdminAuditLog
from app.schemas.platform_admin import (
    ClearSubscriptionOverrideRequest,
    LibraryDetailResponse,
    LibraryListItem,
    LibraryListResponse,
    LibraryUsageMetrics,
    ManualSubscriptionOverrideRequest,
)

admin_libraries_router = APIRouter(prefix="/libraries", tags=["Platform Admin Libraries"])


@admin_libraries_router.get("", response_model=LibraryListResponse)
async def list_libraries(
    search: Optional[str] = Query(None, description="Search by name, slug, owner name, email, or phone"),
    plan: Optional[str] = Query(None, description="Filter by subscription tier"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by subscription status"),
    expiry_filter: Optional[str] = Query(None, description="all | expired | expiring_7d | expiring_30d | active"),
    sort_by: str = Query("created_at", description="name | created_at | subscription_expires_at"),
    sort_order: str = Query("desc", description="asc | desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_admin: PlatformAdmin = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    now = get_utc_now()
    conditions = []

    # Search filter
    if search:
        s = f"%{search.strip()}%"
        conditions.append(
            or_(
                Tenant.name.ilike(s),
                Tenant.slug.ilike(s),
                Tenant.owner_name.ilike(s),
                Tenant.email.ilike(s),
                Tenant.phone.ilike(s),
                Tenant.city.ilike(s),
            )
        )

    # Plan filter
    if plan:
        conditions.append(Tenant.subscription_tier == plan.strip().lower())

    # Status filter
    if status_filter:
        conditions.append(Tenant.subscription_status == status_filter.strip().lower())

    # Expiry filter
    if expiry_filter == "expired":
        conditions.append(Tenant.subscription_expires_at < now)
    elif expiry_filter == "expiring_7d":
        conditions.append(
            Tenant.subscription_expires_at >= now,
            Tenant.subscription_expires_at <= now + timedelta(days=7)
        )
    elif expiry_filter == "expiring_30d":
        conditions.append(
            Tenant.subscription_expires_at >= now,
            Tenant.subscription_expires_at <= now + timedelta(days=30)
        )
    elif expiry_filter == "active":
        conditions.append(
            or_(
                Tenant.subscription_expires_at.is_(None),
                Tenant.subscription_expires_at > now
            )
        )

    # Base query for count
    count_stmt = select(func.count(Tenant.id))
    if conditions:
        count_stmt = count_stmt.where(*conditions)
    total = (await db.execute(count_stmt)).scalar() or 0

    # Sorting
    sort_column = Tenant.created_at
    if sort_by == "name":
        sort_column = Tenant.name
    elif sort_by == "subscription_expires_at":
        sort_column = Tenant.subscription_expires_at

    order_fn = desc if sort_order.lower() == "desc" else asc

    # Fetch page of tenants
    offset = (page - 1) * page_size
    query = (
        select(Tenant)
        .where(*conditions)
        .order_by(order_fn(sort_column))
        .offset(offset)
        .limit(page_size)
    )
    tenants = (await db.execute(query)).scalars().all()

    # Pre-fetch usage aggregates for the current page tenants
    tenant_ids = [t.id for t in tenants]
    seats_map = {}
    lockers_map = {}
    students_map = {}

    if tenant_ids:
        # Seats per tenant
        seats_stmt = select(Desk.tenant_id, func.count(Desk.id)).where(Desk.tenant_id.in_(tenant_ids)).group_by(Desk.tenant_id)
        for tid, cnt in (await db.execute(seats_stmt)).fetchall():
            seats_map[tid] = cnt

        # Lockers per tenant
        lockers_stmt = select(Locker.tenant_id, func.count(Locker.id)).where(Locker.tenant_id.in_(tenant_ids)).group_by(Locker.tenant_id)
        for tid, cnt in (await db.execute(lockers_stmt)).fetchall():
            lockers_map[tid] = cnt

        # Students per tenant
        students_stmt = select(Student.tenant_id, func.count(Student.id)).where(Student.tenant_id.in_(tenant_ids)).group_by(Student.tenant_id)
        for tid, cnt in (await db.execute(students_stmt)).fetchall():
            students_map[tid] = cnt

    items = []
    for t in tenants:
        items.append(
            LibraryListItem(
                id=t.id,
                name=t.name,
                slug=t.slug,
                owner_name=t.owner_name,
                email=t.email,
                phone=t.phone,
                city=t.city,
                state=t.state,
                subscription_tier=t.subscription_tier or "pro",
                subscription_status=t.subscription_status or "active",
                subscription_expires_at=t.subscription_expires_at,
                manually_overridden=bool(t.manually_overridden),
                override_reason=t.override_reason,
                overridden_at=t.overridden_at,
                is_active=bool(t.is_active),
                created_at=t.created_at,
                seats_count=seats_map.get(t.id, 0),
                lockers_count=lockers_map.get(t.id, 0),
                students_count=students_map.get(t.id, 0),
            )
        )

    total_pages = math.ceil(total / page_size) if page_size > 0 else 1

    return LibraryListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@admin_libraries_router.get("/{library_id}", response_model=LibraryDetailResponse)
async def get_library_detail(
    library_id: str,
    current_admin: PlatformAdmin = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Tenant).where(Tenant.id == library_id)
    tenant = (await db.execute(stmt)).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Library not found")

    # Usage aggregates
    now = get_utc_now()
    month_ago = now - timedelta(days=30)

    seats_count = (await db.execute(select(func.count(Desk.id)).where(Desk.tenant_id == library_id))).scalar() or 0
    lockers_count = (await db.execute(select(func.count(Locker.id)).where(Locker.tenant_id == library_id))).scalar() or 0
    active_seat_allocs = (
        await db.execute(
            select(func.count(Allocation.id)).where(
                Allocation.tenant_id == library_id,
                Allocation.status == "active"
            )
        )
    ).scalar() or 0
    active_locker_allocs = (
        await db.execute(
            select(func.count(LockerAssignment.id)).where(
                LockerAssignment.tenant_id == library_id,
                LockerAssignment.status == "active"
            )
        )
    ).scalar() or 0
    students_count = (await db.execute(select(func.count(Student.id)).where(Student.tenant_id == library_id))).scalar() or 0
    sms_total = (await db.execute(select(func.count(ReminderLog.id)).where(ReminderLog.tenant_id == library_id, ReminderLog.status == "sent"))).scalar() or 0
    sms_month = (
        await db.execute(
            select(func.count(ReminderLog.id)).where(
                ReminderLog.tenant_id == library_id,
                ReminderLog.status == "sent",
                ReminderLog.created_at >= month_ago
            )
        )
    ).scalar() or 0

    usage = LibraryUsageMetrics(
        seats_count=seats_count,
        lockers_count=lockers_count,
        active_seat_allocations=active_seat_allocs,
        active_locker_allocations=active_locker_allocs,
        students_count=students_count,
        sms_total_count=sms_total,
        sms_month_count=sms_month,
    )

    # Recent audit activity regarding this library
    activity_stmt = (
        select(AdminAuditLog, PlatformAdmin.email)
        .outerjoin(PlatformAdmin, AdminAuditLog.admin_id == PlatformAdmin.id)
        .where(AdminAuditLog.target_id == library_id)
        .order_by(desc(AdminAuditLog.created_at))
        .limit(10)
    )
    activity_res = await db.execute(activity_stmt)
    recent_activity = []
    for log_item, admin_email in activity_res.all():
        recent_activity.append({
            "id": log_item.id,
            "action": log_item.action,
            "admin_email": admin_email or "System",
            "reason": log_item.reason,
            "before": log_item.before_json,
            "after": log_item.after_json,
            "created_at": log_item.created_at.isoformat() if log_item.created_at else None,
        })

    return LibraryDetailResponse(
        id=tenant.id,
        name=tenant.name,
        slug=tenant.slug,
        owner_name=tenant.owner_name,
        email=tenant.email,
        phone=tenant.phone,
        address=tenant.address,
        city=tenant.city,
        state=tenant.state,
        pincode=tenant.pincode,
        additional_email=tenant.additional_email,
        subscription_tier=tenant.subscription_tier or "pro",
        subscription_status=tenant.subscription_status or "active",
        subscription_expires_at=tenant.subscription_expires_at,
        manually_overridden=bool(tenant.manually_overridden),
        override_reason=tenant.override_reason,
        overridden_by=tenant.overridden_by,
        overridden_at=tenant.overridden_at,
        is_active=bool(tenant.is_active),
        created_at=tenant.created_at,
        usage=usage,
        recent_activity=recent_activity,
    )


@admin_libraries_router.post("/{library_id}/subscription", response_model=LibraryDetailResponse)
async def manual_subscription_override(
    library_id: str,
    payload: ManualSubscriptionOverrideRequest,
    request: Request,
    current_admin: PlatformAdmin = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Tenant).where(Tenant.id == library_id)
    tenant = (await db.execute(stmt)).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Library not found")

    client_ip = get_client_ip(request)
    ua = get_user_agent(request)
    now = get_utc_now()

    # Capture BEFORE state
    before_state = {
        "subscription_tier": tenant.subscription_tier,
        "subscription_status": tenant.subscription_status,
        "subscription_expires_at": tenant.subscription_expires_at.isoformat() if tenant.subscription_expires_at else None,
        "is_active": tenant.is_active,
        "manually_overridden": tenant.manually_overridden,
        "override_reason": tenant.override_reason,
    }

    # Apply updates
    if payload.subscription_tier is not None:
        tenant.subscription_tier = payload.subscription_tier.strip().lower()

    if payload.subscription_status is not None:
        tenant.subscription_status = payload.subscription_status.strip().lower()

    if payload.extend_days is not None:
        base_date = tenant.subscription_expires_at if (tenant.subscription_expires_at and tenant.subscription_expires_at > now) else now
        tenant.subscription_expires_at = base_date + timedelta(days=payload.extend_days)
    elif payload.subscription_expires_at is not None:
        tenant.subscription_expires_at = payload.subscription_expires_at

    if payload.is_active is not None:
        tenant.is_active = payload.is_active

    # Set manual override lock
    tenant.manually_overridden = True
    tenant.override_reason = payload.reason
    tenant.overridden_by = current_admin.id
    tenant.overridden_at = now

    # Capture AFTER state
    after_state = {
        "subscription_tier": tenant.subscription_tier,
        "subscription_status": tenant.subscription_status,
        "subscription_expires_at": tenant.subscription_expires_at.isoformat() if tenant.subscription_expires_at else None,
        "is_active": tenant.is_active,
        "manually_overridden": tenant.manually_overridden,
        "override_reason": tenant.override_reason,
    }

    # Append to AdminAuditLog
    await log_admin_action(
        db=db,
        admin_id=current_admin.id,
        action="manual_subscription_override",
        target_type="tenant",
        target_id=tenant.id,
        before_json=before_state,
        after_json=after_state,
        reason=payload.reason,
        ip=client_ip,
        user_agent=ua,
    )

    await db.commit()
    await db.refresh(tenant)

    # Return full updated detail
    return await get_library_detail(library_id=tenant.id, current_admin=current_admin, db=db)


@admin_libraries_router.post("/{library_id}/clear-override", response_model=LibraryDetailResponse)
async def clear_subscription_override(
    library_id: str,
    payload: ClearSubscriptionOverrideRequest,
    request: Request,
    current_admin: PlatformAdmin = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Tenant).where(Tenant.id == library_id)
    tenant = (await db.execute(stmt)).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Library not found")

    client_ip = get_client_ip(request)
    ua = get_user_agent(request)
    now = get_utc_now()

    before_state = {
        "manually_overridden": tenant.manually_overridden,
        "override_reason": tenant.override_reason,
        "overridden_by": tenant.overridden_by,
        "overridden_at": tenant.overridden_at.isoformat() if tenant.overridden_at else None,
    }

    tenant.manually_overridden = False
    tenant.override_reason = None
    tenant.overridden_by = None
    tenant.overridden_at = None

    after_state = {
        "manually_overridden": False,
        "override_reason": None,
        "overridden_by": None,
        "overridden_at": None,
    }

    await log_admin_action(
        db=db,
        admin_id=current_admin.id,
        action="clear_subscription_override",
        target_type="tenant",
        target_id=tenant.id,
        before_json=before_state,
        after_json=after_state,
        reason=payload.reason,
        ip=client_ip,
        user_agent=ua,
    )

    await db.commit()
    await db.refresh(tenant)

    return await get_library_detail(library_id=tenant.id, current_admin=current_admin, db=db)
