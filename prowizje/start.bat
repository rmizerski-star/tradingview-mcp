@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Port aplikacji. Jesli jest zajety przez inny program, wpisz inna liczbe (np. 3301).
set PORT=3300
where node >nul 2>nul
if errorlevel 1 (
  echo Brak Node.js. Zainstaluj wersje LTS ze strony https://nodejs.org i uruchom ponownie.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Pierwsze uruchomienie: instalowanie bibliotek...
  call npm install --omit=dev
  if errorlevel 1 (
    echo Instalacja nie powiodla sie. Sprawdz polaczenie z internetem.
    pause
    exit /b 1
  )
)
node server.js
pause
