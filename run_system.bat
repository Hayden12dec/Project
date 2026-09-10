
@echo off
title Smart Examination Proctoring System
echo ===================================================
echo AI-Based Smart Examination Proctoring System
echo Starting FastAPI Backend and React Frontend...
echo ===================================================

set ROOT_DIR=%~dp0
set VENV_PY=%ROOT_DIR%.venv\Scripts\python.exe
set NODE_DIR=C:\Users\ferns\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.19.0-win-x64
set PATH=%ROOT_DIR%.venv\Scripts;%NODE_DIR%;C:\Users\ferns\.local\bin;%PATH%

cd /d "%ROOT_DIR%"
if exist "%VENV_PY%" (
    start "SmartProctor Backend API" cmd /k ""%VENV_PY%" -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload"
) else (
    start "SmartProctor Backend API" cmd /k "python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload"
)

timeout /t 5 >nul

cd /d "%ROOT_DIR%frontend"
start "SmartProctor Frontend UI" cmd /k "npm run dev"

timeout /t 3 >nul

start http://localhost:5173

echo.
echo ===================================================
echo System is launching!
echo Frontend UI:  http://localhost:5173
echo Backend API:  http://127.0.0.1:8000
echo Backend Docs: http://127.0.0.1:8000/docs
echo.
echo Demo Credentials:
echo   Admin:   admin@proctor.edu   / Admin@123
echo   Student: student@proctor.edu / Student@123
echo ===================================================

