from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, CheckConstraint, Date, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.db.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.bank_account import BankAccount
    from app.models.expense_type import ExpenseType
    from app.models.idempotency_key import ExpenseIdempotencyKey


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = (
        CheckConstraint("amount_paise > 0", name="ck_expenses_amount_positive"),
        Index("ix_expenses_date_id", "expense_date", "id"),
        Index("ix_expenses_type_date", "expense_type_id", "expense_date"),
        Index("ix_expenses_account_date", "account_id", "expense_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    expense_type_id: Mapped[int] = mapped_column(
        ForeignKey("expense_types.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    account_id: Mapped[int | None] = mapped_column(
        ForeignKey("bank_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    amount_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    payment_method: Mapped[str | None] = mapped_column(String(20), nullable=True)
    merchant: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=utc_now, onupdate=utc_now
    )

    expense_type: Mapped["ExpenseType"] = relationship(back_populates="expenses")
    bank_account: Mapped["BankAccount | None"] = relationship(
        "BankAccount", back_populates="expenses", foreign_keys=[account_id]
    )
    idempotency_keys: Mapped[list["ExpenseIdempotencyKey"]] = relationship(
        back_populates="expense", cascade="all, delete-orphan"
    )
