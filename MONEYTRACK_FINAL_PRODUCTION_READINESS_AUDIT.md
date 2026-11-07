# MONEYTRACK — FINAL PRODUCTION READINESS AUDIT (POST-PHASE 8)

**Audit Execution Date:** 2026-11-06  
**Audit Scope:** Full codebase inspection (Phases 0–8 implementation verification)  
**Operating Mode:** STRICTLY READ-ONLY VERIFICATION  
**Auditor:** Antigravity Senior Security & Systems Verification Engineer  

---

## 1. EXECUTIVE VERDICT

# VERDICT: FAIL (PRODUCTION DEPLOYMENT BLOCKED)

While the Phase 0–8 implementation successfully introduced user authentication models, tenant-scoped database queries, migration `0007_user_auth_and_tenancy`, IDOR validation in backend services, and achieved a 100% test pass rate locally (172 backend tests, 45 frontend tests), **the application in its current state CANNOT be deployed to production**.

Deploying to production today will result in an immediate application outage and data corruption risks due to **three Critical (P0) Blockers**:

1. **Universal Client Lockout (Frontend & Android Native):**
   - The backend enforces `HTTPBearer` authentication on all financial routes (`backend/app/api/deps.py:get_current_user`).
   - The React web frontend (`frontend/src/services/api.ts`) contains **zero** token handling, does not send `Authorization: Bearer <token>` headers, and lacks any Login/Register UI.
   - The Android native worker (`android/app/src/main/java/com/moneytrack/app/sms/SyncWorker.kt`) makes direct `HttpURLConnection` calls to `/api/expense-types`, `/api/sms/ingest`, and `/api/expenses` with **no `Authorization` header**.
   - **Immediate Impact:** Deploying the backend will lock out 100% of web users with HTTP 401 Unauthorized errors and break 100% of Android background SMS synchronization.

2. **PostgreSQL DDL Syntax Failure in Alembic Migration 0007:**
   - In `backend/alembic/versions/0007_user_authentication_and_tenancy.py` (lines 32–33), boolean columns `is_active` and `is_superuser` are defined with `server_default=sa.text("1")` and `server_default=sa.text("0")`.
   - In SQLite this passes; however, in PostgreSQL (Neon production), PostgreSQL enforces strict boolean types and rejects integer defaults (`ERROR: column "is_active" is of type boolean but default expression is of type integer`).
   - **Immediate Impact:** The startup migration will abort during deployment, crashing the backend container in production.

3. **Insecure Default Secret Key & Missing Deployment Environment Variable:**
   - `render.yaml` completely omits the `SECRET_KEY` environment variable.
   - In `backend/app/core/config.py`, the application defaults to `"moneytrack-insecure-default-change-in-production-secret-key-32chars"`.
   - **Immediate Impact:** In production, any attacker who reads the open-source repository can forge valid JWT tokens for any user ID, gaining full read and write access to all financial records.

Production deployment authorization is **STRICTLY DENIED** until the remediation items detailed in this audit are fully resolved.

---

## 2. ROUTE-BY-ROUTE AUTHENTICATION AND SECURITY MATRIX

Every API route across the 17 router groups registered in `backend/app/api/router.py` has been audited for:
- Authentication requirement (`get_current_user` dependency).
- Multi-tenant query scoping (`user_id == current_user.id`).
- IDOR prevention on primary and foreign keys.
- Safe HTTP status codes for unauthorized / unowned access.

| HTTP Method | Route Endpoint | Router Module | Auth Required | Tenant Scoped | IDOR Protected | Status / Audit Notes |
|:---|:---|:---|:---:|:---:|:---:|:---|
| `GET` | `/api/health` | `health.py` | None | N/A | N/A | **SAFE**: Public system health check for load balancer. No financial data exposed. |
| `GET` | `/api/auth/setup-status` | `auth.py` | None | N/A | N/A | **SAFE**: Returns boolean `is_configured` and count. No sensitive data exposed. |
| `POST` | `/api/auth/register` | `auth.py` | None | N/A | N/A | **DEFECT**: Public registration is open to anyone on the internet. Non-atomic legacy claim. |
| `POST` | `/api/auth/login` | `auth.py` | None | N/A | N/A | **SAFE**: Validates credentials via bcrypt, issues JWT. Constant-time failure response. |
| `GET` | `/api/auth/me` | `auth.py` | `Bearer` | Yes | Yes | **SAFE**: Returns `current_user` schema. Scoped directly to token subject. |
| `GET` | `/api/expenses` | `expenses.py` | `Bearer` | Yes | Yes | **SAFE**: Filtered by `Expense.user_id == current_user.id`. |
| `POST` | `/api/expenses` | `expenses.py` | `Bearer` | Yes | Yes | **SAFE**: Explicitly validates that `account_id` and `expense_type_id` belong to `current_user.id`. |
| `GET` | `/api/expenses/{id}` | `expenses.py` | `Bearer` | Yes | Yes | **SAFE**: Returns 404 if expense exists but belongs to another user (anti-enumeration). |
| `PUT` | `/api/expenses/{id}` | `expenses.py` | `Bearer` | Yes | Yes | **SAFE**: Ownership verified; checks cross-tenant reassignment of account and type. |
| `PATCH` | `/api/expenses/{id}` | `expenses.py` | `Bearer` | Yes | Yes | **SAFE**: Same verified protections as PUT. |
| `DELETE` | `/api/expenses/{id}` | `expenses.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped to `user_id`. Recalculates bank balance of affected account. |
| `GET` | `/api/expense-types` | `expense_types.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped to `user_id == current_user.id` OR `user_id.is_(None)`. |
| `POST` | `/api/expense-types` | `expense_types.py` | `Bearer` | Yes | No | **DEFECT**: Global unique constraint on `name_key` allows tenant collision across users. |
| `GET` | `/api/expense-types/{id}` | `expense_types.py` | `Bearer` | Yes | Yes | **SAFE**: Accessible only if user owns it or if it is a system default (`user_id is None`). |
| `PUT` | `/api/expense-types/{id}` | `expense_types.py` | `Bearer` | Yes | Yes | **SAFE**: Rejects mutation of system default types; returns 404 for other users' types. |
| `DELETE` | `/api/expense-types/{id}` | `expense_types.py` | `Bearer` | Yes | Yes | **SAFE**: System types protected; cross-tenant deletion prevented. |
| `GET` | `/api/incomes` | `incomes.py` | `Bearer` | Yes | Yes | **SAFE**: Filtered by `Income.user_id == current_user.id`. |
| `POST` | `/api/incomes` | `incomes.py` | `Bearer` | Yes | Yes | **SAFE**: Validates user ownership of `account_id` and `income_type_id`. |
| `GET` | `/api/incomes/{id}` | `incomes.py` | `Bearer` | Yes | Yes | **SAFE**: Returns 404 if record belongs to another user. |
| `PUT` | `/api/incomes/{id}` | `incomes.py` | `Bearer` | Yes | Yes | **SAFE**: Validates ownership and re-calculates bank balance on account changes. |
| `PATCH` | `/api/incomes/{id}` | `incomes.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped to user; recalculates balance. |
| `DELETE` | `/api/incomes/{id}` | `incomes.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped to user; reverses account balance impact. |
| `GET` | `/api/income-types` | `income_types.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped to user types and system defaults. |
| `POST` | `/api/income-types` | `income_types.py` | `Bearer` | Yes | No | **DEFECT**: Global unique constraint on `name_key` causes unhandled 500 on collision. |
| `GET` | `/api/income-types/{id}` | `income_types.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped to user or system defaults. |
| `PUT` | `/api/income-types/{id}` | `income_types.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped; system types cannot be edited. |
| `DELETE` | `/api/income-types/{id}` | `income_types.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped; system types cannot be archived. |
| `GET` | `/api/bank-accounts` | `bank_accounts.py` | `Bearer` | Yes | Yes | **SAFE**: Filtered strictly by `BankAccount.user_id == current_user.id`. |
| `POST` | `/api/bank-accounts` | `bank_accounts.py` | `Bearer` | Yes | Yes | **SAFE**: Account created with `user_id = current_user.id`. Masks account number. |
| `GET` | `/api/bank-accounts/reconciliation/summary` | `bank_accounts.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped to `current_user.id`. |
| `GET` | `/api/bank-accounts/{id}` | `bank_accounts.py` | `Bearer` | Yes | Yes | **SAFE**: Returns 404 if account not owned by user. |
| `PATCH` | `/api/bank-accounts/{id}` | `bank_accounts.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped update; recalculates balance. |
| `PUT` | `/api/bank-accounts/{id}` | `bank_accounts.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped update. |
| `DELETE` | `/api/bank-accounts/{id}` | `bank_accounts.py` | `Bearer` | Yes | Yes | **SAFE**: Soft-archives account scoped to `user_id`. |
| `POST` | `/api/bank-accounts/{id}/recalculate` | `bank_accounts.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped to user before initiating balance recalculation. |
| `POST` | `/api/bank-accounts/{id}/report-balance` | `bank_accounts.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped to user; records `BalanceSnapshot` under `current_user.id`. |
| `GET` | `/api/transfers` | `transfers.py` | `Bearer` | Yes | Yes | **SAFE**: Filtered by `AccountTransfer.user_id == current_user.id`. |
| `POST` | `/api/transfers` | `transfers.py` | `Bearer` | Yes | Yes | **SAFE**: Verifies that user owns BOTH `from_account` and `to_account`. |
| `GET` | `/api/transfers/{id}` | `transfers.py` | `Bearer` | Yes | Yes | **SAFE**: Returns 404 if transfer does not belong to `current_user.id`. |
| `PUT` | `/api/transfers/{id}` | `transfers.py` | `Bearer` | Yes | Yes | **SAFE**: Ownership validated; verifies ownership of updated accounts. |
| `PATCH` | `/api/transfers/{id}` | `transfers.py` | `Bearer` | Yes | Yes | **SAFE**: Ownership validated. |
| `DELETE` | `/api/transfers/{id}` | `transfers.py` | `Bearer` | Yes | Yes | **SAFE**: Ownership validated; reverses balances of both accounts. |
| `GET` | `/api/budgets` | `budgets.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped to `Budget.user_id == current_user.id`. |
| `POST` | `/api/budgets` | `budgets.py` | `Bearer` | Yes | No | **DEFECT**: DB constraint `uq_budgets_one_per_period` lacks `user_id`. Multi-user clash. |
| `GET` | `/api/budgets/category/{cat}` | `budgets.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped to `CategoryBudget.user_id == current_user.id`. |
| `POST` | `/api/budgets/category` | `budgets.py` | `Bearer` | Yes | No | **DEFECT**: DB constraint `uq_category_budgets_one_per_period_category` lacks `user_id`. |
| `DELETE` | `/api/budgets/category/{cat}` | `budgets.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped deletion. |
| `GET` | `/api/budgets/category` | `budgets.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped list. |
| `GET` | `/api/budgets/summary` | `budgets.py` | `Bearer` | Yes | Yes | **SAFE**: Aggregates only expenses and budgets of `current_user.id`. |
| `GET` | `/api/analytics/cashflow` | `cashflow.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped to incomes, expenses, and accounts of `current_user.id`. |
| `GET` | `/api/analytics/summary` | `analytics.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped to `Expense.user_id == current_user.id`. |
| `GET` | `/api/analytics/by-type` | `analytics.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped to `Expense.user_id == current_user.id`. |
| `GET` | `/api/analytics/trends` | `analytics.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped to `Expense.user_id == current_user.id`. |
| `GET` | `/api/analytics/comparison` | `analytics.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped to `Expense.user_id == current_user.id`. |
| `POST` | `/api/receipts/parse` | `receipts.py` | `Bearer` | Yes | Yes | **SAFE**: Only parses text/image into preview; does not persist transactions. |
| `POST` | `/api/receipts/parse-text` | `receipts.py` | `Bearer` | Yes | Yes | **SAFE**: Only parses text; no side-effects or multi-tenant leakage. |
| `GET` | `/api/export/expenses.csv` | `exports.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped CSV export of `current_user.id` expenses. |
| `GET` | `/api/export/backup.json` | `exports.py` | `Bearer` | Yes | Yes | **SAFE**: V1 JSON backup scoped to `current_user.id`. |
| `GET` | `/api/exports/backup.json` | `exports.py` | `Bearer` | Yes | Yes | **SAFE**: V2 JSON backup scoped to `current_user.id` across all entities. |
| `POST` | `/api/export/restore` | `exports.py` | `Bearer` | Yes | Yes | **SAFE**: V1 restore attaches records strictly to `current_user.id`. |
| `POST` | `/api/exports/restore` | `exports.py` | `Bearer` | Yes | Yes | **DEFECT**: Does not verify checksum; fails to restore `category_budgets`. |
| `POST` | `/api/sms/ingest` | `sms_ingest.py` | `Bearer` | Yes | Yes | **CRITICAL LOCKOUT**: Backend correctly requires auth, but Android `SyncWorker` sends NO auth header! |
| `GET` | `/api/security/summary` | `security.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped to `SecurityAlert.user_id == current_user.id`. |
| `GET` | `/api/security/alerts` | `security.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped to `SecurityAlert.user_id == current_user.id`. |
| `POST` | `/api/security/alerts/{id}/action` | `security.py` | `Bearer` | Yes | Yes | **SAFE**: Action applied only to alerts belonging to `current_user.id`. |
| `GET` | `/api/notifications` | `notifications.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped to `NotificationLog.user_id == current_user.id`. |
| `POST` | `/api/notifications/{id}/read` | `notifications.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped to `NotificationLog.user_id == current_user.id`. |
| `POST` | `/api/notifications/read-all` | `notifications.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped to `current_user.id`. |
| `GET` | `/api/notifications/preferences` | `notifications.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped to `UserPreference.user_id == current_user.id`. |
| `PUT` | `/api/notifications/preferences` | `notifications.py` | `Bearer` | Yes | Yes | **SAFE**: Scoped to `UserPreference.user_id == current_user.id`. |
| `GET` | `/api/reports/weekly` | `weekly_report.py` | `Bearer` | Yes | Yes | **CRITICAL LOCKOUT**: Android `WeeklyReportWorker` sends NO auth header! |

---

## 3. LEGACY OWNERSHIP ADOPTION FINDINGS

The legacy adoption mechanism in `backend/app/services/auth.py` was inspected:

```python
def claim_legacy_records_for_user(db: Session, user_id: int) -> None:
    models_to_claim = [
        Expense, ExpenseType, BankAccount, Income, IncomeType,
        AccountTransfer, Budget, CategoryBudget, BalanceSnapshot,
        SecurityAlert, NotificationLog, UserPreference,
    ]
    for model in models_to_claim:
        db.execute(update(model).where(model.user_id.is_(None)).values(user_id=user_id))
    db.commit()
```

### Verified Findings:

1. **Non-Atomic Two-Phase Registration (Race & Crash Risk):**
   - In `backend/app/services/auth.py:register_user`:
     - Line 70: `db.commit()` commits the newly created `User` record.
     - Line 75: `claim_legacy_records_for_user(db, user.id)` executes the updates and runs a *second* `db.commit()`.
   - **Vulnerability:** If the application crashes, network interrupts, or a database timeout occurs between lines 70 and 75, the user is created (`user_count` is now 1), but the legacy records remain with `user_id = None`. Because subsequent registrations see `user_count > 0`, `is_first_user` evaluates to `False`, permanently orphaning the pre-existing financial records.
   - **Remediation:** Combine user creation and legacy adoption into a single atomic transaction before issuing a single `db.commit()`.

2. **Concurrent First-User Registration Race Condition:**
   - In `backend/app/services/auth.py:register_user`:
     - `user_count = db.query(User).count()` is executed without a table-level lock or row lock.
   - **Vulnerability:** If two registration requests arrive concurrently when `user_count == 0`, both requests can observe `user_count == 0`. Both users are assigned `is_superuser = True`, and both trigger `claim_legacy_records_for_user()`.
   - **Remediation:** Use an explicit database-level transaction lock (e.g. `SELECT count(*) FROM users FOR UPDATE` or advisory lock in PostgreSQL).

3. **Open Public Registration on a Personal Finance Tool:**
   - The endpoint `POST /api/auth/register` is completely open to the internet without restriction, invite token, or administrative disable toggle (`ALLOW_REGISTRATION`).
   - Any external user who discovers the URL can register an account on the private instance.
   - **Remediation:** Add an environment variable `ALLOW_REGISTRATION: bool = False` that automatically prevents new registrations once the primary account exists.

4. **Default Expense Types Claiming Anomaly:**
   - `seed_default_expense_types()` in `backend/app/main.py` seeds standard expense types with `user_id = None`.
   - When the first user registers, `claim_legacy_records_for_user()` assigns `user_id = 1` to all standard default expense types.
   - If User 2 subsequently registers, User 2 has access only to types where `user_id == 2` or `user_id is None`. Because User 1 claimed all default types, User 2 starts with **zero expense types**. Furthermore, when User 2 attempts to create "Food & Dining", the global unique constraint on `name_key` blocks them!

---

## 4. BACKUP AND RESTORE COMPLETENESS MATRIX

The backup and restore implementation in `backend/app/services/exports.py` was inspected for relational integrity, entity coverage, and tampering detection.

### 4.1 Entity Coverage Matrix

| Financial Entity | Database Model | Included in V1 | Included in V2 | Restored in V2 | Omission Justification / Defect |
|:---|:---|:---:|:---:|:---:|:---|
| **Expenses** | `Expense` | Yes | Yes | Yes | Core transaction record. Fully restored with deduplication. |
| **Expense Types** | `ExpenseType` | Yes | Yes | Yes | Core taxonomy. Fully restored / matched by `name_key`. |
| **Bank Accounts** | `BankAccount` | No | Yes | Yes | Core ledger accounts. Fully restored with balance recalculation. |
| **Incomes** | `Income` | No | Yes | Yes | Core cash inflows. Fully restored with deduplication. |
| **Income Types** | `IncomeType` | No | Yes | Yes | Inflow categories. Fully restored / matched. |
| **Transfers** | `AccountTransfer` | No | Yes | Yes | Inter-account transfers. Fully restored with account mapping. |
| **Monthly Budgets** | `Budget` | No | Yes | Yes | Monthly spending limits. Restored. |
| **Category Budgets** | `CategoryBudget` | No | Yes | **NO (BUG)** | **DEFECT**: Exported in V2 backup JSON, but `restore_json` completely lacks logic to restore them! |
| **Balance Snapshots** | `BalanceSnapshot` | No | No | No | **DERIVED**: Recalculated dynamically from ledger transactions. Safe to omit. |
| **Security Alerts** | `SecurityAlert` | No | No | No | **DERIVED**: Real-time heuristic alerts generated from transactions. Safe to omit. |
| **Notification Logs** | `NotificationLog` | No | No | No | **DISPOSABLE**: Ephemeral in-app notifications. Safe to omit. |
| **User Preferences** | `UserPreference` | No | No | No | **DISPOSABLE**: Client display/filter preferences. Safe to omit. |
| **Idempotency Keys** | `ExpenseIdempotencyKey` | No | No | No | **TRANSIENT**: Short-term replay deduplication tokens. Safe to omit. |
| **User Credentials** | `User` | No | No | No | **PROTECTED**: Authentication data must never be exported in portable user backups. |

### 4.2 Checksum & Cryptographic Integrity Findings

1. **Checksum Generated on Export, But Completely Ignored on Restore:**
   - In `backend/app/services/exports.py`:
     - Line 349: `payload["checksum"] = hashlib.sha256(raw_bytes).hexdigest()` generates a SHA256 checksum during export.
     - However, in `restore_json` (lines 353–380), `payload.get("checksum")` is **never inspected or validated**. Any modified, corrupted, or truncated payload is accepted without error.
2. **Accidental Corruption Detection vs. Authenticated Integrity (HMAC):**
   - The SHA256 checksum is an **unkeyed hash**.
   - It functions solely as an accidental corruption detector (bit-rot), **NOT** as an authenticated integrity mechanism. Anyone who edits the backup JSON can recompute `hashlib.sha256()` and bypass validation.
   - For a production-ready financial system, backups should either use `hmac.new(secret_key, ...)` or be digitally signed if authenticity against tampering is required.
3. **Atomic Rollback Verification:**
   - In `restore_json`, all operations execute within a `try ... except` block with `db.rollback()` (lines 729–731).
   - If an invalid expense, unmapped account, or constraint violation occurs mid-restore, the database is cleanly rolled back, preventing partial or dirty restores.

---

## 5. JWT AND PASSWORD SECURITY FINDINGS

| Security Parameter | Actual Implementation | Assessment | Finding / Recommendation |
|:---|:---|:---:|:---|
| **Password Hashing** | `bcrypt` (12 rounds) via `backend/app/core/security.py` | **SECURE** | Industry standard, computationally expensive, resistant to GPU brute-forcing. |
| **JWT Algorithm** | `HS256` via `jwt.encode` (`PyJWT`) | **SECURE** | Standard symmetric signing algorithm. |
| **Token Expiry** | 30 days (`43,200` minutes) | **ACCEPTABLE (WITH RISK)** | 30-day tokens are convenient for mobile apps, but lack a revocation/blacklist mechanism. A compromised token cannot be invalidated before 30 days. |
| **Secret Key Configuration** | `settings.secret_key` in `backend/app/core/config.py` | **CRITICAL DEFECT** | Hardcoded fallback `"moneytrack-insecure-default-change-in-production-secret-key-32chars"`. `SECRET_KEY` is omitted from `render.yaml`. |
| **Invalid / Expired Handling** | Explicit `ExpiredSignatureError` & `InvalidTokenError` catch | **SECURE** | Cleanly raises HTTP 401 with informative messages without leaking stack traces. |
| **Login Error Responses** | Generic `"Invalid email or password."` | **SECURE** | Identical error message for non-existent users and incorrect passwords (prevents user enumeration). |
| **Registration Validation** | Email regex, password length >= 8 characters | **SECURE** | Enforced via Pydantic schema `UserCreate`. |
| **CORS Policy** | Whitelisted Render domains, localhost, Capacitor | **SECURE** | Strict origins and regex; `allow_credentials=False`. |
| **Logging Sanitization** | `main.py:run_startup_migrations` sanitizes DB URLs | **SECURE** | Passwords masked in error logs (`://****:****@`). No secrets logged to stdout. |
| **Client Web Token Storage** | None (Not implemented in React frontend) | **CRITICAL DEFECT** | Frontend does not store or transmit tokens. |
| **Client Mobile Token Storage** | None (Not implemented in Android native code) | **CRITICAL DEFECT** | `SyncWorker.kt` and `TransactionStore.kt` lack token storage and retrieval. |

---

## 6. DATABASE AND ALEMBIC MIGRATION FINDINGS

The Alembic migration history and current head migration `backend/alembic/versions/0007_user_authentication_and_tenancy.py` were audited:

### 6.1 Revision Lineage and Heads
- **Current Revision ID:** `0007_user_auth_and_tenancy`
- **Revises (Parent):** `0006_schema_sync_and_indexes`
- **Alembic Head:** Single head, clean linear lineage (`0001` -> `0002` -> `0003` -> `0004` -> `0005` -> `0006` -> `0007`).

### 6.2 PostgreSQL vs. SQLite DDL Incompatibility (CRITICAL DEFECT)
In `0007_user_authentication_and_tenancy.py` lines 32–33:
```python
sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
sa.Column("is_superuser", sa.Boolean(), nullable=False, server_default=sa.text("0")),
```
- In SQLite, booleans are integers (`0` and `1`), so `server_default=sa.text("1")` succeeds.
- In PostgreSQL (Neon production), boolean columns cannot accept integer defaults. PostgreSQL raises:
  `ERROR: column "is_active" is of type boolean but default expression is of type integer`
- **Fix Required:** Replace `server_default=sa.text("1")` with `server_default=sa.true()` and `server_default=sa.text("0")` with `server_default=sa.false()`, exactly as implemented in earlier migrations `0004` and `0005`.

### 6.3 Multi-Instance Startup Race Risk
- `backend/app/main.py:lifespan` runs `run_startup_migrations()` (`alembic upgrade head`) inside the application startup lifecycle.
- Additionally, `render.yaml` specifies `startCommand: "cd backend && alembic upgrade head && uvicorn app.main:app ..."`.
- If multiple container instances or autoscaling workers start simultaneously, concurrent `alembic upgrade head` commands will race, causing table locks or migration deadlocks on PostgreSQL.
- **Recommended Strategy:** Execute migrations during Render's dedicated `preDeployCommand` or as a standalone release step, rather than inside container runtime startup.

### 6.4 Cascade Deletion Consequences
- In migration `0007`, all financial tables define `user_id` with `sa.ForeignKey("users.id", ondelete="CASCADE")`.
- **Consequence:** If a user record is deleted, the database automatically and permanently purges all associated expenses, bank accounts, incomes, transfers, and budgets without soft-delete protection or archival.
- **Recommendation:** Implement soft-delete on the `users` table (`is_active = False`) to prevent catastrophic accidental data loss.

---

## 7. FINANCIAL INTEGRITY VERIFICATION

The financial calculation engine and ledger consistency rules were verified:

1. **Integer Paise Monetary Storage:**
   - All financial quantities (`Expense.amount_paise`, `Income.amount_paise`, `BankAccount.current_balance_paise`, `BankAccount.opening_balance_paise`, `AccountTransfer.amount_paise`, `Budget.amount_paise`) are strictly mapped to `sqlalchemy.BigInteger`.
   - Floating-point representations are strictly prohibited in the persistence layer. Conversions to rupees (`format_inr`, `_paise_to_rupees`) occur solely in presentation formatters using integer division and modulus (`divmod(paise, 100)`).

2. **Balance Consistency on Mutations:**
   - In `backend/app/services/expenses.py`, `incomes.py`, and `transfers.py`:
     - Creating an expense deducts from the associated bank account ledger.
     - Updating an expense adjusts both the old and newly assigned accounts.
     - Deleting an expense recalculates and restores the bank account balance.
     - Internal transfers recalculate both source and destination accounts simultaneously.
   - All balance updates recalculate the mathematical ledger from the opening balance date:
     $$\text{Balance} = \text{Opening} + \sum \text{Incomes} - \sum \text{Expenses} + \sum \text{Transfers In} - \sum \text{Transfers Out}$$

3. **Budget December-to-January Rollover:**
   - In `backend/app/services/budgets.py:get_month_boundaries`:
     ```python
     if month.month == 12:
         end = date(month.year + 1, 1, 1)
     else:
         end = date(month.year, month.month + 1, 1)
     ```
   - Correctly increments the year when rolling over from December to January, preventing infinite loop or period query errors.

4. **Multi-User Budget Constraint Collision (DEFECT):**
   - In `backend/app/models/budget.py`:
     - `UniqueConstraint("budget_period", name="uq_budgets_one_per_period")`
     - `UniqueConstraint("budget_period", "category", name="uq_category_budgets_one_per_period_category")`
   - These constraints lack `user_id`. If User 1 creates a budget for `2026-11-01`, User 2 will trigger a database `IntegrityError` when attempting to set their own budget for the same month!
   - **Remediation:** Modify the unique constraints to composite keys: `("user_id", "budget_period")` and `("user_id", "budget_period", "category")`.

5. **SMS & Receipt Idempotency:**
   - In `backend/app/services/sms_ingest.py`, incoming transactions with an `Idempotency-Key` header check `ExpenseIdempotencyKey` and `Income.idempotency_key`.
   - Duplicate calls return `replayed=True` with `status_code=200` and `X-Idempotent-Replay: true` without double-counting balances.

---

## 8. ANDROID AND FRONTEND COMPATIBILITY

Inspection of `frontend/src/` and `android/app/src/main/java/` revealed complete disconnection from the backend authentication layer:

### 8.1 React Web Frontend
- `frontend/src/services/api.ts`:
  ```typescript
  async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${DEFAULT_API_BASE}${endpoint}`
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
    ...
  }
  ```
- No token is retrieved from storage or injected into the `headers`.
- The application contains no Authentication Context, Login Route, or Registration Form.
- Deploying the authenticated backend will cause all API requests in the frontend to fail immediately with `401 Unauthorized`.

### 8.2 Android Native Code (`SyncWorker.kt` & `WeeklyReportWorker.kt`)
- In `android/app/src/main/java/com/moneytrack/app/sms/SyncWorker.kt`:
  - Line 276 (`fetchActiveExpenseTypes`):
    ```kotlin
    conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
        requestMethod = "GET"
        setRequestProperty("Accept", "application/json")
    }
    ```
  - Line 337 (`ingestSms`):
    ```kotlin
    connection = (URL(url).openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        addRequestProperty("Content-Type", "application/json")
        addRequestProperty("Accept", "application/json")
        addRequestProperty("Idempotency-Key", record.id)
    }
    ```
  - Line 419 (`createExpense`):
    ```kotlin
    connection = (URL(url).openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        addRequestProperty("Content-Type", "application/json")
        addRequestProperty("Accept", "application/json")
        addRequestProperty("Idempotency-Key", idempotencyKey)
    }
    ```
  - In `WeeklyReportWorker.kt` line 37:
    Calls `/api/reports/weekly` with no Authorization header.
- **Finding:** None of the native background workers pass `Authorization: Bearer <token>`.
- The local settings store `TransactionStore.kt` does not store an auth token.
- Background SMS ingestion and weekly report notifications will permanently fail in production.

---

## 9. DEPLOYMENT AND RECOVERY RISKS

1. **Missing `SECRET_KEY` in `render.yaml`:**
   - `render.yaml` declares environment variables for Python, CORS, Groq, and Keep-Alive, but completely omits `SECRET_KEY`.
   - The production server will fall back to the known hardcoded string in `config.py`.
2. **Double Migration Execution on Render Startup:**
   - `render.yaml` startCommand executes `alembic upgrade head`.
   - `main.py` lifespan executes `run_startup_migrations()`.
   - The migration runs twice sequentially on every container start, introducing unnecessary startup latency.
3. **Keep-Alive Worker Configuration:**
   - `keep_alive_worker()` in `main.py` pings `/health` every 12 minutes to prevent Render Free tier inactivity sleep.
   - Pings correctly target `/health` (an unauthenticated endpoint) and will not be blocked by auth middleware.
4. **Git Repository Status:**
   - Git working tree is clean (`git status` shows no uncommitted code changes).
   - `.env`, `moneytrack.db`, and credential files are properly ignored in `.gitignore`.

---

## 10. EXACT FILE PATHS AND FUNCTION NAMES SUPPORTING FINDINGS

| Finding Description | File Path | Function / Identifier | Line Reference |
|:---|:---|:---|:---:|
| Client Auth Token Omission (Frontend) | `frontend/src/services/api.ts` | `request()` | L33–L67 |
| Native SMS Worker Auth Omission | `android/app/src/main/java/com/moneytrack/app/sms/SyncWorker.kt` | `ingestSms()`, `createExpense()`, `fetchActiveExpenseTypes()` | L276, L337, L419 |
| Weekly Report Worker Auth Omission | `android/app/src/main/java/com/moneytrack/app/sms/WeeklyReportWorker.kt` | `doWork()` | L37–L43 |
| Insecure Default Secret Key | `backend/app/core/config.py` | `Settings.secret_key` | L24 |
| Missing Secret Key in Render Config | `render.yaml` | `services[0].envVars` | L9–L32 |
| PostgreSQL Boolean DDL Syntax Error | `backend/alembic/versions/0007_user_authentication_and_tenancy.py` | `upgrade()` | L32–L33 |
| Non-Atomic User Registration & Claim | `backend/app/services/auth.py` | `register_user()` | L70–L75 |
| First-User Registration Race | `backend/app/services/auth.py` | `register_user()`, `get_setup_status()` | L59–L60 |
| Category Budget Restore Omission | `backend/app/services/exports.py` | `restore_json()` | L699–L720 |
| Backup Checksum Ignored on Restore | `backend/app/services/exports.py` | `restore_json()` | L353–L380 |
| Multi-User Budget Constraint Clash | `backend/app/models/budget.py` | `Budget.__table_args__`, `CategoryBudget.__table_args__` | L32, L63 |
| Global Expense Type Name Key Collision | `backend/app/models/expense_type.py` | `ExpenseType.name_key` | L23 |
| Global Income Type Name Key Collision | `backend/app/models/income_type.py` | `IncomeType.name_key` | L22 |

---

## 11. VERIFIED DEFECTS VERSUS POTENTIAL RISKS

| Issue ID | Classification | Severity | Description |
|:---:|:---|:---:|:---|
| **D-01** | **Verified Defect** | **CRITICAL** | Frontend `api.ts` sends no `Authorization` header, locking out the web application. |
| **D-02** | **Verified Defect** | **CRITICAL** | Native Android `SyncWorker.kt` sends no `Authorization` header, breaking SMS sync. |
| **D-03** | **Verified Defect** | **CRITICAL** | Migration `0007` uses `server_default=sa.text("1")` on Postgres boolean, aborting startup. |
| **D-04** | **Verified Defect** | **CRITICAL** | `render.yaml` omits `SECRET_KEY`, falling back to hardcoded insecure secret. |
| **D-05** | **Verified Defect** | **HIGH** | `restore_json` omits restoration of `category_budgets` despite being exported in V2. |
| **D-06** | **Verified Defect** | **HIGH** | `restore_json` does not validate backup checksum before restoring data. |
| **D-07** | **Verified Defect** | **HIGH** | `Budget` and `CategoryBudget` unique constraints lack `user_id`, causing multi-tenant collisions. |
| **D-08** | **Verified Defect** | **HIGH** | `ExpenseType` and `IncomeType` enforce global `name_key` uniqueness across distinct tenants. |
| **R-01** | **Potential Risk** | **MEDIUM** | Non-atomic registration commit could leave legacy records orphaned on mid-operation crash. |
| **R-02** | **Potential Risk** | **MEDIUM** | Unrestricted `POST /api/auth/register` allows anyone on internet to register on private instance. |
| **R-03** | **Potential Risk** | **MEDIUM** | Alembic running both in `startCommand` and `lifespan` creates duplicate startup overhead. |
| **R-04** | **Potential Risk** | **LOW** | 30-day token lifetime without revocation list prevents revoking compromised sessions. |

---

## 12. PRIORITIZED REMEDIATION PLAN

### Phase 1: Immediate Critical Blockers (Required for Deployment)
1. **Fix Migration 0007 Boolean Defaults:**
   - In `backend/alembic/versions/0007_user_authentication_and_tenancy.py`, replace `server_default=sa.text("1")` and `sa.text("0")` with `server_default=sa.true()` and `server_default=sa.false()`.
2. **Inject Production Secret Key:**
   - Add `SECRET_KEY` (sync: false) to `render.yaml` under `moneytrack-backend` envVars.
   - Generate a cryptographically secure 64-character secret in the Render dashboard.
3. **Implement Client Token Support:**
   - **Frontend:** Implement an authentication provider/service that captures the token on login, persists it to secure storage/localStorage, and injects `Authorization: Bearer <token>` in `frontend/src/services/api.ts`.
   - **Android:** Extend `TransactionStore.kt` and `SmsPlugin.kt` to store the JWT auth token; update `SyncWorker.kt` (lines 280, 344, 426) and `WeeklyReportWorker.kt` (line 42) to add `setRequestProperty("Authorization", "Bearer $token")`.

### Phase 2: High-Priority Integrity & Tenant Hardening
4. **Fix Multi-Tenancy Unique Constraints:**
   - Create migration `0008` to drop global unique constraints on `budgets`, `category_budgets`, `expense_types`, and `income_types`, replacing them with composite unique constraints scoped to `(user_id, ...)`.
5. **Restore Category Budgets & Validate Checksums:**
   - Add category budget restoration logic to `backend/app/services/exports.py:restore_json`.
   - Add checksum verification in `restore_json` before executing database mutations.
6. **Atomic Registration & Legacy Adoption:**
   - Refactor `register_user()` in `auth.py` to wrap user creation and legacy adoption in a single transaction with a single commit.
   - Add `ALLOW_REGISTRATION: bool = False` once the primary user is configured.

---

## 13. FINAL DEPLOYMENT AUTHORIZATION RECOMMENDATION

### RECOMMENDATION: DO NOT DEPLOY TO PRODUCTION

Production deployment to Render and Neon PostgreSQL must remain **STRICTLY BLOCKED** until:
- [ ] Migration 0007 is patched for PostgreSQL boolean compatibility.
- [ ] `SECRET_KEY` is added to `render.yaml` and injected in Render environment settings.
- [ ] React web frontend is updated with authentication handling and bearer token headers.
- [ ] Android `SyncWorker.kt` is updated with bearer token injection.
- [ ] End-to-end integration tests between frontend, Android sync worker, and authenticated backend pass successfully.

**Sign-off:** Antigravity Audit & Verification Team  
**Status:** Audit Complete — Read-Only Mode Maintained — No Code Changes Executed.
