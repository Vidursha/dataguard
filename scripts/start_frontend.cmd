@echo off
rem Start the DataGuard dashboard on http://localhost:5173
rem Requires frontend\.env.local, which wso2\scripts\setup_all.py writes.
cd /d "%~dp0..\frontend"
if not exist .env.local (
    echo frontend\.env.local not found. Run: venv\Scripts\python wso2\scripts\setup_all.py
    exit /b 1
)
if not exist node_modules (
    echo Installing frontend packages...
    call npm install || exit /b 1
)
call npm run dev
