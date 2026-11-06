from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.bank_account import BankAccountRead


class TransferCreate(BaseModel):
    from_account_id: int
    to_account_id: int
    amount_paise: int = Field(gt=0, description="Transfer amount in integer paise")
    transfer_date: date
    description: str | None = Field(default=None, max_length=500)
    bank_reference: str | None = Field(default=None, max_length=100)


class TransferUpdate(BaseModel):
    from_account_id: int | None = None
    to_account_id: int | None = None
    amount_paise: int | None = Field(default=None, gt=0, description="Transfer amount in integer paise")
    transfer_date: date | None = None
    description: str | None = Field(default=None, max_length=500)
    bank_reference: str | None = Field(default=None, max_length=100)


class TransferRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    from_account_id: int
    to_account_id: int
    amount_paise: int
    transfer_date: date
    description: str | None = None
    bank_reference: str | None = None
    idempotency_key: str | None = None
    created_at: datetime
    updated_at: datetime
    from_account: BankAccountRead | None = None
    to_account: BankAccountRead | None = None


class TransferList(BaseModel):
    items: list[TransferRead]
    total: int
    total_transferred_paise: int
