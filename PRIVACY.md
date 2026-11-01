# MoneyTrack — Privacy & Data Protection Policy

MoneyTrack is designed as a **privacy-first, local-only personal finance manager**. You own and retain complete control over your financial data.

---

## 1. Core Principles

- **Zero Cloud Storage by Default**: All your categories, expenses, budgets, and settings are saved in a local SQLite database (`backend/data/moneytrack.db`) on hardware you control.
- **No Third-Party Analytics or Trackers**: There are no Google Analytics, Firebase Analytics, Meta Pixel, crash analytics SDKs, or marketing telemetry libraries in this application.
- **No Account or Sign-In Required**: MoneyTrack does not require registering an email, phone number, password, or third-party OAuth account.
- **Zero Third-Party Advertising**: MoneyTrack contains no ads or sponsored content.

---

## 2. On-Device SMS Transaction Detection

The MoneyTrack Android application includes native SMS transaction auto-detection to streamline expense tracking.

### Permissions Used
- `android.permission.RECEIVE_SMS`: Enables the app to listen for incoming transaction alerts in real time.
- `android.permission.READ_SMS`: Allows the user to scan recent bank notifications upon explicit request.
- `android.permission.POST_NOTIFICATIONS`: Posts a local on-device notification when a new debit transaction is detected so you can review it.

### On-Device Processing Guarantee
- **100% Local Parsing**: SMS messages are analyzed directly on your smartphone by the native Android parser (`SmsParser.kt`). No SMS text is ever transmitted over the network or uploaded to external servers.
- **Strict Outgoing Debit Filter**:
  - The parser only detects successful **outgoing debit** transactions (UPI payments, POS card debits, ATM withdrawals, and net-banking transfers).
  - The parser **strictly ignores**:
    - One-Time Passwords (OTPs) and 2FA verification codes
    - Credit notifications, salary credits, and refunds
    - Balance enquiry alerts
    - Failed or declined transactions
    - Promotional, marketing, and spam messages
    - Personal text messages from contacts
- **Review Before Saving**:
  - Detected transactions are never automatically committed to your balance sheet.
  - They are placed into an on-device pending queue.
  - You can inspect, modify, categorize, approve, or permanently dismiss any detected transaction at **SMS Review** in the application.

---

## 3. Receipt Scanning & Camera Permissions

- **Local OCR**: Receipt images are processed locally on your backend server using Tesseract OCR.
- **Zero Cloud Leakage**: Images are processed in-memory or on local disk; they are never sent to third parties or shared with external model providers unless you explicitly configure an optional API key in `backend/.env`.
- **Camera Access**: Camera hardware is accessed solely to capture receipts upon your explicit click. No continuous background video recording or photo capturing takes place.

---

## 4. Backups and Data Portability

- **Full JSON Backups**: You can generate complete, portable JSON backups of your entire financial history at any time from **Settings > Full JSON backup**.
- **CSV Exports**: Export all expenses into standard CSV format for use in spreadsheet software (Excel, LibreOffice, Google Sheets).
- **Safe Restoration**: Restoring a backup merges records safely, mapping categories and preventing duplicates, with no destructive overwrites.

---

## 5. Network Traffic Summary

| Request Destination | Purpose | Data Transmitted |
| :--- | :--- | :--- |
| Configured MoneyTrack API (e.g. `http://127.0.0.1:8000`) | Expense CRUD operations, period analytics, backups | Normalized expense records, categories |
| External 3rd-Party Servers | None | **Zero data transmitted** |

---

## 6. Contact & Open Source Auditing

MoneyTrack is fully inspectable. Every line of backend Python, frontend React TypeScript, and Android Kotlin code is available in this repository for full auditability.
