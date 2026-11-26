# MoneyTrack Implementation Roadmap (F0–F10)

**Baseline:** Commit `a781c219020e14ce100ad2f8602ccf8362024766`  
**Strategy:** Land highest-severity P0/P1 security, tenancy, financial correctness, and sync fixes first in small, fully tested batches; maintain green `pytest`, `vitest`, `tsc`, `vite build`, and Android Gradle tests/APK at every milestone.

---

## Phase Schedule

| Phase | Name | Included Items | Primary Verification Gate |
|---|---|---|---|
| **F0** | **Audit Baseline & Production Quota Mitigation** | Complete 10-doc audit suite (`docs/audits/*`), disable 24/7 Neon keep-alive pings (`a781c21`) | All 10 audit docs committed; zero background Neon polling |
| **F1** | **Tenancy & Schema Hardening (P0)** | `C1` (`ExpenseIdempotencyKey` + `sms_ingest.py` + `expenses.py`), `C20` (`UserPreference` composite unique `(user_id, key)`), Alembic `0013` (SQLite batch + Neon PG 18 compatible), `C18` / `C29` (`exports.py` restore isolation & transfer dedup), `C27` (`income_types.py` system protection), `C28` (`auth.py` `SYSTEM_EXPENSE_TYPE_KEYS`) | Cross-tenant isolation tests + Alembic `upgrade head` on SQLite & PG |
| **F2** | **SMS Direction & Android Pipeline Safety (P0)** | `C16` (`SmsIngestRequest.direction = "UNKNOWN"`), `C2` (`SyncWorker.kt` remove `/expenses` fallback for non-DEBIT), `C17` (`SyncWorker.kt` + `SmsReviewPage.tsx` explicit `UNKNOWN`), `C15` (`MainActivity.kt` `BuildConfig.DEBUG` guard), `C22` (`SmsReceiver.kt` `notified`), `C26` (`SmsEligibility.kt` bank override) | Android `./gradlew test` + `assembleDebug` + backend `test_sms_ingest.py` |
| **F3** | **Financial Atomicity & Edge Cases (P1)** | `C3` (stop swallowing balance errors), `C4` (`>= 0` reported balance), `C9` (atomic transfer + dual balance update), `C10` (`today_ist()` in `sms_ingest.py`), `P10` (transfer `IntegrityError` replay), `C21` (`weekly_report.py` `acc.account_name`), `C41` (`notifications.py` partial merge), `P13`/`V4` (`max_length=72`), `P15` (CSV formula neutralization), `P20` (constant-time login) | `pytest backend/tests` (full ledger, transfer, reversal, export, report regression suite) |
| **F4** | **Frontend Reliability & Bridge Fixes (P1)** | `C39` (`useAndroidBackButton.ts` `document.dispatchEvent`), `C37` (`SecurityCentrePage.tsx` full `tel:` href), `P35` (`AuthProvider.tsx` offline token preservation), `C34`/`C35` (`IncomePage.tsx` server total + pagination reset), `C36` (`WeeklyReportPage.tsx` signed net), `P25` (`SmsReviewPage.tsx` `parseRupeesToPaise`) | `npm --prefix frontend run typecheck && test && build` |
| **F5** | **Container & Neon Readiness (P1)** | `C13` (`backend/.dockerignore`, non-root `appuser`, safe defaults), Neon CU-hr quota recovery & Render redeploy verification | Docker build verification + Render deploy after Neon quota reset/upgrade |
| **F6** | **Balance Concurrency & Ledger Polish (P2)** | `C5`, `C6`, `C11`, `C14` (row-level locking / `SELECT FOR UPDATE` on PG balance recalculation, reversal edge cases) | Concurrency & PG lock integration tests |
| **F7** | **Frontend Feature Completeness (P2)** | `C12` (dedicated `/budgets` UX improvements), `C57-UI` (custom income type creation UI), `C45`, `C48`, `C50`, `C55` | Vitest + Playwright/Browser E2E check |
| **F8** | **Android Concurrency & Offline Polish (P2)** | `C23` (singleton/synchronized `TransactionStore` file access), `C24`, `C25` | Android unit/instrumentation tests |
| **F9** | **Quality Gates & Security Regression** | Full `ruff`, `mypy`, `bandit`, `pytest`, `vitest`, `tsc`, `gradlew test`, fresh APK build | Zero lint/type/test errors across all 3 stacks |
| **F10** | **Release & Production Verification** | Tag release, build signed APK, verify Neon PG 18 `alembic upgrade head`, verify live Render health & login | Live Render + Neon production smoke pass |
