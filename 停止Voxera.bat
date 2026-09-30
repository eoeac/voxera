@echo off
setlocal
cd /d "%~dp0"
set "PYTHONUTF8=1"
set "VOXERA_HOME=%~dp0"
set "VOXERA_PY="
if exist "%~dp0runtime\python.exe" set "VOXERA_PY=%~dp0runtime\python.exe"
if not defined VOXERA_PY if exist "%~dp0.venv\Scripts\python.exe" set "VOXERA_PY=%~dp0.venv\Scripts\python.exe"
if not defined VOXERA_PY (
    echo [ERROR] Isolated Python not found.
    pause
    exit /b 1
)
"%VOXERA_PY%" tools\stop_engine.py
if errorlevel 1 pause
