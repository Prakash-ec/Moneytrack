from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime

from app.db.base import Base


class UserPreference(Base):
    __tablename__ = "user_preferences"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(Text, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
