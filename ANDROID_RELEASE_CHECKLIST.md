# MONEYTRACK — ANDROID RELEASE & DISTRIBUTION CHECKLIST

**Project:** MoneyTrack  
**Date:** November 8, 2026  
**Package:** `com.moneytrack.app`  

---

## 1. Pre-Release Verification Gates

- [x] **Git Cleanliness:** Working directory state documented; no secrets committed to version control.
- [x] **Test Baseline Verified:**
  - [x] Kotlin Unit Tests: 110 passed (0 failed).
  - [x] Frontend Unit Tests: 53 passed (0 failed).
  - [x] Backend Pytest Suite: 197 passed (0 failed).
  - [x] Total: 360 automated tests passing.
- [x] **Hardware Keystore Protection:** Token storage AES-256-GCM enforced; plaintext fallback rejected in release builds.
- [x] **Cleartext Traffic Blocked:** `network_security_config.xml` blocks non-HTTPS traffic for production domains.
- [x] **Backup Security:** `allowBackup="false"` prevents extraction via ADB backup.
- [x] **Queue Preservation:** Internal queue backup created and verified (`backups/device_queue_backups/`).
- [x] **Physical Device Installation:** Tested on OPPO CPH2729 (Android 16 / API 36).

---

## 2. Release Build Steps

1. **Build Web Assets:**
   ```powershell
   npm --prefix frontend run build
   ```
2. **Synchronize to Capacitor:**
   ```powershell
   cd frontend
   npx cap copy android
   cd ..
   ```
3. **Assemble Release APK / AAB:**
   ```powershell
   cd android
   .\gradlew.bat assembleRelease
   .\gradlew.bat bundleRelease
   ```
4. **Compute SHA-256 Checksum:**
   ```powershell
   Get-FileHash -Path "release\MoneyTrack.apk" -Algorithm SHA256
   ```

---

## 3. Signing Key Governance

> [!WARNING]
> **CRITICAL RELEASE POLICY:**
> Production release keystores and passwords must **never** be checked into the Git repository.
> When building for production release distribution, supply signing parameters via environment variables or a local `keystore.properties` excluded from Git via `.gitignore`.
