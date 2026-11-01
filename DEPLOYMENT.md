# MoneyTrack — Deployment & Hosting Guide

This guide explains how to host the MoneyTrack FastAPI backend on **Render (Free Plan)** using **Neon PostgreSQL (Free Plan)**, migrate historical SQLite records safely, and connect it to the MoneyTrack Android application or web frontend.

---

## Architecture Overview

```
┌─────────────────────────────────┐
│     MoneyTrack Android App      │
│  (Capacitor + React 18 + Vite)  │
│      [On-Device SMS Parser]     │
└───────────────┬─────────────────┘
                │ HTTPS JSON API
                ▼
┌─────────────────────────────────┐
│   Render Free Web Service       │
│     (FastAPI + Uvicorn)         │
│     [Stateless / Auto-scale]    │
└───────────────┬─────────────────┘
                │ TLS Connection (sslmode=require)
                ▼
┌─────────────────────────────────┐
│     Neon PostgreSQL 18          │
│   (Serverless Cloud Database)   │
│   [Free Plan: 0.5 GiB Storage]  │
└─────────────────────────────────┘

(Local development continues using SQLite at backend/data/moneytrack.db)
```

MoneyTrack uses **local-first** financial data architecture. All amounts are stored as integer paise (1 INR = 100 paise) to prevent floating-point rounding errors.

---

## 1. Local Development (SQLite)

When `DATABASE_URL` is omitted or set to a `sqlite:///` path, MoneyTrack defaults to local SQLite storage in `backend/data/moneytrack.db`.

```powershell
cd D:\MoneyTrack\backend
.\.venv\Scripts\Activate.ps1
python run.py
```

The API starts on `0.0.0.0:8000` with `/health` and `/api/health` available.

---

## 2. Neon PostgreSQL Configuration (Production)

1. Sign in to your [Neon Console](https://console.neon.tech).
2. Create a new project (e.g. `moneytrack`).
3. Under **Dashboard > Connection Details**, copy your connection string:
   ```text
   postgresql://neondb_owner:YOUR_PASSWORD@ep-xxx.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
4. Notes on driver prefixes:
   - MoneyTrack automatically translates `postgres://` and `postgresql://` into `postgresql+psycopg2://` at runtime.
   - `sslmode=require` is enforced for encrypted cloud connections.
   - Serverless connection pool settings (`pool_pre_ping=True`, `pool_recycle=300`) are pre-configured in `app/db/session.py`.

---

## 3. Safe SQLite-to-PostgreSQL Data Migration

MoneyTrack includes a standalone, non-destructive migration script: [migrate_sqlite_to_postgres.py](file:///D:/MoneyTrack/backend/migrate_sqlite_to_postgres.py).

### Safety Guarantees:
- **Zero SQLite Modifications**: SQLite is opened in strict read-only mode (`mode=ro`). The file is never altered or deleted.
- **Dependency Ordering**: Tables are inserted in strict foreign key order (`expense_types`, `bank_accounts`, `expenses`, `income_types`, `incomes`, `account_transfers`, `bank_balance_snapshots`, `budgets`, `category_budgets`, `expense_idempotency_keys`, `security_alerts`, `notification_logs`, `user_preferences`).
- **Boolean Type Casting**: SQLite integer flags (0/1) are cast to native PostgreSQL booleans.
- **Sequence Synchronization**: All PostgreSQL primary key sequences are advanced to `COALESCE(MAX(id), 1)` so future INSERTs never collide with migrated IDs.

### Step 1: Dry-Run Inspection
Verify table counts and planned transfers without modifying the target:
```powershell
cd D:\MoneyTrack\backend
.\.venv\Scripts\python.exe migrate_sqlite_to_postgres.py --dry-run
```

### Step 2: Live Migration to Neon PostgreSQL
Run the migration with your Neon connection URL:
```powershell
cd D:\MoneyTrack\backend
$env:DATABASE_URL="postgresql://neondb_owner:YOUR_PASSWORD@ep-xxx.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require"
.\.venv\Scripts\python.exe migrate_sqlite_to_postgres.py
```

### Step 3: Verify Integrity
Run verification to confirm exact row count parity:
```powershell
.\.venv\Scripts\python.exe migrate_sqlite_to_postgres.py --verify-only
```

---

## 4. Cloud Deployment on Render (Free Plan)

A [render.yaml](file:///D:/MoneyTrack/render.yaml) blueprint is provided in the repository root for one-click setup.

### Option A: Render Blueprint (Recommended)
1. Push your repository to GitHub.
2. Sign in to [Render](https://render.com) and click **New > Blueprint**.
3. Select your `Moneytrack` repository. Render automatically reads `render.yaml`:
   - Configures Web Service `moneytrack-backend` on Python 3.11 Free plan.
   - Configures build command: `cd backend && pip install -r requirements.txt`.
   - Configures start command: `cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
   - Health check path set to `/health`.
   - Configures Static Site `moneytrack-frontend` on Free plan.
4. When prompted by Render for `DATABASE_URL`, paste your Neon connection string:
   ```text
   postgresql://neondb_owner:YOUR_PASSWORD@ep-xxx.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
5. Click **Apply**. Render will build and deploy both services.

### Option B: Manual Web Service Setup
If not using Blueprints:
1. Create a new **Web Service** on Render.
2. Connect your GitHub repository.
3. Configure the service settings:
   - **Name**: `moneytrack-backend`
   - **Region**: Choose closest to your Neon region (e.g. `Ohio` or `Oregon`).
   - **Runtime**: `Python 3`
   - **Build Command**: `cd backend && pip install -r requirements.txt`
   - **Start Command**: `cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: `Free`
4. Add Environment Variables:
   - `DATABASE_URL`: Your Neon PostgreSQL connection string.
   - `CORS_ORIGINS`: `*` (or your frontend domain URL).
   - `PYTHON_VERSION`: `3.11.9`
   - `SERVE_FRONTEND`: `false`
5. Click **Deploy Web Service**.

---

## 5. Connecting Android App to Render Backend

1. In Render Dashboard, copy your public backend HTTPS URL:
   `https://moneytrack-backend.onrender.com`
2. Open the MoneyTrack app on your Android device.
3. Go to **Settings > Backend Server URL**.
4. Enter:
   `https://moneytrack-backend.onrender.com/api`
5. Tap **Test Connection**. It should confirm:
   `Connected: MoneyTrack API v1.0.0`
6. Tap **Save URL**. All on-device parsed SMS transactions and expense tracking will now sync securely with Neon PostgreSQL.

---

## 6. Verification & Health Monitoring

Render automatically queries the health check endpoint:
```bash
curl https://moneytrack-backend.onrender.com/health
```
Response:
```json
{
  "status": "ok",
  "application": "MoneyTrack",
  "version": "1.0.0",
  "environment": "development",
  "database": "connected",
  "dialect": "postgresql"
}
```
If Neon compute pauses during idle periods, Render requests will automatically wake up Neon within 1-2 seconds with zero data loss.
