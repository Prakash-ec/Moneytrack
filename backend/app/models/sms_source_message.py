from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import BigInteger, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now
from app.db.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.transaction_evidence import TransactionEvidence


class SmsSourceMessage(Base):
    __tablename__ = "sms_source_messages"
    __table_args__ = (
        UniqueConstraint("user_id", "id", name="uq_sms_source_messages_user_id"),
        Index("ix_sms_source_messages_user_sender", "user_id", "sender_id"),
        Index("ix_sms_source_messages_user_received", "user_id", "received_at_ms"),
        Index("ix_sms_source_messages_user_hash", "user_id", "content_hash"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sender_id: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    received_at_ms: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    classification: Mapped[str] = mapped_column(String(40), nullable=False, default="AMBIGUOUS_REVIEW")
    parser_version: Mapped[str] = mapped_column(String(20), nullable=False, default="v1.0")
    evidence_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    processing_status: Mapped[str] = mapped_column(String(30), nullable=False, default="PROCESSED")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utc_now)

    user: Mapped["User"] = relationship("User")
    evidence_links: Mapped[list["TransactionEvidence"]] = relationship(
        "TransactionEvidence",
        back_populates="sms_message",
        cascade="all, delete-orphan",
        foreign_keys="[TransactionEvidence.sms_message_id]",
    )
