from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, CheckConstraint, Date, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.db.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.bank_account import BankAccount
    from app.models.expense_type import ExpenseType
    from app.models.idempotency_key import ExpenseIdempotencyKey
    from app.models.transaction_evidence import TransactionEvidence
    from app.models.transaction_reversal import TransactionReversal


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = (
        CheckConstraint("amount_paise > 0", name="ck_expenses_amount_positive"),
        UniqueConstraint("user_id", "id", name="uq_expenses_user_id"),
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
    bank_reference: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    confidence: Mapped[str | None] = mapped_column(String(20), nullable=True, default="HIGH")
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
    sms_evidence: Mapped[list["TransactionEvidence"]] = relationship(
        "TransactionEvidence",
        back_populates="expense",
        cascade="all, delete-orphan",
        foreign_keys="[TransactionEvidence.expense_id]",
    )
    reversals: Mapped[list["TransactionReversal"]] = relationship(
        "TransactionReversal",
        back_populates="original_expense",
        cascade="all, delete-orphan",
        foreign_keys="[TransactionReversal.original_expense_id]",
    )

    @property
    def net_amount_paise(self) -> int:
        refunded = sum(
            r.amount_paise for r in (self.reversals or []) if getattr(r, "status", None) == "COMPLETED"
        )
        return max(0, self.amount_paise - refunded)
