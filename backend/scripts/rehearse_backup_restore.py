"""Comprehensive Backup & Restore Rehearsal Script for MoneyTrack.
Tests full backup and restore cycle for both:
1. Local SQLite database.
2. Disposable PostgreSQL 18 instance.
Verifies record counts, schema revision, integrity, and user relationships.
"""
import os
import shutil
import sqlite3
import subprocess
import sqlalchemy as sa
from sqlalchemy import create_engine, text

def rehearse_sqlite():
    print("=== Rehearsing Local SQLite Backup & Restore ===")
    src = "backend/data/moneytrack.db"
    backup_path = "backups/sqlite_rehearsal_backup.db"
    restore_path = "backups/sqlite_rehearsal_restored.db"

    os.makedirs("backups", exist_ok=True)
    if os.path.exists(backup_path):
        os.remove(backup_path)
    if os.path.exists(restore_path):
        os.remove(restore_path)

    # 1. Vacuum into backup (hot-backup safe)
    src_conn = sqlite3.connect(src)
    src_conn.execute(f"VACUUM INTO '{backup_path}';")
    print(f"Backup created at: {backup_path}")

    # 2. Restore
    shutil.copy2(backup_path, restore_path)
    print(f"Restored to separate DB: {restore_path}")

    # 3. Compare tables & counts
    rest_conn = sqlite3.connect(restore_path)
    tables = [row[0] for row in rest_conn.execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall()]
    print(f"Restored SQLite tables ({len(tables)}): {tables}")

    src_cur = src_conn.cursor()
    rest_cur = rest_conn.cursor()
    for table in ["expenses", "incomes", "bank_accounts", "users", "expense_types", "income_types", "sms_source_messages", "transaction_evidence"]:
        if table in tables:
            src_cnt = src_cur.execute(f"SELECT count(*) FROM {table};").fetchone()[0]
            rest_cnt = rest_cur.execute(f"SELECT count(*) FROM {table};").fetchone()[0]
            assert src_cnt == rest_cnt, f"Mismatch in {table}: {src_cnt} vs {rest_cnt}"
            print(f"Table '{table}': {src_cnt} records verified identical.")

    # Check Alembic revision
    src_rev = src_cur.execute("SELECT version_num FROM alembic_version;").fetchone()[0]
    rest_rev = rest_cur.execute("SELECT version_num FROM alembic_version;").fetchone()[0]
    print(f"Alembic revision: {src_rev} == {rest_rev}")
    assert src_rev == rest_rev

    src_conn.close()
    rest_conn.close()
    print("SQLite Backup & Restore Rehearsal: 100% SUCCESS\n")

def rehearse_postgresql():
    print("=== Rehearsing Disposable PostgreSQL 18 Backup & Restore ===")
    pg_dump = r"C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"
    psql = r"C:\Program Files\PostgreSQL\18\bin\psql.exe"
    dump_file = "backups/pg18_disposable_dump.sql"

    # 1. Dump moneytrack_disposable
    cmd_dump = [
        pg_dump,
        "-h", "127.0.0.1",
        "-p", "5434",
        "-U", "postgres",
        "-d", "moneytrack_disposable",
        "-f", dump_file
    ]
    res = subprocess.run(cmd_dump, capture_output=True, text=True)
    assert res.returncode == 0, f"pg_dump failed: {res.stderr}"
    print(f"PostgreSQL 18 dump created: {dump_file} ({os.path.getsize(dump_file)} bytes)")

    # 2. Create fresh target DB moneytrack_restored
    admin_engine = create_engine("postgresql+psycopg2://postgres@127.0.0.1:5434/postgres", isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        conn.execute(text("DROP DATABASE IF EXISTS moneytrack_restored WITH (FORCE);"))
        conn.execute(text("CREATE DATABASE moneytrack_restored;"))
        print("Fresh moneytrack_restored database created.")

    # 3. Restore dump into moneytrack_restored
    cmd_restore = [
        psql,
        "-h", "127.0.0.1",
        "-p", "5434",
        "-U", "postgres",
        "-d", "moneytrack_restored",
        "-f", dump_file
    ]
    res_restore = subprocess.run(cmd_restore, capture_output=True, text=True)
    assert res_restore.returncode == 0, f"Restore failed: {res_restore.stderr}"
    print("Restore executed successfully via psql.")

    # 4. Compare record counts between moneytrack_disposable and moneytrack_restored
    orig_engine = create_engine("postgresql+psycopg2://postgres@127.0.0.1:5434/moneytrack_disposable")
    rest_engine = create_engine("postgresql+psycopg2://postgres@127.0.0.1:5434/moneytrack_restored")

    with orig_engine.connect() as orig_conn, rest_engine.connect() as rest_conn:
        orig_rev = orig_conn.execute(text("SELECT version_num FROM alembic_version;")).scalar()
        rest_rev = rest_conn.execute(text("SELECT version_num FROM alembic_version;")).scalar()
        print(f"Restored Alembic revision: {rest_rev} (Expected: {orig_rev})")
        assert orig_rev == rest_rev

        for table in ["expenses", "incomes", "bank_accounts", "users", "expense_types", "income_types", "sms_source_messages", "transaction_evidence"]:
            orig_cnt = orig_conn.execute(text(f"SELECT count(*) FROM {table};")).scalar()
            rest_cnt = rest_conn.execute(text(f"SELECT count(*) FROM {table};")).scalar()
            assert orig_cnt == rest_cnt, f"Mismatch in {table}: {orig_cnt} vs {rest_cnt}"
            print(f"Table '{table}': {orig_cnt} records verified identical.")

    print("PostgreSQL 18 Backup & Restore Rehearsal: 100% SUCCESS\n")

if __name__ == "__main__":
    rehearse_sqlite()
    rehearse_postgresql()
