# MoneyTrack — Neon & Database Resource Monitoring Guide

**Purpose:** Prevent silent compute-quota exhaustion by monitoring health endpoints, startup resource telemetry, and monthly CU-hr burn without generating monitoring noise that wakes serverless databases unnecessarily.

---

## 1. Safe Startup Telemetry Logged by MoneyTrack

On FastAPI startup (`backend/app/main.py`), MoneyTrack now logs safe configuration telemetry (zero credentials or connection URLs exposed):

- `provider` (`neon`, `postgresql`, or `sqlite`) and `dialect`
- `keep_alive_enabled` (`False` expected in production)
- SQLAlchemy pool parameters: `pool_size`, `max_overflow`, `pool_recycle`

Look for the following expected production startup log lines in Render logs:
```text
Database config initialized: provider=neon dialect=postgresql keep_alive_enabled=False pool_size=5 max_overflow=5 pool_recycle=270
Keep-alive background pinger disabled (serverless database auto-suspend preserved).
```

---

## 2. Liveness vs Database Readiness Probes

Always route automated monitors and platform liveness checks to `/health` or `/health/live`, NEVER `/health/db`:

| Endpoint | Touches DB? | Safe for Frequent Probes / Render `healthCheckPath`? | Purpose |
|---|---|---|---|
| `GET /health` | **No** | **Yes** | Render HTTP liveness & Docker `HEALTHCHECK` |
| `GET /health/live` | **No** | **Yes** | Dedicated HTTP liveness alias |
| `GET /api/health/live` | **No** | **Yes** | API-prefixed HTTP liveness check |
| `GET /health/db` | **Yes** | No (on-demand only) | Manual DB connectivity & schema verification |
| `GET /api/health/db` | **Yes** | No (on-demand only) | API-prefixed DB readiness probe |
| `GET /api/health` | **Yes** | User Settings only | Explicit UI connection test & schema version display |

---

## 3. Monthly Free-Tier Budget Thresholds & Alerts

At `0.25 CU` minimum compute:
- `1 hour` continuous active compute = `0.25 CU-hrs`
- `100 CU-hrs` Free-Tier monthly budget = **`400 compute-active hours/month`** (`~13.3 hours/day` max average)
- Healthy personal/small-team usage with auto-suspend active should remain well below **`15–25 CU-hrs/month`** (only active during real interactive sessions & SMS syncs).

### Weekly Spot-Check Checklist
1. Open the database provider dashboard (`Overview -> Usage`) once per week — **do not run automated SQL cron checks**.
2. Verify **Compute CU-hrs / days elapsed** stays below **3.3 CU-hrs/day** pace (ideal idle pace: `< 1.0 CU-hr/day`).
3. Verify no CI/GitHub workflow under `.github/workflows/` contains a `schedule:` / `cron:` trigger pinging `/api/health` or `/health/db`.
4. Confirm Render environment variables keep `KEEP_ALIVE_ENABLED=false` and `RUN_STARTUP_MIGRATIONS=false`.
