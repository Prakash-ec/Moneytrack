"""Budget service functions for managing monthly and category budgets."""

from datetime import date
from typing import Optional

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models.budget import Budget, CategoryBudget
from app.models.expense import Expense
from app.models.expense_type import ExpenseType
from app.schemas.budget import (
    BudgetCreate,
    BudgetRead,
    CategoryBudgetCreate,
    CategoryBudgetRead,
)


def get_month_boundaries(month: date | str) -> tuple[date, date]:
    """Returns normalized (start_of_month, start_of_next_month) handles December year rollover correctly."""
    if isinstance(month, str):
        month = date.fromisoformat(month if len(month) == 10 else f"{month}-01")
    start = date(month.year, month.month, 1)
    if month.month == 12:
        end = date(month.year + 1, 1, 1)
    else:
        end = date(month.year, month.month + 1, 1)
    return start, end


def create_monthly_budget(
    db: Session, payload: BudgetCreate, user_id: int | None = None
) -> BudgetRead:
    """Create or update the overall monthly budget atomically in a single transaction."""
    period = date(payload.budget_period.year, payload.budget_period.month, 1)

    stmt = select(Budget).where(Budget.budget_period == period)
    if user_id is not None:
        stmt = stmt.where(Budget.user_id == user_id)
    budget = db.scalar(stmt)

    if budget is not None:
        budget.amount_paise = payload.amount_paise
    else:
        budget = Budget(
            user_id=user_id,
            budget_period=period,
            amount_paise=payload.amount_paise,
        )
        db.add(budget)

    db.commit()
    db.refresh(budget)
    return BudgetRead.model_validate(budget)


def get_monthly_budget(
    db: Session, month: date, user_id: int | None = None
) -> Optional[BudgetRead]:
    """Retrieve the monthly budget for a given month."""
    target = date(month.year, month.month, 1)
    stmt = select(Budget).where(Budget.budget_period == target)
    if user_id is not None:
        stmt = stmt.where(Budget.user_id == user_id)
    result = db.scalar(stmt)
    if result is None:
        return None
    return BudgetRead.model_validate(result)


def create_category_budget(
    db: Session, payload: CategoryBudgetCreate, user_id: int | None = None
) -> CategoryBudgetRead:
    """Create or update a category budget atomically in a single transaction."""
    period = date(payload.budget_period.year, payload.budget_period.month, 1)

    stmt = select(CategoryBudget).where(
        CategoryBudget.budget_period == period,
        CategoryBudget.category == payload.category,
    )
    if user_id is not None:
        stmt = stmt.where(CategoryBudget.user_id == user_id)
    cat_budget = db.scalar(stmt)

    if cat_budget is not None:
        cat_budget.amount_paise = payload.amount_paise
    else:
        cat_budget = CategoryBudget(
            user_id=user_id,
            budget_period=period,
            category=payload.category,
            amount_paise=payload.amount_paise,
        )
        db.add(cat_budget)

    db.commit()
    db.refresh(cat_budget)
    return CategoryBudgetRead.model_validate(cat_budget)


def get_category_budget(
    db: Session, category: str, month: date, user_id: int | None = None
) -> Optional[CategoryBudgetRead]:
    """Retrieve the category budget for a given category and month."""
    target = date(month.year, month.month, 1)
    stmt = select(CategoryBudget).where(
        CategoryBudget.budget_period == target,
        CategoryBudget.category == category,
    )
    if user_id is not None:
        stmt = stmt.where(CategoryBudget.user_id == user_id)
    result = db.scalar(stmt)
    if result is None:
        return None
    return CategoryBudgetRead.model_validate(result)


def list_category_budgets(
    db: Session, month: date, user_id: int | None = None
) -> list[CategoryBudgetRead]:
    """List all category budgets for a given month."""
    target = date(month.year, month.month, 1)
    stmt = (
        select(CategoryBudget)
        .where(CategoryBudget.budget_period == target)
        .order_by(CategoryBudget.category.asc())
    )
    if user_id is not None:
        stmt = stmt.where(CategoryBudget.user_id == user_id)
    results = db.scalars(stmt).all()
    return [CategoryBudgetRead.model_validate(r) for r in results]


def delete_category_budget(
    db: Session, category: str, month: date, user_id: int | None = None
) -> bool:
    """Delete a category budget."""
    target = date(month.year, month.month, 1)
    stmt = select(CategoryBudget).where(
        CategoryBudget.budget_period == target,
        CategoryBudget.category == category,
    )
    if user_id is not None:
        stmt = stmt.where(CategoryBudget.user_id == user_id)
    cat_budget = db.scalar(stmt)
    if not cat_budget:
        return False
    db.delete(cat_budget)
    db.commit()
    return True


def calculate_monthly_spending(
    db: Session, month: date, user_id: int | None = None
) -> dict:
    """Calculate spending for the monthly budget with proper year rollover."""
    target, next_month = get_month_boundaries(month)

    stmt = select(
        func.coalesce(func.sum(Expense.amount_paise), 0).label("total"),
        func.count(Expense.id).label("count"),
    ).where(
        Expense.expense_date >= target,
        Expense.expense_date < next_month,
    )
    if user_id is not None:
        stmt = stmt.where(Expense.user_id == user_id)

    result = db.execute(stmt).first()

    return {
        "total_paise": int(result.total or 0),
        "transaction_count": int(result.count or 0),
    }


def calculate_category_spending(
    db: Session, category: str, month: date, user_id: int | None = None
) -> dict:
    """Calculate spending for a category budget with proper year rollover."""
    target, next_month = get_month_boundaries(month)

    stmt = (
        select(
            func.coalesce(func.sum(Expense.amount_paise), 0).label("total"),
            func.count(Expense.id).label("count"),
        )
        .join(Expense.expense_type)
        .where(
            ExpenseType.category == category,
            Expense.expense_date >= target,
            Expense.expense_date < next_month,
        )
    )
    if user_id is not None:
        stmt = stmt.where(Expense.user_id == user_id)

    result = db.execute(stmt).first()

    return {
        "total_paise": int(result.total or 0),
        "transaction_count": int(result.count or 0),
    }
