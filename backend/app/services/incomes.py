import math
from datetime import UTC, date, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models.bank_account import BankAccount
from app.models.income import Income
from app.models.income_type import IncomeType
from app.schemas.income import IncomeCreate, IncomeList, IncomeRead, IncomeUpdate
from app.services.bank_accounts import recalculate_account_balance
from app.services.errors import ConflictError, NotFoundError


def get_income(db: Session, income_id: int, user_id: int | None = None) -> Income | None:
    query = (
        select(Income)
        .options(joinedload(Income.income_type), joinedload(Income.bank_account))
        .where(Income.id == income_id)
    )
    if user_id is not None:
        query = query.where(Income.user_id == user_id)
    return db.scalar(query)


def list_incomes(
    db: Session,
    *,
    user_id: int | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    income_type_id: int | None = None,
    account_id: int | None = None,
    q: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> IncomeList:
    query = select(Income).options(
        joinedload(Income.income_type),
        joinedload(Income.bank_account),
    )

    if user_id is not None:
        query = query.where(Income.user_id == user_id)
    if start_date:
        query = query.where(Income.income_date >= start_date)
    if end_date:
        query = query.where(Income.income_date <= end_date)
    if income_type_id:
        query = query.where(Income.income_type_id == income_type_id)
    if account_id:
        query = query.where(Income.account_id == account_id)
    if q and q.strip():
        term = f"%{q.strip().lower()}%"
        query = query.where(
            func.lower(Income.payer).like(term)
            | func.lower(Income.description).like(term)
            | func.lower(Income.bank_reference).like(term)
        )

    # Total count and sum
    subq = query.subquery()
    total = db.scalar(select(func.count()).select_from(subq)) or 0
    total_paise = (
        db.scalar(select(func.coalesce(func.sum(subq.c.amount_paise), 0)))
        or 0
    )

    # Pagination
    offset = (max(1, page) - 1) * page_size
    items = list(
        db.scalars(
            query.order_by(Income.income_date.desc(), Income.id.desc())
            .offset(offset)
            .limit(page_size)
        ).unique().all()
    )

    pages = math.ceil(total / page_size) if total > 0 else 1

    def to_read(item: Income) -> IncomeRead:
        read = IncomeRead.model_validate(item)
        read.note = item.description
        read.reference = item.bank_reference
        read.account = read.bank_account
        return read

    return IncomeList(
        items=[to_read(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
        total_paise=total_paise,
    )


def create_income(
    db: Session,
    payload: IncomeCreate,
    *,
    user_id: int | None = None,
    idempotency_key: str | None = None,
) -> tuple[Income, bool]:
    """Creates an income record or returns existing one if idempotent key matches."""
    effective_key = idempotency_key or getattr(payload, "idempotency_key", None)
    if effective_key:
        stmt = (
            select(Income)
            .options(joinedload(Income.income_type), joinedload(Income.bank_account))
            .where(Income.idempotency_key == effective_key)
        )
        if user_id is not None:
            stmt = stmt.where(Income.user_id == user_id)
        existing = db.scalar(stmt)
        if existing:
            return existing, True

    desc = payload.description or payload.note
    ref = payload.bank_reference or payload.reference

    # Verify income type ownership (must belong to authenticated user OR be system global)
    income_type = db.get(IncomeType, payload.income_type_id)
    if income_type is None:
        raise NotFoundError("Income type not found.")
    if user_id is not None and income_type.user_id is not None and income_type.user_id != user_id:
        raise NotFoundError("Income type not found.")
    if income_type.is_archived:
        raise ConflictError("Cannot add an income to an archived income type.")

    # Verify bank account ownership (must belong to authenticated user)
    if payload.account_id is not None:
        bank_acc = db.get(BankAccount, payload.account_id)
        if not bank_acc:
            raise NotFoundError("Bank account not found.")
        if user_id is not None and bank_acc.user_id is not None and bank_acc.user_id != user_id:
            raise NotFoundError("Bank account not found.")

    income = Income(
        user_id=user_id,
        income_type_id=payload.income_type_id,
        account_id=payload.account_id,
        amount_paise=payload.amount_paise,
        income_date=payload.income_date,
        payer=payload.payer.strip() if payload.payer else None,
        description=desc.strip() if desc else None,
        payment_method=payload.payment_method.strip().lower()
        if payload.payment_method
        else None,
        bank_reference=ref.strip() if ref else None,
        source=payload.source,
        confidence=payload.confidence or "HIGH",
        idempotency_key=effective_key,
    )
    db.add(income)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if effective_key:
            stmt = (
                select(Income)
                .options(joinedload(Income.income_type), joinedload(Income.bank_account))
                .where(Income.idempotency_key == effective_key)
            )
            if user_id is not None:
                stmt = stmt.where(Income.user_id == user_id)
            existing = db.scalar(stmt)
            if existing:
                return existing, True
        raise

    db.refresh(income)

    if income.account_id:
        recalculate_account_balance(db, income.account_id)

    db.refresh(income)
    return income, False


def update_income(
    db: Session,
    income_id: int,
    payload: IncomeUpdate,
    *,
    user_id: int | None = None,
) -> Income | None:
    income = get_income(db, income_id, user_id=user_id)
    if not income:
        return None

    prev_account_id = income.account_id
    data = payload.model_dump(exclude_unset=True)

    if "income_type_id" in data and data["income_type_id"] is not None:
        income_type = db.get(IncomeType, data["income_type_id"])
        if income_type is None:
            raise NotFoundError("Income type not found.")
        if user_id is not None and income_type.user_id is not None and income_type.user_id != user_id:
            raise NotFoundError("Income type not found.")
        if income_type.is_archived:
            raise ConflictError("Cannot move an income to an archived income type.")

    if "account_id" in data and data["account_id"] is not None:
        bank_acc = db.get(BankAccount, data["account_id"])
        if not bank_acc:
            raise NotFoundError("Bank account not found.")
        if user_id is not None and bank_acc.user_id is not None and bank_acc.user_id != user_id:
            raise NotFoundError("Bank account not found.")

    if "note" in data and "description" not in data:
        data["description"] = data.pop("note")
    elif "note" in data:
        data.pop("note")
    if "reference" in data and "bank_reference" not in data:
        data["bank_reference"] = data.pop("reference")
    elif "reference" in data:
        data.pop("reference")

    for field, val in data.items():
        if hasattr(income, field):
            setattr(income, field, val)

    income.updated_at = datetime.now(UTC)
    db.commit()

    # Recalculate old and new account balances
    if prev_account_id:
        recalculate_account_balance(db, prev_account_id)
    if income.account_id and income.account_id != prev_account_id:
        recalculate_account_balance(db, income.account_id)

    db.refresh(income)
    return income


def delete_income(db: Session, income_id: int, user_id: int | None = None) -> bool:
    income = get_income(db, income_id, user_id=user_id)
    if not income:
        return False

    account_id = income.account_id
    db.delete(income)
    db.commit()

    if account_id:
        recalculate_account_balance(db, account_id)

    return True
