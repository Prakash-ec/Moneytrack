from datetime import date
from pydantic import BaseModel, Field


class ReceiptItem(BaseModel):
    name: str
    amount_paise: int | None = None
    quantity: int | None = None


class ReceiptParseResponse(BaseModel):
    merchant: str | None = None
    amount_paise: int | None = None
    expense_date: date | None = None
    currency: str = "INR"
    subtotal_paise: int | None = None
    tax_paise: int | None = None
    payment_method: str | None = None
    items: list[ReceiptItem] = Field(default_factory=list)
    note: str | None = None
    suggested_expense_type_id: int | None = None
    suggested_expense_type_name: str | None = None
    # Suggested *new* expense type name when no existing type matches.
    # Populated when the classifier proposes a type that does not yet exist.
    suggested_new_type_name: str | None = None
    confidence: dict[str, float] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    raw_text: str | None = None
    scan_method: str = "ocr"


class ReceiptTextRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=20000)
