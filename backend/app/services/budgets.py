"""Budget service functions for managing monthly and category budgets."""

from datetime import date
from typing import Optional

from app.core.config import settings
from app.db.session import get_db
from app.models.budget import Budget, CategoryBudget
from app.models.expense import Expense
from app.schemas.budget import (
    BudgetCreate,
    BudgetUpdate,
    CategoryBudgetCreate,
    CategoryBudgetUpdate,
    BudgetRead,
    CategoryBudgetRead,
)
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session


def create_monthly_budget(db: Session, payload: BudgetCreate) -> BudgetRead:
    """Create or update the overall monthly budget.
    
    If a budget already exists for the same period, it replaces it.
    """
    from sqlalchemy import select, delete
    
    # Delete any existing budget for this period
    db.execute(delete(Budget).where(Budget.budget_period == payload.budget_period))
    db.commit()
    
    budget = Budget(
        budget_period=payload.budget_period,
        amount_paise=payload.amount_paise,
    )
    db.add(budget)
    db.commit()
    db.refresh(budget)
    
    return BudgetRead.model_validate(budget)


def get_monthly_budget(db: Session, month: date) -> Optional[BudgetRead]:
    """Retrieve the monthly budget for a given month.
    
    The `month` date is normalized to the first day of the month.
    """
    from sqlalchemy import func
    
    target = date(month.year, month.month, 1)
    result = db.scalar(select(Budget).where(Budget.budget_period == target))
    if result is None:
        return None
    return BudgetRead.model_validate(result)


def create_category_budget(db: Session, payload: CategoryBudgetCreate) -> CategoryBudgetRead:
    """Create or update a category budget.
    
    If a category budget already exists for the same period and category, it replaces it.
    """
    from sqlalchemy import select, delete
    
    # Delete any existing category budget for this period and category
    db.execute(
        delete(CategoryBudget).where(
            CategoryBudget.budget_period == payload.budget_period,
            CategoryBudget.category == payload.category,
        )
    )
    db.commit()
    
    category_budget = CategoryBudget(
        budget_period=payload.budget_period,
        category=payload.category,
        amount_paise=payload.amount_paise,
    )
    db.add(category_budget)
    db.commit()
    db.refresh(category_budget)
    
    return CategoryBudgetRead.model_validate(category_budget)


def get_category_budget(
    db: Session, category: str, month: date
) -> Optional[CategoryBudgetRead]:
    """Retrieve a category budget for a given month and category."""
    from sqlalchemy import func
    
    target = date(month.year, month.month, 1)
    result = db.scalar(
        select(CategoryBudget).where(
            CategoryBudget.budget_period == target,
            CategoryBudget.category == category,
        )
    )
    if result is None:
        return None
    return CategoryBudgetRead.model_validate(result)


def delete_category_budget(db: Session, category: str, month: date) -> bool:
    """Delete a category budget."""
    from sqlalchemy import delete
    
    target = date(month.year, month.month, 1)
    result = db.execute(
        delete(CategoryBudget).where(
            CategoryBudget.budget_period == target,
            CategoryBudget.category == category,
        )
    )
    db.commit()
    return result.rowcount > 0


def list_category_budgets(db: Session, month: date) -> list[CategoryBudgetRead]:
    """List all category budgets for a given month."""
    from sqlalchemy import func
    
    target = date(month.year, month.month, 1)
    results = db.scalars(
        select(CategoryBudget).where(CategoryBudget.budget_period == target)
    ).all()
    return [CategoryBudgetRead.model_validate(r) for r in results]


def calculate_monthly_spending(db: Session, month: date) -> dict:
    """Calculate spending for the monthly budget.
    
    Returns: {
        'total_paise': int,  # sum of eligible expenses
        'transaction_count': int,
    }
    
    Uses the same date boundaries as the existing dashboard/convention.
    """
    from sqlalchemy import func
    
    target = date(month.year, month.month, 1)
    # Use inclusive start, exclusive end of month (last day + 1)
    next_month = date(month.year, month.month % 12 + 1, 1)
    
    result = db.execute(
        select(
            func.coalesce(func.sum(Expense.amount_paise), 0).label('total'),
            func.count(Expense.id).label('count'),
        ).where(
            Expense.expense_date >= target,
            Expense.expense_date < next_month,
        )
    ).first()
    
    return {
        'total_paise': int(result.total or 0),
        'transaction_count': int(result.count or 0),
    }


def calculate_category_spending(
    db: Session, category: str, month: date
) -> dict:
    """Calculate spending for a category budget.
    
    Returns: {
        'total_paise': int,  # sum of eligible expenses in this category
        'transaction_count': int,
    }
    
    Uses the same date boundaries as calculate_monthly_spending.
    """
    from sqlalchemy import func
    
    target = date(month.year, month.month, 1)
    next_month = date(month.year, month.month % 12 + 1, 1)
    
    result = db.execute(
        select(
            func.coalesce(func.sum(Expense.amount_paise), 0).label('total'),
            func.count(Expense.id).label('count'),
        ).join(
            Expense.expense_type
        ).where(
            Expense.expense_type.has(category=category),
            Expense.expense_date >= target,
            Expense.expense_date < next_month,
        )
    ).first()
    
    return {
        'total_paise': int(result.total or 0),
        'transaction_count': int(result.count or 0),
    }