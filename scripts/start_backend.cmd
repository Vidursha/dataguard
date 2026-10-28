@echo off
rem Start the DataGuard backend API on http://127.0.0.1:8000
rem It only answers requests that carry the gateway's shared secret (see .env),
rem so in practice it is reachable only through WSO2 API Manager on port 8243.
cd /d "%~dp0.."
if not exist .env (
    echo .env not found. Run: venv\Scripts\python wso2\scripts\generate_env.py
    exit /b 1
)
if not exist data\dataguard.db (
    echo data\dataguard.db not found. Run: venv\Scripts\python backend\clean.py
    exit /b 1
)
call venv\Scripts\activate.bat
python -m uvicorn backend.app.main:create_app --factory --host 127.0.0.1 --port 8000
