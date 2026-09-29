@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js nao encontrado. Instale o LTS e reabra o terminal.
    exit /b 1
)

if not exist "node_modules\koffi" (
    echo Instalando dependencias npm...
    call npm install
    if errorlevel 1 exit /b 1
)

if not exist "lib\SDL2.dll" if exist "..\php_doom\lib\SDL2.dll" (
    copy /y "..\php_doom\lib\SDL2.dll" "lib\SDL2.dll" >nul
)

if not exist "lib\SDL2.dll" if not defined SDL2_PATH (
    echo Aviso: coloque SDL2.dll em lib\  ^(64-bit, https://github.com/libsdl-org/SDL/releases^)
)

set "IWAD_ARGS=%*"
echo %* | findstr /i /c:"-iwad" >nul
if errorlevel 1 (
    if exist "DOOM1.WAD" set "IWAD_ARGS=-iwad DOOM1.WAD %*"
    if exist "..\DOOM1.WAD" set "IWAD_ARGS=-iwad ..\DOOM1.WAD %*"
)

npx --yes tsx doom.ts %IWAD_ARGS%
exit /b %ERRORLEVEL%
