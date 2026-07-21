@echo off
setlocal
cd /d "%~dp0"

set "NODE_EXE=node"
where node >nul 2>nul
if errorlevel 1 if exist "D:\nodejs\node.exe" set "NODE_EXE=D:\nodejs\node.exe"

"%NODE_EXE%" "%~dp0scripts\kairos-dev.cjs"
if errorlevel 1 (
  echo.
  echo Run this for details:
  echo   "%NODE_EXE%" "%~dp0scripts\kairos-doctor.cjs"
  echo.
  pause
  exit /b 1
) else (
  exit /b 0
)
