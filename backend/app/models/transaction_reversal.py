from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.db.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.expense import Expense
    from app.models.income import Income
    from app.models.sms_source_message import SmsSourceMessage
    from app.models.user import User


class TransactionReversal(Base):
    __tablename__ = "transaction_reversals"
    __table_args__ = (
        Index("ix_reversals_user_orig_expense", "user_id", "original_expense_id"),
        Index("ix_reversals_user_ref", "user_id", "original_reference"),
        Index("ix_reversals_rev_ref", "user_id", "reversal_reference"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    original_expense_id: Mapped[int | None] = mapped_column(
        ForeignKey("expenses.id", ondelete="CASCADE"), nullable=True, index=True
    )
    reversal_income_id: Mapped[int | None] = mapped_column(
        ForeignKey("incomes.id", ondelete="CASCADE"), nullable=True, index=True
    )
    original_income_id: Mapped[int | None] = mapped_column(
        ForeignKey("incomes.id", ondelete="CASCADE"), nullable=True, index=True
    )
    reversal_expense_id: Mapped[int | None] = mapped_column(
        ForeignKey("expenses.id", ondelete="CASCADE"), nullable=True, index=True
    )
    amount_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    reversal_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default="FULL_REFUND"
    )  # FULL_REFUND, PARTIAL_REFUND, REVERSAL
    original_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    reversal_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="COMPLETED"
    )  # COMPLETED, PENDING_REVIEW, REJECTED
    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sms_message_id: Mapped[int | None] = mapped_column(
        ForeignKey("sms_source_messages.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=utc_now, onupdate=utc_now
    )

    user: Mapped["User"] = relationship("User")
    original_expense: Mapped["Expense | None"] = relationship(
        "Expense", foreign_keys=[original_expense_id], back_populates="reversals"
    )
    reversal_income: Mapped["Income | None"] = relationship(
        "Income", foreign_keys=[reversal_income_id]
    )
    original_income: Mapped["Income | None"] = relationship(
        "Income", foreign_keys=[original_income_id]
    )
    reversal_expense: Mapped["Expense | None"] = relationship(
        "Expense", foreign_keys=[reversal_expense_id]
    )
    sms_message: Mapped["SmsSourceMessage | None"] = relationship("SmsSourceMessage")
