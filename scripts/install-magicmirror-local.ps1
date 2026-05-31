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
$photoDir = Join-Path $MagicMirrorPath "photos"
$backgroundPhotoDir = Join-Path $photoDir "default-backgrounds"
$thirdPartyModules = @(
  @{ Name = "MMM-GooglePhotos"; Repo = "https://github.com/hermanho/MMM-GooglePhotos.git" },
  @{ Name = "MMM-Remote-Control"; Repo = "https://github.com/Jopyth/MMM-Remote-Control.git" },
  @{ Name = "MMM-Random-local-image"; Repo = "https://github.com/miccl/MMM-Random-local-image.git" }
)

if (-not (Test-Path -LiteralPath $MagicMirrorPath)) {
  throw "MagicMirror was not found at $MagicMirrorPath. Clone https://github.com/MagicMirrorOrg/MagicMirror.git first."
}

if (Test-Path -LiteralPath $target) {
  Remove-Item -LiteralPath $target -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item -Path (Join-Path $source "*") -Destination $target -Recurse -Force
New-Item -ItemType Directory -Force -Path $photoDir | Out-Null
New-Item -ItemType Directory -Force -Path $backgroundPhotoDir | Out-Null

foreach ($module in $thirdPartyModules) {
  $modulePath = Join-Path $MagicMirrorPath "modules\$($module.Name)"

  if (Test-Path -LiteralPath (Join-Path $modulePath ".git")) {
    Write-Host "Updating $($module.Name)"
    git -C $modulePath pull --ff-only
    if ($LASTEXITCODE -ne 0) {
      Write-Host "Update failed for $($module.Name). Removing and recloning."
      Remove-Item -LiteralPath $modulePath -Recurse -Force
      git clone --recurse-submodules $module.Repo $modulePath
    }
  } else {
    Write-Host "Installing $($module.Name)"
    if (Test-Path -LiteralPath $modulePath) {
      Remove-Item -LiteralPath $modulePath -Recurse -Force
    }
    git clone --recurse-submodules $module.Repo $modulePath
  }

  if (Test-Path -LiteralPath (Join-Path $modulePath "package-lock.json")) {
    npm --prefix $modulePath ci
  } elseif (Test-Path -LiteralPath (Join-Path $modulePath "package.json")) {
    npm --prefix $modulePath install
  }
}

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
