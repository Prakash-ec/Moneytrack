import csv
import io
from datetime import datetime, date, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.core.constants import DEFAULT_TYPE_COLOR, DEFAULT_TYPE_ICON, PaymentMethod
from app.core.money import format_inr
from app.core.time import today_ist
from app.models.expense import Expense
from app.models.expense_type import ExpenseType
from app.services.errors import ConflictError
from app.services.expense_types import name_key


def _expenses(db: Session, start: date | None, end: date | None) -> list[Expense]:
    stmt = (
        select(Expense)
        .options(joinedload(Expense.expense_type))
        .order_by(Expense.expense_date.asc(), Expense.id.asc())
    )
    if start:
        stmt = stmt.where(Expense.expense_date >= start)
    if end:
        stmt = stmt.where(Expense.expense_date <= end)
    return list(db.scalars(stmt).unique().all())


def _paise_to_rupees(amount_paise: int) -> str:
    whole, fraction = divmod(amount_paise, 100)
    return f"{whole}.{fraction:02d}"


def expenses_csv(db: Session, start: date | None, end: date | None) -> tuple[str, str]:
    rows = _expenses(db, start, end)
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
            "Merchant",
            "Note",
            "Created At (UTC)",
            "Updated At (UTC)",
        ]
    )
    for expense in rows:
        writer.writerow(
            [
                expense.expense_date.isoformat(),
                expense.expense_type.name,
                expense.expense_type.category or "",
                _paise_to_rupees(expense.amount_paise),
                expense.amount_paise,
                expense.payment_method or "",
                expense.merchant or "",
                expense.note or "",
                expense.created_at.isoformat(),
                expense.updated_at.isoformat(),
            ]
        )
    filename = f"moneytrack-expenses-{today_ist().isoformat()}.csv"
    return buffer.getvalue(), filename


def backup_json(db: Session) -> dict:
    expense_types = list(
        db.scalars(select(ExpenseType).order_by(ExpenseType.id.asc())).all()
    )
    expenses = _expenses(db, None, None)
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


def restore_json(db: Session, payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise ConflictError("Invalid backup format: expected a JSON object.")

    schema_version = payload.get("schema_version")
    if schema_version != 1:
        raise ConflictError(
            f"Unsupported backup schema version: {schema_version}. Only version 1 is supported."
        )

    types_data = payload.get("expense_types")
    if not isinstance(types_data, list):
        raise ConflictError("Backup missing 'expense_types' list.")

    expenses_data = payload.get("expenses")
    if not isinstance(expenses_data, list):
        raise ConflictError("Backup missing 'expenses' list.")

    backup_types_by_id: dict[int, dict] = {}
    for item in types_data:
        if not isinstance(item, dict):
            raise ConflictError("Invalid expense type entry in backup.")
        tid = item.get("id")
        if not isinstance(tid, int) or tid <= 0:
            raise ConflictError("Expense type in backup has invalid or missing id.")
        name = (item.get("name") or "").strip()
        if not name:
            raise ConflictError("Expense type in backup is missing a name.")
        backup_types_by_id[tid] = item

    validated_expenses = []
    for idx, item in enumerate(expenses_data):
        if not isinstance(item, dict):
            raise ConflictError(f"Expense #{idx + 1} is not a valid object.")

        amount = item.get("amount_paise")
        if not isinstance(amount, int) or amount <= 0 or amount > 10**13:
            raise ConflictError(
                f"Expense #{idx + 1} has invalid amount: must be positive integer paise."
            )

        raw_date = item.get("expense_date")
        if not isinstance(raw_date, str):
            raise ConflictError(f"Expense #{idx + 1} has missing or invalid date.")
        try:
            parsed_date = date.fromisoformat(raw_date)
        except ValueError as exc:
            raise ConflictError(f"Expense #{idx + 1} has invalid date '{raw_date}': {exc}") from exc

        tid = item.get("expense_type_id")
        type_name = (item.get("expense_type_name") or "").strip()
        if (tid is None or tid not in backup_types_by_id) and not type_name:
            raise ConflictError(f"Expense #{idx + 1} references unknown expense type ID {tid}.")

        payment_method = item.get("payment_method")
        if payment_method:
            if not isinstance(payment_method, str) or payment_method not in [m.value for m in PaymentMethod]:
                payment_method = None

        merchant = item.get("merchant")
        merchant = merchant.strip()[:120] if isinstance(merchant, str) and merchant.strip() else None

        note = item.get("note")
        note = note.strip()[:500] if isinstance(note, str) and note.strip() else None

        validated_expenses.append(
            {
                "backup_type_id": tid,
                "type_name": type_name,
                "amount_paise": amount,
                "expense_date": parsed_date,
                "payment_method": payment_method,
                "merchant": merchant,
                "note": note,
            }
        )

    try:
        existing_types = list(db.scalars(select(ExpenseType)).all())
        existing_by_key: dict[str, ExpenseType] = {item.name_key: item for item in existing_types}

        type_id_map: dict[int, int] = {}
        restored_types_count = 0
        matched_types_count = 0

        for tid, tdata in backup_types_by_id.items():
            tname = " ".join(tdata["name"].split())
            tkey = name_key(tname)
            if tkey in existing_by_key:
                type_id_map[tid] = existing_by_key[tkey].id
                matched_types_count += 1
            else:
                new_type = ExpenseType(
                    name=tname,
                    name_key=tkey,
                    description=tdata.get("description"),
                    category=tdata.get("category"),
                    icon=tdata.get("icon") or DEFAULT_TYPE_ICON,
                    color=tdata.get("color") or DEFAULT_TYPE_COLOR,
                    is_archived=bool(tdata.get("is_archived", False)),
                )
                db.add(new_type)
                db.flush()
                existing_by_key[tkey] = new_type
                type_id_map[tid] = new_type.id
                restored_types_count += 1

        existing_expenses = list(db.scalars(select(Expense)).all())
        existing_signatures = {
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

        restored_expenses_count = 0
        skipped_expenses_count = 0

        for exp in validated_expenses:
            target_type_id = None
            if exp["backup_type_id"] in type_id_map:
                target_type_id = type_id_map[exp["backup_type_id"]]
            elif exp["type_name"] and name_key(exp["type_name"]) in existing_by_key:
                target_type_id = existing_by_key[name_key(exp["type_name"])].id
            else:
                raise ConflictError(f"Could not map expense type for expense on {exp['expense_date']}.")

            sig = (
                target_type_id,
                exp["amount_paise"],
                exp["expense_date"],
                exp["note"],
                exp["payment_method"],
                exp["merchant"],
            )
            if sig in existing_signatures:
                skipped_expenses_count += 1
                continue

            new_expense = Expense(
                expense_type_id=target_type_id,
                amount_paise=exp["amount_paise"],
                expense_date=exp["expense_date"],
                note=exp["note"],
                payment_method=exp["payment_method"],
                merchant=exp["merchant"],
            )
            db.add(new_expense)
            existing_signatures.add(sig)
            restored_expenses_count += 1

        db.commit()
    except Exception:
        db.rollback()
        raise

    return {
        "restored_types": restored_types_count,
        "matched_types": matched_types_count,
        "restored_expenses": restored_expenses_count,
        "skipped_expenses": skipped_expenses_count,
        "message": (
            f"Restored {restored_expenses_count} new expense(s) across "
            f"{restored_types_count + matched_types_count} expense type(s)."
            + (
                f" {skipped_expenses_count} duplicate expense(s) were skipped."
                if skipped_expenses_count
                else ""
            )
        ),
    }
