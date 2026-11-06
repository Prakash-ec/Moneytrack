from collections import defaultdict
from datetime import date, timedelta
import math
import statistics
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.money import change_percent, divide_round, percent
from app.models.expense import Expense
from app.models.expense_type import ExpenseType
from app.schemas.analytics import (
    ByTypeRead,
    ComparisonRead,
    LargestDay,
    MostExpensiveType,
    PeriodComparison,
    RecurringType,
    SummaryRead,
    TrendPoint,
    TrendsRead,
    TypeBreakdown,
    TypeComparison,
)
from app.schemas.common import Direction
from app.schemas.expense import ExpenseRead
from app.services.periods import previous_period

Granularity = Literal["daily", "weekly", "monthly"]


def _load_expenses(
    db: Session, start: date, end: date, user_id: int | None = None
) -> list[Expense]:
    stmt = (
        select(Expense)
        .options(joinedload(Expense.expense_type))
        .where(Expense.expense_date >= start, Expense.expense_date <= end)
    )
    if user_id is not None:
        stmt = stmt.where(Expense.user_id == user_id)
    return list(
        db.scalars(stmt.order_by(Expense.expense_date.asc(), Expense.id.asc()))
        .unique()
        .all()
    )


def _direction(current: int, previous: int) -> Direction:
    if previous == 0 and current == 0:
        return "none"
    if previous == 0:
        return "new"
    if current > previous:
        return "up"
    if current < previous:
        return "down"
    return "flat"


def _aggregate_by_type(expenses: list[Expense]) -> dict[int, dict]:
    aggregates: dict[int, dict] = {}
    for expense in expenses:
        entry = aggregates.setdefault(
            expense.expense_type_id,
            {
                "type": expense.expense_type,
                "total": 0,
                "count": 0,
            },
        )
        entry["total"] += expense.amount_paise
        entry["count"] += 1
    return aggregates


def _breakdown(aggregates: dict[int, dict], total: int) -> list[TypeBreakdown]:
    items = [
        TypeBreakdown(
            expense_type_id=entry["type"].id,
            name=entry["type"].name,
            color=entry["type"].color,
            icon=entry["type"].icon,
            is_archived=entry["type"].is_archived,
            total_paise=entry["total"],
            transaction_count=entry["count"],
            average_paise=divide_round(entry["total"], entry["count"]),
            share_percent=percent(entry["total"], total),
        )
        for entry in aggregates.values()
    ]
    items.sort(key=lambda item: (-item.total_paise, item.name.casefold()))
    return items


def summary(
    db: Session,
    start: date,
    end: date,
    expenses: list[Expense] | None = None,
    user_id: int | None = None,
) -> SummaryRead:
    if expenses is None:
        expenses = _load_expenses(db, start, end, user_id=user_id)
    total = sum(item.amount_paise for item in expenses)
    count = len(expenses)
    highest = max(
        expenses, key=lambda item: (item.amount_paise, item.expense_date, item.id), default=None
    )

    aggregates = _aggregate_by_type(expenses)
    top_entry = None
    if aggregates:
        top_entry = max(aggregates.values(), key=lambda entry: entry["total"])
    most_expensive_type = (
        MostExpensiveType(
            expense_type_id=top_entry["type"].id,
            name=top_entry["type"].name,
            color=top_entry["type"].color,
            icon=top_entry["type"].icon,
            total_paise=top_entry["total"],
            transaction_count=top_entry["count"],
            share_percent=percent(top_entry["total"], total),
        )
        if top_entry
        else None
    )

    previous_start, previous_end = previous_period(start, end)
    previous_expenses = _load_expenses(db, previous_start, previous_end, user_id=user_id)
    previous_total = sum(item.amount_paise for item in previous_expenses)

    return SummaryRead(
        start_date=start,
        end_date=end,
        total_paise=total,
        transaction_count=count,
        average_paise=divide_round(total, count),
        highest_expense=ExpenseRead.model_validate(highest) if highest else None,
        most_expensive_type=most_expensive_type,
        comparison=PeriodComparison(
            previous_start_date=previous_start,
            previous_end_date=previous_end,
            previous_total_paise=previous_total,
            previous_transaction_count=len(previous_expenses),
            change_paise=total - previous_total,
            change_percent=change_percent(total, previous_total),
            direction=_direction(total, previous_total),
        ),
    )


def by_type(
    db: Session, start: date, end: date, user_id: int | None = None
) -> ByTypeRead:
    expenses = _load_expenses(db, start, end, user_id=user_id)
    total = sum(item.amount_paise for item in expenses)
    items = _breakdown(_aggregate_by_type(expenses), total)
    return ByTypeRead(start_date=start, end_date=end, total_paise=total, items=items)


def _bucket_start(day: date, granularity: Granularity) -> date:
    if granularity == "weekly":
        return day - timedelta(days=day.weekday())
    if granularity == "monthly":
        return day.replace(day=1)
    return day


def _next_bucket(day: date, granularity: Granularity) -> date:
    if granularity == "weekly":
        return day + timedelta(days=7)
    if granularity == "monthly":
        year = day.year + (1 if day.month == 12 else 0)
        month = 1 if day.month == 12 else day.month + 1
        return date(year, month, 1)
    return day + timedelta(days=1)


def _build_series(expenses: list[Expense], start: date, end: date, granularity: Granularity) -> list[TrendPoint]:
    totals: dict[date, tuple[int, int]] = defaultdict(lambda: (0, 0))
    for expense in expenses:
        bucket = _bucket_start(expense.expense_date, granularity)
        existing_total, existing_count = totals[bucket]
        totals[bucket] = (existing_total + expense.amount_paise, existing_count + 1)

    series: list[TrendPoint] = []
    cursor = _bucket_start(start, granularity)
    last = _bucket_start(end, granularity)
    while cursor <= last:
        total, count = totals.get(cursor, (0, 0))
        series.append(TrendPoint(date=cursor, total_paise=total, transaction_count=count))
        cursor = _next_bucket(cursor, granularity)
    return series


def _recurring_types(expenses: list[Expense], start: date, end: date) -> list[RecurringType]:
    grouped: dict[int, list[Expense]] = defaultdict(list)
    for expense in expenses:
        grouped[expense.expense_type_id].append(expense)

    range_days = (end - start).days + 1
    results: list[RecurringType] = []
    for items in grouped.values():
        count = len(items)
        if count < 3:
            continue
        expense_type = items[0].expense_type
        dates = sorted({item.expense_date for item in items})
        months = {(item.expense_date.year, item.expense_date.month) for item in items}
        gaps = [(later - earlier).days for earlier, later in zip(dates, dates[1:])]
        average_gap = round(sum(gaps) / len(gaps), 1) if gaps else None
        variation = None
        if len(gaps) >= 2 and average_gap and average_gap > 0:
            variation = statistics.pstdev(gaps) / average_gap

        pattern = None
        message = ""
        if len(gaps) >= 2 and average_gap and 3 <= average_gap <= 45 and variation is not None and variation <= 0.45:
            pattern = "regular"
            message = (
                f"{expense_type.name} appears {count} times, roughly every "
                f"{round(average_gap)} days in this period."
            )
        elif len(months) >= 3 or (range_days >= 21 and count >= 4 and len(dates) >= 3):
            pattern = "frequent"
            month_text = "month" if len(months) == 1 else "months"
            message = (
                f"{expense_type.name} was used {count} times across "
                f"{len(months)} {month_text} in this period."
            )

        if pattern is None:
            continue
        results.append(
            RecurringType(
                expense_type_id=expense_type.id,
                name=expense_type.name,
                color=expense_type.color,
                icon=expense_type.icon,
                transaction_count=count,
                total_paise=sum(item.amount_paise for item in items),
                average_gap_days=average_gap,
                distinct_months=len(months),
                pattern=pattern,
                message=message,
            )
        )

    results.sort(key=lambda item: (-item.transaction_count, -item.total_paise))
    return results[:6]


def _build_insights(
    summary_data: SummaryRead,
    largest_days: list[LargestDay],
    recurring: list[RecurringType],
) -> list[str]:
    insights: list[str] = []
    if summary_data.transaction_count == 0:
        return []

    top = summary_data.most_expensive_type
    if top:
        insights.append(
            f"{top.name} was the largest expense category, accounting for {top.share_percent}% of spending."
        )

    comparison = summary_data.comparison
    if comparison.direction == "up" and comparison.change_percent:
        insights.append(
            f"Spending is up by {comparison.change_percent}% compared to the previous period."
        )
    elif comparison.direction == "down" and comparison.change_percent:
        insights.append(
            f"Spending is down by {abs(comparison.change_percent)}% compared to the previous period."
        )

    if largest_days:
        busiest = largest_days[0]
        insights.append(
            f"Peak spending day was {busiest.date.isoformat()} with {busiest.transaction_count} transaction(s)."
        )

    for item in recurring[:2]:
        insights.append(item.message)

    return insights


def trends(
    db: Session,
    start: date,
    end: date,
    granularity: Granularity = "daily",
    user_id: int | None = None,
) -> TrendsRead:
    expenses = _load_expenses(db, start, end, user_id=user_id)
    series = _build_series(expenses, start, end, granularity)
    recurring = _recurring_types(expenses, start, end)

    by_day: dict[date, tuple[int, int]] = defaultdict(lambda: (0, 0))
    for expense in expenses:
        total, count = by_day[expense.expense_date]
        by_day[expense.expense_date] = (total + expense.amount_paise, count + 1)

    sorted_days = sorted(
        [
            LargestDay(date=day, total_paise=total, transaction_count=count)
            for day, (total, count) in by_day.items()
        ],
        key=lambda item: (-item.total_paise, item.date),
    )
    largest_days = sorted_days[:5]
    total = sum(item.amount_paise for item in expenses)
    rankings = _breakdown(_aggregate_by_type(expenses), total)
    summary_data = summary(db, start, end, expenses=expenses, user_id=user_id)

    return TrendsRead(
        start_date=start,
        end_date=end,
        granularity=granularity,
        series=series,
        largest_days=largest_days,
        rankings=rankings,
        recurring=recurring,
        insights=_build_insights(summary_data, largest_days, recurring),
    )


def comparison(
    db: Session, start: date, end: date, user_id: int | None = None
) -> ComparisonRead:
    current_expenses = _load_expenses(db, start, end, user_id=user_id)
    current_total = sum(item.amount_paise for item in current_expenses)
    current_aggregates = _aggregate_by_type(current_expenses)

    prev_start, prev_end = previous_period(start, end)
    prev_expenses = _load_expenses(db, prev_start, prev_end, user_id=user_id)
    prev_total = sum(item.amount_paise for item in prev_expenses)
    prev_aggregates = _aggregate_by_type(prev_expenses)

    all_type_ids = set(current_aggregates.keys()) | set(prev_aggregates.keys())
    type_items: list[TypeComparison] = []

    for type_id in all_type_ids:
        curr = current_aggregates.get(type_id)
        prev = prev_aggregates.get(type_id)

        expense_type = (curr or prev)["type"]
        c_total = curr["total"] if curr else 0
        c_count = curr["count"] if curr else 0
        p_total = prev["total"] if prev else 0
        p_count = prev["count"] if prev else 0

        type_items.append(
            TypeComparison(
                expense_type_id=expense_type.id,
                name=expense_type.name,
                color=expense_type.color,
                icon=expense_type.icon,
                current_total_paise=c_total,
                current_transaction_count=c_count,
                previous_total_paise=p_total,
                previous_transaction_count=p_count,
                change_paise=c_total - p_total,
                change_percent=change_percent(c_total, p_total),
                direction=_direction(c_total, p_total),
            )
        )

    type_items.sort(key=lambda item: (-item.current_total_paise, item.name.casefold()))

    return ComparisonRead(
        start_date=start,
        end_date=end,
        previous_start_date=prev_start,
        previous_end_date=prev_end,
        current_total_paise=current_total,
        previous_total_paise=prev_total,
        current_transaction_count=len(current_expenses),
        previous_transaction_count=len(prev_expenses),
        change_paise=current_total - prev_total,
        change_percent=change_percent(current_total, prev_total),
        direction=_direction(current_total, prev_total),
        by_type=type_items,
    )
