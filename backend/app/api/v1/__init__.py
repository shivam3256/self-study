from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.students import router as students_router
from app.api.v1.shifts import router as shifts_router
from app.api.v1.plans import router as plans_router
from app.api.v1.desks import router as desks_router
from app.api.v1.allocations import router as allocations_router
from app.api.v1.payments import router as payments_router
from app.api.v1.attendance import router as attendance_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.reminders import router as reminders_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(students_router)
api_router.include_router(shifts_router)
api_router.include_router(plans_router)
api_router.include_router(desks_router)
api_router.include_router(allocations_router)
api_router.include_router(payments_router)
api_router.include_router(attendance_router)
api_router.include_router(dashboard_router)
api_router.include_router(reminders_router)
