@echo off
setlocal
cd /d "%~dp0"
title Algo Quant - Stop

where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js is not installed, so nothing can be running.
  pause
  exit /b 1
)

node scripts\dev-local.mjs --stop
echo.
pause
endlocal
