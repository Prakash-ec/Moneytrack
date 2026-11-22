# MONEYTRACK — POSTGRESQL 18 COMPATIBILITY & DIALECT VALIDATION

**Author:** Database Architect & SQL Specialist  
**Database Engine:** PostgreSQL 18.1 (Neon Serverless)  
**Status:** COMPATIBLE & VALIDATED (`PASS`)  

---

## 1. Executive Summary

This report reviews SQL compatibility, indexes, partial index syntax, and migration constructs across PostgreSQL 18.1 and SQLite 3.45.

MoneyTrack utilizes PostgreSQL 18 on Neon in production and SQLite for local development and fast pytest unit execution. All SQLAlchemy models and Alembic migrations have been architected with dual-dialect safety.

---

## 2. Dialect-Safe Constructs

### 2.1 Partial Unique Indexes
PostgreSQL and SQLite support partial indexes with slightly different syntax requirements. MoneyTrack models specify both `postgresql_where` and `sqlite_where` clauses:

```python
Index(
    "ix_expense_types_system_name_key",
    "name_key",
    unique=True,
    postgresql_where=text("user_id IS NULL"),
    sqlite_where=text("user_id IS NULL"),
)
Index(
    "ix_expense_types_user_name_key",
    "user_id",
    "name_key",
    unique=True,
    postgresql_where=text("user_id IS NOT NULL"),
    sqlite_where=text("user_id IS NOT NULL"),
)
```

### 2.2 Timestamp & Timezone Handling
- Custom `UTCDateTime` TypeDecorator stores UTC datetimes as naive UTC in SQLite (with automatic ISO parsing) and `TIMESTAMP WITH TIME ZONE` in PostgreSQL.
- Eliminates timezone conversion skew when querying records across IST (+05:30) and UTC.

### 2.3 Composite Foreign Keys in Migration 0009
PostgreSQL 18 strictly enforces that composite foreign keys point to matching column order and types in target unique constraints:
- `expenses(user_id, id)` is indexed via `uq_expenses_user_id`.
- `incomes(user_id, id)` is indexed via `uq_incomes_user_id`.
- `sms_source_messages(user_id, id)` is indexed via `uq_sms_source_messages_user_id`.

All composite foreign keys in `transaction_evidence` strictly align with these unique target specifications.

---

## 3. Production Readiness Summary
- Alembic migration `0009_sms_evidence_architecture.py` is ready for staging/production deployment (`alembic upgrade head`).
- Zero deprecated SQL features (e.g. `WITH OIDS`, legacy type coercions) exist in the codebase.
- Compatible with PostgreSQL 18 connection poolers (Neon pgBouncer).
