"""Synchronize indexes, unique constraints, and seed default expense types.

Revision ID: 0006_schema_sync_and_indexes
Revises: 0005_security_and_notifications
Create Date: 2026-11-01
"""
from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0006_schema_sync_and_indexes"
down_revision: Union[str, None] = "0005_security_and_notifications"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    def has_index(table_name: str, index_name: str) -> bool:
        indexes = inspector.get_indexes(table_name)
        return any(idx.get("name") == index_name for idx in indexes)

    if not has_index("account_transfers", "ix_transfers_date"):
        op.create_index("ix_transfers_date", "account_transfers", ["transfer_date"], unique=False)

    if not has_index("budgets", "ix_budgets_period"):
        op.create_index("ix_budgets_period", "budgets", ["budget_period"], unique=False)

    if not has_index("category_budgets", "ix_category_budgets_period_category"):
        op.create_index(
            "ix_category_budgets_period_category",
            "category_budgets",
            ["budget_period", "category"],
            unique=False,
        )

    if not has_index("expenses", "ix_expenses_account_id"):
        op.create_index("ix_expenses_account_id", "expenses", ["account_id"], unique=False)

    if not has_index("notification_logs", "ix_notification_logs_created_at"):
        op.create_index(
            "ix_notification_logs_created_at",
            "notification_logs",
            ["created_at"],
            unique=False,
        )

    # Re-create ix_user_preferences_key with unique=True
    user_pref_indexes = inspector.get_indexes("user_preferences")
    pref_idx = next((i for i in user_pref_indexes if i.get("name") == "ix_user_preferences_key"), None)
    if pref_idx and not pref_idx.get("unique"):
        op.drop_index("ix_user_preferences_key", table_name="user_preferences")
        op.create_index("ix_user_preferences_key", "user_preferences", ["key"], unique=True)
    elif not pref_idx:
        op.create_index("ix_user_preferences_key", "user_preferences", ["key"], unique=True)

    # Seed default expense types ONLY if expense_types table is currently empty
    count_res = bind.execute(sa.text("SELECT count(*) FROM expense_types")).scalar()
    if count_res == 0:
        now_utc = datetime.now(timezone.utc)
        expense_types_table = sa.table(
            "expense_types",
            sa.column("name", sa.String),
            sa.column("name_key", sa.String),
            sa.column("category", sa.String),
            sa.column("icon", sa.String),
            sa.column("color", sa.String),
            sa.column("is_archived", sa.Boolean),
            sa.column("created_at", sa.DateTime),
            sa.column("updated_at", sa.DateTime),
        )
        default_types = [
            {"name": "Food & Dining", "name_key": "food & dining", "category": "Food", "icon": "utensils", "color": "#0F766E"},
            {"name": "Groceries", "name_key": "groceries", "category": "Food", "icon": "shopping-cart", "color": "#10B981"},
            {"name": "Transportation", "name_key": "transportation", "category": "Travel", "icon": "bus", "color": "#4F46E5"},
            {"name": "Fuel", "name_key": "fuel", "category": "Travel", "icon": "fuel", "color": "#D97706"},
            {"name": "Utilities", "name_key": "utilities", "category": "Utilities", "icon": "zap", "color": "#DC2626"},
            {"name": "Mobile Recharge", "name_key": "mobile recharge", "category": "Other", "icon": "smartphone", "color": "#0284C7"},
            {"name": "Shopping", "name_key": "shopping", "category": "Shopping", "icon": "shopping-bag", "color": "#EA580C"},
            {"name": "Medical", "name_key": "medical", "category": "Health", "icon": "heart", "color": "#E11D48"},
            {"name": "Entertainment", "name_key": "entertainment", "category": "Entertainment", "icon": "film", "color": "#7C3AED"},
            {"name": "Rent & Maintenance", "name_key": "rent & maintenance", "category": "Housing", "icon": "home", "color": "#6366F1"},
            {"name": "Education", "name_key": "education", "category": "Education", "icon": "book-open", "color": "#2563EB"},
            {"name": "Other", "name_key": "other", "category": "Other", "icon": "tag", "color": "#64748B"},
        ]
        op.bulk_insert(
            expense_types_table,
            [
                {
                    **item,
                    "is_archived": False,
                    "created_at": now_utc,
                    "updated_at": now_utc,
                }
                for item in default_types
            ],
        )
        if bind.dialect.name == "postgresql":
            bind.execute(
                sa.text(
                    "SELECT setval(pg_get_serial_sequence('expense_types', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM expense_types;"
                )
            )


def downgrade() -> None:
    pass
