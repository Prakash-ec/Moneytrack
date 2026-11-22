# MoneyTrack — Master Baseline Report

**Baseline Date:** 8 November 2026  
**Auditor:** Complete Engineering Team  
**Branch:** `sms-engine-hardening`  
**Baseline Git Commit:** `f67d71d8cbd2411117117d6ac0fe5add7e0faecb`  
**Connected Hardware:** OPPO CPH2729 (Android 16, API 36, Serial `e9818d7b`)

---

## 1. Baseline Git State & Working Tree

- **Repository Root:** `D:\MoneyTrack`
- **Active Branch:** `sms-engine-hardening`
- **Baseline Commit:** `f67d71d8cbd2411117117d6ac0fe5add7e0faecb` (Author: Prakash-ec, "checkpoint: historical SMS plugin integration and UI")
- **Directory Structure:**
  - `android/`: Android native project (Gradle 8.14.3, AGP 8.13.0, Kotlin 1.9.25).
  - `frontend/android/`: NTFS Junction pointing directly to root `android/`.
  - `frontend/`: React 19, Vite 6, Tailwind CSS, Vitest 5.
  - `backend/`: FastAPI, SQLAlchemy 2.0, Alembic, Python 3.11 virtual environment.
  - `backups/`: Local database exports and physical device queue snapshots.

### Modified Files from Audit Hardening:
- `android/app/src/main/java/com/moneytrack/app/sms/TransactionStore.kt`: Hardened deserialization, safe status parsing, existing-record update bypass.
- `android/app/src/main/java/com/moneytrack/app/sms/SmsReconciliation.kt`: 5-layer reconciliation with amount-matching check in Layer B.
- `android/app/src/test/java/com/moneytrack/app/sms/SmsReconciliationTest.kt`: 22 unit tests including 10 adversarial + 8 Phase D reconciliation tests.
- `android/app/src/test/java/com/moneytrack/app/sms/TransactionStoreTest.kt`: 8 deserialization and queue tests.
- `android/app/src/test/java/com/moneytrack/app/sms/SmsNotificationHelperTest.kt`: Mockito context provider.
- `backend/app/services/sms_ingest.py`: Multi-tenant evidence ownership validation.
- `backend/tests/test_sms_evidence_and_ingest.py`: Multi-tenant isolation and evidence tests.

---

## 2. Database Schema & Migration Status

- **Local SQLite DB:** `backend/data/moneytrack.db` at revision `0009_sms_evidence_architecture (head)`.
- **Production Neon PostgreSQL:** Connected to branch `production` at revision `0008_tenant_unique`. (Zero production mutations; recovery branch `pre-migration-0008-backup` configured).
- **Migration Chain:**
  1. `0001_initial`: Base tables (users, expenses, categories).
  2. `0002_add_account_id_to_expenses`: Multi-account schema extension.
  3. `0003_add_currency_to_users`: Multi-currency support.
  4. `0004_add_income_and_bank_accounts`: Double-entry income and accounts.
  5. `0005_add_is_archived_to_categories`: Soft-delete categories.
  6. `0006_fix_bank_account_balances`: Integer paise consistency.
  7. `0007_user_auth_and_tenancy`: Multi-tenancy isolation and JWT auth.
  8. `0008_tenant_aware_unique_constraints`: Tenant-scoped uniqueness on accounts/categories.
  9. `0009_sms_evidence_architecture`: Evidence tables (`sms_source_messages`, `transaction_evidence`).

---

## 3. Physical Device Verification (OPPO CPH2729)

- **Device Serial:** `e9818d7b`
- **Android OS:** Android 16 (API 36)
- **Queue Storage File:** `files/sms_transaction_queue.json` (5,161 bytes)
- **Record Integrity:** 5 records present:
  1. `Jio` ₹15 debit — `SYNCED`, `RECHARGE`
  2. `SDCCBL` ₹10 debit — `SYNCED`, `BANK_DEBIT`
  3. `SDCCBL` ₹40 credit — `SYNCED`, `BANK_CREDIT`
  4. `SDCCBL` ₹3,003 credit — `SYNCED`, `BANK_CREDIT`
  5. `JA-ISATHI-G` telecom notification — `IGNORED`, `AMBIGUOUS_REVIEW`
- **Result:** 100% data preservation verified; zero records lost or overwritten.

---

## 4. Current Test Suite Baseline

- **Backend Pytest:** 197 passed, 0 failed in 74.62s.
- **Android JUnit:** 110 passed, 0 failed in 1m 09s.
- **Frontend Vitest:** 53 passed, 0 failed in 1.14s.
- **Frontend Build:** `tsc --noEmit && vite build` succeeded in 19.79s with 0 errors.
- **Grand Total:** **360 tests passed, 0 failed**.
