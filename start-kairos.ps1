$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$electronCmd = Join-Path $PSScriptRoot "node_modules\.bin\electron.cmd"
$electronExe = Join-Path $PSScriptRoot "node_modules\electron\dist\electron.exe"

if (Test-Path $electronCmd) {
  & $electronCmd .
} elseif (Test-Path $electronExe) {
  & $electronExe .
} else {
  Write-Error "Electron was not found. Run npm install or pnpm install first."
  exit 1
}
