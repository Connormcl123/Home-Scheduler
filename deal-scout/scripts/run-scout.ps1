# Runs one Deal Scout pass headlessly and logs the output.
# Task Scheduler calls this daily. You can also run it by hand to test:
#   powershell -ExecutionPolicy Bypass -File .\scripts\run-scout.ps1

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$logDir = Join-Path $repo "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir ("scout-" + (Get-Date -Format "yyyy-MM-dd") + ".log")

"=== Deal Scout run $(Get-Date -Format s) ===" | Out-File -FilePath $log -Append -Encoding utf8

# Tool permissions come from .claude/settings.json. Any tool not allowed there is
# refused in print mode, so the run can never hang waiting for a prompt.
& claude -p "/deal-scout" 2>&1 | Out-File -FilePath $log -Append -Encoding utf8

"=== Finished $(Get-Date -Format s) (exit $LASTEXITCODE) ===" | Out-File -FilePath $log -Append -Encoding utf8
