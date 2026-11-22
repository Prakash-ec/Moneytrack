# MONEYTRACK — OFFLINE SYNCHRONIZATION & QUEUE VALIDATION

**Author:** Distributed Systems & Mobile Offline Sync Engineer  
**Status:** VALIDATED (`PASS`)  
**Scope:** Offline expense queueing, offline income queueing, auto-replay on reconnect, idempotency guarantees  

---

## 1. Executive Summary

MoneyTrack's offline resilience was previously asymmetric: while expenses could be saved offline when network connectivity failed, incomes lacked offline support and would throw an unhandled error.

The offline subsystem has been expanded to provide **dual-ledger offline synchronization** for both expenses and incomes.

---

## 2. Implementation Details

### 2.1 Unified Offline Queue (`frontend/src/services/offlineQueue.ts`)
The offline queue now tracks both:
- `QueuedExpense`: `{ type: 'expense', client_id, idempotency_key, payload: ExpenseCreateInput, ... }`
- `QueuedIncome`: `{ type: 'income', client_id, idempotency_key, payload: IncomeCreateInput, ... }`

Exported API:
- `enqueueOfflineExpense(payload: ExpenseCreateInput)`
- `enqueueOfflineIncome(payload: IncomeCreateInput)`
- `getOfflineQueue(): QueuedTransaction[]`
- `flushOfflineQueue(): Promise<{ synced: number, failed: number }>`
- `removeOfflineExpense(clientId: string)` / `removeOfflineIncome(clientId: string)`

### 2.2 Reconnect & Replay Architecture
When the browser or Android WebView detects network restoration (`online` event):
1. `AppLayout.tsx` observes `offlineCount > 0`.
2. Triggers `flushOfflineQueue()`.
3. Sequentially submits queued items using their pre-assigned `idempotency_key` (`client-xxx` for expenses, `client-inc-xxx` for incomes).
4. On success, the item is removed from local storage and the data cache is refreshed (`invalidate()`).
5. On failure, exponential retry count is updated and the item remains safely queued locally.

---

## 3. Automated Test Verification

The offline queue was verified with Vitest in `frontend/src/services/offlineQueue.test.ts`:

```
✓ src/services/offlineQueue.test.ts (4 tests) 14ms
  ✓ queues an expense locally with a stable idempotency key
  ✓ queues an income locally with a stable idempotency key
  ✓ removes an item from the queue by clientId
  ✓ flushes mixed queued expenses and incomes, removing synced ones
```

All 4 test scenarios passed with 100% assertions satisfied.
