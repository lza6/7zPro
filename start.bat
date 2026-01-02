@echo off
set ELECTRON_ENABLE_LOGGING=1
echo Starting 7zPro High Performance Mode...
cd /d "%~dp0"

echo.
echo === Cleaning up any running 7zPro processes ===
:: Force kill all related processes (ignore errors if not found)
taskkill /f /im 7zPro.exe 2>nul
taskkill /f /im electron.exe 2>nul
taskkill /f /im 7za.exe 2>nul
:: Also kill any node processes that might be holding files
taskkill /f /im node.exe 2>nul

:: Wait for file handles to release
echo Waiting for process handles to release...
timeout /t 3 /nobreak >nul

:: Forcefully delete entire release directory with retry
echo Removing old release folder...
:RETRY_DELETE
if exist "release" (
    rd /s /q "release" 2>nul
    if exist "release" (
        echo Release folder still locked, retrying in 2 seconds...
        timeout /t 2 /nobreak >nul
        goto RETRY_DELETE
    )
)
echo Release folder cleaned successfully.

echo.
echo === Building ===
call npm run build

if exist "release\win-unpacked\7zPro.exe" (
    echo.
    echo === Starting 7zPro ===
    start "" "release\win-unpacked\7zPro.exe"
    echo Application started successfully!
) else (
    echo.
    echo === Build Failed ===
    echo Please check the errors above.
    pause
)
