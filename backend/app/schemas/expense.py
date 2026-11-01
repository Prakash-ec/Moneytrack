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
        raise ValueError(f"Must be {max_length} characters or fewer")
    return cleaned


class ExpenseBase(BaseModel):
    expense_type_id: int = Field(gt=0)
    account_id: int | None = None
    amount_paise: int = Field(gt=0, le=10**13)
    expense_date: date
    note: str | None = Field(default=None, max_length=500)
    payment_method: PaymentMethod | None = None
    merchant: str | None = Field(default=None, max_length=120)

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
    created_at: datetime
    updated_at: datetime
    expense_type: ExpenseTypeRef


class ExpensePage(Page[ExpenseRead]):
    pass
