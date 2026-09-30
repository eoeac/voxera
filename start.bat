@echo off
setlocal
cd /d "%~dp0"
set "PYTHONUTF8=1"
set "VOXERA_HOME=%~dp0"
set "PYTHONPATH=%~dp0"
if exist "%~dp0Voxera.exe" (
    start "" "%~dp0Voxera.exe"
    exit /b 0
)
set "VOXERA_PY="
if exist "%~dp0runtime\python.exe" set "VOXERA_PY=%~dp0runtime\python.exe"
if not defined VOXERA_PY if exist "%~dp0.venv\Scripts\python.exe" set "VOXERA_PY=%~dp0.venv\Scripts\python.exe"
if not defined VOXERA_PY (
    echo [ERROR] Isolated Python not found. See README.md.
    pause
    exit /b 1
)
"%VOXERA_PY%" -m engine.desktop
if errorlevel 1 pause
