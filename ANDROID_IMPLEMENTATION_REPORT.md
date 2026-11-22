# MONEYTRACK — ANDROID NATIVE & HYBRID IMPLEMENTATION REPORT

**Author:** Senior Android Engineer & Mobile Solutions Architect  
**Package:** `com.moneytrack.app`  
**Platform Target:** Android 16 (API 36) / Minimum Android 7.0 (API 24)  
**Status:** IMPLEMENTED & VERIFIED (`PASS`)  

---

## 1. Architecture Overview

MoneyTrack operates as a hybrid Android application combining:
- **Presentation Layer:** React 19 + TypeScript + Tailwind CSS bundled via Vite and loaded locally via Capacitor Bridge (`public/index.html`).
- **Native Bridge Layer:** Capacitor 8 with custom `@CapacitorPlugin` (`SmsPlugin.kt`) and native `@capacitor/app` lifecycle bridge.
- **Background Execution:** Android `WorkManager` with `SyncWorker` and `WeeklyReportWorker`.
- **System Telephony:** Manifest-registered `SmsReceiver` protected with `android.permission.BROADCAST_SMS`.
- **Hardware Security:** Android Keystore AES-256 encrypted SharedPreferences (`SecureTokenStore.kt`).

---

## 2. Key Android Engineering Deliverables

### 2.1 Deep Link Intent Routing
Updated `android/app/src/main/AndroidManifest.xml` with comprehensive intent filters:
```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="com.moneytrack.app" android:host="review" />
    <data android:scheme="com.moneytrack.app" android:host="security" />
    <data android:scheme="com.moneytrack.app" android:host="report" />
    <data android:scheme="com.moneytrack.app" android:host="notifications" />
</intent-filter>
```
Integrated with React routing in `frontend/src/App.tsx` (`DeepLinkHandler`).

### 2.2 Android Hardware Back Button & Gesture Navigation
Implemented `frontend/src/hooks/useAndroidBackButton.ts` using `@capacitor/app`:
1. Priority dismissal of open slide-down bottom sheets (`TypeSelectSheet`), dialogs, and modals.
2. In-app backward navigation (`navigate(-1)`) when history depth is available.
3. Clean app minimization/exit when back is pressed from the overview root (`/`).

### 2.3 WorkManager Network Constraints
All background synchronization jobs in `SmsReceiver.kt` and `SmsPlugin.kt` now enforce network constraints:
```kotlin
val constraints = androidx.work.Constraints.Builder()
    .setRequiredNetworkType(androidx.work.NetworkType.CONNECTED)
    .build()

val request = OneTimeWorkRequestBuilder<SyncWorker>()
    .setConstraints(constraints)
    .setInitialDelay(1, TimeUnit.SECONDS)
    .build()
```
This guarantees background sync never wastes battery or throws unhandled network errors while the device is in airplane mode or disconnected.

### 2.4 Removal of Unused Hardcoded Category Stubs
Removed dead hardcoded category mapping (`categoryToTypeId`) from `SmsPlugin.kt`. All type and category resolution flows dynamically through user taxonomies and API mappings.

### 2.5 ProGuard / R8 Production Keep Rules
Populated `android/app/proguard-rules.pro` with explicit rules preserving Capacitor bridge methods, WorkManager workers, security keystore interfaces, and financial data transfer objects.
