"""Tenant-aware unique constraints on budgets, category budgets, and types.

Revision ID: 0008_tenant_aware_unique_constraints
Revises: 0007_user_auth_and_tenancy
Create Date: 2026-11-07
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008_tenant_aware_unique_constraints"
down_revision: str | None = "0007_user_auth_and_tenancy"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # -------------------------------------------------------------------------
    # 0. Pre-flight check: ensure no duplicate records violate new constraints
    # -------------------------------------------------------------------------
    if "budgets" in tables:
        dups = bind.execute(sa.text(
            "SELECT user_id, budget_period, COUNT(*) FROM budgets "
            "GROUP BY user_id, budget_period HAVING COUNT(*) > 1"
        )).fetchall()
        if dups:
            raise RuntimeError(
                f"Migration 0008 blocked: duplicate budget records found for (user_id, budget_period): {dups}"
            )

    if "category_budgets" in tables:
        dups = bind.execute(sa.text(
            "SELECT user_id, budget_period, category, COUNT(*) FROM category_budgets "
            "GROUP BY user_id, budget_period, category HAVING COUNT(*) > 1"
        )).fetchall()
        if dups:
            raise RuntimeError(
                f"Migration 0008 blocked: duplicate category_budget records found: {dups}"
            )

    if "expense_types" in tables:
        dups_sys = bind.execute(sa.text(
            "SELECT name_key, COUNT(*) FROM expense_types WHERE user_id IS NULL "
            "GROUP BY name_key HAVING COUNT(*) > 1"
        )).fetchall()
        if dups_sys:
            raise RuntimeError(
                f"Migration 0008 blocked: duplicate system expense types found for name_key: {dups_sys}"
            )
        dups_usr = bind.execute(sa.text(
            "SELECT user_id, name_key, COUNT(*) FROM expense_types WHERE user_id IS NOT NULL "
            "GROUP BY user_id, name_key HAVING COUNT(*) > 1"
        )).fetchall()
        if dups_usr:
            raise RuntimeError(
                f"Migration 0008 blocked: duplicate user expense types found: {dups_usr}"
            )

    if "income_types" in tables:
        dups_sys = bind.execute(sa.text(
            "SELECT name_key, COUNT(*) FROM income_types WHERE user_id IS NULL "
            "GROUP BY name_key HAVING COUNT(*) > 1"
        )).fetchall()
        if dups_sys:
            raise RuntimeError(
                f"Migration 0008 blocked: duplicate system income types found for name_key: {dups_sys}"
            )
        dups_usr = bind.execute(sa.text(
            "SELECT user_id, name_key, COUNT(*) FROM income_types WHERE user_id IS NOT NULL "
            "GROUP BY user_id, name_key HAVING COUNT(*) > 1"
        )).fetchall()
        if dups_usr:
            raise RuntimeError(
                f"Migration 0008 blocked: duplicate user income types found: {dups_usr}"
            )

    # -------------------------------------------------------------------------
    # 1. Budgets: Replace global uniqueness on budget_period with (user_id, budget_period)
    # -------------------------------------------------------------------------
    if "budgets" in tables:
        existing_constraints = [c["name"] for c in inspector.get_unique_constraints("budgets")]
        if "uq_budgets_one_per_period" in existing_constraints:
            if dialect == "sqlite":
                with op.batch_alter_table("budgets") as batch_op:
                    batch_op.drop_constraint("uq_budgets_one_per_period", type_="unique")
            else:
                op.drop_constraint("uq_budgets_one_per_period", "budgets", type_="unique")
        if "uq_budgets_user_period" not in existing_constraints:
            if dialect == "sqlite":
                with op.batch_alter_table("budgets") as batch_op:
                    batch_op.create_unique_constraint("uq_budgets_user_period", ["user_id", "budget_period"])
            else:
                op.create_unique_constraint("uq_budgets_user_period", "budgets", ["user_id", "budget_period"])

    # -------------------------------------------------------------------------
    # 2. Category Budgets: Replace global with (user_id, budget_period, category)
    # -------------------------------------------------------------------------
    if "category_budgets" in tables:
        existing_constraints = [c["name"] for c in inspector.get_unique_constraints("category_budgets")]
        if "uq_category_budgets_one_per_period_category" in existing_constraints:
            if dialect == "sqlite":
                with op.batch_alter_table("category_budgets") as batch_op:
                    batch_op.drop_constraint("uq_category_budgets_one_per_period_category", type_="unique")
            else:
                op.drop_constraint("uq_category_budgets_one_per_period_category", "category_budgets", type_="unique")
        if "uq_category_budgets_user_period_category" not in existing_constraints:
            if dialect == "sqlite":
                with op.batch_alter_table("category_budgets") as batch_op:
                    batch_op.create_unique_constraint(
                        "uq_category_budgets_user_period_category",
                        ["user_id", "budget_period", "category"]
                    )
            else:
                op.create_unique_constraint(
                    "uq_category_budgets_user_period_category",
                    "category_budgets",
                    ["user_id", "budget_period", "category"]
                )

    # -------------------------------------------------------------------------
    # 3. Expense Types: Partial unique indexes for system vs user categories
    # -------------------------------------------------------------------------
    if "expense_types" in tables:
        # Drop old global unique index
        existing_indices = [idx["name"] for idx in inspector.get_indexes("expense_types")]
        if "ix_expense_types_name_key" in existing_indices:
            op.drop_index("ix_expense_types_name_key", table_name="expense_types")

        # Create system partial index (user_id IS NULL)
        if "ix_expense_types_system_name_key" not in existing_indices:
            op.create_index(
                "ix_expense_types_system_name_key",
                "expense_types",
                ["name_key"],
                unique=True,
                postgresql_where=sa.text("user_id IS NULL"),
                sqlite_where=sa.text("user_id IS NULL"),
            )
        # Create user partial index (user_id IS NOT NULL)
        if "ix_expense_types_user_name_key" not in existing_indices:
            op.create_index(
                "ix_expense_types_user_name_key",
                "expense_types",
                ["user_id", "name_key"],
                unique=True,
                postgresql_where=sa.text("user_id IS NOT NULL"),
                sqlite_where=sa.text("user_id IS NOT NULL"),
            )
        # Non-unique index on name_key for general queries
        if "ix_expense_types_name_key" not in existing_indices:
            op.create_index(
                "ix_expense_types_name_key",
                "expense_types",
                ["name_key"],
                unique=False,
            )

    # -------------------------------------------------------------------------
    # 4. Income Types: Partial unique indexes for system vs user categories
    # -------------------------------------------------------------------------
    if "income_types" in tables:
        existing_indices = [idx["name"] for idx in inspector.get_indexes("income_types")]
        if "ix_income_types_name_key" in existing_indices:
            op.drop_index("ix_income_types_name_key", table_name="income_types")

        if "ix_income_types_system_name_key" not in existing_indices:
            op.create_index(
                "ix_income_types_system_name_key",
                "income_types",
                ["name_key"],
                unique=True,
                postgresql_where=sa.text("user_id IS NULL"),
                sqlite_where=sa.text("user_id IS NULL"),
            )
        if "ix_income_types_user_name_key" not in existing_indices:
            op.create_index(
                "ix_income_types_user_name_key",
                "income_types",
                ["user_id", "name_key"],
                unique=True,
                postgresql_where=sa.text("user_id IS NOT NULL"),
                sqlite_where=sa.text("user_id IS NOT NULL"),
            )
        if "ix_income_types_name_key" not in existing_indices:
            op.create_index(
                "ix_income_types_name_key",
                "income_types",
                ["name_key"],
                unique=False,
            )


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # Revert income types indexes
    if "income_types" in tables:
        existing_indices = [idx["name"] for idx in inspector.get_indexes("income_types")]
        if "ix_income_types_user_name_key" in existing_indices:
            op.drop_index("ix_income_types_user_name_key", table_name="income_types")
        if "ix_income_types_system_name_key" in existing_indices:
            op.drop_index("ix_income_types_system_name_key", table_name="income_types")
        if "ix_income_types_name_key" in existing_indices:
            op.drop_index("ix_income_types_name_key", table_name="income_types")
        op.create_index("ix_income_types_name_key", "income_types", ["name_key"], unique=True)

    # Revert expense types indexes
    if "expense_types" in tables:
        existing_indices = [idx["name"] for idx in inspector.get_indexes("expense_types")]
        if "ix_expense_types_user_name_key" in existing_indices:
            op.drop_index("ix_expense_types_user_name_key", table_name="expense_types")
        if "ix_expense_types_system_name_key" in existing_indices:
            op.drop_index("ix_expense_types_system_name_key", table_name="expense_types")
        if "ix_expense_types_name_key" in existing_indices:
            op.drop_index("ix_expense_types_name_key", table_name="expense_types")
        op.create_index("ix_expense_types_name_key", "expense_types", ["name_key"], unique=True)

    # Revert category budgets constraint
    if "category_budgets" in tables:
        existing_constraints = [c["name"] for c in inspector.get_unique_constraints("category_budgets")]
        if "uq_category_budgets_user_period_category" in existing_constraints:
            if dialect == "sqlite":
                with op.batch_alter_table("category_budgets") as batch_op:
                    batch_op.drop_constraint("uq_category_budgets_user_period_category", type_="unique")
            else:
                op.drop_constraint("uq_category_budgets_user_period_category", "category_budgets", type_="unique")
        if "uq_category_budgets_one_per_period_category" not in existing_constraints:
            if dialect == "sqlite":
                with op.batch_alter_table("category_budgets") as batch_op:
                    batch_op.create_unique_constraint(
                        "uq_category_budgets_one_per_period_category",
                        ["budget_period", "category"]
                    )
            else:
                op.create_unique_constraint(
                    "uq_category_budgets_one_per_period_category",
                    "category_budgets",
                    ["budget_period", "category"]
                )

    # Revert budgets constraint
    if "budgets" in tables:
        existing_constraints = [c["name"] for c in inspector.get_unique_constraints("budgets")]
        if "uq_budgets_user_period" in existing_constraints:
            if dialect == "sqlite":
                with op.batch_alter_table("budgets") as batch_op:
                    batch_op.drop_constraint("uq_budgets_user_period", type_="unique")
            else:
                op.drop_constraint("uq_budgets_user_period", "budgets", type_="unique")
        if "uq_budgets_one_per_period" not in existing_constraints:
            if dialect == "sqlite":
                with op.batch_alter_table("budgets") as batch_op:
                    batch_op.create_unique_constraint("uq_budgets_one_per_period", ["budget_period"])
            else:
                op.create_unique_constraint("uq_budgets_one_per_period", "budgets", ["budget_period"])
