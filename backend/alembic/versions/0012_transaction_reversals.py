"""Transaction reversals and refunds architecture.

Revision ID: 0012_transaction_reversals
Revises: 0011_balance_snapshot_provenance
Create Date: 2026-11-08
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012_transaction_reversals"
down_revision: str | None = "0011_balance_snapshot_provenance"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "transaction_reversals" not in tables:
        op.create_table(
            "transaction_reversals",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("original_expense_id", sa.Integer(), sa.ForeignKey("expenses.id", ondelete="CASCADE"), nullable=True),
            sa.Column("reversal_income_id", sa.Integer(), sa.ForeignKey("incomes.id", ondelete="CASCADE"), nullable=True),
            sa.Column("original_income_id", sa.Integer(), sa.ForeignKey("incomes.id", ondelete="CASCADE"), nullable=True),
            sa.Column("reversal_expense_id", sa.Integer(), sa.ForeignKey("expenses.id", ondelete="CASCADE"), nullable=True),
            sa.Column("amount_paise", sa.BigInteger(), nullable=False),
            sa.Column("reversal_type", sa.String(length=30), nullable=False, server_default="FULL_REFUND"),
            sa.Column("original_reference", sa.String(length=100), nullable=True),
            sa.Column("reversal_reference", sa.String(length=100), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="COMPLETED"),
            sa.Column("reason", sa.String(length=255), nullable=True),
            sa.Column("sms_message_id", sa.Integer(), sa.ForeignKey("sms_source_messages.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_reversals_user_orig_expense", "transaction_reversals", ["user_id", "original_expense_id"])
        op.create_index("ix_reversals_user_ref", "transaction_reversals", ["user_id", "original_reference"])
        op.create_index("ix_reversals_rev_ref", "transaction_reversals", ["user_id", "reversal_reference"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "transaction_reversals" in tables:
        op.drop_index("ix_reversals_rev_ref", table_name="transaction_reversals")
        op.drop_index("ix_reversals_user_ref", table_name="transaction_reversals")
        op.drop_index("ix_reversals_user_orig_expense", table_name="transaction_reversals")
        op.drop_table("transaction_reversals")
