from datetime import date
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.income import IncomeCreate, IncomeList, IncomeRead, IncomeUpdate
from app.services import incomes as service

router = APIRouter(prefix="/incomes", tags=["Incomes"])


@router.get("", response_model=IncomeList, summary="List income transactions")
def list_incomes(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    income_type_id: int | None = Query(default=None),
    account_id: int | None = Query(default=None),
    q: str | None = Query(default=None),
    search: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
) -> IncomeList:
    search_term = q or search
    return service.list_incomes(
        db,
        start_date=start_date,
        end_date=end_date,
        income_type_id=income_type_id,
        account_id=account_id,
        q=search_term,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=IncomeRead, status_code=status.HTTP_201_CREATED, summary="Create income")
def create_income(
    payload: IncomeCreate,
    response: Response,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
) -> IncomeRead:
    income, replayed = service.create_income(db, payload, idempotency_key=idempotency_key)
    if replayed:
        response.status_code = status.HTTP_200_OK
        response.headers["X-Idempotent-Replay"] = "true"
    return IncomeRead.model_validate(income)


@router.get("/{income_id}", response_model=IncomeRead, summary="Get income by ID")
def get_income(
    income_id: int,
    db: Session = Depends(get_db),
) -> IncomeRead:
    from app.models.income import Income
    from sqlalchemy.orm import joinedload
    income = (
        db.query(Income)
        .options(joinedload(Income.income_type), joinedload(Income.bank_account))
        .filter(Income.id == income_id)
        .first()
    )
    if not income:
        raise HTTPException(status_code=404, detail="Income not found")
    return IncomeRead.model_validate(income)


@router.patch("/{income_id}", response_model=IncomeRead, summary="Update income")
def update_income(
    income_id: int,
    payload: IncomeUpdate,
    db: Session = Depends(get_db),
) -> IncomeRead:
    income = service.update_income(db, income_id, payload)
    if not income:
        raise HTTPException(status_code=404, detail="Income not found")
    return IncomeRead.model_validate(income)


@router.delete("/{income_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete income")
def delete_income(
    income_id: int,
    db: Session = Depends(get_db),
) -> None:
    ok = service.delete_income(db, income_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Income not found")
