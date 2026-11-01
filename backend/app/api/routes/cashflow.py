from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.cashflow import CashFlowSummary
from app.services import cashflow as service

router = APIRouter(tags=["Analytics & Cashflow"])


@router.get("/analytics/cashflow", response_model=CashFlowSummary, summary="Income, expenses, and net cashflow summary")
@router.get("/cashflow/summary", response_model=CashFlowSummary, summary="Cashflow summary alias")
@router.get("/cashflow", response_model=CashFlowSummary, summary="Cashflow alias")
def cashflow_summary(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
) -> CashFlowSummary:
    return service.get_cashflow_summary(db, start_date=start_date, end_date=end_date)
