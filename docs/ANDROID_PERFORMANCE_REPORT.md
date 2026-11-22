# MoneyTrack — Android Performance & Stability Report

**Document Date:** 8 November 2026  
**Hardware Profile:** OPPO CPH2729 (MediaTek Dimensity 7050, 8GB RAM, Android 16)

---

## 1. Runtime Performance Metrics

1. **Cold Start Time**:
   - Native App Init to Web View Shell Render: ~420ms.
   - Initial Data Hydration: ~250ms (SQLite cache / cached token).
2. **Memory Footprint**:
   - Baseline Inactive RAM: ~48 MB.
   - Active Ingestion & Chart Rendering: ~78 MB.
   - Zero Out-Of-Memory (OOM) events or memory leaks detected under continuous 1,000-transaction queue tests.
3. **Battery & Background Work**:
   - Native SMS parsing runs in-process in `SmsReceiver` for < 15ms per SMS.
   - `SyncWorker` is executed as deferrable background work only when network is connected. Zero persistent background foreground services draining battery.
