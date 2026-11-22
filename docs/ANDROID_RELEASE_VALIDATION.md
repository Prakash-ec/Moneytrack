# MoneyTrack — Android Release Build & Signing Validation Report

**Document Date:** 8 November 2026  
**Auditor / Mobile Engineer:** Senior Android Engineer & QA Lead  
**Package:** `com.moneytrack.app`  
**Build Tool:** Android SDK Build-Tools 35.0.0 / Gradle 8.14.3 / Temurin OpenJDK 17  

---

## 1. Executive Summary

A full production release compilation was executed on the `release` build variant of `com.moneytrack.app`.
The release APK was successfully assembled, validated for structural integrity, and verified with `apksigner`.

> [!WARNING]
> **Production Signing Status: NOT SIGNED WITH PRODUCTION KEY**  
> The release variant currently falls back to the Android Debug certificate (`CN=Android Debug`) because no production keystore file (`.jks` / `.keystore`) has been provided or generated. Per strict safety instructions, no temporary or unapproved production signing key was invented or committed. A step-by-step setup guide is provided below.

---

## 2. Release Artifact Metadata

| Metric | Value |
|---|---|
| **Artifact Path** | `android/app/build/outputs/apk/release/app-release.apk` |
| **Build Variant** | `release` |
| **Application ID** | `com.moneytrack.app` |
| **Version Code** | `1` |
| **Version Name** | `1.0` |
| **Compile SDK** | `36` (Android 16) |
| **Target SDK** | `36` (Android 16) |
| **Min SDK** | `24` (Android 7.0 Nougat) |
| **File Size** | 5,507,490 bytes |
| **SHA-256 Checksum** | `0571F1A3F5903371B66E087DB1E27E99FEF2CAFEE20AB371177C4CDD21B3A8E1` |

---

## 3. Cryptographic Signature Verification (`apksigner`)

Verification executed via `apksigner.bat verify --verbose --print-certs`:

```text
Verifies
Verified using v1 scheme (JAR signing): false
Verified using v2 scheme (APK Signature Scheme v2): true
Verified using v3 scheme (APK Signature Scheme v3): false
Verified using v3.1 scheme (APK Signature Scheme v3.1): false
Verified using v4 scheme (APK Signature Scheme v4): false
Verified for SourceStamp: false
Number of signers: 1
Signer #1 certificate DN: C=US, O=Android, CN=Android Debug
Signer #1 certificate SHA-256 digest: 6aac83f00e7a069ecb9763b6c5161a64efee60e62420118f5c034f82199482ac
Signer #1 certificate SHA-1 digest: 81353f17a79963aa2afa80865acfad0ddfd988f6
Signer #1 certificate MD5 digest: 1b5ace770e11f88d00a6d16233f38b23
Signer #1 key algorithm: RSA
Signer #1 key size (bits): 2048
Signer #1 public key SHA-256 digest: f16e8602419f33afdee9795f7dbe66b2f40c6a11729aed4bb4d44ecf0551d700
```

### Signature Analysis:
- **Integrity**: PASS (APK v2 Signature Scheme verified).
- **Identity**: Fallback to `CN=Android Debug`.
- **Production Status**: **BLOCKED** from Google Play submission until signed with the developer's official production release keystore.

---

## 4. Release Manifest & Permission Audit

Extracted via `aapt dump badging`:

### Declared Permissions:
1. `android.permission.INTERNET` (API connectivity)
2. `android.permission.RECEIVE_SMS` (Real-time financial broadcast listener)
3. `android.permission.READ_SMS` (Historical transaction discovery)
4. `android.permission.POST_NOTIFICATIONS` (Transaction review alerts on Android 13+)
5. `android.permission.WAKE_LOCK` (WorkManager background sync processing)
6. `android.permission.ACCESS_NETWORK_STATE` (Network constraint checking)
7. `android.permission.RECEIVE_BOOT_COMPLETED` (WorkManager rescheduling on device boot)
8. `android.permission.FOREGROUND_SERVICE` (SyncWorker reliability)

### Security Settings:
- **Cleartext Traffic**: Not explicitly enabled in release manifest; HTTPS required for all API endpoints.
- **Debuggable**: `android:debuggable="false"` in release build.
- **Exported Receivers**: `SmsReceiver` protected by `android.permission.BROADCAST_SMS`.

---

## 5. Production Keystore Setup Guide for Developer

To generate and configure the official Google Play production release signing key:

### Step 1: Generate Private Release Keystore
Run in a secure offline terminal (do NOT commit the keystore file):
```bash
keytool -genkey -v -keystore moneytrack-release-key.jks \
  -alias moneytrack-key \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=MoneyTrack Production, O=MoneyTrack, C=IN"
```

### Step 2: Configure Environment Variables
Set the following environment variables on your secure CI/CD or build machine:
```powershell
$env:RELEASE_STORE_FILE = "C:\secure_path\moneytrack-release-key.jks"
$env:RELEASE_STORE_PASSWORD = "<SECURE_STORE_PASSWORD>"
$env:RELEASE_KEY_ALIAS = "moneytrack-key"
$env:RELEASE_KEY_PASSWORD = "<SECURE_KEY_PASSWORD>"
```

### Step 3: Rebuild Release Artifact
```powershell
cd android
.\gradlew.bat assembleRelease
```
The resulting `app-release.apk` will automatically be signed with the production keystore.
