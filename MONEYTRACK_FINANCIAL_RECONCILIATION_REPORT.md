# MONEYTRACK — FINANCIAL RECONCILIATION & LEDGER ACCURACY REPORT

**Author:** Financial Systems Architect & Senior Mobile/Backend Engineer  
**Status:** VALIDATED (`PASS`)  
**Scope:** Double-entry consistency, bank balance reconciliation, consecutive transaction handling, idempotent processing  

---

## 1. Executive Summary

Financial accuracy in MoneyTrack is guaranteed by:
1. Paise-level integer math (no IEEE 754 floating point rounding drift).
2. Explicit multi-layer reconciliation between reported bank balance and local running balance.
3. Strict idempotency keys for both online sync and offline queue replay.
4. Non-colliding fingerprint generation for consecutive transactions with identical amounts.

---

## 2. Key Challenges & Implemented Solutions

### 2.1 Consecutive Identical Credits (e.g., Government Split Installments)
- **Problem:** Many Indian banking SMS messages (such as welfare payouts or divided remittances) deliver two identical amounts (e.g. `INR 3003.00`) within minutes or seconds of each other. A naive duplicate filter comparing only `(amount, date)` or `(amount, sender)` will discard the second legitimate installment as a false duplicate.
- **Solution:** Fingerprint generation combines:
  `SHA-256(sender + "|" + timestamp_ms + "|" + amount_paise + "|" + reference + "|" + account_suffix + "|" + balance_paise)`.
  Because the available balance shifts after the first credit (e.g. from `₹9140.09` to `₹12143.09`), the fingerprints are uniquely distinct. Even if balance is omitted, unique bank reference or timestamp difference prevents false-positive deduplication.
- **Verification:** Tested in `test_dual_credit_consecutive_ingest`, resulting in two separate records in the `incomes` ledger with accurate balance reconciliation.

### 2.2 Balance Reconciliation & Discrepancy Detection
- In `backend/app/services/bank_accounts.py` and `backend/app/services/sms_ingest.py`:
  When an incoming SMS contains an `available_balance_paise`:
  1. The `bank_accounts.last_reported_balance_paise` is updated.
  2. `recalculate_account_balance(db, account_id)` sums all `incomes` minus all `expenses` plus `opening_balance_paise` and account transfers.
  3. If `calculated_balance_paise == last_reported_balance_paise`, status is marked `matched`.
  4. If a variance exists, status is flagged as `discrepancy` for user review in the UI rather than silently masking missing transactions.

### 2.3 Idempotent Processing
- `ExpenseCreate` and `IncomeCreate` API endpoints both accept the standard HTTP header `Idempotency-Key`.
- Replaying the same request returns `HTTP 200 OK` with header `X-Idempotent-Replay: true` and the existing entity payload without double-booking.
- Validated across both expenses and incomes in unit and integration test suites.

---

## 3. Reconciliation Test Matrix

| Reconciliation Scenario | Expected Behavior | Automated Test Status |
| :--- | :--- | :--- |
| Consecutive Identical Credit Ingest | Two distinct incomes created; bank balance tracks second balance. | **PASS** (`test_dual_credit_consecutive_ingest`) |
| Repeated Request with same Idempotency Key | Single expense/income preserved; zero duplicate ledger entries. | **PASS** (`test_sms_evidence_recording_and_idempotency`) |
| High-precision Paise Arithmetic | All calculations in integer paise; formatting matches `₹XX,XXX.YY`. | **PASS** (`currency.test.ts`) |
| Cross-account Transfers | Balanced debit and credit legs with zero net drift across total assets. | **PASS** (Pytest `test_transfers.py`) |
