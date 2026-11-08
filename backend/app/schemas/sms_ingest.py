from typing import Literal

from pydantic import BaseModel, Field


class SmsIngestRequest(BaseModel):
    body: str | None = None
    raw_text: str | None = None
    sender: str | None = None
    timestamp_ms: int | None = None
    received_at: int | None = None
    classification: str | None = None
    confidence: str | None = None
    reconciliation_layer: str | None = None
    amount_paise: int = Field(gt=0)
    merchant_or_payer: str | None = None
    reference: str | None = None
    transaction_date: str | None = None  # ISO yyyy-MM-dd
    transaction_time: str | None = None  # ISO timestamp
    direction: Literal["CREDIT", "DEBIT", "TRANSFER", "UNKNOWN"] = "DEBIT"
    available_balance_paise: int | None = None
    ledger_balance_paise: int | None = None
    balance_type: str | None = None  # AVAILABLE, LEDGER
    currency: str = "INR"
    account_suffix: str | None = None  # e.g. "8824" or "XX8824"
    bank_name: str | None = None
    suggested_category: str | None = None
    note: str | None = None
    idempotency_key: str | None = None

    @property
    def effective_timestamp_ms(self) -> int | None:
        return self.received_at if self.received_at is not None else self.timestamp_ms

    @property
    def effective_body(self) -> str:
        """Returns body if present and non-blank; otherwise raw_text; otherwise empty string."""
        if self.body is not None and self.body.strip():
            return self.body.strip()
        if self.raw_text is not None and self.raw_text.strip():
            return self.raw_text.strip()
        return ""


class SmsIngestResponse(BaseModel):
    created: bool
    replayed: bool = False
    status: str = "created"  # created, replayed, matched_manual, conflict_review, queued, ignored
    transaction_type: Literal["expense", "income", "transfer", "queued", "ignored"]
    id: int | None = None
    entity_id: int | None = None
    account_id: int | None = None
    account_name: str | None = None
    available_balance_recorded: bool = False
    current_calculated_balance_paise: int | None = None
    last_reported_balance_paise: int | None = None
    reconciliation_status: str | None = None
    balance_type: str | None = None
    match_reason: str | None = None
    message: str
