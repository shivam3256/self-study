from datetime import timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select

from app.core.database import get_db, get_utc_now
from app.core.admin_deps import require_platform_admin
from app.models.tenant import Tenant, User
from app.models.student import Student
from app.models.reminder import ReminderLog
from app.models.platform_admin import PlatformAdmin
from app.schemas.platform_admin import (
    AdminDashboardResponse,
    SignupMetrics,
    SubscriptionMetrics,
)

admin_dashboard_router = APIRouter(prefix="/dashboard", tags=["Platform Admin Dashboard"])

# Tier monthly pricing in INR for MRR calculation
TIER_PRICING = {
    "starter": 999.0,
    "pro": 1999.0,
    "enterprise": 4999.0,
}


@admin_dashboard_router.get("", response_model=AdminDashboardResponse)
async def get_dashboard_metrics(
    current_admin: PlatformAdmin = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    now = get_utc_now()
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)

    # Total libraries
    total_libraries = (await db.execute(select(func.count(Tenant.id)))).scalar() or 0

    # Total library owners
    total_owners = (
        await db.execute(select(func.count(User.id)).where(User.role == "owner"))
    ).scalar() or 0

    # Total students across all libraries
    total_students = (await db.execute(select(func.count(Student.id)))).scalar() or 0

    # Subscriptions breakdown
    subs_breakdown_res = await db.execute(
        select(Tenant.subscription_status, func.count(Tenant.id)).group_by(Tenant.subscription_status)
    )
    status_counts = {row[0]: row[1] for row in subs_breakdown_res.fetchall()}
    subs_metrics = SubscriptionMetrics(
        active=status_counts.get("active", 0),
        expired=status_counts.get("expired", 0),
        trial=status_counts.get("trial", 0),
        suspended=status_counts.get("suspended", 0),
    )

    # Estimated MRR from active subscriptions
    active_tiers_res = await db.execute(
        select(Tenant.subscription_tier, func.count(Tenant.id))
        .where(Tenant.subscription_status == "active")
        .group_by(Tenant.subscription_tier)
    )
    mrr = 0.0
    for tier, count in active_tiers_res.fetchall():
        tier_price = TIER_PRICING.get((tier or "pro").lower(), 1999.0)
        mrr += tier_price * count

    # Signups
    week_signups = (
        await db.execute(select(func.count(Tenant.id)).where(Tenant.created_at >= seven_days_ago))
    ).scalar() or 0
    month_signups = (
        await db.execute(select(func.count(Tenant.id)).where(Tenant.created_at >= thirty_days_ago))
    ).scalar() or 0
    signup_metrics = SignupMetrics(this_week=week_signups, this_month=month_signups)

    # SMS / Reminders sent this month
    sms_month = (
        await db.execute(
            select(func.count(ReminderLog.id)).where(
                ReminderLog.status == "sent",
                ReminderLog.created_at >= thirty_days_ago
            )
        )
    ).scalar() or 0

    return AdminDashboardResponse(
        total_libraries=total_libraries,
        total_library_owners=total_owners,
        total_students=total_students,
        subscriptions=subs_metrics,
        mrr=mrr,
        new_signups=signup_metrics,
        sms_sent_this_month=sms_month,
    )
