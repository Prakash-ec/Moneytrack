from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class SecurityAlertBase(BaseModel):
    amount_paise: int
    merchant: Optional[str] = None
    account_suffix: Optional[str] = None
    alert_type: str  # HIGH_AMOUNT, NEW_MERCHANT, RAPID_TXNS, REPEATED_DEBIT, UNREVIEWED_SMS
    severity: str = "WARNING"  # INFO, WARNING, CRITICAL
    reason: str
    status: str = "NEEDS_REVIEW"  # NEEDS_REVIEW, RECOGNISED, DISPUTED, RESOLVED


class SecurityAlertRead(SecurityAlertBase):
    id: int
    transaction_id: Optional[int] = None
    account_id: Optional[int] = None
    dispute_reason: Optional[str] = None
    disputed_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SecurityActionRequest(BaseModel):
    action: str = Field(..., description="Action: recognise, dispute, resolve")
    dispute_reason: Optional[str] = Field(None, max_length=500)


class BankHelplineInfo(BaseModel):
    bank_name: str
    phone: str
    sms_block_keyword: Optional[str] = None
    url: str


class SecurityActionResponse(BaseModel):
    success: bool
    status: str
    message: str
    alert: SecurityAlertRead
    fraud_guidance: Optional[List[BankHelplineInfo]] = None
    cybercrime_helpline: str = "1930"
    cybercrime_portal: str = "https://cybercrime.gov.in"


class SecuritySummary(BaseModel):
    total_alerts: int
    needs_review_count: int
    disputed_count: int
    resolved_count: int
    recognised_count: int
    recent_alerts: List[SecurityAlertRead]
