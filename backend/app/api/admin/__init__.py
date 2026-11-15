from fastapi import APIRouter
from app.api.admin.auth import admin_auth_router
from app.api.admin.dashboard import admin_dashboard_router
from app.api.admin.libraries import admin_libraries_router
from app.api.admin.audit_logs import admin_audit_logs_router

admin_api_router = APIRouter()
admin_api_router.include_router(admin_auth_router)
admin_api_router.include_router(admin_dashboard_router)
admin_api_router.include_router(admin_libraries_router)
admin_api_router.include_router(admin_audit_logs_router)
