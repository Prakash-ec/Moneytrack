from datetime import date, timedelta

from app.core.time import today_ist
from app.services.errors import PeriodError

MAX_RANGE_DAYS = 3660


def resolve_period(start_date: date | None, end_date: date | None) -> tuple[date, date]:
    """Resolve optional query dates into an inclusive, validated range.

    Defaults to the current month up to today in Asia/Kolkata.
    """
    today = today_ist()
    end = end_date or (start_date if start_date and start_date > today else today)
    start = start_date or end.replace(day=1)
    if start > end:
        raise PeriodError("Start date must be on or before end date.")
    if (end - start).days + 1 > MAX_RANGE_DAYS:
        raise PeriodError("Date range is too large. Choose a range of ten years or less.")
    return start, end


def previous_period(start: date, end: date) -> tuple[date, date]:
    """Equal-length period immediately preceding the supplied range."""
    length = (end - start).days + 1
    previous_end = start - timedelta(days=1)
    previous_start = previous_end - timedelta(days=length - 1)
    return previous_start, previous_end
