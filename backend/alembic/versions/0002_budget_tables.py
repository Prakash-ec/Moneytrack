"""Budget tables migration.

Revision ID: 0002_budget_tables
Revises: 0001_initial_schema
Create Date: 2026-10-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002_budget_tables"
down_revision: Union[str, None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "budgets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("budget_period", sa.Date(), nullable=False),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("amount_paise >= 0", name="ck_budgets_amount_nonnegative"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("budget_period", name="uq_budgets_one_per_period"),
    )
    op.create_index(
        "ix_budgets_budget_period", "budgets", ["budget_period"], unique=False
    )

    op.create_table(
        "category_budgets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("budget_period", sa.Date(), nullable=False),
        sa.Column("category", sa.String(length=50), nullable=False),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("amount_paise >= 0", name="ck_category_budgets_amount_nonnegative"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("budget_period", "category", name="uq_category_budgets_one_per_period_category"),
    )
    op.create_index(
        "ix_category_budgets_budget_period", "category_budgets", ["budget_period"], unique=False
    )
    op.create_index(
        "ix_category_budgets_category", "category_budgets", ["category"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_category_budgets_category", table_name="category_budgets")
    op.drop_index("ix_category_budgets_budget_period", table_name="category_budgets")
    op.drop_table("category_budgets")
    op.drop_index("ix_budgets_budget_period", table_name="budgets")
    op.drop_table("budgets")