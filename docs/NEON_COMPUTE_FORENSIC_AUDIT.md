# MoneyTrack — Neon Compute Usage Forensic Audit

**Project Audited:** `MoneyTrack` (`icy-darkness-52246...`), Branch `production`, AWS US East 2 (Ohio), Postgres `18`  
**Audit Date:** November 26, 2026  
**Safety Compliance:** Neon project, production branch, stored data, and `DATABASE_URL` were untouched; zero live Neon connections or migrations were executed during this investigation.

---

## 1. Measured Usage Telemetry (Neon Console Evidence)

From the Neon Console overview and branch screenshots captured on November 26, 2026:

| Metric | Measured Value | Limit / Setting | Notes |
|---|---|---|---|
| **Compute consumed** | **`110.27 CU-hrs`** | `100 CU-hrs/month` (Free plan) | Quota exceeded banner: `"Resets in 4 days"` (Dec 1, 2026) |
| **Compute scaling range** | `0.25 <-> 2 CU` | Free plan autoscaling | Idle auto-suspend threshold on Neon Free tier: 5 minutes |
| **Storage** | `34.6 MB` | Within Free tier | Minimal dataset; negligible write-amplification / I/O pressure |
| **History** | `377.31 kB` | `6 hours` retention | Confirms low actual transactional churn |
| **Network transfer** | `127.84 MB` | — | Primarily lightweight keep-alive & polling responses |
| **Project created** | `2026-11-01 08:02:34` UTC | ~25.5 days elapsed | Active 24/7 burn began `2026-11-06` (`commit b665855`) |

> **Honesty / Uncertainty Note:** Neon Console graphs showed `"There is no data to display at the moment"` for suspended Postgres Monitoring metrics, so hourly/daily per-hour time-series breakdown was not exposed after suspension. All time-series attributions below distinguish between **measured totals** (`110.27 CU-hrs`, `34.6 MB`, git timestamps) and **mathematical estimates** derived from code execution intervals.

---

## 2. Forensic Inspection Across All 6 Subsystems

### A. GitHub Actions Workflows (`.github/workflows/`)
- Inspected `.github/workflows/`: only two workflow files existed (`backend-quality.yml` and `keep_alive.yml`).
- `backend-quality.yml`: runs on `push` / `pull_request` to `main` touching `backend/**` using `sqlite:///ci_test.db` — zero Neon contact.
- `keep_alive.yml` (added `2026-11-06` in `b665855`, cron disabled `2026-11-25` in `a781c21`):
  - Configured `schedule: - cron: '*/12 * * * *'` (`5 runs/hr`, `120 runs/day`).
  - Executed `curl` against `https://moneytrack-backend-g5is.onrender.com/health` (and fallback `/api/health`).
  - Over `19.37 days` (`2026-11-06 07:29 UTC` to `2026-11-25 16:26 UTC`), up to **`~2,324` scheduled cron invocations** occurred (subject to GitHub Actions scheduler queue jitter).
  - Because `GET /health` ran 3 PostgreSQL queries (`SELECT 1`, `alembic_version`, `expense_types`), **every single cron ping woke both Render and Neon** (or reset Render's 15-minute idle timer and Neon's 5-minute idle timer).

### B. Backend Source Code (`backend/app/`)
- **`backend/app/core/config.py:67`:** `keep_alive_enabled: bool = True` and `keep_alive_interval_minutes: int = 12` (hardcoded default `True` until fixed in this audit!).
- **`backend/app/main.py:149-209` (`keep_alive_worker`):** Launched `asyncio.create_task(keep_alive_worker())` on FastAPI `lifespan` startup whenever `settings.keep_alive_enabled` was truthy. Slept 45s, then looped infinitely (`while True`) pinging `RENDER_EXTERNAL_URL/health` every 12 minutes.
- **`backend/app/main.py:316-356` (`@app.get("/health")`) & `backend/app/api/routes/health.py:13-62` (`GET /api/health`):** Both endpoints called SQL (`SELECT 1`, `SELECT version_num FROM alembic_version`, `SELECT 1 FROM expense_types LIMIT 1`). Even when `RUN_STARTUP_MIGRATIONS="false"`, startup `lifespan()` still ran `seed_default_expense_types()` and `seed_default_income_types()`.
- **No APScheduler / Celery / BackgroundScheduler / Other `while True` Loops:** Full AST/text scan of `backend/app/**/*.py` confirmed no other infinite loops or periodic DB jobs existed.

### C. Render Service Configuration (`render.yaml`)
- Service `moneytrack-backend` (`plan: free`):
  - `startCommand`: `cd backend && alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
  - `healthCheckPath: /health` (line 8) — every Render platform health check (deploy readiness + ongoing liveness monitoring while awake) called `/health`, which executed 3 Neon SQL queries per check.
  - Because Render Free Tier spins down after `15 minutes` of inactivity, keeping Render awake via 12-minute pings forced Render's own `/health` probes + `keep_alive_worker` to run 24/7 instead of suspending at night/idle.

### D. Frontend Activity (`frontend/src/`)
- **`frontend/src/services/keepAlive.ts` (added `2026-11-06` in `b665855`):**
  - Warmup `api.health()` ping on load;
  - `setInterval(..., 10 * 60 * 1000)` (every 10 min);
  - `visibilitychange` ping if > 3 min elapsed;
  - Immediate ping on `window.addEventListener('online')`.
  - Targeted `api.health()` (`/api/health`), executing 3 Neon SQL queries per ping.
- **`frontend/src/layouts/AppLayout.tsx:517-521`:**
  - `setInterval(() => void checkNotifications(), 15000)` called `GET /api/notifications?unread_only=true` every **15 seconds** (`4 times/min`, `240 times/hr` per open tab/WebView!), querying `notification_logs` + `user_preferences` on Neon. Any single browser tab or mobile WebView left open guaranteed Neon stayed continuously active!
- **`frontend/src/layouts/AppLayout.tsx:553`:** `checkPendingSms()` ran every 10s (local Capacitor plugin only — did not hit Neon directly, though unnecessary on web).
- **`frontend/src/hooks/useApiQuery.ts`:** No `refetchInterval`, no focus refetch, uses 60s in-memory TTL cache (did not loop on its own).
- **Android (`SyncWorker.kt`, `WeeklyReportWorker.kt`):** One-shot WorkManager on SMS arrival + weekly Monday report sync; negligible impact when idle.

### E. Connection Pooling & Session Lifecycle (`backend/app/db/session.py`, `backend/alembic/env.py`)
- `session.py:16-21` used `pool_pre_ping=True`, `pool_recycle=300`, `pool_size=10`, `max_overflow=10` (up to 20 sockets per worker).
- `alembic/env.py:49` correctly uses `pool.NullPool`.
- `get_db()` uses `try: yield db finally: db.close()` cleanly; `main.py:222` calls `engine.dispose()` on shutdown.
- **Did idle connections alone prevent Neon suspension?** Through Neon's pooled endpoint (`-pooler.c-7.us-east-2.aws.neon.tech`, PgBouncer transaction pooling), idle SQLAlchemy connections do **not** wake compute unless a query (including `pool_pre_ping`'s `SELECT 1`) runs on checkout, OR a session holds an open transaction. However, `pool_recycle=300` matched Neon's 300s idle boundary exactly, and `pool_size=10, max_overflow=10` reserved unnecessarily high headroom for a single-worker Render Free instance (`pool_size=5, max_overflow=5, pool_recycle=270` is cleaner and recycles prior to 300s suspend).

---

## 3. Compute Consumption Math & Contributor Ranking

### Active Hours Estimate
- At `0.25 CU` minimum compute (supported by `34.6 MB` storage / `377.31 kB` history showing minimal CPU bursts):
  $$\text{Active Compute Hours} \approx \frac{110.27\text{ CU-hrs}}{0.25\text{ CU}} = 441.08\text{ hours}\ (\approx 18.38\text{ full 24h days})$$
- Between `2026-11-06 07:29 UTC` (`b665855`) and `2026-11-25 16:26 UTC` (`a781c21`), elapsed wall-clock time was **`19.37 days` (`~464.95 hours`)**.
- Therefore, **Neon compute was awake ~94.9% of the entire period after commit `b665855`** (441.1 / 465.0 hours), consuming `~5.7–6.0 CU-hrs/day` (`24 hrs × 0.25 CU`).

### Ranked Contributors (Descending Order of Impact)

| Rank | Contributor | Mechanism | Estimated Compute Impact |
|---|---|---|---|
| **1 (Primary Trigger)** | **24/7 Keep-Alive Architecture (`keep_alive.yml` cron `*/12` + `main.py:keep_alive_worker` 12-min loop) coupled with DB-querying `/health`** | Kept Render Free Tier container awake 24/7 (`19.4 days`) and fired SQL (`SELECT 1`, `alembic_version`, `expense_types`) every ~6–12 min, resetting Neon's 5-min auto-suspend timer continuously across nights & idle days | **Largest (~85–95% of idle-period wakeups -> `~95–105 CU-hrs`)** |
| **2 (High While Tab Open)** | **`AppLayout.tsx` 15-second notification polling (`GET /api/notifications`) + `keepAlive.ts` 10-min/visibility pings** | While any browser tab or WebView remained open, fired **240 Postgres queries/hr**, completely blocking Neon's 5-min idle suspend during active/desktop-idle hours | **Major during open-session hours (overlap with #1)** |
| **3 (Amplifier)** | **DB queries inside `GET /health` used by Render `healthCheckPath`** | Forced every Render container check & every external uptime ping to hit Postgres instead of staying in-memory | **Structural multiplier making #1/#2 hit Postgres** |
| **4 (Negligible Baseline)** | **Real user traffic (CRUD/SMS ingest), Alembic migrations on deploy, `seed_default_*` on boot** | Only runs during actual user actions/deploys; storage (`34.6 MB`) confirms genuine app workload alone would use only a tiny fraction of `100 CU-hrs/month` | **Minor (< 5–10 CU-hrs/month estimated for single/personal usage)** |
