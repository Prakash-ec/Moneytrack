# Technology Stack

**Analysis Date:** 2026-10-28

## Languages

**Primary:**
- **TypeScript** ~5.7.2 - Frontend SPA logic, React components, hooks, utilities, and API client (`frontend/src/`)
- **Python** 3.11+ - Backend REST API, database models, business logic, analytics, and receipt/SMS processing (`backend/app/`)

**Secondary:**
- **Kotlin** 1.9+ / Java - Android native bridge, SMS broadcast receiver, background sync workers (`android/app/src/main/`)
- **SQL** - SQLite DDL, migrations, indexes, constraints (`backend/app/models/`, `backend/alembic/`)
- **HTML / CSS** - PWA shell, Tailwind CSS utilities, SVG icons (`frontend/index.html`, `frontend/src/index.css`)

## Runtime

**Environment:**
- **Node.js** v20+ / v22+ - Frontend build tooling, package management, and developer server
- **Python Virtualenv** (`backend/.venv`) - Python 3.11+ runtime
- **Android Runtime (ART)** - Android 8.0+ (API level 26+) for mobile hybrid app

**Package Managers:**
- **npm** (Node) - Lockfile present (`frontend/package-lock.json`)
- **pip** (Python) - Manifest present (`backend/requirements.txt`)
- **Gradle** 8.14.3 (Android) - Wrapper present (`android/gradle/wrapper/gradle-wrapper.properties`)

## Frameworks

**Core:**
- **FastAPI** 0.115.6 - Backend asynchronous REST API framework (`backend/app/main.py`)
- **Uvicorn** 0.34.0 (Standard) - ASGI web server for FastAPI
- **SQLAlchemy** 2.0.36 - ORM, mapped columns, SQL expressions, and relational schema modeling (`backend/app/db/session.py`, `backend/app/models/`)
- **React** 18.3.1 - Frontend reactive UI library with functional components and hooks (`frontend/src/App.tsx`)
- **React Router** 7.18.4 - Client-side SPA routing (`frontend/src/App.tsx`)
- **Capacitor** 8.5.3 (`@capacitor/core`, `@capacitor/android`, `@capacitor/cli`) - Native Android container and plugin bridge (`frontend/capacitor.config.ts`, `android/`)

**Validation & Forms:**
- **Pydantic** 2.10.4 & **pydantic-settings** 2.7.0 - Backend payload validation, domain schemas, settings management (`backend/app/schemas/`, `backend/app/core/config.py`)
- **Zod** 3.24.1 & **React Hook Form** 7.54.2 - Frontend form schema validation and state management (`frontend/src/components/ExpenseForm.tsx`)

**Styling & UI:**
- **Tailwind CSS** 3.4.17 & **PostCSS** 8.4.49 - Utility-first CSS styling (`frontend/tailwind.config.js`)
- **Lucide React** 0.469.0 - SVG icon library (`frontend/src/components/ui/`)
- **Recharts** 2.15.0 - Responsive financial data visualization (`frontend/src/components/charts/`)

**Testing:**
- **pytest** 8.3.4 & **httpx** 0.28.1 - Backend unit, integration, and API testing (`backend/tests/`)
- **Vitest** 5.0.5 - Frontend unit testing (`frontend/src/utils/*.test.ts`)
- **JUnit 4** & Kotlin Test - Android native SMS parsing unit tests (`android/app/src/test/`)

**Build / Dev Tools:**
- **Vite** 6.4.5 - Frontend bundle compiler and HMR development server (`frontend/vite.config.ts`)
- **TypeScript Compiler** (`tsc`) ~5.7.2 - Static type checking (`frontend/tsconfig.json`)
- **Alembic** 1.14.0 - Database schema migrations (`backend/alembic.ini`)

## Key Dependencies

**Critical:**
- `fastapi` & `uvicorn`: Serves both REST endpoints (`/api/*`) and production static SPA bundle (`frontend/dist/`) through a single process.
- `sqlalchemy`: Handles SQLite transactions, foreign keys, indexes, and aggregate math in integer paise.
- `python-multipart`: Enables multipart form handling for receipt image uploads (`POST /api/receipts/parse`).
- `tzdata`: Provides accurate `Asia/Kolkata` time zone conversions for Indian financial periods (`backend/app/core/time.py`).
- `recharts`: Drives trend graphs, breakdown area charts, and expense type donut charts.

**Optional / AI Integration:**
- `tesseract` (CLI binary): Local OCR fallback for zero-cost optical character recognition without external network calls (`backend/app/services/ocr.py`).
- `httpx`: Used by `backend/app/services/groq_vision.py` for cloud-based multi-modal receipt extraction and expense classification via Groq AI (`qwen/qwen3.8-27b`).

## Configuration

**Environment Variables:**
- Backend configuration is managed via `backend/app/core/config.py` backed by `backend/.env` (using `.env.example` as a template):
  - `DATABASE_URL`: Defaults to `sqlite:///D:/MoneyTrack/backend/data/moneytrack.db`.
  - `CORS_ORIGINS`: Comma-separated list of allowed origins (e.g., `http://localhost:5173`, `http://127.0.0.1:5173`).
  - `SERVE_FRONTEND`: Boolean (`True`/`False`) whether FastAPI serves `frontend/dist/`.
  - `GROQ_API_KEY`: Optional Groq API key for vision/LLM receipt parsing.
  - `GROQ_API_KEY_FALLBACK`: Optional secondary Groq key for rate-limit failover.
  - `GROQ_MODEL`: Model ID (default `qwen/qwen3.8-27b`).
  - `GROQ_REQUEST_TIMEOUT`: Seconds for Groq requests (default `20.0`).
- Frontend environment configuration is read by Vite:
  - `VITE_PROXY_TARGET`: Backend URL for development proxy (default `http://127.0.0.1:8000`).

**Build & Compiler Configurations:**
- `frontend/tsconfig.json`: TypeScript configuration with path alias `@/* -> src/*`.
- `frontend/vite.config.ts`: Multi-vendor chunk splitting (`charts`, `icons`, `router`, `forms`, `vendor`) and reverse proxy configuration for `/api`.
- `backend/pytest.ini`: Configures test discovery in `backend/tests/`.

## Platform Requirements

**Development:**
- Windows 10/11 (or macOS / Linux).
- Python 3.11+ with venv at `backend/.venv`.
- Node.js 20+ and npm 10+.
- Optional: Tesseract OCR (`winget install UB-Mannheim.TesseractOCR`) in system PATH for local OCR.
- Optional: Android Studio Ladybug/Meerkat + Android SDK 34+ for Android native builds.

**Production:**
- Standalone local server via `start-prod.ps1`:
  - Builds frontend into `frontend/dist`.
  - Serves API and PWA assets together over `http://localhost:8000` via Uvicorn.
- Mobile PWA or native APK/AAB compiled via `./gradlew assembleDebug` in `android/`.

---

*Stack analysis: 2026-10-28*
