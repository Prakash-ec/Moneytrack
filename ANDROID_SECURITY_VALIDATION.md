# MONEYTRACK — ANDROID SECURITY & AUTH TOKEN VALIDATION

**Author:** Security Engineer & Mobile Systems Specialist  
**Status:** COMPLIANT (`PASS`)  
**Scope:** Hardware Keystore token persistence, logout token purge, manifest permissions, broadcast security  

---

## 1. Executive Summary

This validation assesses the authentication lifecycle, credential handling, and IPC security of the MoneyTrack Android application.

Key achievements:
1. Hardware Keystore token persistence via Android `EncryptedSharedPreferences` (`MasterKey` with AES-256-GCM).
2. Explicit token purge across both JavaScript localStorage and Android hardware storage upon user logout or session revocation.
3. Protected broadcast receivers ensuring only the Android telephony system can deliver incoming SMS events.

---

## 2. Token Storage & Lifecycle Architecture

### 2.1 Hardware Keystore Storage (`SecureTokenStore.kt`)
On Android native devices, JWT access tokens are stored using Android Jetpack Security:
- Key Generation: Hardware backed Android Keystore using `MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()`.
- File Encryption: `EncryptedSharedPreferences` encrypts both keys and values using AES-256-SIV and AES-256-GCM.
- Access: Only accessible by the MoneyTrack process (`com.moneytrack.app`). Other apps or ADB shell cannot read the plaintext token without root.

### 2.2 Purge Verification on Logout
When a user clicks "Sign out" in `SettingsPage.tsx` or `AuthProvider.tsx`:
1. `setStoredToken(null)` is called.
2. Web storage `localStorage.removeItem('moneytrack_auth_token')` is executed.
3. Bridge calls `SmsPlugin.clearAuthToken()`.
4. `SecureTokenStore.clearToken()` removes the token from the hardware keystore.
5. `moneytrack:auth-changed` and `moneytrack:unauthorized` events ensure React state drops the active session immediately.

---

## 3. Manifest & Broadcast Security

### 3.1 Receiver Protection
In `android/app/src/main/AndroidManifest.xml`:
```xml
<receiver
    android:name=".sms.SmsReceiver"
    android:enabled="true"
    android:exported="true"
    android:permission="android.permission.BROADCAST_SMS">
    <intent-filter>
        <action android:name="android.provider.Telephony.SMS_RECEIVED" />
    </intent-filter>
</receiver>
```
Because `android.permission.BROADCAST_SMS` is a signature/system permission, rogue third-party apps on the device cannot broadcast fake SMS intents to MoneyTrack.

### 3.2 Network Security Configuration
- `android:networkSecurityConfig="@xml/network_security_config"` enforces TLS 1.3/1.2 HTTPS communication for all external API endpoints (`moneytrack-backend-g5is.onrender.com`).
- Cleartext traffic is disabled in production builds.
