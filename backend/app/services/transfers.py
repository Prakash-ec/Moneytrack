from datetime import date, datetime, timezone
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models.account_transfer import AccountTransfer
from app.models.bank_account import BankAccount
from app.schemas.transfer import TransferCreate, TransferList, TransferRead
from app.services.bank_accounts import recalculate_account_balance
from app.services.errors import ValidationError


def list_transfers(
    db: Session,
    start_date: date | None = None,
    end_date: date | None = None,
    account_id: int | None = None,
) -> TransferList:
    query = select(AccountTransfer).options(
        joinedload(AccountTransfer.from_account),
        joinedload(AccountTransfer.to_account),
    )

    if start_date:
        query = query.where(AccountTransfer.transfer_date >= start_date)
    if end_date:
        query = query.where(AccountTransfer.transfer_date <= end_date)
    if account_id:
        query = query.where(
            (AccountTransfer.from_account_id == account_id)
            | (AccountTransfer.to_account_id == account_id)
        )

    items = list(
        db.scalars(
            query.order_by(
                AccountTransfer.transfer_date.desc(), AccountTransfer.id.desc()
            )
        ).unique().all()
    )

    total_paise = sum(item.amount_paise for item in items)

    return TransferList(
        items=[TransferRead.model_validate(item) for item in items],
        total=len(items),
        total_transferred_paise=total_paise,
    )


def create_transfer(
    db: Session, payload: TransferCreate, idempotency_key: str | None = None
) -> tuple[AccountTransfer, bool]:
    if payload.from_account_id == payload.to_account_id:
        raise ValidationError("Source and destination accounts must be distinct.")

    from_account = db.get(BankAccount, payload.from_account_id)
    to_account = db.get(BankAccount, payload.to_account_id)

    if not from_account or not to_account:
        raise ValidationError("One or both bank accounts do not exist.")

    if idempotency_key:
        existing = db.scalar(
            select(AccountTransfer)
            .options(
                joinedload(AccountTransfer.from_account),
                joinedload(AccountTransfer.to_account),
            )
            .where(AccountTransfer.idempotency_key == idempotency_key)
        )
        if existing:
            return existing, True

    transfer = AccountTransfer(
        from_account_id=payload.from_account_id,
        to_account_id=payload.to_account_id,
        amount_paise=payload.amount_paise,
        transfer_date=payload.transfer_date,
        description=payload.description.strip() if payload.description else None,
        bank_reference=payload.bank_reference.strip()
        if payload.bank_reference
        else None,
        idempotency_key=idempotency_key,
    )
    db.add(transfer)
    db.commit()
    db.refresh(transfer)

    # Update both accounts' calculated balances
    recalculate_account_balance(db, payload.from_account_id)
    recalculate_account_balance(db, payload.to_account_id)

    db.refresh(transfer)
    return transfer, False
