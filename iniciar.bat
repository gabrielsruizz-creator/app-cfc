@echo off
chcp 65001 >nul
title Volante - iniciar
cd /d "%~dp0"

echo.
echo === Volante: ligando o ambiente de testes ===
echo.

docker info >nul 2>&1
if errorlevel 1 (
  echo O Docker nao esta rodando. Abra o Docker Desktop, espere aparecer "Engine running"
  echo e rode este arquivo de novo.
  pause
  exit /b 1
)

echo [1/3] Ligando o banco de dados...
docker compose up -d
if errorlevel 1 (
  echo Nao foi possivel ligar o banco. Veja a mensagem acima.
  pause
  exit /b 1
)

echo [2/3] Esperando o banco ficar pronto...
:esperar_banco
docker compose exec -T postgres pg_isready -U postgres >nul 2>&1
if errorlevel 1 (
  timeout /t 2 /nobreak >nul
  goto esperar_banco
)

echo [3/3] Abrindo as 4 janelas (API, worker, painel e app)...
start "Volante - API" cmd /k "pnpm dev:api"
start "Volante - Worker" cmd /k "pnpm dev:worker"
start "Volante - Painel web" cmd /k "pnpm dev:web"
timeout /t 8 /nobreak >nul
start "Volante - App (QR Code)" cmd /k "pnpm dev:mobile"

echo.
echo Pronto! Em alguns segundos:
echo  - leia o QR Code da janela "Volante - App" com o Expo Go;
echo  - o painel web abre no navegador.
timeout /t 15 /nobreak >nul
start "" http://localhost:5173
echo.
echo Para desligar: feche as 4 janelas (o banco pode ficar ligado).
timeout /t 10 >nul
