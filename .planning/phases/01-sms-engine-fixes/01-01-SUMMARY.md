# Phase 1 Summary: SMS Native Engine & Parser Fixes

**Executed On**: 2026-10-30
**Status**: COMPLETE (Verified with 100% passing tests)

---

## 1. Accomplishments

### Security & Permission Model Hardening
- **Protected `SmsReceiver`**: Added `android:permission="android.permission.BROADCAST_SMS"` to the `<receiver android:name=".sms.SmsReceiver">` definition in `android/app/src/main/AndroidManifest.xml`. This ensures only the Android telephony system signature can deliver incoming SMS broadcasts, blocking any third-party app spoofing.
- **Removed Unnecessary `READ_SMS`**: Removed `<uses-permission android:name="android.permission.READ_SMS" />` from `AndroidManifest.xml` and from `@CapacitorPlugin` annotations and runtime permission request aliases in `android/app/src/main/java/com/moneytrack/app/plugins/SmsPlugin.kt`. Kept `RECEIVE_SMS`, `INTERNET`, and `POST_NOTIFICATIONS`.

### Deterministic SMS Parsing (`SmsParser.kt`)
- **Debit Amount vs. Available Balance**:
  - Identified balance clauses with regex `BALANCE_AMOUNT_REGEX` matching `avail bal`, `available balance`, `ac bal`, `bal:`, `bal is`, `current balance`.
  - Added `DEBIT_AMOUNT_PATTERNS` to explicitly associate amounts with action verbs (`debited by/with/for`, `spent`, `paid`, `purchase of`, `plan name`).
  - Balance numbers are completely filtered out from candidate extraction pools. Debit verbs take top priority, preventing `Rs. 450.00 spent ... Avail Bal: Rs. 15,200.00` from picking the balance.
- **Body Merchant Priority Over Bank Sender IDs**:
  - Body merchant patterns (`to VPA <handle>@<bank>`, `Info: BIL*<merchant>`, `at <Merchant>`, `paid to <Merchant>`, `transfer to <Merchant>`) are now evaluated first.
  - Candidate cleanup strips trailing punctuation, stopwords (`on`, `dated`, `ref`, `using`, `via`, `a/c`, `val`), and normalizes merchant casing (e.g., `SWIGGY` -> `Swiggy`, `ZOMATO` -> `Zomato`).
  - Issuing bank sender IDs (e.g., `HDFC`, `SBI`, `ICICI`, `AXIS`) are now used only as fallbacks when no merchant is found in the SMS body.
- **Indian Banking Date Formats**:
  - Expanded `DATE_PATTERNS` and `parseIshDate` to support textual and compact banking date formats: `28-OCT-26`, `28-Oct-2026`, `28Oct26`, `28 Oct 2026`, `28-10-2026`, `28/10/2026`, etc.
  - Corrected 2-digit year normalization to map `26` to `2026`.
- **Merchant Category Suggestions**:
  - Pattern rules for common Indian merchants returning clean category strings without hardcoded database IDs:
    - Swiggy / Zomato -> `Food`
    - Blinkit / Zepto / Instamart -> `Groceries`
    - Uber / Ola / Rapido / IRCTC -> `Transport`
    - Bus Travel -> `Bus Travel`
    - HPCL / BPCL / Petrol -> `Fuel`
    - Amazon / Flipkart / Myntra -> `Shopping`
    - Jio / Airtel / Recharge -> `Mobile Recharge`
    - BESCOM / Electricity -> `Utilities`
    - BookMyShow / PVR / Netflix -> `Entertainment`
    - Apollo / Medical / Pharmacy -> `Health`

---

## 2. Test Suite & Verification Results

| Test Suite | Result | Details |
|---|---|---|
| **Android Unit Tests** (`gradlew test`) | **PASSED** (100%) | All tests passed in `:app:testDebugUnitTest` and `:app:testReleaseUnitTest`. |
| **Android Debug APK** (`assembleDebug`) | **PASSED** | APK built at `android/app/build/outputs/apk/debug/app-debug.apk` (5,254,663 bytes). |
| **Backend Pytest** | **PASSED** (138/138) | 138 passed in 17.72s. |
| **Frontend Vitest** | **PASSED** (37/37) | 37 tests across 5 test suites passed. |
| **Frontend Typecheck** (`tsc --noEmit`) | **PASSED** | 0 TypeScript errors. |
| **Database Safety** | **VERIFIED** | Active SQLite database `backend/data/moneytrack.db` intact at 81,920 bytes. Backup `backend/data/moneytrack.db.backup_20261030_200300` preserved. |

---

## 3. Files Modified
- [`android/app/src/main/AndroidManifest.xml`](file:///d:/MoneyTrack/android/app/src/main/AndroidManifest.xml)
- [`android/app/src/main/java/com/moneytrack/app/plugins/SmsPlugin.kt`](file:///d:/MoneyTrack/android/app/src/main/java/com/moneytrack/app/plugins/SmsPlugin.kt)
- [`android/app/src/main/java/com/moneytrack/app/sms/SmsParser.kt`](file:///d:/MoneyTrack/android/app/src/main/java/com/moneytrack/app/sms/SmsParser.kt)
- [`android/app/src/test/java/com/moneytrack/app/sms/SmsParserTest.kt`](file:///d:/MoneyTrack/android/app/src/test/java/com/moneytrack/app/sms/SmsParserTest.kt)
