from datetime import date, datetime
from pydantic import BaseModel, ConfigDict, Field, validator


class BudgetCreate(BaseModel):
    """Create or update a monthly overall budget."""
    budget_period: date = Field(..., description="First day of the budget month (e.g. 2026-01-01)")
    amount_paise: int = Field(..., gt=0, le=10**13, description="Monthly budget amount in paise")

    @validator('budget_period')
    def budget_period_must_be_first_of_month(cls, v):
        # Normalize to first day of month
        return date(v.year, v.month, 1)


class BudgetUpdate(BaseModel):
    """Update an existing monthly budget."""
    amount_paise: int = Field(..., gt=0, le=10**13, description="Monthly budget amount in paise")


class CategoryBudgetCreate(BaseModel):
    """Create or update a category budget."""
    category: str = Field(..., min_length=1, max_length=50, description="Expense category name")
    budget_period: date = Field(..., description="First day of the budget month")
    amount_paise: int = Field(..., gt=0, le=10**13, description="Category budget amount in paise")

    @validator('budget_period')
    def budget_period_must_be_first_of_month(cls, v):
        # Normalize to first day of month
        return date(v.year, v.month, 1)


class CategoryBudgetUpdate(BaseModel):
    """Update an existing category budget."""
    amount_paise: int = Field(..., gt=0, le=10**13, description="Category budget amount in paise")


class BudgetRead(BaseModel):
    """Read budget information."""
    id: int
    budget_period: date
    amount_paise: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CategoryBudgetRead(BaseModel):
    """Read category budget information."""
    id: int
    category: str
    budget_period: date
    amount_paise: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)