"""Database-enforced tenant evidence architecture with composite foreign keys.

Revision ID: 0010_tenant_evidence_fk
Revises: 0009_sms_evidence_architecture
Create Date: 2026-11-08
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010_tenant_evidence_fk"
down_revision: str | None = "0009_sms_evidence_architecture"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # 1. Add composite unique constraint to expenses(user_id, id) if not present
    if "expenses" in tables:
        expense_uqs = [u.get("name") for u in inspector.get_unique_constraints("expenses")]
        if "uq_expenses_user_id" not in expense_uqs:
            with op.batch_alter_table("expenses") as batch_op:
                batch_op.create_unique_constraint(
                    "uq_expenses_user_id",
                    ["user_id", "id"],
                )

    # 2. Add composite unique constraint to incomes(user_id, id) if not present
    if "incomes" in tables:
        income_uqs = [u.get("name") for u in inspector.get_unique_constraints("incomes")]
        if "uq_incomes_user_id" not in income_uqs:
            with op.batch_alter_table("incomes") as batch_op:
                batch_op.create_unique_constraint(
                    "uq_incomes_user_id",
                    ["user_id", "id"],
                )

    # 3. Add composite unique constraint to sms_source_messages(user_id, id) if not present
    if "sms_source_messages" in tables:
        sms_uqs = [u.get("name") for u in inspector.get_unique_constraints("sms_source_messages")]
        if "uq_sms_source_messages_user_id" not in sms_uqs:
            with op.batch_alter_table("sms_source_messages") as batch_op:
                batch_op.create_unique_constraint(
                    "uq_sms_source_messages_user_id",
                    ["user_id", "id"],
                )

    # 4. Enforce composite foreign keys in transaction_evidence if not present
    if "transaction_evidence" in tables:
        evidence_fks = [fk.get("name") for fk in inspector.get_foreign_keys("transaction_evidence")]
        with op.batch_alter_table("transaction_evidence") as batch_op:
            if "fk_evidence_user_expense" not in evidence_fks:
                batch_op.create_foreign_key(
                    "fk_evidence_user_expense",
                    "expenses",
                    ["user_id", "expense_id"],
                    ["user_id", "id"],
                    ondelete="CASCADE",
                )
            if "fk_evidence_user_income" not in evidence_fks:
                batch_op.create_foreign_key(
                    "fk_evidence_user_income",
                    "incomes",
                    ["user_id", "income_id"],
                    ["user_id", "id"],
                    ondelete="CASCADE",
                )
            if "fk_evidence_user_sms" not in evidence_fks:
                batch_op.create_foreign_key(
                    "fk_evidence_user_sms",
                    "sms_source_messages",
                    ["user_id", "sms_message_id"],
                    ["user_id", "id"],
                    ondelete="CASCADE",
                )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "transaction_evidence" in tables:
        with op.batch_alter_table("transaction_evidence") as batch_op:
            batch_op.drop_constraint("fk_evidence_user_sms", type_="foreignkey")
            batch_op.drop_constraint("fk_evidence_user_income", type_="foreignkey")
            batch_op.drop_constraint("fk_evidence_user_expense", type_="foreignkey")

    if "sms_source_messages" in tables:
        with op.batch_alter_table("sms_source_messages") as batch_op:
            batch_op.drop_constraint("uq_sms_source_messages_user_id", type_="unique")

    if "incomes" in tables:
        with op.batch_alter_table("incomes") as batch_op:
            batch_op.drop_constraint("uq_incomes_user_id", type_="unique")

    if "expenses" in tables:
        with op.batch_alter_table("expenses") as batch_op:
            batch_op.drop_constraint("uq_expenses_user_id", type_="unique")
