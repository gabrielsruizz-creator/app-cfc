@echo off
chcp 65001 >nul
title Volante - preparar
cd /d "%~dp0"

echo.
echo === Volante: preparar / atualizar o projeto ===
echo Rode este arquivo na primeira vez e sempre que houver atualizacoes.
echo.

docker info >nul 2>&1
if errorlevel 1 (
  echo O Docker nao esta rodando. Abra o Docker Desktop e rode este arquivo de novo.
  pause
  exit /b 1
)

if not exist ".env" (
  echo Criando o arquivo .env a partir do .env.exemplo...
  copy ".env.exemplo" ".env" >nul
)

echo [1/6] Baixando atualizacoes...
git pull
echo [2/6] Instalando dependencias...
call pnpm install || goto erro
echo [3/6] Ligando o banco...
docker compose up -d || goto erro
:esperar_banco
docker compose exec -T postgres pg_isready -U postgres >nul 2>&1
if errorlevel 1 (
  timeout /t 2 /nobreak >nul
  goto esperar_banco
)
echo [4/6] Compilando pacotes compartilhados...
call pnpm build:pacotes || goto erro
echo [5/6] Atualizando o banco...
call pnpm db:migrar || goto erro
echo [6/6] Criando dados de demonstracao...
call pnpm db:semear -- --demo || goto erro

echo.
echo Tudo pronto! Agora de dois cliques em iniciar.bat
pause
exit /b 0

:erro
echo.
echo Algo deu errado. Tire um print desta janela e envie para analise.
pause
exit /b 1
