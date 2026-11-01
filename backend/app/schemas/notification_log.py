from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class NotificationLogRead(BaseModel):
    id: int
    title: str
    body: str
    category: str  # SECURITY, WEEKLY_REPORT, SMS_REVIEW, SYSTEM
    reference_id: Optional[str] = None
    is_read: bool
    read_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationPreferences(BaseModel):
    suspicious_alerts_enabled: bool = True
    weekly_report_enabled: bool = True
    review_reminders_enabled: bool = True
    sync_failure_alerts_enabled: bool = True
    quiet_hours_enabled: bool = False
    quiet_hours_start: str = "22:00"
    quiet_hours_end: str = "08:00"
    alert_frequency: str = "instant"  # instant, daily_summary
    max_alerts_per_day: int = Field(2, ge=1, le=10)
    weekly_report_day: str = "Monday"  # Monday, Sunday
    weekly_report_time: str = "09:00"


class NotificationCenterSummary(BaseModel):
    unread_count: int
    total_count: int
    items: List[NotificationLogRead]
    preferences: NotificationPreferences
