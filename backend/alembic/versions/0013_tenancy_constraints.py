"""Scope expense_idempotency_keys and user_preferences uniqueness by user_id.

Revision ID: 0013_tenancy_constraints
Revises: 0012_transaction_reversals
Create Date: 2026-11-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013_tenancy_constraints"
down_revision: str | None = "0012_transaction_reversals"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _drop_single_column_uniques(
    table_name: str,
    col_name: str,
    inspector: sa.Inspector,
) -> None:
    """Drop global unique constraints and unique indexes targeting only col_name."""
    uniques = inspector.get_unique_constraints(table_name)
    indexes = inspector.get_indexes(table_name)

    with op.batch_alter_table(table_name) as batch_op:
        for uq in uniques:
            if uq.get("column_names") == [col_name] and uq.get("name"):
                batch_op.drop_constraint(uq["name"], type_="unique")
        for idx in indexes:
            if idx.get("unique") and idx.get("column_names") == [col_name] and idx.get("name"):
                batch_op.drop_index(idx["name"])


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "expense_idempotency_keys" in tables:
        cols = {c["name"] for c in inspector.get_columns("expense_idempotency_keys")}
        if "user_id" not in cols:
            with op.batch_alter_table("expense_idempotency_keys") as batch_op:
                batch_op.add_column(sa.Column("user_id", sa.Integer(), nullable=True))
                batch_op.create_foreign_key(
                    "fk_expense_idempotency_keys_user_id",
                    "users",
                    ["user_id"],
                    ["id"],
                    ondelete="CASCADE",
                )

        # Backfill user_id from linked expense rows where missing
        op.execute(
            sa.text(
                """
                UPDATE expense_idempotency_keys
                SET user_id = (
                    SELECT expenses.user_id
                    FROM expenses
                    WHERE expenses.id = expense_idempotency_keys.expense_id
                )
                WHERE user_id IS NULL
                """
            )
        )

        # Refresh inspector after column alteration
        inspector = sa.inspect(bind)
        _drop_single_column_uniques("expense_idempotency_keys", "idempotency_key", inspector)
        inspector = sa.inspect(bind)

        existing_uq = {
            uq.get("name") for uq in inspector.get_unique_constraints("expense_idempotency_keys")
        }
        existing_idx = {
            idx.get("name") for idx in inspector.get_indexes("expense_idempotency_keys")
        }

        with op.batch_alter_table("expense_idempotency_keys") as batch_op:
            if "ix_expense_idempotency_keys_user_id" not in existing_idx:
                batch_op.create_index("ix_expense_idempotency_keys_user_id", ["user_id"], unique=False)
            if "ix_expense_idempotency_keys_idempotency_key" not in existing_idx:
                batch_op.create_index(
                    "ix_expense_idempotency_keys_idempotency_key",
                    ["idempotency_key"],
                    unique=False,
                )
            if "uq_expense_idempotency_user_key" not in existing_uq:
                batch_op.create_unique_constraint(
                    "uq_expense_idempotency_user_key",
                    ["user_id", "idempotency_key"],
                )

    if "user_preferences" in tables:
        inspector = sa.inspect(bind)
        _drop_single_column_uniques("user_preferences", "key", inspector)
        inspector = sa.inspect(bind)

        existing_uq = {uq.get("name") for uq in inspector.get_unique_constraints("user_preferences")}
        existing_idx = {idx.get("name") for idx in inspector.get_indexes("user_preferences")}

        with op.batch_alter_table("user_preferences") as batch_op:
            if "ix_user_preferences_key" not in existing_idx:
                batch_op.create_index("ix_user_preferences_key", ["key"], unique=False)
            if "uq_user_preferences_user_key" not in existing_uq:
                batch_op.create_unique_constraint(
                    "uq_user_preferences_user_key",
                    ["user_id", "key"],
                )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "user_preferences" in tables:
        existing_uq = {uq.get("name") for uq in inspector.get_unique_constraints("user_preferences")}
        with op.batch_alter_table("user_preferences") as batch_op:
            if "uq_user_preferences_user_key" in existing_uq:
                batch_op.drop_constraint("uq_user_preferences_user_key", type_="unique")
            batch_op.create_unique_constraint("uq_user_preferences_key", ["key"])

    if "expense_idempotency_keys" in tables:
        inspector = sa.inspect(bind)
        existing_uq = {
            uq.get("name") for uq in inspector.get_unique_constraints("expense_idempotency_keys")
        }
        existing_idx = {
            idx.get("name") for idx in inspector.get_indexes("expense_idempotency_keys")
        }
        cols = {c["name"] for c in inspector.get_columns("expense_idempotency_keys")}

        with op.batch_alter_table("expense_idempotency_keys") as batch_op:
            if "uq_expense_idempotency_user_key" in existing_uq:
                batch_op.drop_constraint("uq_expense_idempotency_user_key", type_="unique")
            if "ix_expense_idempotency_keys_user_id" in existing_idx:
                batch_op.drop_index("ix_expense_idempotency_keys_user_id")
            if "user_id" in cols:
                batch_op.drop_column("user_id")
            batch_op.create_unique_constraint("uq_expense_idempotency_key", ["idempotency_key"])
