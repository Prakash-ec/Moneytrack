from datetime import date, datetime, timezone
import re
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


def recalculate_account_balance(db: Session, account_id: int) -> int:
    """Recalculates an account's balance from opening balance and confirmed transactions.

    Calculated Balance = Opening Balance + Confirmed Incomes - Confirmed Expenses + Transfers In - Transfers Out
    """
    account = db.get(BankAccount, account_id)
    if not account:
        return 0

    # Total confirmed incomes
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

    account.updated_at = datetime.now(timezone.utc)
    db.commit()
    return calculated


def find_account_by_identifier(
    db: Session, suffix: str | None = None, bank_name: str | None = None
) -> BankAccount | None:
    """Matches an account based on last 4 digits (e.g. '4375') and/or bank name.
    Matches against account_number_mask and account_name using last 4 digits.
    """
    query = select(BankAccount).where(BankAccount.is_archived.is_(False))
    accounts = list(db.scalars(query).all())
    if not accounts:
        return None

    # Extract target 4 digits from suffix (handles 'XXXXXXXX4375', '4375', 'XX4375', etc.)
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

            matches_digits = (mask_4 == target_digits) or (name_4 == target_digits)
            matches_bank = (
                clean_bank in acc_bank
                or acc_bank in clean_bank
                or clean_bank in acc_name
            )
            if matches_digits and matches_bank:
                return acc

    # 2. Match by last 4 digits alone
    if target_digits:
        for acc in accounts:
            mask_4 = extract_4_digits(acc.account_number_mask)
            name_4 = extract_4_digits(acc.account_name)
            if (mask_4 == target_digits) or (name_4 == target_digits):
                return acc

    # 3. Match by bank name alone if unique
    if bank_name:
        clean_bank = bank_name.lower().strip()
        matching_bank = [
            acc
            for acc in accounts
            if clean_bank in (acc.bank_name or "").lower()
            or (acc.bank_name or "").lower() in clean_bank
        ]
        if len(matching_bank) == 1:
            return matching_bank[0]

    return None


def record_reported_balance(
    db: Session, account_id: int, reported_paise: int, source: str = "sms"
) -> BankAccount | None:
    """Records an available balance reported by bank notification without overwriting the ledger."""
    account = db.get(BankAccount, account_id)
    if not account:
        return None

    account.last_reported_balance_paise = reported_paise
    account.last_reported_at = datetime.now(timezone.utc)

    # Check reconciliation
    recalculate_account_balance(db, account_id)

    # Save balance snapshot for audit
    snapshot = BalanceSnapshot(
        account_id=account_id,
        snapshot_date=date.today(),
        calculated_balance_paise=account.current_balance_paise,
        reported_balance_paise=reported_paise,
        source=source,
        note=f"Reported via {source}",
    )
    db.add(snapshot)
    db.commit()
    db.refresh(account)
    return account


def list_accounts(db: Session, include_archived: bool = False) -> BankAccountList:
    query = select(BankAccount).order_by(BankAccount.bank_name.asc(), BankAccount.id.asc())
    if not include_archived:
        query = query.where(BankAccount.is_archived.is_(False))
    items = list(db.scalars(query).all())

    # Ensure balances are up to date
    for acc in items:
        recalculate_account_balance(db, acc.id)

    total_balance = sum(acc.current_balance_paise for acc in items if not acc.is_archived)
    total_reported = sum(
        acc.last_reported_balance_paise
        for acc in items
        if not acc.is_archived and acc.last_reported_balance_paise is not None
    )
    discrepancy_count = sum(
        1
        for acc in items
        if not acc.is_archived and acc.reconciliation_status == "discrepancy"
    )

    return BankAccountList(
        items=[BankAccountRead.model_validate(acc) for acc in items],
        total_balance_paise=total_balance,
        total_reported_balance_paise=total_reported if total_reported > 0 else None,
        account_count=len([acc for acc in items if not acc.is_archived]),
        reconciliation_needed_count=discrepancy_count,
    )


def create_account(db: Session, payload: BankAccountCreate) -> BankAccount:
    account = BankAccount(
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


def update_account(db: Session, account_id: int, payload: BankAccountUpdate) -> BankAccount | None:
    account = db.get(BankAccount, account_id)
    if not account:
        return None

    data = payload.model_dump(exclude_unset=True)
    valid_cols = {c.name for c in BankAccount.__table__.columns}
    for field, val in data.items():
        if field in valid_cols:
            setattr(account, field, val)

    account.updated_at = datetime.now(timezone.utc)
    db.commit()
    recalculate_account_balance(db, account.id)
    db.refresh(account)
    return account


def delete_account(db: Session, account_id: int) -> bool:
    account = db.get(BankAccount, account_id)
    if not account:
        return False
    account.is_archived = True
    account.updated_at = datetime.now(timezone.utc)
    db.commit()
    return True


def get_reconciliation_summary(db: Session) -> list[AccountReconciliationRead]:
    query = select(BankAccount).where(BankAccount.is_archived.is_(False))
    accounts = list(db.scalars(query).all())
    results: list[AccountReconciliationRead] = []

    for acc in accounts:
        recalculate_account_balance(db, acc.id)
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
