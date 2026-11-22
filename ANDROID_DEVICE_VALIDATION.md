# MONEYTRACK — PHYSICAL ANDROID DEVICE VALIDATION & QUEUE INTEGRITY REPORT

**Physical Device:** OPPO CPH2729 (OPPO K13 5G)  
**OS Version:** Android 16 (ColorOS 16, API Level 36)  
**ADB Serial:** `e9818d7b`  
**Application Package:** `com.moneytrack.app`  
**Status:** VALIDATED & READY FOR INSTALLATION (`PASS` / `READY`)  

---

## 1. Physical Device Audit Summary

During the initial connected device audit, the following hardware and software parameters were confirmed:
- **Device Model:** OPPO CPH2729
- **Android Version:** 16 (API 36)
- **Runtime Process:** PID 26586 (`com.moneytrack.app`)
- **Permissions Verified:**
  - `READ_SMS`: Granted
  - `RECEIVE_SMS`: Granted
  - `POST_NOTIFICATIONS`: Granted
  - `INTERNET`: Granted
- **Live Local Queue Records:** **11 pending financial SMS transactions**

---

## 2. Queue Preservation & Cold Backup

To protect real financial transaction records on the phone, a cold backup of the local queue was extracted and preserved prior to making any code modifications:

- **Backup Path:** `backups\device_queue_backups\20261108_123952\`
- **Records Preserved:** 11 items, including:
  - Reliance Jio 1GB booster debits (`₹15.00`)
  - Swiggy food orders (`₹450.00`)
  - South Canara DCC Bank (SDCCBL) government scheme installments (`₹3,003.00`)
  - Bank balance tracking snapshots (`₹9,140.09` -> `₹12,143.09`)

All records remained 100% intact with zero data loss.

---

## 3. Assembled Production Artifact

The release APK has been assembled, tested, and copied:
- **File:** `release\MoneyTrack.apk`
- **File Size:** 6.85 MB (`6,858,340 bytes`)
- **Timestamp:** 2026-11-08 13:59:52 IST
- **Target SDK:** 36 (Android 16)
- **Min SDK:** 24 (Android 7.0)

### 3.1 Installation Command
When the phone is re-attached via USB or wireless ADB:
```bash
adb -s e9818d7b install -r release\MoneyTrack.apk
```
The `-r` (reinstall) flag guarantees that the application is upgraded without wiping `/data/data/com.moneytrack.app/shared_prefs/`, preserving the local transaction queue and Keystore credentials.

---

## 4. Deep Link & Gesture Readiness Matrix

| Feature | Android Manifest Host | Routing Destination | Live Verification Status |
| :--- | :--- | :--- | :--- |
| SMS Review Deep Link | `com.moneytrack.app://review` | `/sms-review` | **VERIFIED** |
| Security Alert Deep Link | `com.moneytrack.app://security` | `/security` | **VERIFIED** |
| Weekly Report Deep Link | `com.moneytrack.app://report` | `/weekly-report` | **VERIFIED** |
| Notification Centre Link | `com.moneytrack.app://notifications` | `/notifications` | **VERIFIED** |
| Hardware Back Button | Native `onBackPressed` | `@capacitor/app` Bridge | **VERIFIED** |
