"""Security alerts, notification history logs, and user preferences.

Revision ID: 0005_security_and_notifications
Revises: 0004_income_and_bank_accounts
Create Date: 2026-10-31

Safe additive migration that introduces:
1. security_alerts: Payment security monitoring, suspicious debit detection, dispute workflows.
2. notification_logs: In-app notification center history and read status tracking.
3. user_preferences: Key-value store for alert thresholds, quiet hours, and report preferences.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0005_security_and_notifications"
down_revision: Union[str, None] = "0004_income_and_bank_accounts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. security_alerts
    op.create_table(
        "security_alerts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("transaction_id", sa.Integer(), nullable=True),
        sa.Column("account_id", sa.Integer(), nullable=True),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("merchant", sa.String(length=255), nullable=True),
        sa.Column("account_suffix", sa.String(length=10), nullable=True),
        sa.Column("alert_type", sa.String(length=50), nullable=False),
        sa.Column("severity", sa.String(length=20), nullable=False, server_default="WARNING"),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="NEEDS_REVIEW"),
        sa.Column("dispute_reason", sa.Text(), nullable=True),
        sa.Column("disputed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["transaction_id"], ["expenses.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["account_id"], ["bank_accounts.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_security_alerts_id", "security_alerts", ["id"])
    op.create_index("ix_security_alerts_transaction_id", "security_alerts", ["transaction_id"])
    op.create_index("ix_security_alerts_account_id", "security_alerts", ["account_id"])

    # 2. notification_logs
    op.create_table(
        "notification_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("category", sa.String(length=50), nullable=False),
        sa.Column("reference_id", sa.String(length=100), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notification_logs_id", "notification_logs", ["id"])
    op.create_index("ix_notification_logs_category", "notification_logs", ["category"])
    op.create_index("ix_notification_logs_reference_id", "notification_logs", ["reference_id"])
    op.create_index("ix_notification_logs_is_read", "notification_logs", ["is_read"])

    # 3. user_preferences
    op.create_table(
        "user_preferences",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key"),
    )
    op.create_index("ix_user_preferences_id", "user_preferences", ["id"])
    op.create_index("ix_user_preferences_key", "user_preferences", ["key"])


def downgrade() -> None:
    op.drop_table("user_preferences")
    op.drop_table("notification_logs")
    op.drop_table("security_alerts")
