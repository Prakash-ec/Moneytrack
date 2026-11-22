# MONEYTRACK — ANDROID SECURITY & PRIVACY AUDIT

**Project:** MoneyTrack  
**Date:** November 8, 2026  
**Package:** `com.moneytrack.app`  
**Security Classification:** High-Assurance Financial Application  

---

## 1. Executive Security Assessment

MoneyTrack was audited against the **OWASP Mobile Application Security Verification Standard (MASVS)** and modern Android security guidelines. The application exhibits robust foundational security practices, particularly in its hardware-backed cryptography, local data minimization, and network security configuration.

---

## 2. Component Security & Attack Surface Audit

### 2.1 Manifest Exported Components

| Component | Type | Exported | Protection / Permissions | Assessment |
|---|---|---|---|---|
| `MainActivity` | Activity | `true` | Protected via `LAUNCHER` and strict URI deep-link scheme (`com.moneytrack.app`) | **PASSED:** Proper singleTask launch mode; deep links validate scheme and route internally without executing arbitrary code. |
| `SmsReceiver` | BroadcastReceiver | `true` | **`android:permission="android.permission.BROADCAST_SMS"`** | **PASSED:** Only the Android telephony subsystem possessing the signature-level `BROADCAST_SMS` permission can broadcast to this receiver. Rogue apps cannot spoof SMS broadcasts. |
| `FileProvider` | ContentProvider | `false` | `android:grantUriPermissions="true"` | **PASSED:** FileProvider is unexported; grants temporary read URI access only for shared exports (CSV/receipts). |

---

## 3. Cryptography & Authentication Token Storage

### 3.1 Keystore Hardware Isolation (`SecureTokenStore.kt`)
* **Algorithm:** `AES/GCM/NoPadding` with 256-bit keys and 128-bit authentication tag.
* **Provider:** `AndroidKeyStore`.
* **Key Generation:**
  ```kotlin
  KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setKeySize(256)
      .build()
  ```
* **Release Safeguard:**
  * When running production release builds (`BuildConfig.DEBUG == false`), any failure in Keystore encryption strictly purges the token and fails closed. Plaintext or Base64-only fallback is permitted **exclusively** during headless JVM unit testing.
* **Log Sanitization:** Tokens and sensitive authorization headers are never printed to `Log.d`, `Log.i`, or error traces.

---

## 4. Network Security Configuration

### 4.1 Transport Layer Security (`network_security_config.xml`)
```xml
<network-security-config>
    <!-- By default, require HTTPS for all external network communications -->
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>

    <!-- Allow cleartext HTTP solely for local development loopback -->
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">10.0.2.2</domain>
        <domain includeSubdomains="true">localhost</domain>
        <domain includeSubdomains="true">127.0.0.1</domain>
    </domain-config>
</network-security-config>
```
* **Production Enforcement:** All production traffic to `https://moneytrack-backend-g5is.onrender.com` is strictly HTTPS with TLS 1.3/1.2 and valid CA root trust anchors.
* **Cleartext Prevention:** Cleartext HTTP traffic is completely blocked by Android OS for any non-loopback host.

---

## 5. Local Data at Rest & Privacy Compliance

### 5.1 Storage Isolation (`filesDir`)
* **Files:** `sms_transaction_queue.json`, `sms_settings.json`.
* **Linux Permissions:** Mode `0600` (`-rw------- u0_a503 u0_a503`). Files are accessible solely by the application's assigned Linux UID.
* **Backup Protection:** `android:allowBackup="false"` is declared in `AndroidManifest.xml`. This prevents extraction of sensitive financial logs or transaction queues via `adb backup`.

### 5.2 SMS Privacy & Data Minimization
* **Zero Cloud Telemetry for Raw SMS:** Incoming SMS messages are parsed 100% locally on the device using Kotlin regular expressions. Unconfirmed messages remain in internal storage and are **never** transmitted to any server.
* **OTP & Personal Chat Filtering:**
  * `SmsEligibility.kt` inspects message context.
  * Keywords indicating OTPs (`otp`, `one time password`, `verification code`, `do not share`, `secret code`) are immediately flagged as `CandidateStatus.IGNORED`.
  * OTPs are permanently discarded and never recorded or displayed.
* **Redaction in Evidence Logs:** Bank account suffixes are limited to the last 4 digits (e.g. `X1234`). Full account numbers are never parsed or stored.

---

## 6. WebView & JavaScript Bridge Security

1. **Local Asset Serving:**
   * HTML, JavaScript, and CSS bundles are served locally from `android_asset/public/` via Capacitor's internal WebView scheme.
   * No remote HTML is dynamically injected or loaded from untrusted third parties.
2. **Capacitor IPC Security:**
   * Capacitor avoids exposing arbitrary Java objects via `@JavascriptInterface`. Instead, all communication runs through audited Capacitor plugin contracts with strict input validation.
3. **No Unsafe Evaluations:**
   * Frontend build utilizes Vite production minification without `eval` or dynamic script injections.

---

## 7. Security Action Items & Recommendations

1. **[P0] Deep Link Scheme Strictness:**
   * Ensure `DeepLinkHandler` only accepts `com.moneytrack.app://` schemes and rejects any external `http://` or intent redirects that could spoof deep link destinations.
2. **[P1] Token Revocation on Logout:**
   * In `SettingsPage.tsx` and `AppLayout.tsx`, ensure `logout()` explicitly triggers `SmsPlugin.clearAuthToken()` to purge hardware-encrypted tokens upon sign-out.
3. **[P2] ProGuard / R8 Obfuscation:**
   * Enable R8 bytecode shrinking for release builds to obfuscate class names and prevent reverse-engineering of parsing heuristics.
