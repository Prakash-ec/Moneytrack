"""Initial expense tracking schema.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-10-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "expense_types",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("name_key", sa.String(length=120), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("category", sa.String(length=50), nullable=True),
        sa.Column("icon", sa.String(length=40), nullable=False),
        sa.Column("color", sa.String(length=7), nullable=False),
        sa.Column("is_archived", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_expense_types_name_key", "expense_types", ["name_key"], unique=True
    )
    op.create_index(
        "ix_expense_types_is_archived", "expense_types", ["is_archived"], unique=False
    )

    op.create_table(
        "expenses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("expense_type_id", sa.Integer(), nullable=False),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("payment_method", sa.String(length=20), nullable=True),
        sa.Column("merchant", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("amount_paise > 0", name="ck_expenses_amount_positive"),
        sa.ForeignKeyConstraint(
            ["expense_type_id"], ["expense_types.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_expenses_expense_date", "expenses", ["expense_date"], unique=False
    )
    op.create_index(
        "ix_expenses_expense_type_id", "expenses", ["expense_type_id"], unique=False
    )
    op.create_index("ix_expenses_date_id", "expenses", ["expense_date", "id"], unique=False)
    op.create_index(
        "ix_expenses_type_date", "expenses", ["expense_type_id", "expense_date"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_expenses_type_date", table_name="expenses")
    op.drop_index("ix_expenses_date_id", table_name="expenses")
    op.drop_index("ix_expenses_expense_type_id", table_name="expenses")
    op.drop_index("ix_expenses_expense_date", table_name="expenses")
    op.drop_table("expenses")
    op.drop_index("ix_expense_types_is_archived", table_name="expense_types")
    op.drop_index("ix_expense_types_name_key", table_name="expense_types")
    op.drop_table("expense_types")
