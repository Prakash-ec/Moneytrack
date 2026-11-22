# MoneyTrack — Backup, Restore and Disaster Recovery Report

**Document Date:** 8 November 2026  
**Auditor:** Complete Engineering Team  
**Scope:** Rehearsal of Hot Backup, Cold Dump, Restoration, and Integrity Verification for SQLite and PostgreSQL 18

---

## 1. Rehearsal Execution & Empirical Findings

Backup and restore rehearsals were executed via `backend/scripts/rehearse_backup_restore.py`:

```
=== Rehearsing Local SQLite Backup & Restore ===
Backup created at: backups/sqlite_rehearsal_backup.db
Restored to separate DB: backups/sqlite_rehearsal_restored.db
Restored SQLite tables (17): ['alembic_version', 'expense_types', 'expense_idempotency_keys', 'bank_accounts', 'income_types', 'account_transfers', 'bank_balance_snapshots', 'security_alerts', 'notification_logs', 'user_preferences', 'users', 'budgets', 'category_budgets', 'expenses', 'incomes', 'sms_source_messages', 'transaction_evidence']
Table 'expenses': 6 records verified identical.
Table 'incomes': 0 records verified identical.
Table 'bank_accounts': 1 records verified identical.
Table 'users': 0 records verified identical.
Table 'expense_types': 17 records verified identical.
Table 'income_types': 9 records verified identical.
Table 'sms_source_messages': 0 records verified identical.
Table 'transaction_evidence': 0 records verified identical.
Alembic revision: 0010_tenant_evidence_fk == 0010_tenant_evidence_fk
SQLite Backup & Restore Rehearsal: 100% SUCCESS

=== Rehearsing Disposable PostgreSQL 18 Backup & Restore ===
PostgreSQL 18 dump created: backups/pg18_disposable_dump.sql (60595 bytes)
Fresh moneytrack_restored database created.
Restore executed successfully via psql.
Restored Alembic revision: 0010_tenant_evidence_fk (Expected: 0010_tenant_evidence_fk)
Table 'expenses': 2 records verified identical.
Table 'incomes': 2 records verified identical.
Table 'bank_accounts': 2 records verified identical.
Table 'users': 2 records verified identical.
Table 'expense_types': 14 records verified identical.
Table 'income_types': 11 records verified identical.
Table 'sms_source_messages': 0 records verified identical.
Table 'transaction_evidence': 0 records verified identical.
PostgreSQL 18 Backup & Restore Rehearsal: 100% SUCCESS
```

---

## 2. Disaster Recovery Protocol

### 2.1 Neon Production Recovery Plan
- **Recovery Branch:** `pre-migration-0008-backup` created with retention through 23 November 2026.
- **Rollback Decision Rules:**
  - If migration 0009 or 0010 fails during execution: Run `alembic downgrade 0008_tenant_unique` or restore the Neon recovery branch instantly via the Neon CLI/console.
  - If backend deployment fails after migration: Roll back the Render container image. Pre-existing endpoints continue functioning normally against the 0010 schema because all new tables and columns are strictly additive and nullable.
