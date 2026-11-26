# MoneyTrack — Master End-to-End Audit

**Audit Date:** 2026-11-26  
**Audited Baseline:** Commit `a781c219020e14ce100ad2f8602ccf8362024766` on `main` (building on `bfcdfff` and OpenCode baseline `f917b99`)  
**Database Target:** Neon PostgreSQL 18 (production) & SQLite (local/test)  
**Verified Automated Baseline:** Backend `pytest` 225/225 passing; Frontend `vitest` 61/61 passing, `tsc --noEmit` passing, `vite build` passing; Android `gradlew.bat test` & `assembleDebug` passing.

---

## 1. Executive Assessment

MoneyTrack has strong core architectural primitives: integer-paise monetary storage (`backend/app/core/money.py`), multi-tenant SQL scoping paired with PostgreSQL composite foreign keys (`0010_tenant_evidence_fk.py`), a 5-layer SMS reconciliation engine across Kotlin and Python, and an updated green-accent (`#16845B` / `#36B889`) React 18 + Tailwind CSS frontend shipped in commit `bfcdfff`.

However, reconciling the full OpenCode historical audit (`C:\Users\velmu\.opencode\plan\`, `docs/engineering/MASTER_DEFECT_REGISTER.md`, and `docs/frontend-redesign/`) against the live codebase confirms that **multiple P0 and P1 defects remain open in production code**, alongside an active Neon Free-Tier compute quota exhaustion (`110.27 / 100 CU-hrs`) that blocked Render deployment startup until keep-alive pings were disabled in `a781c21`.

### Summary Scorecard by Domain

| Domain | Health | Critical (P0) Open | High (P1) Open | Key Risk |
|---|---|---:|---:|---|
| **Security & Tenancy** | Needs Hardening | 3 (`C1`, `C15`, `C18`) | 5 (`C13`, `C20`, `C27`, `C28`, `V5`/`D13`) | Global DEBIT idempotency key leak, exported debug intent backdoor, cross-tenant restore type binding |
| **Financial Correctness** | High Risk on Edge Paths | 3 (`C2`, `C16`, `C17`) | 8 (`C3`, `C4`, `C5`, `C6`, `C9`, `C10`, `C11`, `C14`) | Android sync fallback turning CREDIT/UNKNOWN into EXPENSE, non-atomic transfers, swallowed recalc errors, `> 0` balance gates |
| **Backend & API** | Mostly Solid, Targeted Bugs | 1 (`C1`/`C18` shared) | 4 (`C20`, `C21`, `C41`, `P10`) | `weekly_report.py` `acc.name` `AttributeError` crash (`C21`), global `UserPreference.key` crash for 2nd user (`C20`) |
| **Frontend UI** | Redesigned, Gaps Remain | 0 | 9 (`C12`, `C34`, `C36`, `C39`, `C45`, `C48`, `C50`, `C55`, `P35`) | Missing `/budgets` UI, income page-only totals, negative weekly net sign bug, Android back vs Modal listener |
| **Android Native** | Functional, Concurrency/Sync Gaps | 2 (`C2`/`C17`, `C15`) | 4 (`C22`, `C23`, `C24`, `C25`, `C26`) | `SmsReceiver` `notified=true` before check (`C22`), single-keyword promo drops (`C26`), per-instance file locks (`C23`) |
| **Database & Infra (Neon)** | Blocked on Quota | 0 | 2 (`C13`, Neon quota) | Neon project `ep-silent-frost-b5ee0dqt` hit 100 CU-hr limit; Dockerfile lacks `.dockerignore` and non-root user |

---

## 2. Newly Resolved Items Since OpenCode Baseline (`f917b99`)

Before evaluating open risks, the following defects from the OpenCode register were **verified fixed** in commits `bfcdfff` and `a781c21`:
- **`C19`** (`backend/app/services/incomes.py`): Missing `IntegrityError` import fixed + regression test added in `backend/tests/test_income_and_bank_accounts.py`.
- **`C31`** (`frontend/src/services/api.ts:690-702`): `downloadExport()` now attaches `Authorization: Bearer <token>`.
- **`C32`** (`frontend/src/services/api.ts:571-575`): `reportBankBalance()` now sends `?reported_balance_paise=...` query parameter matching `backend/app/api/routes/bank_accounts.py:97-100`.
- **`C33`** (`frontend/src/pages/ExpensesPage.tsx:75-119`): Amount filter now stores rupees strings in URL params and converts via `parseRupeesToPaise()` one-way.
- **`C38`** (`frontend/src/components/ReceiptScannerModal.tsx:80-153`): Camera attaches stream directly and cleans up tracks via `stopCamera()` on unmount.
- **`C40`** (`frontend/src/pages/LoginPage.tsx:24-34`): Syncs `isRegisterMode` via `useEffect` when `isInitialSetup` or query mode resolves.
- **`C57`** (`backend/app/main.py:107-146`): Added `seed_default_income_types()` in startup `lifespan()` so new users start with 8 standard income categories (though custom income-type creation UI remains missing).
- **`D29` / `D30`** (`frontend/src/hooks/useApiQuery.ts`, `AuthProvider.tsx`, `IncomePage.tsx`, `BankAccountsPage.tsx`, `TransfersPage.tsx`): Fixed TTL cache math, added `active` cancellation guard, cleared cache on login/register/logout, and wired `invalidate()` across mutation pages.
- **Keep-Alive Quota Burn** (`render.yaml`, `.github/workflows/keep_alive.yml`): Disabled 24/7 12-minute keep-alive pings in `a781c21`.

---

## 3. Confirmed Release Blockers (P0 & Immediate P1)

1. **`C1` / `P10` — Cross-Tenant DEBIT Idempotency Key Collision (`P0`)**: `ExpenseIdempotencyKey.idempotency_key` (`backend/app/models/idempotency_key.py:25-27`) is globally unique without `user_id`, and `sms_ingest.py:288-294` replays via unscoped `db.get(Expense, existing_key.expense_id)`.
2. **`C2` / `C16` / `C17` — Unsafe Direction Default & Android Fallback (`P0`)**: `SmsIngestRequest.direction` defaults to `"DEBIT"` (`backend/app/schemas/sms_ingest.py:20`), `SyncWorker.kt:342-348` falls back to `POST /api/expenses` on ingest errors, and `SyncWorker.kt:362` collapses `UNKNOWN` to `"DEBIT"`.
3. **`C15` — Unauthenticated Exported `TEST_NOTIFICATION` Intent (`P0`)**: `MainActivity.kt:41-102` processes `com.moneytrack.app.TEST_NOTIFICATION` even in release builds.
4. **`C18` / `C29` — Cross-Tenant Restore Type Binding & Transfer Duplication (`P0`)**: `exports.py:411-412,508-509` loads all users' types on restore; `exports.py:680-711` lacks transfer deduplication.
5. **`C20` / `C21` / `C27` / `C28` — Multi-User Runtime Crashes & System Type Corruption (`P1`)**:
   - `user_preference.py:17`: `key` globally unique -> 2nd user hits `IntegrityError` 500.
   - `weekly_report.py:185`: `acc.name` -> `AttributeError` 500 when any expense has an `account_id`.
   - `income_types.py:96-123`: Any tenant can modify/archive `user_id IS NULL` shared income types.
   - `auth.py:27-40`: `SYSTEM_EXPENSE_TYPE_KEYS` mismatches `name_key()` spacing (`food_&_dining` vs `food & dining`).
6. **`C22` / `C26` — Android Notification & Eligibility Regressions (`P1`)**: `SmsReceiver.kt:83,90,124` sets `notified=true` before notification dispatch; `SmsEligibility.kt:13-16,38` drops bank confirmations containing `"market"`, `"offer"`, `"discount"`, `"won"`, or `"reward"`.
7. **Neon Production Database Quota (`Infra Blocker`)**: `ep-silent-frost-b5ee0dqt-pooler.c-7.us-east-2.aws.neon.tech` is rejecting connections due to monthly quota limit (`110.27 / 100 CU-hrs`).

---

## 4. Accompanying Audit Suite

Full evidence, reconciliation matrices, skills inventory, master backlog, and phased execution plan are recorded in:
- [MONEYTRACK_PREVIOUS_AUDIT_RECONCILIATION.md](file:///D:/MoneyTrack/docs/audits/MONEYTRACK_PREVIOUS_AUDIT_RECONCILIATION.md)
- [MONEYTRACK_SECURITY_AUDIT.md](file:///D:/MoneyTrack/docs/audits/MONEYTRACK_SECURITY_AUDIT.md)
- [MONEYTRACK_FINANCIAL_CORRECTNESS_AUDIT.md](file:///D:/MoneyTrack/docs/audits/MONEYTRACK_FINANCIAL_CORRECTNESS_AUDIT.md)
- [MONEYTRACK_FRONTEND_AUDIT.md](file:///D:/MoneyTrack/docs/audits/MONEYTRACK_FRONTEND_AUDIT.md)
- [MONEYTRACK_ANDROID_AUDIT.md](file:///D:/MoneyTrack/docs/audits/MONEYTRACK_ANDROID_AUDIT.md)
- [MONEYTRACK_DATABASE_AND_INFRASTRUCTURE_AUDIT.md](file:///D:/MoneyTrack/docs/audits/MONEYTRACK_DATABASE_AND_INFRASTRUCTURE_AUDIT.md)
- [MONEYTRACK_MASTER_TODO.md](file:///D:/MoneyTrack/docs/audits/MONEYTRACK_MASTER_TODO.md)
- [MONEYTRACK_SKILLS_INVENTORY.md](file:///D:/MoneyTrack/docs/audits/MONEYTRACK_SKILLS_INVENTORY.md)
- [MONEYTRACK_IMPLEMENTATION_ROADMAP.md](file:///D:/MoneyTrack/docs/audits/MONEYTRACK_IMPLEMENTATION_ROADMAP.md)
