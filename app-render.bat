@echo off
chcp 65001 >nul
title Volante - app no celular (servidor no Render)
cd /d "%~dp0"

echo.
echo === Volante: app no Expo Go usando o servidor do Render (sem Docker) ===
echo.

if exist "apps\mobile\.env" goto tem_endereco
echo Cole o endereco do Volante no Render (ex.: https://volante-api.onrender.com)
set /p ENDERECO=Endereco: 
if "%ENDERECO%"=="" (
  echo Nenhum endereco informado.
  pause
  exit /b 1
)
if "%ENDERECO:~-1%"=="/" set ENDERECO=%ENDERECO:~0,-1%
> "apps\mobile\.env" echo EXPO_PUBLIC_API_URL=%ENDERECO%
echo Endereco salvo em apps\mobile\.env (apague o arquivo para trocar).
:tem_endereco
for /f "tokens=2 delims==" %%a in ('findstr /b "EXPO_PUBLIC_API_URL=" "apps\mobile\.env"') do set ENDERECO=%%a
echo Servidor: %ENDERECO%
echo.

echo [1/4] Baixando atualizacoes...
git pull
echo [2/4] Instalando dependencias...
call pnpm install || goto erro
echo [3/4] Compilando pacotes compartilhados...
call pnpm build:pacotes || goto erro

echo [4/4] Acordando o servidor no Render (pode levar ate 1 minuto)...
curl -s -m 90 -o nul -w "Servidor respondeu: HTTP %%{http_code}\n" "%ENDERECO%/saude"
if errorlevel 1 (
  echo O Render nao respondeu. Abra o painel do Render e veja se o servico volante-api esta "Live".
  echo Mesmo assim vou abrir o Expo.
)

echo.
echo Leia o QR Code abaixo com o Expo Go (celular no mesmo Wi-Fi do computador).
echo Contas de teste: aluno@demo.com / instrutor@demo.com, senha demo1234
echo.
call pnpm dev:mobile --clear
exit /b 0

:erro
echo.
echo Algo deu errado. Tire um print desta janela e envie para analise.
pause
exit /b 1
