$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$candidateNodes = @(
  "node",
  "$env:ProgramFiles\nodejs\node.exe",
  "${env:ProgramFiles(x86)}\nodejs\node.exe",
  "$env:LOCALAPPDATA\Programs\nodejs\node.exe",
  "$env:LOCALAPPDATA\OpenAI\Codex\bin\node.exe"
)

$nodePath = $null

foreach ($candidate in $candidateNodes) {
  if (-not $candidate) {
    continue
  }

  try {
    $command = Get-Command $candidate -ErrorAction Stop
    $nodePath = $command.Source
    break
  } catch {
    if (Test-Path -LiteralPath $candidate) {
      $nodePath = $candidate
      break
    }
  }
}

if (-not $nodePath) {
  Write-Host "Node.js was not found on this machine."
  Write-Host "Quick fallback: open index.html directly in Chrome or Edge."
  Write-Host "Recommended: install Node.js LTS from https://nodejs.org, then run this script again."
  exit 1
}

Set-Location -LiteralPath $projectRoot
Write-Host "Starting Home Mirror with $nodePath"
& $nodePath .\server.js
