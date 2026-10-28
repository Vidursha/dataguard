@echo off
rem Start DataGuard in the right order, each part in its own window:
rem   1. WSO2 API Manager  - the gateway and login server; everything depends on it.
rem                          It takes about 3 minutes to start.
rem   2. Backend API       - only reachable through the gateway.
rem   3. Dashboard         - signs in through WSO2 and calls the gateway.
rem Close each window (or press Ctrl+C in it) to stop that part.
setlocal
cd /d "%~dp0.."
if "%WSO2_HOME%"=="" set "WSO2_HOME=C:\wso2am-4.6.0"

echo [1/3] Starting WSO2 API Manager from %WSO2_HOME% ...
start "WSO2 API Manager" /d "%WSO2_HOME%\bin" cmd /c api-manager.bat

echo        Waiting for API Manager to answer on https://localhost:9443 (about 3 minutes)...
:wait
timeout /t 10 /nobreak >nul
curl -sk -o nul -w "%%{http_code}" https://localhost:9443/services/Version | findstr /r "^200$" >nul || goto wait
echo        API Manager is up.

echo [2/3] Starting the backend API on http://127.0.0.1:8000 ...
start "DataGuard backend" cmd /k "%~dp0start_backend.cmd"

echo [3/3] Starting the dashboard on http://localhost:5173 ...
start "DataGuard dashboard" cmd /k "%~dp0start_frontend.cmd"

echo.
echo All started. Open http://localhost:5173 and sign in as analyst1 or manager1
echo (passwords are in .env). First time? See README "Run it from scratch".
endlocal
