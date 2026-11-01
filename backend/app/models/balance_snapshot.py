from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Date, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.db.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.bank_account import BankAccount


class BalanceSnapshot(Base):
    __tablename__ = "bank_balance_snapshots"
    __table_args__ = (
        Index("ix_balance_snapshots_account_date", "account_id", "snapshot_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("bank_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    calculated_balance_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    reported_balance_paise: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    source: Mapped[str] = mapped_column(
        String(30), nullable=False, default="calculation"
    )  # calculation, sms, reconciliation, manual
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utc_now)

    bank_account: Mapped["BankAccount"] = relationship(
        "BankAccount", back_populates="snapshots"
    )
