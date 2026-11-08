"""SMS evidence architecture and audit trail.

Revision ID: 0009_sms_evidence_architecture
Revises: 0008_tenant_unique
Create Date: 2026-11-08
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009_sms_evidence_architecture"
down_revision: str | None = "0008_tenant_unique"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # 1. Ensure composite uniqueness on expenses and incomes for composite foreign keys
    if "expenses" in tables:
        expense_uqs = [u.get("name") for u in inspector.get_unique_constraints("expenses")]
        if "uq_expenses_user_id" not in expense_uqs:
            op.create_unique_constraint("uq_expenses_user_id", "expenses", ["user_id", "id"])

    if "incomes" in tables:
        income_uqs = [u.get("name") for u in inspector.get_unique_constraints("incomes")]
        if "uq_incomes_user_id" not in income_uqs:
            op.create_unique_constraint("uq_incomes_user_id", "incomes", ["user_id", "id"])

    # 2. Create sms_source_messages table
    if "sms_source_messages" not in tables:
        op.create_table(
            "sms_source_messages",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column("sender_id", sa.String(length=50), nullable=False, index=True),
            sa.Column("received_at_ms", sa.BigInteger(), nullable=True),
            sa.Column("content_hash", sa.String(length=64), nullable=True),
            sa.Column(
                "classification",
                sa.String(length=40),
                nullable=False,
                server_default="AMBIGUOUS_REVIEW",
            ),
            sa.Column(
                "parser_version",
                sa.String(length=20),
                nullable=False,
                server_default="v1.0",
            ),
            sa.Column("evidence_summary", sa.Text(), nullable=True),
            sa.Column(
                "processing_status",
                sa.String(length=30),
                nullable=False,
                server_default="PROCESSED",
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.UniqueConstraint("user_id", "id", name="uq_sms_source_messages_user_id"),
        )
        op.create_index(
            "ix_sms_source_messages_user_sender",
            "sms_source_messages",
            ["user_id", "sender_id"],
        )
        op.create_index(
            "ix_sms_source_messages_user_received",
            "sms_source_messages",
            ["user_id", "received_at_ms"],
        )
        op.create_index(
            "ix_sms_source_messages_user_hash",
            "sms_source_messages",
            ["user_id", "content_hash"],
        )

    # 3. Create transaction_evidence table with composite tenant foreign keys
    if "transaction_evidence" not in tables:
        op.create_table(
            "transaction_evidence",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column(
                "sms_message_id",
                sa.Integer(),
                sa.ForeignKey("sms_source_messages.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column(
                "expense_id",
                sa.Integer(),
                sa.ForeignKey("expenses.id", ondelete="CASCADE"),
                nullable=True,
                index=True,
            ),
            sa.Column(
                "income_id",
                sa.Integer(),
                sa.ForeignKey("incomes.id", ondelete="CASCADE"),
                nullable=True,
                index=True,
            ),
            sa.Column(
                "evidence_role",
                sa.String(length=30),
                nullable=False,
                server_default="PRIMARY_NOTIFICATION",
            ),
            sa.Column("reconciliation_layer", sa.String(length=20), nullable=True),
            sa.Column(
                "match_confidence",
                sa.String(length=20),
                nullable=False,
                server_default="HIGH",
            ),
            sa.Column(
                "linked_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.CheckConstraint(
                "(expense_id IS NOT NULL AND income_id IS NULL) OR (expense_id IS NULL AND income_id IS NOT NULL)",
                name="ck_transaction_evidence_target",
            ),
            sa.UniqueConstraint(
                "sms_message_id", "expense_id", name="uq_evidence_sms_expense"
            ),
            sa.UniqueConstraint(
                "sms_message_id", "income_id", name="uq_evidence_sms_income"
            ),
            sa.ForeignKeyConstraint(
                ["user_id", "expense_id"],
                ["expenses.user_id", "expenses.id"],
                name="fk_evidence_user_expense",
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["user_id", "income_id"],
                ["incomes.user_id", "incomes.id"],
                name="fk_evidence_user_income",
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["user_id", "sms_message_id"],
                ["sms_source_messages.user_id", "sms_source_messages.id"],
                name="fk_evidence_user_sms",
                ondelete="CASCADE",
            ),
        )
        op.create_index(
            "ix_transaction_evidence_user",
            "transaction_evidence",
            ["user_id"],
        )

    # 3. Add columns to expenses
    if "expenses" in tables:
        expense_cols = [c["name"] for c in inspector.get_columns("expenses")]
        if "bank_reference" not in expense_cols:
            op.add_column("expenses", sa.Column("bank_reference", sa.String(length=100), nullable=True))
            op.create_index("ix_expenses_bank_reference", "expenses", ["bank_reference"])
        if "source" not in expense_cols:
            op.add_column(
                "expenses",
                sa.Column("source", sa.String(length=20), nullable=False, server_default="manual"),
            )
        if "confidence" not in expense_cols:
            op.add_column(
                "expenses",
                sa.Column("confidence", sa.String(length=20), nullable=True, server_default="HIGH"),
            )

    # 4. Add columns to incomes
    if "incomes" in tables:
        income_cols = [c["name"] for c in inspector.get_columns("incomes")]
        if "confidence" not in income_cols:
            op.add_column(
                "incomes",
                sa.Column("confidence", sa.String(length=20), nullable=True, server_default="HIGH"),
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "transaction_evidence" in tables:
        op.drop_table("transaction_evidence")

    if "sms_source_messages" in tables:
        op.drop_table("sms_source_messages")

    if "incomes" in tables:
        income_cols = [c["name"] for c in inspector.get_columns("incomes")]
        if "confidence" in income_cols:
            with op.batch_alter_table("incomes") as batch_op:
                batch_op.drop_column("confidence")

    if "expenses" in tables:
        expense_cols = [c["name"] for c in inspector.get_columns("expenses")]
        with op.batch_alter_table("expenses") as batch_op:
            if "confidence" in expense_cols:
                batch_op.drop_column("confidence")
            if "source" in expense_cols:
                batch_op.drop_column("source")
            if "bank_reference" in expense_cols:
                batch_op.drop_index("ix_expenses_bank_reference")
                batch_op.drop_column("bank_reference")
