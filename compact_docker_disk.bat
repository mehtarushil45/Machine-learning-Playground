@echo off
:: Check for admin permissions
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges to compact Docker virtual disk...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c \"\"%~dpnx0\"\"' -Verb RunAs"
    exit /b
)

title Docker Virtual Disk Compactor - Reclaiming 25+ GB
echo ========================================================
echo   Docker Virtual Disk (docker_data.vhdx) Compactor
echo   Reclaiming 25+ GB from C:\Users\mehta\AppData\Local\Docker
echo ========================================================
echo.
echo [1/3] Shutting down WSL and Docker background services...
wsl --shutdown

set "VHD_PATH=C:\Users\mehta\AppData\Local\Docker\wsl\disk\docker_data.vhdx"
set "SCRIPT_PATH=%TEMP%\compact_docker_vhdx.txt"

if not exist "%VHD_PATH%" (
    echo Error: Could not find "%VHD_PATH%"
    pause
    exit /b 1
)

echo [2/3] Preparing diskpart script for %VHD_PATH%...
(
    echo select vdisk file="%VHD_PATH%"
    echo attach vdisk readonly
    echo compact vdisk
    echo detach vdisk
    echo exit
) > "%SCRIPT_PATH%"

echo [3/3] Compacting virtual disk... Please wait 1-2 minutes...
diskpart /s "%SCRIPT_PATH%"

del "%SCRIPT_PATH%" >nul 2>&1

echo.
echo ========================================================
echo   Compaction Process Finished.
echo   Note: If the VHDX file did not shrink, run 'Compact disk'
echo   or 'Clean / Purge data' directly inside Docker Desktop!
echo ========================================================
echo.
pause
