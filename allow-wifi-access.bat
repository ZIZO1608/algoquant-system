@echo off
setlocal
title Algo Quant - Allow Wi-Fi access
echo.
echo  This lets phones and laptops on the same Wi-Fi open Algo Quant
echo  (UI ports 5173-5199, API ports 3001-3020). You only need to run it once.
echo.

net session >nul 2>&1
if errorlevel 1 (
  echo  Administrator rights are needed.
  echo  Right-click this file and choose "Run as administrator", then try again.
  echo.
  pause
  exit /b 1
)

echo  [1/2] Adding the firewall rules...
netsh advfirewall firewall delete rule name="Algo Quant UI (5173)" >nul 2>&1
netsh advfirewall firewall delete rule name="Algo Quant API (3001)" >nul 2>&1
netsh advfirewall firewall add rule name="Algo Quant UI (5173)" dir=in action=allow protocol=TCP localport=5173-5199 profile=private,domain >nul
netsh advfirewall firewall add rule name="Algo Quant API (3001)" dir=in action=allow protocol=TCP localport=3001-3020 profile=private,domain >nul
echo        done.
echo.

echo  [2/2] Checking how Windows classifies your network...
powershell -NoProfile -Command "$p = Get-NetConnectionProfile | Where-Object { $_.IPv4Connectivity -ne 'Disconnected' }; if ($p | Where-Object { $_.NetworkCategory -eq 'Public' }) { exit 2 } else { exit 0 }"
if errorlevel 2 goto :public
echo        your network is Private - the rules apply. You are done.
goto :done

:public
echo.
echo  Your Wi-Fi is marked "Public", so Windows blocks other devices
echo  and the rules above do not apply to it.
echo.
echo  The usual fix is to mark this network as Private. Do that only for
echo  networks you trust (home, office) - not for cafe or airport Wi-Fi.
echo.
set /p MAKEPRIVATE=Mark the current network as Private now? [Y/N]:
if /i "%MAKEPRIVATE%"=="Y" (
  powershell -NoProfile -Command "Get-NetConnectionProfile | Where-Object { $_.IPv4Connectivity -ne 'Disconnected' -and $_.NetworkCategory -eq 'Public' } | ForEach-Object { Set-NetConnectionProfile -InterfaceIndex $_.InterfaceIndex -NetworkCategory Private; 'Set to Private: ' + $_.Name }"
  echo.
  echo  Done. Other devices on this Wi-Fi can now reach the app.
  goto :done
)

echo.
echo  Keeping the network Public. To still allow access on it, the ports
echo  must be opened for Public networks too, which also applies on any
echo  other public Wi-Fi you connect to later.
echo.
set /p OPENPUBLIC=Open the ports on Public networks as well? [Y/N]:
if /i "%OPENPUBLIC%"=="Y" (
  netsh advfirewall firewall delete rule name="Algo Quant UI (5173)" >nul 2>&1
  netsh advfirewall firewall delete rule name="Algo Quant API (3001)" >nul 2>&1
  netsh advfirewall firewall add rule name="Algo Quant UI (5173)" dir=in action=allow protocol=TCP localport=5173-5199 profile=any >nul
  netsh advfirewall firewall add rule name="Algo Quant API (3001)" dir=in action=allow protocol=TCP localport=3001-3020 profile=any >nul
  echo  Ports opened on all network types.
) else (
  echo  Nothing changed. The Wi-Fi link will only work from this laptop.
)

:done
echo.
echo  Start the app with start-local.bat and use the "Same Wi-Fi" link it prints.
echo.
pause
endlocal
