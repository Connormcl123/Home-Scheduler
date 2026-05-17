param(
  [string]$MagicMirrorPath = "$HOME\MagicMirror"
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

New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item -Path (Join-Path $source "*") -Destination $target -Recurse -Force

if (-not (Test-Path -LiteralPath $configTarget)) {
  Copy-Item -Path $configSource -Destination $configTarget
  Write-Host "Created $configTarget"
} else {
  Write-Host "Config already exists. Add MMM-HomeScheduler to $configTarget if needed."
}

Write-Host "Installed MMM-HomeScheduler to $target"
