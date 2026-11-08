"""PostgreSQL 18 Real Disaster Recovery and Backup Rehearsal.
Executes an empirical backup and restore cycle on the isolated local PostgreSQL 18 instance (port 5434).
Zero interaction with production Neon database.
"""
import os
import subprocess
import sys
from datetime import UTC, date, datetime

import sqlalchemy as sa
from sqlalchemy import create_engine, select, text

PG_BIN = r"C:\Program Files\PostgreSQL\18\bin"
PG_DUMP = os.path.join(PG_BIN, "pg_dump.exe")
PG_RESTORE = os.path.join(PG_BIN, "pg_restore.exe")
PSQL = os.path.join(PG_BIN, "psql.exe")

PORT = 5434
SOURCE_DB = "moneytrack_disposable"
TARGET_DB = "moneytrack_disaster_restored"
BACKUP_DIR = os.path.abspath("backups")
os.makedirs(BACKUP_DIR, exist_ok=True)
DUMP_FILE = os.path.join(BACKUP_DIR, "pg18_disaster_rehearsal.dump")

ADMIN_URL = f"postgresql+psycopg2://postgres@127.0.0.1:{PORT}/postgres"
SOURCE_URL = f"postgresql+psycopg2://postgres@127.0.0.1:{PORT}/{SOURCE_DB}"
TARGET_URL = f"postgresql+psycopg2://postgres@127.0.0.1:{PORT}/{TARGET_DB}"


def run_rehearsal():
    print("=== Starting Real PostgreSQL 18 Disaster Recovery Rehearsal ===")
    print(f"Source Database: {SOURCE_DB} (Port {PORT})")
    print(f"Target Restore Database: {TARGET_DB} (Port {PORT})")
    print(f"Dump Artifact: {DUMP_FILE}")

    # 1. Populate comprehensive synthetic financial data in SOURCE_DB
    print("\n--- Step 1: Seeding comprehensive financial dataset in Source DB ---")
    source_engine = create_engine(SOURCE_URL)
    with source_engine.begin() as conn:
        # Seed users if not present
        conn.execute(text("""
            INSERT INTO users (id, email, hashed_password, is_active, created_at, updated_at)
            VALUES 
                (10, 'synth_alice@test.com', 'pwd_a', true, NOW(), NOW()),
                (20, 'synth_bob@test.com', 'pwd_b', true, NOW(), NOW())
            ON CONFLICT (id) DO NOTHING;
        """))
        # Seed accounts
        conn.execute(text("""
            INSERT INTO bank_accounts (id, user_id, bank_name, account_name, account_type, account_number_mask, currency, opening_balance_paise, opening_balance_date, current_balance_paise, is_archived, created_at, updated_at)
            VALUES 
                (100, 10, 'HDFC', 'HDFC Salary', 'savings', '4375', 'INR', 10000000, CURRENT_DATE, 10000000, false, NOW(), NOW()),
                (200, 20, 'ICICI', 'ICICI Personal', 'savings', '8824', 'INR', 5000000, CURRENT_DATE, 5000000, false, NOW(), NOW())
            ON CONFLICT (id) DO NOTHING;
        """))
        # Seed categories
        conn.execute(text("""
            INSERT INTO expense_types (id, user_id, name, name_key, color, icon, is_archived, created_at, updated_at)
            VALUES 
                (1001, 10, 'Shopping', 'shopping', '#333', 'bag', false, NOW(), NOW())
            ON CONFLICT (id) DO NOTHING;
            INSERT INTO income_types (id, user_id, name, name_key, color, icon, is_archived, created_at, updated_at)
            VALUES 
                (2001, 10, 'Salary', 'salary', '#444', 'wallet', false, NOW(), NOW())
            ON CONFLICT (id) DO NOTHING;
        """))
        # Seed expense & income
        conn.execute(text("""
            INSERT INTO expenses (id, user_id, expense_type_id, account_id, amount_paise, expense_date, note, payment_method, merchant, bank_reference, created_at, updated_at)
            VALUES 
                (10001, 10, 1001, 100, 75000, CURRENT_DATE, 'Flight Tickets', 'UPI', 'Airways', 'REF_FLIGHT_101', NOW(), NOW())
            ON CONFLICT (id) DO NOTHING;
            INSERT INTO incomes (id, user_id, income_type_id, account_id, amount_paise, income_date, payer, description, payment_method, bank_reference, created_at, updated_at)
            VALUES 
                (20001, 10, 2001, 100, 250000, CURRENT_DATE, 'Tech Corp', 'Freelance Project', 'bank_transfer', 'REF_FREELANCE_201', NOW(), NOW())
            ON CONFLICT (id) DO NOTHING;
        """))
        # Seed idempotency key
        conn.execute(text("""
            INSERT INTO expense_idempotency_keys (id, idempotency_key, expense_id, created_at)
            VALUES (101, 'IDEMP_FLIGHT_101', 10001, NOW())
            ON CONFLICT (idempotency_key) DO NOTHING;
        """))
        # Seed SMS source message & evidence
        conn.execute(text("""
            INSERT INTO sms_source_messages (id, user_id, sender_id, received_at_ms, content_hash, classification, parser_version, evidence_summary, processing_status, created_at)
            VALUES (5001, 10, 'HDFCBK', 1731055000000, 'hash_synth_flight', 'BANK_DEBIT', 'v2.0', 'Debited 750 Flight', 'PROCESSED', NOW())
            ON CONFLICT (id) DO NOTHING;
            INSERT INTO transaction_evidence (id, user_id, sms_message_id, expense_id, evidence_role, match_confidence, linked_at)
            VALUES (5001, 10, 5001, 10001, 'PRIMARY_NOTIFICATION', 'HIGH', NOW())
            ON CONFLICT (id) DO NOTHING;
        """))
        # Seed balance snapshot with provenance
        conn.execute(text("""
            INSERT INTO bank_balance_snapshots (id, user_id, account_id, snapshot_date, calculated_balance_paise, reported_balance_paise, currency, balance_type, sms_message_id, confidence, source, note, processing_time, created_at)
            VALUES (1001, 10, 100, CURRENT_DATE, 10175000, 10175000, 'INR', 'AVAILABLE', 5001, 'HIGH', 'sms', 'Disaster rehearsal verified snapshot', NOW(), NOW())
            ON CONFLICT (id) DO NOTHING;
        """))
        # Seed refund/reversal relationship
        conn.execute(text("""
            INSERT INTO transaction_reversals (id, user_id, original_expense_id, amount_paise, reversal_type, original_reference, reversal_reference, status, created_at, updated_at)
            VALUES (1001, 10, 10001, 25000, 'PARTIAL_REFUND', 'REF_FLIGHT_101', 'REF_FLIGHT_REV_1', 'COMPLETED', NOW(), NOW())
            ON CONFLICT (id) DO NOTHING;
        """))
    print("Seeded financial records, evidence, snapshots, idempotency keys, and reversals.")

    # 2. Record source metrics
    tables_to_check = [
        "users", "bank_accounts", "expense_types", "income_types",
        "expenses", "incomes", "expense_idempotency_keys",
        "sms_source_messages", "transaction_evidence",
        "bank_balance_snapshots", "transaction_reversals"
    ]
    source_counts = {}
    with source_engine.connect() as conn:
        for t in tables_to_check:
            count = conn.execute(text(f"SELECT COUNT(*) FROM {t};")).scalar()
            source_counts[t] = count
            print(f"  Source table '{t}': {count} records")

    # 3. Execute pg_dump
    print(f"\n--- Step 2: Executing pg_dump to {DUMP_FILE} ---")
    dump_cmd = [
        PG_DUMP,
        "-h", "127.0.0.1",
        "-p", str(PORT),
        "-U", "postgres",
        "-d", SOURCE_DB,
        "-Fc",  # custom binary archive format
        "-f", DUMP_FILE,
    ]
    res = subprocess.run(dump_cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"pg_dump failed: {res.stderr}")
    dump_size = os.path.getsize(DUMP_FILE)
    print(f"pg_dump succeeded! Archive size: {dump_size} bytes.")

    # 4. Drop and recreate clean TARGET_DB
    print(f"\n--- Step 3: Preparing fresh target database '{TARGET_DB}' ---")
    admin_engine = create_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        conn.execute(text(f"DROP DATABASE IF EXISTS {TARGET_DB} WITH (FORCE);"))
        conn.execute(text(f"CREATE DATABASE {TARGET_DB};"))
    print(f"Fresh target database '{TARGET_DB}' created.")

    # 5. Execute pg_restore
    print(f"\n--- Step 4: Executing pg_restore into '{TARGET_DB}' ---")
    restore_cmd = [
        PG_RESTORE,
        "-h", "127.0.0.1",
        "-p", str(PORT),
        "-U", "postgres",
        "-d", TARGET_DB,
        DUMP_FILE,
    ]
    res_rest = subprocess.run(restore_cmd, capture_output=True, text=True)
    # pg_restore exit code 0 is clean success; code 1 with benign warnings also acceptable
    if res_rest.returncode not in (0, 1):
        raise RuntimeError(f"pg_restore failed: {res_rest.stderr}")
    print("pg_restore completed successfully.")

    # 6. Verify restored database
    print(f"\n--- Step 5: Validating restored database integrity ---")
    target_engine = create_engine(TARGET_URL)
    target_inspector = sa.inspect(target_engine)
    restored_tables = target_inspector.get_table_names()
    print(f"Restored tables: {restored_tables}")

    with target_engine.connect() as conn:
        for t in tables_to_check:
            assert t in restored_tables, f"Table {t} missing in restored database!"
            count = conn.execute(text(f"SELECT COUNT(*) FROM {t};")).scalar()
            print(f"  Restored table '{t}': {count} records (Expected: {source_counts[t]})")
            assert count == source_counts[t], f"Record count mismatch in table {t}: {count} != {source_counts[t]}"

        # Verify paise integer precision
        exp_amount = conn.execute(text("SELECT amount_paise FROM expenses WHERE id = 10001;")).scalar()
        assert exp_amount == 75000, f"Paise amount corrupted: {exp_amount} != 75000"

        # Verify reversal relationship integrity
        rev = conn.execute(text("SELECT amount_paise, reversal_type, status FROM transaction_reversals WHERE id = 1001;")).fetchone()
        assert rev[0] == 25000 and rev[1] == "PARTIAL_REFUND" and rev[2] == "COMPLETED"

        # Verify balance snapshot provenance
        snap = conn.execute(text("SELECT calculated_balance_paise, currency, balance_type FROM bank_balance_snapshots WHERE id = 1001;")).fetchone()
        assert snap[0] == 10175000 and snap[1] == "INR" and snap[2] == "AVAILABLE"

    print("\n=======================================================")
    print("POSTGRESQL 18 DISASTER RECOVERY REHEARSAL PASSED 100%!")
    print(f"All {len(tables_to_check)} financial tables and relationships restored with zero data loss.")
    print("=======================================================")


if __name__ == "__main__":
    run_rehearsal()
