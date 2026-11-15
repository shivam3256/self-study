from datetime import datetime, timezone
from typing import Any, Dict, Optional
from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_db, get_utc_now
from app.core.admin_security import (
    decode_admin_token,
    AUDIENCE_ADMIN_ACCESS,
)
from app.models.platform_admin import PlatformAdmin, AdminAuditLog

security = HTTPBearer(auto_error=False)


def check_admin_network_security(request: Request):
    """
    Check IP allowlist and optional subdomain. If unauthorized, returns 404 to avoid
    disclosing the existence of the admin endpoint.
    """
    # 1. IP Allowlist check if enabled
    if settings.ADMIN_IP_ALLOWLIST:
        allowed_ips = [ip.strip() for ip in settings.ADMIN_IP_ALLOWLIST.split(",") if ip.strip()]
        client_ip = (
            request.headers.get("x-forwarded-for", "").split(",")[0].strip()
            or (request.client.host if request.client else "")
        )
        if allowed_ips and client_ip not in allowed_ips:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Not Found"
            )

    # 2. Subdomain check if enabled
    if settings.ADMIN_SUBDOMAIN:
        host = request.headers.get("host", "").split(":")[0].strip()
        if host and host != settings.ADMIN_SUBDOMAIN.strip():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Not Found"
            )


def get_client_ip(request: Request) -> str:
    return (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "127.0.0.1")
    )


def get_user_agent(request: Request) -> str:
    return request.headers.get("user-agent", "")[:500]


async def log_admin_action(
    db: AsyncSession,
    action: str,
    target_type: str,
    target_id: Optional[str] = None,
    admin_id: Optional[str] = None,
    before_json: Optional[Dict[str, Any]] = None,
    after_json: Optional[Dict[str, Any]] = None,
    reason: Optional[str] = None,
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> AdminAuditLog:
    """
    Append-only logging of administrative actions to admin_audit_log.
    """
    log_entry = AdminAuditLog(
        admin_id=admin_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        before_json=before_json,
        after_json=after_json,
        reason=reason,
        ip=ip,
        user_agent=user_agent,
    )
    db.add(log_entry)
    await db.commit()
    await db.refresh(log_entry)
    return log_entry


async def require_platform_admin(
    request: Request,
    response: Response,
    auth_header: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> PlatformAdmin:
    """
    Strict dependency for platform admin endpoints.
    Returns 404 NOT FOUND (instead of 401/403) for any unauthenticated,
    invalid, or tenant token request to keep the hidden URL private.
    """
    # Ensure network checks (IP allowlist, subdomain)
    check_admin_network_security(request)

    # Set noindex header on all responses traversing the admin dependency
    response.headers["X-Robots-Tag"] = "noindex, nofollow"

    if not auth_header or not auth_header.credentials:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not Found"
        )

    token = auth_header.credentials
    payload = decode_admin_token(
        token=token,
        expected_audience=AUDIENCE_ADMIN_ACCESS,
        expected_scope="admin_access"
    )
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not Found"
        )

    admin_id: str = payload.get("sub")
    if not admin_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not Found"
        )

    # Retrieve admin from database
    query = select(PlatformAdmin).where(PlatformAdmin.id == admin_id)
    res = await db.execute(query)
    admin = res.scalar_one_or_none()

    if not admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not Found"
        )

    # Check if locked out
    now = get_utc_now()
    if admin.locked_until:
        locked = admin.locked_until if admin.locked_until.tzinfo else admin.locked_until.replace(tzinfo=timezone.utc)
        if locked > now:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Not Found"
            )

    return admin
