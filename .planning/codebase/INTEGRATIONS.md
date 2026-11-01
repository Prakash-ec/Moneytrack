# External Integrations

**Analysis Date:** 2026-10-28

## APIs & External Services

**AI & Computer Vision (Optional):**
- **Groq Cloud API** - High-speed multi-modal vision and LLM text completion used for receipt analysis and smart expense classification:
  - Client: `httpx.Client` (`backend/app/services/groq_vision.py`)
  - Model: `qwen/qwen3.8-27b`
  - Authentication: `GROQ_API_KEY` and fallback `GROQ_API_KEY_FALLBACK` from `backend/.env`
  - Endpoint: `https://api.groq.com/openai/v1/chat/completions`
  - Resilience: Dual-account API key fallback; automatic fallback to local rule-based parsing and local Tesseract OCR on network failure or missing keys.

**Local OCR Engine (Offline):**
- **Tesseract OCR Engine** - System command-line utility used for zero-cost optical character recognition without external network calls:
  - Binary: `tesseract` accessed via Python `subprocess.run` with streaming stdin/stdout (`backend/app/services/ocr.py`).
  - Fallback: Graceful degradation to manual text input when binary is not installed in system PATH.

## Data Storage

**Databases:**
- **SQLite (Primary Relational Storage):**
  - Driver/Client: SQLite3 via SQLAlchemy 2.0 ORM (`backend/app/db/session.py`)
  - Connection: `sqlite:///backend/data/moneytrack.db` (configurable via `DATABASE_URL` in `backend/.env`)
  - Pragmas & Safety: Foreign keys enabled (`PRAGMA foreign_keys=ON`), WAL journal mode (`PRAGMA journal_mode=WAL`), busy timeout set to 5000ms.
  - Backup: On-disk copy stored at `backend/data/moneytrack.db.backup`.

**File Storage:**
- **Local Filesystem Only:**
  - Database files stored under `backend/data/`.
  - In-memory processing for receipt image uploads (no raw receipt images are permanently stored on disk, preserving user privacy).
  - Client-side browser download for exported CSV and JSON backup files (`/api/export/expenses.csv`, `/api/export/backup.json`).

**Caching:**
- **In-Memory & HTTP Caching:**
  - Backend LRU caches for configuration (`@lru_cache` on `get_settings()`).
  - HTTP cache headers: Immutable long-term cache for hashed frontend static assets (`/assets/*`), `no-cache` for HTML/SPA documents and `/sw.js` service worker.

## Authentication & Identity

**Auth Provider:**
- **Local / Single-User (No Public Auth):**
  - MoneyTrack is architected as a local-first, private personal finance tool.
  - There is currently no multi-tenant authentication or login barrier.
  - Security warning: The API is meant for localhost or trusted LAN connections (e.g. personal Wi-Fi for phone access). It must not be exposed to the public internet without an upstream reverse proxy and authentication layer.

## Mobile Native Bridge

**Android SMS Integration:**
- **Capacitor Custom Plugin (`SmsPlugin`):**
  - Native code in `android/app/src/main/java/com/moneytrack/app/sms/`
  - Interface: `frontend/src/services/sms.ts`
  - Capabilities: Reads transaction debit SMS messages from Indian banks (SBI, HDFC, ICICI, Axis, PNB, etc.), stages pending transactions locally, and allows 1-click confirmation into MoneyTrack expenses via `SmsReviewPage.tsx`.

## Monitoring & Observability

**Error Tracking:**
- **Structured HTTP Responses & Local Logging:**
  - Standardized domain exceptions (`NotFoundError` -> 404, `ConflictError` -> 409, `PeriodError` -> 400, `OCRUnavailableError` -> 503) handled by FastAPI exception handlers (`backend/app/main.py`).
  - Frontend error notifications via `ToastProvider` and boundary fallbacks via `ErrorBoundary`.

**Health Check:**
- Route: `GET /api/health` (`backend/app/api/routes/health.py`)
- Returns database connectivity status, application name, version, and environment.

## CI/CD & Deployment

**Hosting:**
- **Local Self-Hosted:**
  - Single-port execution using `start-prod.ps1` (`http://localhost:8000`).
  - Local development using `start-dev.ps1` (Vite dev server at `5173`, FastAPI backend at `8000`).
- **Mobile Distribution:**
  - Android debug/release APK built via Gradle (`./gradlew assembleDebug`).

## Environment Configuration

**Required Environment Variables:**
- `DATABASE_URL` (optional, defaults to local SQLite file path).
- `CORS_ORIGINS` (optional, defaults to `http://localhost:5173,http://127.0.0.1:5173`).
- `GROQ_API_KEY` (optional, only needed for cloud AI receipt parsing).

**Secrets Location:**
- `backend/.env` (excluded from git tracking via `.gitignore`).
- Production secrets must never be committed to repository history.

## Webhooks & Callbacks

**Incoming:**
- None (pull/polling and direct user request architecture).

**Outgoing:**
- None (zero tracking, zero analytics, zero external webhooks).

---

*Integration audit: 2026-10-28*
