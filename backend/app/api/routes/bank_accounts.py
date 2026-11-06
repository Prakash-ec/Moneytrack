from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.bank_account import (
    BankAccountCreate,
    BankAccountList,
    BankAccountRead,
    BankAccountUpdate,
)
from app.schemas.cashflow import AccountReconciliationRead
from app.services import bank_accounts as service

router = APIRouter(prefix="/bank-accounts", tags=["Bank Accounts"])


@router.get("", response_model=BankAccountList, summary="List bank accounts")
def list_accounts(
    include_archived: bool = Query(default=False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BankAccountList:
    return service.list_accounts(db, user_id=current_user.id, include_archived=include_archived)


@router.post("", response_model=BankAccountRead, status_code=status.HTTP_201_CREATED, summary="Create bank account")
def create_account(
    payload: BankAccountCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BankAccountRead:
    acc = service.create_account(db, payload, user_id=current_user.id)
    return BankAccountRead.model_validate(acc)


@router.get("/reconciliation/summary", response_model=list[AccountReconciliationRead], summary="Account reconciliation summary")
def reconciliation_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AccountReconciliationRead]:
    return service.get_reconciliation_summary(db, user_id=current_user.id)


@router.get("/{account_id}", response_model=BankAccountRead, summary="Get bank account by ID")
def get_account(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BankAccountRead:
    acc = service.get_account(db, account_id, user_id=current_user.id)
    if not acc:
        raise HTTPException(status_code=404, detail="Bank account not found")
    return BankAccountRead.model_validate(acc)


@router.patch("/{account_id}", response_model=BankAccountRead, summary="Update bank account")
@router.put("/{account_id}", response_model=BankAccountRead, summary="Update bank account (PUT)")
def update_account(
    account_id: int,
    payload: BankAccountUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BankAccountRead:
    acc = service.update_account(db, account_id, payload, user_id=current_user.id)
    if not acc:
        raise HTTPException(status_code=404, detail="Bank account not found")
    return BankAccountRead.model_validate(acc)


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Archive bank account")
def delete_account(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    ok = service.delete_account(db, account_id, user_id=current_user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="Bank account not found")


@router.post("/{account_id}/recalculate", response_model=BankAccountRead, summary="Force recalculate account balance")
def recalculate(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BankAccountRead:
    acc = service.get_account(db, account_id, user_id=current_user.id)
    if not acc:
        raise HTTPException(status_code=404, detail="Bank account not found")
    service.recalculate_account_balance(db, account_id)
    db.refresh(acc)
    return BankAccountRead.model_validate(acc)


@router.post("/{account_id}/report-balance", response_model=BankAccountRead, summary="Record bank reported balance")
def report_balance(
    account_id: int,
    reported_balance_paise: int = Query(gt=0),
    source: str = Query(default="manual"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BankAccountRead:
    acc = service.record_reported_balance(
        db, account_id, reported_balance_paise, source=source, user_id=current_user.id
    )
    if not acc:
        raise HTTPException(status_code=404, detail="Bank account not found")
    return BankAccountRead.model_validate(acc)
