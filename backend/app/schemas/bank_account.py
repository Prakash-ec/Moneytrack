from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, computed_field, model_validator

AccountType = Literal[
    "savings",
    "current",
    "salary",
    "credit_card",
    "wallet",
    "cash",
    "other",
]
ReconciliationStatus = Literal["matched", "discrepancy", "unreconciled"]


class BankAccountBase(BaseModel):
    bank_name: str = Field(min_length=1, max_length=100)
    account_name: str = Field(default="", max_length=100)
    account_type: AccountType = "savings"
    account_number_mask: str = Field(default="XX0000", max_length=20)
    currency: str = Field(default="INR", max_length=3)
    opening_balance_paise: int = Field(default=0)
    opening_balance_date: date | None = None
    color: str = Field(default="#1D4ED8", max_length=7)
    icon: str = Field(default="building", max_length=40)
    is_primary: bool | None = Field(default=False)

    @model_validator(mode="before")
    @classmethod
    def normalize_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # Accept 'name' if 'account_name' is missing
            if not data.get("account_name") and data.get("name"):
                data["account_name"] = str(data["name"]).strip()
            elif not data.get("account_name"):
                bname = str(data.get("bank_name") or "Bank").strip()
                data["account_name"] = f"{bname} Account"

            # Accept 'opening_date' if 'opening_balance_date' is missing
            if not data.get("opening_balance_date") and data.get("opening_date"):
                data["opening_balance_date"] = data["opening_date"]
            elif not data.get("opening_balance_date"):
                data["opening_balance_date"] = date.today().isoformat()

            # Ensure account_number_mask is a valid string of length 2-20
            mask = data.get("account_number_mask")
            if not mask or not str(mask).strip():
                data["account_number_mask"] = "XX0000"
            else:
                m = str(mask).strip()
                if len(m) < 2:
                    m = f"XX{m}"
                data["account_number_mask"] = m[:20]

            # Normalize account_type
            atype = str(data.get("account_type") or "savings").lower().strip()
            if atype in {"savings", "current", "salary", "credit_card", "wallet", "cash", "other"}:
                data["account_type"] = atype
            else:
                data["account_type"] = "other"
        return data


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
    is_primary: bool | None = None

    @model_validator(mode="before")
    @classmethod
    def normalize_update_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("account_name") and data.get("name"):
                data["account_name"] = str(data["name"]).strip()
            if not data.get("opening_balance_date") and data.get("opening_date"):
                data["opening_balance_date"] = data["opening_date"]
            if "account_number_mask" in data and not data.get("account_number_mask"):
                data["account_number_mask"] = "XX0000"
        return data


class BankAccountRead(BankAccountBase):
    id: int
    current_balance_paise: int
    last_reported_balance_paise: int | None = None
    last_reported_at: datetime | None = None
    reconciliation_status: ReconciliationStatus
    is_archived: bool
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def name(self) -> str:
        return self.account_name

    @computed_field
    @property
    def opening_date(self) -> date:
        return self.opening_balance_date or date.today()

    class Config:
        from_attributes = True


class BankAccountList(BaseModel):
    items: list[BankAccountRead]
    total_balance_paise: int
    total_reported_balance_paise: int | None = None
    account_count: int
    reconciliation_needed_count: int

    @computed_field
    @property
    def consolidated_balance_paise(self) -> int:
        return self.total_balance_paise

    @computed_field
    @property
    def total_accounts(self) -> int:
        return self.account_count
