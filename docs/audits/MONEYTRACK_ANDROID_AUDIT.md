# MoneyTrack Android & Capacitor Audit Report

**Scope:** `D:\MoneyTrack\android\` (`com.moneytrack.app`, Capacitor 8.5, Kotlin SMS Engine, Gradle build)  
**Target Environment:** Android native SMS capture + Offline Queue + Neon PG18-backed FastAPI sync

---

## 1. Executive Summary

MoneyTrack's Android shell combines a Capacitor 8.5 WebView (`com.moneytrack.app`) with a native Kotlin SMS capture and reconciliation pipeline (`SmsReceiver`, `SmsParser`, `SmsEligibility`, `SmsReconciliation`, `TransactionStore`, `SyncWorker`, `SmsPlugin`, `SmsNotificationHelper`, `MainActivity`).

While offline persistence (`TransactionStore.kt`) and WorkManager retries (`SyncWorker.kt`) provide a resilient offline baseline, the audit identified **3 P0/P1 integrity & security issues** (`C15`, `C2`, `C17`) and **2 P1 pipeline/notification defects** (`C22`, `C26`).

---

## 2. Architecture & Component Inventory

| Component | File Path | Responsibility |
|---|---|---|
| Activity & Intent Entry | `android/app/src/main/java/com/moneytrack/app/MainActivity.kt` | Capacitor BridgeActivity, hardware back dispatch, notification intent handling |
| Manifest & Permissions | `android/app/src/main/AndroidManifest.xml` | Receiver registration, SMS & notification permissions, exported components |
| Capacitor Bridge Plugin | `android/app/src/main/java/com/moneytrack/app/plugins/SmsPlugin.kt` | Exposes queued SMS candidates & manual sync/dismiss actions to JS |
| Broadcast Receiver | `android/app/src/main/java/com/moneytrack/app/sms/SmsReceiver.kt` | Intercepts incoming SMS, checks eligibility/parser, stores record, triggers notification |
| Eligibility Filter | `android/app/src/main/java/com/moneytrack/app/sms/SmsEligibility.kt` | Filters OTPs, promos, balance queries, and non-financial messages |
| SMS Parser | `android/app/src/main/java/com/moneytrack/app/sms/SmsParser.kt` | Extracts amount (paise), direction (`CREDIT`/`DEBIT`/`TRANSFER`/`UNKNOWN`), bank, reference |
| Reconciliation | `android/app/src/main/java/com/moneytrack/app/sms/SmsReconciliation.kt` | Deduplicates & matches SMS candidates locally |
| Offline Store | `android/app/src/main/java/com/moneytrack/app/sms/TransactionStore.kt` | Local persistent queue for pending/synced SMS records |
| Background Sync | `android/app/src/main/java/com/moneytrack/app/sms/SyncWorker.kt` | WorkManager job posting queued records to backend `/api/sms/ingest` |
| Notifications | `android/app/src/main/java/com/moneytrack/app/sms/SmsNotificationHelper.kt` | Local notifications for reviewable/posted transactions |

---

## 3. Confirmed Findings

### [P0 / C15] Unprotected `TEST_NOTIFICATION` Intent Handler in Production Builds
- **Location:** `android/app/src/main/java/com/moneytrack/app/MainActivity.kt` (L41–48)
- **Root Cause:** `MainActivity` processes `intent.action == "com.moneytrack.app.TEST_NOTIFICATION"` unconditionally in all build variants (including release builds) and logs raw intent extras.
- **Impact:** Any local app or ADB caller can trigger fake notification test flows and inspect debug intent handling in release builds.
- **Remediation:** Guard `TEST_NOTIFICATION` handling behind `BuildConfig.DEBUG` and remove sensitive/unnecessary intent extra logging.

### [P0 / C2] Unsafe Fallback from `/api/sms/ingest` to `/api/expenses` for Non-Debit SMS
- **Location:** `android/app/src/main/java/com/moneytrack/app/sms/SyncWorker.kt` (L341–349)
- **Root Cause:** When `ingestSms(...)` returns `null` (e.g., transient error or non-2xx response), `SyncWorker` falls back to `createExpense(...)` (`POST /api/expenses`).
- **Impact:** `CREDIT` or `UNKNOWN` SMS messages can be misposted as expenses if `/api/sms/ingest` fails, violating **Financial Invariant #3 (Ambiguity over deduction)**. Furthermore, legacy `/expenses` bypasses the backend SMS evidence/quarantine state machine.
- **Remediation:** Never fall back to `/api/expenses` for `CREDIT`, `TRANSFER`, or `UNKNOWN` directions; let WorkManager retry `/api/sms/ingest` rather than silently misclassifying direction.

### [P0 / C17] `UNKNOWN` Transaction Direction Collapsed to `"DEBIT"` During Sync
- **Location:** `android/app/src/main/java/com/moneytrack/app/sms/SyncWorker.kt` (L362)
- **Root Cause:** `val direction = if (parsed.status == TxnStatus.CREDIT) "CREDIT" else "DEBIT"` maps any status other than `CREDIT` (including ambiguous/unknown directions) straight to `"DEBIT"`.
- **Impact:** Ambiguous bank alerts that should enter `AMBIGUOUS_REVIEW` / `PENDING_REVIEW` on the backend are sent as `"DEBIT"`, risking silent auto-posting of expenses.
- **Remediation:** Map `TxnStatus.CREDIT -> "CREDIT"`, `TxnStatus.DEBIT -> "DEBIT"`, `TxnStatus.TRANSFER -> "TRANSFER"`, and unknown/other statuses to `"UNKNOWN"` (paired with `C16` on the backend schema).

### [P1 / C22] `PENDING_REVIEW` Notification Flag Not Persisted as `true` After Notifying
- **Location:** `android/app/src/main/java/com/moneytrack/app/sms/SmsReceiver.kt` (L82–92)
- **Root Cause:** `val notify = existing == null || !existing.notified`, followed by `notified = existing?.notified ?: notify`. When `existing` exists with `notified == false`, `existing?.notified` evaluates to `false` instead of capturing that a notification is now being issued (`existing?.notified == true || notify`).
- **Impact:** Duplicate review notifications can fire for the same queued SMS candidate on subsequent passes/updates.
- **Remediation:** Set `notified = (existing?.notified == true) || notify` when creating/updating the stored `TransactionRecord`.

### [P1 / C26] Eligibility Promo Check Can Quarantine Legitimate Bank Confirmation SMS
- **Location:** `android/app/src/main/java/com/moneytrack/app/sms/SmsEligibility.kt`
- **Root Cause:** Broad promotional keyword substring checks can reject genuine debit/credit confirmations that mention promotional phrases (e.g., cashback/rewards/offer terms in footer text).
- **Impact:** Valid financial alerts may be prematurely dropped before reaching `SmsParser` / backend quarantine inspection.
- **Remediation:** Apply bank-confirmation/debit-credit evidence overrides before rejecting solely on promotional footer phrases.

### [P1 / C39 (Android ↔ Web Bridge)] Back Button Escape Event Dispatched on `window` Instead of `document`
- **Location:** `frontend/src/hooks/useAndroidBackButton.ts` (L40–47)
- **Root Cause:** Hardware back press dispatches synthetic `Escape` `KeyboardEvent` on `window`, whereas `Modal.tsx` registers its `keydown` listener on `document`.
- **Impact:** Android hardware back button does not close open React modals reliably when WebView intercepts back navigation.
- **Remediation:** Dispatch the synthetic `Escape` event on `document`.

---

## 4. Build, Release & Offline Resilience Verification

- **Gradle Verification Commands:**
  - Unit tests: `cmd /c "cd android && gradlew.bat test"`
  - APK build: `cmd /c "cd android && gradlew.bat assembleDebug"`
  - Sync assets before APK build: `npx cap sync android` (after `npm --prefix frontend run build`)
- **Artifact Location:** `D:\MoneyTrack\release\MoneyTrack.apk`
- **Offline Invariants:** `TransactionStore.kt` and `SyncWorker.kt` retry/persistence semantics must be preserved across all fixes.
