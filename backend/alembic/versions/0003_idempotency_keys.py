"""Idempotency keys for safe expense creation retries.

Revision ID: 0003_idempotency_keys
Revises: 0002_budget_tables
Create Date: 2026-10-25

Adds an additive, backward-compatible table used to guarantee that the same
expense creation request (identified by a client-generated idempotency key)
is executed only once. Replaying a key returns the previously created
expense instead of inserting a duplicate. No existing tables or columns are
modified, so current API clients and the existing SQLite database are
unaffected.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003_idempotency_keys"
down_revision: Union[str, None] = "0002_budget_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "expense_idempotency_keys",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "idempotency_key",
            sa.String(length=255),
            nullable=False,
            comment="Client-generated idempotency key for an expense creation request.",
        ),
        sa.Column(
            "expense_id",
            sa.Integer(),
            nullable=False,
            comment="Expense created for this idempotency key.",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            comment="When the idempotency key was first recorded.",
        ),
        sa.ForeignKeyConstraint(
            ["expense_id"],
            ["expenses.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_expense_idempotency_keys_idempotency_key"),
        "expense_idempotency_keys",
        ["idempotency_key"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_expense_idempotency_keys_idempotency_key"),
        table_name="expense_idempotency_keys",
    )
    op.drop_table("expense_idempotency_keys")
