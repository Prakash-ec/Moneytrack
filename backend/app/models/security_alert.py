from datetime import datetime

from sqlalchemy import BigInteger, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.db.base import Base, UTCDateTime


class SecurityAlert(Base):
    __tablename__ = "security_alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    transaction_id: Mapped[int | None] = mapped_column(
        ForeignKey("expenses.id", ondelete="SET NULL"), nullable=True, index=True
    )
    account_id: Mapped[int | None] = mapped_column(
        ForeignKey("bank_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    amount_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    merchant: Mapped[str | None] = mapped_column(String(255), nullable=True)
    account_suffix: Mapped[str | None] = mapped_column(String(10), nullable=True)
    alert_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # HIGH_AMOUNT, NEW_MERCHANT, RAPID_TXNS, REPEATED_DEBIT, UNREVIEWED_SMS
    severity: Mapped[str] = mapped_column(
        String(20), nullable=False, default="WARNING"
    )  # INFO, WARNING, CRITICAL
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="NEEDS_REVIEW"
    )  # NEEDS_REVIEW, RECOGNISED, DISPUTED, RESOLVED
    dispute_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    disputed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=utc_now, onupdate=utc_now
    )

    expense = relationship("Expense")
    account = relationship("BankAccount")
