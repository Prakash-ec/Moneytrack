# MoneyTrack — Android Security Audit

**Document Date:** 8 November 2026  
**Package:** `com.moneytrack.app`  
**Security Level:** High (Financial Privacy Standards)

---

## 1. Security Analysis of Manifest & Components

- **`AndroidManifest.xml` Inspection**:
  - `MainActivity`: Exported (`android:exported="true"`) with intent filter `MAIN` / `LAUNCHER`. Deep link scheme `com.moneytrack.app` configured safely without arbitrary code execution vectors.
  - `SmsReceiver`: Exported (`android:exported="true"`) but protected with permission `android.permission.BROADCAST_SMS` to prevent untrusted applications from broadcasting spoofed SMS intents.
  - `allowBackup`: `false` (prevents ADB backup extraction of financial queue files).
- **Network Security Configuration**:
  - Enforces HTTPS for all remote backend endpoints (`https://moneytrack-backend-g5is.onrender.com`).
  - Cleartext traffic disabled for production domains.
- **Log Sanitization**:
  - Full card numbers, PINs, and plain text OTPs are never logged.
  - References are sanitized before persistence.
- **Internal Storage Sandboxing**:
  - `sms_transaction_queue.json` and `sms_settings.json` are stored strictly within `context.filesDir` (mode `0600`, private to user `u0_a503`).
