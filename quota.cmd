@echo off
cd /d "%~dp0"
if /I "%~1"=="cache" (
  node print-table.js
  exit /b %ERRORLEVEL%
)
node collect.js >nul
if errorlevel 1 exit /b 1
node print-table.js
