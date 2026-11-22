# MoneyTrack — Tenant Security Report

**Document Date:** 8 November 2026  
**Security Architecture:** Two-Tier Defense (Application-Level Guard + Kernel-Enforced Composite Foreign Keys)

---

## 1. Vulnerability Analysis: Single-Column vs Composite Foreign Keys

In traditional relational schemas, junction tables typically reference target tables by their primary key:
```sql
-- VULNERABLE PATTERN
CREATE TABLE transaction_evidence (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    sms_message_id INT REFERENCES sms_source_messages(id),
    expense_id INT REFERENCES expenses(id)
);
```
Under this single-column foreign key pattern, if User B executes an insert with `user_id = B`, `sms_message_id = B_sms`, but `expense_id = A_exp`, the database kernel accepts the row because `A_exp` exists in `expenses`.
Even if application code validates ownership, any bypass, direct SQL script, admin tooling, or internal service bug can leak or misattribute financial records across tenants.

---

## 2. Implemented Defense-in-Depth

### Tier 1: Application-Level Defensive Validation
In [`backend/app/services/sms_ingest.py`](file:///D:/MoneyTrack/backend/app/services/sms_ingest.py#L35-L55), `_record_sms_evidence()` verifies ownership before issuing the SQL insert:
```python
if expense_id:
    exp_check = db.scalar(select(Expense.id).where(Expense.id == expense_id, Expense.user_id == user_id))
    if not exp_check:
        logger.error("Cross-tenant evidence rejection: expense %s does not belong to user %s", expense_id, user_id)
        return
```

### Tier 2: Kernel-Enforced Composite Foreign Keys (Migration `0010_tenant_evidence_fk`)
1. Composite unique constraints added to target tables:
   - `expenses(user_id, id)`
   - `incomes(user_id, id)`
   - `sms_source_messages(user_id, id)`
2. Composite foreign keys enforced on `transaction_evidence`:
   - `(user_id, expense_id) REFERENCES expenses (user_id, id) ON DELETE CASCADE`
   - `(user_id, income_id) REFERENCES incomes (user_id, id) ON DELETE CASCADE`
   - `(user_id, sms_message_id) REFERENCES sms_source_messages (user_id, id) ON DELETE CASCADE`

---

## 3. Direct SQL Security Test Results (PostgreSQL 18 Kernel)

| Test Case | Direct SQL Injection Attempt | Result | PostgreSQL Kernel Enforcement Detail |
| :---: | :--- | :---: | :--- |
| **7.1** | User 2 linking User 1's expense | **REJECTED** | `violates foreign key constraint "fk_evidence_user_expense": Key (user_id, expense_id)=(2, 101) is not present in table "expenses".` |
| **7.2** | User 2 linking User 1's income | **REJECTED** | `violates foreign key constraint "fk_evidence_user_income": Key (user_id, income_id)=(2, 102) is not present in table "incomes".` |
| **7.3** | User 2 referencing User 1's SMS | **REJECTED** | `violates foreign key constraint "fk_evidence_user_sms": Key (user_id, sms_message_id)=(2, 1) is not present in table "sms_source_messages".` |
| **7.4** | Evidence linking both expense & income | **REJECTED** | `violates check constraint "ck_transaction_evidence_target"` |
| **7.5** | Evidence linking neither target | **REJECTED** | `violates check constraint "ck_transaction_evidence_target"` |
| **7.6** | Duplicate evidence for same SMS + expense | **REJECTED** | `violates unique constraint "uq_evidence_sms_expense"` |
