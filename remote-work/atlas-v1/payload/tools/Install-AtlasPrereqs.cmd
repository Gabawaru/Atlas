@echo off
REM One-liner entrypoint for Atlas Windows prerequisites.
REM Does NOT start Cursor/agent workers.
setlocal
cd /d "%~dp0..\.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-AtlasPrereqs.ps1" %*
exit /b %ERRORLEVEL%
