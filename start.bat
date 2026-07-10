@echo off
setlocal

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

REM Start the backend in its own window: activate the venv, then run uvicorn.
start "Uber Nest Tracker - Backend" cmd /k "cd backend && call venv\Scripts\activate && uvicorn main:app --reload"

REM Start the frontend in its own window.
start "Uber Nest Tracker - Frontend" cmd /k "cd frontend && npm run dev"

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
