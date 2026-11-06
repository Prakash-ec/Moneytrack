from datetime import date, datetime, timezone
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models.account_transfer import AccountTransfer
from app.models.bank_account import BankAccount
from app.schemas.transfer import TransferCreate, TransferList, TransferRead, TransferUpdate
from app.services.bank_accounts import recalculate_account_balance
from app.services.errors import NotFoundError, ValidationError


def get_transfer(
    db: Session, transfer_id: int, user_id: int | None = None
) -> AccountTransfer | None:
    query = (
        select(AccountTransfer)
        .options(
            joinedload(AccountTransfer.from_account),
            joinedload(AccountTransfer.to_account),
        )
        .where(AccountTransfer.id == transfer_id)
    )
    if user_id is not None:
        query = query.where(AccountTransfer.user_id == user_id)
    return db.scalar(query)


def list_transfers(
    db: Session,
    start_date: date | None = None,
    end_date: date | None = None,
    account_id: int | None = None,
    user_id: int | None = None,
) -> TransferList:
    query = select(AccountTransfer).options(
        joinedload(AccountTransfer.from_account),
        joinedload(AccountTransfer.to_account),
    )

    if user_id is not None:
        query = query.where(AccountTransfer.user_id == user_id)
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
    db: Session,
    payload: TransferCreate,
    idempotency_key: str | None = None,
    user_id: int | None = None,
) -> tuple[AccountTransfer, bool]:
    if payload.from_account_id == payload.to_account_id:
        raise ValidationError("Source and destination accounts must be distinct.")

    from_account = db.get(BankAccount, payload.from_account_id)
    to_account = db.get(BankAccount, payload.to_account_id)

    if not from_account or not to_account:
        raise ValidationError("One or both bank accounts do not exist.")

    if user_id is not None:
        if (from_account.user_id is not None and from_account.user_id != user_id) or (
            to_account.user_id is not None and to_account.user_id != user_id
        ):
            raise ValidationError("You do not own one or both of the specified accounts.")

    if idempotency_key:
        stmt = (
            select(AccountTransfer)
            .options(
                joinedload(AccountTransfer.from_account),
                joinedload(AccountTransfer.to_account),
            )
            .where(AccountTransfer.idempotency_key == idempotency_key)
        )
        if user_id is not None:
            stmt = stmt.where(AccountTransfer.user_id == user_id)
        existing = db.scalar(stmt)
        if existing:
            return existing, True

    transfer = AccountTransfer(
        user_id=user_id,
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


def update_transfer(
    db: Session,
    transfer_id: int,
    payload: TransferUpdate,
    user_id: int | None = None,
) -> AccountTransfer:
    transfer = get_transfer(db, transfer_id, user_id=user_id)
    if not transfer:
        raise NotFoundError("Transfer not found.")

    old_from_id = transfer.from_account_id
    old_to_id = transfer.to_account_id

    new_from_id = payload.from_account_id or old_from_id
    new_to_id = payload.to_account_id or old_to_id

    if new_from_id == new_to_id:
        raise ValidationError("Source and destination accounts must be distinct.")

    from_account = db.get(BankAccount, new_from_id)
    to_account = db.get(BankAccount, new_to_id)
    if not from_account or not to_account:
        raise ValidationError("One or both bank accounts do not exist.")

    if user_id is not None:
        if (from_account.user_id is not None and from_account.user_id != user_id) or (
            to_account.user_id is not None and to_account.user_id != user_id
        ):
            raise ValidationError("You do not own one or both of the specified accounts.")

    data = payload.model_dump(exclude_unset=True)
    for field, val in data.items():
        if hasattr(transfer, field):
            setattr(transfer, field, val)

    transfer.updated_at = datetime.now(timezone.utc)
    db.commit()

    # Recalculate affected accounts
    affected = {old_from_id, old_to_id, new_from_id, new_to_id}
    for acc_id in affected:
        recalculate_account_balance(db, acc_id)

    db.refresh(transfer)
    return transfer


def delete_transfer(
    db: Session,
    transfer_id: int,
    user_id: int | None = None,
) -> bool:
    transfer = get_transfer(db, transfer_id, user_id=user_id)
    if not transfer:
        raise NotFoundError("Transfer not found.")

    from_id = transfer.from_account_id
    to_id = transfer.to_account_id

    db.delete(transfer)
    db.commit()

    recalculate_account_balance(db, from_id)
    recalculate_account_balance(db, to_id)
    return True
