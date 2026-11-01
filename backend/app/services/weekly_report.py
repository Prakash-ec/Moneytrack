from datetime import date, datetime, timedelta, timezone
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.models.expense import Expense
from app.models.expense_type import ExpenseType
from app.models.income import Income
from app.models.bank_account import BankAccount
from app.schemas.weekly_report import (
    WeeklyReportData,
    WeeklyReportComparison,
    WeeklyCategoryBreakdown,
    WeeklyTopExpense,
    WeeklyAccountSpend,
)


def get_previous_complete_week(ref_date: Optional[date] = None) -> tuple[date, date]:
    """
    Returns the Monday-to-Sunday dates of the previous complete week.
    In Python, weekday() 0 is Monday and 6 is Sunday.
    """
    today = ref_date or date.today()
    current_weekday = today.weekday()  # Monday=0 ... Sunday=6
    # Monday of the current week is: today - timedelta(days=current_weekday)
    current_week_monday = today - timedelta(days=current_weekday)
    # Previous week Monday is 7 days prior
    prev_week_monday = current_week_monday - timedelta(days=7)
    prev_week_sunday = prev_week_monday + timedelta(days=6)
    return prev_week_monday, prev_week_sunday


def generate_weekly_report(
    db: Session,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    ref_date: Optional[date] = None,
) -> WeeklyReportData:
    if not start_date or not end_date:
        start_date, end_date = get_previous_complete_week(ref_date)

    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")

    # 1. Total Expenses for this period
    expenses = (
        db.query(Expense)
        .filter(Expense.expense_date >= start_str, Expense.expense_date <= end_str)
        .all()
    )
    total_expense_paise = sum(e.amount_paise for e in expenses)
    txn_count = len(expenses)

    # 2. Total Incomes for this period
    incomes = (
        db.query(Income)
        .filter(Income.income_date >= start_str, Income.income_date <= end_str)
        .all()
    )
    total_income_paise = sum(i.amount_paise for i in incomes)

    # 3. Cashflow & Savings Rate
    net_cashflow_paise = total_income_paise - total_expense_paise
    savings_rate = (
        round((net_cashflow_paise / total_income_paise) * 100.0, 1)
        if total_income_paise > 0
        else 0.0
    )

    days_count = (end_date - start_date).days + 1
    avg_daily_spend = round(total_expense_paise / max(1, days_count))

    # 4. Previous Week Comparison (7 days prior)
    prev_start_date = start_date - timedelta(days=7)
    prev_end_date = end_date - timedelta(days=7)
    prev_start_str = prev_start_date.strftime("%Y-%m-%d")
    prev_end_str = prev_end_date.strftime("%Y-%m-%d")

    prev_expenses = (
        db.query(Expense)
        .filter(Expense.expense_date >= prev_start_str, Expense.expense_date <= prev_end_str)
        .all()
    )
    prev_expense_paise = sum(e.amount_paise for e in prev_expenses)

    prev_incomes = (
        db.query(Income)
        .filter(Income.income_date >= prev_start_str, Income.income_date <= prev_end_str)
        .all()
    )
    prev_income_paise = sum(i.amount_paise for i in prev_incomes)

    expense_change_paise = total_expense_paise - prev_expense_paise
    change_pct = (
        round((expense_change_paise / prev_expense_paise) * 100.0, 1)
        if prev_expense_paise > 0
        else None
    )

    if expense_change_paise > 0:
        direction = "up"
    elif expense_change_paise < 0:
        direction = "down"
    else:
        direction = "flat"

    comparison = WeeklyReportComparison(
        previous_start_date=prev_start_str,
        previous_end_date=prev_end_str,
        previous_expense_paise=prev_expense_paise,
        previous_income_paise=prev_income_paise,
        expense_change_paise=expense_change_paise,
        expense_change_percent=change_pct,
        direction=direction,
    )

    # 5. Top Categories by Spend
    category_map: dict[int, dict] = {}
    for e in expenses:
        tid = e.expense_type_id
        if tid not in category_map:
            t = db.query(ExpenseType).filter(ExpenseType.id == tid).first()
            category_map[tid] = {
                "id": tid,
                "name": t.name if t else "Other",
                "color": t.color if t and t.color else "#3b82f6",
                "icon": t.icon if t and t.icon else "Receipt",
                "total_paise": 0,
                "count": 0,
            }
        category_map[tid]["total_paise"] += e.amount_paise
        category_map[tid]["count"] += 1

    sorted_categories = sorted(
        category_map.values(), key=lambda c: c["total_paise"], reverse=True
    )
    top_categories = [
        WeeklyCategoryBreakdown(
            category_id=c["id"],
            category_name=c["name"],
            color=c["color"],
            icon=c["icon"],
            total_paise=c["total_paise"],
            share_percent=(
                round((c["total_paise"] / total_expense_paise) * 100.0, 1)
                if total_expense_paise > 0
                else 0.0
            ),
            transaction_count=c["count"],
        )
        for c in sorted_categories[:5]
    ]

    # 6. Largest Expenses
    largest_sorted = sorted(expenses, key=lambda e: e.amount_paise, reverse=True)[:5]
    largest_expenses = []
    for e in largest_sorted:
        t = db.query(ExpenseType).filter(ExpenseType.id == e.expense_type_id).first()
        largest_expenses.append(
            WeeklyTopExpense(
                id=e.id,
                expense_date=str(e.expense_date),
                amount_paise=e.amount_paise,
                merchant=e.merchant,
                category_name=t.name if t else "Expense",
                color=t.color if t and t.color else "#3b82f6",
            )
        )

    # 7. Account Spending Breakdown
    account_map: dict[int, dict] = {}
    for e in expenses:
        if e.account_id:
            aid = e.account_id
            if aid not in account_map:
                acc = db.query(BankAccount).filter(BankAccount.id == aid).first()
                account_map[aid] = {
                    "account_id": aid,
                    "name": acc.name if acc else "Bank",
                    "bank_name": acc.bank_name if acc else "",
                    "mask": acc.account_number_mask if acc else None,
                    "total_paise": 0,
                    "count": 0,
                }
            account_map[aid]["total_paise"] += e.amount_paise
            account_map[aid]["count"] += 1

    account_spending = [
        WeeklyAccountSpend(
            account_id=a["account_id"],
            account_name=a["name"],
            bank_name=a["bank_name"],
            account_number_mask=a["mask"],
            total_spent_paise=a["total_paise"],
            transaction_count=a["count"],
        )
        for a in account_map.values()
    ]

    period_label = f"{start_date.strftime('%b %d')} - {end_date.strftime('%b %d, %Y')}"

    return WeeklyReportData(
        start_date=start_str,
        end_date=end_str,
        period_label=period_label,
        total_expense_paise=total_expense_paise,
        total_income_paise=total_income_paise,
        net_cashflow_paise=net_cashflow_paise,
        savings_rate_percent=savings_rate,
        transaction_count=txn_count,
        average_daily_spend_paise=avg_daily_spend,
        comparison=comparison,
        top_categories=top_categories,
        largest_expenses=largest_expenses,
        account_spending=account_spending,
        account_breakdown=account_spending,
        unreviewed_sms_count=0,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )
