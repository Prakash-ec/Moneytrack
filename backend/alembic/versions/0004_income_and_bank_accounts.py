"""Income tracking, bank accounts, balance snapshots, and transfers.

Revision ID: 0004_income_and_bank_accounts
Revises: 0003_idempotency_keys
Create Date: 2026-10-31

Safe additive migration that introduces:
1. bank_accounts: Multi-account bank balance tracking with masked suffixes.
2. income_types: Flexible income classification (Salary, Freelance, Interest, etc.).
3. incomes: Income transactions with account linking and idempotency.
4. account_transfers: Internal transfers between user-owned accounts (neutral to net worth).
5. bank_balance_snapshots: Historical balance snapshots and reconciliation audit trail.
6. expenses: Adds optional account_id foreign key for account-linked outflows.
"""
from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0004_income_and_bank_accounts"
down_revision: Union[str, None] = "0003_idempotency_keys"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. bank_accounts
    op.create_table(
        "bank_accounts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bank_name", sa.String(length=100), nullable=False),
        sa.Column("account_name", sa.String(length=100), nullable=False),
        sa.Column("account_type", sa.String(length=30), nullable=False, server_default="savings"),
        sa.Column("account_number_mask", sa.String(length=20), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="INR"),
        sa.Column("opening_balance_paise", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("opening_balance_date", sa.Date(), nullable=False),
        sa.Column("current_balance_paise", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("last_reported_balance_paise", sa.BigInteger(), nullable=True),
        sa.Column("last_reported_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reconciliation_status", sa.String(length=20), nullable=False, server_default="matched"),
        sa.Column("color", sa.String(length=7), nullable=False, server_default="#1D4ED8"),
        sa.Column("icon", sa.String(length=40), nullable=False, server_default="building"),
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_bank_accounts_is_archived"), "bank_accounts", ["is_archived"])

    # 2. income_types
    op.create_table(
        "income_types",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("name_key", sa.String(length=120), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("category", sa.String(length=50), nullable=True),
        sa.Column("icon", sa.String(length=40), nullable=False, server_default="wallet"),
        sa.Column("color", sa.String(length=7), nullable=False, server_default="#10B981"),
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_income_types_name_key"), "income_types", ["name_key"], unique=True)
    op.create_index(op.f("ix_income_types_is_archived"), "income_types", ["is_archived"])

    # 3. incomes
    op.create_table(
        "incomes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("income_type_id", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=True),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("income_date", sa.Date(), nullable=False),
        sa.Column("payer", sa.String(length=120), nullable=True),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("payment_method", sa.String(length=30), nullable=True),
        sa.Column("bank_reference", sa.String(length=100), nullable=True),
        sa.Column("source", sa.String(length=20), nullable=False, server_default="manual"),
        sa.Column("idempotency_key", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("amount_paise > 0", name="ck_incomes_amount_positive"),
        sa.ForeignKeyConstraint(["income_type_id"], ["income_types.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["account_id"], ["bank_accounts.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_incomes_income_date"), "incomes", ["income_date"])
    op.create_index(op.f("ix_incomes_income_type_id"), "incomes", ["income_type_id"])
    op.create_index(op.f("ix_incomes_account_id"), "incomes", ["account_id"])
    op.create_index("ix_incomes_date_id", "incomes", ["income_date", "id"])
    op.create_index("ix_incomes_type_date", "incomes", ["income_type_id", "income_date"])
    op.create_index("ix_incomes_account_date", "incomes", ["account_id", "income_date"])
    op.create_index(op.f("ix_incomes_idempotency_key"), "incomes", ["idempotency_key"], unique=True)

    # 4. account_transfers
    op.create_table(
        "account_transfers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("from_account_id", sa.Integer(), nullable=False),
        sa.Column("to_account_id", sa.Integer(), nullable=False),
        sa.Column("amount_paise", sa.BigInteger(), nullable=False),
        sa.Column("transfer_date", sa.Date(), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("bank_reference", sa.String(length=100), nullable=True),
        sa.Column("idempotency_key", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("amount_paise > 0", name="ck_transfers_amount_positive"),
        sa.CheckConstraint("from_account_id != to_account_id", name="ck_transfers_distinct_accounts"),
        sa.ForeignKeyConstraint(["from_account_id"], ["bank_accounts.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["to_account_id"], ["bank_accounts.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_account_transfers_transfer_date"), "account_transfers", ["transfer_date"])
    op.create_index(op.f("ix_account_transfers_from_account_id"), "account_transfers", ["from_account_id"])
    op.create_index(op.f("ix_account_transfers_to_account_id"), "account_transfers", ["to_account_id"])
    op.create_index(op.f("ix_account_transfers_idempotency_key"), "account_transfers", ["idempotency_key"], unique=True)

    # 5. bank_balance_snapshots
    op.create_table(
        "bank_balance_snapshots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("calculated_balance_paise", sa.BigInteger(), nullable=False),
        sa.Column("reported_balance_paise", sa.BigInteger(), nullable=True),
        sa.Column("source", sa.String(length=30), nullable=False, server_default="calculation"),
        sa.Column("note", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["account_id"], ["bank_accounts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_bank_balance_snapshots_account_id"), "bank_balance_snapshots", ["account_id"])
    op.create_index(op.f("ix_bank_balance_snapshots_snapshot_date"), "bank_balance_snapshots", ["snapshot_date"])
    op.create_index("ix_balance_snapshots_account_date", "bank_balance_snapshots", ["account_id", "snapshot_date"])

    # 6. Add account_id to expenses (safe additive column)
    with op.batch_alter_table("expenses", schema=None) as batch_op:
        batch_op.add_column(sa.Column("account_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_expenses_account_id",
            "bank_accounts",
            ["account_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index("ix_expenses_account_date", ["account_id", "expense_date"])

    # 7. Seed default income types
    now_utc = datetime.now(timezone.utc)
    income_types_table = sa.table(
        "income_types",
        sa.column("name", sa.String),
        sa.column("name_key", sa.String),
        sa.column("category", sa.String),
        sa.column("icon", sa.String),
        sa.column("color", sa.String),
        sa.column("is_archived", sa.Boolean),
        sa.column("created_at", sa.DateTime),
        sa.column("updated_at", sa.DateTime),
    )
    default_income_types = [
        {"name": "Salary", "name_key": "salary", "category": "Earned", "icon": "briefcase", "color": "#10B981"},
        {"name": "Freelance", "name_key": "freelance", "category": "Earned", "icon": "laptop", "color": "#059669"},
        {"name": "Business", "name_key": "business", "category": "Business", "icon": "store", "color": "#2563EB"},
        {"name": "Interest", "name_key": "interest", "category": "Investment", "icon": "percent", "color": "#3B82F6"},
        {"name": "Cashback", "name_key": "cashback", "category": "Rewards", "icon": "gift", "color": "#F59E0B"},
        {"name": "Refund", "name_key": "refund", "category": "Adjustments", "icon": "rotate-ccw", "color": "#6366F1"},
        {"name": "Gift", "name_key": "gift", "category": "Personal", "icon": "heart", "color": "#EC4899"},
        {"name": "Cash Deposit", "name_key": "cash_deposit", "category": "Cash", "icon": "banknote", "color": "#14B8A6"},
        {"name": "Other Income", "name_key": "other_income", "category": "General", "icon": "wallet", "color": "#64748B"},
    ]
    op.bulk_insert(
        income_types_table,
        [
            {
                **item,
                "is_archived": False,
                "created_at": now_utc,
                "updated_at": now_utc,
            }
            for item in default_income_types
        ],
    )


def downgrade() -> None:
    with op.batch_alter_table("expenses", schema=None) as batch_op:
        batch_op.drop_index("ix_expenses_account_date")
        batch_op.drop_constraint("fk_expenses_account_id", type_="foreignkey")
        batch_op.drop_column("account_id")

    op.drop_table("bank_balance_snapshots")
    op.drop_table("account_transfers")
    op.drop_table("incomes")
    op.drop_table("income_types")
    op.drop_table("bank_accounts")
