# Phase 2 Verification Report: Background SMS Sync, API Connectivity & Idempotency

**Executed On**: 2026-10-30
**Status**: COMPLETE (Verified with 100% passing tests)

---

## 1. Executive Summary

Phase 2 addressed the background SMS sync pipeline, eliminating double `/api` URL concatenation, removing hardcoded database IDs, implementing dynamic active expense-type resolution, and hardening SMS fingerprinting and backend idempotency replay handling.

---

## 2. Implemented Fixes & Changes

### Task A — Stable SMS Fingerprint and Idempotency Key
- **File**: `android/app/src/main/java/com/moneytrack/app/sms/SmsTransaction.kt`
- **When Bank Reference Exists**:
  - Fingerprint key is generated as: `ref:<normalized_sender>:<normalized_reference>:<amount_paise>`.
  - Delivery `timestampMs` is strictly excluded when a valid reference exists.
  - Senders are normalized by stripping Indian telecom circle/operator prefixes (`AD-`, `VM-`, `VK-`, `BZ-`).
  - Whitespace and case are trimmed and normalized.
  - Senders and amounts produce identical fingerprints across different network delivery times.
- **When No Bank Reference Exists**:
  - Fallback key: `fallback:<normalized_sender>:<transaction_date_or_day_bucket>:<amount_paise>`.
  - Prioritizes parsed ISO transaction date (`yyyy-MM-dd`) over delivery timestamp.
- **Model**:
  - Added `data class ActiveExpenseType(val id: Int, val name: String, val category: String? = null)`.

### Task B — Backend URL Normalization
- **File**: `android/app/src/main/java/com/moneytrack/app/sms/SyncWorker.kt`
- Implemented `buildEndpointUrl(backendUrl: String, endpoint: String): String`.
- Tested & supported configurations:
  - `http://10.0.2.2:8000` -> `http://10.0.2.2:8000/api/expenses`
  - `http://10.0.2.2:8000/` -> `http://10.0.2.2:8000/api/expenses`
  - `http://10.0.2.2:8000/api` -> `http://10.0.2.2:8000/api/expenses`
  - `http://10.0.2.2:8000/api/` -> `http://10.0.2.2:8000/api/expenses`
  - `http://10.0.2.2:8000/api/expenses` -> `http://10.0.2.2:8000/api/expenses`
  - `http://10.0.2.2:8000` with `expense-types?archived=exclude` -> `http://10.0.2.2:8000/api/expense-types?archived=exclude`
- Never produces `/api/api/`, preserves HTTPS, host, port, and custom paths, and rejects invalid URLs with `IllegalArgumentException`.

### Task C — Dynamic Expense-Type Resolution
- **File**: `android/app/src/main/java/com/moneytrack/app/sms/SyncWorker.kt`
- Removed hardcoded category IDs (previously hardcoded `5` and `2`, with `Food`, `Shopping`, `Health`, etc. returning `null`).
- Added `fetchActiveExpenseTypes(backendUrl: String): List<ActiveExpenseType>` targeting `GET /api/expense-types?archived=exclude`.
- Added `parseExpenseTypesJson(jsonString: String)` supporting wrapped `{ "items": [...] }` and bare array `[...]` while excluding archived types.
- Implemented `resolveExpenseTypeId(suggestion, merchant, activeTypes)` with 7-tier priority:
  1. Exact expense-type name match.
  2. Exact category match.
  3. Explicit alias mapping (`Transport` -> `Travel`, `Groceries` -> `Food`, `Fuel` -> `Travel`, `Mobile Recharge` -> `Utilities`).
  4. Partial/substring match on type name.
  5. Merchant-based matching.
  6. Active type named or categorized as `Other` or `General`.
  7. First active expense type fallback.
  - Returns `null` only when active types list is empty.

### Task D — SyncWorker Idempotency & Replay Handling
- **File**: `android/app/src/main/java/com/moneytrack/app/sms/SyncWorker.kt`
- Sends `record.id` as HTTP `Idempotency-Key` header.
- Parses `X-Idempotent-Replay: true` and HTTP 200 responses to treat replayed requests as successful syncs without creating duplicates.
- Only marks queue records `CandidateStatus.SYNCED` after backend confirms creation (HTTP 201) or replay (HTTP 200).
- Preserves WorkManager exponential backoff retry scheduling for transient failures.

### Task E — SmsReceiver Integration
- **File**: `android/app/src/main/java/com/moneytrack/app/sms/SmsReceiver.kt`
- Updated `Fingerprint.of()` call to supply `parsed.transactionDate`.
- Prevents duplicate queue records when the telephony system redelivers or broadcasts identical SMS.

---

## 3. Test Suite & Verification Matrix

| Test Suite | Command | Result | Pass Count |
|---|---|---|---|
| **Android Unit Tests** | `cd android; .\gradlew.bat test` | **SUCCESS** in 26s | 55/55 passed (100%) |
| **Android Debug APK** | `cd android; .\gradlew.bat assembleDebug` | **SUCCESS** in 14s | Generated at `android/app/build/outputs/apk/debug/app-debug.apk` (5,254,663 bytes) and `release/MoneyTrack.apk` |
| **Backend Pytest** | `python -m pytest backend/tests` | **SUCCESS** in 21.55s | 138/138 passed (100%) |
| **Frontend Unit Tests** | `npm --prefix frontend run test -- --run` | **SUCCESS** in 213ms | 37/37 passed across 5 test suites |
| **Frontend Typecheck** | `npm --prefix frontend run typecheck` | **SUCCESS** | 0 errors (`tsc --noEmit`) |

---

## 4. Database Safety Verification

| Metric | Before Phase 2 | After Phase 2 | Status |
|---|---|---|---|
| **Database File Path** | `backend/data/moneytrack.db` | `backend/data/moneytrack.db` | Verified |
| **File Size** | 81,920 bytes | 81,920 bytes | Exact match |
| **Expenses Record Count** | 5 | 5 | Unchanged |
| **Expense Types Count** | 5 | 5 | Unchanged |
| **`PRAGMA integrity_check`** | `ok` | `ok` | Passed |
| **Timestamped Backup** | `moneytrack.db.backup_20261030_200300` (81,920 bytes) | `moneytrack.db.backup_20261030_200300` (81,920 bytes) | Verified untouched |
