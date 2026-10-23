@echo off
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
if not exist "dist\index.html" (
  echo Please build Luma first. See README.md.
  pause
  exit /b 1
)
start "Luma" "node_modules\electron\dist\electron.exe" .
