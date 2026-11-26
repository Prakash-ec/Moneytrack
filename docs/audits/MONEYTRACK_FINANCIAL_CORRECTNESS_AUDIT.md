# MoneyTrack — Financial Correctness Audit

**Audit Date:** 2026-11-26  
**Authority:** `AGENTS.md` Non-Negotiable Financial Invariants & `docs/FINANCIAL_INTEGRITY_REPORT.md`  
**Skills Applied:** `api-idempotency-retry`, `pydantic`, `sqlalchemy-alembic-expert-best-practices-code-review`

---

## 1. Integer Minor Units (Paise) & Conversion Integrity

- **Backend & Web Core (`backend/app/core/money.py`, `frontend/src/utils/currency.ts`):** All database columns (`amount_paise`, `opening_balance_paise`, `current_balance_paise`, `last_reported_balance_paise`) use integer paise (`BIGINT` / `INTEGER`), and `parseRupeesToPaise()` parses decimal strings cleanly without float arithmetic.
- **Open Float Defects (`P2`, `P25`):**
  - `android/app/src/main/java/com/moneytrack/app/sms/SmsParser.kt:383-388`: `toPaise(raw)` uses `cleaned.toDoubleOrNull()` + `Math.round(value * 100.0)` instead of `BigDecimal`.
  - `frontend/src/pages/SmsReviewPage.tsx` (in edit parsing): `parseFloat` truncates comma-formatted strings like `"1,240.00"` to `1`.

---

## 2. Transaction Direction & Ambiguity Quarantine

> *Invariant: Unknown SMS direction stays `AMBIGUOUS_REVIEW` / `CandidateStatus.PENDING_REVIEW`; never auto-post a debit.*

- **`C16` (`P0`):** `backend/app/schemas/sms_ingest.py:20` sets `direction: Literal["CREDIT", "DEBIT", "TRANSFER", "UNKNOWN"] = "DEBIT"`. Any caller omitting `direction` auto-posts a debit instead of routing to review (`sms_ingest.py:180-187` only triggers when `direction` is explicitly `"UNKNOWN"` or invalid!).
- **`C17` (`P0`):** `android/.../SyncWorker.kt:362` evaluates `val direction = if (parsed.status == TxnStatus.CREDIT) "CREDIT" else "DEBIT"`, converting `UNKNOWN`/`PENDING` into `DEBIT`! `SmsPlugin.kt:171,255` similarly promotes candidates to `READY_TO_SYNC` without requiring explicit direction when confirmed/updated.
- **`C2` (`P0`):** `SyncWorker.kt:342-348` falls back to `createExpense(...)` (`POST /api/expenses`) whenever `ingestSms()` returns `null` (including network timeouts after backend commit or 5xx errors). That silently turns **CREDIT** SMS messages into **EXPENSE** entries and bypasses bank account reconciliation and deduplication!

---

## 3. Account Balances, Opening Balances & Reconciliation

- **Swallowed Balance Recalculation (`C3` — `P1`):** `backend/app/services/expenses.py:211-216` wraps `recalculate_account_balance(db, effective_account_id)` in `try: ... except Exception: pass` **after** `db.commit()`. A transient failure leaves ledger rows committed with a stale `current_balance_paise`.
- **Non-Atomic Transfers (`C9` — `P1`):** `backend/app/services/transfers.py:118-123` commits the `AccountTransfer` row first, then calls `recalculate_account_balance` (each doing its own `db.commit()`) for `from_account_id` and `to_account_id`. A failure mid-sequence violates atomic double-sided balance updates.
- **Zero Balance Blindness (`C4` — `P1`):** `backend/app/api/routes/bank_accounts.py:100` enforces `reported_balance_paise: int = Query(gt=0)`, and `sms_ingest.py:572,636,711,780,929,1072` checks `payload.available_balance_paise > 0`. An account drained to `₹0.00` (`0` paise) cannot have its reported balance recorded!
- **Concurrent Recalculation Race (`P1`):** `recalculate_account_balance()` (`bank_accounts.py:28-95`) performs un-locked `SUM()` reads under PostgreSQL `READ COMMITTED`. Concurrent writes can compute stale balances depending on commit order unless `SELECT ... FOR UPDATE` locks the `BankAccount` row.
- **Reconciliation Schema Mismatch (`C6`):** `backend/app/schemas/cashflow.py:35-40` returns `0` for `reconciliation_difference_paise` when `total_reported_balance_paise` is `None`. (`HomePage.tsx:143` avoids this by checking `reported == null`, but `cashflow.py` should return `None`).

---

## 4. Idempotency, Reversals & Deduplication

- **DEBIT Idempotency Tenant Scope (`C1` — `P0`):** `ExpenseIdempotencyKey` (`idempotency_key.py:25-27`) is globally unique without `user_id`; `sms_ingest.py:288-294` uses unscoped `db.get(Expense, existing_key.expense_id)`.
- **Transfer Idempotency `IntegrityError` (`P10` — `P2`):** `transfers.py:105-126` checks `AccountTransfer.idempotency_key` before `db.add()`, but does not handle `IntegrityError` on concurrent duplicate commit.
- **Restore Transfer Duplication (`C29` — `P1`):** `exports.py:680-711` inserts restored transfers unconditionally with zero signature/reference deduplication, inflating account balances on every repeat restore.
- **Android 5-Layer vs Backend Reconciliation Alignment (`P3`, `P4`, `P19`, `P22`):**
  - `SmsReconciliation.kt` runs Layer C (dual-notification merge when one balance is null) and Layer D (recharge merge without ref check) **before** Layer E (balance progression check), risking suppression of legitimate consecutive identical debits/recharges.
  - `SmsParser.kt:264` evaluates `REVERSAL_KEYWORDS` before `CREDIT_KEYWORDS`, classifying refund credits containing `"reversed back"` as `REVERSAL` and dropping them in `SmsEligibility.kt:52`.
- **Reversals & Cashflow Definition (`C11`, `C14`):** `sms_ingest.py:901-923` creates an `Income` row for refunds while keeping the original `Expense` gross, inflating both gross income and gross expense (`U1` ADR needed to net refunds in reports/analytics while preserving audit rows).

---

## 5. Reports & Exports

- **Weekly Report Crash (`C21` — `P1`):** `backend/app/services/weekly_report.py:185` reads `acc.name` on `BankAccount` (which only defines `account_name`), raising `AttributeError` (`HTTP 500`) whenever any expense in the week is linked to a bank account.
- **Income Totals on Frontend (`C34` — `P1`):** `IncomePage.tsx:90` computes `pageInflowPaise` over the current paginated slice (20 items) instead of using `incomesQuery.data.total_paise` when filters are active.
- **Weekly Report Negative Net Sign (`C36` — `P1`):** Needs signed formatting (`formatSignedINR`) rather than `Math.abs` formatting so net deficit weeks are never displayed as positive gains.
- **Breakdown Truncation (`C45` — `P1`):** `BreakdownPage.tsx:93-95` aggregates payment method and merchant totals from only the first 100 expenses.
