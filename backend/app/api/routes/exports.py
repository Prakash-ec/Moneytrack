import json
from datetime import date

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.time import today_ist
from app.db.session import get_db
from app.models.user import User
from app.schemas.exports import RestoreSummaryRead
from app.services import exports as service

router = APIRouter(tags=["Export"])


def _validate_dates(start_date: date | None, end_date: date | None) -> None:
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="Start date must be on or before end date.")


@router.get("/expenses.csv", summary="Download expenses as CSV")
def expenses_csv(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    _validate_dates(start_date, end_date)
    content, filename = service.expenses_csv(
        db, start=start_date, end=end_date, user_id=current_user.id
    )
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/backup.json", summary="Download a JSON backup of all records")
@router.get("/json", summary="Download a JSON backup of all records")
def backup_json(
    request: Request,
    version: int | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    v = version if version is not None else (2 if "/exports" in request.url.path else 1)
    payload = service.backup_json(db, user_id=current_user.id, version=v)
    filename = f"moneytrack-backup-{today_ist().isoformat()}.json"
    return Response(
        content=json.dumps(payload, ensure_ascii=False, indent=2),
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/restore",
    response_model=RestoreSummaryRead,
    summary="Restore records from a JSON backup",
)
@router.post(
    "/json/restore",
    response_model=RestoreSummaryRead,
    summary="Restore records from a JSON backup",
)
def restore_backup(
    request: Request,
    payload: dict = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RestoreSummaryRead:
    allowed = (1, 2) if "/exports" in request.url.path else (1,)
    result = service.restore_json(db, payload, user_id=current_user.id, allowed_versions=allowed)
    return RestoreSummaryRead(**result)
