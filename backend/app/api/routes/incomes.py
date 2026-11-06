from datetime import date
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> IncomeList:
    search_term = q or search
    return service.list_incomes(
        db,
        user_id=current_user.id,
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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> IncomeRead:
    income, replayed = service.create_income(
        db, payload, user_id=current_user.id, idempotency_key=idempotency_key
    )
    if replayed:
        response.status_code = status.HTTP_200_OK
        response.headers["X-Idempotent-Replay"] = "true"
    return IncomeRead.model_validate(income)


@router.get("/{income_id}", response_model=IncomeRead, summary="Get income by ID")
def get_income(
    income_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> IncomeRead:
    income = service.get_income(db, income_id, user_id=current_user.id)
    if not income:
        raise HTTPException(status_code=404, detail="Income not found")
    return IncomeRead.model_validate(income)


@router.patch("/{income_id}", response_model=IncomeRead, summary="Update income")
@router.put("/{income_id}", response_model=IncomeRead, summary="Update income (PUT)")
def update_income(
    income_id: int,
    payload: IncomeUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> IncomeRead:
    income = service.update_income(db, income_id, payload, user_id=current_user.id)
    if not income:
        raise HTTPException(status_code=404, detail="Income not found")
    return IncomeRead.model_validate(income)


@router.delete(
    "/{income_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete income",
)
def delete_income(
    income_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    success = service.delete_income(db, income_id, user_id=current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Income not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
