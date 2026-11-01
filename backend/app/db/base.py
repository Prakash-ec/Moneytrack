from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, TypeDecorator
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class UTCDateTime(TypeDecorator):
    """Store UTC datetimes and always return timezone-aware values.

    SQLite drops timezone information; normalising on read keeps API output
    consistent and lets PostgreSQL be swapped in later without changes.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Any) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    def process_result_value(self, value: datetime | None, dialect: Any) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
