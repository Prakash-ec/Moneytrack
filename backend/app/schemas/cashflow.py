from datetime import date, datetime

from pydantic import BaseModel

from app.schemas.bank_account import BankAccountRead
from app.schemas.expense import ExpenseRead
from app.schemas.income import IncomeRead


class CashFlowSummary(BaseModel):
    start_date: date
    end_date: date
    total_income_paise: int
    total_expense_paise: int
    net_cashflow_paise: int  # income - expense
    savings_rate_percent: float  # (net_cashflow / income) * 100 or 0
    total_bank_balance_paise: int
    total_reported_balance_paise: int | None = None
    account_count: int
    reconciliation_discrepancy_count: int
    recent_incomes: list[IncomeRead]
    recent_expenses: list[ExpenseRead]
    accounts: list[BankAccountRead]


class BalanceSnapshotRead(BaseModel):
    id: int
    account_id: int
    snapshot_date: date
    calculated_balance_paise: int
    reported_balance_paise: int | None = None
    source: str
    note: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class AccountReconciliationRead(BaseModel):
    account_id: int
    bank_name: str
    account_name: str
    calculated_balance_paise: int
    reported_balance_paise: int | None = None
    discrepancy_paise: int
    status: str
    last_reported_at: datetime | None = None
