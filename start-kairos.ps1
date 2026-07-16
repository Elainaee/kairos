$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$node = (Get-Command node -ErrorAction SilentlyContinue)?.Source
if (-not $node -and (Test-Path "D:\nodejs\node.exe")) {
  $node = "D:\nodejs\node.exe"
}

if (-not $node) {
  Write-Error "Node.js was not found. Install Node.js or add it to PATH, then run this script again."
  exit 1
}

& $node (Join-Path $PSScriptRoot "scripts\kairos-dev.cjs")
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Run this for details:"
  Write-Host "  `"$node`" `"$PSScriptRoot\scripts\kairos-doctor.cjs`""
  exit $LASTEXITCODE
}
