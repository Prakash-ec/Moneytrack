from datetime import datetime, timezone
import json
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.models.notification_log import NotificationLog
from app.models.user_preference import UserPreference
from app.schemas.notification_log import NotificationPreferences


PREFS_KEY = "notification_preferences"


def log_notification(
    db: Session,
    title: str,
    body: str,
    category: str,
    reference_id: Optional[str] = None,
) -> NotificationLog:
    # Check for recent duplicate notification to avoid spamming
    recent_dup = (
        db.query(NotificationLog)
        .filter(
            NotificationLog.title == title,
            NotificationLog.category == category,
            NotificationLog.reference_id == reference_id,
        )
        .first()
    )
    if recent_dup:
        return recent_dup

    notif = NotificationLog(
        title=title,
        body=body,
        category=category,
        reference_id=reference_id,
        is_read=False,
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif


def list_notifications(
    db: Session, unread_only: bool = False, limit: int = 50
) -> List[NotificationLog]:
    query = db.query(NotificationLog)
    if unread_only:
        query = query.filter(NotificationLog.is_read == False)
    return query.order_by(desc(NotificationLog.created_at)).limit(limit).all()


def get_unread_count(db: Session) -> int:
    return (
        db.query(func.count(NotificationLog.id))
        .filter(NotificationLog.is_read == False)
        .scalar()
        or 0
    )


def mark_as_read(db: Session, notification_id: int) -> Optional[NotificationLog]:
    notif = db.query(NotificationLog).filter(NotificationLog.id == notification_id).first()
    if notif and not notif.is_read:
        notif.is_read = True
        notif.read_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(notif)
    return notif


def mark_all_as_read(db: Session) -> int:
    now = datetime.now(timezone.utc)
    updated = (
        db.query(NotificationLog)
        .filter(NotificationLog.is_read == False)
        .update({NotificationLog.is_read: True, NotificationLog.read_at: now})
    )
    db.commit()
    return updated


def get_preferences(db: Session) -> NotificationPreferences:
    row = db.query(UserPreference).filter(UserPreference.key == PREFS_KEY).first()
    if not row:
        return NotificationPreferences()
    try:
        data = json.loads(row.value)
        return NotificationPreferences(**data)
    except Exception:
        return NotificationPreferences()


def update_preferences(db: Session, prefs: NotificationPreferences) -> NotificationPreferences:
    row = db.query(UserPreference).filter(UserPreference.key == PREFS_KEY).first()
    json_val = prefs.model_dump_json()
    if not row:
        row = UserPreference(key=PREFS_KEY, value=json_val)
        db.add(row)
    else:
        row.value = json_val
    db.commit()
    db.refresh(row)
    return prefs
