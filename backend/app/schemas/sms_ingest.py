from typing import Literal

from pydantic import BaseModel, Field


class SmsIngestRequest(BaseModel):
    body: str | None = None
    sender: str | None = None
    timestamp_ms: int | None = None
    amount_paise: int = Field(gt=0)
    merchant_or_payer: str | None = None
    reference: str | None = None
    transaction_date: str | None = None  # ISO yyyy-MM-dd
    direction: Literal["CREDIT", "DEBIT", "TRANSFER", "UNKNOWN"] = "DEBIT"
    available_balance_paise: int | None = None
    account_suffix: str | None = None  # e.g. "8824" or "XX8824"
    bank_name: str | None = None
    suggested_category: str | None = None
    note: str | None = None


class SmsIngestResponse(BaseModel):
    created: bool
    replayed: bool = False
    status: str = "created"
    transaction_type: Literal["expense", "income", "transfer", "queued", "ignored"]
    id: int | None = None
    entity_id: int | None = None
    account_id: int | None = None
    account_name: str | None = None
    available_balance_recorded: bool = False
    current_calculated_balance_paise: int | None = None
    message: str
