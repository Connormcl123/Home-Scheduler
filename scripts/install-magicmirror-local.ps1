param(
  [string]$MagicMirrorPath = "$HOME\MagicMirror",
  [switch]$ReplaceConfig
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$source = Join-Path $repoRoot "magicmirror\modules\MMM-HomeScheduler"
$target = Join-Path $MagicMirrorPath "modules\MMM-HomeScheduler"
$configSource = Join-Path $repoRoot "magicmirror\config\config.js"
$configTarget = Join-Path $MagicMirrorPath "config\config.js"

if (-not (Test-Path -LiteralPath $MagicMirrorPath)) {
  throw "MagicMirror was not found at $MagicMirrorPath. Clone https://github.com/MagicMirrorOrg/MagicMirror.git first."
}

if (Test-Path -LiteralPath $target) {
  Remove-Item -LiteralPath $target -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item -Path (Join-Path $source "*") -Destination $target -Recurse -Force

if (-not (Test-Path -LiteralPath $configTarget)) {
  Copy-Item -Path $configSource -Destination $configTarget
  Write-Host "Created $configTarget"
} elseif ($ReplaceConfig) {
  $backup = "$configTarget.backup.$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  Copy-Item -Path $configTarget -Destination $backup
  Copy-Item -Path $configSource -Destination $configTarget -Force
  Write-Host "Replaced $configTarget"
  Write-Host "Backup saved at $backup"
} else {
  Write-Host "Config already exists. Add MMM-HomeScheduler to $configTarget if needed."
  Write-Host "To replace it with Home Scheduler's base config, rerun with -ReplaceConfig."
}

Write-Host "Installed MMM-HomeScheduler to $target"
