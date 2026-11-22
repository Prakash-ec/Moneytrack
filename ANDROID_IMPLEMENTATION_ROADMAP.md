# MONEYTRACK — ANDROID IMPLEMENTATION ROADMAP

**Project:** MoneyTrack  
**Date:** November 8, 2026  
**Target Device:** OPPO CPH2729 (Android 16 / API 36, Serial `e9818d7b`)  
**Status:** Discovery Complete & Approved Baseline Verified  

---

## 1. Prioritization Framework

Tasks are strictly prioritized according to financial integrity, Android operating system compliance, security, and user experience:

* **P0 — Critical:** Direct impact on financial correctness, transaction duplication, token leak, crash, or intent breakage.
* **P1 — High:** Core Android usability, back-button modal navigation, offline queue resilience, WorkManager network constraints.
* **P2 — Medium:** Visual polish, edge-to-edge system bar contrast, ProGuard/R8 release rules, large list performance.
* **P3 — Optional:** Quality-of-life enhancements and animations.

---

## 2. Phased Implementation Plan

```
+---------------------------------------------------------------------------------------+
|  PHASE 1: CRITICAL FOUNDATIONS & DEEP LINKS (P0)                                      |
|  - Complete AndroidManifest intent filters (security, report, notifications)         |
|  - Token purge synchronization on user sign-out                                       |
|  - Verify 8-attribute fingerprinting against queue corruption                         |
+---------------------------------------------------------------------------------------+
                                           |
                                           v
+---------------------------------------------------------------------------------------+
|  PHASE 2: ANDROID NAVIGATION & BACK-GESTURE HANDLING (P1)                             |
|  - Implement useAndroidBackButton hook in React                                       |
|  - Modal and TypeSelectSheet dismissal on Android hardware/gesture back               |
|  - Prevent unexpected app exits during financial entry                               |
+---------------------------------------------------------------------------------------+
                                           |
                                           v
+---------------------------------------------------------------------------------------+
|  PHASE 3: OFFLINE QUEUE EXPANSION FOR INCOMES (P1)                                    |
|  - Extend offlineQueue.ts with IncomeCreateInput support                              |
|  - Idempotency key generation for offline income transactions                         |
|  - Bi-directional flush on network reconnect                                          |
+---------------------------------------------------------------------------------------+
                                           |
                                           v
+---------------------------------------------------------------------------------------+
|  PHASE 4: WORKMANAGER & SYSTEM UI HARDENING (P1 / P2)                                 |
|  - Add NetworkType.CONNECTED constraint to SyncWorker                                |
|  - Remove hardcoded category IDs in SmsPlugin.kt in favor of dynamic matching         |
|  - Refine edge-to-edge styling for Android 15 & 16 system bars                        |
+---------------------------------------------------------------------------------------+
                                           |
                                           v
+---------------------------------------------------------------------------------------+
|  PHASE 5: RELEASE ENGINEERING, PROGUARD/R8 & VERIFICATION (P2)                        |
|  - Configure R8 ProGuard rules for Capacitor, WorkManager, and Gson/Kotlin           |
|  - Separate release build signing configuration                                       |
|  - Execute 360-test triple-suite & verify live on connected OPPO CPH2729             |
+---------------------------------------------------------------------------------------+
```

---

## 3. Detailed Work Breakdown & Affected Files

### Phase 1: Critical Foundations & Deep Links (P0)
* **Tasks:**
  1. Add missing deep link hosts (`security`, `report`, `notifications`) to `AndroidManifest.xml` intent filters.
  2. In `frontend/src/layouts/AppLayout.tsx` and `SettingsPage.tsx`, ensure `logout()` calls `SmsPlugin.clearAuthToken()` to securely purge Keystore-encrypted tokens.
* **Affected Files:**
  * `android/app/src/main/AndroidManifest.xml`
  * `frontend/src/layouts/AppLayout.tsx`
  * `frontend/src/pages/SettingsPage.tsx`
* **Verification:**
  * Test deep link triggers via `adb shell am start -a android.intent.action.VIEW -d "com.moneytrack.app://security?id=123"` and verify correct page rendering.

---

### Phase 2: Android Navigation & Back-Gesture Handling (P1)
* **Tasks:**
  1. Register Capacitor back button listener to intercept Android hardware back press and gesture navigation.
  2. Create a global modal dismissal stack. If `TypeSelectSheet`, `ExpenseForm`, or any `Modal` is open, back gesture dismisses the modal without closing the page or exiting the app.
  3. If no modal is open, navigate back in React Router history.
* **Affected Files:**
  * `frontend/src/hooks/useAndroidBackButton.ts` (New)
  * `frontend/src/components/ui/Modal.tsx`
  * `frontend/src/components/TypeSelectSheet.tsx`
  * `frontend/src/App.tsx`
* **Verification:**
  * Open `TypeSelectSheet` on physical OPPO device `e9818d7b`; trigger Android back gesture; verify sheet closes cleanly while form data is preserved.

---

### Phase 3: Offline Queue Expansion for Incomes (P1)
* **Tasks:**
  1. Extend `offlineQueue.ts` to manage both `QueuedExpense` and `QueuedIncome` structures.
  2. Add `enqueueOfflineIncome` and integrate into `IncomePage.tsx` catch block when offline.
  3. Include offline income flush in `flushOfflineQueue`.
* **Affected Files:**
  * `frontend/src/services/offlineQueue.ts`
  * `frontend/src/pages/IncomePage.tsx`
  * `frontend/src/services/offlineQueue.test.ts`
* **Verification:**
  * Enable Airplane mode on phone or simulate network disconnect; save an income transaction; verify queued in localStorage; reconnect; verify single upload with idempotency.

---

### Phase 4: WorkManager & Background Hardening (P1 / P2)
* **Tasks:**
  1. Attach `NetworkType.CONNECTED` constraint to `SyncWorker` in `SmsReceiver.kt` and `SmsPlugin.kt`.
  2. Remove hardcoded category ID fallback in `SmsPlugin.kt` lines 566–573 and route through `SyncWorker.fetchActiveExpenseTypes`.
* **Affected Files:**
  * `android/app/src/main/java/com/moneytrack/app/sms/SmsReceiver.kt`
  * `android/app/src/main/java/com/moneytrack/app/plugins/SmsPlugin.kt`
  * `android/app/src/main/java/com/moneytrack/app/sms/SyncWorker.kt`
* **Verification:**
  * Run `cd android; .\gradlew.bat testDebugUnitTest` and verify 110 unit tests pass.

---

### Phase 5: Release Engineering, R8 & Device Verification (P2)
* **Tasks:**
  1. Configure `proguard-rules.pro` with Capacitor bridge, Kotlin reflection, and WorkManager rules.
  2. Document release signing configuration.
  3. Compile release APK, compute SHA256, and perform streamed installation to device `e9818d7b`.
  4. Generate `ANDROID_RELEASE_CHECKLIST.md` and `GOOGLE_PLAY_READINESS.md`.
* **Affected Files:**
  * `android/app/proguard-rules.pro`
  * `android/app/build.gradle`
* **Verification:**
  * Install APK on connected OPPO CPH2729 (`e9818d7b`); verify startup cold-time, notification handling, and memory footprint.
