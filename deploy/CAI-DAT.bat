@echo off
chcp 65001 >nul
rem Chạy bằng cách bấm đúp. Tự xin quyền quản trị rồi chạy CAI-DAT-TU-DONG.ps1
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0CAI-DAT-TU-DONG.ps1" %*
echo.
pause
