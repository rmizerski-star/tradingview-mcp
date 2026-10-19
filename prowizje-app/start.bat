@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Instaluje zaleznosci...
  call npm install --omit=dev
)
start "" http://localhost:3000
npm start
