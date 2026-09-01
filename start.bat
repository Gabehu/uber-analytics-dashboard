@echo off
setlocal

cd /d "%~dp0"

REM Finance and Uber share only this generated API key, never a database.
set "SYNC_KEY_FILE=%~dp0..\finance-uber-sync.key"
if not exist "%SYNC_KEY_FILE%" powershell.exe -NoProfile -Command "$rng=New-Object Security.Cryptography.RNGCryptoServiceProvider; $bytes=New-Object byte[] 32; $rng.GetBytes($bytes); $rng.Dispose(); [IO.File]::WriteAllText('%SYNC_KEY_FILE%',([BitConverter]::ToString($bytes)-replace '-',''))"
set /p UBER_FINANCE_SYNC_KEY=<"%SYNC_KEY_FILE%"
set "FINANCE_API_URL=http://127.0.0.1:8001"

REM ============================================================
REM Uber Nest Tracker - Startup Script
REM
REM Double-click this file (or run it) to start both the backend
REM and frontend, then automatically open the app in your browser.
REM
REM Expects this file to sit in the project root, next to the
REM "backend" and "frontend" folders (same layout as the README's
REM project structure).
REM ============================================================

echo Starting Uber Nest Tracker...
echo.

REM Run Uvicorn through the project Python so moving the folder remains safe.
start "Uber Nest Tracker - Backend" cmd /k "cd /d ""%~dp0backend"" && venv\Scripts\python.exe -m uvicorn main:app --reload"

REM Start the frontend in its own window.
start "Uber Nest Tracker - Frontend" cmd /k "cd /d ""%~dp0frontend"" && npm run dev"

echo Both servers are starting in separate windows.
echo Waiting a few seconds before opening your browser...
timeout /t 6 /nobreak >nul

start http://localhost:5173

echo.
echo Done. You can close THIS window -- the backend and frontend
echo windows are independent and will keep running.
echo To stop the app later, just close those two windows (or Ctrl+C
echo inside each one).
echo.
pause
