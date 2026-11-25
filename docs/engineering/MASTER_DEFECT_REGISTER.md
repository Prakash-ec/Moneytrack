# MASTER DEFECT REGISTER — MoneyTrack

**Status:** Planning artefact — no code, configuration, database, or production data changed.
**Date:** 25 Nov 2026
**Baseline commit:** `f917b99` (`main`, 22 Nov 2026)
**Plan branch state:** `frontend-redesign/f0-foundations` with uncommitted F0 changes (see §0.3)
**Source audits:** `C:\Users\velmu\.opencode\plan\00`–`15` + `FINAL_TRANSFORMATION_PLAN.md`
**Scope:** Backend (FastAPI/SQLAlchemy/Alembic), Android (Kotlin SMS engine + Capacitor), Frontend (React 18).

---

## 0. Document control

### 0.1 Purpose

This is the single authoritative defect register for the MoneyTrack remediation. It
reconciles the 17 audit reports, fixes their count and severity inconsistencies, and
adds the evidence status that the source reports do not carry consistently.

It does **not** authorise implementation. Every P0/P1 requires a failing regression test
before a fix is written, and the unresolved decisions in
`UNRESOLVED_PRODUCT_DECISIONS.md` must be recorded as ADRs before dependent tasks start.

### 0.2 Evidence classification used in this register

| Class | Meaning | Implementation rule |
|---|---|---|
| **A — Code-confirmed** | The defect mechanism was verified against source code (by the audit and, for the P0s and selected P1s, re-verified during this reconciliation). | May be planned; still needs a failing test. |
| **B — Runtime reproduction required** | The mechanism is present in code, but the user-visible/financial outcome depends on runtime timing, device behaviour, concurrency, or external state. | Must be reproduced before the fix is merged. |
| **C — Environment/policy evidence required** | Cannot be established from the repository (Play approval, production DB size, staging backups, credentials). | Obtain evidence before committing to a release. |
| **D — Coverage gap** | No runtime defect; tests/validation are missing. | Add the test; no production behaviour change. |

All source audits labelled findings "confirmed" on the basis of static code inspection.
This register therefore separates **code-confirmed** from **runtime-reproduced**: only the
latter may be marked fixed.

### 0.3 Critical working-tree caveat

At the time of this register the repository is **not clean**:

```
Branch: frontend-redesign/f0-foundations  (HEAD f917b99)
Modified (uncommitted): 7 branding SVGs, Card.tsx, FormControls.tsx,
  useApiQuery.ts, index.css, AuthProvider.tsx, api.ts, tailwind.config.js
Untracked: useOverlayBehavior.ts, src/styles/, docs/frontend-redesign/,
  docs/engineering/, AGENTS.md, skills-lock.json
```

Consequences:

1. The measured baseline below is from a **dirty tree**, not from `f917b99`.
2. `frontend/src/services/api.ts` already contains uncommitted fixes for **C31** (export
   Authorization) and **C32** (report-balance query). They are not committed, not covered
   by new tests, and not verified end-to-end.
3. `useApiQuery.ts` and `AuthProvider.tsx` already contain uncommitted cache/auth changes
   relevant to D29/D30/P35. They must not be treated as the remediation.
4. **Blocker B1:** decide the fate of these changes before implementation (commit on the
   F0 branch, stash, or discard after review) and re-run the baseline on a clean commit.

---

## 1. Count reconciliation

The source reports conflict. This register fixes the arithmetic.

| Metric | Source claim | Enumerated in `02` | Reconciled here | Explanation |
|---|---:|---:|---:|---|
| Confirmed defects | 57 | 56 | **56** | `C8` was retired/refined into `C24`/`C25`; no `C8` row exists. The "57" is an arithmetic error. |
| — P0 | 6 | 6 | **6** | C1, C2, C15, C16, C17, C18 |
| — P1 | ~33 | 37 | **37** | Exact enumeration below |
| — P2 | ~17 | 12 | **12** | Exact enumeration below |
| — P3 | 1 | 1 | **1** | C56 |
| Potential defects | 35 | 35 | **35** | §B header says 24 (P1–P24); §H adds P25–P35 |
| Missing validation/test gaps | 16 | 16 | **16** | §C says 12 (V1–V12); §I adds V13–V16 |
| Design weaknesses | 41 | 41 | **41** | §D says 25 (D1–D25); §J adds D26–D41 |
| Security findings | 12 | 12 aliases | **12 aliases / 10 distinct** | S7 and S11 both map to D14/V5; all S IDs are aliases of C/P/D findings |
| Unresolved requirements | 13 (+6) | 13 (+PD1–PD6) | **13 U + 6 PD = 19** | §15 |
| Financial-logic risks | 34 | 34 | **34 (subset)** | Not a separate defect class; overlaps C/P/U |
| Broken workflows | 16 | 16 | **16 (subset)** | Overlaps C/P |

### 1.1 Exact confirmed severity distribution

| Severity | IDs | Count |
|---|---|---:|
| **P0** | C1, C2, C15, C16, C17, C18 | **6** |
| **P1** | C3, C4, C5, C6, C7, C9, C10, C11, C12, C13, C14, C19, C20, C21, C22, C23, C24, C25, C26, C27, C28, C29, C30, C31, C32, C33, C34, C36, C38, C39, C40, C41, C45, C48, C50, C55, C57 | **37** |
| **P2** | C35, C37, C42, C43, C44, C46, C47, C49, C51, C52, C53, C54 | **12** |
| **P3** | C56 | **1** |
| **Total** | C1–C57 except C8 | **56** |

### 1.2 Potential defect severity distribution

| Severity | IDs | Count |
|---|---|---:|
| P1 | P1, P3, P4, P5, P6, P7, P35 | 7 |
| P2 | P2, P8–P23, P25–P34 | 27 |
| P3 | P24 | 1 |
| **Total** | P1–P35 | **35** |

### 1.3 Other conflicts reconciled

| Conflict | Resolution |
|---|---|
| Executive summary says "~33 P1 / ~17 P2"; ledger enumerates 37 / 12 | Use 37 / 12. |
| §A header "Confirmed defects (30)" but table has 29 rows | 29 confirmed rows in §A; 27 in §G; total 56. |
| §B header "Potential defects (24)" | 24 in §B + 11 in §H = 35. |
| §C header "Missing validation (12)" | 12 in §C + 4 in §I = 16. |
| §D header "Design weaknesses (25)" | 25 in §D + 16 in §J = 41. |
| Roadmap P0 estimate "2–3 weeks" | Revised to **3–4 weeks** because T2 depends on T6, and T4/T6 are blocked by U5/U9 (see execution plan). |
| `T33` placed under P2 heading but tagged P1 and marked "do early" | Treated as **P1, Phase 1 quick win**, independent of P0. |
| C8 referenced in roadmap/history | Marked **retired**, superseded by C24/C25. |
| React/Capacitor versions in legacy docs | Code wins: React 18.3, Capacitor 8.5.3. |
| "Security findings 12" | 12 aliases, 10 distinct issues; do not double-count in totals. |

---

## 2. Authoritative confirmed defect register

**Legend**
- **Evid.** — A = code-confirmed during audit/reconciliation; B = runtime reproduction required before fix; C = environment/policy evidence required.
- **Repro** — required before claiming fixed (Y/N) and the primary method.
- **Task** — roadmap task (`13`).

### 2.1 P0 — critical financial correctness and security

| ID | Sev | Area | Defect | Evidence (repo path:line) | Evid. | Repro | Depends / blocks | Task |
|---|---|---|---|---|---|---|---|---|
| **C1** | P0 | Tenancy / idempotency | Cross-tenant SMS DEBIT replay. Globally unique `idempotency_key` with no `user_id`; DEBIT replay does `db.get(Expense, key.expense_id)` unscoped, while CREDIT is user-scoped. User B receives A's expense id, B's transaction is silently dropped. | `backend/app/models/idempotency_key.py:25-27`; `backend/app/services/sms_ingest.py:285-314`; `backend/alembic/versions/0003:55-58`; `android/.../SmsTransaction.kt:127-157` | A | **Y** — two-user API test + Postgres concurrency | Keys: T1. Blocks: T2 (fallback safety). | T1 |
| **C2** | P0 | Android sync | Unsafe fallback: any ingest exception (including a read timeout **after** the server committed) falls back to `POST /api/expenses`. A CREDIT becomes an EXPENSE; replay-path losses duplicate. Fallback drops reference/source/account. | `android/.../SyncWorker.kt:330-348,424-426,503-518`; `backend/app/services/expenses.py:140-152`; `backend/app/models/income.py:46-48` | A | **Y** — fake-server timeout-after-commit test | T1, T6. | T2 |
| **C15** | P0 | Android security | Exported `com.moneytrack.app.TEST_NOTIFICATION` action handled in **all** build types with no permission/DEBUG guard. `show_review` injects attacker records; `confirm_review` flips any queued record to READY_TO_SYNC, enabling unauthorised ledger posting. Intent extras are logged. | `android/.../MainActivity.kt:41-102`; `AndroidManifest.xml:18-24` | A | **Y** — release build + `adb am start` | None. Parallel. | T3 |
| **C16** | P0 | SMS API | `SmsIngestRequest.direction` defaults to `"DEBIT"`. An omitted direction auto-posts a debit, violating the "ambiguity over deduction" invariant. | `backend/app/schemas/sms_ingest.py:20`; `services/sms_ingest.py:174-187` | A | **Y** — POST without direction | T6 (review queue). | T2/T6 |
| **C17** | P0 | Android/UI direction | `if CREDIT else DEBIT` collapses UNKNOWN to DEBIT on sync; confirm has no direction parameter; the review UI badges ambiguous records as "Expense". A misled user confirming an ambiguous credit posts a debit. | `android/.../SyncWorker.kt:362`; `SmsPlugin.kt:171,255-259`; `frontend/src/pages/SmsReviewPage.tsx:32-41` | A | **Y** — SyncWorker UNKNOWN test + UI test | T6, T2; C16. | T2 |
| **C18** | P0 | Restore tenancy | Restore reads **all tenants'** expense/income types (`select(ExpenseType)` / `select(IncomeType)`), then maps restored rows by `name_key`. A collision binds B's restored rows to A's private type and discloses A's type name. | `backend/app/services/exports.py:411-412,508-509` | A | **Y** — two-user restore test | U9. | T4 |

#### P0 acceptance and regression tests (mandatory)

| ID | Failing test to write first | Exact expected result |
|---|---|---|
| C1 | `backend/tests/test_idempotency.py::test_cross_user_debit_key_isolation` | A creates expense with key K. B posts same K: 201; B's expense has `user_id=B`; `id != A.id`; B's list never returns A's row. A replay: `replayed=True`, no second row. DB has `UNIQUE(user_id, idempotency_key)`. Postgres: 8 concurrent same-user posts → 1 row. |
| C2 | `android/.../SyncWorkerTest.kt::creditTimeoutAfterCommit_doesNotCreateExpense` | Fake server accepts `/sms/ingest` but delays the response past the read timeout. Assert **zero** requests to `/expenses`; record remains retryable; a later ingest returns `replayed`; exactly one income effect. |
| C15 | Instrumented `MainActivityTest::testNotificationActionRejectedInRelease` | Release build: intent action produces no record, no status change, no confirm; logcat contains no intent extras. Debug: explicitly allowed only behind `BuildConfig.DEBUG`. |
| C16 | `backend/tests/test_sms_ingest.py::test_missing_direction_is_queued_not_debited` | POST without `direction` → `status="queued"`, `transaction_type="queued"`, **no** expense/income row, candidate persisted for review. |
| C17 | `SyncWorkerTest::unknownDirectionNeverPostsDebit` + `SmsReviewPage.test.tsx::confirmRequiresDirection` | UNKNOWN record is never sent as DEBIT; confirm button disabled until a direction is chosen; request includes the chosen direction. |
| C18 | `backend/tests/test_restore.py::test_restore_binds_only_own_types` | B restores a backup whose type name matches A's private type → B's rows bind to B's own/new type; A's type id never appears; A's name not disclosed. Double restore → no duplicates. |

**P0 exit gate:** all six tests fail on the baseline, pass after the fix, on SQLite **and**
PostgreSQL; Android release intent test passes; no new P0/P1 introduced.

### 2.2 P1 — core reliability and correctness (37)

| ID | Area | Defect | Evidence | Evid. | Repro | Task |
|---|---|---|---|---|---|---|
| C3 | Backend balance | Expense recalc wrapped in `try/except Exception: pass` after commit → stale balance, silent. | `services/expenses.py:211-216` | A | Y — fault injection | T7 |
| C4 | Backend balance | Zero reported balance ignored (`> 0` gates; route `gt=0`). Drained account never snapshotted. | `services/sms_ingest.py:571,636,711,778,929,1072`; `routes/bank_accounts.py:100` | A | Y — zero-balance ingest | T8 |
| C5 | Frontend display | Dashboard masks valid zero/negative balance via `>0 ? calculated : reported` and `||` fallbacks. | `CashflowHeroCard.tsx:65-68`; `HomePage.tsx:140-143` | A | Y — render 0/negative | T8/T18 |
| C6 | Backend/UI display | `reconciliation_difference_paise` returns 0 when reported is null → false "Reconciled". | `schemas/cashflow.py:35-40`; `HomePage.tsx:146-149` | A | Y — no-reported case | T8 |
| C7 | Frontend display | "Average daily spend" shows per-transaction average ÷ active days. | `HomePage.tsx:266-285`; `services/analytics.py:139` | A | Y — label/computation test | T13 |
| C9 | Backend atomicity | Transfers commit 3× (row, from-recalc, to-recalc); mid-failure leaves partial balances. | `services/transfers.py:117-123` | A | Y — fault injection | T7 |
| C10 | Timezone | SMS date fallback uses server `date.today()` (UTC on Render) vs IST display → off-by-one near midnight. | `services/sms_ingest.py:190,195`; `core/time.py:4-9` | A | Y — 23:59 IST test | T11/T13 |
| C11 | Financial definitions | Refunds create income; expenses stay gross; `net_amount_paise` unused; components mislead. | `services/sms_ingest.py:901-923`; `cashflow.py:24-39`; `models/expense.py:71-76` | A | Y — refund flow | T13 (U1) |
| C12 | Missing feature | No `/budgets` route/UI though backend is complete. | `frontend/App.tsx:149-320`; `routes/budgets.py` | A | N — absence is code-evident; E2E required | T21 (PD3) |
| C13 | Security/deploy | Docker: `CORS_ORIGINS=*`, SQLite default, root user, `COPY . .`, **no `.dockerignore`** → `.env`/DB baked into image. | `backend/Dockerfile:25,29-30` | A | Y — build image, inspect layers | T15 |
| C14 | Financial definitions | Balance is all-time from opening date; cashflow is period sums; transfers and pre-opening txns unreconcilable; no shared definition. | `services/bank_accounts.py:28-95` vs `cashflow.py:21-55` | A | Y — cross-service equality | T13 (U2) |
| C19 | Backend incomes | `except IntegrityError` used without import → `NameError`/500; idempotent replay recovery dead. | `services/incomes.py:158` vs imports `:1-12` | A | Y — force duplicate key | T1 |
| C20 | Backend prefs | `user_preferences.key` globally unique; second user PUT → IntegrityError/500. | `models/user_preference.py:17`; `services/notifications.py:121` | A | Y — second-user PUT | T12 |
| C21 | Backend report | `acc.name` does not exist on `BankAccount` → AttributeError/500 when an expense has `account_id`. | `services/weekly_report.py:185`; `models/bank_account.py` | A | Y — weekly with accounts | T12 |
| C22 | Android notify | `notified=true` set before showing; guard `if (!record.notified)` skips → no review notification for live ambiguous SMS. | `SmsReceiver.kt:83,90,124` | A | Y — device notification | T10 |
| C23 | Android store | `queueLock`/`settingsLock` are per-instance; every component constructs its own store → read-modify-write races; `Files.move` lacks `ATOMIC_MOVE`. | `TransactionStore.kt:18-23`; call sites in Receiver/SyncWorker/Plugin/NotificationHelper | A | Y — cross-instance concurrency | T9 |
| C24 | Android retry | Merge omits `retryCount`; status rule keeps READY_TO_SYNC over FAILED → backoff stuck at 30 s, cap meaningless, FAILED never persisted. | `TransactionStore.kt:50-62,96-108`; `SmsReconciliation.kt:249-253`; `SyncWorker.kt:86-91` | A | Y — retry persistence test | T9 (U5) |
| C25 | Android sync | Success detection only `created`/`replayed`; `conflict_review`/`queued` (2xx, both false) treated as generic failure with `error=null` → ~30 s infinite loop, never surfaced. | `SyncWorker.kt:71-97,406-417`; `services/sms_ingest.py:424-442` | A | Y — conflict response test | T9/T6 |
| C26 | Android eligibility | Single promo substring ("market"/"offer"/"discount"/"won"/"reward") → IGNORED with no bank-confirmation override. "supermarket" debits and "cashback offer credited" are lost. | `SmsEligibility.kt:13-16,38` | A | Y — adversarial SMS corpus | T10 |
| C27 | Backend authz | System income types (`user_id IS NULL`) are mutable/archivable by any user (`user_id is not None and != current` passes NULL), affecting all tenants. Expense types are protected. | `routes/income_types.py:96-123` | A | Y — user B archives "Salary" | T5 |
| C28 | Backend bootstrap | `SYSTEM_*_KEYS` use `_`/`&` but `name_key()` casefolds to spaces → first user claims multi-word defaults; later users lose them. | `services/auth.py:27-40` vs `expense_types.py:26-27` | A | Y — second-user type list | T5 |
| C29 | Backend restore | Transfer restore loop has no existing-transfer dedup (expenses/incomes/budgets do) → replay duplicates transfers, double-counts balances. | `services/exports.py:680-711` | A | Y — double restore | T4 (U9) |
| C30 | Backend backup | v2 export omits `bank_reference`/`source`/`confidence`; backup excludes evidence/snapshots/reversals/alerts → UTR + audit trail lost. | `services/exports.py:280-296,596-605` | A | Y — roundtrip audit | T4 (U9) |
| C31 | Frontend API | `downloadExport` sends no Authorization; exports always 401. **An uncommitted working-tree edit already adds the header — unverified and untested.** | `services/api.ts:686-724` (baseline `:690-692`) | A | Y — authenticated export | T33 |
| C32 | Frontend API | Report-balance sends JSON body while backend expects query `reported_balance_paise`; always 422. **An uncommitted working-tree edit already changes the contract — unverified and untested.** | `services/api.ts:571-575`; `routes/bank_accounts.py:98-110` | A | Y — live 200 | T33 |
| C33 | Frontend filter | Amount filter stores paise in URL but reads as rupees; typing "100" escalates ×100 to the cap every 300 ms. | `ExpensesPage.tsx:87-88,116-121,139` | A | Y — component test | T33 |
| C34 | Frontend totals | Income total/average are computed from the current page only; server `total_paise` ignored. | `IncomePage.tsx:85,237,249` | A | Y — paginated data test | T34 |
| C36 | Frontend report | Weekly report formats negative net with `Math.abs`, showing a loss as a gain. | `WeeklyReportPage.tsx:74-77,186-188` | A | Y — negative net test | T34 |
| C38 | Frontend camera | Receipt camera never attaches (video rendered only when `!loading`) and the stream is never stopped on unmount → leak. | `ReceiptScannerModal.tsx:92-146`; `ScannerPage.tsx:61-94,369-375` | A | Y — component/browser test | T35 |
| C39 | Frontend modal | Android back dispatches Escape on `window`; Modal listens on `document` → back cannot close dialogs. | `useAndroidBackButton.ts:38-48`; `Modal.tsx:102` | A | Y — device/unit event test | T35 |
| C40 | Frontend auth | Fresh-instance `/login`: "Create Admin Account" calls `login()` → 401; setup race. | `LoginPage.tsx:24-25,66-77,242-246` | A | Y — fresh DB E2E | T35 |
| C41 | Backend/UI prefs | Partial PUT is overwritten with full defaults (`model_dump_json()`), resetting quiet hours/max alerts/report day. | `NotificationsPage.tsx:97-104`; `services/notifications.py:112-127` | A | Y — toggle one pref | T33 |
| C45 | Frontend stats | Breakdown payment/merchant stats aggregate only the first 100 expenses but label "% of total". | `BreakdownPage.tsx:64-66,544` | A | Y — >100 rows test | T34 |
| C48 | Frontend SMS | Web edit+confirm are no-ops (`sms.ts` web stubs) yet toast "saved" — data lost. | `SmsReviewPage.tsx:250-276`; `services/sms.ts:135-149` | A | Y — web confirm persistence | T35 (T6) |
| C50 | Frontend actions | No add-income/add-transfer affordance when data exists; embedded tabs hide headers. | `TransactionsPage.tsx:102-113`; `IncomePage.tsx:208`; `TransfersPage.tsx:121` | A | Y — UI test | T35 |
| C55 | Frontend reconciliation | BankAccounts shows false "Reconciled"/"Variance" (`raw !== 0 ? raw : reported`). | `BankAccountsPage.tsx:73-74,294-304` | A | Y — no-reported case | T34 |
| C57 | Frontend onboarding | Fresh instance cannot record income: no income types seeded, no creation UI. | `IncomePage.tsx:63,90,120-123`; `main.py:60-104` | A | Y — fresh DB E2E | T35 |

### 2.3 P2 (12)

| ID | Area | Defect | Evidence | Repro | Task |
|---|---|---|---|---|---|
| C35 | Income page | Page never resets on filter change → false empty state. | `IncomePage.tsx:39,65-77` | Y | T34 |
| C37 | Security centre | Helpline `tel:` dials only "1800" (`split(' ')[0]`). | `SecurityCentrePage.tsx:320` | Y | T35 |
| C42 | Bank accounts | Delete = archive but list includes archived with no indicator → delete looks like a no-op. | `BankAccountsPage.tsx:66,219-236`; `bank_accounts.py:72-80` | Y | T35 |
| C43 | Types page | "This month" label on all-time type counts. | `TypesPage.tsx:323-326` | Y | T34 |
| C44 | Trends | "Days"/per-day arithmetic wrong for weekly/monthly buckets. | `TrendsPage.tsx:90-91,285-288` | Y | T34 |
| C46 | Breakdown | Payment-method meta keys never match actual values → raw labels, dead entries. | `BreakdownPage.tsx:38-47,100` | Y | T34 |
| C47 | Expenses | Unfiltered summary total displayed beside filtered count. | `ExpensesPage.tsx:189-192,397` | Y | T34 |
| C49 | Scanner route | `/scanner` is orphaned (zero inbound links); duplicate divergent page. | `App.tsx:271-278` | N (route graph) | T35 |
| C51 | Design tokens | Undefined Tailwind classes silently no-op (`bg-surface-card`, `p-4.5`, `h-18`, `shadow-xs`, `animate-in`). | `NotificationsPage.tsx:234`; `tailwind.config.js`; `index.css` | Y — computed-style test | T26 |
| C52 | Layout | `.narrow-page` has no padding → Settings/Scanner flush to edges on mobile. | `index.css` (`.narrow-page`) | Y — 360px screenshot | T25 |
| C53 | A11y | CommandPalette selected row dark-on-indigo contrast fail. | `CommandPalette.tsx:348,364` | Y — axe/contrast | T25 |
| C54 | Scanner | Accepts/advertises PDF but the validator rejects PDF. | `ScannerPage.tsx:355,450`; `utils/receipt.ts:5-10` | Y | T35 |

### 2.4 P3 (1)

| ID | Area | Defect | Evidence | Repro | Task |
|---|---|---|---|---|---|
| C56 | API copy | Timeout message says "8s" while the actual timeout is 25/45 s. | `api.ts:356,406` | N — copy inspection | T26 |

### 2.5 Retired IDs

| ID | Status | Replacement |
|---|---|---|
| C8 | **Retired** — "failed sync not retried" was imprecise and is fully covered by C24/C25 + Android F19 (no resume sync). | C24, C25 |

### 2.6 Duplicate-alias map (not additional defects)

| Alias | Canonical |
|---|---|
| S1 | C1 |
| S2 | C15 |
| S3 | C18 |
| S4 | C27 |
| S5 | C13 |
| S6 | D13 |
| S7 | D14 / V5 |
| S8 | D15 |
| S9 | P15 |
| S10 | P21 |
| S11 | D14 (public setup-status) |
| S12 | P20 |
| C5 note | F29 |
| C6 note | F26 |
| C7 note | F14 |
| C12 note | F66 |
| C17 note | F35 |

---

## 3. Potential defects (35)

These are not counted as confirmed until runtime reproduction. All are P1/P2/P3.

| ID | Sev | Title | Evidence | Repro method |
|---|---|---|---|---|
| P1 | P1 | Balance race on PostgreSQL (no row lock, READ COMMITTED) | `bank_accounts.py:28-95`; `db/session.py:24-28` | Two concurrent expense posts on Postgres |
| P2 | P2 | Float amount parsing (`toDoubleOrNull`+round; `parseFloat`) | `SmsParser.kt:383-388`; `SmsReviewPage.tsx:139` | Adversarial amounts |
| P3 | P1 | Android Layer C merges when one balance is null, before Layer E | `SmsReconciliation.kt:115-119,82-132` | One-null-balance consecutive events |
| P4 | P1 | Layer D merges same-amount recharges without ref check | `SmsReconciliation.kt:134-169` | Two genuine recharges |
| P5 | P1 | Refund misattribution (merchant ILIKE, amount >= refund) | `services/reversals.py:120-133` | Two similar merchants |
| P6 | P1 | Manual match picks arbitrary first, mutates user data | `services/sms_ingest.py:550-559,615-624` | Two same-amount manual rows |
| P7 | P1 | Ambiguous SMS not persisted server-side; no quarantine | `services/sms_ingest.py:174-187,1118-1126` | Crafted NON_FINANCIAL+DEBIT |
| P8 | P2 | Device-default TZ; dd-MM before MM-dd; no timestamp_ms | `SmsParser.kt:451-460`; `SmsTransaction.kt:214-217`; `SyncWorker.kt:363,532-534` | Non-IST device |
| P9 | P2 | Auto-account opening balance inferred assuming post-txn balance | `services/sms_ingest.py:241-248,268` | Real bank SMS samples (U4) |
| P10 | P2 | Transfer idempotency IntegrityError unhandled → 500 | `services/transfers.py:105-126`; `models/account_transfer.py:36-38` | Duplicate transfer key |
| P11 | P2 | Reversal dedup/cap read-then-write race | `services/reversals.py:33-76`; `models/transaction_reversal.py:19-23` | Concurrent reversals |
| P12 | P2 | Budget upsert select-then-insert race | `services/budgets.py:38-53,78-97` | Concurrent budget PUT |
| P13 | P2 | bcrypt 72-byte limit, no max_length → 500/CPU DoS | `schemas/auth.py:8,14` | >72-byte password |
| P14 | P2 | Receipt upload buffered before size check; unbounded JSON | `routes/receipts.py:46-67`; `ocr.py:7,23` | Large upload |
| P15 | P2 | CSV formula injection (no escaping) | `services/exports.py:96-110` | `=cmd` merchant export |
| P16 | P2 | Multipart SMS not reassembled | `SmsReceiver.kt:31-52` | Multipart corpus |
| P17 | P2 | Corrupt queue JSON unguarded; silent per-record drop | `TransactionStore.kt:264-271,318-336` | Corrupt file |
| P18 | P2 | Brittle regex JSON; dead `\s`; >50 expense types truncated | `SyncWorker.kt:186-211,410-411` | 60 types |
| P19 | P2 | REVERSAL keyword precedes CREDIT → "reversed back" refunds ignored | `SmsParser.kt:22,264`; `SmsEligibility.kt:52-53` | Refund corpus |
| P20 | P2 | Login timing enumeration + inactive-account disclosure | `services/auth.py:157-161` | Timing probe |
| P21 | P2 | Groq float amount heuristic; financial docs sent to third party | `services/groq_vision.py:94-113,407-431` | Provider flow |
| P22 | P2 | No-ref/no-balance same-amount same-day → fingerprint merge | `SmsTransaction.kt:146-154`; `SmsReconciliation.kt:46-58` | Two identical SMS |
| P23 | P2 | Implicit ACTION_VIEW PendingIntent, no `setPackage`; lockscreen amount | `SmsNotificationHelper.kt:277-286` | Notification inspection |
| P24 | P3 | Debug plaintext token fallback (release fail-secure) | `SecureTokenStore.kt:42-49,74-81` | Debug build |
| P25 | P2 | `parseFloat('1,240.00')*100` → ₹1 | `SmsReviewPage.tsx:139,447` | Comma input |
| P26 | P2 | Secondary query errors omitted → silent partial failure | `HomePage.tsx:79`; `BreakdownPage.tsx:74`; `TrendsPage.tsx:62` | Force secondary 500 |
| P27 | P2 | Form date defaults UTC not IST | Income/Transfers/BankAccounts forms | Non-IST browser |
| P28 | P2 | Stale/inconsistent SMS banner count | `TransactionsPage.tsx:44-60` | Status change |
| P29 | P2 | Trends day-of-week + WeeklyReport weeks local TZ | `TrendsPage.tsx:101-104`; `WeeklyReportPage.tsx:26-53` | Non-IST browser |
| P30 | P2 | Account-type labels missing salary/other | `types/api.ts:298`; `BankAccountsPage.tsx:28-34` | UI inspection |
| P31 | P2 | Alerts/notifications capped 50, no pagination | `security.py:30`; `notifications.py:21` | >50 rows |
| P32 | P2 | Modal footer horizontal overflow | `index.css`; `Modal.tsx:150-156` | 360px modal |
| P33 | P2 | Preferences PUT on every slider tick → spam/races | `NotificationsPage.tsx:354-356,386-388` | Drag slider |
| P34 | P2 | Ingest response status ignored → false "recorded" | `api.ts:676`; `SmsReviewPage.tsx:142-167` | Queued/conflict response |
| P35 | P1 | Offline cold-start lockout (any `/auth/me` failure clears session) | `AuthProvider.tsx:58-70` | Offline reload |

---

## 4. Missing validation / coverage gaps (16)

Severity for V13–V16 is **proposed P2** because the source does not label them.

| ID | Sev | Gap | Evidence | Required test |
|---|---|---|---|---|
| V1 | P1 | No frontend component/page/form/navigation tests | `frontend/src/**/*.test.ts` = 8 service/util files | Testing Library suite |
| V2 | P1 | No backend transfers/budgets API tests; many route gaps | `backend/tests/` | `test_transfers.py`, `test_budgets.py` |
| V3 | P2 | Opening balance no `ge=0`; ids no `gt=0`; amount bounds inconsistent | `schemas/bank_account.py:24`; `transfer.py:9-11`; `income.py:10` | Boundary tests |
| V4 | P2 | Password min-length 8 only, no max | `schemas/auth.py:8` | 72/128-byte cases |
| V5 | P1 | No rate limiting anywhere | grep → 0 | Throttle tests |
| V6 | P2 | Budget upsert race | `services/budgets.py` | Concurrent PUT |
| V7 | P2 | SMS fields unbounded | `schemas/sms_ingest.py:7-29` | Oversize payload |
| V8 | P2 | Income-type icon/color no regex | `schemas/income_type.py:6-24` | Invalid icon |
| V9 | P2 | Restore raw dict, no size/shape limit | `routes/exports.py:70` | Malformed/oversize |
| V10 | P1 | Tests SQLite-only; no PostgreSQL dialect tests | `conftest.py` | PG matrix |
| V11 | P2 | Duplicate test names shadow 2 tests; wrong filter param | `test_receipt_text.py:272,278`; `test_groq_vision.py:180,217`; `test_security_and_weekly_report.py` | Fix + assert |
| V12 | P2 | Automation toggle doesn't verify RECEIVE_SMS; zero amount accepted in plugin | `SmsPlugin.kt:83-108,536-543` | Permission/zero tests |
| V13 | P2 | Opening balance invalid → silent 0 coercion | `BankAccountsPage.tsx` | Form validation test |
| V14 | P2 | Income payer/reference no maxLength → 422 | Income form | Form validation test |
| V15 | P2 | QuickChips `isNaN`; SMS edit free-text unvalidated | `quickChips`; `SmsReviewPage` | Input tests |
| V16 | P2 | Login email check only `includes('@')` | `LoginPage.tsx` | Email validation test |

---

## 5. Design weaknesses (41)

Design weaknesses are not runtime defects and are scheduled in P2/P3. They must not
displace P0/P1. Full detail is in `07`/`02` §D/§J.

| Group | IDs | Summary |
|---|---|---|
| Backend design | D1–D12, D20–D25 | bounded setattr; phantom `is_primary`; hard delete loses audit; Python aggregation; unbounded lists; duplicate routes; partial-period comparison; server-TZ budget month; hardcoded URLs; many commits; None totals; no API versioning; weak JWT lifecycle; open registration; broad CORS; no CSP; debug signing; Android/backend divergence; lossy restart state; weekly stub count; docs drift; no backup/DR; dead config; financial metadata in logs; fail-open `user_id=None` |
| Frontend design | D26–D41 | online creates without idempotency; offline queue only status 0; poison retries; no shared cache; missing invalidate; three money formatters; `window.alert`; production SMS simulation; privacy copy mismatch; hardcoded merchant heuristics; ~1000 lines dead code; `as any`; navy token misuse; polling overhead; effect deps; unlabeled mock balances/ARIA gaps |

**Security-relevant design items:** D13 (JWT 30-day/no revocation), D14 (open registration),
D15 (CORS regex), D16 (no CSP), D17 (debug signing), D22 (no backup/DR), D24 (financial
metadata in logs), D25 (fail-open services). These are scheduled with T14/T15/T29.

---

## 6. Unresolved decisions (19)

Full analysis in `UNRESOLVED_PRODUCT_DECISIONS.md`.

| ID | Decision | Blocks |
|---|---|---|
| U1 | Refund accounting model (net expense vs income) | C11, T13, all financial surfaces |
| U2 | Pre-opening transactions in balance | C14, T13 |
| U3 | Credit-card/negative opening balance sign | V3, C5 display |
| U4 | Reported balance timing (pre/post txn) | P9, auto-account inference |
| U5 | Failed-sync recovery policy | C24, C25, T6, T9 |
| U6 | Recurring transactions scope | T27 |
| U7 | Play SMS-permission approval | Android distribution |
| U8 | `notificationsEnabled` user control | Android notifications |
| U9 | Backup audit-trail portability | C30, T4 |
| U10 | Transfers edit/delete/offline | T19/T35 |
| U11 | "Full backup" completeness | C30/T4 |
| U12 | Preferences UI missing fields | T24 |
| U13 | Type learnings consumption | T22 |
| PD1 | Dashboard hero definition | T18 |
| PD2 | Income analytics scope | T22 |
| PD3 | Budget UX priority | T21 |
| PD4 | Hard delete vs reversal | T19 |
| PD5 | Registration policy | T14 |
| PD6 | Hosting/storage tier | T32 |

---

## 7. Severity and priority policy

1. **P0** = cross-tenant data exposure, unauthorised ledger posting, wrong-direction
   financial posting, restore isolation, or a release-build security bypass.
2. **P1** = financial figure can be wrong/misleading, a core workflow is unusable, a
   reliable retry/recovery path is broken, or a security control is missing.
3. **P2** = degraded UX/correctness in a secondary path, missing validation, or
   accessibility/design defect.
4. **P3** = cosmetic/copy.

**Promotion review (P0 candidates, not yet promoted):**

| Finding | Why it could be P0 | Why it stays P1 for now |
|---|---|---|
| C19 | Disables idempotent replay recovery for income; 500 on duplicate key | Requires an IntegrityError condition; no cross-tenant impact. Promote if income duplicates are observed. |
| C23 | Lost queue writes can drop a legitimate ledger record | Device-concurrency dependent; needs runtime proof of lost records. |
| C25 | Infinite retry can hide a permanently failed financial event | No wrong posting; operational reliability. |
| P7 | Ambiguous SMS not persisted; lost on device change | No auto-posting; data loss of review candidates. |

---

## 8. Runtime reproduction status

| Category | Code-confirmed | Runtime-reproduced in this review | Must reproduce before fix |
|---|---:|---:|---:|
| P0 (6) | 6 | **0** | **6** |
| P1 confirmed (37) | 37 | 0 | 37 |
| P2 confirmed (12) | 12 | 0 | 12 |
| P3 confirmed (1) | 1 | 0 | 0 (copy) |
| Potential (35) | 35 mechanisms | 0 | 35 |
| Validation gaps (16) | n/a | 0 | n/a (add tests) |
| Design (41) | n/a | 0 | n/a (review) |

**No defect may be marked fixed without a failing-then-passing test and captured output.**
The audits were static analysis; no application code was executed during the audit.

---

## 9. Traceability to acceptance criteria

| P0 | Acceptance criteria |
|---|---|
| C1 | AC-S1, AC-F2 |
| C2 | AC-M2 |
| C15 | AC-S2 |
| C16 | AC-M1 |
| C17 | AC-M1 |
| C18 | AC-S3 |

P1s map to AC-F1–F10, AC-S4–S8, AC-M3–M8, AC-FE1–FE8, AC-T1–T7 (see
`IMPLEMENTATION_EXECUTION_PLAN.md` §6).

---

## 10. Change log

| Date | Change |
|---|---|
| 25 Nov 2026 | Initial register. Reconciled 57→56 confirmed; exact severity distribution; P0 tests; working-tree caveat. |
