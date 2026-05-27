@echo off
echo.
echo  OrthoScan AI Platform
echo  =====================
echo  Starting backend (port 8000) and frontend (port 5173)...
echo.

REM Start FastAPI backend in a new window
start "OrthoScan API" cmd /k "cd /d %~dp0 && uvicorn api.main:app --reload --port 8000"

REM Give backend 2 seconds to start
timeout /t 2 /nobreak >nul

REM Start Vite frontend in a new window
start "OrthoScan UI" cmd /k "cd /d %~dp0\frontend && npm run dev"

echo.
echo  Backend  ^>  http://localhost:8000
echo  Frontend ^>  http://localhost:5173
echo.
echo  Module 2 (IMU Rehab, Streamlit) — run separately:
echo    cd rehab_platform ^&^& streamlit run app.py
echo.
pause
