from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator

from app.core.constants import PaymentMethod
from app.schemas.common import Page
from app.schemas.expense_type import ExpenseTypeRef


def _clean_optional_text(value: str | None, max_length: int) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if len(cleaned) > max_length:
        cleaned = cleaned[:max_length].strip()
    return cleaned


class ExpenseBase(BaseModel):
    expense_type_id: int = Field(gt=0)
    account_id: int | None = None
    amount_paise: int = Field(gt=0, le=10**13)
    expense_date: date
    note: str | None = Field(default=None, max_length=500)
    payment_method: PaymentMethod | None = None
    merchant: str | None = Field(default=None, max_length=120)
    bank_reference: str | None = Field(default=None, max_length=100)
    source: str | None = Field(default="manual", max_length=20)
    confidence: str | None = Field(default="HIGH", max_length=20)

    @field_validator("payment_method", mode="before")
    @classmethod
    def normalize_payment_method(cls, value: object) -> object:
        if value is None or not str(value).strip():
            return None
        v = str(value).strip().lower()
        for member in PaymentMethod:
            if member.value.lower() == v:
                return member
        if "card" in v:
            return PaymentMethod.DEBIT_CARD
        if "upi" in v or "gpay" in v or "phonepe" in v or "paytm" in v:
            return PaymentMethod.UPI
        if "cash" in v:
            return PaymentMethod.CASH
        if any(w in v for w in ("bank", "transfer", "neft", "rtgs", "imps", "net banking")):
            return PaymentMethod.BANK_TRANSFER
        return value

    @field_validator("note")
    @classmethod
    def clean_note(cls, value: str | None) -> str | None:
        return _clean_optional_text(value, 500)

    @field_validator("merchant")
    @classmethod
    def clean_merchant(cls, value: str | None) -> str | None:
        return _clean_optional_text(value, 120)


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUpdate(BaseModel):
    expense_type_id: int | None = Field(default=None, gt=0)
    account_id: int | None = None
    amount_paise: int | None = Field(default=None, gt=0, le=10**13)
    expense_date: date | None = None
    note: str | None = Field(default=None, max_length=500)
    payment_method: PaymentMethod | None = None
    merchant: str | None = Field(default=None, max_length=120)

    @field_validator("expense_type_id", "amount_paise", "expense_date", mode="before")
    @classmethod
    def validate_not_null(cls, value: object, info: ValidationInfo) -> object:
        if value is None:
            raise ValueError(f"{info.field_name.replace('_', ' ').capitalize()} cannot be null")
        return value

    @field_validator("payment_method", mode="before")
    @classmethod
    def normalize_payment_method(cls, value: object) -> object:
        if value is None or not str(value).strip():
            return None
        v = str(value).strip()
        for member in PaymentMethod:
            if member.value.lower() == v.lower():
                return member
        return value

    @field_validator("note")
    @classmethod
    def clean_note(cls, value: str | None) -> str | None:
        return _clean_optional_text(value, 500)

    @field_validator("merchant")
    @classmethod
    def clean_merchant(cls, value: str | None) -> str | None:
        return _clean_optional_text(value, 120)


class ExpenseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    expense_type_id: int
    account_id: int | None = None
    amount_paise: int
    expense_date: date
    note: str | None
    payment_method: str | None
    merchant: str | None
    bank_reference: str | None = None
    source: str | None = "manual"
    confidence: str | None = "HIGH"
    created_at: datetime
    updated_at: datetime
    expense_type: ExpenseTypeRef


class ExpensePage(Page[ExpenseRead]):
    pass
