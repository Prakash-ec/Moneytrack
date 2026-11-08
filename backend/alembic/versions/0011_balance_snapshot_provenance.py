"""Balance snapshot provenance, ordering, and audit trail.

Revision ID: 0011_balance_snapshot_provenance
Revises: 0010_tenant_evidence_fk
Create Date: 2026-11-08
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011_balance_snapshot_provenance"
down_revision: str | None = "0010_tenant_evidence_fk"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "bank_balance_snapshots" in tables:
        columns = [c["name"] for c in inspector.get_columns("bank_balance_snapshots")]
        with op.batch_alter_table("bank_balance_snapshots") as batch_op:
            if "currency" not in columns:
                batch_op.add_column(sa.Column("currency", sa.String(length=3), nullable=False, server_default="INR"))
            if "balance_type" not in columns:
                batch_op.add_column(sa.Column("balance_type", sa.String(length=20), nullable=False, server_default="AVAILABLE"))
            if "sms_message_id" not in columns:
                batch_op.add_column(sa.Column("sms_message_id", sa.Integer(), nullable=True))
                batch_op.create_foreign_key(
                    "fk_snapshots_sms_message_id",
                    "sms_source_messages",
                    ["sms_message_id"],
                    ["id"],
                    ondelete="SET NULL",
                )
            if "transaction_time" not in columns:
                batch_op.add_column(sa.Column("transaction_time", sa.DateTime(timezone=True), nullable=True))
            if "message_reception_time" not in columns:
                batch_op.add_column(sa.Column("message_reception_time", sa.DateTime(timezone=True), nullable=True))
            if "processing_time" not in columns:
                batch_op.add_column(sa.Column("processing_time", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
            if "confidence" not in columns:
                batch_op.add_column(sa.Column("confidence", sa.String(length=20), nullable=False, server_default="HIGH"))
            if "source_evidence" not in columns:
                batch_op.add_column(sa.Column("source_evidence", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "bank_balance_snapshots" in tables:
        with op.batch_alter_table("bank_balance_snapshots") as batch_op:
            batch_op.drop_column("source_evidence")
            batch_op.drop_column("confidence")
            batch_op.drop_column("processing_time")
            batch_op.drop_column("message_reception_time")
            batch_op.drop_column("transaction_time")
            batch_op.drop_constraint("fk_snapshots_sms_message_id", type_="foreignkey")
            batch_op.drop_column("sms_message_id")
            batch_op.drop_column("balance_type")
            batch_op.drop_column("currency")
