from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.db.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.expense import Expense


class ExpenseIdempotencyKey(Base):
    """Maps a client idempotency key to the expense it created.

    Replaying the same key returns the existing expense so retries (network
    timeouts, receiver re-fires, worker retries, phone restarts) never create
    duplicate expenses.
    """

    __tablename__ = "expense_idempotency_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    idempotency_key: Mapped[str] = mapped_column(
        String(255), nullable=False, index=True, unique=True
    )
    expense_id: Mapped[int] = mapped_column(
        ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=utc_now
    )

    expense: Mapped["Expense"] = relationship(back_populates="idempotency_keys")
