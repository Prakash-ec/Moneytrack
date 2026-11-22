# MoneyTrack — Android Test Report

**Execution Date:** 8 November 2026  
**Test Runner:** Gradle 8.14.3 / JUnit 4.13.2 / Mockito 5.11.0  
**Test Command:** `cd android; .\gradlew.bat testDebugUnitTest`  
**Execution Result:** **110 passed, 0 failed in 1m 09s (100% Success Rate)**

---

## 1. Class-by-Class Test Results

| Test Class | Category / Purpose | Tests | Failures | Status |
| :--- | :--- | :---: | :---: | :---: |
| `SmsParserTest` | Regex & heuristic amount/date/ref extraction | 35 | 0 | **PASS** |
| `SyncWorkerTest` | WorkManager sync, network retry, idempotency | 25 | 0 | **PASS** |
| `SmsReconciliationTest` | 5-layer deduplication + 8 Phase D gate tests | 22 | 0 | **PASS** |
| `SmsEligibilityTest` | OTP, promo, and telecom data quota filters | 10 | 0 | **PASS** |
| `SmsNotificationHelperTest`| Notification channels, stable IDs, drawer persistence | 9 | 0 | **PASS** |
| `TransactionStoreTest` | Deserialization, safe status parsing, queue locking | 8 | 0 | **PASS** |
| `ExampleUnitTest` | Base capacitor project harness | 1 | 0 | **PASS** |
| **Total** | **Full Native Android Suite** | **110** | **0** | **100% PASS** |
