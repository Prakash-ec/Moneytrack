"""Add users table and user tenancy columns across all financial models.

Revision ID: 0007_user_auth_and_tenancy
Revises: 0006_schema_sync_and_indexes
Create Date: 2026-11-06
"""
from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0007_user_auth_and_tenancy"
down_revision: Union[str, None] = "0006_schema_sync_and_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # 1. Create users table if not exists
    if "users" not in tables:
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("email", sa.String(length=255), nullable=False),
            sa.Column("hashed_password", sa.String(length=255), nullable=False),
            sa.Column("full_name", sa.String(length=255), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
            sa.Column("is_superuser", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_users_email", "users", ["email"], unique=True)

    # 2. Add user_id column to existing tables if missing
    tenancy_tables = [
        "expenses",
        "expense_types",
        "bank_accounts",
        "incomes",
        "income_types",
        "account_transfers",
        "budgets",
        "category_budgets",
        "bank_balance_snapshots",
        "security_alerts",
        "notification_logs",
        "user_preferences",
    ]

    for table in tenancy_tables:
        if table in tables:
            columns = [c["name"] for c in inspector.get_columns(table)]
            if "user_id" not in columns:
                if bind.dialect.name == "sqlite":
                    op.execute(
                        sa.text(
                            f"ALTER TABLE {table} ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE"
                        )
                    )
                    op.execute(
                        sa.text(
                            f"CREATE INDEX IF NOT EXISTS ix_{table}_user_id ON {table} (user_id)"
                        )
                    )
                else:
                    op.add_column(
                        table,
                        sa.Column(
                            "user_id",
                            sa.Integer(),
                            sa.ForeignKey("users.id", name=f"fk_{table}_user_id", ondelete="CASCADE"),
                            nullable=True,
                        ),
                    )
                    op.create_index(f"ix_{table}_user_id", table, ["user_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    tenancy_tables = [
        "expenses",
        "expense_types",
        "bank_accounts",
        "incomes",
        "income_types",
        "account_transfers",
        "budgets",
        "category_budgets",
        "bank_balance_snapshots",
        "security_alerts",
        "notification_logs",
        "user_preferences",
    ]

    if bind.dialect.name != "sqlite":
        for table in tenancy_tables:
            if table in tables:
                columns = [c["name"] for c in inspector.get_columns(table)]
                if "user_id" in columns:
                    op.drop_index(f"ix_{table}_user_id", table_name=table)
                    op.drop_column(table, "user_id")

    if "users" in tables:
        op.drop_table("users")
