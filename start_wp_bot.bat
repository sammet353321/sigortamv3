@echo off
echo Starting WhatsApp Bot...
cd /d "%~dp0\whatsapp-backend"
call npm install
call npm start
echo.
echo Bot stopped or crashed.
pause
