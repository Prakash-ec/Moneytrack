# MoneyTrack — Personal Expenditure Management

MoneyTrack is a private, local-first personal expenditure tracker. It records what you spend, organises expenses into reusable types, and turns your records into period summaries, category breakdowns, and spending trends.

Available as a web application and a native **Android application** with on-device SMS transaction detection and camera receipt scanning.

---

## Highlights

- **Overview Dashboard**: Period comparison, category split, daily movement, and recent expenses.
- **Android Native App**: Built with Capacitor 8, Kotlin, and React 18. Deliverable APK provided at `release/MoneyTrack.apk`.
- **On-Device SMS Transaction Detection**: Parses bank and UPI debit alerts locally on your phone. OTPs, credits, personal chats, and spam are strictly ignored.
- **Camera Receipt Scanner**: Extract expenses from physical receipts and bills using local Tesseract OCR with zero cloud costs.
- **Offline-First Resilience**: Create expenses anytime while offline; changes queue locally with idempotency keys and synchronize automatically when reconnected.
- **Configurable Backend Connection**: Easily switch between local USB (`adb reverse`), Wi-Fi LAN IP, or cloud hosting with live connection testing.
- **Exact Currency Handling**: All monetary amounts are stored in integer paise (1 INR = 100 paise) to avoid floating-point errors.
- **Data Privacy & Portability**: 100% local SQLite storage. Full JSON backups and CSV exports with safe, transactional restoration.

---

## Project Structure

```text
MoneyTrack/
├── android/                 Native Android Capacitor project (Kotlin + Gradle)
├── backend/                 FastAPI application, SQLite database, and Alembic migrations
│   ├── app/                 Routes, models, schemas, services, receipt parsers
│   ├── data/                Local SQLite database (moneytrack.db)
│   ├── Dockerfile           Production Docker container configuration
│   └── tests/               133 pytest tests
├── frontend/                React 18 + TypeScript + Tailwind CSS application
│   ├── src/                 Components, pages, offline queue, hooks, API client
│   └── dist/                Optimized production web build
├── release/
│   └── MoneyTrack.apk       Pre-compiled debug Android package (5.16 MB)
├── DEPLOYMENT.md            Cloud & local server deployment guide
├── PRIVACY.md               On-device data handling & security policy
├── start-dev.ps1            Local development launcher
└── start-prod.ps1           Production local launcher
```

---

## Quick Start

### 1. Launching the Backend and Web Interface

From PowerShell in the project directory:

```powershell
.\start-dev.ps1
```

The launcher initializes the Python virtual environment (`backend/.venv`), installs dependencies, runs database migrations, and opens:
- **Web App**: http://localhost:5173
- **API Health**: http://127.0.0.1:8000/api/health
- **Swagger Docs**: http://127.0.0.1:8000/docs

To run in single-port production mode:
```powershell
.\start-prod.ps1
```
Open http://localhost:8000.

---

## Android Mobile Application

The compiled Android application is available at:
`D:\MoneyTrack\release\MoneyTrack.apk` (and `android/app/build/outputs/apk/debug/app-debug.apk`).

### Installing on Device / Emulator

Using Android Debug Bridge (`adb`):
```bash
adb install -r release/MoneyTrack.apk
```

### Connecting the Android App to your Local Backend

Android devices treat `127.0.0.1` as the phone itself. To connect the phone to your laptop's backend:

**Option 1: Over USB Cable (Fastest)**
```bash
adb reverse tcp:8000 tcp:8000
```
Then in the MoneyTrack app:
1. Open **Settings**.
2. Tap the preset **USB: http://127.0.0.1:8000/api**.
3. Tap **Test Connection** (returns "Connected: MoneyTrack API v1.0.0").
4. Tap **Save URL**.

**Option 2: Over Local Wi-Fi**
1. Ensure phone and computer are on the same Wi-Fi.
2. Find your computer's IP address (e.g. `192.168.1.50`).
3. Start backend: `python -m uvicorn app.main:app --host 0.0.0.0 --port 8000`.
4. In app Settings, enter `http://192.168.1.50:8000/api` and tap **Save URL**.

---

## On-Device SMS Auto-Detection

The MoneyTrack Android app monitors incoming SMS messages to automatically log your bank debits:

1. In the app, navigate to **Settings > SMS Transaction Detection**.
2. Tap **Grant Permission** to approve Android `RECEIVE_SMS` and `READ_SMS` permissions.
3. Toggle **Auto-detect Debit SMS** on.
4. When a bank debit alert arrives:
   - A local notification is displayed.
   - The transaction is parsed directly on your phone and placed in **SMS Sync** (`/sms-review`).
   - You can edit the category, merchant, or amount before confirming, or dismiss it permanently.
   - Raw SMS text is never stored in financial records or transmitted to any server.

---

## Offline-First Functionality

- If you create an expense while offline or disconnected from the backend, MoneyTrack saves the transaction in an offline queue with a client UUID idempotency key.
- A status badge in the header shows when items are pending synchronization.
- As soon as the backend is reachable, queued items automatically flush and sync without duplicates.

---

## Testing & Quality Assurance

All automated test suites are passing:

```powershell
# 1. Backend tests (133 tests)
backend\.venv\Scripts\python -m pytest backend/tests

# 2. Frontend unit tests (37 tests)
npm --prefix frontend run test

# 3. Frontend TypeScript check
npm --prefix frontend run typecheck

# 4. Android unit tests (23 tests)
cmd /c "cd android && gradlew.bat test"

# 5. Production web build
npm --prefix frontend run build
```

---

## Deployment & Hosting

For detailed instructions on Docker containerization, VPS hosting with Caddy, and Render.com cloud deployment, consult [DEPLOYMENT.md](file:///D:/MoneyTrack/DEPLOYMENT.md).

For privacy guarantees and data handling details, see [PRIVACY.md](file:///D:/MoneyTrack/PRIVACY.md).
