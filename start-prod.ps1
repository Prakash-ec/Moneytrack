[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 8000,

    [switch]$Lan,
    [switch]$Rebuild,
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location $root

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Stop-WithMessage {
    param([string]$Message)
    Write-Host ""
    Write-Host "ERROR: $Message" -ForegroundColor Red
    exit 1
}

function Test-PortInUse {
    param([int]$Port)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $client.Connect("127.0.0.1", $Port)
        return $true
    }
    catch {
        return $false
    }
    finally {
        $client.Dispose()
    }
}

function Get-LanAddress {
    try {
        $configuration = Get-NetIPConfiguration -ErrorAction Stop |
            Where-Object {
                $_.IPv4DefaultGateway -ne $null -and
                $_.NetAdapter.Status -eq "Up"
            } |
            Select-Object -First 1
        if ($configuration -and $configuration.IPv4Address) {
            return ($configuration.IPv4Address | Select-Object -First 1).IPAddress
        }
    }
    catch {
        return $null
    }
    return $null
}

if (Test-PortInUse -Port $Port) {
    Stop-WithMessage "Port $Port is already in use. Stop the other process or choose another port with -Port."
}

$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"
$python = Join-Path $backendDir ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $python)) {
    Write-Step "Creating the Python virtual environment"
    $created = $false
    $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($pyLauncher) {
        foreach ($version in @("3.12", "3.11", "3.13")) {
            & py "-$version" -m venv (Join-Path $backendDir ".venv") 2>$null
            if ($LASTEXITCODE -eq 0) {
                $created = $true
                break
            }
        }
    }
    if (-not $created) {
        $systemPython = Get-Command python -ErrorAction SilentlyContinue
        if (-not $systemPython) {
            Stop-WithMessage "Python 3.11 or newer was not found. Install Python, then run this script again."
        }
        & python -m venv (Join-Path $backendDir ".venv")
        if ($LASTEXITCODE -ne 0) {
            Stop-WithMessage "Could not create backend\.venv. Install Python 3.11+ and try again."
        }
    }
}

& $python -c "import sys; sys.exit(0 if (3, 11) <= sys.version_info[:2] <= (3, 13) else 1)"
if ($LASTEXITCODE -ne 0) {
    Stop-WithMessage "MoneyTrack needs Python 3.11, 3.12, or 3.13. Delete backend\.venv and rerun this script with a supported Python version installed."
}

& $python -c "import fastapi, uvicorn, sqlalchemy, alembic, pydantic_settings" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Step "Installing backend dependencies"
    & $python -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) {
        Stop-WithMessage "Could not upgrade pip."
    }
    & $python -m pip install -r (Join-Path $backendDir "requirements.txt")
    if ($LASTEXITCODE -ne 0) {
        Stop-WithMessage "Could not install backend dependencies."
    }
}

Write-Step "Applying database migrations"
Push-Location $backendDir
try {
    & $python -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) {
        Stop-WithMessage "Database migration failed. Check backend\.env and the database file."
    }
}
finally {
    Pop-Location
}

$distIndex = Join-Path $frontendDir "dist\index.html"
$needsBuild = $Rebuild -or (-not (Test-Path -LiteralPath $distIndex))

if ($needsBuild) {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    $npmCommand = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $nodeCommand -or -not $npmCommand) {
        Stop-WithMessage "Node.js 20+ and npm are required to build the frontend."
    }

    Push-Location $frontendDir
    try {
        $needsInstall = (-not $SkipInstall) -or (-not (Test-Path -LiteralPath "node_modules"))
        if ($needsInstall) {
            Write-Step "Installing frontend dependencies"
            & npm install --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) {
                Stop-WithMessage "npm install failed."
            }
        }
        Write-Step "Building the production frontend"
        & npm run build
        if ($LASTEXITCODE -ne 0) {
            Stop-WithMessage "The frontend build failed. Fix the reported errors and try again."
        }
    }
    finally {
        Pop-Location
    }
}

$lanAddress = Get-LanAddress
if ($Lan) {
    $bindHost = "0.0.0.0"
}
else {
    $bindHost = "127.0.0.1"
}

Write-Host ""
Write-Host "MoneyTrack production server" -ForegroundColor Green
Write-Host "  Local:            http://localhost:$Port"
if ($Lan) {
    if ($lanAddress) {
        Write-Host "  LAN / phone:      http://${lanAddress}:$Port"
    }
    Write-Host ""
    Write-Host "  LAN mode is enabled with no sign-in. Use only a trusted network and never port-forward this server." -ForegroundColor Yellow
}
Write-Host "  API docs:         http://127.0.0.1:$Port/docs"
Write-Host ""
Write-Host "Press Ctrl+C to stop MoneyTrack." -ForegroundColor DarkGray

Push-Location $backendDir
try {
    & $python -m uvicorn app.main:app --host $bindHost --port $Port
}
finally {
    Pop-Location
}
