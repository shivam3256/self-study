import math
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import desc, func, select

from app.core.database import get_db
from app.core.admin_deps import require_platform_admin
from app.models.platform_admin import PlatformAdmin, AdminAuditLog
from app.schemas.platform_admin import AdminAuditLogItem, AdminAuditLogResponse

admin_audit_logs_router = APIRouter(prefix="/audit-logs", tags=["Platform Admin Audit Logs"])


@admin_audit_logs_router.get("", response_model=AdminAuditLogResponse)
async def list_audit_logs(
    admin_id: Optional[str] = Query(None, description="Filter by admin ID"),
    action: Optional[str] = Query(None, description="Filter by action name"),
    target_type: Optional[str] = Query(None, description="Filter by target type (tenant, platform_admin, etc.)"),
    target_id: Optional[str] = Query(None, description="Filter by target entity ID"),
    start_date: Optional[datetime] = Query(None, description="Filter records on or after this timestamp"),
    end_date: Optional[datetime] = Query(None, description="Filter records on or before this timestamp"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    current_admin: PlatformAdmin = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    conditions = []

    if admin_id:
        conditions.append(AdminAuditLog.admin_id == admin_id)
    if action:
        conditions.append(AdminAuditLog.action == action.strip())
    if target_type:
        conditions.append(AdminAuditLog.target_type == target_type.strip())
    if target_id:
        conditions.append(AdminAuditLog.target_id == target_id.strip())
    if start_date:
        conditions.append(AdminAuditLog.created_at >= start_date)
    if end_date:
        conditions.append(AdminAuditLog.created_at <= end_date)

    # Count total
    count_stmt = select(func.count(AdminAuditLog.id))
    if conditions:
        count_stmt = count_stmt.where(*conditions)
    total = (await db.execute(count_stmt)).scalar() or 0

    # Paginate
    offset = (page - 1) * page_size
    query = (
        select(AdminAuditLog, PlatformAdmin.email)
        .outerjoin(PlatformAdmin, AdminAuditLog.admin_id == PlatformAdmin.id)
        .where(*conditions)
        .order_by(desc(AdminAuditLog.created_at))
        .offset(offset)
        .limit(page_size)
    )
    rows = (await db.execute(query)).all()

    items = []
    for log_item, admin_email in rows:
        items.append(
            AdminAuditLogItem(
                id=log_item.id,
                admin_id=log_item.admin_id,
                admin_email=admin_email or ("System" if not log_item.admin_id else "Unknown"),
                action=log_item.action,
                target_type=log_item.target_type,
                target_id=log_item.target_id,
                before_json=log_item.before_json,
                after_json=log_item.after_json,
                reason=log_item.reason,
                ip=log_item.ip,
                user_agent=log_item.user_agent,
                created_at=log_item.created_at,
            )
        )

    total_pages = math.ceil(total / page_size) if page_size > 0 else 1

    return AdminAuditLogResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )
