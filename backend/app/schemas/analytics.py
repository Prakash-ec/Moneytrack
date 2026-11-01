from datetime import date
from typing import Literal

from pydantic import BaseModel

from app.schemas.common import Direction
from app.schemas.expense import ExpenseRead


class PeriodComparison(BaseModel):
    previous_start_date: date
    previous_end_date: date
    previous_total_paise: int
    previous_transaction_count: int
    change_paise: int
    change_percent: float | None
    direction: Direction


class MostExpensiveType(BaseModel):
    expense_type_id: int
    name: str
    color: str
    icon: str
    total_paise: int
    transaction_count: int
    share_percent: float


class SummaryRead(BaseModel):
    start_date: date
    end_date: date
    total_paise: int
    transaction_count: int
    average_paise: int
    highest_expense: ExpenseRead | None
    most_expensive_type: MostExpensiveType | None
    comparison: PeriodComparison


class TypeBreakdown(BaseModel):
    expense_type_id: int
    name: str
    color: str
    icon: str
    is_archived: bool
    total_paise: int
    transaction_count: int
    average_paise: int
    share_percent: float


class ByTypeRead(BaseModel):
    start_date: date
    end_date: date
    total_paise: int
    items: list[TypeBreakdown]


class TrendPoint(BaseModel):
    date: date
    total_paise: int
    transaction_count: int


class LargestDay(BaseModel):
    date: date
    total_paise: int
    transaction_count: int


class RecurringType(BaseModel):
    expense_type_id: int
    name: str
    color: str
    icon: str
    transaction_count: int
    total_paise: int
    average_gap_days: float | None
    distinct_months: int
    pattern: Literal["regular", "frequent"]
    message: str


class TrendsRead(BaseModel):
    start_date: date
    end_date: date
    granularity: Literal["daily", "weekly", "monthly"]
    series: list[TrendPoint]
    largest_days: list[LargestDay]
    rankings: list[TypeBreakdown]
    recurring: list[RecurringType]
    insights: list[str]


class TypeComparison(BaseModel):
    expense_type_id: int
    name: str
    color: str
    icon: str
    current_total_paise: int
    previous_total_paise: int
    current_transaction_count: int
    previous_transaction_count: int
    change_paise: int
    change_percent: float | None
    direction: Direction


class ComparisonRead(BaseModel):
    start_date: date
    end_date: date
    previous_start_date: date
    previous_end_date: date
    current_total_paise: int
    previous_total_paise: int
    current_transaction_count: int
    previous_transaction_count: int
    change_paise: int
    change_percent: float | None
    direction: Direction
    by_type: list[TypeComparison]
