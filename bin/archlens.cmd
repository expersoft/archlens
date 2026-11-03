@echo off
rem archlens: acha o Node (ARCHLENS_NODE ou o node.exe do PATH), confere a versão mínima e roda scripts\archlens.mjs.
rem Para o cmd e o PowerShell; no Git Bash, no Linux e no macOS vale bin/archlens.
setlocal EnableExtensions DisableDelayedExpansion
set "ARCHLENS_CP="
for /f "tokens=2 delims=:." %%c in ('chcp') do set "ARCHLENS_CP=%%c"
chcp 65001 >nul
set "ARCHLENS_CODE=0"

if not defined ARCHLENS_NODE goto :find
set "NODE=%ARCHLENS_NODE%"
if not exist "%NODE%" goto :badnode
if exist "%NODE%\*" goto :badnode
goto :version

:find
set "NODE="
for /f "delims=" %%n in ('where node.exe 2^>nul') do if not defined NODE set "NODE=%%n"
if defined NODE goto :version
>&2 echo archlens: Node.js não encontrado. Instale o Node 18 ou mais novo (https://nodejs.org) ou aponte ARCHLENS_NODE para o executável.
set "ARCHLENS_CODE=127"
goto :end

:badnode
>&2 echo archlens: ARCHLENS_NODE não aponta para um executável: %NODE%
set "ARCHLENS_CODE=127"
goto :end

:version
rem "call" na frente impede o cmd de tirar as aspas do caminho (ex.: C:\Program Files (x86)\...).
set "VER="
for /f "delims=" %%v in ('call "%NODE%" -p process.versions.node 2^>nul') do set "VER=%%v"
set "MAJ=0"
if defined VER for /f "tokens=1 delims=." %%m in ("%VER%") do set /a "MAJ=%%m" 2>nul
if %MAJ% GEQ 18 goto :run
if not defined VER set "VER=desconhecida"
>&2 echo archlens: o archlens precisa do Node 18 ou mais novo (encontrado: %VER%, em %NODE%).
set "ARCHLENS_CODE=1"
goto :end

:run
"%NODE%" "%~dp0..\scripts\archlens.mjs" %*
set "ARCHLENS_CODE=%ERRORLEVEL%"

:end
if defined ARCHLENS_CP chcp %ARCHLENS_CP% >nul
endlocal & exit /b %ARCHLENS_CODE%
