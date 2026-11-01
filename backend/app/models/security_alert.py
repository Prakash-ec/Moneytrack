from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.db.base import Base


class SecurityAlert(Base):
    __tablename__ = "security_alerts"

    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(Integer, ForeignKey("expenses.id", ondelete="SET NULL"), nullable=True, index=True)
    account_id = Column(Integer, ForeignKey("bank_accounts.id", ondelete="SET NULL"), nullable=True, index=True)
    amount_paise = Column(Integer, nullable=False)
    merchant = Column(String(255), nullable=True)
    account_suffix = Column(String(10), nullable=True)
    alert_type = Column(String(50), nullable=False)  # HIGH_AMOUNT, NEW_MERCHANT, RAPID_TXNS, REPEATED_DEBIT, UNREVIEWED_SMS
    severity = Column(String(20), nullable=False, default="WARNING")  # INFO, WARNING, CRITICAL
    reason = Column(Text, nullable=False)
    status = Column(String(30), nullable=False, default="NEEDS_REVIEW")  # NEEDS_REVIEW, RECOGNISED, DISPUTED, RESOLVED
    dispute_reason = Column(Text, nullable=True)
    disputed_at = Column(DateTime(timezone=True), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    expense = relationship("Expense")
    account = relationship("BankAccount")
