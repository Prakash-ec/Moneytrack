from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Date, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.db.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.bank_account import BankAccount
    from app.models.sms_source_message import SmsSourceMessage


class BalanceSnapshot(Base):
    __tablename__ = "bank_balance_snapshots"
    __table_args__ = (
        Index("ix_balance_snapshots_account_date", "account_id", "snapshot_date"),
        Index("ix_balance_snapshots_user_type", "user_id", "balance_type"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    account_id: Mapped[int] = mapped_column(
        ForeignKey("bank_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    calculated_balance_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    reported_balance_paise: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    balance_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="AVAILABLE"
    )  # AVAILABLE, LEDGER, UNCLEAR
    sms_message_id: Mapped[int | None] = mapped_column(
        ForeignKey("sms_source_messages.id", ondelete="SET NULL"), nullable=True, index=True
    )
    transaction_time: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    message_reception_time: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    processing_time: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utc_now)
    confidence: Mapped[str] = mapped_column(String(20), nullable=False, default="HIGH")
    source_evidence: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(
        String(30), nullable=False, default="calculation"
    )  # calculation, sms, reconciliation, manual
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utc_now)

    @property
    def difference_paise(self) -> int | None:
        if self.reported_balance_paise is None:
            return None
        return self.calculated_balance_paise - self.reported_balance_paise

    bank_account: Mapped["BankAccount"] = relationship("BankAccount", back_populates="snapshots")
    sms_message: Mapped["SmsSourceMessage | None"] = relationship("SmsSourceMessage")
