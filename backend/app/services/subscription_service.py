from datetime import timedelta
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_utc_now
from app.models.tenant import Tenant


class SubscriptionService:
    @staticmethod
    async def process_expiries(db: AsyncSession) -> int:
        """
        Evaluates tenant SaaS subscriptions and transitions expired ones.
        CRITICAL GUARD: Skips any tenant where manually_overridden is True.
        """
        now = get_utc_now()
        stmt = (
            select(Tenant)
            .where(
                Tenant.manually_overridden == False,
                Tenant.subscription_expires_at.is_not(None),
                Tenant.subscription_expires_at < now,
                Tenant.subscription_status.in_(["active", "trial"]),
            )
        )
        res = await db.execute(stmt)
        expired_tenants = res.scalars().all()
        count = 0
        for t in expired_tenants:
            t.subscription_status = "expired"
            count += 1
        if count > 0:
            await db.commit()
        return count

    @staticmethod
    async def apply_automated_renewal(
        db: AsyncSession,
        tenant_id: str,
        new_tier: Optional[str] = None,
        extend_days: int = 30,
        source: str = "webhook",
    ) -> bool:
        """
        Applies an automated renewal or payment webhook to a tenant subscription.
        CRITICAL GUARD: If manually_overridden is True, this returns False and
        refuses to overwrite the manual admin configuration.
        """
        stmt = select(Tenant).where(Tenant.id == tenant_id)
        tenant = (await db.execute(stmt)).scalar_one_or_none()
        if not tenant:
            return False

        if tenant.manually_overridden:
            # Manually overridden by super admin - automated systems must not overwrite!
            return False

        now = get_utc_now()
        base = (
            tenant.subscription_expires_at
            if (tenant.subscription_expires_at and tenant.subscription_expires_at > now)
            else now
        )
        tenant.subscription_expires_at = base + timedelta(days=extend_days)
        tenant.subscription_status = "active"
        if new_tier:
            tenant.subscription_tier = new_tier
        await db.commit()
        return True
