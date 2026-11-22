# MoneyTrack — Database Migration Report

**Date:** 8 November 2026  
**Scope:** Complete Alembic Migration Chain Analysis, SQLite vs PostgreSQL 18 Validation, and Upgrade/Downgrade Rehearsal

---

## 1. Complete Migration History Chain

The Alembic migration graph forms a strictly linear, unbroken sequence:

| Rev ID | Name / Purpose | Down Revision | Tables Modified / Added |
| :---: | :--- | :---: | :--- |
| `0001` | `0001_initial_schema` | None (Root) | `expenses`, `expense_types` |
| `0002` | `0002_budget_tables` | `0001` | `budgets`, `category_budgets` |
| `0003` | `0003_idempotency_keys` | `0002` | `expense_idempotency_keys` |
| `0004` | `0004_income_and_bank_accounts` | `0003` | `incomes`, `income_types`, `bank_accounts`, `account_transfers`, `bank_balance_snapshots` |
| `0005` | `0005_security_and_notifications` | `0004` | `security_alerts`, `notification_logs`, `user_preferences` |
| `0006` | `0006_schema_sync_and_indexes` | `0005` | Indexes on `expenses`, `incomes`, seeds default categories |
| `0007` | `0007_user_auth_and_tenancy` | `0006` | `users` table; `user_id` FK added to all financial tables |
| `0008` | `0008_tenant_unique` | `0007` | Tenant-scoped unique constraints on categories/accounts |
| `0009` | `0009_sms_evidence_architecture` | `0008` | `sms_source_messages`, `transaction_evidence`, reference columns |
| `0010` | `0010_tenant_evidence_fk` | `0009` | Composite unique constraints on `(user_id, id)` and composite FKs on evidence |

---

## 2. PostgreSQL 18 Truncation Bug Discovery & Remediation

During empirical execution against PostgreSQL 18, a critical schema constraint defect was discovered:
- **Defect:** Migration revision `0010_database_enforced_tenant_evidence` contained 40 characters.
- **Root Cause:** PostgreSQL's `alembic_version` table defines `version_num VARCHAR(32)`. While SQLite silently accepted 40 characters, PostgreSQL 18 rejected the update with:
  `psycopg2.errors.StringDataRightTruncation: value too long for type character varying(32)`
- **Remediation:** Renamed revision to `0010_tenant_evidence_fk` (23 characters), perfectly complying with PostgreSQL's 32-character limit.

---

## 3. Dual Dialect Compatibility (SQLite & PostgreSQL)

1. **Batch Alter Table:** SQLite lacks direct `ALTER TABLE ADD CONSTRAINT` or `ALTER TABLE DROP COLUMN`. Migrations 0008, 0009, and 0010 utilize `with op.batch_alter_table(...)`, which compiles to table recreations on SQLite while generating standard `ALTER TABLE` DDL on PostgreSQL.
2. **Connection Parameters:** Fixed `alembic/env.py` to inspect the target connection string dynamically, ensuring `{"check_same_thread": False}` is only passed to SQLite dialects and never to PostgreSQL/psycopg2.

---

## 4. Empirical Upgrade & Downgrade Verification Results

- **PostgreSQL 18 Execution:**
  - Fresh DB upgrade `0000 -> 0008`: Succeeded in 1.4s.
  - Data seeding at `0008`: 2 users, 2 accounts, 4 categories, 2 expenses, 2 incomes populated.
  - Upgrade `0008 -> 0009`: Succeeded in 0.3s.
  - Upgrade `0009 -> 0010`: Succeeded in 0.4s.
  - Downgrade `0010 -> 0008`: Succeeded in 0.5s; all 4 financial records preserved.
  - Re-upgrade `0008 -> 0010`: Succeeded in 0.5s.
- **SQLite Development DB:**
  - Upgraded to `0010_tenant_evidence_fk (head)` with all existing records preserved.
