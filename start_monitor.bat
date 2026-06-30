@echo off
title DTC Signal Monitor — Telegram
cd /d "%~dp0"
echo.
echo  ========================================
echo   DTC 1.3.6 PRO — Signal Monitor
echo   Sygnaly → Telegram
echo  ========================================
echo.
echo  Uruchamianie...
echo  Zamknij to okno aby zatrzymac monitor.
echo.
node signal_monitor.js
pause
