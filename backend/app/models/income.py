from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, CheckConstraint, Date, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.db.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.bank_account import BankAccount
    from app.models.income_type import IncomeType


class Income(Base):
    __tablename__ = "incomes"
    __table_args__ = (
        CheckConstraint("amount_paise > 0", name="ck_incomes_amount_positive"),
        Index("ix_incomes_date_id", "income_date", "id"),
        Index("ix_incomes_type_date", "income_type_id", "income_date"),
        Index("ix_incomes_account_date", "account_id", "income_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    income_type_id: Mapped[int] = mapped_column(
        ForeignKey("income_types.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    account_id: Mapped[int | None] = mapped_column(
        ForeignKey("bank_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    amount_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    income_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    payer: Mapped[str | None] = mapped_column(String(120), nullable=True)  # payer, client, employer
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    payment_method: Mapped[str | None] = mapped_column(
        String(30), nullable=True
    )  # upi, neft, imps, rtgs, cash, bank_transfer, other
    bank_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")  # manual, sms
    idempotency_key: Mapped[str | None] = mapped_column(
        String(255), nullable=True, unique=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=utc_now, onupdate=utc_now
    )

    income_type: Mapped["IncomeType"] = relationship(back_populates="incomes")
    bank_account: Mapped["BankAccount | None"] = relationship(
        "BankAccount", back_populates="incomes", foreign_keys=[account_id]
    )
