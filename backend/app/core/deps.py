from typing import Optional, List
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.tenant import Tenant, User

security = HTTPBearer(auto_error=False)

async def get_current_user_allow_incomplete(
    auth_header: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    Dependency for onboarding endpoints (setup-workspace, get-me, etc.).
    Allows authenticated users whose workspace/profile is not yet complete.
    """
    if not auth_header:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = auth_header.credentials
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id: str = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token claims.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    query = select(User).where(User.id == user_id, User.is_active == True)
    result = await db.execute(query)
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or account is deactivated.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return user


async def get_current_user(
    auth_header: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    Strict dependency for all standard workspace endpoints.
    Rejects incomplete users with 403 PROFILE_INCOMPLETE and unverified users with 403 EMAIL_NOT_VERIFIED.
    Guarantees user.tenant_id is a non-null string.
    """
    user = await get_current_user_allow_incomplete(auth_header=auth_header, db=db)

    if not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "EMAIL_NOT_VERIFIED", "message": "Email is not verified."}
        )

    if not user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "PROFILE_INCOMPLETE", "message": "Workspace profile is incomplete. Please complete setup."}
        )
    
    # Token claims tenant integrity check
    payload = decode_access_token(auth_header.credentials)
    token_tenant_id = payload.get("tenant_id") if payload else None
    if not token_tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "PROFILE_INCOMPLETE", "message": "Workspace profile is incomplete. Please complete setup."}
        )
    if token_tenant_id != user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token tenant claims mismatch.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user

async def get_current_tenant(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Tenant:
    query = select(Tenant).where(Tenant.id == current_user.tenant_id, Tenant.is_active == True)
    result = await db.execute(query)
    tenant = result.scalar_one_or_none()
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant workspace not found or suspended.",
        )
    return tenant

def require_roles(allowed_roles: List[str]):
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Action forbidden for role: {current_user.role}. Allowed: {allowed_roles}",
            )
        return current_user
    return role_checker
