# MoneyTrack on Windows

This guide covers installation, local and phone access, configuration, backups, and common fixes.

## 1. Install the prerequisites

Install:

- Node.js 20 or newer from <https://nodejs.org/>. Node.js 22 LTS is recommended. Keep npm selected during installation.
- Python 3.11, 3.12, or 3.13 from <https://www.python.org/downloads/windows/>. Select **Add python.exe to PATH** during installation.

Close and reopen PowerShell after installing either runtime, then verify:

```powershell
node --version
npm --version
py --version
```

If `py --version` fails but `python --version` works, the launcher can still use `python`. Python 3.14 is not supported by the current dependency set.

## 2. Allow local PowerShell scripts

Open PowerShell in the `MoneyTrack` folder. Try:

```powershell
.\start-dev.ps1
```

If the system blocks scripts, use a per-session policy:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\start-dev.ps1
```

This does not change the computer-wide policy. If you prefer not to change policy at all:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\start-dev.ps1
```

## 3. First development run

What the launcher does:

1. Checks Node.js, npm, Python, and port availability.
2. Creates `backend/.venv` with a supported Python version when needed.
3. Installs backend Python requirements.
4. Runs `alembic upgrade head` to create or update the SQLite schema.
5. Installs frontend npm dependencies when needed.
6. Opens two PowerShell windows, one for the FastAPI API and one for Vite.
7. Waits for both servers and opens the app.

Default addresses:

| Service | Address |
| --- | --- |
| App | http://localhost:5173 |
| API health | http://127.0.0.1:8000/api/health |
| Interactive API docs | http://127.0.0.1:8000/docs |
| LAN app URL | Printed by the launcher, on port `5173` |

The database file is created at `backend/data/moneytrack.db`. The first screen guides you to create an expense type and record an expense.

Stop both terminal windows when finished. Closing only the browser does not stop the servers.

### Use different ports

```powershell
.\start-dev.ps1 -BackendPort 8010 -FrontendPort 5180
```

The backend and frontend ports must be different. The Vite proxy is configured automatically to use the selected backend port.

### Skip dependency installation

```powershell
.\start-dev.ps1 -SkipInstall
```

This skips `npm install`. Backend setup, migration checks, and server startup still run.

## 4. Everyday production run

For a single local URL:

```powershell
.\start-prod.ps1
```

Open http://localhost:8000. FastAPI serves both `/api` and the built React app.

```powershell
.\start-prod.ps1 -Port 8080
.\start-prod.ps1 -Rebuild
.\start-prod.ps1 -SkipInstall
```

- The script builds `frontend/dist` when it does not exist.
- It does not automatically rebuild an existing `dist` folder. Pass `-Rebuild` after changing frontend code.
- `-SkipInstall` avoids `npm install` when a build is required and dependencies already exist.
- Ctrl+C in the launcher window stops the production server.

The production server binds only to `127.0.0.1` unless `-Lan` is used.

## 5. Access from a phone

Both devices must be connected to the same trusted Wi-Fi network.

### Development mode

1. Run `.\start-dev.ps1`.
2. Use the **Phone / Wi-Fi** URL printed by the launcher. It usually looks like `http://192.168.1.20:5173`.
3. If Windows Firewall prompts, allow Node.js on **Private networks** only.
4. The API stays on `127.0.0.1`; Vite proxies `/api` requests from the phone to the backend.

### Production mode

1. Run `.\start-prod.ps1 -Lan`.
2. Open the printed **LAN / phone** URL on port `8000`, for example `http://192.168.1.20:8000`.
3. Allow Python through Windows Firewall on **Private networks** if prompted.

`-Lan` exposes the app and API without authentication. Never use it on public Wi-Fi, and never forward the port from your router.

### PWA and offline limits

Full PWA installation and service-worker offline behavior require a secure context: HTTPS or `localhost`.

- On the computer, open `http://localhost:8000` in Chrome or Edge and use the install icon.
- On a phone using plain `http://<PC-IP>:8000`, the browser may add a home-screen shortcut but will not enable the full offline service worker.
- MoneyTrack does not cache API responses or financial data. The interface shell can open offline, but viewing or saving records requires the API.
- After installing on `localhost`, the interface can load offline after at least one production visit.

Do not configure a self-signed certificate on the phone unless you are comfortable managing certificate trust. For a permanent phone PWA, use a trusted HTTPS reverse proxy on a private network.

## 6. Configuration

The backend reads optional settings from `backend/.env`. Start with the example:

```powershell
Copy-Item backend\.env.example backend\.env
```

Common values:

```dotenv
DATABASE_URL=sqlite:///D:/MoneyTrack/backend/data/moneytrack.db
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
SERVE_FRONTEND=true
```

Notes:

- Use forward slashes in SQLite URLs.
- `CORS_ORIGINS` is only needed for direct cross-origin browser calls. The Vite proxy and production same-origin setup do not need changes.
- `SERVE_FRONTEND=false` disables static frontend serving in FastAPI.
- Frontend overrides are documented in `frontend/.env.example`. Normally you should leave the API base URL unset so `/api` remains same-origin.

Do not commit `.env` files. They are already ignored by Git.

## 7. Data, backups, and resets

The database is `backend/data/moneytrack.db`.

### Export

Open **Settings → Export your data**:

- **CSV** contains rows for spreadsheet use.
- **JSON** contains expense types and all expenses, preserving paise amounts.

### File backup

Stop MoneyTrack, copy `backend/data/moneytrack.db` somewhere safe, then restart. If SQLite journals exist, copy the whole `backend/data` folder while the server is stopped.

### Migrations

Both launchers run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m alembic upgrade head
```

Run this manually after updating the app, or when starting the API yourself.

### Reset everything

Stop the app, then remove the database and restart:

```powershell
Remove-Item backend\data\moneytrack.db
.\start-dev.ps1
```

The new database is migrated automatically and starts empty. This cannot be undone; export a backup first.

## 8. Common problems

### "running scripts is disabled on this system"

Use the per-session policy or `-ExecutionPolicy Bypass` command in section 2.

### A launcher says a port is already in use

Find the process using the port:

```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen
```

Stop the old MoneyTrack window, or choose another port with `-Port`, `-BackendPort`, or `-FrontendPort`.

### Backend virtual environment cannot be created

- Confirm Python 3.11–3.13 is installed: `py -0p`.
- Delete `backend/.venv`, install a supported Python version, and rerun the launcher.
- Do not reuse a virtual environment copied from another computer.

### `npm install` or the frontend build fails

```powershell
cd frontend
node --version
npm install
npm run build
```

If the lockfile or modules are damaged, stop the app, remove `frontend/node_modules`, and run `npm install` again.

### Phone cannot open the URL

- Confirm both devices are on the same Wi-Fi network.
- Use the computer's current IPv4 address, not a hostname.
- Allow the relevant runtime through Windows Firewall for private networks.
- Some routers isolate wireless clients; disable guest/AP isolation for this network.
- Do not use this setup on public Wi-Fi.

### Browser shows an old version after an update

Production builds use a service worker.

1. Close all MoneyTrack tabs.
2. Reopen the app.
3. If it still looks stale, open browser DevTools → Application → Storage → Clear site data, then reload.
4. In Chrome or Edge, **Application → Service Workers → Update** can force a check.

### Charts or records do not load

The interface can remain available while the API is down. Check:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health
```

If the backend terminal shows an error, stop both servers and restart the launcher. Use **Settings → System status** to confirm the database connection.

### Saving an expense says its type is unavailable

Archived expense types stay in history but cannot be used for new expenses. Restore the type from **Expense types → Archived**, or choose an active type.

## 9. Verification commands

From the project root:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest

cd ..\frontend
npm run typecheck
npm test
npm run build
```

Expected current results:

- Backend: 29 passed
- Frontend: 13 passed
- TypeScript and production build: successful

The frontend production dependency audit reports zero vulnerabilities. Development-only findings in the Tailwind build chain do not affect the served application.

## 10. Manual development commands

Start the backend:

```powershell
cd backend
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Start the frontend in a second terminal:

```powershell
cd frontend
npm run dev
```

Start the frontend with a non-default API port:

```powershell
$env:VITE_PROXY_TARGET = "http://127.0.0.1:8010"
npm run dev
```

## 11. Security reminder

MoneyTrack is a local-first tool without accounts or access control.

- Keep the API private.
- Use only trusted networks.
- Back up exports.
- Never expose the app to the public internet without adding authentication and HTTPS.
