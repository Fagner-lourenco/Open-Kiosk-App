@echo off
setlocal enabledelayedexpansion
set PATH=C:\Program Files\nodejs;%PATH%
cd /d "%~dp0"
npm run dev
pause
