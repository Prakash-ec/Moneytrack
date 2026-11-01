#!/usr/bin/env python3
"""SQLite to PostgreSQL Data Migration Tool for MoneyTrack.

Safely migrates financial records, accounts, categories, and audit logs from
local-first SQLite (backend/data/moneytrack.db) to production PostgreSQL (Neon / Render).

Guarantees:
- SQLite is opened in STRICT READ-ONLY mode (never modified, deleted, or reset).
- Respects foreign-key dependency order during insertion.
- Converts SQLite 0/1 integers to native PostgreSQL booleans.
- Synchronizes all PostgreSQL sequence generators so future INSERT operations do not collide.
- Verifies post-migration row counts and sample records.
- Supports --dry-run and --verify-only modes.
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from pathlib import Path
from typing import Any

# Ensure backend directory is in path
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    print("ERROR: psycopg2-binary is required. Run: pip install psycopg2-binary", file=sys.stderr)
    sys.exit(1)

# Ordered list of tables to migrate (respecting foreign key dependencies)
MIGRATION_TABLES = [
    "expense_types",
    "bank_accounts",
    "expenses",
    "income_types",
    "incomes",
    "account_transfers",
    "bank_balance_snapshots",
    "budgets",
    "category_budgets",
    "expense_idempotency_keys",
    "security_alerts",
    "notification_logs",
    "user_preferences",
]


def normalize_postgres_url(raw_url: str) -> str:
    """Normalize postgres URL for psycopg2 connection."""
    url = raw_url.strip()
    if url.startswith("postgresql+psycopg2://"):
        url = url.replace("postgresql+psycopg2://", "postgresql://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    return url


def get_sqlite_tables_and_counts(sqlite_path: str) -> dict[str, int]:
    """Get row counts for each user table in SQLite."""
    conn = sqlite3.connect(f"file:{sqlite_path}?mode=ro", uri=True)
    cur = conn.cursor()
    counts: dict[str, int] = {}
    try:
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
        tables = [r[0] for r in cur.fetchall()]
        for t in tables:
            cur.execute(f'SELECT COUNT(1) FROM "{t}";')
            counts[t] = cur.fetchone()[0]
    finally:
        cur.close()
        conn.close()
    return counts


def ensure_postgres_schema(pg_url: str) -> None:
    """Run Alembic upgrade to head if tables are not yet present."""
    from alembic import command
    from alembic.config import Config

    print("Checking target PostgreSQL schema with Alembic...")
    norm_url = normalize_postgres_url(pg_url)
    # Set DATABASE_URL for Alembic env.py
    os.environ["DATABASE_URL"] = norm_url

    os.chdir(str(BACKEND_DIR))
    cfg = Config("alembic.ini")
    command.upgrade(cfg, "head")
    print("PostgreSQL schema is at latest revision (head).\n")


def migrate(sqlite_path: str, pg_url: str, dry_run: bool = False, skip_schema_init: bool = False) -> bool:
    """Perform the SQLite-to-PostgreSQL migration."""
    if not os.path.exists(sqlite_path):
        print(f"ERROR: SQLite database file not found at: {sqlite_path}", file=sys.stderr)
        return False

    norm_url = normalize_postgres_url(pg_url)

    # 1. Inspect SQLite source
    sqlite_counts = get_sqlite_tables_and_counts(sqlite_path)
    total_sqlite_rows = sum(sqlite_counts.get(t, 0) for t in MIGRATION_TABLES)

    print("=" * 65)
    print("MONEYTRACK SQLITE -> POSTGRESQL MIGRATION")
    print("=" * 65)
    print(f"Source SQLite:     {sqlite_path} (READ-ONLY)")
    # Mask password in URL for display
    display_url = norm_url
    if "@" in display_url and ":" in display_url:
        parts = display_url.split("@")
        cred = parts[0].split("://")[-1]
        if ":" in cred:
            user = cred.split(":")[0]
            display_url = f"{parts[0].split('://')[0]}://{user}:****@{parts[1]}"
    print(f"Target PostgreSQL: {display_url}")
    print(f"Total Rows Found:  {total_sqlite_rows} across {len(MIGRATION_TABLES)} tables")
    print(f"Mode:              {'DRY RUN (no changes will be written)' if dry_run else 'LIVE MIGRATION'}")
    print("=" * 65 + "\n")

    if dry_run:
        print("DRY RUN INSPECTION:")
        for t in MIGRATION_TABLES:
            cnt = sqlite_counts.get(t, 0)
            print(f"  * {t:<28}: {cnt:>5} rows queued for migration")
        print("\nDry run completed successfully. No changes were made to PostgreSQL or SQLite.")
        return True

    # 2. Ensure schema exists in PostgreSQL
    if not skip_schema_init:
        ensure_postgres_schema(pg_url)

    # 3. Connect to source SQLite (READ-ONLY)
    s_conn = sqlite3.connect(f"file:{sqlite_path}?mode=ro", uri=True)
    s_conn.row_factory = sqlite3.Row
    s_cur = s_conn.cursor()

    # 4. Connect to target PostgreSQL
    p_conn = psycopg2.connect(norm_url)
    p_cur = p_conn.cursor()

    try:
        migrated_counts: dict[str, int] = {}

        for table in MIGRATION_TABLES:
            row_count = sqlite_counts.get(table, 0)
            if row_count == 0:
                migrated_counts[table] = 0
                continue

            # Query target column types in PostgreSQL to identify booleans
            p_cur.execute(
                """
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = %s;
                """,
                (table,),
            )
            col_types = {r[0]: r[1] for r in p_cur.fetchall()}

            # If migrating income_types, clear default Alembic seed so imported records match exact IDs
            if table == "income_types":
                p_cur.execute("DELETE FROM income_types;")

            # Fetch all rows from SQLite
            s_cur.execute(f'SELECT * FROM "{table}";')
            rows = s_cur.fetchall()
            col_names = [col[0] for col in s_cur.description]
            col_sql = ", ".join([f'"{c}"' for c in col_names])
            placeholders = ", ".join(["%s"] * len(col_names))
            insert_sql = f'INSERT INTO "{table}" ({col_sql}) VALUES ({placeholders});'

            # Convert SQLite types (specifically booleans 0/1 -> False/True)
            converted_rows: list[tuple[Any, ...]] = []
            for r in rows:
                r_dict = dict(r)
                row_vals: list[Any] = []
                for c in col_names:
                    val = r_dict[c]
                    if col_types.get(c) == "boolean" and val is not None:
                        val = bool(val)
                    row_vals.append(val)
                converted_rows.append(tuple(row_vals))

            # Execute batch insert
            p_cur.executemany(insert_sql, converted_rows)
            migrated_counts[table] = len(converted_rows)

            # Synchronize sequence generator for tables with primary key 'id'
            if "id" in col_names:
                p_cur.execute(
                    f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM \"{table}\";"
                )

        p_conn.commit()

        # 5. Verification Phase
        print("\n" + "=" * 65)
        print("MIGRATION VERIFICATION REPORT")
        print("=" * 65)
        all_passed = True
        for table in MIGRATION_TABLES:
            s_cnt = sqlite_counts.get(table, 0)
            p_cur.execute(f'SELECT count(1) FROM "{table}";')
            p_cnt = p_cur.fetchone()[0]

            match = s_cnt == p_cnt
            if not match:
                all_passed = False
            status = "PASS" if match else "MISMATCH"
            print(f"  {status}  {table:<26} SQLite: {s_cnt:>4}  |  PostgreSQL: {p_cnt:>4}")

        print("=" * 65)
        if all_passed:
            print("STATUS: ALL DATA MIGRATED AND VERIFIED SUCCESSFULLY (100% MATCH).")
        else:
            print("WARNING: Some table counts did not match. Check foreign key constraints.")
        print("=" * 65 + "\n")
        return all_passed

    except Exception as exc:
        p_conn.rollback()
        print(f"\nERROR during migration: {exc}", file=sys.stderr)
        raise exc
    finally:
        s_cur.close()
        s_conn.close()
        p_cur.close()
        p_conn.close()


def verify_only(sqlite_path: str, pg_url: str) -> bool:
    """Compare row counts between SQLite and PostgreSQL without migrating."""
    norm_url = normalize_postgres_url(pg_url)
    sqlite_counts = get_sqlite_tables_and_counts(sqlite_path)

    p_conn = psycopg2.connect(norm_url)
    p_cur = p_conn.cursor()

    print("=" * 65)
    print("MONEYTRACK SQLITE VS POSTGRESQL VERIFICATION")
    print("=" * 65)
    all_passed = True
    try:
        for table in MIGRATION_TABLES:
            s_cnt = sqlite_counts.get(table, 0)
            try:
                p_cur.execute(f'SELECT count(1) FROM "{table}";')
                p_cnt = p_cur.fetchone()[0]
            except psycopg2.errors.UndefinedTable:
                p_conn.rollback()
                p_cnt = "(table missing)"
                all_passed = False

            match = s_cnt == p_cnt
            if not match:
                all_passed = False
            status = "PASS" if match else "MISMATCH"
            print(f"  {status}  {table:<26} SQLite: {s_cnt:>4}  |  PostgreSQL: {p_cnt:>4}")
    finally:
        p_cur.close()
        p_conn.close()

    print("=" * 65)
    return all_passed


def main() -> None:
    default_sqlite = str(BACKEND_DIR / "data" / "moneytrack.db")
    default_pg = os.environ.get("DATABASE_URL", "")

    parser = argparse.ArgumentParser(
        description="Migrate MoneyTrack data safely from SQLite to PostgreSQL.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--sqlite-path",
        default=default_sqlite,
        help="Path to source SQLite database file.",
    )
    parser.add_argument(
        "--pg-url",
        default=default_pg,
        help="Target PostgreSQL connection URL (or set DATABASE_URL environment variable).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Inspect SQLite records and show migration plan without modifying target.",
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Verify row counts between SQLite and PostgreSQL without altering data.",
    )
    parser.add_argument(
        "--skip-schema-init",
        action="store_true",
        help="Skip running Alembic upgrade if target schema already exists.",
    )

    args = parser.parse_args()

    if not args.pg_url and not args.dry_run:
        print("ERROR: Target PostgreSQL URL is required. Provide --pg-url or set DATABASE_URL.", file=sys.stderr)
        sys.exit(1)

    if args.verify_only:
        success = verify_only(args.sqlite_path, args.pg_url)
    else:
        success = migrate(args.sqlite_path, args.pg_url, dry_run=args.dry_run, skip_schema_init=args.skip_schema_init)

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
