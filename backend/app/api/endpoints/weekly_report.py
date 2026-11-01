from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.weekly_report import WeeklyReportData
from app.services import weekly_report as report_service

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/weekly", response_model=WeeklyReportData)
@router.get("/weekly-report", response_model=WeeklyReportData)
def get_weekly_report(
    start_date: Optional[date] = Query(None, description="Start date of week (YYYY-MM-DD, Monday)"),
    end_date: Optional[date] = Query(None, description="End date of week (YYYY-MM-DD, Sunday)"),
    ref_date: Optional[date] = Query(None, description="Reference date to calculate previous complete week from"),
    db: Session = Depends(get_db),
):
    return report_service.generate_weekly_report(
        db, start_date=start_date, end_date=end_date, ref_date=ref_date
    )
