@echo off
setlocal

REM Builds the current React UI, starts the single-origin FastAPI server, and
REM opens the local copy for a quick readiness check. Run setup-phone-access.bat
REM once before using the private HTTPS address on Android.

cd /d "%~dp0"

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
start "Uber Nest Tracker - Phone Server" cmd /k "cd /d ""%~dp0backend"" && call venv\Scripts\activate && uvicorn main:app --host 127.0.0.1 --port 8000"

echo Waiting for the server...
timeout /t 4 /nobreak >nul
start "" http://127.0.0.1:8000

echo.
echo The desktop server is starting. Keep the server window and this computer
echo awake while using the tracker from your phone.
echo.
echo If phone access has not been configured yet, close this message and run:
echo   setup-phone-access.bat
echo.
pause
