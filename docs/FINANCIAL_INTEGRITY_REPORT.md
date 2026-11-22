# MoneyTrack — Financial Data Integrity Report

**Document Date:** 8 November 2026  
**Auditor:** Complete Engineering Team  
**Scope:** Double-Entry Ledger Invariants, Deserialization Safety, Idempotency, and Decimal Precision

---

## 1. Mandatory Financial Invariants

MoneyTrack enforces 12 core financial invariants across the entire processing pipeline:

1. **Exact-Once Ledger Posting**: A single real-world payment never creates multiple ledger entries.
2. **Ambiguity Over Deduction**: A positive financial amount alone never establishes a transaction. Unknown directions are classified as `AMBIGUOUS_REVIEW` and assigned `CandidateStatus.PENDING_REVIEW`. They are **never** auto-synced as debits.
3. **Non-Financial Message Quarantine**: Promotional messages, OTPs, balance queries, and telecom data quotas are filtered to `NON_FINANCIAL_SMS` and quarantined.
4. **Distinct Identical Transactions**: Legitimate identical-amount transactions (such as the ₹3,003 SDCCBL dual credit) are preserved as distinct entities when supported by UTR references or balance progression deltas.
5. **Integer Minor-Unit Representation**: All monetary quantities are stored and manipulated as integer `paise` (1 INR = 100 paise), completely eliminating floating-point rounding errors.
6. **Replay Idempotency**: Ingesting the same transaction with an identical idempotency key returns `replayed=True` without double-updating account balances or duplicate ledger rows.
7. **Thread-Safe Queue Persistence**: Disk updates in `TransactionStore.kt` use synchronized file locks and safe JSON serialization.
8. **Preservation of User Edits**: Calling `TransactionStore.upsert()` for an existing record by ID updates the record directly, bypassing deduplication filters.
9. **Single-Balance Posting**: Bank account balances are updated once per unique transaction using authoritative CBS reporting.
10. **Atomic Transfers**: Account transfers debit the origin account and credit the destination account within a single database transaction.
11. **Tenant-Scoped Category Resolution**: Fallback category matching resolves only system defaults (`user_id IS NULL`) or the requesting user's private categories.
12. **Network Resilience**: Failed synchronization preserves the local record with an incremented retry count.

---

## 2. In-Depth Analysis: The ₹3,003 SDCCBL Dual-Credit Case

### Historical Incident:
On 7 November 2026, the device received two SMS messages 28 seconds apart:
- Message 1: ₹3,003.00 Cr, A/c `*8824`, Avail Bal ₹9,140.09.
- Message 2: ₹3,003.00 Cr, A/c `*8824`, Avail Bal ₹12,143.09.

### Reconciliation Resolution:
Under the legacy engine, Message 2 was dropped because the amounts and account suffix matched.
Under the hardened engine:
1. Both lack external reference numbers (Layer B does not merge).
2. Layer C detects conflicting reported balances (`9,140.09 != 12,143.09`) and refuses to merge.
3. **Layer E Validates Balance Delta Progression:**
   $$\Delta \text{Balance} = |12,143.09 - 9,140.09| = 3,003.00 == \text{Amount}$$
   This confirms two consecutive credits of ₹3,003 occurred on the core banking system, preserving both in the ledger.

---

## 3. 25-Point Comprehensive Verification Suite

MoneyTrack backend test suite `backend/tests/test_balance_aware_engine.py` implements 25 automated end-to-end tests covering every required scenario:

| # | Test Scenario | Verification Invariant | Status |
|---|---------------|------------------------|--------|
| 1 | One ₹10 debit + 100 duplicate SMS | Balance remains ₹990; exactly 1 expense | **PASS** |
| 2 | One ₹10 credit + 100 duplicate SMS | Balance remains ₹1,010; exactly 1 income | **PASS** |
| 3 | Two distinct ₹10 debits | Balance decreases by ₹20; exactly 2 expenses | **PASS** |
| 4 | Two distinct ₹10 credits | Balance increases by ₹20; exactly 2 incomes | **PASS** |
| 5 | One ₹3,003 credit + duplicates | Balance remains ₹12,143.09; exactly 1 income | **PASS** |
| 6 | Two genuine ₹3,003 credits | Total income ₹6,006; exactly 2 incomes | **PASS** |
| 7 | Duplicate with updated balance wording | Reconciled via metadata; no double count | **PASS** |
| 8 | Same reference with conflicting amount | Flagged for manual review; no unsafe entry | **PASS** |
| 9 | Same amount with different references | Preserved as 2 distinct ledger entries | **PASS** |
| 10 | Delayed duplicate message | Deduplicated cleanly; balance untouched | **PASS** |
| 11 | Out-of-order balance snapshots | Older snapshot does not overwrite newer balance | **PASS** |
| 12 | Intervening debit | Inflow - outflow + inflow correctly posted | **PASS** |
| 13 | Intervening credit | Outflow + inflow correctly posted | **PASS** |
| 14 | Available vs ledger balance | Stored with explicit `balance_type` separation | **PASS** |
| 15 | Manual transaction confirmed by SMS | Reconciled to existing entry; debited once | **PASS** |
| 16 | Backend replay | Returns `replayed=True`, identical transaction ID | **PASS** |
| 17 | Queue retry | Idempotent response without balance alteration | **PASS** |
| 18 | Application restart | Full persistence survival across fresh DB sessions | **PASS** |
| 19 | Concurrent duplicate processing | Thread-safe locking; exactly 1 creates entry | **PASS** |
| 20 | Duplicate SMS after device restart | Persistent queue drops redelivered broadcasts | **PASS** |
| 21 | Missing transaction reference | Handled via content hash and balance progression | **PASS** |
| 22 | Missing balance | Financial delta applied to ledger accurately | **PASS** |
| 23 | Identical suffixes on multiple accounts | Disambiguated by bank name matching | **PASS** |
| 24 | Refund and reversal | Debit + reversal credit net to initial balance | **PASS** |
| 25 | Snapshot older than latest known | Preserved in history without regressing balance | **PASS** |

