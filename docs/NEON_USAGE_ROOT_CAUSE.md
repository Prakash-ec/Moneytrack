# MoneyTrack — Neon Compute Quota Exhaustion Root Cause Analysis

**Incident Date Observed:** November 26, 2026  
**Neon Project:** `MoneyTrack` (`icy-darkness-52246...`), Branch `production` (`br-super-pond-b557tzny`)  
**Region & Plan:** AWS US East 2 (Ohio), Free Plan (`100 CU-hrs` monthly allowance, Postgres `18`, autoscaling `0.25 <-> 2 CU`)  
**Measured Consumption:** `110.27 CU-hrs` compute, `34.6 MB` storage, `377.31 kB` history, `127.84 MB` network transfer  
**Status Banner:** `"Limit reached — Monthly compute allowance used (100 CU-hrs). Resets in 4 days."`

---

## 1. Executive Summary (Verified Root Cause)

MoneyTrack exhausted its `100 CU-hrs` Neon Free-Tier compute quota (`110.27 CU-hrs` measured) because **a 3-layer HTTP keep-alive and polling stack prevented Neon PostgreSQL from ever entering its 5-minute idle auto-suspend state**, starting on **November 6, 2026** (`commit b6658555649d84e0c49efe35b5c62456903a2ab7`: *"feat: implement multi-layer keep-alive and connection resilience to prevent Render sleep"*).

Critically, `/health` — the target of every keep-alive ping and every Render health check — executed **three synchronous SQL queries** against PostgreSQL on every request:
1. `SELECT 1` (`backend/app/main.py:326`)
2. `SELECT version_num FROM alembic_version` (`backend/app/main.py:328`)
3. `SELECT 1 FROM expense_types LIMIT 1` (`backend/app/main.py:332`)

Because Render's 15-minute idle prevention was chained to `/health`, and every `/health` ping queried PostgreSQL, keeping Render awake **kept Neon compute permanently active ~24 hours/day**. At Neon's minimum compute allocation of `0.25 CU`, continuous uptime consumes `6.00 CU-hrs/day`. Over the `~19.37 days` from Nov 6 to Nov 25, continuous `0.25 CU` wakefulness yields `~116.25 CU-hrs` — closely matching the measured `110.27 CU-hrs` (`~441.1` compute-active hours at `0.25 CU`).

---

## 2. The Four Specific Mechanisms That Kept Neon Awake

| Layer | File & Line (Pre-Fix) | Behavior | Frequency | Prevented Scale-to-Zero? |
|---|---|---|---|---|
| **1. Backend Self-Ping Worker** | `backend/app/main.py:149-209` + `backend/app/core/config.py:67` (`keep_alive_enabled = True`) | `asyncio.create_task(keep_alive_worker())` slept 45s then pinged `RENDER_EXTERNAL_URL/health` every **12 minutes** in an infinite `while True` loop | Every 12 min (`5/hr`, `120/day`) | **Yes — 24/7 loop** (as long as container was alive, self-ping reset Render's 15-min timer AND queried Neon via `/health`) |
| **2. GitHub Actions Cron** | `.github/workflows/keep_alive.yml` (commit `b665855`) | `schedule: - cron: '*/12 * * * *'` curled `https://moneytrack-backend-g5is.onrender.com/health` (and fell back to `/api/health`) | ~Every 12 min (`5/hr`, `~120/day`, ~2,320 runs Nov 6–25) | **Yes — 24/7 external wake-up** (even if Render ever slept, GitHub Actions woke Render + Neon within <= 12 min) |
| **3. DB-Coupled `/health` Probe** | `backend/app/main.py:316-356` (`GET /health`) + `render.yaml:8` (`healthCheckPath: /health`) | Root `/health` executed 3 SQL queries (`SELECT 1`, `alembic_version`, `expense_types`) on every Render probe & keep-alive ping | Every keep-alive ping + all Render health checks | **Yes — coupled HTTP liveness to Postgres wakeups** |
| **4. Frontend Heartbeat & 15s Polling** | `frontend/src/services/keepAlive.ts:31-69` + `frontend/src/layouts/AppLayout.tsx:517-521` | `startKeepAliveService()` pinged `/api/health` every **10 min** (+ on tab visibility & `online` events); `AppLayout` polled `GET /api/notifications?unread_only=true` every **15 seconds** | Every 15 sec (`240 DB queries/hr`!) + every 10 min | **Yes — while any web/Android WebView session was open**, polling every 15s made Neon auto-suspend impossible |

---

## 3. Exact Historical Incident Timeline (From Git & Neon Telemetry)

| Timestamp | Event | Source / Evidence |
|---|---|---|
| `2026-11-01 08:02:34` | Neon `MoneyTrack` project created (`Free plan`, `0.25 <-> 2 CU`, Postgres 18, `100 CU-hrs` allowance). | Neon Console screenshot |
| `2026-11-06 12:59:14 +05:30` | Commit `b665855` added `.github/workflows/keep_alive.yml` (`*/12 * * * *`), backend `keep_alive_worker` (`keep_alive_enabled=True`, 12-min loop), and frontend `keepAlive.ts` (10-min loop). | Git commit `b665855` |
| `2026-11-07 15:53:52 +05:30` | Commit `09acaa7` upgraded `/health` & `/api/health` to query `SELECT 1`, `alembic_version`, and `SELECT 1 FROM expense_types LIMIT 1`, and added `AppLayout.tsx` notification polling (`setInterval(..., 15000)`). | Git commit `09acaa7` |
| `2026-11-06` to `2026-11-25` | Combined backend + GitHub cron + `/health` SQL queries prevented Neon auto-suspend (~5 min idle threshold) continuously for ~19 days, accumulating `110.27 CU-hrs`. | Neon usage telemetry + git delta |
| `2026-11-25 21:56:35 +05:30` | Commit `a781c21` set `KEEP_ALIVE_ENABLED: "false"` in `render.yaml` and removed `*/12 * * * *` cron from `.github/workflows/keep_alive.yml` after Render startup failed with Neon quota error. | Git commit `a781c21` |
| `2026-11-26` | This forensic audit completed fixes in code: set `Settings.keep_alive_enabled = False`, separated `/health` (0-DB liveness) from `/health/db`, removed obsolete `.github/workflows/keep_alive.yml`, disabled `keepAlive.ts` intervals, removed `AppLayout.tsx` 15-sec polling, and tightened SQLAlchemy PG pool settings. | Verified repo commits & test runs |
