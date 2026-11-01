import re
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.constants import ExpenseCategory
from app.schemas.common import Direction, Page

HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
ICON_NAME = re.compile(r"^[a-z0-9-]{1,40}$")


def _clean_optional_text(value: str | None, max_length: int) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if len(cleaned) > max_length:
        raise ValueError(f"Must be {max_length} characters or fewer")
    return cleaned


class ExpenseTypeBase(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    category: ExpenseCategory | None = None
    icon: str = Field(default="wallet", max_length=40)
    color: str = Field(default="#0F766E", max_length=7)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("Expense type name is required")
        return cleaned

    @field_validator("description")
    @classmethod
    def clean_description(cls, value: str | None) -> str | None:
        return _clean_optional_text(value, 500)

    @field_validator("category", mode="before")
    @classmethod
    def blank_category(cls, value):
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("icon")
    @classmethod
    def validate_icon(cls, value: str) -> str:
        icon = value.strip().lower()
        if not ICON_NAME.match(icon):
            raise ValueError("Icon must be a short lowercase identifier")
        return icon

    @field_validator("color")
    @classmethod
    def validate_color(cls, value: str) -> str:
        color = value.strip()
        if not HEX_COLOR.match(color):
            raise ValueError("Color must be a hex value such as #0F766E")
        return color.upper()


class ExpenseTypeCreate(ExpenseTypeBase):
    pass


class ExpenseTypeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    category: ExpenseCategory | None = None
    icon: str | None = Field(default=None, max_length=40)
    color: str | None = Field(default=None, max_length=7)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("Expense type name is required")
        return cleaned

    @field_validator("description")
    @classmethod
    def clean_description(cls, value: str | None) -> str | None:
        return _clean_optional_text(value, 500)

    @field_validator("category", mode="before")
    @classmethod
    def blank_category(cls, value):
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("icon")
    @classmethod
    def validate_icon(cls, value: str | None) -> str | None:
        if value is None:
            return None
        icon = value.strip().lower()
        if not ICON_NAME.match(icon):
            raise ValueError("Icon must be a short lowercase identifier")
        return icon

    @field_validator("color")
    @classmethod
    def validate_color(cls, value: str | None) -> str | None:
        if value is None:
            return None
        color = value.strip()
        if not HEX_COLOR.match(color):
            raise ValueError("Color must be a hex value such as #0F766E")
        return color.upper()


class ExpenseTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    category: str | None
    icon: str
    color: str
    is_archived: bool
    created_at: datetime
    updated_at: datetime
    total_paise: int = 0
    transaction_count: int = 0


class ExpenseTypeRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    icon: str
    color: str
    category: str | None = None
    is_archived: bool = False


class ExpenseTypeList(Page[ExpenseTypeRead]):
    pass


class TypeDailyPoint(BaseModel):
    date: date
    total_paise: int
    transaction_count: int


class ExpenseBrief(BaseModel):
    id: int
    amount_paise: int
    expense_date: date
    note: str | None = None


class ExpenseTypePeriodSummary(BaseModel):
    expense_type: ExpenseTypeRef
    start_date: date
    end_date: date
    total_paise: int
    transaction_count: int
    average_paise: int
    highest_expense: ExpenseBrief | None
    lowest_expense: ExpenseBrief | None
    previous_start_date: date
    previous_end_date: date
    previous_total_paise: int
    change_paise: int
    change_percent: float | None
    direction: Direction
    daily_trend: list[TypeDailyPoint]
