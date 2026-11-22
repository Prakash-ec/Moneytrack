# MONEYTRACK — GOOGLE PLAY STORE READINESS ASSESSMENT

**Project:** MoneyTrack  
**Date:** November 8, 2026  
**Package:** `com.moneytrack.app`  
**Current Target SDK:** 36 (Android 16 Vanilla Ice Cream)  

---

## 1. Google Play Policy Evaluation Overview

Publishing MoneyTrack to the Google Play Store involves compliance with Google Play's Developer Program Policies, with particular scrutiny on **Restricted Permissions (SMS & Call Log)**, **Target API Levels**, **User Data Safety**, and **Financial Services Disclosures**.

---

## 2. SMS & Call Log Permissions Policy (`READ_SMS` / `RECEIVE_SMS`)

### 2.1 Policy Stance
Google Play strictly prohibits apps from requesting `READ_SMS` or `RECEIVE_SMS` unless the permission is integral to the app's core functionality and no alternative implementation is technically feasible.

### 2.2 Qualifying Core Use Case: Personal Financial Management (PFM)
MoneyTrack qualifies under the recognized exception: **Personal Financial Management (PFM)** in supported financial ecosystems (India / UPI / Banking SMS).

### 2.3 Mandatory Submission Requirements:
1. **Permissions Declaration Form:**
   * Must submit the Google Play Console declaration form selecting "Financial transaction tracking (SMS-based financial management)".
2. **Video Demonstration:**
   * A YouTube link (unlisted) demonstrating:
     1. The user onboarding flow and prominent disclosure.
     2. The runtime permission prompt (`RECEIVE_SMS` and `READ_SMS`).
     3. An incoming bank transaction SMS being processed on-device.
     4. The resulting notification and review screen in MoneyTrack.
3. **Prominent In-App Disclosure:**
   * Already implemented in [SmsReviewPage.tsx](file:///d:/MoneyTrack/frontend/src/pages/SmsReviewPage.tsx#L808-L813):
     * Explains that SMS processing is 100% on-device.
     * Declares that OTPs and personal chats are ignored and never saved.
     * Affirms that transactions are only committed after user review.
4. **Graceful Fallback:**
   * If the user denies or revokes SMS permissions, MoneyTrack continues to function seamlessly with manual expense entry, receipt scanning, and CSV import.

---

## 3. Target API Level Requirements

* **Google Play Standard:** Apps must target Android 15 (API level 35) or higher by August 31, 2025.
* **MoneyTrack Status:** Targets **API level 36** (`targetSdkVersion = 36`).
* **Assessment:** **Exceeds Google Play requirement**.

---

## 4. User Data Safety & Privacy Declarations

| Data Type | Collected | Shared | Ephemeral / On-Device | Purpose |
|---|---|---|---|---|
| **SMS Messages** | Local Only | Never Shared | Processed in-memory; discarded if non-financial | Financial Transaction Tracking |
| **Financial Info** | Yes (Encrypted) | Never Shared | Stored on private backend & internal storage | Expense Tracking & Budgets |
| **User Identifiers** | Yes (Email/JWT) | Never Shared | Stored in Android Keystore | Authentication & Multi-Device Sync |

---

## 5. Account Deletion Policy Compliance

* **Requirement:** Apps that allow users to create an account must allow users to initiate account and data deletion from within the app and via a web URL.
* **MoneyTrack Implementation:**
  * In-app deletion button available in `SettingsPage.tsx` triggering `DELETE /api/users/me`.
  * Cascading deletion purges user profile, expenses, incomes, bank accounts, and evidence logs.

---

## 6. Readiness Scorecard

| Requirement | Status | Action Required |
|---|---|---|
| **Target SDK 35+** | **READY** | Currently targeting API 36 |
| **64-bit Architecture** | **READY** | Native Capacitor ARM64 / x86_64 supported |
| **Prominent In-App Disclosure** | **READY** | Embedded in SMS review and import screens |
| **App Bundle (AAB)** | **READY** | Build script configured to output `.aab` |
| **Permissions Declaration Form** | **PENDING CONSOLE SUBMISSION** | Complete declaration upon store upload |
| **Demonstration Video** | **PENDING** | Record unlisted walkthrough video |
| **Privacy Policy URL** | **PENDING HOSTING** | Host public markdown/HTML privacy policy |
