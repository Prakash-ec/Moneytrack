from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.schemas.budget import (
    BudgetCreate,
    BudgetUpdate,
    CategoryBudgetCreate,
    CategoryBudgetUpdate,
    BudgetRead,
    CategoryBudgetRead,
)
from app.services.budgets import (
    calculate_category_spending,
    calculate_monthly_spending,
    create_category_budget,
    create_monthly_budget,
    delete_category_budget,
    get_category_budget,
    get_monthly_budget,
    list_category_budgets,
)

router = APIRouter(prefix="/budgets", tags=["Budgets"])


@router.get("", response_model=BudgetRead, summary="Get monthly overall budget")
def get_monthly_budget_endpoint(
    month: date = Query(default=None, description="Month to retrieve budget for (defaults to current month)"),
    db: Session = Depends(get_db),
) -> BudgetRead:
    import datetime
    if month is None:
        today = datetime.date.today()
        month = date(today.year, today.month, 1)
    budget = get_monthly_budget(db, month)
    if budget is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No monthly budget set for this period.",
        )
    return budget


@router.post("", response_model=BudgetRead, status_code=status.HTTP_201_CREATED, summary="Create or update monthly budget")
def create_monthly_budget_endpoint(
    payload: BudgetCreate,
    db: Session = Depends(get_db),
) -> BudgetRead:
    return create_monthly_budget(db, payload)


@router.get("/category/{category}", response_model=CategoryBudgetRead, summary="Get category budget")
def get_category_budget_endpoint(
    category: str,
    month: date = Query(default=None, description="Month to retrieve budget for (defaults to current month)"),
    db: Session = Depends(get_db),
) -> CategoryBudgetRead:
    import datetime
    if month is None:
        today = datetime.date.today()
        month = date(today.year, today.month, 1)
    budget = get_category_budget(db, category, month)
    if budget is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No category budget set for '{category}' in this period.",
        )
    return budget


@router.post("/category", response_model=CategoryBudgetRead, status_code=status.HTTP_201_CREATED, summary="Create or update category budget")
def create_category_budget_endpoint(
    payload: CategoryBudgetCreate,
    db: Session = Depends(get_db),
) -> CategoryBudgetRead:
    return create_category_budget(db, payload)


@router.delete("/category/{category}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete category budget")
def delete_category_budget_endpoint(
    category: str,
    month: date = Query(default=None, description="Month to delete budget for (defaults to current month)"),
    db: Session = Depends(get_db),
) -> None:
    import datetime
    if month is None:
        today = datetime.date.today()
        month = date(today.year, today.month, 1)
    success = delete_category_budget(db, category, month)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No category budget set for '{category}' in this period.",
        )


@router.get("/category", summary="List all category budgets for a month")
def list_category_budgets_endpoint(
    month: date = Query(default=None, description="Month to list budgets for (defaults to current month)"),
    db: Session = Depends(get_db),
) -> list[CategoryBudgetRead]:
    import datetime
    if month is None:
        today = datetime.date.today()
        month = date(today.year, today.month, 1)
    return list_category_budgets(db, month)


@router.get("/summary", summary="Get budget summary for a month")
def get_budget_summary(
    month: date = Query(default=None, description="Month to get summary for (defaults to current month)"),
    db: Session = Depends(get_db),
) -> dict:
    import datetime
    if month is None:
        today = datetime.date.today()
        month = date(today.year, today.month, 1)
    budget = get_monthly_budget(db, month)
    spending = calculate_monthly_spending(db, month)
    if budget:
        remaining = budget.amount_paise - spending['total_paise']
        percentage = (spending['total_paise'] / budget.amount_paise) * 100 if budget.amount_paise > 0 else 0
    else:
        remaining = None
        percentage = None
    category_budgets = list_category_budgets(db, month)
    category_spending = {}
    for cb in category_budgets:
        cs = calculate_category_spending(db, cb.category, month)
        category_spending[cb.category] = {
            'budget_paise': cb.amount_paise,
            'spent_paise': cs['total_paise'],
            'remaining_paise': cb.amount_paise - cs['total_paise'],
            'percentage_used': (cs['total_paise'] / cb.amount_paise) * 100 if cb.amount_paise > 0 else 0,
            'transaction_count': cs['transaction_count'],
        }
    return {
        'budget': BudgetRead.model_validate(budget) if budget else None,
        'spent': spending['total_paise'],
        'remaining': remaining,
        'percentage_used': round(percentage, 1) if percentage is not None else None,
        'transaction_count': spending['transaction_count'],
        'category_breakdown': category_spending,
    }