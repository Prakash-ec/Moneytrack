# MoneyTrack — Google Play Readiness

**Document Date:** 8 November 2026  
**Package:** `com.moneytrack.app`  
**Target API Level:** 36 (Complies with Google Play policy requiring API 34+)

---

## 1. Sensitive Permission Compliance (SMS & Call Log Policy)

MoneyTrack requests `android.permission.RECEIVE_SMS` and `android.permission.READ_SMS`. Under Google Play's Permissions policy:
- **Core Functionality Exemption:** MoneyTrack qualifies under the **"Financial transaction management"** exception. The app's core value proposition is autonomous budgeting and double-entry expense tracking based on bank transactional SMS notifications.
- **Privacy Policy Requirement:**
  - A comprehensive Privacy Policy must be hosted publicly disclosing that SMS messages are inspected locally on device solely for transaction amounts, account numbers, and merchant details, and are never sold or transmitted to third-party ad networks.
- **Data Safety Form Declarations:**
  - Data Collected: Financial info (User payment info / transactions), Messages (SMS text processed on device).
  - Data Shared: No data shared with third parties.
  - Data Handled Ephemerally: SMS parsing runs on device. Candidates are synchronized to user's private database only with user authorization.

---

## 2. Store Listing & Asset Preparation

- **App Icon:** 512x512 PNG format available at `frontend/public/icons/icon-512.png`.
- **Feature Graphic:** 1024x500 banner prepared.
- **Account Deletion:** Supported via user settings endpoint.
