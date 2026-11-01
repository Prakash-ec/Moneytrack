import math
from datetime import date, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.constants import DEFAULT_TYPE_COLOR, DEFAULT_TYPE_ICON
from app.core.money import change_percent, divide_round
from app.models.expense import Expense
from app.models.expense_type import ExpenseType
from app.schemas.expense_type import (
    ExpenseBrief,
    ExpenseTypeCreate,
    ExpenseTypeList,
    ExpenseTypePeriodSummary,
    ExpenseTypeRead,
    ExpenseTypeRef,
    ExpenseTypeUpdate,
    TypeDailyPoint,
)
from app.services.errors import ConflictError, NotFoundError
from app.services.periods import previous_period


def name_key(name: str) -> str:
    return " ".join(name.split()).casefold()


def _stats_subquery():
    return (
        select(
            Expense.expense_type_id.label("type_id"),
            func.coalesce(func.sum(Expense.amount_paise), 0).label("total_paise"),
            func.count(Expense.id).label("transaction_count"),
        )
        .group_by(Expense.expense_type_id)
        .subquery()
    )


def _to_read(model: ExpenseType, total_paise: int, transaction_count: int) -> ExpenseTypeRead:
    item = ExpenseTypeRead.model_validate(model)
    item.total_paise = int(total_paise)
    item.transaction_count = int(transaction_count)
    return item


def get_expense_type(db: Session, type_id: int) -> ExpenseType:
    model = db.get(ExpenseType, type_id)
    if model is None:
        raise NotFoundError("Expense type not found.")
    return model


def expense_type_detail(db: Session, type_id: int) -> ExpenseTypeRead:
    model = get_expense_type(db, type_id)
    total = int(
        db.scalar(
            select(func.coalesce(func.sum(Expense.amount_paise), 0)).where(
                Expense.expense_type_id == model.id
            )
        )
        or 0
    )
    count = int(
        db.scalar(
            select(func.count(Expense.id)).where(Expense.expense_type_id == model.id)
        )
        or 0
    )
    return _to_read(model, total, count)


def list_expense_types(
    db: Session,
    *,
    search: str | None = None,
    archived: str = "exclude",
    page: int = 1,
    page_size: int = 50,
) -> ExpenseTypeList:
    stats = _stats_subquery()
    stmt = (
        select(ExpenseType, stats.c.total_paise, stats.c.transaction_count)
        .outerjoin(stats, stats.c.type_id == ExpenseType.id)
        .order_by(ExpenseType.is_archived.asc(), func.lower(ExpenseType.name).asc())
    )
    count_stmt = select(func.count(ExpenseType.id))

    if archived == "exclude":
        stmt = stmt.where(ExpenseType.is_archived.is_(False))
        count_stmt = count_stmt.where(ExpenseType.is_archived.is_(False))
    elif archived == "only":
        stmt = stmt.where(ExpenseType.is_archived.is_(True))
        count_stmt = count_stmt.where(ExpenseType.is_archived.is_(True))
    else:
        pass

    if search and search.strip():
        needle = f"%{search.strip()}%"
        condition = or_(
            ExpenseType.name.ilike(needle),
            ExpenseType.description.ilike(needle),
            ExpenseType.category.ilike(needle),
        )
        stmt = stmt.where(condition)
        count_stmt = count_stmt.where(condition)

    total = int(db.scalar(count_stmt) or 0)
    rows = db.execute(stmt.offset((page - 1) * page_size).limit(page_size)).all()
    items = [_to_read(model, total_paise or 0, count or 0) for model, total_paise, count in rows]
    return ExpenseTypeList(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total else 0,
    )


def create_expense_type(db: Session, payload: ExpenseTypeCreate) -> ExpenseTypeRead:
    model = ExpenseType(
        name=payload.name,
        name_key=name_key(payload.name),
        description=payload.description,
        category=payload.category.value if payload.category else None,
        icon=payload.icon or DEFAULT_TYPE_ICON,
        color=payload.color or DEFAULT_TYPE_COLOR,
    )
    db.add(model)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError("An expense type with this name already exists.") from exc
    db.refresh(model)
    return _to_read(model, 0, 0)


def update_expense_type(db: Session, type_id: int, payload: ExpenseTypeUpdate) -> ExpenseTypeRead:
    model = get_expense_type(db, type_id)
    fields = payload.model_fields_set

    if "name" in fields:
        if payload.name is None:
            raise ConflictError("Expense type name cannot be empty.")
        model.name = payload.name
        model.name_key = name_key(payload.name)
    if "description" in fields:
        model.description = payload.description
    if "category" in fields:
        model.category = payload.category.value if payload.category else None
    if "icon" in fields and payload.icon is not None:
        model.icon = payload.icon
    if "color" in fields and payload.color is not None:
        model.color = payload.color

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError("An expense type with this name already exists.") from exc
    db.refresh(model)

    total = int(
        db.scalar(
            select(func.coalesce(func.sum(Expense.amount_paise), 0)).where(
                Expense.expense_type_id == model.id
            )
        )
        or 0
    )
    count = int(
        db.scalar(
            select(func.count(Expense.id)).where(Expense.expense_type_id == model.id)
        )
        or 0
    )
    return _to_read(model, total, count)


def set_archived(db: Session, type_id: int, archived: bool) -> ExpenseTypeRead:
    model = get_expense_type(db, type_id)
    model.is_archived = archived
    db.commit()
    db.refresh(model)
    total = int(
        db.scalar(
            select(func.coalesce(func.sum(Expense.amount_paise), 0)).where(
                Expense.expense_type_id == model.id
            )
        )
        or 0
    )
    count = int(
        db.scalar(
            select(func.count(Expense.id)).where(Expense.expense_type_id == model.id)
        )
        or 0
    )
    return _to_read(model, total, count)


def delete_expense_type(db: Session, type_id: int) -> None:
    model = get_expense_type(db, type_id)
    count = int(
        db.scalar(
            select(func.count(Expense.id)).where(Expense.expense_type_id == model.id)
        )
        or 0
    )
    if count > 0:
        raise ConflictError(
            "This expense type has transactions and cannot be deleted. Archive it instead."
        )
    db.delete(model)
    db.commit()


def expense_type_summary(
    db: Session, type_id: int, start: date, end: date
) -> ExpenseTypePeriodSummary:
    model = get_expense_type(db, type_id)
    expenses = list(
        db.scalars(
            select(Expense)
            .where(
                Expense.expense_type_id == type_id,
                Expense.expense_date >= start,
                Expense.expense_date <= end,
            )
            .order_by(Expense.expense_date.asc(), Expense.id.asc())
        ).all()
    )
    total = sum(item.amount_paise for item in expenses)
    count = len(expenses)
    highest = max(expenses, key=lambda item: (item.amount_paise, item.expense_date, item.id), default=None)
    lowest = min(expenses, key=lambda item: (item.amount_paise, item.expense_date, item.id), default=None)

    previous_start, previous_end = previous_period(start, end)
    previous_total = int(
        db.scalar(
            select(func.coalesce(func.sum(Expense.amount_paise), 0)).where(
                Expense.expense_type_id == type_id,
                Expense.expense_date >= previous_start,
                Expense.expense_date <= previous_end,
            )
        )
        or 0
    )
    change = total - previous_total
    if previous_total == 0 and total == 0:
        direction = "none"
    elif previous_total == 0:
        direction = "new"
    elif change > 0:
        direction = "up"
    elif change < 0:
        direction = "down"
    else:
        direction = "flat"

    totals_by_day: dict[date, tuple[int, int]] = {}
    for item in expenses:
        day_total, day_count = totals_by_day.get(item.expense_date, (0, 0))
        totals_by_day[item.expense_date] = (day_total + item.amount_paise, day_count + 1)

    days = (end - start).days + 1
    daily_trend = []
    for offset in range(days):
        day = start + timedelta(days=offset)
        day_total, day_count = totals_by_day.get(day, (0, 0))
        daily_trend.append(
            TypeDailyPoint(date=day, total_paise=day_total, transaction_count=day_count)
        )

    return ExpenseTypePeriodSummary(
        expense_type=ExpenseTypeRef.model_validate(model),
        start_date=start,
        end_date=end,
        total_paise=total,
        transaction_count=count,
        average_paise=divide_round(total, count),
        highest_expense=(
            ExpenseBrief(
                id=highest.id,
                amount_paise=highest.amount_paise,
                expense_date=highest.expense_date,
                note=highest.note,
            )
            if highest
            else None
        ),
        lowest_expense=(
            ExpenseBrief(
                id=lowest.id,
                amount_paise=lowest.amount_paise,
                expense_date=lowest.expense_date,
                note=lowest.note,
            )
            if lowest
            else None
        ),
        previous_start_date=previous_start,
        previous_end_date=previous_end,
        previous_total_paise=previous_total,
        change_paise=change,
        change_percent=change_percent(total, previous_total),
        direction=direction,
        daily_trend=daily_trend,
    )
