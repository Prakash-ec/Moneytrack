import math
from datetime import date
from typing import Literal

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.models.bank_account import BankAccount
from app.models.expense import Expense
from app.models.expense_type import ExpenseType
from app.models.idempotency_key import ExpenseIdempotencyKey
from app.schemas.expense import ExpenseCreate, ExpensePage, ExpenseRead, ExpenseUpdate
from app.services.errors import ConflictError, NotFoundError

SortOrder = Literal[
    "date_desc",
    "date_asc",
    "amount_desc",
    "amount_asc",
    "created_desc",
    "created_asc",
]


def get_expense(db: Session, expense_id: int, user_id: int | None = None) -> Expense:
    stmt = (
        select(Expense)
        .options(joinedload(Expense.expense_type), joinedload(Expense.bank_account))
        .where(Expense.id == expense_id)
    )
    if user_id is not None:
        stmt = stmt.where(Expense.user_id == user_id)
    model = db.scalar(stmt)
    if model is None:
        raise NotFoundError("Expense not found.")
    return model


def _apply_sort(stmt, sort: SortOrder):
    if sort == "date_asc":
        return stmt.order_by(Expense.expense_date.asc(), Expense.id.asc())
    if sort == "amount_desc":
        return stmt.order_by(Expense.amount_paise.desc(), Expense.id.desc())
    if sort == "amount_asc":
        return stmt.order_by(Expense.amount_paise.asc(), Expense.id.asc())
    if sort == "created_desc":
        return stmt.order_by(Expense.created_at.desc(), Expense.id.desc())
    if sort == "created_asc":
        return stmt.order_by(Expense.created_at.asc(), Expense.id.asc())
    return stmt.order_by(Expense.expense_date.desc(), Expense.id.desc())


def list_expenses(
    db: Session,
    *,
    user_id: int | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    expense_type_id: int | None = None,
    category: str | None = None,
    payment_method: str | None = None,
    min_amount: int | None = None,
    max_amount: int | None = None,
    search: str | None = None,
    sort: SortOrder = "date_desc",
    page: int = 1,
    page_size: int = 25,
) -> ExpensePage:
    stmt = (
        select(Expense)
        .join(ExpenseType, Expense.expense_type_id == ExpenseType.id)
        .options(joinedload(Expense.expense_type), joinedload(Expense.bank_account))
    )
    count_stmt = select(func.count(Expense.id)).join(
        ExpenseType, Expense.expense_type_id == ExpenseType.id
    )

    conditions = []
    if user_id is not None:
        conditions.append(Expense.user_id == user_id)
    if start_date is not None:
        conditions.append(Expense.expense_date >= start_date)
    if end_date is not None:
        conditions.append(Expense.expense_date <= end_date)
    if expense_type_id is not None:
        conditions.append(Expense.expense_type_id == expense_type_id)
    if category is not None:
        conditions.append(ExpenseType.category == category)
    if payment_method:
        conditions.append(Expense.payment_method == payment_method)
    if min_amount is not None:
        conditions.append(Expense.amount_paise >= min_amount)
    if max_amount is not None:
        conditions.append(Expense.amount_paise <= max_amount)
    if search and search.strip():
        needle = f"%{search.strip()}%"
        conditions.append(
            or_(
                Expense.note.ilike(needle),
                Expense.merchant.ilike(needle),
                ExpenseType.name.ilike(needle),
                ExpenseType.category.ilike(needle),
            )
        )

    if conditions:
        stmt = stmt.where(*conditions)
        count_stmt = count_stmt.where(*conditions)

    total = int(db.scalar(count_stmt) or 0)
    stmt = _apply_sort(stmt, sort)
    items = list(
        db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).unique().all()
    )
    return ExpensePage(
        items=[ExpenseRead.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total else 0,
    )


def create_expense(
    db: Session,
    payload: ExpenseCreate,
    *,
    user_id: int | None = None,
    idempotency_key: str | None = None,
    account_id: int | None = None,
) -> tuple[ExpenseRead, bool]:
    """Create an expense, with optional idempotency-key deduplication and bank account linking.

    Returns ``(expense, replayed)``. When ``idempotency_key`` is provided and
    a previous request with the same key already created an expense, the
    existing expense is returned with ``replayed=True`` instead of inserting a
    duplicate.
    """
    if idempotency_key:
        existing = (
            db.execute(
                select(ExpenseIdempotencyKey)
                .options(joinedload(ExpenseIdempotencyKey.expense))
                .where(ExpenseIdempotencyKey.idempotency_key == idempotency_key)
            )
            .scalars()
            .first()
        )
        if existing is not None:
            loaded = get_expense(db, existing.expense_id, user_id=user_id)
            return ExpenseRead.model_validate(loaded), True

    expense_type = db.get(ExpenseType, payload.expense_type_id)
    if expense_type is None:
        raise NotFoundError("Expense type not found.")
    if user_id is not None and expense_type.user_id is not None and expense_type.user_id != user_id:
        raise NotFoundError("Expense type not found.")
    if expense_type.is_archived:
        raise ConflictError("Cannot add an expense to an archived expense type.")

    effective_account_id = account_id or getattr(payload, "account_id", None)
    if effective_account_id is not None:
        bank_acc = db.get(BankAccount, effective_account_id)
        if not bank_acc:
            raise NotFoundError("Bank account not found.")
        if user_id is not None and bank_acc.user_id is not None and bank_acc.user_id != user_id:
            raise NotFoundError("Bank account not found.")

    model = Expense(
        user_id=user_id,
        expense_type_id=payload.expense_type_id,
        account_id=effective_account_id,
        amount_paise=payload.amount_paise,
        expense_date=payload.expense_date,
        note=payload.note,
        payment_method=payload.payment_method.value if payload.payment_method else None,
        merchant=payload.merchant,
        bank_reference=payload.bank_reference,
        source=payload.source or "manual",
        confidence=payload.confidence or "HIGH",
    )
    db.add(model)
    try:
        db.flush()
        if idempotency_key:
            db.add(
                ExpenseIdempotencyKey(
                    idempotency_key=idempotency_key,
                    expense_id=model.id,
                )
            )
        db.commit()
    except IntegrityError:
        db.rollback()
        if idempotency_key:
            existing = (
                db.execute(
                    select(ExpenseIdempotencyKey).where(
                        ExpenseIdempotencyKey.idempotency_key == idempotency_key
                    )
                )
                .scalars()
                .first()
            )
            if existing is not None:
                loaded = get_expense(db, existing.expense_id, user_id=user_id)
                return ExpenseRead.model_validate(loaded), True
        raise

    if effective_account_id:
        try:
            from app.services.bank_accounts import recalculate_account_balance
            recalculate_account_balance(db, effective_account_id)
        except Exception:
            pass

    try:
        from app.services.security import evaluate_transaction_security
        evaluate_transaction_security(db, model)
    except Exception:
        pass

    loaded = get_expense(db, model.id, user_id=user_id)
    return ExpenseRead.model_validate(loaded), False


def update_expense(
    db: Session,
    expense_id: int,
    payload: ExpenseUpdate,
    user_id: int | None = None,
) -> ExpenseRead:
    model = get_expense(db, expense_id, user_id=user_id)
    old_account_id = model.account_id
    fields = payload.model_fields_set

    if "account_id" in fields:
        if payload.account_id is not None:
            account = db.get(BankAccount, payload.account_id)
            if not account or (user_id is not None and account.user_id is not None and account.user_id != user_id):
                raise NotFoundError("Bank account not found.")
        model.account_id = payload.account_id

    if "expense_type_id" in fields:
        if payload.expense_type_id is None:
            raise ConflictError("Expense type is required.")
        if payload.expense_type_id != model.expense_type_id:
            expense_type = db.get(ExpenseType, payload.expense_type_id)
            if expense_type is None:
                raise NotFoundError("Expense type not found.")
            if user_id is not None and expense_type.user_id is not None and expense_type.user_id != user_id:
                raise NotFoundError("Expense type not found.")
            if expense_type.is_archived:
                raise ConflictError("Cannot move an expense to an archived expense type.")
            model.expense_type_id = payload.expense_type_id
    if "amount_paise" in fields:
        if payload.amount_paise is None:
            raise ConflictError("Amount is required.")
        model.amount_paise = payload.amount_paise
    if "expense_date" in fields:
        if payload.expense_date is None:
            raise ConflictError("Expense date is required.")
        model.expense_date = payload.expense_date
    if "note" in fields:
        model.note = payload.note
    if "payment_method" in fields:
        model.payment_method = payload.payment_method.value if payload.payment_method else None
    if "merchant" in fields:
        model.merchant = payload.merchant

    db.commit()
    db.refresh(model)

    # Recalculate account balance for both old and new accounts
    from app.services.bank_accounts import recalculate_account_balance
    if old_account_id:
        recalculate_account_balance(db, old_account_id)
    if model.account_id and model.account_id != old_account_id:
        recalculate_account_balance(db, model.account_id)

    loaded = get_expense(db, model.id, user_id=user_id)
    return ExpenseRead.model_validate(loaded)


def delete_expense(db: Session, expense_id: int, user_id: int | None = None) -> None:
    model = get_expense(db, expense_id, user_id=user_id)
    account_id = model.account_id
    db.delete(model)
    db.commit()

    if account_id:
        from app.services.bank_accounts import recalculate_account_balance
        recalculate_account_balance(db, account_id)
