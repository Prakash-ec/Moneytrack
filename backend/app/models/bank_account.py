from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Boolean, Date, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.db.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.expense import Expense
    from app.models.income import Income
    from app.models.account_transfer import AccountTransfer
    from app.models.balance_snapshot import BalanceSnapshot


class BankAccount(Base):
    __tablename__ = "bank_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bank_name: Mapped[str] = mapped_column(String(100), nullable=False)
    account_name: Mapped[str] = mapped_column(String(100), nullable=False)
    account_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default="savings"
    )  # savings, current, salary, credit_card, other
    account_number_mask: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # e.g. "XX8824" - never full number
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    opening_balance_paise: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    opening_balance_date: Mapped[date] = mapped_column(Date, nullable=False)
    current_balance_paise: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    last_reported_balance_paise: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    last_reported_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    reconciliation_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="matched"
    )  # matched, discrepancy, unreconciled
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#1D4ED8")
    icon: Mapped[str] = mapped_column(String(40), nullable=False, default="building")
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=utc_now, onupdate=utc_now
    )

    expenses: Mapped[list["Expense"]] = relationship(
        "Expense", back_populates="bank_account", foreign_keys="Expense.account_id"
    )
    incomes: Mapped[list["Income"]] = relationship(
        "Income", back_populates="bank_account", foreign_keys="Income.account_id"
    )
    transfers_sent: Mapped[list["AccountTransfer"]] = relationship(
        "AccountTransfer",
        foreign_keys="AccountTransfer.from_account_id",
        back_populates="from_account",
    )
    transfers_received: Mapped[list["AccountTransfer"]] = relationship(
        "AccountTransfer",
        foreign_keys="AccountTransfer.to_account_id",
        back_populates="to_account",
    )
    snapshots: Mapped[list["BalanceSnapshot"]] = relationship(
        "BalanceSnapshot",
        back_populates="bank_account",
        cascade="all, delete-orphan",
    )
