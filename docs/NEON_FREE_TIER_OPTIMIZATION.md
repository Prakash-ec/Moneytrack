# MoneyTrack — Neon Free-Tier Zero-Waste Configuration

**Objective:** Allow Neon PostgreSQL (`0.25 <-> 2 CU`, 5-minute auto-suspend, `100 CU-hrs/month` free allowance) to suspend completely whenever MoneyTrack users are idle, without compromising financial integrity, idempotency, authentication, or error recovery.

---

## 1. Unnecessary Database Activity Eliminated

| Activity | Previous Source | Why It Wasted Resources / Prevented Suspend | Implemented Correction | Expected Benefit |
|---|---|---|---|---|
| **GitHub 12-min Cron** | `.github/workflows/keep_alive.yml` (`*/12 * * * *`) | Pushed ~120 DB-waking pings/day 24/7 even with zero users | Removed cron (`a781c21`), deleted obsolete `keep_alive.yml` workflow completely | Eliminates 24/7 external Render + Neon wakes |
| **Backend `keep_alive_worker`** | `backend/app/core/config.py:67` (`keep_alive_enabled = True`), `main.py:149` | Infinite `while True` async task pinged `/health` every 12 minutes | Changed default `keep_alive_enabled: bool = False` in `Settings` + `render.yaml`; added test asserting disabled by default | Zero self-triggered wakeups in any environment |
| **DB Queries in `/health` Liveness** | `backend/app/main.py:316-356` (`GET /health` used by `render.yaml` & `Dockerfile`) | Ran `SELECT 1`, `alembic_version`, `expense_types` on every Render/container health probe | Separated pure 0-DB liveness (`/health`, `/health/live`, `/api/health/live`) from DB readiness (`/health/db`, `/api/health/db`) | Render & Docker probes never touch or wake Postgres |
| **15-sec Notification Polling** | `frontend/src/layouts/AppLayout.tsx:517-521` | `setInterval(..., 15000)` sent 240 DB queries/hr whenever any browser tab was open | Removed 15s polling; fetches on mount/auth and refreshes via `moneytrack:notifications-changed` event | Zero background DB queries from idle open tabs |
| **Frontend `keepAlive.ts` Pinger** | `frontend/src/services/keepAlive.ts` | Sent 10-min `/api/health` heartbeats + visibility/online pings | Disabled `startKeepAliveService()` timers and listeners (`return () => {}`) | Eliminates tab-idle and visibility wakeups |
| **Oversized Connection Pool** | `backend/app/db/session.py:16-21` | `pool_size=10, max_overflow=10, pool_recycle=300` | Tightened to `pool_size=5, max_overflow=5, pool_recycle=270, pool_timeout=30` while retaining `pool_pre_ping=True` | Lower memory/slot usage; connections recycle before 300s suspend |
| **Linear Retry Delays** | `frontend/src/services/api.ts:231, 274` | Retried with linear `2.5s * attempt` spacing | Switched to capped exponential backoff `min(10000, 2500 * 2^(attempt - 1))` (0 automatic retries on non-idempotent POST writes) | Smoother cold-start tolerance without thundering retries |
| **Unclosed Android HTTP Socket** | `android/.../WeeklyReportWorker.kt:45-84` | Exception paths could skip `conn.disconnect()` | Moved `conn?.disconnect()` into `finally` block | Clean socket disposal on failures |

---

## 2. Optimized Neon Free-Tier Configuration Summary

```env
# Render / Production Environment (Do NOT commit secrets)
ENVIRONMENT=production
RUN_STARTUP_MIGRATIONS=false
KEEP_ALIVE_ENABLED=false
SERVE_FRONTEND=false
```

```yaml
# render.yaml key health setting
healthCheckPath: /health   # Pure HTTP liveness (0 SQL queries)
```

```python
# backend/app/db/session.py PostgreSQL pool kwargs
{
    "pool_pre_ping": True,   # Validates socket lazily ONLY when serving real traffic
    "pool_recycle": 270,     # Recycles idle sockets before Neon's 300s auto-suspend
    "pool_size": 5,
    "max_overflow": 5,
    "pool_timeout": 30,
}
```

---

## 3. Suspension Behavior & What Wakes Neon Now

- **Can Neon suspend completely when idle?** **Yes.** Once active user HTTP requests stop, `GET /health` hits no database, `keep_alive_worker` does not run, `AppLayout.tsx` does not poll every 15s, `keepAlive.ts` sends zero heartbeats, and `.github/workflows/keep_alive.yml` is gone. After Neon's 5-minute inactivity timeout, compute suspends cleanly to `0 CU`.
- **Legitimate activities that still wake Neon:**
  1. Authenticated user API requests (login/register, viewing dashboard/transactions, creating/editing expenses/income/transfers/budgets, exporting backups).
  2. Explicit DB readiness checks (`GET /health/db`, `GET /api/health/db`, or `Settings` page opening `GET /api/health` / manual `"Test connection"`).
  3. Deployments executing `alembic upgrade head` (`render.yaml` `startCommand`) and startup seeding (`seed_default_expense_types` / `seed_default_income_types`).
  4. Android `SyncWorker` posting newly received/confirmed SMS transactions and `WeeklyReportWorker` running once per week.
