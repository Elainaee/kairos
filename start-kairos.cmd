@echo off
setlocal
cd /d "%~dp0"

if exist "%~dp0node_modules\.bin\electron.cmd" (
  call "%~dp0node_modules\.bin\electron.cmd" .
) else if exist "%~dp0node_modules\electron\dist\electron.exe" (
  "%~dp0node_modules\electron\dist\electron.exe" .
) else (
  echo Electron was not found. Run npm install or pnpm install first.
  exit /b 1
)
