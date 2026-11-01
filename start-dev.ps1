[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)]
    [int]$BackendPort = 8000,

    [ValidateRange(1024, 65535)]
    [int]$FrontendPort = 5173,

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

function ConvertTo-EncodedCommand {
    param([string]$Command)
    return [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Command))
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

function Wait-ForUrl {
    param(
        [string]$Url,
        [int]$Attempts = 40,
        [int]$DelayMilliseconds = 500
    )
    for ($attempt = 0; $attempt -lt $Attempts; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return $true
            }
        }
        catch {
            # The server is still starting.
        }
        Start-Sleep -Milliseconds $DelayMilliseconds
    }
    return $false
}

if ($BackendPort -eq $FrontendPort) {
    Stop-WithMessage "The backend and frontend ports must be different."
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$npmCommand = Get-Command npm -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
    Stop-WithMessage "Node.js is not installed or not on PATH. Install Node.js 22 LTS or newer, then reopen PowerShell."
}
if (-not $npmCommand) {
    Stop-WithMessage "npm is not available on PATH. Reinstall Node.js with npm included."
}

$nodeMajor = [int]((& node --version).TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 20) {
    Stop-WithMessage "Node.js 20 or newer is required. This computer has Node.js $nodeMajor."
}

if ((Test-PortInUse -Port $BackendPort)) {
    Stop-WithMessage "Port $BackendPort is already in use. Stop the other process or run: .\start-dev.ps1 -BackendPort 8010"
}
if ((Test-PortInUse -Port $FrontendPort)) {
    Stop-WithMessage "Port $FrontendPort is already in use. Stop the other process or run: .\start-dev.ps1 -FrontendPort 5180"
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

Push-Location $frontendDir
try {
    $needsInstall = (-not $SkipInstall) -or (-not (Test-Path -LiteralPath "node_modules"))
    if ($needsInstall) {
        Write-Step "Installing frontend dependencies"
        & npm install --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) {
            Stop-WithMessage "npm install failed. Check your internet connection and try again."
        }
    }
}
finally {
    Pop-Location
}

$lanAddress = Get-LanAddress

Write-Step "Starting MoneyTrack development servers"
$backendCommand = "`$Host.UI.RawUI.WindowTitle = 'MoneyTrack API'; & '$python' -m uvicorn app.main:app --reload --host 127.0.0.1 --port $BackendPort"
$frontendCommand = "`$Host.UI.RawUI.WindowTitle = 'MoneyTrack Web'; `$env:VITE_PROXY_TARGET = 'http://127.0.0.1:$BackendPort'; Set-Location -LiteralPath '$frontendDir'; npm run dev -- --port $FrontendPort --strictPort"
$backendEncoded = ConvertTo-EncodedCommand -Command $backendCommand
$frontendEncoded = ConvertTo-EncodedCommand -Command $frontendCommand

$backendProcess = Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoLogo", "-NoExit", "-EncodedCommand", $backendEncoded) -WorkingDirectory $backendDir -PassThru
$frontendProcess = Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoLogo", "-NoExit", "-EncodedCommand", $frontendEncoded) -WorkingDirectory $frontendDir -PassThru

Write-Host "Waiting for the API and web server..."
$apiReady = Wait-ForUrl -Url "http://127.0.0.1:$BackendPort/api/health" -Attempts 50
$webReady = Wait-ForUrl -Url "http://127.0.0.1:$FrontendPort" -Attempts 50

Write-Host ""
Write-Host "MoneyTrack" -ForegroundColor Green
Write-Host "  Local:            http://localhost:$FrontendPort"
if ($lanAddress) {
    Write-Host "  Phone / Wi-Fi:    http://${lanAddress}:$FrontendPort"
}
Write-Host "  API health:       http://127.0.0.1:$BackendPort/api/health"
Write-Host "  API docs:         http://127.0.0.1:$BackendPort/docs"
Write-Host ""

if (-not $apiReady) {
    Write-Host "The API did not respond in time. Check the MoneyTrack API window for errors." -ForegroundColor Yellow
}
if (-not $webReady) {
    Write-Host "The web server did not respond in time. Check the MoneyTrack Web window for errors." -ForegroundColor Yellow
}

if ($lanAddress) {
    Write-Host "For phone access, keep both devices on the same Wi-Fi and allow Node.js through Windows Firewall on private networks." -ForegroundColor DarkGray
}
Write-Host "Two terminal windows were opened. Press Ctrl+C in each window (or close them) to stop MoneyTrack." -ForegroundColor DarkGray
Write-Host "The API deliberately listens only on 127.0.0.1. Vite proxies phone requests to it." -ForegroundColor DarkGray

if ($apiReady -and $webReady) {
    Start-Process "http://localhost:$FrontendPort"
}

exit 0
