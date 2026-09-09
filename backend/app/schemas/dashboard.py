from typing import List, Optional
from decimal import Decimal
from pydantic import BaseModel

class ShiftOccupancyStat(BaseModel):
    shift_id: str
    shift_name: str
    shift_code: str
    start_time: str
    end_time: str
    capacity: int
    occupied_count: int
    occupancy_rate: float

class DashboardSummary(BaseModel):
    total_active_students: int
    total_desks: int
    total_occupied_desks_now: int
    overall_occupancy_percentage: float
    today_checkins_count: int
    revenue_today: Decimal
    revenue_this_month: Decimal
    expiring_soon_count: int  # next 7 days
    overdue_students_count: int
    shifts_breakdown: List[ShiftOccupancyStat]
