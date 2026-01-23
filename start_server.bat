@echo off
title Sigorta Paneli
color 0A
cls

echo ===================================================
echo   SIGORTA ACENTESI YONETIM PANELI
echo ===================================================
echo.

if not exist node_modules (
    echo [BILGI] Kurulum yapiliyor...
    call npm install
)

echo [BILGI] Sunucu baslatiliyor...
echo.

:: cmd /k komutu pencerenin kapanmasini kesinlikle engeller
cmd /k "npm run dev"
