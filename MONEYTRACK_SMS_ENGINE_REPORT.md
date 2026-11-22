# MONEYTRACK — SMS INTELLIGENCE & PARSER HARDENING REPORT

**Author:** Financial SMS Intelligence & Android Native Systems Engineer  
**Component:** `com.moneytrack.app.sms`  
**Status:** VALIDATED (`PASS`)  
**Timestamp:** 2026-11-08  

---

## 1. Executive Summary

This report covers the architecture, regex extraction rules, financial context anchoring, eligibility classification, and physical device performance of the MoneyTrack Android SMS engine.

Prior to hardening, the parser relied on unrestrained bare decimal matching, causing false positives on OTP codes, telecom plan numbers, phone numbers, and promotional discounts. The hardened SMS engine eliminates bare decimals and strictly anchors amount extraction to recognized currency symbols and financial keywords.

---

## 2. Hardening Rules Implemented

### 2.1 Currency & Context Anchoring
Financial amounts must be anchored to explicit financial tokens:
- Prefixes: `Rs\.?`, `INR`, `₹`, `Rupees`
- Context verbs: `Paid`, `Debited`, `Credited`, `Transferred`, `Sent`, `Spent`, `Withdrawn`
- Balance tokens: `Bal:?`, `Avl Bal:?`, `Available Balance:?`

Any numeric pattern without a financial anchor is strictly excluded from amount extraction.

### 2.2 Classification Hierarchy
Every parsed SMS is classified into one of four states:
1. `DEBIT_CONFIRMED`: Explicit debit with amount, account suffix, and merchant or UPI reference.
2. `CREDIT_CONFIRMED`: Explicit credit or deposit with amount and account.
3. `AMBIGUOUS_REVIEW`: Valid financial transaction but lacks full merchant or clear categorization (surfaced in UI for 1-tap confirmation).
4. `PROMOTIONAL_IGNORE`: OTPs, recharge ads, pre-approved loan solicitations, or generic telemarketing (silently ignored, never notifying or spamming user).

### 2.3 Physical Device Queue Protection
During testing on the connected OPPO CPH2729 (serial `e9818d7b`), the live local device queue containing **11 pending SMS records** was safeguarded. Cold backups were archived to `backups/device_queue_backups/` to ensure zero user data loss.

---

## 3. Kotlin Unit Test Validation

The Android Kotlin test suite was executed via Gradle:

```
> Task :app:testDebugUnitTest
113 tests completed, 0 failed, 0 skipped.
BUILD SUCCESSFUL in 1m 52s
```

Test coverage includes:
- `SmsParserTest`: 55 unit tests covering multi-bank SMS formats (HDFC, SBI, ICICI, Axis, SDCCB, Canara, PNB, BoB).
- `SmsEligibilityTest`: 32 tests verifying classification thresholds and promotional suppression.
- `SmsReconciliationTest`: 26 tests verifying stable fingerprint hashing, consecutive installment handling, and notification ID resolution.
