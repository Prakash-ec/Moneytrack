# MoneyTrack Master TODO Backlog

**Baseline Commit:** `a781c219020e14ce100ad2f8602ccf8362024766`  
**Target Stack:** FastAPI + SQLAlchemy 2 + Neon PostgreSQL 18 + React 18 + Android Capacitor 8.5  
**Priority Scale:** `P0` = Release/Data-Loss/Security Blocker · `P1` = High Severity / Multi-User Breakage · `P2` = Medium UX/Correctness Improvement · `P3` = Polish / Nice-to-have

---

## P0 — Critical Security & Financial Integrity Blockers

| ID | Domain | Summary & File Location | Acceptance Criteria |
|---|---|---|---|
| **C1** | Backend / DB | `ExpenseIdempotencyKey.idempotency_key` globally unique without `user_id` (`backend/app/models/idempotency_key.py:25-27`); unscoped lookup in `sms_ingest.py:288-294` | Add `user_id` column + composite unique `(user_id, idempotency_key)` via new Alembic migration; scope all idempotency reads/writes by `user_id` |
| **C2** | Android | `SyncWorker.kt:341-349` falls back to `POST /api/expenses` when `/api/sms/ingest` returns `null` | Never fall back to `/api/expenses` for `CREDIT`, `TRANSFER`, or `UNKNOWN`; only queue/retry `/api/sms/ingest` |
| **C15** | Android | `MainActivity.kt:41-48` handles `com.moneytrack.app.TEST_NOTIFICATION` in release builds and logs intent extras | Guard `TEST_NOTIFICATION` strictly with `BuildConfig.DEBUG` and remove sensitive extras logging |
| **C16** | Backend | `SmsIngestRequest.direction` defaults to `"DEBIT"` (`backend/app/schemas/sms_ingest.py:20`) | Default `direction` to `"UNKNOWN"` so missing/ambiguous direction enters `PENDING_REVIEW` (`AMBIGUOUS_REVIEW`) |
| **C17** | Android / Web | `SyncWorker.kt:362` collapses non-CREDIT to `"DEBIT"`; `SmsReviewPage.tsx` needs explicit `UNKNOWN` direction handling | Send `"UNKNOWN"` for unknown SMS direction and require user confirmation in `SmsReviewPage` |
| **C18** | Backend | `exports.py:411-412,508-509` loads all users' `ExpenseType`/`IncomeType` during `restore_json()` | Scope restore type lookups to `current_user.id` (or safe read-only system type resolution) |

---

## P1 — High Severity Correctness, Tenancy & Stability Fixes

| ID | Domain | Summary & File Location | Acceptance Criteria |
|---|---|---|---|
| **C3** | Backend | `expenses.py:211-216` swallows `recalculate_account_balance` exceptions with `try/except Exception: pass` | Propagate recalculation errors inside the same transaction so account balances never silently drift |
| **C4** | Backend | `sms_ingest.py:572,780` and `bank_accounts.py:100` enforce `> 0` (`gt=0`) for reported bank balance | Allow `>= 0` (`ge=0`) so legitimate zero-balance accounts reconcile accurately |
| **C9** | Backend | `transfers.py` commits transfer, then calls `recalculate_account_balance` twice across 3 separate commits | Perform transfer + both account balance recalculations atomically in one transaction (`AGENTS.md` Invariant #6) |
| **C10** | Backend | `sms_ingest.py:190,195` uses UTC `date.today()` instead of IST (`today_ist()`) | Use IST date helper so late-night Indian SMS dates match IST calendar days |
| **C13** | Infra | `backend/Dockerfile` runs as `root`, lacks `.dockerignore`, defaults to wildcard CORS & SQLite | Add `backend/.dockerignore`, switch container to non-root user, remove permissive `CORS_ORIGINS=*` fallback |
| **C20** | Backend / DB | `UserPreference.key` globally unique (`user_preference.py:17`) — 2nd user crashes saving notification preferences | Replace global unique with `(user_id, key)` via Alembic migration and scope queries by `user_id` |
| **C21** | Backend | `weekly_report.py:185` accesses `acc.name` instead of `acc.account_name` (`AttributeError` 500) | Use `acc.account_name` and add regression test for weekly report with linked bank account |
| **C22** | Android | `SmsReceiver.kt:82-92` leaves `notified` unchanged when updating existing `PENDING_REVIEW` record | Persist `notified = (existing?.notified == true) || notify` |
| **C26** | Android | `SmsEligibility.kt` single promo keyword match drops valid bank debit/credit confirmation SMS | Check explicit bank confirmation signals before quarantining solely on footer promo terms |
| **C27** | Backend | `income_types.py:96-123` allows any user to modify/archive `user_id IS NULL` system income types | Reject non-owner edits/archives on system (`user_id IS NULL`) income types with 403/404 |
| **C28** | Backend | `auth.py:27-53` `SYSTEM_EXPENSE_TYPE_KEYS` uses underscores (`food_&_dining`) mismatched with `name_key()` | Align `SYSTEM_EXPENSE_TYPE_KEYS` / `SYSTEM_INCOME_TYPE_KEYS` with exact `name_key()` normalization |
| **C29** | Backend | `exports.py:680-711` restores transfers without deduplication | Deduplicate restored transfers by `idempotency_key` / signature within tenant scope |
| **C34** | Frontend | `IncomePage.tsx` displays page-sum instead of server `total_paise` across paginated results | Render server-returned `total_paise` for filtered totals |
| **C35** | Frontend | `IncomePage.tsx` does not reset pagination to page 1 when filters change | Reset page to `1` on filter changes |
| **C36** | Frontend | `WeeklyReportPage.tsx` formats net cashflow with missing/inconsistent sign on negative net | Render signed net cashflow accurately (including negative `−₹...`) |
| **C37** | Frontend | `SecurityCentrePage.tsx:326-328` truncates `tel:` href at first space (`phone.split(' ')[0]`) | Preserve full callable phone number in `tel:` URI |
| **C39** | Frontend | `useAndroidBackButton.ts:40-47` dispatches `Escape` on `window` instead of `document` | Dispatch `Escape` on `document` so `Modal.tsx` listener closes active modals |
| **C41** | Backend | `notifications.py:119` overwrites full preferences JSON instead of merging partial updates | Merge partial preference fields cleanly before persisting |
| **P10** | Backend | `transfers.py` lacks `IntegrityError` handling on duplicate `idempotency_key` | Catch `IntegrityError` and replay existing tenant transfer with `replayed=True` |
| **P13 / V4** | Backend | `schemas/auth.py` lacks `max_length=72` matching bcrypt 72-byte limit | Enforce `max_length=72` on password fields to prevent silent truncation / DoS errors |
| **P15** | Backend | `exports.py:96-110` CSV cells lack formula injection (`=`, `+`, `-`, `@`) escaping | Prefix dangerous leading CSV formula characters safely on export |
| **P20** | Backend | `auth.py` `authenticate_user` skips dummy password verification for unknown emails & leaks inactive user state | Run constant-time dummy bcrypt check on unknown emails and return uniform invalid-credentials error |
| **P35** | Frontend | `AuthProvider.tsx` clears auth token on transient/offline network failures | Only clear token on HTTP 401/403; preserve offline session when backend is unreachable |

---

## P2 / P3 — Feature Gaps, Concurrency & Polish

| ID | Domain | Summary |
|---|---|---|
| **C5 / C6 / C11 / C14** | Backend Finance | Negative transfer/refund edge cases, row locking (`SELECT FOR UPDATE`) on balance recalculation, credit-card / opening-balance date edge handling |
| **C12 / C45 / C48 / C50 / C55** | Frontend | Missing `/budgets` dedicated UI, `IncomePage` custom income type creation (`C57-UI`), `P25` `parseRupeesToPaise` in `SmsReviewPage`, filter/export polish |
| **C23 / C24 / C25** | Android | `TransactionStore.kt` cross-instance file synchronization, WorkManager network constraint tuning, battery optimization guidance |
| **Neon Infra** | Database | Upgrade or wait for Neon monthly Free-Tier quota reset (`110.27 / 100 CU-hrs`) so Render backend can reconnect |
