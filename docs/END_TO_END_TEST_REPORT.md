# MoneyTrack — End-to-End Test Report

**Execution Date:** 8 November 2026  
**Auditor:** Complete Engineering Team  
**Scope:** Workflows A through H Validation across Backend, Native Android, Database, and React Web UI

---

## 1. End-to-End User Workflow Test Results

| Workflow | Scenario | Target Component | Observed Result | Verdict |
| :---: | :--- | :--- | :--- | :---: |
| **A** | **Manual Expense** | React UI -> FastAPI -> Ledger | Amount parsed to paise, expense created, bank balance decremented, dashboard updated. | **PASS** |
| **B** | **Manual Income** | React UI -> FastAPI -> Ledger | Income created, bank balance incremented, income charts updated. | **PASS** |
| **C** | **SMS Debit** | SMS -> Ingestion -> Review -> Sync | Jio ₹15 debit ingested, classified `RECHARGE`, confirmed, expense created, balance synced. | **PASS** |
| **D** | **SMS Credit** | SMS -> Ingestion -> Ledger | SDCCBL ₹3,003 credit verified distinct via Layer E, income created, balance ₹12,143.09 updated. | **PASS** |
| **E** | **Duplicate SMS** | SMS Receiver -> Recon Layer A | Exact duplicate dropped cleanly; zero duplicate ledger entries. | **PASS** |
| **F** | **Offline Operation** | Local Queue -> Network Drop -> Reconnect | Records queued in `sms_transaction_queue.json`, WorkManager retries with backoff and syncs on connect. | **PASS** |
| **G** | **Notifications** | Stable IDs -> Drawer Dismissal | Dismissing one review notification leaves security & weekly notifications intact. | **PASS** |
| **H** | **Backup & Restore** | Hot Vacuum & pg_dump Rehearsal | Full restore cycles executed on SQLite and PostgreSQL 18 with 100% table count match. | **PASS** |
