# MoneyTrack — Deployment & Hosting Guide

This guide explains how to host the MoneyTrack FastAPI backend and connect it to the MoneyTrack Android application or web frontend.

---

## Architecture Overview

```
┌─────────────────────────────────┐
│     MoneyTrack Android App      │
│  (Capacitor + React 18 + Vite)  │
│      [On-Device SMS Parser]     │
└───────────────┬─────────────────┘
                │ HTTP / HTTPS JSON API
                ▼
┌─────────────────────────────────┐
│        FastAPI Backend          │
│    (Uvicorn + SQLAlchemy 2.0)   │
└───────────────┬─────────────────┘
                │ Direct File Access
                ▼
┌─────────────────────────────────┐
│      SQLite Database File       │
│   (backend/data/moneytrack.db)  │
└─────────────────────────────────┘
```

MoneyTrack uses **local-first** storage. All amounts are stored as integer paise (1 INR = 100 paise) to prevent floating-point rounding errors.

---

## 1. Local Testing with Android Device

### Option A: USB Cable via ADB Reverse (Recommended)
This is the fastest, zero-configuration method to connect a physical phone or emulator to your development machine.

1. Connect your Android phone via USB cable and enable **USB Debugging** in Developer Options.
2. Verify device connection:
   ```bash
   adb devices
   ```
3. Forward the backend port from the phone to your computer:
   ```bash
   adb reverse tcp:8000 tcp:8000
   ```
4. Start the backend:
   ```powershell
   .\start-dev.ps1
   # or manually:
   cd backend
   .\.venv\Scripts\Activate.ps1
   python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```
5. In the MoneyTrack Android app, open **Settings**:
   - Tap the preset **USB: http://127.0.0.1:8000/api**
   - Tap **Test Connection** (should display "Connected: MoneyTrack API v1.0.0")
   - Tap **Save URL**

### Option B: Local Wi-Fi Network (LAN IP)
If testing without a USB cable:

1. Ensure your computer and Android phone are connected to the same Wi-Fi router.
2. Find your computer's local IPv4 address:
   - Windows: `ipconfig` (e.g., `192.168.1.45`)
   - Mac/Linux: `ifconfig` or `ip a`
3. Start the backend bound to all network interfaces:
   ```bash
   python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```
4. Ensure Windows Firewall allows incoming connections on port 8000 for Private Networks.
5. In the MoneyTrack Android app, open **Settings**:
   - Enter `http://192.168.1.45:8000/api`
   - Tap **Test Connection**
   - Tap **Save URL**

---

## 2. Docker Deployment

A production-ready [Dockerfile](file:///D:/MoneyTrack/backend/Dockerfile) is included in `backend/Dockerfile`.

### Build and Run with Docker
```bash
cd D:\MoneyTrack\backend

# Build the container image
docker build -t moneytrack-backend:latest .

# Run with a persistent volume for the SQLite database
docker run -d \
  --name moneytrack \
  -p 8000:8000 \
  -v moneytrack_data:/app/data \
  -e CORS_ORIGINS="*" \
  --restart unless-stopped \
  moneytrack-backend:latest
```

### Health Check
```bash
curl http://localhost:8000/health
# Expected: {"status":"ok","database":"connected","version":"1.0.0"}
```

---

## 3. Cloud Deployment (Render.com)

A [render.yaml](file:///D:/MoneyTrack/render.yaml) blueprint is provided in the repository root for one-click setup.

1. Push your repository to GitHub.
2. Sign in to [Render](https://render.com) and click **New > Blueprint**.
3. Select your repository. Render automatically reads `render.yaml`:
   - Sets runtime to **Python 3.11**
   - Configures build command: `cd backend && pip install -r requirements.txt`
   - Configures start command: `cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - Attaches a **1 GB Persistent Disk** mounted at `/app/backend/data` so your SQLite records survive restarts.
4. Once deployed, Render provides an HTTPS URL: `https://your-app-name.onrender.com`.
5. In the MoneyTrack Android app Settings, enter:
   `https://your-app-name.onrender.com/api`
   Tap **Test Connection** to confirm connectivity.

---

## 4. VPS Deployment (Ubuntu / Debian + Caddy)

For running on a Virtual Private Server (DigitalOcean, Hetzner, Linode, AWS EC2):

### 1. Install Dependencies
```bash
sudo apt update && sudo apt install -y python3-pip python3-venv tesseract-ocr tesseract-ocr-eng caddy
```

### 2. Set Up Application Directory
```bash
sudo mkdir -p /var/www/moneytrack
sudo chown -R $USER:$USER /var/www/moneytrack
git clone <your-repo> /var/www/moneytrack
cd /var/www/moneytrack/backend

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
mkdir -p data
```

### 3. Systemd Service (`/etc/systemd/system/moneytrack.service`)
```ini
[Unit]
Description=MoneyTrack FastAPI Backend
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/var/www/moneytrack/backend
Environment="PATH=/var/www/moneytrack/backend/.venv/bin"
Environment="PORT=8000"
Environment="CORS_ORIGINS=*"
Environment="DATABASE_URL=sqlite:////var/www/moneytrack/backend/data/moneytrack.db"
ExecStart=/var/www/moneytrack/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now moneytrack
```

### 4. Caddy Reverse Proxy (`/etc/caddy/Caddyfile`)
Caddy automatically provisions free SSL/TLS certificates via Let's Encrypt:
```caddy
api.yourdomain.com {
    reverse_proxy 127.0.0.1:8000
}
```
Reload Caddy:
```bash
sudo systemctl reload caddy
```

Point your Android app to: `https://api.yourdomain.com/api`.

---

## 5. Security & Maintenance Checklist

- [x] **Automated Backups**: Periodically download a full JSON backup from **Settings > Full JSON backup** or copy `moneytrack.db`.
- [x] **Safe Restorations**: The backend restore endpoint operates in a single ACID transaction with duplicate skipping and foreign key remapping.
- [x] **CORS Configuration**: Restrict `CORS_ORIGINS` to trusted domains if exposing to the public internet without an authentication proxy.
- [x] **Camera & OCR**: Mobile browser camera streaming requires HTTPS or `localhost`. The native Android app utilizes device camera intents directly without browser restrictions.
