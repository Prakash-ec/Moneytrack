from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utc_now
from app.db.base import Base, UTCDateTime

if TYPE_CHECKING:
    pass


class Budget(Base):
    """Monthly budget for overall spending limit."""
    __tablename__ = "budgets"

    __table_args__ = (
        CheckConstraint("amount_paise >= 0", name="ck_budgets_amount_nonnegative"),
        Index("ix_budgets_period", "budget_period"),
        # Tenant-aware unique constraint: one budget per calendar month per user
        UniqueConstraint("user_id", "budget_period", name="uq_budgets_user_period"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    budget_period: Mapped[date] = mapped_column(
        Date, nullable=False, index=True,
        comment="First day of the budget month (e.g. 2026-01-01 for January 2026)"
    )
    amount_paise: Mapped[int] = mapped_column(
        BigInteger, nullable=False,
        comment="Monthly budget amount in paise (1/100 of currency unit)"
    )
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=utc_now, onupdate=utc_now
    )


class CategoryBudget(Base):
    """Category-specific monthly budget."""
    __tablename__ = "category_budgets"

    __table_args__ = (
        CheckConstraint("amount_paise >= 0", name="ck_category_budgets_amount_nonnegative"),
        Index("ix_category_budgets_period_category", "budget_period", "category"),
        # Tenant-aware unique constraint: one category budget per period per category per user
        UniqueConstraint("user_id", "budget_period", "category", name="uq_category_budgets_user_period_category"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    budget_period: Mapped[date] = mapped_column(
        Date, nullable=False, index=True,
        comment="First day of the budget month"
    )
    category: Mapped[str | None] = mapped_column(
        String(50), nullable=False, index=True,
        comment="Expense category name (Food, Travel, etc.)"
    )
    amount_paise: Mapped[int] = mapped_column(
        BigInteger, nullable=False,
        comment="Category budget amount in paise"
    )
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=utc_now, onupdate=utc_now
    )
