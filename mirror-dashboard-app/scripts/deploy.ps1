<#
.SYNOPSIS
  Build on this machine, ship the compiled output to the Pi, restart the service.

.DESCRIPTION
  The Pi never compiles. Running vite and tsc on-device pins all four cores
  while it is also driving the display, which is what destroyed the previous
  board. Everything is built here; only dist output and changed source cross
  the wire.

.EXAMPLE
  .\scripts\deploy.ps1
  .\scripts\deploy.ps1 -PiHost 192.168.1.50 -PiUser connor
  .\scripts\deploy.ps1 -SkipBuild        # ship what is already built
#>
[CmdletBinding()]
param(
  [string]$PiHost = "raspberrypi.local",
  [string]$PiUser = "connor",
  [switch]$SkipBuild,
  [switch]$NoRestart
)

$ErrorActionPreference = "Stop"
$AppDir = Split-Path -Parent $PSScriptRoot
Set-Location $AppDir

$Target = "$PiUser@$PiHost"
$RemoteApp = "~/Home-Scheduler/mirror-dashboard-app"

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Note($msg) { Write-Host "    $msg" -ForegroundColor DarkGray }

Step "Checking the Pi is reachable"
$probe = & ssh -o BatchMode=yes -o ConnectTimeout=10 $Target "echo ok" 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Error "Cannot reach $Target over SSH.`n$probe`nCheck the host is on and your key is authorised."
}
Note "connected to $Target"

if (-not $SkipBuild) {
  Step "Building locally"
  npm run build
  if ($LASTEXITCODE -ne 0) { Write-Error "Build failed - nothing was deployed." }
}

foreach ($d in @("shared\dist", "server\dist", "client\dist")) {
  if (-not (Test-Path $d)) { Write-Error "$d is missing. Run without -SkipBuild." }
}

Step "Updating source on the Pi"
# Source only: package.json changes matter for runtime deps, and the service
# reads scripts/ from the checkout. No build happens there.
$pull = & ssh -o BatchMode=yes $Target "cd $RemoteApp/.. && git pull --ff-only 2>&1 | tail -2"
Note $pull

Step "Shipping compiled output"
# Written to a file and copied, rather than piped straight into ssh: PowerShell
# converts native-command pipelines to text, which corrupts a gzip stream. One
# archive still beats three scp directory walks for round trips.
$archive = Join-Path $env:TEMP "mirror-dist.tar.gz"
& tar -czf $archive shared/dist server/dist client/dist
if ($LASTEXITCODE -ne 0) { Write-Error "Could not create the archive." }

$sizeMb = (Get-Item $archive).Length / 1MB

& scp -o BatchMode=yes -q $archive "${Target}:/tmp/mirror-dist.tar.gz"
if ($LASTEXITCODE -ne 0) { Write-Error "Transfer failed." }

& ssh -o BatchMode=yes $Target "cd $RemoteApp && tar -xzf /tmp/mirror-dist.tar.gz && rm -f /tmp/mirror-dist.tar.gz"
if ($LASTEXITCODE -ne 0) { Write-Error "Extract failed on the Pi." }
Remove-Item $archive -Force -ErrorAction SilentlyContinue
Note ("shared, server and client dist copied ({0:N1} MB)" -f $sizeMb)

Step "Syncing runtime dependencies"
# Only reinstalls when package.json actually changed, so a normal deploy does
# no npm work on the Pi at all.
$deps = & ssh -o BatchMode=yes $Target @"
cd $RemoteApp
if [ package.json -nt node_modules/.install-stamp ] || [ server/package.json -nt node_modules/.install-stamp ] || [ ! -f node_modules/.install-stamp ]; then
  npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1 && touch node_modules/.install-stamp && echo "dependencies updated"
else
  echo "dependencies unchanged"
fi
"@
Note $deps

if (-not $NoRestart) {
  Step "Restarting the dashboard"
  & ssh -o BatchMode=yes $Target "sudo systemctl restart mirror-dashboard" 2>&1 | Out-Null
  Start-Sleep -Seconds 5

  $health = & ssh -o BatchMode=yes $Target "curl -fsS -o /dev/null -w '%{http_code}' http://localhost:4174/api/health || echo down"
  if ($health -eq "200") {
    Note "service healthy"
  } else {
    Write-Warning "Service did not come back (got: $health). Check: ssh $Target 'journalctl -u mirror-dashboard -n 40'"
  }

  Step "Reloading the kiosk"
  # Express serves client/dist from disk, so the browser needs a reload to pick
  # up a new bundle even though the service restart does not require it.
  & ssh -o BatchMode=yes $Target "systemctl --user restart mirror-kiosk" 2>&1 | Out-Null
  Note "browser reloaded"
}

Write-Host "`nDeployed to http://$PiHost`:4174" -ForegroundColor Green
