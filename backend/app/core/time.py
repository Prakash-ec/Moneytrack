from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")


def today_ist() -> date:
    """Current calendar date in the default display timezone."""
    return datetime.now(IST).date()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)
