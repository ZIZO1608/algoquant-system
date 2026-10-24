@echo off
setlocal
cd /d "%~dp0"
title Algo Quant - Reset local data
echo.
echo  This wipes the local database and re-seeds the demo data.
echo  Close any running "Algo Quant - Local" window first.
echo.
set /p CONFIRM=Type YES to continue:
if /i not "%CONFIRM%"=="YES" (
  echo Cancelled.
  pause
  exit /b 0
)
node scripts\dev-local.mjs --reset %*
if errorlevel 1 pause
endlocal
