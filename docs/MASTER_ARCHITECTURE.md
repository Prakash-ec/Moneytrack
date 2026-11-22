# MoneyTrack — Master System Architecture

**Document Version:** 1.0.0  
**Date:** 8 November 2026  
**System Scope:** End-to-End Personal Finance Architecture (Android, Web Frontend, FastAPI Backend, PostgreSQL/SQLite Database)

---

## 1. High-Level Architecture Overview

MoneyTrack is an offline-capable, privacy-centric personal financial tracking system comprising three core tiers:
1. **Android Native Application (`com.moneytrack.app`)**: Built with Capacitor 7 and Kotlin, running on modern Android (versions 10 through 16). Features an autonomous native SMS intelligence engine that ingests, classifies, deduplicates, and stages financial notifications locally before syncing to the backend.
2. **Web Frontend (`frontend/`)**: React 19, TypeScript, and Tailwind CSS SPA packaged inside the Capacitor WebView and deployed as a web interface. Provides double-entry ledger summaries, transaction filtering, category management, bank account tracking, and manual SMS candidate review.
3. **Backend API (`backend/`)**: FastAPI application backed by SQLAlchemy 2.0 and Alembic. Manages multi-tenant transaction persistence, idempotency checking, bank balance recalculation, and audit evidence linkage.
4. **Data Tier**:
   - **Production**: Neon PostgreSQL 18 with serverless branching and point-in-time recovery.
   - **Local Development**: SQLite with non-destructive Alembic migrations.

```mermaid
flowchart TD
    subgraph AndroidDevice ["Android Native Tier (OPPO CPH2729 / Android 16)"]
        SMS[Telephony SMS Received] --> Receiver[SmsReceiver]
        Receiver --> Parser[SmsParser & SmsEligibility]
        Parser --> Recon[SmsReconciliation 5-Layer Engine]
        Recon --> Store[TransactionStore / sms_transaction_queue.json]
        Store --> Worker[SyncWorker / WorkManager]
        Store --> Notif[SmsNotificationHelper]
        Store <--> Plugin[SmsPlugin Capacitor Bridge]
        Plugin <--> UI[React SPA / WebView]
    end

    subgraph BackendAPI ["FastAPI Backend Tier"]
        Worker -->|HTTPS Ingest POST| IngestRoute[/api/v1/sms/ingest]
        UI -->|HTTPS REST API| APIRoutes[/api/v1/*]
        IngestRoute --> IngestService[sms_ingest.py]
        APIRoutes --> Services[expenses.py / incomes.py / bank_accounts.py]
        IngestService --> Ledger[Double-Entry Ledger Engine]
        Services --> Ledger
    end

    subgraph DatabaseTier ["Database Storage Tier"]
        Ledger --> DB[(Neon PostgreSQL 18 / SQLite)]
        DB --> Users[users]
        DB --> Exp[expenses]
        DB --> Inc[incomes]
        DB --> Acct[bank_accounts]
        DB --> SrcMsg[sms_source_messages]
        DB --> Evidence[transaction_evidence]
    end
```

---

## 2. Core Subsystems

### 2.1 Android SMS Intelligence Pipeline
The SMS engine operates under a strict principle of **conservative financial truth**:
- **Ingestion**: Listens for `Telephony.SMS_RECEIVED` broadcasts.
- **Eligibility**: Discards OTPs, telecom promotional messages, service vouchers, and data quota warnings (e.g., "100% daily data quota used").
- **Parsing**: Case-insensitive heuristic extraction of amounts (INR paise integer representation), account suffixes, bank names, and transaction references (UTR / RRN). Rejects masked account numbers misidentified as references.
- **Classification**: Normalizes direction into `BANK_DEBIT`, `BANK_CREDIT`, `UPI_DEBIT`, `RECHARGE`, `REFUND`, or `AMBIGUOUS_REVIEW`. If direction cannot be conclusively determined, it is **never defaulted to debit**; it remains `AMBIGUOUS_REVIEW`.
- **5-Layer Reconciliation Engine (`SmsReconciliation.kt`)**:
  - **Layer A**: Exact SMS hash deduplication (SHA-256 of sender, timestamp, and text).
  - **Layer B**: UPI reference (UTR / RRN) cross-sender matching with amount consistency check.
  - **Layer C**: Intra-bank CBS/UPI dual-notification merge (30-minute window, same account, same amount).
  - **Layer D**: Telecom recharge confirmation merge with bank debit.
  - **Layer E**: Chronological balance progression delta validation ($\Delta \text{Balance} == \text{Amount}$), preserving distinct consecutive identical transactions.
- **Durability**: Persistent JSON file storage in internal app storage (`context.filesDir/sms_transaction_queue.json`) with synchronized file locking.
- **Synchronization**: Managed by Android `WorkManager` with exponential backoff and network constraints.

### 2.2 Backend Multi-Tenant Security & Ledger
- **Tenancy Scoping**: Every financial entity (`expenses`, `incomes`, `bank_accounts`, `expense_types`, `income_types`, `sms_source_messages`, `transaction_evidence`, `bank_balance_snapshots`) is explicitly bound to `user_id`.
- **Composite Foreign Key Integrity**: `transaction_evidence` links `sms_source_messages`, `expenses`, and `incomes` using composite keys `(user_id, id)` to prevent cross-tenant data leakage at the database kernel level.
- **Idempotency**: All ingestion requests accept an `Idempotency-Key` header or payload hash to prevent double-recording upon network retry.
- **Bank Balance Recalculation**: Automatically updates account balances upon transaction ingestion or manual ledger adjustments.

### 2.3 Bank Balance-Aware, Duplicate-Proof Transaction Engine
MoneyTrack enforces a ledger-derived accounting core synchronized with absolute bank snapshots:
- **Ledger Invariant**: An income increases the ledger balance exactly once; an expense decreases the ledger balance exactly once. Duplicate SMS messages (tested up to 100 replays) never apply financial deltas again.
- **Absolute Snapshot vs. Delta Distinction**:
  1. `current_balance_paise`: Calculated ledger balance ($Opening + \sum Inflow - \sum Outflow$).
  2. `last_reported_balance_paise`: Latest authoritative bank-reported observation snapshot.
  3. `BalanceSnapshot`: Provenance-tracked historical audit trail recording balance type (`AVAILABLE` vs. `LEDGER`), currency, SMS source message link, transaction time, reception time, processing time, and confidence.
- **Preservation of Opening Balance**: The initial `opening_balance_paise` is strictly immutable and never silently altered to force parity with bank-reported balances. Discrepancies between calculated ledger and bank snapshots are recorded transparently as `discrepancy` status for user audit.
- **Transaction Reversals and Refunds**: Implemented via `transaction_reversals` table (Alembic `0012`). Explicitly links refund credits to original expenses, enforces cumulative refund caps ($\sum \text{Refunds} \le \text{Original Amount}$), tracks `net_amount_paise`, and quarantines over-refund attempts to `PENDING_REVIEW`.
- **Out-of-Order Snapshot Protection**: Delayed historical notifications preserve observation evidence in snapshot history without regressing the latest known balance.
- **Reconciliation Engine Layers**:
  - **Layer 1**: Idempotency key and exact SMS content SHA-256 hash deduplication.
  - **Layer 2**: Bank reference / UTR / RRN matching with conflict detection for mismatched amounts.
  - **Layer 3**: Manual transaction reconciliation (matches pre-existing user records with SMS confirmations).
  - **Layer 4**: Dual-notification (CBS + UPI) reconciliation with chronological balance progression validation (Layer E).
  - **Layer 5**: Multi-account disambiguation using combined bank name and account suffix matching.

### 2.4 Production Database & Disaster Recovery Architecture
- **PostgreSQL 18 Compatibility**: Full 12-migration chain validated from 0001 to HEAD (`0012_transaction_reversals`) on PostgreSQL 18.6 with composite foreign key tenant isolation and native multi-threaded concurrency (tested at 2, 10, 50, and 100 simultaneous workers).
- **Disaster Recovery**: Empirical backup and restoration verified using native `pg_dump -Fc` and `pg_restore` on PostgreSQL 18, achieving 100% record parity and zero data loss. Detailed in `docs/POSTGRESQL_DISASTER_RECOVERY.md`.

### 2.5 Android Build & Signing Architecture
- Dual-mode signing in `android/app/build.gradle`: Uses secure environment variables (`RELEASE_STORE_FILE`, `RELEASE_KEY_ALIAS`) for production store signing, with automatic fallback to debug signing for developer testing.
- Deterministic privacy filtering via `SmsEligibility.kt` discarding OTPs and promotional messages prior to storage. Detailed in `docs/GOOGLE_PLAY_SMS_COMPLIANCE_AUDIT.md` and `docs/ANDROID_RELEASE_VALIDATION.md`.

### 2.6 Frontend & UI Architecture
- Mobile-first responsive layout utilizing Tailwind CSS variables and safe area padding for Android notch and navigation bars.
- Searchable bottom sheet pickers for category and account selection, preventing Android WebView keyboard zoom and SVG icon distortion.
- Real-time event broadcasting (`moneytrack:sms-changed`) synchronizing native SMS state with web ledger components.
