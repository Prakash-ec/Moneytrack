from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.security_alert import (
    SecurityAlertRead,
    SecuritySummary,
    SecurityActionResponse,
    SecurityActionRequest,
)
from app.services import security as security_service

router = APIRouter(prefix="/security", tags=["security"])


@router.get("/summary", response_model=SecuritySummary)
def get_security_summary(db: Session = Depends(get_db)):
    return security_service.get_security_summary(db)


@router.get("/alerts", response_model=List[SecurityAlertRead])
def list_security_alerts(
    status: Optional[str] = Query(None, description="Filter by status: NEEDS_REVIEW, RECOGNISED, DISPUTED, RESOLVED"),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    alerts = security_service.list_security_alerts(db, status=status, limit=limit)
    return [SecurityAlertRead.model_validate(a) for a in alerts]


@router.post("/alerts/{alert_id}/action", response_model=SecurityActionResponse)
def action_security_alert(
    alert_id: int,
    payload: SecurityActionRequest,
    db: Session = Depends(get_db),
):
    try:
        return security_service.action_security_alert(
            db, alert_id=alert_id, action=payload.action, dispute_reason=payload.dispute_reason
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
