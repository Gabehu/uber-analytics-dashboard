@echo off
setlocal

REM Builds the current React UI, starts the single-origin FastAPI server, and
REM opens the local copy for a quick readiness check. Run setup-phone-access.bat
REM once before using the private HTTPS address on Android.

cd /d "%~dp0"

REM Finance and Uber share only this generated API key, never a database.
set "SYNC_KEY_FILE=%~dp0..\finance-uber-sync.key"
if not exist "%SYNC_KEY_FILE%" powershell.exe -NoProfile -Command "$rng=New-Object Security.Cryptography.RNGCryptoServiceProvider; $bytes=New-Object byte[] 32; $rng.GetBytes($bytes); $rng.Dispose(); [IO.File]::WriteAllText('%SYNC_KEY_FILE%',([BitConverter]::ToString($bytes)-replace '-',''))"
set /p UBER_FINANCE_SYNC_KEY=<"%SYNC_KEY_FILE%"
set "FINANCE_API_URL=http://127.0.0.1:8001"

if not exist "backend\venv\Scripts\python.exe" (
    echo The backend virtual environment was not found.
    echo Expected: backend\venv\Scripts\python.exe
    pause
    exit /b 1
)

if not exist "frontend\node_modules" (
    echo Frontend dependencies are missing. Run npm install in frontend first.
    pause
    exit /b 1
)

REM Invoke Uvicorn through the venv's Python instead of activating the venv.
REM Activation scripts remember the absolute folder where the venv was created,
REM so they can resolve to global tools after the project folder is moved.
"backend\venv\Scripts\python.exe" -c "import fastapi, uvicorn" >nul 2>&1
if errorlevel 1 (
    echo The backend environment is missing FastAPI or Uvicorn.
    echo Run backend\venv\Scripts\python.exe -m pip install -r backend\requirements.txt
    pause
    exit /b 1
)

echo Building the phone/production frontend...
pushd frontend
call npm run build
if errorlevel 1 (
    popd
    echo.
    echo Frontend build failed. The tracker was not started.
    pause
    exit /b 1
)
popd

echo.
echo Starting Uber Nest Tracker on http://127.0.0.1:8000 ...
start "Uber Nest Tracker - Phone Server" cmd /k "cd /d ""%~dp0backend"" && venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000"

echo Waiting for the server...
call :wait_for_server
if errorlevel 1 (
    echo.
    echo The backend did not become ready. Review the Phone Server window above.
    echo The browser was not opened because tracking data would be unavailable.
    pause
    exit /b 1
)

start "" http://127.0.0.1:8000

echo.
echo The desktop server is starting. Keep the server window and this computer
echo awake while using the tracker from your phone.
echo.
echo If phone access has not been configured yet, close this message and run:
echo   setup-phone-access.bat
echo.
pause
exit /b 0

:wait_for_server
for /L %%I in (1,1,20) do (
    powershell.exe -NoProfile -Command "try { $response = Invoke-RestMethod 'http://127.0.0.1:8000/api/health' -TimeoutSec 1; if ($response.message -eq 'Uber Dashboard API running') { exit 0 }; exit 1 } catch { exit 1 }" >nul 2>&1
    if not errorlevel 1 exit /b 0
    timeout /t 1 /nobreak >nul
)
exit /b 1
