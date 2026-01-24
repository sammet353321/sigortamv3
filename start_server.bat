@echo off
title Sigorta Paneli Baslatici
color 0A
cls

echo ===================================================
echo   SIGORTA ACENTESI YONETIM PANELI BASLATILIYOR
echo ===================================================
echo.

:: 1. Backend Kontrol ve Baslatma
echo [1/2] WhatsApp Backend hazirlaniyor...
cd whatsapp-backend
if not exist node_modules (
    echo [BILGI] Backend paketleri yukleniyor...
    call npm install
)
echo [BILGI] Backend sunucusu yeni pencerede baslatiliyor...
start "WhatsApp Backend" cmd /k "npm start"
cd ..

:: 2. Frontend Kontrol ve Baslatma
echo.
echo [2/2] Frontend ve Masaustu Uygulamasi hazirlaniyor...
if not exist node_modules (
    echo [BILGI] Frontend paketleri yukleniyor...
    call npm install
)

echo [BILGI] Uygulama baslatiliyor...
echo.

:: Electron uygulamasini baslat (Gelistirme modu)
:: Bu komut hem Vite sunucusunu hem de Electron penceresini acar
cmd /k "npm run electron:dev"
