import re
from datetime import UTC, date, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.account_transfer import AccountTransfer
from app.models.balance_snapshot import BalanceSnapshot
from app.models.bank_account import BankAccount
from app.models.expense import Expense
from app.models.income import Income
from app.schemas.bank_account import (
    BankAccountCreate,
    BankAccountList,
    BankAccountRead,
    BankAccountUpdate,
)
from app.schemas.cashflow import AccountReconciliationRead


def get_account(db: Session, account_id: int, user_id: int | None = None) -> BankAccount | None:
    query = select(BankAccount).where(BankAccount.id == account_id)
    if user_id is not None:
        query = query.where(BankAccount.user_id == user_id)
    return db.scalar(query)


def recalculate_account_balance(db: Session, account_id: int, commit: bool = True) -> int:
    """Calculates ledger balance: Opening + Incomes - Expenses + TransfersIn - TransfersOut.
    Updates account.current_balance_paise in the database.
    """
    account = db.get(BankAccount, account_id)
    if not account:
        return 0

    # Total confirmed income
    income_sum = (
        db.scalar(
            select(func.coalesce(func.sum(Income.amount_paise), 0)).where(
                Income.account_id == account_id,
                Income.income_date >= account.opening_balance_date,
            )
        )
        or 0
    )

    # Total confirmed expenses
    expense_sum = (
        db.scalar(
            select(func.coalesce(func.sum(Expense.amount_paise), 0)).where(
                Expense.account_id == account_id,
                Expense.expense_date >= account.opening_balance_date,
            )
        )
        or 0
    )

    # Transfers received (inflow to this account)
    transfers_in = (
        db.scalar(
            select(func.coalesce(func.sum(AccountTransfer.amount_paise), 0)).where(
                AccountTransfer.to_account_id == account_id,
                AccountTransfer.transfer_date >= account.opening_balance_date,
            )
        )
        or 0
    )

    # Transfers sent (outflow from this account)
    transfers_out = (
        db.scalar(
            select(func.coalesce(func.sum(AccountTransfer.amount_paise), 0)).where(
                AccountTransfer.from_account_id == account_id,
                AccountTransfer.transfer_date >= account.opening_balance_date,
            )
        )
        or 0
    )

    calculated = (
        account.opening_balance_paise + income_sum - expense_sum + transfers_in - transfers_out
    )
    account.current_balance_paise = calculated

    # Re-evaluate reconciliation status if last reported balance exists
    if account.last_reported_balance_paise is not None:
        if abs(calculated - account.last_reported_balance_paise) == 0:
            account.reconciliation_status = "matched"
        else:
            account.reconciliation_status = "discrepancy"

    account.updated_at = datetime.now(UTC)
    if commit:
        db.commit()
    return calculated


def find_account_by_identifier(
    db: Session,
    suffix: str | None = None,
    bank_name: str | None = None,
    user_id: int | None = None,
) -> BankAccount | None:
    """Matches an account based on last 4 digits (e.g. '4375') and/or bank name."""
    query = select(BankAccount).where(BankAccount.is_archived.is_(False))
    if user_id is not None:
        query = query.where(BankAccount.user_id == user_id)
    accounts = list(db.scalars(query).all())
    if not accounts:
        return None

    target_digits = ""
    if suffix:
        digits_only = re.sub(r"\D", "", str(suffix))
        target_digits = digits_only[-4:] if len(digits_only) >= 4 else digits_only

    def extract_4_digits(text: str | None) -> str:
        if not text:
            return ""
        digits = re.sub(r"\D", "", text)
        return digits[-4:] if len(digits) >= 4 else digits

    # 1. Match by last 4 digits + bank name match
    if target_digits and bank_name:
        clean_bank = bank_name.lower().strip()
        for acc in accounts:
            mask_4 = extract_4_digits(acc.account_number_mask)
            name_4 = extract_4_digits(acc.account_name)
            acc_bank = (acc.bank_name or "").lower()
            acc_name = (acc.account_name or "").lower()

            if (target_digits in (mask_4, name_4)) and (
                clean_bank in acc_bank or clean_bank in acc_name
            ):
                return acc

    # 2. Match by last 4 digits in mask or account name (guard against multi-account collisions)
    if target_digits:
        matching = []
        for acc in accounts:
            mask_4 = extract_4_digits(acc.account_number_mask)
            name_4 = extract_4_digits(acc.account_name)
            if target_digits in (mask_4, name_4):
                matching.append(acc)
        if len(matching) == 1:
            return matching[0]
        elif len(matching) > 1 and bank_name:
            clean_bank = bank_name.lower().strip()
            for acc in matching:
                if (
                    clean_bank in (acc.bank_name or "").lower()
                    or clean_bank in (acc.account_name or "").lower()
                ):
                    return acc
            # Suffix collision exists but none match bank name
            return None
        elif len(matching) > 1:
            # Suffix collision exists and no bank name provided; cannot safely disambiguate
            return None

    # 3. Match by bank name alone
    if bank_name:
        clean_bank = bank_name.lower().strip()
        matching_by_bank = [
            acc
            for acc in accounts
            if clean_bank in (acc.bank_name or "").lower()
            or (acc.bank_name and acc.bank_name.lower() in clean_bank)
        ]
        if len(matching_by_bank) == 1:
            return matching_by_bank[0]

    return None


def record_reported_balance(
    db: Session,
    account_id: int,
    reported_paise: int,
    source: str = "sms",
    user_id: int | None = None,
    reported_at: datetime | None = None,
    balance_type: str = "AVAILABLE",
    sms_message_id: int | None = None,
    transaction_time: datetime | None = None,
    message_reception_time: datetime | None = None,
    confidence: str = "HIGH",
    source_evidence: str | None = None,
    currency: str = "INR",
    note: str | None = None,
) -> BankAccount | None:
    account = get_account(db, account_id, user_id=user_id)
    if not account:
        return None

    report_time = transaction_time or message_reception_time or reported_at or datetime.now(UTC)
    if report_time.tzinfo is None:
        report_time = report_time.replace(tzinfo=UTC)

    # Guard against out-of-order historical messages regressing the reported balance
    is_out_of_order = False
    if account.last_reported_at is not None:
        last_rep = account.last_reported_at
        if last_rep.tzinfo is None:
            last_rep = last_rep.replace(tzinfo=UTC)
        if report_time < last_rep:
            is_out_of_order = True

    if not is_out_of_order:
        account.last_reported_balance_paise = reported_paise
        account.last_reported_at = report_time

    # Recalculate ledger balance
    recalculate_account_balance(db, account_id, commit=False)

    snapshot_note = note or (
        f"Historical out-of-order balance snapshot via {source}"
        if is_out_of_order
        else f"Reported via {source}"
    )

    # Save balance snapshot for audit
    snapshot = BalanceSnapshot(
        user_id=user_id or account.user_id,
        account_id=account_id,
        snapshot_date=report_time.date() if isinstance(report_time, datetime) else date.today(),
        calculated_balance_paise=account.current_balance_paise,
        reported_balance_paise=reported_paise,
        currency=currency,
        balance_type=balance_type.upper(),
        sms_message_id=sms_message_id,
        transaction_time=transaction_time,
        message_reception_time=message_reception_time,
        processing_time=datetime.now(UTC),
        confidence=confidence,
        source_evidence=source_evidence,
        source=source,
        note=snapshot_note,
    )
    db.add(snapshot)
    db.commit()
    db.refresh(account)
    return account


def reconcile_account_to_reported(
    db: Session,
    account_id: int,
    user_id: int | None = None,
) -> BankAccount:
    """Evaluates reconciliation status between calculated ledger and bank report.
    Never silently modifies opening_balance_paise; preserves ledger audit integrity.
    """
    account = get_account(db, account_id, user_id=user_id)
    if not account:
        raise ValueError("Bank account not found")
    if account.last_reported_balance_paise is None:
        raise ValueError("No reported bank balance available for reconciliation")

    calculated = recalculate_account_balance(db, account_id, commit=False)
    diff = calculated - account.last_reported_balance_paise
    if diff == 0:
        account.reconciliation_status = "matched"
    else:
        account.reconciliation_status = "discrepancy"

    db.commit()
    db.refresh(account)
    return account


def list_accounts(
    db: Session,
    user_id: int | None = None,
    include_archived: bool = False,
) -> BankAccountList:
    query = select(BankAccount).order_by(BankAccount.bank_name.asc(), BankAccount.id.asc())
    if user_id is not None:
        query = query.where(BankAccount.user_id == user_id)
    if not include_archived:
        query = query.where(BankAccount.is_archived.is_(False))
    items = list(db.scalars(query).all())

    # Pure read operation: balances are maintained at transaction mutation time
    total_balance = sum(acc.current_balance_paise for acc in items if not acc.is_archived)
    total_reported = sum(
        acc.last_reported_balance_paise
        for acc in items
        if not acc.is_archived and acc.last_reported_balance_paise is not None
    )
    discrepancy_count = sum(
        1 for acc in items if not acc.is_archived and acc.reconciliation_status == "discrepancy"
    )

    return BankAccountList(
        items=[BankAccountRead.model_validate(acc) for acc in items],
        total_balance_paise=total_balance,
        total_reported_balance_paise=total_reported if total_reported > 0 else None,
        account_count=len([acc for acc in items if not acc.is_archived]),
        reconciliation_needed_count=discrepancy_count,
    )


def create_account(
    db: Session,
    payload: BankAccountCreate,
    user_id: int | None = None,
) -> BankAccount:
    account = BankAccount(
        user_id=user_id,
        bank_name=payload.bank_name.strip(),
        account_name=payload.account_name.strip(),
        account_type=payload.account_type,
        account_number_mask=payload.account_number_mask.strip().upper(),
        currency=payload.currency.strip().upper(),
        opening_balance_paise=payload.opening_balance_paise,
        opening_balance_date=payload.opening_balance_date,
        current_balance_paise=payload.opening_balance_paise,
        color=payload.color,
        icon=payload.icon,
        is_archived=False,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    recalculate_account_balance(db, account.id)
    return account


def update_account(
    db: Session,
    account_id: int,
    payload: BankAccountUpdate,
    user_id: int | None = None,
) -> BankAccount | None:
    account = get_account(db, account_id, user_id=user_id)
    if not account:
        return None

    data = payload.model_dump(exclude_unset=True)
    valid_cols = {c.name for c in BankAccount.__table__.columns}
    for field, val in data.items():
        if field in valid_cols:
            setattr(account, field, val)

    account.updated_at = datetime.now(UTC)
    db.commit()
    recalculate_account_balance(db, account.id)
    db.refresh(account)
    return account


def delete_account(db: Session, account_id: int, user_id: int | None = None) -> bool:
    account = get_account(db, account_id, user_id=user_id)
    if not account:
        return False
    account.is_archived = True
    account.updated_at = datetime.now(UTC)
    db.commit()
    return True


def get_reconciliation_summary(
    db: Session,
    user_id: int | None = None,
) -> list[AccountReconciliationRead]:
    query = select(BankAccount).where(BankAccount.is_archived.is_(False))
    if user_id is not None:
        query = query.where(BankAccount.user_id == user_id)
    accounts = list(db.scalars(query).all())
    results: list[AccountReconciliationRead] = []

    for acc in accounts:
        discrepancy = 0
        if acc.last_reported_balance_paise is not None:
            discrepancy = acc.current_balance_paise - acc.last_reported_balance_paise

        results.append(
            AccountReconciliationRead(
                account_id=acc.id,
                bank_name=acc.bank_name,
                account_name=acc.account_name,
                calculated_balance_paise=acc.current_balance_paise,
                reported_balance_paise=acc.last_reported_balance_paise,
                discrepancy_paise=discrepancy,
                status=acc.reconciliation_status,
                last_reported_at=acc.last_reported_at,
            )
        )
    return results
