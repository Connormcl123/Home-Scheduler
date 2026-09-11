<#
.SYNOPSIS
  Prepare a fresh clone for local development on Windows.

.DESCRIPTION
  Installs dependencies, creates .env from the example if there is none, builds
  the shared types, and seeds a database with sample data so every panel has
  something in it. Safe to re-run: it leaves an existing .env and existing data
  alone.

.EXAMPLE
  .\scripts\setup-dev.ps1
#>
$ErrorActionPreference = "Stop"
$AppDir = Split-Path -Parent $PSScriptRoot
Set-Location $AppDir

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Note($msg) { Write-Host "    $msg" -ForegroundColor DarkGray }

Step "Checking Node"
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Error "Node.js is not installed. Install Node 20 or newer from https://nodejs.org and re-run."
}
$major = [int]((& node -v).TrimStart("v").Split(".")[0])
if ($major -lt 20) {
  Write-Error "Node $major found; this project needs 20 or newer."
}
Note "node $(& node -v), npm $(& npm -v)"

Step "Installing dependencies"
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Write-Error "npm install failed." }

Step "Configuration"
if (Test-Path ".env") {
  Note ".env already present, leaving it alone"
} else {
  Copy-Item ".env.example" ".env"
  Note ".env created from the example. Add ANTHROPIC_API_KEY and your ICAL_FEED_URLS to it."
}

Step "Building shared types"
npm run build -w shared | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Error "Could not build shared types." }

Step "Database"
npm run db:init | Out-Null
# Only fills empty tables, so this never overwrites real data.
npm run db:seed

Write-Host "`nReady. Start the dev server with:  npm run dev" -ForegroundColor Green
Write-Host "Then open http://localhost:5174" -ForegroundColor Green
