# MoneyTrack — Android Implementation Report

**Document Date:** 8 November 2026  
**Module:** `android/`  
**Physical Hardware Tested:** OPPO CPH2729 (Android 16, API 36, Device Serial: `e9818d7b`)

---

## 1. Resolved Native Defects During Audit & Hardening

1. **Transaction Direction Fallback Vulnerability**:
   - *Problem:* In `cleanQueue()` and `parsedFromJson()`, unknown transaction directions previously defaulted to `BANK_DEBIT`.
   - *Fix:* Ambiguous directions strictly set to `FinancialTxnType.AMBIGUOUS_REVIEW` and `CandidateStatus.PENDING_REVIEW`.
2. **Existing-Record Update Interception**:
   - *Problem:* Calling `store.upsert()` for an existing record by ID was intercepted by deduplication logic because the hash already existed.
   - *Fix:* `upsert()` checks `indexOfFirst { it.id == record.id }` first, applying updates directly.
3. **Reference Masking Bug**:
   - *Problem:* `isMaskedAccount` treated any reference containing the letter `'X'` (e.g. `TXN98877`) as a masked account number.
   - *Fix:* Mask patterns now require `XX`, `**`, `*`, or `A/C`.
4. **Amount Conflict in Layer B**:
   - *Problem:* Matching UTR references with differing amounts (e.g. ₹50 vs ₹500) previously merged into a single record.
   - *Fix:* Layer B requires `ex.amountPaise == incomingAmount` before merging.
5. **JVM Unit Test Context Stub Failure**:
   - *Problem:* `Proxy.newProxyInstance` on abstract `android.content.Context` failed in local JVM tests.
   - *Fix:* Configured Mockito context provider and enabled `unitTests.returnDefaultValues = true`.

---

## 2. Physical Device Validation (OPPO CPH2729)

- **Installation:** Streamed `app-debug.apk` directly via ADB (`adb install -r`).
- **Storage Inspection:** Inspected `files/sms_transaction_queue.json` via `run-as com.moneytrack.app`.
- **Integrity Verified:** All 5 existing records survived update:
  - Jio ₹15 debit (`SYNCED`)
  - SDCCBL ₹10 debit (`SYNCED`)
  - SDCCBL ₹40 credit (`SYNCED`)
  - SDCCBL ₹3,003 credit (`SYNCED`)
  - JA-ISATHI-G telecom alert (`IGNORED`, `AMBIGUOUS_REVIEW`)
- **Zero data loss verified.**
