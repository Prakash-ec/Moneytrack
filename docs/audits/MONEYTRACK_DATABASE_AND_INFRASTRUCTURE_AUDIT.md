# MoneyTrack Database & Infrastructure Audit Report

**Scope:** Neon PostgreSQL 18, SQLAlchemy 2, Alembic Migrations, Render Deployment, Docker Build, GitHub Actions CI  
**Database Decision:** Focus exclusively on **Neon PostgreSQL 18** (`icy-darkness-52246...` / `production` branch). Do not migrate legacy data or configure Aiven.

---

## 1. Executive Summary

Production deployments on Render recently failed during startup with:
`psycopg2.OperationalError: ERROR: Your account or project has exceeded the quota` against Neon pooler `ep-silent-frost-b5ee0dqt-pooler.c-7.us-east-2.aws.neon.tech`.

Neon Console telemetry confirmed `110.27 / 100 CU-hrs` monthly compute consumption on the Free plan (`0.25 <-> 2 CU`, Postgres 18). The root cause was 24/7 keep-alive pings (`render.yaml` `KEEP_ALIVE_ENABLED=true` and `.github/workflows/keep_alive.yml` `*/12 * * * *` cron) calling `/health`, which executes `SELECT 1`, `alembic_version`, and `expense_types` queries against Neon and prevented Neon's scale-to-zero auto-suspend from ever resting. Commit `a781c21` disabled both keep-alive mechanisms so Neon can auto-suspend cleanly.

Remaining database and infrastructure risks center on missing tenant constraints on global/unscoped tables (`ExpenseIdempotencyKey`, `UserPreference`), SQLite vs PostgreSQL migration divergence in `0009_sms_evidence_architecture.py`, and Docker image hardening.

---

## 2. Neon PostgreSQL 18 Configuration & Connection Lifecycle

| Area | Current State | File / Setting | Assessment |
|---|---|---|---|
| Engine / Version | Neon PostgreSQL 18 (`postgresql+psycopg2://`) | `backend/app/core/config.py` | Compatible with SQLAlchemy 2.0.36 & `psycopg2-binary` 2.9.13 |
| URL Resolution | Supports `DATABASE_URL` with `NEON_DATABASE_URL` fallback (`is_neon` flag) | `backend/app/core/config.py` | Clean Neon normalization |
| Connection Pool | `pool_pre_ping=True`, `pool_recycle=300`, `pool_size=10`, `max_overflow=10` | `backend/app/db/session.py` | Safe for Neon pooler; consider smaller `pool_size` (e.g. `5`) if workers scale up |
| Compute Quota Hygiene | Keep-alive disabled (`KEEP_ALIVE_ENABLED="false"`, cron removed) | `render.yaml`, `.github/workflows/keep_alive.yml` | Prevents 24/7 Neon compute burn (`a781c21`); requires Neon monthly reset or plan upgrade to unblock currently exhausted project |
| Startup Migrations | `RUN_STARTUP_MIGRATIONS="false"`; Render `startCommand` runs `alembic upgrade head && uvicorn app.main:app` | `render.yaml` | Avoids multi-worker startup migration races |

---

## 3. Schema, Tenancy & Alembic Migration Findings

### [P0 / C1] Global Uniqueness Without `user_id` on `expense_idempotency_keys`
- **Location:** `backend/app/models/idempotency_key.py` (L22–35)
- **Root Cause:** `idempotency_key` has `unique=True` globally without a `user_id` column or `(user_id, idempotency_key)` uniqueness scope. Paired with `sms_ingest.py` (L288–294) querying `ExpenseIdempotencyKey` and `db.get(Expense, ...)` without filtering by `user_id`, User B supplying or colliding on a deterministic idempotency key from User A triggers a cross-tenant read/integrity conflict.
- **Neon / Alembic Remediation:** Add a new Alembic revision (`0013+`, never editing applied `0001`–`0012`) adding `user_id` (backfilled from `expenses.user_id`), replacing the global unique constraint on `idempotency_key` with a composite unique constraint on `(user_id, idempotency_key)` using SQLite-compatible `batch_alter_table` so both Neon PostgreSQL 18 and local/CI SQLite succeed.

### [P0 / C20] `user_preferences.key` Globally Unique Across All Users
- **Location:** `backend/app/models/user_preference.py` (L10–24)
- **Root Cause:** `key` is defined with `unique=True` globally even though `user_id` exists on the table.
- **Impact:** A second user saving notification/app preferences (`notifications_prefs`) hits a `UniqueViolation` on Neon PostgreSQL or overwrites shared preference rows depending on lookup path.
- **Neon / Alembic Remediation:** Add a composite unique constraint `(user_id, key)` via a new Alembic revision (using `batch_alter_table` for cross-dialect safety) and scope all `UserPreference` queries by `user_id`.

### [P1 / Migration Portability] `0009_sms_evidence_architecture.py` Fails on Fresh SQLite `alembic upgrade head`
- **Location:** `backend/alembic/versions/0009_sms_evidence_architecture.py`
- **Root Cause:** Uses non-batch `op.create_unique_constraint`, which executes on Neon PostgreSQL 18 but raises `NotImplementedError` on SQLite when running fresh migrations in `.github/workflows/backend-quality.yml` if SQLite batch mode is not active.
- **Policy Constraint (`AGENTS.md`):** Applied revisions `0001`–`0012` must **not** be edited in-place. All new revisions (`0013+`) must use `with op.batch_alter_table(...)` when altering columns or constraints so migrations remain dual-compatible with Neon PostgreSQL 18 and SQLite test suites.

---

## 4. Render, Docker & CI/CD Findings

### [P1 / C13] Container Hardening & Build Context Hygiene
- **Location:** `backend/Dockerfile` (L1–40), missing `backend/.dockerignore`
- **Findings:**
  1. Container runs as `root` instead of a dedicated non-root user.
  2. No `backend/.dockerignore`, causing `.venv`, `.pytest_cache`, `.mypy_cache`, local `.db` files, or `.env` artifacts (if present locally) to enter the Docker build context via `COPY . .`.
  3. Unsafe fallback defaults inside `Dockerfile` (`DATABASE_URL=sqlite:///...`, `CORS_ORIGINS=*`).
- **Remediation:** Add `backend/.dockerignore`, create and switch to a non-root user (`appuser`) in `backend/Dockerfile`, and remove overly permissive wildcard defaults while keeping Render runtime env configuration intact.

### [P1 / Neon Health Check Compute Cost] `/health` Hits Neon on Every Probe
- **Location:** `backend/app/main.py` (`/health`, `/health/db`)
- **Finding:** `/health` executes `SELECT 1`, queries `alembic_version`, and queries `expense_types`. When combined with Render platform health checks or external monitors, lightweight liveness probes should not unnecessarily wake Neon compute if a static liveness check suffices, reserving DB verification for `/health/db` and Render readiness.
- **Recommendation:** Keep Render's `healthCheckPath` conservative and ensure no background loop (`KEEP_ALIVE_ENABLED=false`) polls `/health`.

---

## 5. Actionable Next Steps for Neon Production Unblock

1. **External Neon Console Action (User):** Either wait for the monthly Neon Free Plan CU-hr quota reset shown in the Neon Console banner or upgrade the Neon project plan (`MoneyTrack`, `icy-darkness-52246...`) so `ep-silent-frost-b5ee0dqt-pooler.c-7.us-east-2.aws.neon.tech` accepts connections again.
2. **Post-Unblock Render Redeploy:** Trigger Render deploy (`alembic upgrade head && uvicorn app.main:app`); keep `KEEP_ALIVE_ENABLED="false"` so Neon suspends automatically during idle periods.
