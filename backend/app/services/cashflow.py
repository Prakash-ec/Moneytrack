from datetime import date
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models.bank_account import BankAccount
from app.models.expense import Expense
from app.models.income import Income
from app.schemas.bank_account import BankAccountRead
from app.schemas.cashflow import CashFlowSummary
from app.schemas.expense import ExpenseRead
from app.schemas.income import IncomeRead
from app.services.bank_accounts import recalculate_account_balance
from app.services.periods import resolve_period


def get_cashflow_summary(
    db: Session, start_date: date | None = None, end_date: date | None = None
) -> CashFlowSummary:
    start, end = resolve_period(start_date, end_date)

    # Total income in range
    total_income = (
        db.scalar(
            select(func.coalesce(func.sum(Income.amount_paise), 0)).where(
                Income.income_date >= start, Income.income_date <= end
            )
        )
        or 0
    )

    # Total expense in range
    total_expense = (
        db.scalar(
            select(func.coalesce(func.sum(Expense.amount_paise), 0)).where(
                Expense.expense_date >= start, Expense.expense_date <= end
            )
        )
        or 0
    )

    net_cashflow = total_income - total_expense
    savings_rate = 0.0
    if total_income > 0:
        savings_rate = round((net_cashflow / total_income) * 100, 2)

    # Bank accounts & total balance
    accounts = list(
        db.scalars(
            select(BankAccount)
            .where(BankAccount.is_archived.is_(False))
            .order_by(BankAccount.bank_name.asc())
        ).all()
    )
    for acc in accounts:
        recalculate_account_balance(db, acc.id)

    total_bank_balance = sum(acc.current_balance_paise for acc in accounts)
    total_reported = sum(
        acc.last_reported_balance_paise
        for acc in accounts
        if acc.last_reported_balance_paise is not None
    )
    discrepancy_count = sum(
        1 for acc in accounts if acc.reconciliation_status == "discrepancy"
    )

    # Recent transactions
    recent_incomes = list(
        db.scalars(
            select(Income)
            .options(joinedload(Income.income_type), joinedload(Income.bank_account))
            .where(Income.income_date >= start, Income.income_date <= end)
            .order_by(Income.income_date.desc(), Income.id.desc())
            .limit(5)
        ).unique().all()
    )

    recent_expenses = list(
        db.scalars(
            select(Expense)
            .options(joinedload(Expense.expense_type), joinedload(Expense.bank_account))
            .where(Expense.expense_date >= start, Expense.expense_date <= end)
            .order_by(Expense.expense_date.desc(), Expense.id.desc())
            .limit(5)
        ).unique().all()
    )

    return CashFlowSummary(
        start_date=start,
        end_date=end,
        total_income_paise=total_income,
        total_expense_paise=total_expense,
        net_cashflow_paise=net_cashflow,
        savings_rate_percent=savings_rate,
        total_bank_balance_paise=total_bank_balance,
        total_reported_balance_paise=total_reported if total_reported > 0 else None,
        account_count=len(accounts),
        reconciliation_discrepancy_count=discrepancy_count,
        recent_incomes=[IncomeRead.model_validate(inc) for inc in recent_incomes],
        recent_expenses=[ExpenseRead.model_validate(exp) for exp in recent_expenses],
        accounts=[BankAccountRead.model_validate(acc) for acc in accounts],
    )
