from typing import List
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.notification_log import (
    NotificationLogRead,
    NotificationPreferences,
    NotificationCenterSummary,
)
from app.services import notifications as notif_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationCenterSummary)
def get_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    items = notif_service.list_notifications(db, unread_only=unread_only, limit=limit)
    unread = notif_service.get_unread_count(db)
    prefs = notif_service.get_preferences(db)
    return NotificationCenterSummary(
        unread_count=unread,
        total_count=len(items),
        items=[NotificationLogRead.model_validate(i) for i in items],
        preferences=prefs,
    )


@router.post("/{notification_id}/read", response_model=NotificationLogRead)
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
):
    notif = notif_service.mark_as_read(db, notification_id)
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    return NotificationLogRead.model_validate(notif)


@router.post("/read-all", response_model=dict)
@router.post("/mark-all-read", response_model=dict)
def mark_all_notifications_read(
    db: Session = Depends(get_db),
):
    count = notif_service.mark_all_as_read(db)
    return {"success": True, "marked_count": count}


@router.get("/preferences", response_model=NotificationPreferences)
def get_preferences(db: Session = Depends(get_db)):
    return notif_service.get_preferences(db)


@router.put("/preferences", response_model=NotificationPreferences)
def update_preferences(
    prefs: NotificationPreferences,
    db: Session = Depends(get_db),
):
    return notif_service.update_preferences(db, prefs)
