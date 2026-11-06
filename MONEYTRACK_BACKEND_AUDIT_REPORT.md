# MONEYTRACK — COMPREHENSIVE BACKEND ARCHITECTURE, SECURITY, RELIABILITY & PERFORMANCE AUDIT REPORT

**Audit Date:** November 6, 2026  
**Auditor Roles:** Senior Backend Architect, FastAPI/Python Systems Engineer, Database Reliability Specialist, Application Security Auditor  
**Scope:** Complete Backend Codebase (`D:\MoneyTrack\backend`), Alembic Migrations, API Routers, Services, Schemas, Database Models, Deployment Configurations (`render.yaml`, `Dockerfile`), and Test Architecture  
**Execution Context:** Read-only inspection and safe verification. Zero code modifications or production database changes applied during this audit.

---

## SECTION A — EXECUTIVE SUMMARY

### Overall Backend Verdict: **NEEDS SIGNIFICANT RELIABILITY & SECURITY WORK (HAS CRITICAL ISSUES)**

The MoneyTrack backend is built on a modern foundation (Python 3.11, FastAPI 0.115, SQLAlchemy 2.0, Pydantic v2, Alembic 1.14), with commendable core domain decisions—specifically storing currency values as integer paise (1 INR = 100 paise) and using ISO 8601 UTC timestamps with a dedicated `UTCDateTime` TypeDecorator.

However, the application currently harbors **three Critical (P0) vulnerabilities and architectural flaws**, along with **five High (P1) data integrity defects** that prevent it from being safe or reliable in a multi-user or public production environment:

1. **Critical Security (P0): Complete Absence of Authentication & Authorization on Public Internet**  
   The backend is deployed publicly at `https://moneytrack-backend-g5is.onrender.com/api` with **zero authentication**. Any anonymous entity on the internet can query all expenses, bank accounts, and incomes, trigger AI vision calls on the owner's Groq quota, download the entire financial database via `/api/export/backup.json`, or inject arbitrary transactions.
2. **Critical Reliability & Architecture (P0): Synchronous Blocking I/O Inside `async def` Endpoints Freezes the Event Loop**  
   `parse_receipt` and `parse_receipt_text` in `receipts.py` are declared as `async def`, but execute synchronous, blocking HTTP calls to Groq Cloud via `httpx.Client.post()` (with up to 20s timeout) and synchronous subprocesses for Tesseract OCR. This completely starves the single-threaded asyncio event loop, freezing health checks and all other concurrent API requests for up to 30 seconds.
3. **Critical Data Loss Hazard (P0): Catastrophically Incomplete Backup & Restore Pipeline**  
   `backup_json()` in `backend/app/services/exports.py` only exports `expenses` and `expense_types`. It completely omits `bank_accounts`, `incomes`, `income_types`, `account_transfers`, `budgets`, `category_budgets`, `balance_snapshots`, and expense-to-account linkages. Restoring from a backup permanently destroys all non-expense financial data.
4. **High Financial Defect (P1): December Month Boundary Bug in Budgets**  
   In `backend/app/services/budgets.py` (lines 144 and 177), `next_month = date(month.year, month.month % 12 + 1, 1)` calculates `2026-01-01` instead of `2027-01-01` when `month=12`. Consequently, budget spending queries in December of any year always evaluate to `0` regardless of actual spending.
5. **High Data Integrity Defect (P1): Expense Updates & Deletions Fail to Update Bank Balances**  
   While `incomes.py` correctly updates bank balances on update/delete, `expenses.py` fails to trigger `recalculate_account_balance()` when an expense is updated or deleted. Furthermore, `ExpenseUpdate` drops the `account_id` field, making reassigning accounts impossible.
6. **High Performance Bottleneck (P1): Write-Heavy Ledger Recalculations on Read-Only GET Endpoints**  
   Because expense mutations fail to maintain ledger balances, GET endpoints (`/api/cashflow/summary`, `/api/bank-accounts`, `/api/bank-accounts/reconciliation/summary`) loop through all accounts and execute 4 aggregate queries and a database `db.commit()` write per account on every single read request.

---

## SECTION B — BACKEND ARCHITECTURE MAP

### 1. Request-to-Database Lifecycle

```
[ Frontend SPA / Android Capacitor App / External Client ]
                       │
                       │ HTTP Request (e.g., POST /api/expenses, Idempotency-Key: xxx)
                       ▼
         [ FastAPI Application (app.main:app) ]
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
[ Security Headers Middleware ]   [ CORSMiddleware ]
  • X-Content-Type-Options: nosniff • allow_origins / regex
  • X-Frame-Options: DENY          • expose_headers: X-Idempotent-Replay
  • Permissions-Policy             • allow_methods: GET, POST, ...
         │
         ▼
[ GZipMiddleware (min_size=800) ]
         │
         ▼
[ Exception Handlers ] ─── (NotFoundError -> 404, ConflictError -> 409, PeriodError -> 400)
         │
         ▼
[ API Router (app.api.router:api_router, prefix="/api") ]
         │ (Routes traffic to modular sub-routers in app/api/routes/)
         ▼
[ Route Handler (e.g., app/api/routes/expenses.py:create_expense) ]
         │
         ├──► [ Dependency Injection: get_db() -> SessionLocal() ]
         ├──► [ Pydantic Request Validation (e.g., ExpenseCreate: amount > 0, date valid) ]
         │
         ▼
[ Service Layer (e.g., app/services/expenses.py:create_expense) ]
         │
         ├──► [ Idempotency Check: Query ExpenseIdempotencyKey by key ]
         │       └─ If hit: return existing model with replayed=True
         ├──► [ Domain Validation: Check ExpenseType exists and is not archived ]
         ├──► [ SQLAlchemy Model Construction (app/models/expense.py:Expense) ]
         │
         ▼
[ Database Session Transaction (app.db.session:SessionLocal) ]
         │
         ├──► db.add(model) -> db.flush() -> db.add(ExpenseIdempotencyKey) -> db.commit()
         │
         ▼
[ Database Engine (SQLAlchemy Engine + Connection Pool) ]
         │
         ├──► Local Development: SQLite (backend/data/moneytrack.db)
         │       └─ Event listener executes PRAGMA foreign_keys=ON on connect
         └──► Production: Neon PostgreSQL (postgresql+psycopg2://)
                 └─ Pool: pool_pre_ping=True, pool_recycle=300, pool_size=10
         │
         ▼
[ Secondary Domain Service Hooks ]
         │
         ├──► app.services.bank_accounts:recalculate_account_balance(db, account_id)
         └──► app.services.security:evaluate_transaction_security(db, model)
         │
         ▼
[ Response Formatting & Serialization ]
         │
         ├──► Pydantic Output Model (e.g., ExpenseRead.model_validate(loaded))
         └──► Response Header: X-Idempotent-Replay (if applicable)
         │
         ▼
[ HTTP 201 Created / 200 OK Response (JSON) ]
```

### 2. Architectural Structure Analysis

* **Strengths:** Clean separation between schemas (Pydantic), models (SQLAlchemy), services (business logic), and routes (HTTP endpoints).
* **Flaws:**
  * **Missing Authentication/Authorization Layer:** No `get_current_user` dependency or security barrier exists.
  * **Orphaned Duplicate Code:** `backend/app/api/endpoints/` exists alongside `backend/app/api/routes/` with duplicate files (`notifications.py`, `security.py`, `weekly_report.py`).
  * **Missing Generic Repository Pattern:** Services intermix raw SQL queries, aggregates, and business rules, leading to query duplication across `analytics.py`, `cashflow.py`, and `bank_accounts.py`.

---

## SECTION C — COMPLETE MECHANISM INVENTORY

| # | Mechanism | Implementation Location | How It Works | Verification Result | Weaknesses & Vulnerabilities | Recommended Improvement |
|---|---|---|---|---|---|---|
| **1** | **Application Initialization & Lifespan** | `app/main.py:lifespan` | Runs Alembic migrations (`run_startup_migrations`), seeds default expense types, launches background keep-alive ping worker. | **Functional** | Duplicate migration runs (invoked in shell start command AND lifespan). Background worker hardcodes external Render URL. | Remove duplicate migration call in start command; inject target URL strictly via settings. |
| **2** | **Keep-Alive Worker** | `app/main.py:keep_alive_worker` | Periodic `asyncio` task that pings `/health` every 12 mins to prevent Render Free tier inactivity sleep. | **Functional** | Catches exceptions generically; creates outbound network traffic over public internet rather than internal loop. | Acceptable workaround for Render Free tier, but should be configurable via toggle. |
| **3** | **Database Session Management** | `app/db/session.py` | `SessionLocal` factory with `pool_pre_ping=True`, `pool_recycle=300`. `get_db()` FastAPI dependency yields session. | **Functional** | SQLite vs PostgreSQL connection pooling handled via if/else. No async database session support (`asyncpg` not used). | Migrate to `AsyncSession` if high concurrent transaction volume is required. |
| **4** | **SQLite Foreign Key Enforcement** | `app/db/session.py:_enable_sqlite_foreign_keys` | SQLAlchemy Engine connect listener executes `PRAGMA foreign_keys=ON` for SQLite connections. | **Verified Working** | Only applies to connections created through this engine. Raw sqlite3 scripts must manually enforce it. | Maintain event listener; verify in all isolated script fixtures. |
| **5** | **Expense Creation & Idempotency** | `app/services/expenses.py:create_expense` | Inserts `Expense` and `ExpenseIdempotencyKey`. Replays previous expense if duplicate key sent. | **Verified Working** | Replay returns 200 with `X-Idempotent-Replay` header. Does not check for duplicate non-idempotent submissions. | Add fingerprint deduplication (same type, amount, date within 60s). |
| **6** | **Expense Mutation & Balance Sync** | `app/services/expenses.py:update_expense`, `delete_expense` | Modifies or deletes expense records. | **DEFECTIVE** | Does NOT recalculate bank account balance on update or delete! Drops `account_id` on update. | Call `recalculate_account_balance` on update/delete; support updating `account_id`. |
| **7** | **Income Management** | `app/services/incomes.py` | CRUD operations for income streams. Recomputes bank balance on create, update, and delete. | **Verified Working** | Field mapping inconsistency: accepts `note` or `description`, `reference` or `bank_reference`. | Standardize field naming across all schemas and models. |
| **8** | **Account Balance Calculation** | `app/services/bank_accounts.py:recalculate_account_balance` | Ledger formula: $Balance = Opening + Incomes - Expenses + Transfers_{in} - Transfers_{out}$. | **Verified Working** | Performance hazard: executed repeatedly on read-only GET endpoints. | Shift to transaction-time balance updates; use aggregate recalculation only for on-demand reconciliation. |
| **9** | **Internal Account Transfers** | `app/services/transfers.py:create_transfer` | Atomic double-entry balance adjustment between user accounts. Verifies accounts are distinct. | **Verified Working** | No update or delete endpoints exist for transfers. | Implement `delete_transfer` and `update_transfer` with balance adjustments. |
| **10** | **Monthly & Category Budgets** | `app/services/budgets.py` | CRUD for monthly overall and per-category spending limits. Calculates spend against limits. | **CRITICAL BUG** | December date calculation bug (`month % 12 + 1` returns 0 spending in Dec). Non-atomic delete-commit-insert. | Fix year rollover: `date(year + 1, 1, 1)`; use atomic transaction for upsert. |
| **11** | **Cashflow & Analytics** | `app/services/cashflow.py`, `app/services/analytics.py` | Aggregates income, expense, savings rate, category breakdowns, daily trends, recurring types. | **Functional but Inefficient** | `analytics.py` loads all ORM models into memory and sums in Python rather than using SQL `func.sum()`. | Replace in-memory summation with database-level SQL aggregate queries. |
| **12** | **Groq AI Vision Integration** | `app/services/groq_vision.py` | Communicates with Groq Cloud API for receipt JSON extraction using `qwen/qwen3.8-27b`. | **Functional with Flaws** | Synchronous `httpx.Client` blocks event loop. Ambiguous `<1000` rupee/paise heuristic. | Use `AsyncClient` and strictly require currency unit specification. |
| **13** | **Tesseract Local OCR** | `app/services/ocr.py` | Runs `tesseract` CLI via `subprocess.run` to extract text from receipt images. | **Partially Available** | Missing on Render deployment because native python runtime lacks apt packages. | Document that Render requires Docker runtime if local Tesseract is desired. |
| **14** | **Receipt Text Extraction** | `app/services/receipt_text.py` | Parses raw receipt text via Groq AI or regex fallback; suggests category/type. | **Functional** | Unit tests make live external API calls over the internet when `GROQ_API_KEY` is set. | Mock `GroqVisionProvider` in all automated tests. |
| **15** | **SMS Transaction Ingest** | `app/services/sms_ingest.py` | Matches bank account by last 4 digits; auto-records expense or income; records bank balance. | **Verified Working** | Ambiguous SMS transactions return `created=False` without persisting to a review queue table in DB. | Add a persistent `pending_sms_transactions` table in database for audit trail. |
| **16** | **Bank Balance Reconciliation** | `app/services/bank_accounts.py:record_reported_balance` | Stores reported balance snapshots; computes variance against calculated balance. | **Verified Working** | `discrepancy_paise` calculation logic duplicated in multiple endpoints. | Consolidate reconciliation calculation into a single reusable helper. |
| **17** | **Security Anomaly Detection** | `app/services/security.py` | Heuristics for high amount (>3x avg), new merchants (>₹1000), and rapid debits within 15 mins. | **Verified Working** | Uses `Expense.created_at` instead of `Expense.expense_date` for 15-min window (breaks for backdated entries). | Anchor rapid debit detection on transaction timestamp when available. |
| **18** | **Weekly Summary Report** | `app/services/weekly_report.py` | Monday-to-Sunday weekly rollup of spend, income, top categories, and unusual spending. | **Functional with Dialect Risk** | Compares `Date` columns using string literals (`>= '2026-10-26'`), risking PostgreSQL dialect failures. | Pass `date` objects directly to SQLAlchemy filter expressions. |
| **19** | **Backup & Data Export** | `app/services/exports.py:backup_json`, `expenses_csv` | Exports financial data to CSV and JSON formats. | **CRITICAL DEFECT** | `backup_json` omits bank accounts, incomes, transfers, budgets, and balance snapshots! | Overhaul backup schema to version 2 containing all 12 database tables. |
| **20** | **Restore & Data Import** | `app/services/exports.py:restore_json` | Ingests backup JSON, creates missing types, matches existing signatures, imports expenses. | **Incomplete** | Cannot restore incomes, accounts, or transfers because they are absent from backup. | Implement full multi-table relational restore with topological dependency ordering. |

---

## SECTION D — API ENDPOINT AUDIT

A complete dynamic inspection of the registered router revealed **60 distinct endpoint registrations** (including aliases). Below is the comprehensive audit across all endpoint groups:

### 1. Financial Transactions (`/api/expenses`, `/api/incomes`)

| Method | Path | Request Schema | Response Schema | Auth | Validation / Error Handling | Transaction Handling | Status / Assessment |
|---|---|---|---|---|---|---|---|
| `GET` | `/api/expenses` | Query params (dates, type, category, search, sort, page) | `ExpensePage` | None | Validates date ranges, limits page size | Read-only | **Healthy:** Indexed pagination, joined load. |
| `POST` | `/api/expenses` | `ExpenseCreate` | `ExpenseRead` | None | `amount_paise > 0`, date valid, type active | Idempotency key supported; atomic commit | **Healthy:** Correct validation and status codes. |
| `GET` | `/api/expenses/{id}` | Path param `int` | `ExpenseRead` | None | 404 on missing expense | Read-only | **Healthy** |
| `PUT` | `/api/expenses/{id}` | `ExpenseUpdate` | `ExpenseRead` | None | Rejects nulls, validates type | Missing balance sync | **Defective:** Does not update bank balance or account ID. |
| `PATCH` | `/api/expenses/{id}` | `ExpenseUpdate` | `ExpenseRead` | None | Partial fields allowed | Missing balance sync | **Defective:** Same as PUT. |
| `DELETE` | `/api/expenses/{id}` | Path param `int` | `204 No Content` | None | 404 on missing expense | Deletes row | **Defective:** Deletes expense but leaves bank balance desynchronized! |
| `GET` | `/api/incomes` | Query params (dates, type, account, page) | `IncomeList` | None | Validates pagination | Read-only | **Healthy** |
| `POST` | `/api/incomes` | `IncomeCreate` | `IncomeRead` | None | Validates amount > 0, account | Replays idempotency; syncs balance | **Healthy:** Full balance synchronization. |
| `GET` | `/api/incomes/{id}` | Path param `int` | `IncomeRead` | None | 404 on missing income | Read-only | **Healthy** |
| `PUT` | `/api/incomes/{id}` | `IncomeUpdate` | `IncomeRead` | None | Validates fields | Recalculates old & new accounts | **Healthy** |
| `PATCH` | `/api/incomes/{id}` | `IncomeUpdate` | `IncomeRead` | None | Validates fields | Recalculates old & new accounts | **Healthy** |
| `DELETE` | `/api/incomes/{id}` | Path param `int` | `204 No Content` | None | 404 on missing income | Recalculates account balance | **Healthy** |

### 2. Expense & Income Categories (`/api/expense-types`, `/api/income-types`)

| Method | Path | Request Schema | Response Schema | Auth | Validation / Error Handling | Status / Assessment |
|---|---|---|---|---|---|---|
| `GET` | `/api/expense-types` | Query params (archived, search) | `ExpenseTypeList` | None | Normalizes name search | **Healthy** |
| `POST` | `/api/expense-types` | `ExpenseTypeCreate` | `ExpenseTypeRead` | None | Enforces unique `name_key` | **Healthy:** 409 Conflict on duplicate. |
| `GET` | `/api/expense-types/{id}` | Path param `int` | `ExpenseTypeRead` | None | 404 on missing | **Healthy** |
| `PUT` / `PATCH` | `/api/expense-types/{id}` | `ExpenseTypeUpdate` | `ExpenseTypeRead` | None | Prevents duplicate names | **Healthy** |
| `DELETE` | `/api/expense-types/{id}` | Path param `int` | `204 No Content` | None | Rejects delete if transactions exist | **Healthy:** Protects referential integrity. |
| `POST` | `/api/expense-types/{id}/archive` | Path param `int` | `ExpenseTypeRead` | None | Sets `is_archived=True` | **Healthy** |
| `POST` | `/api/expense-types/{id}/unarchive` | Path param `int` | `ExpenseTypeRead` | None | Sets `is_archived=False` | **Healthy** |
| `GET` | `/api/expense-types/{id}/summary` | Path param `int`, dates | `ExpenseTypePeriodSummary` | None | Resolves period | **Healthy** |
| `GET` | `/api/income-types` | Query params | `IncomeTypeList` | None | Pagination supported | **Healthy** |
| `POST` | `/api/income-types` | `IncomeTypeCreate` | `IncomeTypeRead` | None | Unique name validation | **Healthy** |
| `PUT` / `PATCH` | `/api/income-types/{id}` | `IncomeTypeUpdate` | `IncomeTypeRead` | None | Validates fields | **Healthy** |
| `DELETE` | `/api/income-types/{id}` | Path param `int` | `204 No Content` | None | Rejects delete if incomes exist | **Healthy** |

### 3. Accounts & Transfers (`/api/bank-accounts`, `/api/transfers`)

| Method | Path | Request Schema | Response Schema | Auth | Validation / Error Handling | Status / Assessment |
|---|---|---|---|---|---|---|
| `GET` | `/api/bank-accounts` | Query (include_archived) | `BankAccountList` | None | Recomputes balances on read | **Inefficient:** 20 SQL queries + 5 commits for 5 accounts. |
| `POST` | `/api/bank-accounts` | `BankAccountCreate` | `BankAccountRead` | None | Normalizes 4-digit mask | **Healthy** |
| `GET` | `/api/bank-accounts/{id}` | Path param `int` | `BankAccountRead` | None | 404 on missing | **Healthy** |
| `PUT` / `PATCH` | `/api/bank-accounts/{id}` | `BankAccountUpdate` | `BankAccountRead` | None | Partial updates allowed | **Healthy** |
| `DELETE` | `/api/bank-accounts/{id}` | Path param `int` | `200 OK` | None | Soft-archives (`is_archived=True`) | **Healthy:** Preserves transaction history. |
| `POST` | `/api/bank-accounts/{id}/recalculate` | Path param `int` | `BankAccountRead` | None | Recalculates ledger | **Healthy** |
| `POST` | `/api/bank-accounts/{id}/report-balance` | Query (`reported_balance_paise`) | `BankAccountRead` | None | Takes snapshot; sets reported | **Healthy** |
| `GET` | `/api/bank-accounts/reconciliation/summary` | None | `list[AccountReconciliationRead]` | None | Computes discrepancy per account | **Healthy** |
| `GET` | `/api/transfers` | Query (dates, account) | `TransferList` | None | Date filtering | **Healthy** |
| `POST` | `/api/transfers` | `TransferCreate` | `TransferRead` | None | Rejects `from_id == to_id` | **Healthy:** Idempotent, atomic double-balance update. |

### 4. Budgets (`/api/budgets`)

| Method | Path | Request Schema | Response Schema | Auth | Issues / Status |
|---|---|---|---|---|---|
| `GET` | `/api/budgets` | Query (`month`) | `BudgetRead` | None | **Healthy** |
| `POST` | `/api/budgets` | `BudgetCreate` | `BudgetRead` | None | **Vulnerable:** Delete-commit then add-commit (non-atomic). |
| `GET` | `/api/budgets/summary` | Query (`month`) | `BudgetSummaryRead` | None | **CRITICAL BUG:** Returns 0 spend in December due to year rollover bug. |
| `GET` | `/api/budgets/category` | Query (`month`) | `list[CategoryBudgetRead]` | None | **Healthy** |
| `POST` | `/api/budgets/category` | `CategoryBudgetCreate` | `CategoryBudgetRead` | None | **Vulnerable:** Non-atomic delete-commit-insert. |
| `GET` | `/api/budgets/category/{cat}` | Path `str`, Query (`month`) | `CategoryBudgetRead` | None | **Healthy** |
| `DELETE`| `/api/budgets/category/{cat}` | Path `str`, Query (`month`) | `200 OK` | None | **Healthy** |

### 5. Analytics & Reports

| Method | Path | Purpose | Query Params | Status / Assessment |
|---|---|---|---|---|
| `GET` | `/api/analytics/summary` | High-level metrics, largest day, comparison | `start_date`, `end_date` | **Inefficient:** Loads all ORM objects into Python memory. |
| `GET` | `/api/analytics/by-type` | Category/type breakdown & share % | `start_date`, `end_date` | **Inefficient:** In-memory grouping. |
| `GET` | `/api/analytics/trends` | Daily, weekly, monthly time series | `start_date`, `end_date`, `granularity` | **Healthy:** Correct bucket intervals. |
| `GET` | `/api/analytics/comparison`| Period-over-period comparison | `start_date`, `end_date` | **Healthy** |
| `GET` | `/api/cashflow`, `/api/cashflow/summary` | Income vs expense vs savings rate | `start_date`, `end_date` | **Inefficient:** Mutates DB on read via recalculation. |
| `GET` | `/api/reports/weekly`, `/api/weekly-report` | Weekly performance report | `start_date`, `end_date`, `ref_date` | **Dialect Hazard:** Uses string dates for SQL Date columns. |

### 6. OCR & SMS Ingestion

| Method | Path | Request | Response | Status / Assessment |
|---|---|---|---|---|
| `POST` | `/api/receipts/parse` | Multipart / JSON | `ReceiptParseResponse` | **CRITICAL FLAW:** `async def` with blocking I/O freezes event loop. |
| `POST` | `/api/receipts/parse-text` | `ReceiptTextRequest` | `ReceiptParseResponse` | **CRITICAL FLAW:** Blocks event loop on Groq Cloud calls. |
| `POST` | `/api/sms/ingest` | `SmsIngestRequest` | `SmsIngestResponse` | **Healthy:** Accurate 4-digit account & balance extraction. |

### 7. Export & Backup

| Method | Path | Output Format | Status / Assessment |
|---|---|---|---|
| `GET` | `/api/export/expenses.csv` | CSV text with UTF-8 BOM | **Healthy:** Complete CSV export with paise and INR. |
| `GET` | `/api/export/backup.json` | JSON Object | **CRITICAL DEFECT:** Incomplete backup; omits accounts, incomes, transfers. |
| `POST` | `/api/export/restore` | JSON Object | **Incomplete:** Cannot restore missing entities. |

---

## SECTION E — FINANCIAL CORRECTNESS REPORT

### 1. Monetary Unit & Decimal Precision
* **Standard Unit:** Integer **paise** ($1\text{ INR} = 100\text{ paise}$).
* **Database Representation:** `BigInteger` column in SQLAlchemy/PostgreSQL, preventing 32-bit integer overflow.
* **Core Helpers (`app/core/money.py`):**
  * `divide_round(total, count)`: Uses `decimal.Decimal` with `ROUND_HALF_UP` to round to the nearest whole paise.
  * `percent(part, whole)`: Uses `Decimal` quantized to `"0.1"` (e.g., $14.5\%$).
  * `format_inr(paise)`: Custom Indian numbering system formatter ($1,25,000.00$).

### 2. Verified Mathematical Correctness
* **Expense Totals:** $\sum \text{amount\_paise}$ correctly sums positive integers.
* **Negative & Zero Amounts:** Enforced at both layers:
  * Pydantic: `Field(gt=0, le=10**13)` rejects 0, negative values, and numbers greater than 100 billion INR.
  * Database: `CheckConstraint("amount_paise > 0")` prevents corrupt records from entering SQLite or PostgreSQL.
* **Account Ledger Formula:**
  $$\text{Current Balance} = \text{Opening Balance} + \sum \text{Incomes} - \sum \text{Expenses} + \sum \text{Transfers}_{\text{in}} - \sum \text{Transfers}_{\text{out}}$$
  * Correctly implemented in `app/services/bank_accounts.py:recalculate_account_balance()`.
  * Filters transactions strictly on $\text{transaction\_date} \ge \text{opening\_balance\_date}$ to prevent historical double-counting prior to account tracking.

### 3. Critical Financial Vulnerabilities Identified

#### A. The December Rollover Bug in Budgets
* **Location:** `backend/app/services/budgets.py:144` and `:177`
* **Vulnerable Code:**
  ```python
  next_month = date(month.year, month.month % 12 + 1, 1)
  ```
* **Failure Trace:**
  * Suppose `month = date(2026, 12, 1)`.
  * `month.month % 12 + 1` $= (12 \pmod{12}) + 1 = 0 + 1 = 1$.
  * `month.year` remains `2026`.
  * Resulting `next_month = date(2026, 1, 1)`.
  * The query executes: `WHERE expense_date >= '2026-12-01' AND expense_date < '2026-01-01'`.
  * **Result:** It is mathematically impossible for a date to be $\ge \text{Dec 1, 2026}$ and $< \text{Jan 1, 2026}$. Every December, budget spending returns **₹0.00** regardless of real expenses!

#### B. Desynchronized Ledger on Expense Deletion
* **Location:** `backend/app/services/expenses.py:delete_expense`
* **Vulnerable Code:**
  ```python
  def delete_expense(db: Session, expense_id: int) -> None:
      model = db.get(Expense, expense_id)
      if model is None:
          raise NotFoundError("Expense not found.")
      db.delete(model)
      db.commit()
  ```
* **Failure Trace:**
  * When an expense linked to `account_id=1` for ₹10,000 is deleted, `delete_expense` removes the row and commits.
  * It **never calls** `recalculate_account_balance(db, 1)`.
  * The bank account's `current_balance_paise` remains ₹10,000 short in the database until an external GET request or manual recalculation is triggered.
  * In contrast, `incomes.py:delete_income` correctly captures `account_id` and invokes `recalculate_account_balance(db, account_id)`.

#### C. Ambiguous Rupee-to-Paise Heuristic in Groq Normalization
* **Location:** `backend/app/services/groq_vision.py:175-180`
* **Vulnerable Code:**
  ```python
  if is_decimal_str or (num % 1 != 0):
      paise = int(round(num * 100))
  elif num < 1000:
      paise = int(round(num * 100))
  else:
      paise = int(round(num))
  ```
* **Failure Trace:**
  * If Groq extracts integer `500` for a ₹500 bill: $500 < 1000 \implies \text{paise} = 50,000$ (₹500.00) [Correct].
  * If Groq extracts integer `1500` for a ₹1500 bill (assuming LLM outputted rupees): $1500 \ge 1000 \implies \text{paise} = 1500$ (**₹15.00**!) [100x Understatement].
  * This cliff at 1000 introduces non-deterministic 100x pricing errors depending on whether Groq outputs rupees or paise.

---

## SECTION F — DATABASE AND MIGRATION REPORT

### 1. Schema & Relational Integrity

The database comprises **12 core tables**:

| Table | Primary Key | Foreign Keys | Constraints | Indexes |
|---|---|---|---|---|
| `expense_types` | `id` (Integer) | None | Unique `name_key` | `name_key`, `is_archived` |
| `bank_accounts` | `id` (Integer) | None | None | `is_archived` |
| `expenses` | `id` (Integer) | `expense_type_id` (RESTRICT), `account_id` (SET NULL) | `ck_expenses_amount_positive` | `expense_date`, `(date, id)`, `(type, date)`, `(account, date)` |
| `income_types` | `id` (Integer) | None | Unique `name_key` | `name_key`, `is_archived` |
| `incomes` | `id` (Integer) | `income_type_id` (RESTRICT), `account_id` (SET NULL) | `ck_incomes_amount_positive` | `income_date`, `(date, id)`, `(type, date)`, `(account, date)`, `idempotency_key` |
| `account_transfers` | `id` (Integer) | `from_account_id` (RESTRICT), `to_account_id` (RESTRICT) | `ck_transfers_amount_positive`, `ck_transfers_distinct_accounts` | `transfer_date`, `from_account_id`, `to_account_id`, `idempotency_key` |
| `budgets` | `id` (Integer) | None | `ck_budgets_amount_nonnegative`, Unique `budget_period` | `budget_period` |
| `category_budgets`| `id` (Integer) | None | `ck_category_budgets_amount_nonnegative`, Unique `(budget_period, category)` | `(budget_period, category)` |
| `balance_snapshots`| `id` (Integer) | `account_id` (CASCADE) | None | `account_id`, `snapshot_date` |
| `expense_idempotency_keys` | `id` (Integer) | `expense_id` (CASCADE) | Unique `idempotency_key` | `idempotency_key` |
| `security_alerts` | `id` (Integer) | `transaction_id` (SET NULL), `account_id` (SET NULL) | None | `transaction_id`, `account_id` |
| `notification_logs` | `id` (Integer) | None | None | `category`, `reference_id`, `is_read`, `created_at` |
| `user_preferences`| `id` (Integer) | None | Unique `key` | `key` |

### 2. SQLite vs. PostgreSQL Compatibility Audit

* **Type Decorator (`UTCDateTime`):** SQLite does not store timezones. `UTCDateTime` in `app/db/base.py` normalizes all stored values to UTC and outputs timezone-aware datetimes. However, `SecurityAlert`, `NotificationLog`, and `UserPreference` use raw `DateTime(timezone=True)`, which will drop timezone information in SQLite.
* **Foreign Key Constraints:**
  * SQLite disables foreign keys by default. MoneyTrack correctly attaches a connect event listener `PRAGMA foreign_keys=ON` on `sqlalchemy.engine.Engine`.
  * In Alembic migrations, `render_as_batch=settings.is_sqlite` is configured, enabling SQLite table rewriting during migrations.
* **Sequence Alignment:** In PostgreSQL, auto-increment columns rely on sequences (e.g., `expense_types_id_seq`). Migration `0006` includes `setval()` to realign PostgreSQL sequences after bulk inserting seed data.

### 3. Alembic Migration History & Risks
* **Latest Revision:** `0006_schema_sync_and_indexes`
* **Reversibility Hazard:** Migration `0006` has an empty `downgrade() -> None: pass`. It cannot be rolled back.
* **Destructive Downgrades in 0004:** Migration `0004_income_and_bank_accounts.py` drops `bank_accounts`, `incomes`, and `account_transfers` tables on downgrade. Rolling back migration 0004 will permanently destroy user data.
* **Production Startup Inconsistency:**
  * `render.yaml` specifies: `startCommand: "cd backend && alembic upgrade head && uvicorn app.main:app ..."`
  * `app/main.py:lifespan` runs: `run_startup_migrations()`
  * Alembic is executed twice on every deployment.

---

## SECTION G — SECURITY REPORT

### Vulnerability Classification Matrix

| Finding ID | Vulnerability Description | Severity | Affected Component | Impact | Recommended Remediation |
|---|---|---|---|---|---|
| **SEC-01** | **Unauthenticated Public API Exposure** | **CRITICAL** | Entire API (`backend/app/main.py`) | Any internet user can read, create, modify, or delete all financial records and bank balances. | Implement JWT or secure session bearer token authentication. Restrict non-public routes. |
| **SEC-02** | **Unrestricted Financial Data Exfiltration & Injection** | **CRITICAL** | `GET /api/export/backup.json`, `POST /api/export/restore` | Anonymous extraction of full transaction ledger; arbitrary record injection. | Protect export/restore behind administrative authentication and rate limiting. |
| **SEC-03** | **Unauthenticated AI Quota Drainage / DoS** | **HIGH** | `POST /api/receipts/parse`, `POST /api/receipts/parse-text` | Malicious actor can exhaust owner's Groq Cloud API quota by sending looped requests. | Apply token authentication and strict per-IP / per-token rate limiting. |
| **SEC-04** | **Unbounded Request Body Size (Memory Exhaustion)** | **MEDIUM** | `app/main.py`, `app/api/routes/exports.py` | Large multipart or JSON payloads (e.g., 500MB JSON) can cause Out-Of-Memory (OOM) crashes. | Add a global request body size limiter middleware (e.g., max 15MB). |
| **SEC-05** | **Permissive Wildcard CORS Configuration** | **MEDIUM** | `backend/Dockerfile:30`, `backend/app/core/config.py:90` | `CORS_ORIGINS=*` is set in Dockerfile, allowing arbitrary third-party web origins to call the API. | Remove wildcard fallback; restrict origins strictly to configured domain names. |
| **SEC-06** | **Live External API Execution During Automated Unit Tests** | **LOW** | `backend/tests/test_receipt_text.py` | Unit tests execute real HTTPS requests to Groq Cloud API, leaking mock receipt text and draining quota. | Mock `GroqVisionProvider` and `httpx.Client` across the entire test suite. |

### Security Evaluation Summary
* **Authentication:** **FAILED (None)**. The API is entirely open.
* **Authorization:** **FAILED (None)**. There is no user isolation; single-tenant database.
* **SQL Injection:** **PASSED**. No raw SQL string interpolation. All queries use SQLAlchemy ORM or parameterized literals.
* **XSS Protection:** **PASSED**. Security headers (`nosniff`, `X-Frame-Options: DENY`, `no-referrer`) set via middleware.
* **Secret Management:** **PASSED**. No secrets hardcoded in Python code; read via Pydantic settings.

---

## SECTION H — RECEIPT OCR REPORT

### 1. Full Pipeline Architecture

```
[ Image Upload / Capture ] (JPEG, PNG, WebP <= 10MB)
           │
           ▼
[ Route Handler: POST /api/receipts/parse ]
           │
           ├──► validate_image_bytes() [Magic Byte & Size Validation]
           │
           ▼
[ ReceiptParser.parse_image(scan_mode) ]
           │
           ├──► Mode "groq" or "both":
           │       └─ GroqVisionProvider.analyze_receipt()
           │            └─ Encode image as base64 data URI
           │            └─ Send chat completion to Groq (qwen/qwen3.8-27b)
           │            └─ Parse JSON response (merchant, date, total_paise, items)
           │
           ├──► Fallback / Mode "ocr":
           │       └─ TesseractOCRProvider.extract_text()
           │            └─ Execute subprocess: tesseract stdin stdout
           │            └─ RuleBasedReceiptParser.parse()
           │
           ▼
[ Result Merging & Type Classification ]
           │
           ├──► _merge_results(rule_result, ai_result)
           └──► TypeClassifier.apply_type_classification()
           │
           ▼
[ Proposed Expense JSON (NOT Persisted) ]
```

### 2. Critical Findings & Flaws

1. **Async Event Loop Starvation:**  
   `parse_receipt` is declared as `async def`. Calling synchronous `client.post()` (Groq) or `subprocess.run()` (Tesseract) on the asyncio thread blocks the entire server event loop for up to 30 seconds.
2. **Missing Tesseract in Production:**  
   The Render deployment uses `runtime: python` (native buildpack) instead of Docker. Tesseract is not installed in native Render Python environments. Local OCR fallback fails with `OCRUnavailableError`.
3. **Receipt Privacy & Storage:**  
   Image bytes are held only in memory during processing and are discarded immediately after parsing. No receipt images are stored on disk or database, ensuring excellent user privacy.
4. **Non-Automatic Persistence:**  
   OCR results are strictly returned as proposals (`ReceiptParseResponse`). The user must manually review, edit, and confirm before saving an expense. This correctly prevents bogus OCR data from corrupting the ledger.

---

## SECTION I — SMS PROCESSING REPORT

### 1. Ingestion Pipeline
* **Endpoint:** `POST /api/sms/ingest`
* **Account Suffix Matching:** Strictly extracts the last 4 digits (`.takeLast(4)`) from `account_suffix` or raw text (`XXX924375` $\rightarrow$ `4375`). Matches against `account_number_mask` and `account_name`.
* **Direction Routing:**
  * `DEBIT`: Resolves matching `ExpenseType` $\rightarrow$ calls `create_expense()`.
  * `CREDIT`: Resolves matching `IncomeType` $\rightarrow$ auto-creates "Other Income" if none exists $\rightarrow$ calls `create_income()`.
  * `UNKNOWN`: Returns `created=False`, transaction type `"queued"`.
* **Balance Synchronization:**
  * When `available_balance_paise > 0`, it records an immutable audit snapshot in `bank_balance_snapshots` and updates `account.last_reported_balance_paise`.

### 2. Vulnerabilities & Loopholes
* **In-Memory Volatility of Queued SMS:** If the backend cannot determine transaction direction (`status: queued`), the SMS is not persisted in a backend queue table; it relies entirely on the Android client to re-present the SMS.
* **No Manual Approval Audit Trail:** When the user confirms an ambiguous SMS from the frontend, it submits a regular `create_expense` call without linking back to the original SMS evidence string in the database.

---

## SECTION J — BACKUP AND RESTORE AUDIT

### **RATING: CRITICAL DATA LOSS DEFECT (P0)**

### 1. Incomplete Backup Payload
In `backend/app/services/exports.py:backup_json()`, the export payload is structured as:
```json
{
  "schema_version": 1,
  "application": "MoneyTrack",
  "application_version": "1.0.0",
  "exported_at": "2026-11-06T...",
  "expense_types": [ ... ],
  "expenses": [ ... ]
}
```

### 2. Missing Entity Audit
The following tables are **completely excluded** from `backup_json()`:
* $\times$ `bank_accounts` (All accounts, banks, opening balances, account numbers)
* $\times$ `incomes` (All income transactions)
* $\times$ `income_types` (All income categories)
* $\times$ `account_transfers` (All transfers between accounts)
* $\times$ `budgets` (All monthly budgets)
* $\times$ `category_budgets` (All category-specific budgets)
* $\times$ `balance_snapshots` (All historical reconciliation audit records)
* $\times$ `expenses.account_id` (The link between an expense and the paying bank account is discarded!)

### 3. Restore Consequences
If a user wipes their machine or migrates to a new database using `restore_json()`:
1. All income records, bank accounts, budgets, and transfers are **permanently lost**.
2. All restored expenses become orphaned from their bank accounts (`account_id` becomes null).
3. The restore operation succeeds and reports success, giving the user a false sense of security while their balance ledger is destroyed.

---

## SECTION K — PERFORMANCE REPORT

### 1. Measured Performance
* **Test Suite Duration:** 153 tests completed in **35.92 seconds**.
  * `test_route_missing_total`: **5.50s** (blocked on live Groq Cloud API call).
  * `test_text_conflicting_subtotal_and_total`: **4.15s** (blocked on live Groq call).
  * `test_text_negative_or_invalid_amount`: **2.47s** (blocked on live Groq call).
  * Fast tests (pure unit tests): $<10\text{ms}$ each.
* **Database Query Indexing:** `ix_expenses_date_id`, `ix_expenses_type_date`, `ix_incomes_date_id`, `ix_transfers_date` provide index seeks on date-bounded queries.

### 2. Architectural Bottlenecks (Unmeasured Theoretical Risks)
* **Read-Induced Aggregate Storm:** Calling `/api/cashflow/summary` triggers $4 \times N$ SQL aggregate queries and $N$ database commits, locking database rows on read requests.
* **In-Memory Analytics Overhead:** `app/services/analytics.py:summary()` loads every individual `Expense` ORM model into Python memory via `_load_expenses()`. For 20,000 transactions over several years, this will allocate megabytes of memory and take hundreds of milliseconds in Python garbage collection.
* **Event Loop Blocking in Receipts:** An upload of an image can freeze the entire Uvicorn worker process for 20 seconds.

---

## SECTION L — TESTING REPORT

### 1. Test Execution Summary
* **Command Executed:**
  `& "backend\.venv\Scripts\python.exe" -m pytest backend/tests --durations=10`
* **Outcome:** **153 passed, 8 deprecation warnings in 35.92s**.
* **Deprecation Warnings:**
  * Starlette `TestClient` AnyIO Portal deprecation.
  * Pydantic V2 `@validator` deprecation in `backend/app/schemas/budget.py` (lines 10 and 27).

### 2. Test Suite Breakdown
* `test_expenses.py` (22 tests) — CRUD, pagination, sorting, search, positive amount constraints.
* `test_income_and_bank_accounts.py` (25 tests) — Incomes, bank accounts, transfers, ledger balance formulas.
* `test_analytics.py` (16 tests) — Date bucketing, recurring types, category share.
* `test_idempotency.py` (8 tests) — Idempotency key replay, header checks.
* `test_receipts_api.py`, `test_receipt_parser.py`, `test_receipt_text.py` (38 tests) — OCR text parsing, rule matching.
* `test_exports_and_persistence.py`, `test_restore.py` (14 tests) — CSV export, JSON backup/restore.
* `test_security_and_weekly_report.py` (18 tests) — Fraud alerts, weekly report boundaries.
* `test_cors.py`, `test_health.py` (12 tests) — CORS headers, health checks.

### 3. Critical Uncovered Test Cases
* $\times$ No tests for December year rollover in `budgets.py`.
* $\times$ No tests verifying bank account balance changes after `DELETE /api/expenses/{id}` or `PUT /api/expenses/{id}`.
* $\times$ No tests verifying concurrency / database locking when simultaneous transfers occur.
* $\times$ No tests asserting that restore preserves bank accounts and incomes (because the feature is missing).

---

## SECTION M — IMPROVEMENT ROADMAP

### Prioritized Remediation Plan

| Priority | Improvement | Reason | Risk If Ignored | Affected Files | Complexity | Dependencies |
|---|---|---|---|---|---|---|
| **P0** | **Implement API Authentication & User Isolation** | Public internet API is completely open to the world. | Data breach, unauthorized exfiltration, malicious data deletion. | `main.py`, `core/security.py`, `api/deps.py` | High | Frontend & Android auth support |
| **P0** | **Fix Event-Loop Blocking in Receipt Endpoints** | Synchronous Groq/OCR calls in `async def` freeze server for 20-30s. | Denial of Service; health checks fail; server freezes for all users. | `api/routes/receipts.py`, `services/groq_vision.py` | Medium | None (Backend internal) |
| **P0** | **Comprehensive Multi-Table Backup & Restore (v2)** | `backup_json` omits accounts, incomes, transfers, budgets. | Permanent catastrophic data loss upon restore. | `schemas/exports.py`, `services/exports.py` | High | Database schema migration v2 |
| **P1** | **Fix December Month Rollover Bug in Budgets** | `month.month % 12 + 1` sets year to same year, causing 0 spend in Dec. | Incorrect financial reports and budget tracking every December. | `services/budgets.py:144,177` | Low | None |
| **P1** | **Recalculate Bank Balance on Expense Update & Delete** | `update_expense` and `delete_expense` leave ledger desynchronized. | Corrupted account balances; false reconciliation variances. | `services/expenses.py` | Low | None |
| **P1** | **Eliminate Write Commits & N+1 Queries on GET Endpoints** | `cashflow_summary` and `list_accounts` run 20 queries + 5 commits on read. | Database write contention, transaction locking, slow response times. | `services/cashflow.py`, `services/bank_accounts.py` | Medium | Fix for expense balance sync |
| **P1** | **Atomic Budget Upsert (Eliminate Split Transaction)** | Delete is committed before insert in `create_monthly_budget`. | Permanent loss of budget if crash occurs between commits. | `services/budgets.py:30-38` | Low | None |
| **P2** | **Replace Ambiguous `<1000` Groq Normalization Cliff** | Guessing whether LLM returned rupees or paise causes 100x errors. | Severe 100x miscalculation in expense tracking from receipts. | `services/groq_vision.py:175-180` | Low | None |
| **P2** | **Mock Groq Cloud in Automated Unit Tests** | Tests make live HTTPS calls to Groq API. | Test suite takes 36s; drains user API quota; fails when offline. | `tests/conftest.py`, `tests/test_receipt_text.py` | Low | None |
| **P2** | **Add Transfer Edit & Delete Endpoints** | Users cannot correct or delete accidental internal transfers. | Uncorrectable financial ledger errors. | `api/routes/transfers.py`, `services/transfers.py` | Medium | Frontend UI support |
| **P3** | **Prune Orphaned `app/api/endpoints/` Directory** | Duplicate, outdated router files confuse maintainers. | Confusion; risk of importing outdated routes. | `app/api/endpoints/` | Low | None |
| **P3** | **Migrate Budget Schemas to Pydantic V2 `@field_validator`** | Deprecated `@validator` raises warnings and will fail in Pydantic V3. | Future library upgrade breakage. | `schemas/budget.py` | Low | None |
| **P3** | **Align SQLAlchemy Models to 2.0 Syntax & `UTCDateTime`** | `SecurityAlert` and `NotificationLog` use 1.x syntax and drop timezones. | Timezone bugs in SQLite; inconsistent ORM codebase. | `models/security_alert.py`, `models/notification_log.py` | Low | None |
| **P4** | **Database-Level SQL Aggregation for Analytics** | In-memory Python summation of ORM objects does not scale. | High memory consumption and latency on multi-year queries. | `services/analytics.py` | Medium | None |

---

## SECTION N — FINAL RECOMMENDATION

### 1. What Must Be Fixed Immediately (Before Production Launch / Multi-User Release)
1. **API Authentication Barrier (P0):** If deployed to public Render, attach a protective API secret header or user token authentication immediately.
2. **Restore Event Loop Concurrency (P0):** Convert `async def parse_receipt` to standard `def parse_receipt` (so FastAPI threadpools it) or use `async with httpx.AsyncClient()`.
3. **Overhaul Backup & Restore (P0):** Update backup schema to include all tables so users do not suffer irreversible data loss.
4. **Fix Budget December Rollover & Expense Delete Balance Sync (P1):** Correct the date calculation in `budgets.py` and invoke balance recalculation in `expenses.py:delete_expense`.

### 2. What Can Safely Wait
* Migrating analytics calculations from in-memory Python summation to SQL aggregates (performance is acceptable under small personal dataset sizes < 5,000 transactions).
* Adding internal transfer edit/delete endpoints.
* Pruning the orphaned `endpoints/` directory.

### 3. What Should NOT Be Changed
* **The Integer Paise Monetary Core:** Storing currency in integer paise ($1 = 100$) in `BigInteger` columns is mathematically sound and must be strictly preserved.
* **The Idempotency Key Architecture:** The `ExpenseIdempotencyKey` pattern works flawlessly to prevent duplicate network submissions.
* **The 4-Digit Bank Account Masking Rule:** Masking accounts to the last 4 digits preserves privacy and matches Indian banking standards.
* **Non-Automatic OCR Saving:** Keeping OCR extraction as a proposal rather than auto-committing to the database is essential for preventing hallucinated expenses.

### 4. Boundary Impact Analysis
* **Requires Database Schema Migrations:**
  * Backup v2 schema version bump (no table changes required, but schema format changes).
  * Adding a `pending_sms_transactions` table (if server-side SMS queue persistence is desired).
* **Requires Frontend Changes:**
  * Authentication token propagation in API requests (`Authorization: Bearer <token>`).
  * Handling updated v2 backup/restore formats.
* **Requires Android Native Changes:**
  * Passing authentication token in `SyncWorker.kt` HTTP requests.
* **Can Be Made Entirely Within Backend (Zero Client Impact):**
  * Event loop blocking fix in `receipts.py`.
  * December rollover fix in `budgets.py`.
  * Expense update/delete bank balance sync in `expenses.py`.
  * Atomic budget upsert in `budgets.py`.
  * Unit test Groq mocking in `conftest.py`.
  * Orphaned directory cleanup.

---

*(Report compiled and saved as `MONEYTRACK_BACKEND_AUDIT_REPORT.md` in the project root.)*
