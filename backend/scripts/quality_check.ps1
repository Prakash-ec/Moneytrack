<#
.SYNOPSIS
    MoneyTrack Backend Quality Assurance & Verification Suite

.DESCRIPTION
    Non-destructive execution script for backend tests, linting, type-checking,
    security auditing, and database integrity validation.

.PARAMETER Check
    The specific quality check to execute. Options:
    'all', 'lint', 'format', 'format-fix', 'typecheck', 'security', 'audit', 'test', 'coverage', 'db-check', 'alembic'
    Default: 'all'

.EXAMPLE
    .\quality_check.ps1 -Check all
    .\quality_check.ps1 -Check test
    .\quality_check.ps1 -Check lint
#>

[CmdletBinding()]
param (
    [ValidateSet("all", "lint", "format", "format-fix", "typecheck", "security", "audit", "test", "coverage", "db-check", "alembic")]
    [string]$Check = "all"
)

$ErrorActionPreference = "Continue"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Resolve-Path (Join-Path $ScriptDir "..")
$VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Error "Virtual environment Python not found at: $VenvPython. Run 'python -m venv .venv' inside backend first."
    exit 1
}

$RuffExe = Join-Path $BackendDir ".venv\Scripts\ruff.exe"
$MypyExe = Join-Path $BackendDir ".venv\Scripts\mypy.exe"
$BanditExe = Join-Path $BackendDir ".venv\Scripts\bandit.exe"
$PipAuditExe = Join-Path $BackendDir ".venv\Scripts\pip-audit.exe"

$results = [ordered]@{}

function Run-Step {
    param (
        [string]$Name,
        [scriptblock]$Action
    )
    Write-Host "`n========================================================" -ForegroundColor Cyan
    Write-Host "  RUNNING: $Name" -ForegroundColor Cyan
    Write-Host "========================================================" -ForegroundColor Cyan
    try {
        & $Action
        $code = $LASTEXITCODE
        if ($null -eq $code) { $code = 0 }
        if ($code -eq 0) {
            Write-Host ">>> SUCCESS: $Name passed." -ForegroundColor Green
            $results[$Name] = "PASSED"
        } else {
            Write-Host ">>> WARNING/FAILURE: $Name exited with code $code." -ForegroundColor Yellow
            $results[$Name] = "FAILED/WARNING (Code: $code)"
        }
    } catch {
        Write-Host ">>> ERROR: $Name encountered an exception: $_" -ForegroundColor Red
        $results[$Name] = "ERROR"
    }
}

Push-Location $BackendDir

try {
    # 1. RUFF LINT
    if ($Check -in @("all", "lint")) {
        Run-Step "Ruff Linting" {
            & $RuffExe check app tests --config pyproject.toml
        }
    }

    # 2. RUFF FORMAT
    if ($Check -in @("all", "format")) {
        Run-Step "Ruff Format Check" {
            & $RuffExe format --check app tests --config pyproject.toml
        }
    }

    if ($Check -eq "format-fix") {
        Run-Step "Ruff Format & Import Auto-Fix" {
            & $RuffExe check app tests --fix --config pyproject.toml
            & $RuffExe format app tests --config pyproject.toml
        }
    }

    # 3. MYPY
    if ($Check -in @("all", "typecheck")) {
        Run-Step "Mypy Static Type Checking" {
            & $MypyExe --config-file pyproject.toml app
        }
    }

    # 4. BANDIT
    if ($Check -in @("all", "security")) {
        Run-Step "Bandit Security Audit" {
            & $BanditExe -c .bandit -r app
        }
    }

    # 5. PIP-AUDIT
    if ($Check -in @("all", "audit")) {
        Run-Step "pip-audit Vulnerability Scan" {
            & $PipAuditExe -r requirements.txt
        }
    }

    # 6. PYTEST
    if ($Check -in @("all", "test")) {
        Run-Step "Pytest Suite" {
            & $VenvPython -m pytest tests
        }
    }

    # 7. COVERAGE
    if ($Check -in @("all", "coverage")) {
        Run-Step "Pytest Coverage Report" {
            & $VenvPython -m pytest --cov=app --cov-report=term-missing --cov-report=xml
        }
    }

    # 8. DATABASE CHECKS
    if ($Check -in @("all", "db-check")) {
        Run-Step "SQLite Database Integrity & FK Checks" {
            $dbPath = (Join-Path $BackendDir "data\moneytrack.db").Replace('\', '/')
            & $VenvPython -c @"
import sqlite3
con = sqlite3.connect('$dbPath')
cur = con.cursor()
cur.execute('PRAGMA integrity_check;')
res = cur.fetchall()
print('PRAGMA integrity_check:', res)
assert res == [('ok',)], 'Integrity check failed: ' + str(res)
cur.execute('PRAGMA foreign_key_check;')
fk = cur.fetchall()
print('PRAGMA foreign_key_check (empty means 0 violations):', fk)
con.close()
"@
        }
    }

    # 9. ALEMBIC MIGRATION STATUS
    if ($Check -in @("all", "alembic")) {
        Run-Step "Alembic Migration History & Current Head" {
            & $VenvPython -m alembic current
            & $VenvPython -m alembic heads
        }
    }

} finally {
    Pop-Location
}

Write-Host "`n========================================================" -ForegroundColor Magenta
Write-Host "           VERIFICATION SUMMARY REPORT                  " -ForegroundColor Magenta
Write-Host "========================================================" -ForegroundColor Magenta
foreach ($k in $results.Keys) {
    $color = if ($results[$k] -eq "PASSED") { "Green" } else { "Yellow" }
    Write-Host ("{0,-35} : {1}" -f $k, $results[$k]) -ForegroundColor $color
}
Write-Host "========================================================`n" -ForegroundColor Magenta
