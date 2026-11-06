import csv
import hashlib
import io
import json
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.core.constants import DEFAULT_TYPE_COLOR, DEFAULT_TYPE_ICON, PaymentMethod
from app.core.money import format_inr
from app.core.time import today_ist
from app.models.account_transfer import AccountTransfer
from app.models.balance_snapshot import BalanceSnapshot
from app.models.bank_account import BankAccount
from app.models.budget import Budget, CategoryBudget
from app.models.expense import Expense
from app.models.expense_type import ExpenseType
from app.models.income import Income
from app.models.income_type import IncomeType
from app.services.bank_accounts import recalculate_account_balance
from app.services.errors import ConflictError
from app.services.expense_types import name_key


def _paise_to_rupees(amount_paise: int) -> str:
    whole, fraction = divmod(amount_paise, 100)
    return f"{whole}.{fraction:02d}"


def _expenses(
    db: Session,
    start: date | None = None,
    end: date | None = None,
    user_id: int | None = None,
) -> list[Expense]:
    stmt = (
        select(Expense)
        .options(joinedload(Expense.expense_type))
        .order_by(Expense.expense_date.asc(), Expense.id.asc())
    )
    if start:
        stmt = stmt.where(Expense.expense_date >= start)
    if end:
        stmt = stmt.where(Expense.expense_date <= end)
    if user_id is not None:
        stmt = stmt.where(Expense.user_id == user_id)
    return list(db.scalars(stmt).unique().all())


def expenses_csv(
    db: Session,
    start: date | None = None,
    end: date | None = None,
    user_id: int | None = None,
) -> tuple[str, str]:
    stmt = (
        select(Expense)
        .options(joinedload(Expense.expense_type), joinedload(Expense.bank_account))
        .order_by(Expense.expense_date.asc(), Expense.id.asc())
    )
    if user_id is not None:
        stmt = stmt.where(Expense.user_id == user_id)
    if start:
        stmt = stmt.where(Expense.expense_date >= start)
    if end:
        stmt = stmt.where(Expense.expense_date <= end)
    rows = list(db.scalars(stmt).unique().all())

    buffer = io.StringIO()
    buffer.write("\ufeff")
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "Date",
            "Expense Type",
            "Category",
            "Amount (INR)",
            "Amount (paise)",
            "Payment Method",
            "Bank Account",
            "Merchant",
            "Note",
            "Created At (UTC)",
            "Updated At (UTC)",
        ]
    )
    for expense in rows:
        acc_label = (
            f"{expense.bank_account.bank_name} ({expense.bank_account.account_number_mask})"
            if expense.bank_account
            else ""
        )
        writer.writerow(
            [
                expense.expense_date.isoformat(),
                expense.expense_type.name,
                expense.expense_type.category or "",
                _paise_to_rupees(expense.amount_paise),
                expense.amount_paise,
                expense.payment_method or "",
                acc_label,
                expense.merchant or "",
                expense.note or "",
                expense.created_at.isoformat(),
                expense.updated_at.isoformat(),
            ]
        )
    filename = f"moneytrack-expenses-{today_ist().isoformat()}.csv"
    return buffer.getvalue(), filename


def backup_json(
    db: Session, user_id: int | None = None, version: int = 2
) -> dict[str, Any]:
    """Generates a complete, relational JSON backup containing financial entities.
    Supports version 1 (legacy minimal) and version 2 (full schema with all 8 entities).
    """
    if version == 1:
        type_stmt = select(ExpenseType).order_by(ExpenseType.id.asc())
        if user_id is not None:
            type_stmt = type_stmt.where(
                (ExpenseType.user_id == user_id) | (ExpenseType.user_id.is_(None))
            )
        expense_types = list(db.scalars(type_stmt).all())
        expenses = _expenses(db, None, None, user_id=user_id)
        return {
            "schema_version": 1,
            "application": settings.app_name,
            "application_version": settings.app_version,
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "expense_types": [
                {
                    "id": item.id,
                    "name": item.name,
                    "description": item.description,
                    "category": item.category,
                    "icon": item.icon,
                    "color": item.color,
                    "is_archived": item.is_archived,
                    "created_at": item.created_at.isoformat(),
                    "updated_at": item.updated_at.isoformat(),
                }
                for item in expense_types
            ],
            "expenses": [
                {
                    "id": item.id,
                    "expense_type_id": item.expense_type_id,
                    "expense_type_name": item.expense_type.name,
                    "amount_paise": item.amount_paise,
                    "amount_rupees": format_inr(item.amount_paise),
                    "expense_date": item.expense_date.isoformat(),
                    "note": item.note,
                    "payment_method": item.payment_method,
                    "merchant": item.merchant,
                    "created_at": item.created_at.isoformat(),
                    "updated_at": item.updated_at.isoformat(),
                }
                for item in expenses
            ],
        }

    # Version 2: Complete Relational Schema
    # 1. Expense Types
    type_stmt = select(ExpenseType).order_by(ExpenseType.id.asc())
    if user_id is not None:
        type_stmt = type_stmt.where(
            (ExpenseType.user_id == user_id) | (ExpenseType.user_id.is_(None))
        )
    expense_types = list(db.scalars(type_stmt).all())

    # 2. Income Types
    inc_type_stmt = select(IncomeType).order_by(IncomeType.id.asc())
    if user_id is not None:
        inc_type_stmt = inc_type_stmt.where(
            (IncomeType.user_id == user_id) | (IncomeType.user_id.is_(None))
        )
    income_types = list(db.scalars(inc_type_stmt).all())

    # 3. Bank Accounts
    acc_stmt = select(BankAccount).order_by(BankAccount.id.asc())
    if user_id is not None:
        acc_stmt = acc_stmt.where(BankAccount.user_id == user_id)
    bank_accounts = list(db.scalars(acc_stmt).all())

    # 4. Expenses
    exp_stmt = (
        select(Expense)
        .options(joinedload(Expense.expense_type))
        .order_by(Expense.expense_date.asc(), Expense.id.asc())
    )
    if user_id is not None:
        exp_stmt = exp_stmt.where(Expense.user_id == user_id)
    expenses = list(db.scalars(exp_stmt).unique().all())

    # 5. Incomes
    inc_stmt = (
        select(Income)
        .options(joinedload(Income.income_type))
        .order_by(Income.income_date.asc(), Income.id.asc())
    )
    if user_id is not None:
        inc_stmt = inc_stmt.where(Income.user_id == user_id)
    incomes = list(db.scalars(inc_stmt).unique().all())

    # 6. Transfers
    trans_stmt = select(AccountTransfer).order_by(AccountTransfer.transfer_date.asc(), AccountTransfer.id.asc())
    if user_id is not None:
        trans_stmt = trans_stmt.where(AccountTransfer.user_id == user_id)
    transfers = list(db.scalars(trans_stmt).all())

    # 7. Budgets
    b_stmt = select(Budget).order_by(Budget.budget_period.asc())
    if user_id is not None:
        b_stmt = b_stmt.where(Budget.user_id == user_id)
    budgets = list(db.scalars(b_stmt).all())

    # 8. Category Budgets
    cb_stmt = select(CategoryBudget).order_by(CategoryBudget.budget_period.asc())
    if user_id is not None:
        cb_stmt = cb_stmt.where(CategoryBudget.user_id == user_id)
    category_budgets = list(db.scalars(cb_stmt).all())

    payload = {
        "schema_version": 2,
        "application": settings.app_name,
        "application_version": "2.0.0",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "expense_types": [
            {
                "id": t.id,
                "name": t.name,
                "description": t.description,
                "category": t.category,
                "icon": t.icon,
                "color": t.color,
                "is_archived": t.is_archived,
                "created_at": t.created_at.isoformat(),
                "updated_at": t.updated_at.isoformat(),
            }
            for t in expense_types
        ],
        "income_types": [
            {
                "id": it.id,
                "name": it.name,
                "description": it.description,
                "category": it.category,
                "icon": it.icon,
                "color": it.color,
                "is_archived": it.is_archived,
                "created_at": it.created_at.isoformat(),
                "updated_at": it.updated_at.isoformat(),
            }
            for it in income_types
        ],
        "bank_accounts": [
            {
                "id": b.id,
                "bank_name": b.bank_name,
                "account_name": b.account_name,
                "account_type": b.account_type,
                "account_number_mask": b.account_number_mask,
                "currency": b.currency,
                "opening_balance_paise": b.opening_balance_paise,
                "opening_balance_date": b.opening_balance_date.isoformat(),
                "current_balance_paise": b.current_balance_paise,
                "last_reported_balance_paise": b.last_reported_balance_paise,
                "last_reported_at": b.last_reported_at.isoformat() if b.last_reported_at else None,
                "reconciliation_status": b.reconciliation_status,
                "color": b.color,
                "icon": b.icon,
                "is_archived": b.is_archived,
            }
            for b in bank_accounts
        ],
        "expenses": [
            {
                "id": e.id,
                "expense_type_id": e.expense_type_id,
                "expense_type_name": e.expense_type.name if e.expense_type else "",
                "account_id": e.account_id,
                "amount_paise": e.amount_paise,
                "amount_rupees": format_inr(e.amount_paise),
                "expense_date": e.expense_date.isoformat(),
                "note": e.note,
                "payment_method": e.payment_method,
                "merchant": e.merchant,
                "created_at": e.created_at.isoformat(),
                "updated_at": e.updated_at.isoformat(),
            }
            for e in expenses
        ],
        "incomes": [
            {
                "id": inc.id,
                "income_type_id": inc.income_type_id,
                "income_type_name": inc.income_type.name if inc.income_type else "",
                "account_id": inc.account_id,
                "amount_paise": inc.amount_paise,
                "amount_rupees": format_inr(inc.amount_paise),
                "income_date": inc.income_date.isoformat(),
                "payer": inc.payer,
                "description": inc.description,
                "payment_method": inc.payment_method,
                "bank_reference": inc.bank_reference,
                "source": inc.source,
                "created_at": inc.created_at.isoformat(),
                "updated_at": inc.updated_at.isoformat(),
            }
            for inc in incomes
        ],
        "transfers": [
            {
                "id": tr.id,
                "from_account_id": tr.from_account_id,
                "to_account_id": tr.to_account_id,
                "amount_paise": tr.amount_paise,
                "transfer_date": tr.transfer_date.isoformat(),
                "description": tr.description,
                "bank_reference": tr.bank_reference,
            }
            for tr in transfers
        ],
        "budgets": [
            {
                "id": bg.id,
                "budget_period": bg.budget_period.isoformat(),
                "amount_paise": bg.amount_paise,
            }
            for bg in budgets
        ],
        "category_budgets": [
            {
                "id": cbg.id,
                "budget_period": cbg.budget_period.isoformat(),
                "category": cbg.category,
                "amount_paise": cbg.amount_paise,
            }
            for cbg in category_budgets
        ],
    }

    # Generate integrity checksum of financial data
    raw_bytes = json.dumps(payload, sort_keys=True).encode("utf-8")
    payload["checksum"] = hashlib.sha256(raw_bytes).hexdigest()
    return payload


def restore_json(
    db: Session,
    payload: dict[str, Any],
    user_id: int | None = None,
    allowed_versions: tuple[int, ...] = (1, 2),
) -> dict[str, Any]:
    """Restores database from JSON backup (supports version 1 and version 2) atomically."""
    if not isinstance(payload, dict):
        raise ConflictError("Invalid backup format: expected a JSON object.")

    schema_version = payload.get("schema_version")
    if schema_version not in allowed_versions:
        if allowed_versions == (1,):
            raise ConflictError(
                f"Unsupported backup schema version: {schema_version}. Only version 1 is supported."
            )
        raise ConflictError(
            f"Unsupported backup schema version: {schema_version}. Supported versions: {allowed_versions}."
        )

    types_data = payload.get("expense_types", [])
    expenses_data = payload.get("expenses", [])
    if not isinstance(types_data, list) or not isinstance(expenses_data, list):
        raise ConflictError("Backup missing required 'expense_types' or 'expenses' list.")

    backup_types_by_id = {item.get("id"): item for item in types_data if isinstance(item, dict) and item.get("id")}

    # Begin atomic transaction
    try:
        restored_types_count = 0
        matched_types_count = 0
        restored_expenses_count = 0
        skipped_expenses_count = 0
        restored_accounts_count = 0
        restored_incomes_count = 0
        restored_transfers_count = 0
        restored_budgets_count = 0

        # ------------------------------------------------------------- #
        # 1. Restore & Map Expense Types
        # ------------------------------------------------------------- #
        existing_types = list(db.scalars(select(ExpenseType)).all())
        existing_type_by_key = {t.name_key: t for t in existing_types}
        type_id_map: dict[int, int] = {}

        for item in types_data:
            if not isinstance(item, dict):
                continue
            tid = item.get("id")
            name = (item.get("name") or "").strip()
            if not name:
                continue
            tkey = name_key(name)
            if tkey in existing_type_by_key:
                if tid:
                    type_id_map[tid] = existing_type_by_key[tkey].id
                matched_types_count += 1
            else:
                new_type = ExpenseType(
                    user_id=user_id,
                    name=name,
                    name_key=tkey,
                    description=item.get("description"),
                    category=item.get("category"),
                    icon=item.get("icon") or DEFAULT_TYPE_ICON,
                    color=item.get("color") or DEFAULT_TYPE_COLOR,
                    is_archived=bool(item.get("is_archived", False)),
                )
                db.add(new_type)
                db.flush()
                existing_type_by_key[tkey] = new_type
                if tid:
                    type_id_map[tid] = new_type.id
                restored_types_count += 1

        # ------------------------------------------------------------- #
        # 2. Restore & Map Bank Accounts (v2 only)
        # ------------------------------------------------------------- #
        account_id_map: dict[int, int] = {}
        if schema_version >= 2 and "bank_accounts" in payload:
            acc_stmt = select(BankAccount)
            if user_id is not None:
                acc_stmt = acc_stmt.where(BankAccount.user_id == user_id)
            existing_accounts = list(db.scalars(acc_stmt).all())
            existing_acc_by_sig = {
                (a.bank_name.lower().strip(), a.account_number_mask.strip()): a
                for a in existing_accounts
            }

            for acc_data in payload.get("bank_accounts", []):
                if not isinstance(acc_data, dict):
                    continue
                aid = acc_data.get("id")
                b_name = (acc_data.get("bank_name") or "").strip()
                mask = (acc_data.get("account_number_mask") or "").strip()
                if not b_name or not mask:
                    continue

                sig = (b_name.lower(), mask)
                if sig in existing_acc_by_sig:
                    if aid:
                        account_id_map[aid] = existing_acc_by_sig[sig].id
                else:
                    op_date = date.today()
                    if acc_data.get("opening_balance_date"):
                        try:
                            op_date = date.fromisoformat(acc_data["opening_balance_date"])
                        except ValueError:
                            pass

                    new_acc = BankAccount(
                        user_id=user_id,
                        bank_name=b_name,
                        account_name=(acc_data.get("account_name") or b_name).strip(),
                        account_type=acc_data.get("account_type", "savings"),
                        account_number_mask=mask,
                        currency=acc_data.get("currency", "INR"),
                        opening_balance_paise=int(acc_data.get("opening_balance_paise", 0)),
                        opening_balance_date=op_date,
                        current_balance_paise=int(acc_data.get("current_balance_paise", 0)),
                        last_reported_balance_paise=acc_data.get("last_reported_balance_paise"),
                        reconciliation_status=acc_data.get("reconciliation_status", "matched"),
                        color=acc_data.get("color", "#1D4ED8"),
                        icon=acc_data.get("icon", "building"),
                        is_archived=bool(acc_data.get("is_archived", False)),
                    )
                    db.add(new_acc)
                    db.flush()
                    existing_acc_by_sig[sig] = new_acc
                    if aid:
                        account_id_map[aid] = new_acc.id
                    restored_accounts_count += 1

        # ------------------------------------------------------------- #
        # 3. Restore & Map Income Types (v2 only)
        # ------------------------------------------------------------- #
        income_type_id_map: dict[int, int] = {}
        if schema_version >= 2 and "income_types" in payload:
            existing_income_types = list(db.scalars(select(IncomeType)).all())
            existing_it_by_key = {it.name_key: it for it in existing_income_types}

            for item in payload.get("income_types", []):
                if not isinstance(item, dict):
                    continue
                itid = item.get("id")
                name = (item.get("name") or "").strip()
                if not name:
                    continue
                itkey = name.lower().replace(" ", "_")
                if itkey in existing_it_by_key:
                    if itid:
                        income_type_id_map[itid] = existing_it_by_key[itkey].id
                else:
                    new_it = IncomeType(
                        user_id=user_id,
                        name=name,
                        name_key=itkey,
                        description=item.get("description"),
                        category=item.get("category"),
                        color=item.get("color", "#10B981"),
                        icon=item.get("icon", "wallet"),
                        is_archived=bool(item.get("is_archived", False)),
                    )
                    db.add(new_it)
                    db.flush()
                    existing_it_by_key[itkey] = new_it
                    if itid:
                        income_type_id_map[itid] = new_it.id

        # ------------------------------------------------------------- #
        # 4. Restore Expenses
        # ------------------------------------------------------------- #
        exp_stmt = select(Expense)
        if user_id is not None:
            exp_stmt = exp_stmt.where(Expense.user_id == user_id)
        existing_expenses = list(db.scalars(exp_stmt).all())
        existing_exp_signatures = {
            (
                e.expense_type_id,
                e.amount_paise,
                e.expense_date,
                e.note,
                e.payment_method,
                e.merchant,
            )
            for e in existing_expenses
        }

        for idx, exp in enumerate(expenses_data):
            if not isinstance(exp, dict):
                raise ConflictError(f"Expense #{idx + 1} is not a valid JSON object.")
            amt = exp.get("amount_paise")
            if not isinstance(amt, int) or amt <= 0:
                raise ConflictError(f"Expense #{idx + 1} has non-positive amount {amt} paise.")

            raw_d = exp.get("expense_date")
            try:
                exp_date = date.fromisoformat(str(raw_d))
            except (ValueError, TypeError) as exc:
                raise ConflictError(f"Expense #{idx + 1} has invalid date '{raw_d}': {exc}") from exc

            target_type_id = None
            btid = exp.get("expense_type_id")
            if btid in type_id_map:
                target_type_id = type_id_map[btid]
            elif exp.get("expense_type_name") and name_key(exp["expense_type_name"]) in existing_type_by_key:
                target_type_id = existing_type_by_key[name_key(exp["expense_type_name"])].id

            if not target_type_id:
                raise ConflictError(f"Expense #{idx + 1} references unknown expense type ID {btid}.")

            target_acc_id = None
            if exp.get("account_id") and exp["account_id"] in account_id_map:
                target_acc_id = account_id_map[exp["account_id"]]

            note = exp.get("note")
            note = str(note).strip()[:500] if note else None
            merchant = exp.get("merchant")
            merchant = str(merchant).strip()[:120] if merchant else None
            method = exp.get("payment_method")

            sig = (target_type_id, amt, exp_date, note, method, merchant)
            if sig in existing_exp_signatures:
                skipped_expenses_count += 1
                continue

            new_expense = Expense(
                user_id=user_id,
                expense_type_id=target_type_id,
                account_id=target_acc_id,
                amount_paise=amt,
                expense_date=exp_date,
                note=note,
                payment_method=method,
                merchant=merchant,
            )
            db.add(new_expense)
            existing_exp_signatures.add(sig)
            restored_expenses_count += 1

        # ------------------------------------------------------------- #
        # 5. Restore Incomes (v2 only)
        # ------------------------------------------------------------- #
        if schema_version >= 2 and "incomes" in payload:
            inc_stmt = select(Income)
            if user_id is not None:
                inc_stmt = inc_stmt.where(Income.user_id == user_id)
            existing_incomes = list(db.scalars(inc_stmt).all())
            existing_inc_signatures = {
                (
                    inc.amount_paise,
                    inc.income_date,
                    inc.payer,
                    inc.description,
                )
                for inc in existing_incomes
            }

            for inc_data in payload.get("incomes", []):
                if not isinstance(inc_data, dict):
                    continue
                amt = inc_data.get("amount_paise")
                if not isinstance(amt, int) or amt <= 0:
                    continue

                try:
                    inc_date = date.fromisoformat(str(inc_data.get("income_date")))
                except ValueError:
                    continue

                target_it_id = None
                bitid = inc_data.get("income_type_id")
                if bitid in income_type_id_map:
                    target_it_id = income_type_id_map[bitid]
                else:
                    # Fallback to first available income type
                    target_it_id = next(iter(income_type_id_map.values()), None)

                if not target_it_id:
                    continue

                target_acc_id = None
                if inc_data.get("account_id") and inc_data["account_id"] in account_id_map:
                    target_acc_id = account_id_map[inc_data["account_id"]]

                payer = inc_data.get("payer")
                desc = inc_data.get("description")
                sig = (amt, inc_date, payer, desc)
                if sig in existing_inc_signatures:
                    continue

                new_inc = Income(
                    user_id=user_id,
                    income_type_id=target_it_id,
                    account_id=target_acc_id,
                    amount_paise=amt,
                    income_date=inc_date,
                    payer=payer,
                    description=desc,
                    payment_method=inc_data.get("payment_method"),
                    bank_reference=inc_data.get("bank_reference"),
                    source=inc_data.get("source", "restore"),
                )
                db.add(new_inc)
                existing_inc_signatures.add(sig)
                restored_incomes_count += 1

        # ------------------------------------------------------------- #
        # 6. Restore Transfers (v2 only)
        # ------------------------------------------------------------- #
        if schema_version >= 2 and "transfers" in payload:
            for tr_data in payload.get("transfers", []):
                if not isinstance(tr_data, dict):
                    continue
                b_from = tr_data.get("from_account_id")
                b_to = tr_data.get("to_account_id")
                amt = tr_data.get("amount_paise")
                if not isinstance(amt, int) or amt <= 0:
                    continue
                if b_from not in account_id_map or b_to not in account_id_map:
                    continue
                t_from = account_id_map[b_from]
                t_to = account_id_map[b_to]
                if t_from == t_to:
                    continue

                try:
                    tr_date = date.fromisoformat(str(tr_data.get("transfer_date")))
                except ValueError:
                    continue

                new_transfer = AccountTransfer(
                    user_id=user_id,
                    from_account_id=t_from,
                    to_account_id=t_to,
                    amount_paise=amt,
                    transfer_date=tr_date,
                    description=tr_data.get("description"),
                    bank_reference=tr_data.get("bank_reference"),
                )
                db.add(new_transfer)
                restored_transfers_count += 1

        # ------------------------------------------------------------- #
        # 7. Restore Budgets (v2 only)
        # ------------------------------------------------------------- #
        if schema_version >= 2 and "budgets" in payload:
            for b_data in payload.get("budgets", []):
                if not isinstance(b_data, dict):
                    continue
                amt = b_data.get("amount_paise")
                if not isinstance(amt, int) or amt < 0:
                    continue
                try:
                    period = date.fromisoformat(str(b_data.get("budget_period")))
                    period = date(period.year, period.month, 1)
                except ValueError:
                    continue

                b_stmt = select(Budget).where(Budget.budget_period == period)
                if user_id is not None:
                    b_stmt = b_stmt.where(Budget.user_id == user_id)
                existing_b = db.scalar(b_stmt)
                if not existing_b:
                    db.add(Budget(user_id=user_id, budget_period=period, amount_paise=amt))
                    restored_budgets_count += 1

        db.commit()

        # Recalculate balances for all affected accounts
        for acc_id in account_id_map.values():
            try:
                recalculate_account_balance(db, acc_id)
            except Exception:
                pass

    except Exception:
        db.rollback()
        raise

    return {
        "schema_version": schema_version,
        "restored_types": restored_types_count,
        "matched_types": matched_types_count,
        "restored_expenses": restored_expenses_count,
        "skipped_expenses": skipped_expenses_count,
        "restored_accounts": restored_accounts_count,
        "restored_incomes": restored_incomes_count,
        "restored_transfers": restored_transfers_count,
        "restored_budgets": restored_budgets_count,
        "message": (
            f"Successfully restored {restored_expenses_count} expense(s), "
            f"{restored_incomes_count} income(s), {restored_accounts_count} account(s), "
            f"and {restored_transfers_count} transfer(s) across "
            f"{restored_types_count + matched_types_count} category(ies)."
            + (f" {skipped_expenses_count} duplicate(s) were skipped." if skipped_expenses_count else "")
        ),
    }
