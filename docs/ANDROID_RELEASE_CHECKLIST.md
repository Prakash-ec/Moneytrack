# MoneyTrack — Android Release Checklist

**Release Target:** v2.1.0  
**Package:** `com.moneytrack.app`  
**Version Code:** `1` | **Version Name:** `1.0`

---

## Pre-Release Verification Checklist

- [x] Native package name: `com.moneytrack.app`
- [x] `targetSdkVersion` set to 36 (Android 16)
- [x] `minSdkVersion` set to 24 (Android 7.0)
- [x] App icons generated for all mipmap densities (mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi, anydpi-v26)
- [x] Splash screen assets configured for portrait and landscape
- [x] Cleartext traffic disabled for production domains
- [x] `allowBackup` set to false for financial privacy
- [x] R8/ProGuard rules configured for Capacitor plugins and models
- [x] Android release APK assembled successfully (`app-release.apk`, 5.5MB)
- [ ] Production keystore signing (pending user authorization)
- [ ] Google Play Console track upload (pending user authorization)
