@echo off
cd /d "%~dp0\.."
node "%~dp0pack-release.js"
exit /b %ERRORLEVEL%
