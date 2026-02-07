@echo off
echo Sistem baslatiliyor...

:: Backend (Bot) Sunucusu
start "WhatsApp Bot Server" cmd /k "cd whatsapp-backend && node index.js"

:: Frontend (Web) Sunucusu
start "Sigorta Web Server" cmd /k "npm run dev"

:: Ana pencereyi kapat
exit
