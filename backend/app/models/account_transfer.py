from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, CheckConstraint, Date, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.db.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.bank_account import BankAccount


class AccountTransfer(Base):
    __tablename__ = "account_transfers"
    __table_args__ = (
        CheckConstraint("amount_paise > 0", name="ck_transfers_amount_positive"),
        CheckConstraint("from_account_id != to_account_id", name="ck_transfers_distinct_accounts"),
        Index("ix_transfers_date", "transfer_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    from_account_id: Mapped[int] = mapped_column(
        ForeignKey("bank_accounts.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    to_account_id: Mapped[int] = mapped_column(
        ForeignKey("bank_accounts.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    amount_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    transfer_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    bank_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(
        String(255), nullable=True, unique=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=utc_now, onupdate=utc_now
    )

    from_account: Mapped["BankAccount"] = relationship(
        "BankAccount", foreign_keys=[from_account_id], back_populates="transfers_sent"
    )
    to_account: Mapped["BankAccount"] = relationship(
        "BankAccount", foreign_keys=[to_account_id], back_populates="transfers_received"
    )
