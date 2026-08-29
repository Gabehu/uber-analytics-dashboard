@echo off
setlocal

REM One-time Tailscale Serve setup for private phone access.
REM Tailscale may open a browser the first time so HTTPS can be approved.

set "TAILSCALE_EXE=C:\Program Files\Tailscale\tailscale.exe"

if not exist "%TAILSCALE_EXE%" (
    echo Tailscale was not found at:
    echo   %TAILSCALE_EXE%
    echo Install Tailscale for Windows and try again.
    pause
    exit /b 1
)

echo Configuring private HTTPS access to the tracker...
echo.
"%TAILSCALE_EXE%" serve --bg 8000
if errorlevel 1 (
    echo.
    echo Tailscale could not configure Serve.
    echo Right-click this file, choose "Run as administrator", and try again.
    pause
    exit /b 1
)

echo.
echo Tailscale Serve status:
"%TAILSCALE_EXE%" serve status
echo.
echo Save the HTTPS address shown above. Open it on Android while Tailscale
echo is connected. This address is private to your Tailscale network.
pause
