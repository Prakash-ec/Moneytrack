# MONEYTRACK — ANDROID ARCHITECTURE AUDIT

**Project:** MoneyTrack  
**Date:** November 8, 2026  
**Package:** `com.moneytrack.app`  
**Target Device Tested:** OPPO CPH2729 (ColorOS 16 / Android 16 / API 36)  
**ADB Serial:** `e9818d7b`  
**Git Branch:** `sms-engine-hardening`  
**Active Baseline:** `f67d71d8cbd2411117117d6ac0fe5add7e0faecb`  

---

## 1. Executive Architectural Summary

MoneyTrack is architected as an **advanced hybrid Android financial application** leveraging **Capacitor 8** as the cross-platform bridge, a **React 19 / TypeScript** UI layer, and a deeply integrated **Kotlin / AndroidX native engine** for mission-critical operating system integrations:

1. **Native OS Integrations:**
   * **Telephony & SMS Broadcasts:** Native `SmsReceiver` directly bound to `android.provider.Telephony.SMS_RECEIVED` protected by `android.permission.BROADCAST_SMS`.
   * **On-Device Financial Classification:** Native Kotlin regex & contextual parser (`SmsParser`, `SmsEligibility`, `SmsReconciliation`) running on-device with zero cloud telemetry for unconfirmed messages.
   * **Persistent Storage & Queuing:** Hardware-isolated `TransactionStore` writing atomically to `context.filesDir/sms_transaction_queue.json`.
   * **Security & Cryptography:** Android Keystore-backed AES-256-GCM hardware key storage (`SecureTokenStore`) protecting JWT authentication tokens.
   * **Background Orchestration:** Android `WorkManager` 2.10.0 orchestrating deferrable sync (`SyncWorker`) with exponential backoff and periodic Monday morning financial recaps (`WeeklyReportWorker`).
   * **Notification Engine:** Dedicated `NotificationManager` channels (`CHANNEL_SMS_REVIEW`, `CHANNEL_SECURITY_ALERTS`, `CHANNEL_WEEKLY_REPORTS`) with stable deterministic IDs and direct deep links.

2. **Web / UI Layer:**
   * Single Page Application (SPA) built with React 19, TypeScript, Tailwind CSS, and Vite.
   * Runs inside an optimized Android `WebView` embedded in Capacitor's `BridgeActivity`.
   * Handles interactive financial dashboard, real-time analytics, receipt OCR scanning, and transaction management.

3. **Backend & Cloud Architecture:**
   * Production Backend: FastAPI running on Render (`https://moneytrack-backend-g5is.onrender.com`).
   * Production Database: Serverless PostgreSQL hosted on Neon, running migration revision `0008_tenant_unique`.

---

## 2. Directory Structure & Filesystem Layout

```
D:\MoneyTrack\
├── android/                         # Primary native Android project root
│   ├── app/
│   │   ├── build.gradle             # App module build config (minSdk 24, compileSdk 36, targetSdk 36)
│   │   ├── proguard-rules.pro       # R8 / ProGuard configuration
│   │   └── src/main/
│   │       ├── AndroidManifest.xml  # Core Android manifest & permissions
│   │       ├── java/com/moneytrack/app/
│   │       │   ├── MainActivity.kt               # BridgeActivity, deep link routing
│   │       │   ├── plugins/SmsPlugin.kt          # Capacitor two-way plugin bridge
│   │       │   ├── security/SecureTokenStore.kt  # AndroidKeyStore AES-GCM token storage
│   │       │   └── sms/
│   │       │       ├── Fingerprint.kt            # 8-attribute SHA-256 transaction fingerprint
│   │       │       ├── SmsEligibility.kt         # Financial context validator
│   │       │       ├── SmsNotificationHelper.kt  # Android notification channels & dispatcher
│   │       │       ├── SmsParser.kt              # On-device amount, merchant, ref, balance parser
│   │       │       ├── SmsReceiver.kt            # Broadcast receiver for telephony broadcasts
│   │       │       ├── SmsReconciliation.kt      # 5-layer deduplication & reconciliation engine
│   │       │       ├── SmsTransaction.kt         # Data models & classification enums
│   │       │       ├── SyncWorker.kt             # WorkManager sync with idempotent backend upload
│   │       │       ├── TransactionStore.kt       # Thread-safe internal storage persistence
│   │       │       └── WeeklyReportWorker.kt     # Periodic weekly spending summary worker
│   │       └── res/                 # Android mipmap icons, drawables, splash screens, styles
│   ├── build.gradle                 # Project-level build script (AGP 8.13.0, Kotlin 1.9.22)
│   ├── gradle.properties
│   ├── settings.gradle
│   └── variables.gradle             # Centralized dependency versions
├── frontend/
│   ├── android/                     # NTFS Directory Junction -> D:\MoneyTrack\android
│   ├── capacitor.config.ts          # Capacitor configuration (appId: com.moneytrack.app)
│   ├── package.json                 # React dependencies & Capacitor CLI
│   └── src/
│       ├── App.tsx                  # Root router, deep link handler, providers
│       ├── components/
│       │   ├── BrandLogo.tsx        # Multi-level constrained SVG brand mark
│       │   ├── ExpenseForm.tsx      # Add/edit expense modal
│       │   ├── TypeIcon.tsx         # Lucide icon renderer with dynamic color pills
│       │   └── TypeSelectSheet.tsx  # Accessible slide-down / bottom sheet type picker
│       ├── pages/
│       │   ├── BankAccountsPage.tsx # Accounts, opening balance, reconciliation
│       │   ├── ExpensesPage.tsx     # Transaction ledger & filtering
│       │   ├── IncomePage.tsx       # Income tracking with TypeSelectSheet
│       │   ├── HomePage.tsx         # Dashboard, 3D card, cashflow summary
│       │   └── SmsReviewPage.tsx    # Native SMS review, batch confirmation, historical import
│       └── services/
│           ├── api.ts               # Axios-like typed fetch client with JWT interceptor
│           ├── offlineQueue.ts      # Client-side offline expense queue
│           └── sms.ts               # Web-side bridge wrapper for SmsPlugin
└── backend/                         # FastAPI Python backend & Alembic migrations
```

> [!NOTE]
> **Filesystem Finding:** `D:\MoneyTrack\frontend\android` is an NTFS junction (symbolic link) pointing directly to `D:\MoneyTrack\android`. There is **no duplicate codebase**. Edits in either directory operate on the identical physical files on disk.

---

## 3. High-Level Architecture Diagram

```
+---------------------------------------------------------------------------------------+
|                                PHYSICAL ANDROID DEVICE                                |
|                        (OPPO CPH2729 / Android 16 / API 36)                           |
+---------------------------------------------------------------------------------------+
        |                                                              |
        v                                                              v
 [Incoming SMS Broadcast]                                      [User Launches App]
        |                                                              |
        v                                                              v
+--------------------------+                                 +--------------------------+
|       SmsReceiver        |                                 |       MainActivity       |
| (android.provider.       |                                 |    (BridgeActivity)      |
|  Telephony.SMS_RECEIVED) |                                 +--------------------------+
+--------------------------+                                               |
        |                                                                  v
        v                                                    +--------------------------+
+--------------------------+                                 |     Capacitor Bridge     |
|   SmsParser / Matcher    |                                 +--------------------------+
|  - Amount, Merch, UTR    |                                      |                ^
|  - Direction, Balance    |                                      | (JS Plugin)    | (Events)
+--------------------------+                                      v                |
        |                                                    +--------------------------+
        v                                                    |        SmsPlugin         |
+--------------------------+                                 | - getPendingTransactions |
|      SmsEligibility      |                                 | - confirmTransaction     |
| - Discards OTPs/Spam     |                                 | - importHistoricalSms    |
| - Verifies Anchor Context|                                 | - syncNow                |
+--------------------------+                                 +--------------------------+
        |                                                                  |
        v                                                                  |
+--------------------------+                                               |
|    SmsReconciliation     |<----------------------------------------------+
| - 5-Layer Deduplication  |
| - Balance Calibration    |
+--------------------------+
        |
        v
+--------------------------+         Atomic File I/O         +--------------------------+
|     TransactionStore     |================================>|  Internal Storage JSON   |
| (Thread-Safe Mutex Lock) |                                 | (sms_transaction_queue)  |
+--------------------------+                                 +--------------------------+
        |
        +-----------------------------------+
        |                                   |
        v                                   v
+--------------------------+      +--------------------------+
|   SmsNotificationHelper  |      |        SyncWorker        |
| - Channel Separation     |      |  (Android WorkManager)   |
| - Stable Deterministic ID|      +--------------------------+
| - Deep Link Intent       |                    |
+--------------------------+                    | HTTPS REST (Bearer JWT from
        |                                       | SecureTokenStore AES-GCM)
        v                                       v
[Android Notification Drawer]     +-----------------------------------------------------+
        |                         |                  PRODUCTION CLOUD                   |
        | Tapped by User          |  - FastAPI Backend (Render)                         |
        v                         |  - Neon Serverless PostgreSQL (0008_tenant_unique)  |
[Deep Link: com.moneytrack.app://]|  - Idempotent Ingest (/api/sms/ingest)              |
                                  +-----------------------------------------------------+
```

---

## 4. Component-by-Component Breakdown

### 4.1 Native Android Layer (Kotlin)

| Component | Class | Execution Context | Responsibility |
|---|---|---|---|
| **Main Activity** | `MainActivity.kt` | Foreground UI | Extends Capacitor `BridgeActivity`. Registers `SmsPlugin`. Handles deep links (`com.moneytrack.app://review`, `report`, `security`) and window system bar backgrounds. |
| **Plugin Bridge** | `SmsPlugin.kt` | Capacitor Worker | Two-way IPC between React TypeScript and native Kotlin. Exposes 14 `@PluginMethod` handlers: permissions, historical scanning, queue manipulation, manual sync, and settings. |
| **SMS Receiver** | `SmsReceiver.kt` | Background Broadcast | Manifest-registered broadcast receiver with `android.permission.BROADCAST_SMS`. Wakes up on incoming SMS, runs parsing & eligibility, and writes to queue. |
| **Parser Engine** | `SmsParser.kt` | On-Device | High-precision regex engine extracting anchored amounts (INR, Rs, ₹), merchant identifiers, bank reference numbers (UTR, RRN), and available balance. |
| **Reconciliation Engine** | `SmsReconciliation.kt` | On-Device | 5-layer deduplication: Layer A (Fingerprint), Layer B (Reference/UTR), Layer C (Recharge / Provider Cross-Source), Layer D (Merchant Spatio-Temporal Window), Layer E (Balance Anchor Calibration). |
| **Secure Keystore** | `SecureTokenStore.kt` | On-Device | Hardware-backed `AndroidKeyStore` using AES-256-GCM. Stores user JWT auth token with random IV and 128-bit authentication tag. Plaintext fallback forbidden in release builds. |
| **Notification Engine** | `SmsNotificationHelper.kt` | System UI | Manages 3 separate notification channels: Review, Security Alerts, and Weekly Summaries. Assigns deterministic stable notification IDs to prevent collisions. |
| **Persistent Queue** | `TransactionStore.kt` | Internal Storage | Thread-safe mutex-locked atomic JSON file writer storing `TransactionRecord` entities in private app files (`filesDir`). |
| **Background Sync** | `SyncWorker.kt` | WorkManager | Deferrable background worker with exponential backoff. Fetches active expense types and uploads confirmed transactions with idempotency keys. |
| **Weekly Worker** | `WeeklyReportWorker.kt` | WorkManager | Periodic background worker triggering weekly spending and savings summaries every Monday at 09:00 AM. |

### 4.2 Web UI Layer (React 19 + TypeScript)

| Page / Component | Route | Key Features |
|---|---|---|
| `HomePage.tsx` | `/` | 3D Interactive Virtual Card, real-time monthly cashflow stats, recent transactions, quick actions. |
| `ExpensesPage.tsx` | `/transactions` | Complete transaction ledger with multi-parameter filtering (period, type, payment method, text search). |
| `ExpenseForm.tsx` | Dialog | Add/Edit expense modal featuring the new tactile `TypeSelectSheet`, live INR calculation, receipt extraction, and quick preferences. |
| `IncomePage.tsx` | `/income` | Inflow management featuring `TypeSelectSheet` category selector, bank account mapping, and payment method options. |
| `BankAccountsPage.tsx` | `/bank-accounts` | Financial accounts management, opening balance calibration, live balance calculation, and 1-click SMS reconciliation. |
| `SmsReviewPage.tsx` | `/sms-review` | Native Android transaction inbox, batch confirmation ("Confirm all"), individual editing, and historical SMS scanner. |
| `SecurityCentrePage.tsx` | `/security` | Audit logs, session management, biometric/security status, and suspicious pattern alerts. |
| `WeeklyReportPage.tsx` | `/weekly-report` | Historical week-over-week spending analysis, category trends, and savings rate. |
| `TypeSelectSheet.tsx` | Reusable | Option 1 Tactile Slide-down Sheet / Drawer with 16px mobile inputs, Lucide icons, category grouping, and instant search. |

---

## 5. Build & Dependency Configuration Audit

* **Gradle:** 8.14.3
* **Android Gradle Plugin (AGP):** 8.13.0
* **Kotlin Gradle Plugin:** 1.9.22
* **Java Virtual Machine:** Java 17
* **Android SDK Configurations:**
  * `minSdkVersion`: 24 (Android 7.0 Nougat) — covers 99.2% of active Android devices globally.
  * `compileSdkVersion`: 36 (Android 16 Vanilla Ice Cream) — latest Android API level.
  * `targetSdkVersion`: 36 (Android 16 Vanilla Ice Cream) — exceeds Google Play requirement (minimum API 35).
* **AndroidX Libraries:**
  * `androidx.core:core-ktx`: 1.17.0
  * `androidx.appcompat:appcompat`: 1.7.1
  * `androidx.work:work-runtime-ktx`: 2.10.0
  * `androidx.core:core-splashscreen`: 1.2.0

---

## 6. Verification Status

* **Automated Kotlin Unit Tests:** 110 passed (0 failures).
* **Automated Frontend Unit Tests:** 53 passed (0 failures).
* **Automated Backend Pytest Suite:** 197 passed (0 failures).
* **Total Automated Test Baseline:** **360 tests passing cleanly**.
* **Physical Device Compatibility:** Verified live on OPPO CPH2729 (Android 16 / API 36).
