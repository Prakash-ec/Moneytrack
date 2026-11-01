from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

AccountType = Literal["savings", "current", "salary", "credit_card", "other"]
ReconciliationStatus = Literal["matched", "discrepancy", "unreconciled"]


class BankAccountBase(BaseModel):
    bank_name: str = Field(min_length=1, max_length=100)
    account_name: str = Field(min_length=1, max_length=100)
    account_type: AccountType = "savings"
    account_number_mask: str = Field(min_length=2, max_length=20)  # e.g. "XX8824"
    currency: str = Field(default="INR", max_length=3)
    opening_balance_paise: int = Field(default=0)
    opening_balance_date: date
    color: str = Field(default="#1D4ED8", max_length=7)
    icon: str = Field(default="building", max_length=40)


class BankAccountCreate(BankAccountBase):
    pass


class BankAccountUpdate(BaseModel):
    bank_name: str | None = Field(default=None, max_length=100)
    account_name: str | None = Field(default=None, max_length=100)
    account_type: AccountType | None = None
    account_number_mask: str | None = Field(default=None, max_length=20)
    opening_balance_paise: int | None = None
    opening_balance_date: date | None = None
    color: str | None = Field(default=None, max_length=7)
    icon: str | None = Field(default=None, max_length=40)
    is_archived: bool | None = None


class BankAccountRead(BankAccountBase):
    id: int
    current_balance_paise: int
    last_reported_balance_paise: int | None = None
    last_reported_at: datetime | None = None
    reconciliation_status: ReconciliationStatus
    is_archived: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BankAccountList(BaseModel):
    items: list[BankAccountRead]
    total_balance_paise: int
    total_reported_balance_paise: int | None = None
    account_count: int
    reconciliation_needed_count: int
