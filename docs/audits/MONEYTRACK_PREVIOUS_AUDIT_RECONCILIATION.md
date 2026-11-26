# MoneyTrack — Previous OpenCode Audit Reconciliation

**Reconciliation Date:** 2026-11-26  
**Sources Reconciled:**
- `C:\Users\velmu\.opencode\plan\00_EXECUTIVE_SUMMARY.md` through `15_OPEN_DECISIONS.md` & `MONEYTRACK_ALL_AUDITS.md`
- `C:\Users\velmu\.opencode\plan\frontend-redesign\` (11 documents, copied in `docs/frontend-redesign/`)
- `D:\MoneyTrack\docs\engineering\MASTER_DEFECT_REGISTER.md` (56 confirmed defects `C1`–`C57` excluding retired `C8`, 35 potential `P1`–`P35`, 16 validation gaps `V1`–`V16`, 41 design weaknesses `D1`–`D41`)
- Repository reports under `docs/` (`FINAL_PRODUCTION_HARDENING_REPORT.md`, `FINANCIAL_INTEGRITY_REPORT.md`, etc.)

**Current Codebase Checked:** `main` @ `a781c219020e14ce100ad2f8602ccf8362024766`

---

## 1. Confirmed Defects Reconciliation (`C1`–`C57`)

| ID | Sev | Original Issue | Current Status | Code Evidence |
|---|---|---|---|---|
| **C1** | P0 | Cross-tenant DEBIT idempotency replay | **UNRESOLVED** | `backend/app/models/idempotency_key.py:25-27` (`unique=True`, no `user_id`); `backend/app/services/sms_ingest.py:288-294` (`db.get(Expense, ...)` unscoped) |
| **C2** | P0 | Sync fallback posts CREDIT/failed ingest to `/api/expenses` | **UNRESOLVED** | `android/app/src/main/java/com/moneytrack/app/sms/SyncWorker.kt:342-348` |
| **C3** | P1 | Expense balance recalc silently swallowed | **UNRESOLVED** | `backend/app/services/expenses.py:211-216` (`except Exception: pass`) |
| **C4** | P1 | Zero reported balance (`0` paise) rejected/ignored | **UNRESOLVED** | `backend/app/api/routes/bank_accounts.py:100` (`gt=0`); `sms_ingest.py:572,636,711,780,929,1072` (`> 0`) |
| **C5** | P1 | Dashboard masks zero/negative balance | **PARTIAL** | `HomePage.tsx:141` uses `consolidated_balance_paise ?? 0` (fixes `>0` masking), but `BankAccountsPage.tsx:78` still uses raw vs reported |
| **C6** | P1 | "Reconciled" badge when reported is null | **PARTIAL** | `HomePage.tsx:302-312` handles `reported == null` truthfully; `backend/app/schemas/cashflow.py:35-40` still returns `0` when reported is null |
| **C7** | P1 | "Average daily spend" mislabeled | **FIXED (UI)** | `HomePage.tsx:150-151,364-371` computes `spent / days` and `spent / transactionCount` separately |
| **C8** | — | "Failed sync not retried" | **RETIRED** | Superseded by `C24` & `C25` in `MASTER_DEFECT_REGISTER.md` |
| **C9** | P1 | Transfers non-atomic (3 separate commits) | **UNRESOLVED** | `backend/app/services/transfers.py:118-123` (`db.commit()`, then two `recalculate_account_balance` commits) |
| **C10** | P1 | SMS date fallback uses server `date.today()` (UTC) | **UNRESOLVED** | `backend/app/services/sms_ingest.py:190,195` (`date.today()` instead of `today_ist()`) |
| **C11** | P1 | Refunds create Income while Expense stays gross | **UNRESOLVED** | `backend/app/services/sms_ingest.py:901-923` (blocked on `U1` ADR, though net calculation helper can be added cleanly) |
| **C12** | P1 | No `/budgets` UI route despite backend API | **UNRESOLVED** | `frontend/src/App.tsx` still has no `/budgets` route |
| **C13** | P1 | Docker insecure defaults + no `.dockerignore` | **UNRESOLVED** | `backend/Dockerfile:25,29-30`; no `backend/.dockerignore` |
| **C14** | P1 | Mixed all-time balance vs period cashflow bases | **UNRESOLVED** | `bank_accounts.py:28-95` vs `cashflow.py:21-55` (pending `U2` ADR) |
| **C15** | P0 | Exported `TEST_NOTIFICATION` intent in all builds | **UNRESOLVED** | `android/app/src/main/java/com/moneytrack/app/MainActivity.kt:41-102` |
| **C16** | P0 | `SmsIngestRequest.direction` defaults to `"DEBIT"` | **UNRESOLVED** | `backend/app/schemas/sms_ingest.py:20` |
| **C17** | P0 | Android collapses `UNKNOWN` -> `DEBIT` on sync | **UNRESOLVED** | `SyncWorker.kt:362`; `SmsPlugin.kt:171,255`; `SmsReviewPage.tsx:32-41` |
| **C18** | P0 | Restore queries all tenants' types without `user_id` scope | **UNRESOLVED** | `backend/app/services/exports.py:411,508` |
| **C19** | P1 | Missing `IntegrityError` import in `incomes.py` | **FIXED** | Fixed in `bfcdfff` (`backend/app/services/incomes.py:5`) + test in `test_income_and_bank_accounts.py` |
| **C20** | P1 | `user_preferences.key` globally unique (`IntegrityError` for 2nd user) | **UNRESOLVED** | `backend/app/models/user_preference.py:17` |
| **C21** | P1 | Weekly report `acc.name` `AttributeError` crash | **UNRESOLVED** | `backend/app/services/weekly_report.py:185` (should be `acc.account_name`) |
| **C22** | P1 | `SmsReceiver` sets `notified=true` before showing notification | **UNRESOLVED** | `android/.../SmsReceiver.kt:83,90,124` |
| **C23** | P1 | Per-instance `TransactionStore` locks + non-atomic `Files.move` | **UNRESOLVED** | `android/.../TransactionStore.kt:22-23,279` |
| **C24** | P1 | Merge omits `retryCount`; keeps `READY_TO_SYNC` over `FAILED` | **UNRESOLVED** | `TransactionStore.kt:50-62,96-108`, `SyncWorker.kt:86-91` |
| **C25** | P1 | `SyncWorker` treats `conflict_review`/`queued` as retry error | **UNRESOLVED** | `SyncWorker.kt:71-97,406-417` |
| **C26** | P1 | Single promo substring drops genuine bank txns | **UNRESOLVED** | `android/.../SmsEligibility.kt:13-16,38` |
| **C27** | P1 | System income types (`user_id IS NULL`) mutable/archivable by any user | **UNRESOLVED** | `backend/app/api/routes/income_types.py:96-123` |
| **C28** | P1 | `SYSTEM_EXPENSE_TYPE_KEYS` mismatch (`_` vs spaces) | **UNRESOLVED** | `backend/app/services/auth.py:27-53` vs `expense_types.py:26-27` |
| **C29** | P1 | Restore transfers has no dedup | **UNRESOLVED** | `backend/app/services/exports.py:680-711` |
| **C30** | P1 | Backup v2 omits provenance (`bank_reference`/`source`) & audit tables | **UNRESOLVED** | `backend/app/services/exports.py:280-296,596-605` |
| **C31** | P1 | `downloadExport` missing Bearer auth | **FIXED** | Fixed in `bfcdfff` (`frontend/src/services/api.ts:693-702`) |
| **C32** | P1 | `reportBankBalance` JSON body vs query param | **FIXED** | Fixed in `bfcdfff` (`frontend/src/services/api.ts:571-575`) |
| **C33** | P1 | Amount filter ×100 escalation loop | **FIXED** | Fixed in `bfcdfff` (`frontend/src/pages/ExpensesPage.tsx:75-119`) |
| **C34** | P1 | Income total computed from current page only | **PARTIAL** | `IncomePage.tsx:90` still computes `pageInflowPaise` locally, while KPI card uses `cashflow.total_income_paise` (`:254`); `incomesQuery.data.total_paise` ignored for filtered total |
| **C35** | P2 | Income page never resets on filter change | **UNRESOLVED** | `IncomePage.tsx:45-85` |
| **C36** | P1 | Weekly report negative net formatted with `Math.abs` | **PARTIAL** | `WeeklyReportPage.tsx:76` — let's verify display line in `WeeklyReportPage.tsx` |
| **C37** | P2 | Helpline `tel:` dials only `1800` | **UNRESOLVED** | `frontend/src/pages/SecurityCentrePage.tsx:327` (`item.phone.split(' ')[0]`) |
| **C38** | P1 | Receipt camera attach + MediaStream leak | **FIXED** | Fixed in `bfcdfff` (`ReceiptScannerModal.tsx:80-153`) |
| **C39** | P1 | Android back dispatches Escape on `window`; Modal listens on `document` | **UNRESOLVED** | `useAndroidBackButton.ts:46` vs `Modal.tsx:102` |
| **C40** | P1 | Fresh-instance `/login` setup race | **FIXED** | Fixed in `bfcdfff` (`LoginPage.tsx:24-34`) |
| **C41** | P1 | Partial preferences PUT overwrites with defaults | **UNRESOLVED** | `backend/app/services/notifications.py:119-124` |
| **C42** | P2 | Delete bank account = archive with no badge/filter | **PARTIAL** | `BankAccountsPage.tsx:70` (`listBankAccounts(true)`) |
| **C43** | P2 | "This month" label on all-time type counts | **UNRESOLVED** | `frontend/src/pages/TypesPage.tsx:323-326` |
| **C44** | P2 | Trends "Days"/per-day wrong for weekly/monthly buckets | **UNRESOLVED** | `frontend/src/pages/TrendsPage.tsx` |
| **C45** | P1 | Breakdown payment/merchant stats truncate at 100 items | **UNRESOLVED** | `frontend/src/pages/BreakdownPage.tsx:93-95` (`page_size: 100`) |
| **C46** | P2 | Payment-method meta keys mismatch actual values | **UNRESOLVED** | `frontend/src/pages/BreakdownPage.tsx:36-45` (`card`/`netbanking` vs `Debit Card`/`Bank Transfer`) |
| **C47** | P2 | Expenses summary total ignores active search/category filters | **UNRESOLVED** | `frontend/src/pages/ExpensesPage.tsx:174-176` |
| **C48** | P1 | Web SMS edit+confirm are no-ops (`sms.ts` web stubs) | **UNRESOLVED** | `frontend/src/services/sms.ts:135-149` |
| **C49** | P2 | `/scanner` route orphaned | **UNRESOLVED** | `frontend/src/App.tsx:272-278` |
| **C50** | P1 | Embedded Income/Transfer tabs lack create button on non-empty state | **UNRESOLVED** | `frontend/src/pages/TransactionsPage.tsx:80-91` |
| **C51** | P2 | Undefined Tailwind classes (`p-4.5`, `bg-surface-card`, etc.) | **PARTIAL** | Redesigned pages use `Panel`/`AppPage`; legacy pages (`SettingsPage`, `SmsReviewPage`, `TypesPage`) retain some legacy classes |
| **C52** | P2 | `.narrow-page` lacks mobile padding | **PARTIAL** | Only `SettingsPage` still uses `.narrow-page` |
| **C53** | P2 | CommandPalette selected row contrast | **UNRESOLVED** | `frontend/src/components/CommandPalette.tsx` |
| **C54** | P2 | Scanner accepts PDF in UI but validator rejects | **UNRESOLVED** | `frontend/src/pages/ScannerPage.tsx` vs `utils/receipt.ts` |
| **C55** | P1 | BankAccounts false Reconciled/Variance display | **PARTIAL** | `BankAccountsPage.tsx:75-78` improved, still inspect card badges |
| **C56** | P3 | API timeout error says "8s" vs 25s | **UNRESOLVED** | `frontend/src/services/api.ts:356,406` |
| **C57** | P1 | Fresh instance cannot record income (0 income types) | **PARTIAL** | Backend seeding fixed in `bfcdfff` (`main.py:107-146`), UI still lacks custom IncomeType creation |

---

## 2. Potential, Validation & Design Findings Reconciliation Summary

- **`P1`–`P35`:** All 35 potential defects remain unaddressed in code except `P35` (AuthProvider still clears session on non-401 cold-start network errors — needs explicit status check before clearing token!).
- **`V1`–`V16`:** Backend `pytest` grew from 223 to 225 tests (`bfcdfff`), Frontend `vitest` grew from 54 to 61 tests (`bfcdfff`), but component tests (`V1`), rate limiting (`V5`), bcrypt 72-byte password cap (`P13`/`V4`), and PostgreSQL CI dialect tests (`V10`) remain open.
- **`D1`–`D41`:** `D29`/`D30` (`useApiQuery` cache & `invalidate()`) were fixed in `bfcdfff`; `D22` keep-alive quota burn was fixed in `a781c21`; remaining design improvements are scheduled across Phases F1–F7.
