from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.db.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.income import Income


class IncomeType(Base):
    __tablename__ = "income_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    name_key: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    icon: Mapped[str] = mapped_column(String(40), nullable=False, default="wallet")
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#10B981")
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime, nullable=False, default=utc_now, onupdate=utc_now
    )

    incomes: Mapped[list["Income"]] = relationship(
        "Income",
        back_populates="income_type",
        passive_deletes=True,
    )
