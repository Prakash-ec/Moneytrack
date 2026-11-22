# MONEYTRACK — ANDROID REQUIREMENTS GAP ANALYSIS

**Project:** MoneyTrack  
**Date:** November 8, 2026  
**Package:** `com.moneytrack.app`  
**Classification Standards:**
* **CRITICAL:** Immediate risk of financial data loss, data duplication, severe security vulnerability, or hard application crash.
* **HIGH:** Significant Android usability breakage, broken navigation, missing offline capability, or notification failure.
* **MEDIUM:** Suboptimal visual polish, edge-to-edge system bar layout, performance lag on large datasets, or accessibility improvements.
* **LOW:** Minor cosmetic discrepancies, redundant styles, or unused helper functions.
* **OPTIONAL:** Enhancements that offer quality-of-life benefits without impacting core production reliability.

---

## 1. Domain-by-Domain Gap Findings

### Domain 1: Android Design, Material 3 & System UI
* **Finding 1.1 [MEDIUM] — Android 15/16 Edge-to-Edge System Bars:**
  * *Current State:* `MainActivity.kt` sets `window.decorView.setBackgroundColor("#0B0F19")` and `styles.xml` defines status bar color. On Android 15+ (API 35/36), system bars are edge-to-edge by default. The web application uses `viewport-fit=cover` and CSS safe-area insets (`env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`), which prevents content clipping, but the native splash screen icon in `AppTheme.NoActionBarLaunch` can be modernized for seamless Android 12+ splash transitions.
  * *Recommendation:* Modernize `styles.xml` with `windowSplashScreenIconBackgroundColor` and verify light/dark navigation bar icons.

### Domain 2: Android Navigation & Back-Button Handling
* **Finding 2.1 [HIGH] — Lack of Hardware/Gesture Back-Button Listener for Modals:**
  * *Current State:* There is no `@capacitor/app` `backButton` event listener registered in React. When a modal (such as `ExpenseForm`, `TypeSelectSheet`, or `ConfirmationDialog`) is open and the user presses the Android system back button or uses the predictive back gesture, the app closes the page or exits rather than dismissing the active modal/sheet.
  * *Recommendation:* Implement a centralized `useAndroidBackButton` hook in React that intercepts back gestures: if a modal/sheet is open, it closes the sheet; otherwise, it navigates back in browser history; if on the home screen, it prompts or allows normal system exit.

### Domain 3: Dropdown & Logo Distortion Issue
* **Finding 3.1 [RESOLVED / VERIFIED] — SVG Sizing Constraints and Viewport Zoom:**
  * *Current State:* The root cause was diagnosed as twofold: (1) mobile form controls had font sizes below 16px causing Android WebView auto-zoom on focus, and (2) SVG brand logos lacked hard pixel max-dimensions and flex shrink-0 constraints.
  * *Resolution Applied:* Mobile form controls now enforce a 16px minimum (`text-base sm:text-sm`), `.brand-mark` and `BrandLogo` have strict CSS pixel clamps (`aspect-ratio: 1/1; object-fit: contain; flex-shrink: 0;`), and `TypeSelectSheet` replaces crude native `<select>` dropdowns with an accessible bottom drawer. Tested live on device `e9818d7b`.

### Domain 4: SMS Automation & Financial Integrity
* **Finding 4.1 [CRITICAL - MITIGATED] — Unrestricted Bare Decimal Regex Extraction:**
  * *Current State:* Previously, SMS amount parsing matched any bare floating-point number, extracting phone numbers, plan validity, and OTPs as transaction amounts.
  * *Resolution Applied:* `SmsParser.kt` strictly requires financial currency anchoring (`Rs.`, `Rs`, `INR`, `₹`, `Rupees`, `Debit`, `Credit`). Bare decimals without financial context are strictly ignored.
* **Finding 4.2 [HIGH] — Hardcoded Category Fallbacks in `SmsPlugin.kt`:**
  * *Current State:* Lines 566–573 of `SmsPlugin.kt` contain a hardcoded `categoryToTypeId` mapping (`"mobile recharge" -> 5`, `"bus travel" -> 2`). While `SyncWorker.kt` dynamically matches expense types against backend types via `fetchActiveExpenseTypes`, `SmsPlugin` should entirely rely on the dynamic matching logic to avoid assuming fixed database IDs.
  * *Recommendation:* Remove hardcoded IDs in `SmsPlugin` and unify with dynamic type lookup.

### Domain 5: Notification Management & Deep Links
* **Finding 5.1 [HIGH] — Incomplete Manifest Intent Filters for Deep Links:**
  * *Current State:* `AndroidManifest.xml` defines `<data android:scheme="com.moneytrack.app" android:host="review" />`. However, `SmsNotificationHelper.kt` and `App.tsx` also generate deep links for `com.moneytrack.app://security` and `com.moneytrack.app://report`.
  * *Impact:* Clicking security alert or weekly report notifications may fail to resolve the intent or show an OS error dialog.
  * *Recommendation:* Add `<data android:host="security" />` and `<data android:host="report" />` to `AndroidManifest.xml`.
* **Finding 5.2 [MEDIUM] — Notification Drawer Cancellation Scope:**
  * *Current State:* Verified that `cancelReviewNotificationById` cancels only individual transaction notifications, preserving security alerts and weekly summaries. `cancelAllReviewNotifications` cleanly preserves other channels. Fully operational.

### Domain 6: Background Processing & WorkManager
* **Finding 6.1 [MEDIUM] — WorkManager Network Constraints Specification:**
  * *Current State:* `SyncWorker` is enqueued via `OneTimeWorkRequestBuilder<SyncWorker>()` with an initial delay and exponential backoff, but does not explicitly attach `Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()`.
  * *Impact:* When the device has zero internet connectivity, WorkManager may execute the worker immediately, leading to an avoidable HTTP connection timeout before scheduling a backoff retry.
  * *Recommendation:* Attach `NetworkType.CONNECTED` constraint to `SyncWorker` work requests.

### Domain 7: Offline-First Synchronization & Queue Resilience
* **Finding 7.1 [HIGH] — Missing Offline Queue for Income Inflows:**
  * *Current State:* `frontend/src/services/offlineQueue.ts` implements `enqueueOfflineExpense` and `flushOfflineQueue` for expenses (`ExpenseCreateInput`). However, there is no offline queuing for Income (`IncomeCreateInput`). If a user records income offline, the request fails with a network error.
  * *Recommendation:* Extend `offlineQueue.ts` to support both `expense` and `income` records with client-side UUIDs and idempotency keys, flushing both upon network restoration.
* **Finding 7.2 [CRITICAL - VERIFIED] — Device SMS Queue Protection:**
  * *Current State:* 11 records exist on the connected phone (5 PENDING_REVIEW, 4 SYNCED, 1 READY_TO_SYNC, 1 IGNORED). Verified that queue entries are never overwritten or deleted on worker failures; failed items retain `status = FAILED` with human-readable error messages for review.

### Domain 8: Security & Privacy
* **Finding 8.1 [VERIFIED / EXCELLENT] — Hardware Keystore Token Storage:**
  * *Current State:* `SecureTokenStore.kt` uses `AndroidKeyStore` with AES-256-GCM. Unencrypted tokens are rejected in release builds (`BuildConfig.DEBUG == false`). No plain-text JWT tokens are logged in logcat.
* **Finding 8.2 [VERIFIED] — Network Security & Data at Rest:**
  * *Current State:* `network_security_config.xml` permits cleartext traffic exclusively for loopback addresses (`10.0.2.2`, `localhost`). All external communications strictly mandate HTTPS. `allowBackup="false"` is enforced in `AndroidManifest.xml` to prevent ADB backup extraction of financial records.

### Domain 9: Permissions & Android 10–16 Compatibility
* **Finding 9.1 [HIGH] — Android 13+ Notification Permission Flow:**
  * *Current State:* `SmsPlugin.kt` includes `POST_NOTIFICATIONS` in `requestPermissions` for Android 13+ (API 33+). Verified that permission is granted on the physical OPPO CPH2729 (Android 16).
  * *Recommendation:* Verify that if a user denies notification permissions, the app gracefully continues operating without crashing or looping permission prompts.

### Domain 10: Performance, Rendering & Large Lists
* **Finding 10.1 [MEDIUM] — Large Transaction List Virtualization:**
  * *Current State:* `TransactionList.tsx` renders all transactions for the selected period in a standard flex container. When a user has 1,000+ transactions in a year view, DOM nodes increase.
  * *Recommendation:* Optimize list rendering or ensure pagination limits DOM nodes to 50 items per page with fast page switching.

### Domain 11: Accessibility
* **Finding 11.1 [VERIFIED] — Contrast & Touch Targets:**
  * *Current State:* Touch targets on buttons and the new `TypeSelectSheet` are at least 44×44px. Color contrast across dark and light themes conforms to WCAG AA guidelines.
* **Finding 11.2 [MEDIUM] — Screen Reader Labels on Transaction Rows:**
  * *Current State:* Ensure all transaction rows announce direction, formatted currency amount, merchant, and category clearly to TalkBack users.

### Domain 12: Build & Release Engineering
* **Finding 12.1 [HIGH] — Release Build Type Uses Debug Signing:**
  * *Current State:* In `android/app/build.gradle`, the `release` build block currently has:
    `signingConfig signingConfigs.debug` and `minifyEnabled false`.
  * *Impact:* While suitable for manual sideload testing, production release engineering requires separating debug keys from release signing, enabling ProGuard/R8 shrinking, and keeping reflection rules intact.
  * *Recommendation:* Configure proper release signing hooks (via environment variables or properties file without committing keystores to Git) and test R8 minification.

### Domain 13: Google Play Readiness
* **Finding 13.1 [HIGH] — SMS & Call Log Permissions Declaration:**
  * *Current State:* Google Play has strict policy guidelines regarding `READ_SMS` and `RECEIVE_SMS` (restricted permissions). Only apps whose core functionality directly relies on financial SMS (e.g., personal financial management apps in supported regions) are permitted after filling out the Permissions Declaration Form.
  * *Recommendation:* Document the exact technical justification, video demonstration requirements, and fallback options (manual entry + historical CSV import) in `GOOGLE_PLAY_READINESS.md`.

---

## 2. Requirements Gap Matrix Summary

| Gap ID | Area | Severity | Current Status | Resolution Action |
|---|---|---|---|---|
| **GAP-01** | Navigation | **HIGH** | Android system back exits app instead of closing modal | Implement `useAndroidBackButton` handler |
| **GAP-02** | Deep Links | **HIGH** | Missing `security` & `report` hosts in Manifest | Update `AndroidManifest.xml` intent-filters |
| **GAP-03** | Offline Sync | **HIGH** | Offline queue handles expenses only, not income | Extend `offlineQueue.ts` to support income |
| **GAP-04** | Release Eng | **HIGH** | Release build uses debug signing & no R8 | Configure release signing & R8 rules |
| **GAP-05** | Play Store | **HIGH** | SMS restricted permissions declaration | Draft policy documentation & fallback |
| **GAP-06** | WorkManager | **MEDIUM** | Missing network constraint on WorkManager sync | Add `NetworkType.CONNECTED` constraint |
| **GAP-07** | System UI | **MEDIUM** | Android 15/16 edge-to-edge system bar contrast | Audit and tune system bar icons |
| **GAP-08** | Performance | **MEDIUM** | Unvirtualized rendering on massive date ranges | Ensure strict 50-item pagination |
| **GAP-09** | Architecture | **LOW** | Hardcoded category IDs in `SmsPlugin.kt` | Remove hardcoded IDs; unify dynamic matching |
