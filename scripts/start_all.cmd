@echo off
rem Starts all of DataGuard in the right order, each part in its own window:
rem   1. WSO2 API Manager  - the gateway and login server. Everything needs it,
rem                          and it takes about 3 to 5 minutes to start.
rem   2. Backend API       - you can only reach it through the gateway.
rem   3. Dashboard         - signs in through WSO2 and calls the gateway.
rem To stop a part, press Ctrl+C in its window.
setlocal
cd /d "%~dp0.."
if "%WSO2_HOME%"=="" set "WSO2_HOME=C:\wso2am-4.6.0"

call :apim_up
if not errorlevel 1 (
    echo [1/3] WSO2 API Manager is already running.
    goto backend
)
echo [1/3] Starting WSO2 API Manager from %WSO2_HOME% ...
start "WSO2 API Manager" /d "%WSO2_HOME%\bin" cmd /c api-manager.bat

echo        Waiting for API Manager to answer on https://localhost:9443 (about 3 to 5 minutes)...
set /a waited=0
:wait
rem Wait 10 seconds. ping is used because "timeout" breaks when there's no keyboard.
ping -n 11 127.0.0.1 >nul
set /a waited+=10
call :apim_up
if not errorlevel 1 goto apim_ready
if %waited% geq 600 (
    echo        API Manager did not answer within 10 minutes. Check its window for errors.
    exit /b 1
)
goto wait
:apim_ready
echo        API Manager is up after about %waited% seconds.

:backend
echo [2/3] Starting the backend API on http://127.0.0.1:8000 ...
start "DataGuard backend" cmd /k "%~dp0start_backend.cmd"

echo [3/3] Starting the dashboard on http://localhost:5173 ...
start "DataGuard dashboard" cmd /k "%~dp0start_frontend.cmd"

echo.
echo All started. Open http://localhost:5173 and sign in as analyst1 or manager1
echo (passwords are in .env). First time? See README "Run it from scratch".
endlocal
exit /b 0

:apim_up
rem Gives errorlevel 0 when API Manager answers with HTTP 200 on port 9443.
curl -sk -o nul --max-time 5 -w "%%{http_code}" https://localhost:9443/services/Version | findstr /r "^200$" >nul
exit /b %errorlevel%
