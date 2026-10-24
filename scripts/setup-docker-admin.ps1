#Requires -RunAsAdministrator
<#
.SYNOPSIS
  One-time admin setup so `docker compose up -d` works on this machine.
  Right-click PowerShell → Run as administrator, then:
    Set-ExecutionPolicy -Scope Process Bypass
    cd C:\Users\YOGA\Desktop\algo
    .\scripts\setup-docker-admin.ps1
#>
$ErrorActionPreference = 'Stop'

Write-Host '==> Enabling WSL + Virtual Machine Platform...'
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

Write-Host '==> Installing WSL (default distro)...'
wsl --install --no-distribution
wsl --update

$installer = Join-Path $env:TEMP 'DockerDesktopInstaller.exe'
if (-not (Test-Path $installer)) {
  Write-Host '==> Downloading Docker Desktop...'
  Invoke-WebRequest `
    -Uri 'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe' `
    -OutFile $installer `
    -UseBasicParsing
}

Write-Host '==> Installing Docker Desktop (quiet)...'
Start-Process -FilePath $installer -ArgumentList 'install','--quiet','--accept-license' -Wait

Write-Host ''
Write-Host 'Features enabled. You MUST reboot Windows once so WSL2 activates.'
Write-Host 'After reboot:'
Write-Host '  1. Open Docker Desktop and wait until it says Running'
Write-Host '  2. Stop any Windows MinIO binary still bound to port 9000'
Write-Host '  3. From the project root:'
Write-Host '       docker compose up -d'
Write-Host '  4. Confirm MinIO console: http://localhost:9001  (minioadmin / minioadmin)'
Write-Host '  5. Bucket algo-quant is created by the minio-init service automatically'
