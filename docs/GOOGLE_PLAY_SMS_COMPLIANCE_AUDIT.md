# MoneyTrack — Google Play SMS Permission Policy & Compliance Audit

**Audit Date:** 8 November 2026  
**Auditor:** Mobile Security, Legal & Compliance Lead  
**Application Package:** `com.moneytrack.app`  
**Current Google Play Approval Status:** **NOT SUBMITTED / PENDING DECLARATION**  

---

## 1. Executive Summary

MoneyTrack uses device SMS notifications and historical SMS reads to provide automated personal financial management, expense tracking, and bank account balance reconciliation.
Under Google Play's **Permissions Policy for SMS and Call Log Data**, `RECEIVE_SMS` and `READ_SMS` are classified as **High-Risk and Sensitive Permissions**.

> [!IMPORTANT]
> **Approval Disclaimer**: MoneyTrack has **NOT** received approval from Google Play for SMS permissions. Submitting an application with sensitive permissions requires an explicit Permission Declaration Form in Google Play Console, demonstrable user value, and video demonstration. In-app disclosure alone does **NOT** guarantee permission approval.

---

## 2. Requested Permissions & Technical Justifications

| Permission | Manifest Declaration | Technical Need & Purpose | Alternative Evaluated |
|---|---|---|---|
| `android.permission.RECEIVE_SMS` | `AndroidManifest.xml` | Listens for incoming real-time core banking alerts (credits/debits/UPI) to queue transactions for immediate ledger reconciliation. | **SMS Retriever API**: Inapplicable because banks do not include custom app-specific hashes in financial debit alerts. |
| `android.permission.READ_SMS` | `AndroidManifest.xml` | Allows users to import historical bank transaction alerts during onboarding to establish accurate historical accounts and balances. | **Manual Entry Only**: Supported as fallback, but lacks automation for users tracking multiple accounts. |

---

## 3. Google Play Exception Eligibility Analysis

Google Play permits exceptions to the default SMS handler requirement under narrow categories:
- **Eligible Exception Category:** **Financial services / Financial transaction management**.
- **Qualification Criteria:**
  1. The core feature of the app must depend directly on reading financial SMS.
  2. The user must be unable to achieve the primary purpose of the application without the permission.
  3. Non-financial SMS (personal messages, OTPs, social messaging) must be strictly discarded.
- **Compliance Status:**
  - **Deterministic Filtering**: Enforced in [`SmsEligibility.kt`](file:///d:/MoneyTrack/android/app/src/main/java/com/moneytrack/app/sms/SmsEligibility.kt). OTPs, promotional SMS, personal chats, and telecom balance alerts are filtered out immediately and never stored or uploaded.
  - **Local Parsing**: Regex and heuristic parsing occur 100% on-device inside the Kotlin Android layer before any network request is initiated.
  - **User Review Default**: Candidates are placed in `CandidateStatus.PENDING_REVIEW` unless explicitly confirmed by the user.

---

## 4. In-App Prominent Disclosure & Consent Flow

### Disclosure Locations:
1. **SMS Review Page** ([`SmsReviewPage.tsx`](file:///d:/MoneyTrack/frontend/src/pages/SmsReviewPage.tsx#L800-L806)):
   - "MoneyTrack securely scans your device SMS inbox for past bank debits, recharges, and UPI transactions."
   - "SMS processing runs 100% locally on your device."
   - "Personal chats and OTPs are ignored and never saved."
   - "Transactions are queued for review and only recorded when you confirm them."
2. **Runtime Permission Prompt**: Triggered only after user taps "Request SMS permission" or "Import historical SMS transactions", preventing premature permission requests.

---

## 5. Identified Policy Gaps & Pre-Submission Action Plan

1. **Play Console Permission Declaration Form**:
   - Must select: **Financial services - Money management / expense tracking**.
   - Must provide a publicly accessible 60-second video demonstrating:
     1. Prominent in-app disclosure displayed before runtime prompt.
     2. User granting SMS permission.
     3. Incoming bank SMS being parsed into a pending transaction candidate.
     4. User reviewing and confirming the transaction into the financial ledger.
2. **Account Deletion & Data Retention**:
   - Google Play requires an external account deletion URL and in-app account deletion mechanism.
   - MoneyTrack provides tenant-scoped deletion via `/api/users/me` with cascading deletes on all linked evidence.
3. **Privacy Policy Synchronization**:
   - Privacy policy must explicitly declare collection, processing, and retention of financial SMS sender metadata and parsed amounts.
   - Must explicitly affirm that SMS content is **never sold, rented, or transferred to third-party ad networks**.

---

## 6. Official Approval Status

- **Play Console Submission:** **NOT SUBMITTED**
- **Declaration Review:** **PENDING**
- **Action Required:** Prepare video demonstration and submit Permission Declaration upon production store deployment.
