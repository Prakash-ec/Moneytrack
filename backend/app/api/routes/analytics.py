from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.analytics import ByTypeRead, ComparisonRead, SummaryRead, TrendsRead
from app.services import analytics as service
from app.services.periods import resolve_period

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/summary", response_model=SummaryRead, summary="Totals for a date range")
def summary(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SummaryRead:
    start, end = resolve_period(start_date, end_date)
    return service.summary(db, start, end, user_id=current_user.id)


@router.get("/by-type", response_model=ByTypeRead, summary="Spending grouped by expense type")
def by_type(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ByTypeRead:
    start, end = resolve_period(start_date, end_date)
    return service.by_type(db, start, end, user_id=current_user.id)


@router.get("/trends", response_model=TrendsRead, summary="Spending trends and patterns")
def trends(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    granularity: Literal["daily", "weekly", "monthly"] = Query(default="daily"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TrendsRead:
    start, end = resolve_period(start_date, end_date)
    return service.trends(db, start, end, granularity, user_id=current_user.id)


@router.get("/comparison", response_model=ComparisonRead, summary="Compare with preceding period")
def comparison(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ComparisonRead:
    start, end = resolve_period(start_date, end_date)
    return service.comparison(db, start, end, user_id=current_user.id)
