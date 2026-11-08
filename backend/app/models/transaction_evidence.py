from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import CheckConstraint, ForeignKey, ForeignKeyConstraint, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.db.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.expense import Expense
    from app.models.income import Income
    from app.models.sms_source_message import SmsSourceMessage


class TransactionEvidence(Base):
    __tablename__ = "transaction_evidence"
    __table_args__ = (
        CheckConstraint(
            "(expense_id IS NOT NULL AND income_id IS NULL) OR (expense_id IS NULL AND income_id IS NOT NULL)",
            name="ck_transaction_evidence_target",
        ),
        UniqueConstraint("sms_message_id", "expense_id", name="uq_evidence_sms_expense"),
        UniqueConstraint("sms_message_id", "income_id", name="uq_evidence_sms_income"),
        ForeignKeyConstraint(
            ["user_id", "expense_id"],
            ["expenses.user_id", "expenses.id"],
            name="fk_evidence_user_expense",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["user_id", "income_id"],
            ["incomes.user_id", "incomes.id"],
            name="fk_evidence_user_income",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["user_id", "sms_message_id"],
            ["sms_source_messages.user_id", "sms_source_messages.id"],
            name="fk_evidence_user_sms",
            ondelete="CASCADE",
        ),
        Index("ix_transaction_evidence_expense", "expense_id"),
        Index("ix_transaction_evidence_income", "income_id"),
        Index("ix_transaction_evidence_user", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sms_message_id: Mapped[int] = mapped_column(
        ForeignKey("sms_source_messages.id", ondelete="CASCADE"), nullable=False, index=True
    )
    expense_id: Mapped[int | None] = mapped_column(
        ForeignKey("expenses.id", ondelete="CASCADE"), nullable=True
    )
    income_id: Mapped[int | None] = mapped_column(
        ForeignKey("incomes.id", ondelete="CASCADE"), nullable=True
    )
    evidence_role: Mapped[str] = mapped_column(String(30), nullable=False, default="PRIMARY_NOTIFICATION")
    reconciliation_layer: Mapped[str | None] = mapped_column(String(20), nullable=True)
    match_confidence: Mapped[str] = mapped_column(String(20), nullable=False, default="HIGH")
    linked_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utc_now)

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    sms_message: Mapped["SmsSourceMessage"] = relationship("SmsSourceMessage", back_populates="evidence_links", foreign_keys=[sms_message_id])
    expense: Mapped["Expense | None"] = relationship("Expense", back_populates="sms_evidence", foreign_keys=[expense_id])
    income: Mapped["Income | None"] = relationship("Income", back_populates="sms_evidence", foreign_keys=[income_id])
