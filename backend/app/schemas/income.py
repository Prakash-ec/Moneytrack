from datetime import date, datetime

from pydantic import BaseModel, Field

from app.schemas.bank_account import BankAccountRead
from app.schemas.income_type import IncomeTypeRead


class IncomeBase(BaseModel):
    income_type_id: int
    account_id: int | None = None
    amount_paise: int = Field(gt=0, description="Amount in integer paise (e.g. 10000 = ₹100.00)")
    income_date: date
    payer: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    note: str | None = Field(default=None, max_length=500)
    payment_method: str | None = Field(default=None, max_length=30)
    bank_reference: str | None = Field(default=None, max_length=100)
    reference: str | None = Field(default=None, max_length=100)
    confidence: str | None = Field(default="HIGH", max_length=20)


class IncomeCreate(IncomeBase):
    source: str = Field(default="manual", max_length=20)


class IncomeUpdate(BaseModel):
    income_type_id: int | None = None
    account_id: int | None = None
    amount_paise: int | None = Field(default=None, gt=0)
    income_date: date | None = None
    payer: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    note: str | None = Field(default=None, max_length=500)
    payment_method: str | None = Field(default=None, max_length=30)
    bank_reference: str | None = Field(default=None, max_length=100)
    reference: str | None = Field(default=None, max_length=100)
    confidence: str | None = Field(default="HIGH", max_length=20)


class IncomeRead(IncomeBase):
    id: int
    source: str
    idempotency_key: str | None = None
    created_at: datetime
    updated_at: datetime
    income_type: IncomeTypeRead | None = None
    bank_account: BankAccountRead | None = None
    account: BankAccountRead | None = None

    class Config:
        from_attributes = True


class IncomeList(BaseModel):
    items: list[IncomeRead]
    total: int
    page: int
    page_size: int
    pages: int
    total_paise: int
