from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean

from app.db.base import Base


class NotificationLog(Base):
    __tablename__ = "notification_logs"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    category = Column(String(50), nullable=False, index=True)  # SECURITY, WEEKLY_REPORT, SMS_REVIEW, SYSTEM
    reference_id = Column(String(100), nullable=True, index=True)
    is_read = Column(Boolean, nullable=False, default=False, index=True)
    read_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True)
