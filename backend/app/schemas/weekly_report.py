from datetime import date
from typing import Optional, List
from pydantic import BaseModel


class WeeklyCategoryBreakdown(BaseModel):
    category_id: int
    category_name: str
    color: str
    icon: str
    total_paise: int
    share_percent: float
    transaction_count: int


class WeeklyTopExpense(BaseModel):
    id: int
    expense_date: str | date
    amount_paise: int
    merchant: Optional[str] = None
    category_name: str
    color: str


class WeeklyAccountSpend(BaseModel):
    account_id: int
    account_name: str
    bank_name: str
    account_number_mask: Optional[str] = None
    total_spent_paise: int
    transaction_count: int


class WeeklyReportComparison(BaseModel):
    previous_start_date: str
    previous_end_date: str
    previous_expense_paise: int
    previous_income_paise: int
    expense_change_paise: int
    expense_change_percent: Optional[float] = None
    direction: str  # up, down, flat


class WeeklyReportData(BaseModel):
    start_date: str
    end_date: str
    period_label: str
    total_expense_paise: int
    total_income_paise: int
    net_cashflow_paise: int
    savings_rate_percent: float
    transaction_count: int
    average_daily_spend_paise: int
    comparison: WeeklyReportComparison
    top_categories: List[WeeklyCategoryBreakdown]
    largest_expenses: List[WeeklyTopExpense]
    account_spending: List[WeeklyAccountSpend]
    account_breakdown: Optional[List[WeeklyAccountSpend]] = None
    unreviewed_sms_count: int
    generated_at: str
