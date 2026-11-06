from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.expense_type import (
    ExpenseTypeCreate,
    ExpenseTypeList,
    ExpenseTypePeriodSummary,
    ExpenseTypeRead,
    ExpenseTypeUpdate,
)
from app.services import expense_types as service
from app.services.periods import resolve_period

router = APIRouter(prefix="/expense-types", tags=["Expense types"])


@router.get("", response_model=ExpenseTypeList, summary="List expense types")
def list_expense_types(
    search: str | None = Query(default=None, max_length=100),
    archived: Literal["exclude", "include", "only"] = Query(default="exclude"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExpenseTypeList:
    return service.list_expense_types(
        db, search=search, archived=archived, page=page, page_size=page_size
    )


@router.post("", response_model=ExpenseTypeRead, status_code=status.HTTP_201_CREATED)
def create_expense_type(
    payload: ExpenseTypeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExpenseTypeRead:
    return service.create_expense_type(db, payload)


@router.get("/{type_id}", response_model=ExpenseTypeRead, summary="Get an expense type")
def get_expense_type(
    type_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExpenseTypeRead:
    return service.expense_type_detail(db, type_id)


@router.patch("/{type_id}", response_model=ExpenseTypeRead, summary="Edit an expense type")
@router.put("/{type_id}", response_model=ExpenseTypeRead, summary="Edit an expense type (PUT)")
def update_expense_type(
    type_id: int,
    payload: ExpenseTypeUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExpenseTypeRead:
    return service.update_expense_type(db, type_id, payload)


@router.post("/{type_id}/archive", response_model=ExpenseTypeRead, summary="Archive an expense type")
def archive_expense_type(
    type_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExpenseTypeRead:
    return service.set_archived(db, type_id, True)


@router.post("/{type_id}/unarchive", response_model=ExpenseTypeRead, summary="Restore an archived type")
def unarchive_expense_type(
    type_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExpenseTypeRead:
    return service.set_archived(db, type_id, False)


@router.delete(
    "/{type_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an unused expense type",
)
def delete_expense_type(
    type_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    service.delete_expense_type(db, type_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/{type_id}/summary",
    response_model=ExpenseTypePeriodSummary,
    summary="Period summary for one expense type",
)
def expense_type_summary(
    type_id: int,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExpenseTypePeriodSummary:
    start, end = resolve_period(start_date, end_date)
    return service.expense_type_summary(db, type_id, start, end)
