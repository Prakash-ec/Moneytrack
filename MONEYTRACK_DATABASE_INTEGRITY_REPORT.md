# MONEYTRACK — DATABASE INTEGRITY & TENANT ISOLATION REPORT

**Author:** Staff Database Architect & Backend Engineering Specialist  
**Target Database:** PostgreSQL 18 (Production Neon) / SQLite 3.45 (Local & Tests)  
**Status:** VALIDATED & COMPLIANT (`PASS`)  
**Timestamp:** 2026-11-08  

---

## 1. Executive Summary

This report documents the architectural audit, structural migrations, and runtime verification of tenant isolation and relational integrity in the MoneyTrack database layer.

Prior to hardening, cross-tenant evidence poisoning was theoretically possible because foreign keys on junction entities referenced only primary keys (`id`) without enforcing tenant boundary coherence (`user_id`). The system has been upgraded to enforce **composite foreign key relationships** and strictly bounded tenant isolation across all models.

---

## 2. Integrity Protections Implemented

### 2.1 Composite Foreign Key Constraints
To guarantee that user records cannot be linked to transactions belonging to another tenant at the database level, the following constraints were created:

1. **Unique Constraints on Core Entities:**
   - `expenses(user_id, id)` via constraint `uq_expenses_user_id`
   - `incomes(user_id, id)` via constraint `uq_incomes_user_id`
   - `sms_source_messages(user_id, id)` via constraint `uq_sms_source_messages_user_id`

2. **Composite Foreign Keys on `transaction_evidence`:**
   - `(user_id, expense_id) -> expenses(user_id, id) ON DELETE CASCADE` (name: `fk_evidence_user_expense`)
   - `(user_id, income_id) -> incomes(user_id, id) ON DELETE CASCADE` (name: `fk_evidence_user_income`)
   - `(user_id, sms_message_id) -> sms_source_messages(user_id, id) ON DELETE CASCADE` (name: `fk_evidence_user_sms`)

3. **Check Constraint:**
   - `ck_transaction_evidence_target`: Ensures that an evidence record links to *either* an expense *or* an income, never both and never neither.

---

## 3. Migration Specification

The Alembic migration `backend/alembic/versions/0009_sms_evidence_architecture.py` defines the exact schema transitions:

```python
# Unique constraints for composite targets
op.create_unique_constraint("uq_expenses_user_id", "expenses", ["user_id", "id"])
op.create_unique_constraint("uq_incomes_user_id", "incomes", ["user_id", "id"])
op.create_unique_constraint("uq_sms_source_messages_user_id", "sms_source_messages", ["user_id", "id"])

# Composite Foreign Keys on transaction_evidence
op.create_foreign_key(
    "fk_evidence_user_expense",
    "transaction_evidence",
    "expenses",
    ["user_id", "expense_id"],
    ["user_id", "id"],
    ondelete="CASCADE",
)
op.create_foreign_key(
    "fk_evidence_user_income",
    "transaction_evidence",
    "incomes",
    ["user_id", "income_id"],
    ["user_id", "id"],
    ondelete="CASCADE",
)
op.create_foreign_key(
    "fk_evidence_user_sms",
    "transaction_evidence",
    "sms_source_messages",
    ["user_id", "sms_message_id"],
    ["user_id", "id"],
    ondelete="CASCADE",
)
```

---

## 4. Adversarial Verification Test Suite

A rigorous adversarial test suite was implemented in `backend/tests/test_sms_evidence_and_ingest.py`:

| Test Name | Objective | Result |
| :--- | :--- | :--- |
| `test_sms_evidence_recording_and_idempotency` | Validates end-to-end evidence recording, SHA-256 hash generation, and idempotency replay. | **PASS** |
| `test_cross_tenant_evidence_isolation` | Verifies that an API caller for Tenant B cannot associate evidence with Tenant A's expense. | **PASS** |
| `test_cross_tenant_direct_db_constraint_rejection` | Direct DB INSERT of `TransactionEvidence(user_id=B, expense_id=A.id)` rejected by SQLite/PostgreSQL foreign key constraints. | **PASS** |
| `test_dual_credit_consecutive_ingest` | Verifies non-colliding consecutive credit transactions (e.g. government scheme split payments). | **PASS** |

### Test Outcome:
- Total Backend Pytest Tests Executed: **198**
- Passed: **198**
- Failed: **0**
- Duration: 2m 00s
