@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Idefka

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Не найден Node.js. Установите LTS-версию с https://nodejs.org и снова запустите этот файл.
  start "" https://nodejs.org/
  pause
  exit /b 1
)

if not exist node_modules\esbuild (
  echo Первый запуск: устанавливаю зависимости, это займёт около минуты...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo Не удалось установить зависимости. Ошибка написана выше.
    pause
    exit /b 1
  )
)

call npm start
if errorlevel 1 pause
