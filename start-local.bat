@echo off
setlocal
cd /d "%~dp0"
title Algo Quant - Local

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is required. Install it from https://nodejs.org ^(LTS^) and run this file again.
  echo.
  pause
  exit /b 1
)

node scripts\dev-local.mjs %*
if errorlevel 1 (
  echo.
  echo  Something went wrong. Read the messages above, then press any key to close.
  pause >nul
)
endlocal
