# MONEYTRACK — IMPLEMENTATION BASELINE REPORT (PHASE 0)

**Date:** November 6, 2026  
**Auditor/Engineer:** Antigravity AI Systems Engineer  
**Execution Context:** Read-only inspection of repository `d:\MoneyTrack` at commit `25acdc0`  

---

## 1. Git Repository & Working Tree State

* **Active Branch:** `main`
* **Upstream:** `origin/main` (Up to date)
* **Latest Commit:** `25acdc0` (`Complete MoneyTrack frontend redesign`)
* **Recent Commits:**
  * `25acdc0` Complete MoneyTrack frontend redesign
  * `48031c7` feat(sms,ui,balance): last-4-digit account matching, income and balance sync from bank SMS, and UI redesign
  * `b665855` feat: implement multi-layer keep-alive and connection resilience to prevent Render sleep
  * `10314d0` fix(scanner): repair receipt OCR Groq vision flow, expense saving, and mobile navigation
  * `ad88474` fix: improve expense creation and OCR integration
* **Working Tree State:**
  * Modified (unstaged):
    * `frontend/src/components/CashflowHeroCard.tsx` (Micro typography and badge padding polish)
    * `frontend/src/index.css` (Segmented button active style and typography cleanup)
  * Untracked:
    * `MONEYTRACK_BACKEND_AUDIT_REPORT.md` (48 KB comprehensive audit report)

---

## 2. Architecture & Tech Stack Baseline

### Backend
* **Runtime:** Python 3.11.9
* **Framework:** FastAPI 0.115.x, Uvicorn 0.32.x, Starlette
* **ORM & Database Tooling:** SQLAlchemy 2.0.36, Alembic 1.14.0, Pydantic v2.10.x, Pydantic-Settings
* **Database Engine:**
  * **Local Environment:** SQLite 3 at `backend/data/moneytrack.db` (266,240 bytes) with `PRAGMA foreign_keys=ON` event listener.
  * **Production Environment:** Neon Serverless PostgreSQL (`postgresql+psycopg2://` or `postgresql+psycopg://`) on Render.
* **OCR & AI:**
  * Groq Cloud API (`qwen/qwen3.8-27b`) via `httpx.Client` (synchronous)
  * Tesseract OCR fallback via `subprocess.run(["tesseract", ...])`
* **Current Deployments:**
  * Production Backend: `https://moneytrack-backend-g5is.onrender.com`
  * Production Frontend: `https://moneytrack-frontend-bujt.onrender.com`

### Frontend
* **Runtime:** React 18.3.1, TypeScript 5.7.2, Vite 6.4.5, Tailwind CSS 3.4.17
* **Charts & Icons:** Recharts 2.15.0, Lucide React 0.469.0
* **Mobile Packaging:** Capacitor Android 8.5.3 (`android/app`)
* **Test Runner:** Vitest 5.0.5 (`--pool=forks`)

---

## 3. Database Models, Schemas & Migrations

### 12 Database Tables
1. `expense_types`: User expense categories with unique `name_key` and soft-delete `is_archived`.
2. `bank_accounts`: Accounts with 4-digit masking, opening balance, and last reported balance.
3. `expenses`: Expense records with integer `amount_paise` (BigInteger), links to `expense_types` and `bank_accounts`.
4. `income_types`: Income categories with unique `name_key` and soft-delete `is_archived`.
5. `incomes`: Income transactions with integer `amount_paise`, idempotency key, and account links.
6. `account_transfers`: Double-entry transfers between two bank accounts.
7. `budgets`: Overall monthly budgets with unique `budget_period` (`YYYY-MM`).
8. `category_budgets`: Per-category monthly budgets.
9. `balance_snapshots`: Historical audit trail of reported account balances.
10. `expense_idempotency_keys`: Prevents duplicate expense insertions on network retry.
11. `security_alerts`: Heuristic fraud alerts (high amount, new merchant, rapid debits).
12. `notification_logs`: Notification history.
13. `user_preferences`: Key-value storage for app preferences.

### Alembic Migrations
* `0001_initial_schema.py`
* `0002_budget_tables.py`
* `0003_idempotency_keys.py`
* `0004_income_and_bank_accounts.py`
* `0005_security_and_notifications.py`
* `0006_schema_sync_and_indexes.py` (Current Head)

---

## 4. Authentication & Security Status

* **Authentication:** **Completely absent**. All endpoints under `/api/*` are accessible without tokens or credentials.
* **Authorization / User Isolation:** **None**. The database is single-tenant without user foreign keys or ownership filters.
* **CORS:** Broad origin regex `^https:\/\/moneytrack-frontend.*\.onrender\.com$` and local origins.
* **Security Headers:** Basic middleware setting `nosniff`, `X-Frame-Options: DENY`, `no-referrer`.

---

## 5. API Routes & Endpoint Inventory

The application mounts `api_router` under prefix `/api`:
* `/api/health` (`GET`)
* `/api/expenses` (`GET`, `POST`), `/api/expenses/{id}` (`GET`, `PUT`, `PATCH`, `DELETE`)
* `/api/expense-types` (`GET`, `POST`), `/api/expense-types/{id}` (`GET`, `PUT`, `PATCH`, `DELETE`, `/archive`, `/unarchive`, `/summary`)
* `/api/incomes` (`GET`, `POST`), `/api/incomes/{id}` (`GET`, `PUT`, `PATCH`, `DELETE`)
* `/api/income-types` (`GET`, `POST`), `/api/income-types/{id}` (`GET`, `PUT`, `PATCH`, `DELETE`)
* `/api/bank-accounts` (`GET`, `POST`), `/api/bank-accounts/{id}` (`GET`, `PUT`, `PATCH`, `DELETE`, `/recalculate`, `/report-balance`)
* `/api/bank-accounts/reconciliation/summary` (`GET`)
* `/api/transfers` (`GET`, `POST`) [Note: missing `PUT` and `DELETE`]
* `/api/budgets` (`GET`, `POST`), `/api/budgets/summary` (`GET`), `/api/budgets/category` (`GET`, `POST`, `DELETE`)
* `/api/analytics` (`/summary`, `/by-type`, `/trends`, `/comparison`)
* `/api/cashflow`, `/api/cashflow/summary` (`GET`)
* `/api/receipts/parse` (`POST`), `/api/receipts/parse-text` (`POST`)
* `/api/sms/ingest` (`POST`)
* `/api/security/alerts`, `/api/notifications`
* `/api/reports/weekly`, `/api/weekly-report`, `/api/weekly`
* **Export Routes:**
  * `/api/export/expenses.csv` (`GET`)
  * `/api/export/backup.json` (`GET`)
  * `/api/export/restore` (`POST`)
  * Note: Frontend calls `/export/*`. Singular `/export` is currently registered. Adding `/exports` alias guarantees compatibility for both singular and plural.

---

## 6. Backup & Restore v1 Inspection

* **Current Implementation:** `backend/app/services/exports.py`
  * `backup_json()` only serializes `expense_types` and `expenses`.
  * **Completely omits:** `bank_accounts`, `incomes`, `income_types`, `account_transfers`, `budgets`, `category_budgets`, `balance_snapshots`, and `expenses.account_id`.
  * **Consequence:** Restoring from a backup causes permanent loss of all non-expense financial data and severs account linkages.

---

## 7. Render Deployment Configuration

* `render.yaml` defines:
  * Backend: Python 3.11 web service, command `cd backend && alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
  * Frontend: Static site from `frontend/dist`.
  * Health check: `/health`.
  * Keep-alive ping configured every 12 minutes to `https://moneytrack-backend-g5is.onrender.com`.

---

## 8. Test Execution Baseline

### Backend Tests
* **Command:** `& "backend\.venv\Scripts\python.exe" -m pytest backend/tests`
* **Result:** **153 passed in 88.87 seconds**.
* **Warnings (8 total):**
  * 1 Starlette `TestClient` AnyIO Portal deprecation warning.
  * 5 Pydantic V2 ConfigDict deprecation warnings.
  * 2 Pydantic V1 `@validator` deprecation warnings in `backend/app/schemas/budget.py` (lines 10 and 27).
* **Observation:** Several OCR and receipt text tests took multiple seconds due to live HTTPS calls to Groq API over the internet.

### Frontend Tests
* **Command:** `npm test` (`vitest run --pool=forks`)
* **Result:** **6 test files passed, 45 tests passed in 339ms**.
  * `src/utils/quickChips.test.ts`: 3 passed
  * `src/utils/receipt.test.ts`: 6 passed
  * `src/services/offlineQueue.test.ts`: 3 passed
  * `src/utils/currency.test.ts`: 6 passed
  * `src/utils/periods.test.ts`: 7 passed
  * `src/services/api.test.ts`: 20 passed

### Frontend Typecheck & Build
* **Command:** `npm run typecheck` (`tsc --noEmit`)
* **Result:** 2 TypeScript errors:
  * `src/pages/HomePage.tsx(9,3): error TS6133: 'Sparkles' is declared but its value is never read.`
  * `src/pages/HomePage.tsx(12,3): error TS6133: 'Zap' is declared but its value is never read.`
  * Fixing these 2 unused imports will make the frontend build completely clean.

---

## 9. Baseline Verification Verdict

Baseline inspection is complete. No application source code was modified during this phase. All findings from `MONEYTRACK_BACKEND_AUDIT_REPORT.md` have been confirmed against the live source code and database files.
