"""Locker business rule settings and configurable constants.
These configure default behaviors for locker allocation, renewal, and mid-period billing.
"""
from datetime import date
from decimal import Decimal
from typing import Optional

# Setting: Whether to pro-rate mid-period assignments or charge the full month
# Default: False (charge full month). Change to True to enable pro-rated billing.
LOCKER_PRORATE_MID_PERIOD: bool = False

# Setting: Align default assignment start/renewal date with seat expiry date if available
LOCKER_ALIGN_WITH_SEAT_EXPIRY: bool = True

# Setting: Default rental cycle in months (standard is 1 month)
LOCKER_DEFAULT_DURATION_MONTHS: int = 1

# Setting: Maximum active lockers allowed per student (default 1)
MAX_ACTIVE_LOCKERS_PER_STUDENT: int = 1

# Setting: Allow deposit to be optional (True means deposit amount can be 0.00)
LOCKER_DEPOSIT_OPTIONAL: bool = True


def calculate_locker_fee(
    monthly_fee: Decimal,
    months: int = 1,
    start_date: Optional[date] = None,
    prorate: Optional[bool] = None
) -> Decimal:
    """Calculates fee for locker assignment or renewal.
    Supports full-month charging or pro-rating if configured.
    """
    use_prorate = LOCKER_PRORATE_MID_PERIOD if prorate is None else prorate
    
    if not use_prorate or not start_date:
        return Decimal(str(monthly_fee)) * Decimal(str(months))

    # Pro-rating calculation based on days remaining in the month
    import calendar
    days_in_month = calendar.monthrange(start_date.year, start_date.month)[1]
    days_remaining = days_in_month - start_date.day + 1
    fraction = Decimal(str(days_remaining)) / Decimal(str(days_in_month))
    first_month_fee = Decimal(str(monthly_fee)) * fraction

    if months > 1:
        remaining_months_fee = Decimal(str(monthly_fee)) * Decimal(str(months - 1))
        return round(first_month_fee + remaining_months_fee, 2)
    return round(first_month_fee, 2)
