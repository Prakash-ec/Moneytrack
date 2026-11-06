from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.constants import PaymentMethod
from app.db.session import get_db
from app.models.user import User
from app.schemas.expense import ExpenseCreate, ExpensePage, ExpenseRead, ExpenseUpdate
from app.services import expenses as service
from app.services.expenses import SortOrder

router = APIRouter(prefix="/expenses", tags=["Expenses"])

IDEMPOTENCY_KEY_HEADER = "Idempotency-Key"
IDEMPOTENT_REPLAY_HEADER = "X-Idempotent-Replay"


@router.get("", response_model=ExpensePage, summary="List and filter expenses")
def list_expenses(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    expense_type_id: int | None = Query(default=None, gt=0),
    category: str | None = Query(default=None, max_length=50),
    payment_method: PaymentMethod | None = Query(default=None),
    min_amount: int | None = Query(default=None, ge=0),
    max_amount: int | None = Query(default=None, ge=0),
    q: str | None = Query(default=None, max_length=100),
    sort: SortOrder = Query(default="date_desc"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExpensePage:
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="Start date must be on or before end date.")
    if min_amount is not None and max_amount is not None and min_amount > max_amount:
        raise HTTPException(
            status_code=400, detail="Minimum amount must be on or before maximum amount."
        )
    return service.list_expenses(
        db,
        user_id=current_user.id,
        start_date=start_date,
        end_date=end_date,
        expense_type_id=expense_type_id,
        category=category,
        payment_method=payment_method.value if payment_method else None,
        min_amount=min_amount,
        max_amount=max_amount,
        search=q,
        sort=sort,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=ExpenseRead, status_code=status.HTTP_201_CREATED)
def create_expense(
    payload: ExpenseCreate,
    response: Response,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExpenseRead:
    expense, replayed = service.create_expense(
        db, payload, user_id=current_user.id, idempotency_key=idempotency_key
    )
    if replayed:
        response.status_code = status.HTTP_200_OK
        response.headers[IDEMPOTENT_REPLAY_HEADER] = "true"
    return expense


@router.get("/{expense_id}", response_model=ExpenseRead, summary="Get one expense")
def get_expense(
    expense_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExpenseRead:
    return ExpenseRead.model_validate(service.get_expense(db, expense_id, user_id=current_user.id))


@router.patch("/{expense_id}", response_model=ExpenseRead, summary="Edit an expense")
@router.put("/{expense_id}", response_model=ExpenseRead, summary="Edit an expense (PUT)")
def update_expense(
    expense_id: int,
    payload: ExpenseUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExpenseRead:
    return service.update_expense(db, expense_id, payload, user_id=current_user.id)


@router.delete(
    "/{expense_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an expense",
)
def delete_expense(
    expense_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    service.delete_expense(db, expense_id, user_id=current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
