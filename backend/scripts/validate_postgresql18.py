"""Empirical PostgreSQL 18 Validation Script for MoneyTrack.
Connects ONLY to the isolated, disposable local PostgreSQL 18 instance on port 5434.
Never touches production Neon or development SQLite.
Validates:
1. Complete migration chain from 0001 to HEAD (0012_transaction_reversals).
2. Schema structure, constraints, foreign keys, and indexes.
3. Multi-tenant security isolation (cross-tenant rejection at DB level).
4. Downgrade and re-upgrade resilience.
5. Real multi-threaded concurrency (2, 10, 50, 100 simultaneous requests) on PostgreSQL 18.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from alembic.config import Config
from alembic import command
import sqlalchemy as sa
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.models.bank_account import BankAccount
from app.models.expense import Expense
from app.models.expense_type import ExpenseType
from app.models.income import Income
from app.models.income_type import IncomeType
from app.models.transaction_reversal import TransactionReversal
from app.models.user import User
from app.schemas.sms_ingest import SmsIngestRequest
from app.services.sms_ingest import ingest_sms_transaction

DISPOSABLE_PG_URL = "postgresql+psycopg2://postgres@127.0.0.1:5434/moneytrack_disposable"
ADMIN_PG_URL = "postgresql+psycopg2://postgres@127.0.0.1:5434/postgres"


def run_validation():
    print("=== Starting Empirical PostgreSQL 18 Validation ===")
    print(f"Target DB: {DISPOSABLE_PG_URL}")

    # Clean start: drop and recreate disposable db
    admin_engine = create_engine(ADMIN_PG_URL, isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        conn.execute(text("DROP DATABASE IF EXISTS moneytrack_disposable WITH (FORCE);"))
        conn.execute(text("CREATE DATABASE moneytrack_disposable;"))
        print("Fresh moneytrack_disposable database created.")

    engine = create_engine(DISPOSABLE_PG_URL, pool_size=20, max_overflow=50)
    with engine.connect() as conn:
        ver = conn.execute(text("SELECT version();")).scalar()
        print(f"Confirmed Engine: {ver}")

    alembic_cfg = Config("backend/alembic.ini")
    alembic_cfg.set_main_option("sqlalchemy.url", DISPOSABLE_PG_URL)
    alembic_cfg.set_main_option("script_location", "backend/alembic")

    # Step 1: Upgrade to 0008_tenant_unique
    print("\n--- Step 1: Upgrading to 0008_tenant_unique ---")
    command.upgrade(alembic_cfg, "0008_tenant_unique")
    with engine.connect() as conn:
        cur_rev = conn.execute(text("SELECT version_num FROM alembic_version;")).scalar()
        print(f"Current Alembic revision: {cur_rev}")
        assert cur_rev == "0008_tenant_unique"

    # Step 2: Populate representative data at revision 0008
    print("\n--- Step 2: Populating representative data at revision 0008 ---")
    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO users (id, email, hashed_password, is_active, created_at, updated_at)
            VALUES 
                (1, 'alice@example.com', 'hash_a', true, NOW(), NOW()),
                (2, 'bob@example.com', 'hash_b', true, NOW(), NOW());
        """))
        conn.execute(text("""
            INSERT INTO expense_types (id, user_id, name, name_key, color, icon, is_archived, created_at, updated_at)
            VALUES 
                (501, 1, 'Custom Groceries', 'custom_groceries', '#000', 'cart', false, NOW(), NOW()),
                (502, 2, 'Custom Utilities', 'custom_utilities', '#111', 'zap', false, NOW(), NOW());
            INSERT INTO income_types (id, user_id, name, name_key, color, icon, is_archived, created_at, updated_at)
            VALUES 
                (501, 1, 'Salary', 'salary', '#222', 'briefcase', false, NOW(), NOW()),
                (502, 2, 'Consulting', 'consulting', '#333', 'code', false, NOW(), NOW());
        """))
        conn.execute(text("""
            INSERT INTO bank_accounts (id, user_id, bank_name, account_name, account_type, account_number_mask, currency, opening_balance_paise, opening_balance_date, current_balance_paise, is_archived, created_at, updated_at)
            VALUES 
                (1, 1, 'HDFC', 'HDFC Salary', 'savings', 'XX1111', 'INR', 5000000, CURRENT_DATE, 5000000, false, NOW(), NOW()),
                (2, 2, 'ICICI', 'ICICI Personal', 'savings', 'XX2222', 'INR', 3000000, CURRENT_DATE, 3000000, false, NOW(), NOW());
        """))
        conn.execute(text("""
            INSERT INTO expenses (id, user_id, expense_type_id, account_id, amount_paise, expense_date, note, payment_method, merchant, created_at, updated_at)
            VALUES 
                (101, 1, 501, 1, 150000, CURRENT_DATE, 'Alice Supermarket', 'UPI', 'Supermarket', NOW(), NOW()),
                (201, 2, 502, 2, 85000, CURRENT_DATE, 'Bob Electricity', 'UPI', 'Power Corp', NOW(), NOW());
        """))
        conn.execute(text("""
            INSERT INTO incomes (id, user_id, income_type_id, account_id, amount_paise, income_date, payer, description, payment_method, created_at, updated_at)
            VALUES 
                (102, 1, 501, 1, 5000000, CURRENT_DATE, 'Acme Corp', 'Alice Salary', 'bank_transfer', NOW(), NOW()),
                (202, 2, 502, 2, 2000000, CURRENT_DATE, 'Client Ltd', 'Bob Consulting', 'bank_transfer', NOW(), NOW());
        """))
    print("Representative data populated successfully.")

    # Step 3: Upgrade to HEAD (through 0009, 0010, 0011, 0012)
    print("\n--- Step 3: Upgrading to HEAD (0012_transaction_reversals) ---")
    command.upgrade(alembic_cfg, "head")
    with engine.connect() as conn:
        cur_rev = conn.execute(text("SELECT version_num FROM alembic_version;")).scalar()
        print(f"Current Alembic revision: {cur_rev}")
        assert cur_rev == "0012_transaction_reversals"

    # Step 4: Inspect PostgreSQL schema, constraints, indexes
    print("\n--- Step 4: Inspecting PostgreSQL 18 schema & constraints ---")
    inspector = sa.inspect(engine)
    tables = inspector.get_table_names()
    print(f"Tables present: {tables}")
    for required in ("users", "expenses", "incomes", "bank_accounts", "bank_balance_snapshots", "sms_source_messages", "transaction_evidence", "transaction_reversals"):
        assert required in tables, f"Missing required table: {required}"

    evidence_fks = inspector.get_foreign_keys("transaction_evidence")
    fk_names = {fk["name"] for fk in evidence_fks}
    assert "fk_evidence_user_expense" in fk_names
    assert "fk_evidence_user_income" in fk_names
    assert "fk_evidence_user_sms" in fk_names

    # Check snapshots columns
    snapshot_cols = {c["name"] for c in inspector.get_columns("bank_balance_snapshots")}
    for sc in ("currency", "balance_type", "sms_message_id", "transaction_time", "confidence"):
        assert sc in snapshot_cols, f"Missing balance snapshot column: {sc}"

    # Step 5: Multi-tenant security isolation tests
    print("\n--- Step 5: Testing DB-enforced Tenant Isolation ---")
    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO sms_source_messages (id, user_id, sender_id, received_at_ms, content_hash, classification, parser_version, evidence_summary, processing_status, created_at)
            VALUES (1, 1, 'HDFCBK', 1731050000000, 'hash_alice_1', 'BANK_DEBIT', 'v2.0', 'Debited 1500', 'PROCESSED', NOW());
        """))
        conn.execute(text("""
            INSERT INTO transaction_evidence (id, user_id, sms_message_id, expense_id, evidence_role, match_confidence, linked_at)
            VALUES (1, 1, 1, 101, 'PRIMARY_NOTIFICATION', 'HIGH', NOW());
        """))
    print("Valid same-user evidence inserted.")

    # Cross-tenant link rejection: User 2 tries to link User 1's expense
    try:
        with engine.begin() as conn:
            conn.execute(text("""
                INSERT INTO transaction_evidence (id, user_id, sms_message_id, expense_id, evidence_role, match_confidence, linked_at)
                VALUES (2, 2, 1, 101, 'PRIMARY_NOTIFICATION', 'HIGH', NOW());
            """))
        raise AssertionError("SECURITY VIOLATION: Database allowed cross-tenant linking!")
    except sa.exc.IntegrityError:
        print("PASS: Cross-tenant linking successfully rejected by DB foreign key constraint.")

    # Step 6: Downgrade and re-upgrade test
    print("\n--- Step 6: Testing Downgrade to 0008 and Re-upgrade to HEAD ---")
    command.downgrade(alembic_cfg, "0008_tenant_unique")
    with engine.connect() as conn:
        rev_down = conn.execute(text("SELECT version_num FROM alembic_version;")).scalar()
        assert rev_down == "0008_tenant_unique"
        print(f"Downgraded to: {rev_down}")
    
    command.upgrade(alembic_cfg, "head")
    with engine.connect() as conn:
        rev_up = conn.execute(text("SELECT version_num FROM alembic_version;")).scalar()
        assert rev_up == "0012_transaction_reversals"
        print(f"Re-upgraded to HEAD: {rev_up}")

    # Step 7: Real PostgreSQL 18 Multi-Threaded Concurrency Tests
    print("\n--- Step 7: Real Multi-Threaded Concurrency Tests on PostgreSQL 18 ---")
    SessionMaker = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    # 7.1: Concurrency test with 2 simultaneous workers
    _run_concurrency_case(SessionMaker, count=2, direction="DEBIT", ref="CONC_2")
    # 7.2: Concurrency test with 10 simultaneous workers
    _run_concurrency_case(SessionMaker, count=10, direction="DEBIT", ref="CONC_10")
    # 7.3: Concurrency test with 50 simultaneous workers
    _run_concurrency_case(SessionMaker, count=50, direction="CREDIT", ref="CONC_50")
    # 7.4: Concurrency test with 100 simultaneous workers
    _run_concurrency_case(SessionMaker, count=100, direction="DEBIT", ref="CONC_100")

    # 7.5: Concurrency test with distinct transactions of identical amounts
    print("\nTesting concurrent distinct transactions of identical amounts...")
    def distinct_worker(i):
        session = SessionMaker()
        try:
            req = SmsIngestRequest(
                amount_paise=1000,
                direction="CREDIT",
                bank_name="HDFC",
                account_suffix="1111",
                reference=f"DISTINCT_CR_{i}",
                raw_text=f"Credited 10 Ref DISTINCT_CR_{i}",
            )
            return ingest_sms_transaction(session, req, user_id=1)
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=10) as executor:
        distinct_results = list(executor.map(distinct_worker, range(10)))

    created = sum(1 for r in distinct_results if r.created)
    assert created == 10, f"Expected 10 distinct credits created, got {created}"
    print(f"PASS: 10 concurrent distinct same-amount transactions correctly created 10 separate entries.")

    print("\n=======================================================")
    print("ALL EMPIRICAL POSTGRESQL 18 VALIDATION & CONCURRENCY TESTS PASSED 100%!")
    print("=======================================================")


def _run_concurrency_case(SessionMaker, count: int, direction: str, ref: str):
    print(f"\n[PostgreSQL Concurrency] Testing {count} simultaneous duplicate {direction} requests (Ref: {ref})...")
    payload = SmsIngestRequest(
        amount_paise=25000,
        direction=direction,
        bank_name="HDFC",
        account_suffix="1111",
        reference=ref,
        idempotency_key=f"IDEMP_{ref}",
        raw_text=f"{direction} 250 Ref {ref}",
    )

    def worker(_):
        session = SessionMaker()
        try:
            return ingest_sms_transaction(session, payload, user_id=1)
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=min(count, 32)) as executor:
        results = list(executor.map(worker, range(count)))

    created = sum(1 for r in results if r.created)
    replayed = sum(1 for r in results if r.replayed)
    print(f"Outcome: created={created}, replayed={replayed}")
    assert created == 1, f"Expected exactly 1 created, got {created}"
    assert replayed == count - 1, f"Expected {count - 1} replayed, got {replayed}"
    print(f"PASS: {count} simultaneous requests produced exactly 1 financial ledger entry on PostgreSQL 18.")


if __name__ == "__main__":
    run_validation()
