@echo off
setlocal EnableDelayedExpansion
title AlphaLearn IDE - Windows Installer

set "IMAGE=YOURDOCKERHUBUSER/alphalearnide:latest"
set "CONTAINER=alphalearn-ide"
set "LAUNCHER_CMD=%SystemRoot%\alphalearn-ide.bat"
set "DOCKER_EXE=C:\Program Files\Docker\Docker\Docker Desktop.exe"

echo.
echo  ================================================
echo    [A  AlphaLearn IDE ^| Windows Installer
echo  ================================================
echo.

:: ── Step 1: Check Node.js ─────────────────────────────────
echo  [1/6] Checking Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo        Installing Node.js via winget...
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    if !errorlevel! neq 0 (
        echo        Install manually: https://nodejs.org
        pause & exit /b 1
    )
) else (
    for /f "tokens=*" %%v in ('node -v') do echo    OK  Node.js %%v
)

:: ── Step 2: Check Docker ──────────────────────────────────
echo.
echo  [2/6] Checking Docker Desktop...
where docker >nul 2>&1
if %errorlevel% neq 0 (
    echo        Docker not found. Downloading...
    curl -L "https://desktop.docker.com/win/main/amd64/DockerDesktopInstaller.exe" ^
         -o "%TEMP%\DockerInstaller.exe"
    echo        Installing Docker Desktop...
    start /wait "%TEMP%\DockerInstaller.exe" install --quiet --accept-license
    echo        Docker installed. Rerun this installer after Docker Desktop starts.
    pause & exit /b 0
)
echo    OK  Docker found

:: ── Step 3: Auto-start Docker on Windows login ────────────
echo.
echo  [3/6] Configuring Docker to auto-start on login...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" ^
    /v "DockerDesktop" ^
    /t REG_SZ ^
    /d "\"%DOCKER_EXE%\"" ^
    /f >nul 2>&1
echo    OK  Docker Desktop will auto-start on login

:: Start Docker now if not running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo        Starting Docker Desktop automatically...
    start "" "%DOCKER_EXE%"
    echo        Waiting for Docker to be ready (up to 90s)...
    :docker_start_wait
    timeout /t 3 /nobreak >nul
    docker info >nul 2>&1
    if %errorlevel% neq 0 goto docker_start_wait
)
echo    OK  Docker is running

:: ── Step 4: Pull IDE image ────────────────────────────────
echo.
echo  [4/6] Downloading AlphaLearn IDE image...
echo        First time ~500MB. Please wait...
echo.
docker pull %IMAGE%
if %errorlevel% neq 0 (
    echo   FAIL  Could not pull image. Check internet.
    pause & exit /b 1
)
echo    OK  IDE image ready

:: ── Step 5: Create launcher ───────────────────────────────
echo.
echo  [5/6] Creating launcher...

(
echo @echo off
echo setlocal EnableDelayedExpansion
echo.
echo set "IMAGE=%IMAGE%"
echo set "CONTAINER=%CONTAINER%"
echo set "DOCKER_EXE=%DOCKER_EXE%"
echo set "ASSIGN_ID=%%~1"
echo set "TOKEN=%%~2"
echo.
echo :: Strip alphalearn:// prefix if called from protocol handler
echo set "ASSIGN_ID=!ASSIGN_ID:alphalearn://=!"
echo set "ASSIGN_ID=!ASSIGN_ID:/=!"
echo for /f "tokens=1 delims=?" %%%%a in ^("!ASSIGN_ID!"^) do set "ASSIGN_ID=%%%%a"
echo.
echo echo.
echo echo  [A AlphaLearn IDE
echo echo.
echo.
echo :: ── Auto-start Docker if not running ───────────────────
echo docker info ^>nul 2^>^&1
echo if %%errorlevel%% neq 0 ^(
echo     echo  Docker not running. Starting automatically...
echo     start "" "!DOCKER_EXE!"
echo     :docker_wait
echo     timeout /t 3 /nobreak ^>nul
echo     docker info ^>nul 2^>^&1
echo     if %%errorlevel%% neq 0 goto docker_wait
echo     echo  Docker ready.
echo ^)
echo.
echo :: ── Check if container already running ─────────────────
echo set "RUNNING=false"
echo for /f "tokens=*" %%%%s in ^('docker inspect -f "{{.State.Running}}" !CONTAINER! 2^>nul'^) do set "RUNNING=%%%%s"
echo.
echo if "!RUNNING!"=="true" ^(
echo     echo  IDE already running. Opening browser...
echo     goto :open_browser
echo ^)
echo.
echo echo  Checking for updates...
echo docker pull !IMAGE! --quiet 2^>nul
echo docker rm !CONTAINER! 2^>nul
echo.
echo echo  Starting IDE container...
echo docker run -d ^
echo     --name !CONTAINER! ^
echo     -p 80:80 ^
echo     -p 3001:3001 ^
echo     -v alphalearn-workspaces:/home/coder/workspaces ^
echo     -v alphalearn-auth:/root/.alpha ^
echo     --restart no ^
echo     !IMAGE!
echo.
echo :: ── Wait for IDE to be ready ────────────────────────────
echo echo  Waiting for IDE to start...
echo :ide_wait
echo curl -s -o nul -w "%%%%{http_code}" http://127.0.0.1/health 2^>nul ^| find "200" ^>nul 2^>^&1
echo if %%errorlevel%% neq 0 ^(
echo     timeout /t 2 /nobreak ^>nul
echo     goto ide_wait
echo ^)
echo.
echo :: ── Save auth if token provided ─────────────────────────
echo if not "!TOKEN!"=="" ^(
echo     echo  Saving authentication...
echo     docker exec !CONTAINER! sh -c "node /alpha-cli/index.js authenticate !TOKEN!" 2^>nul
echo ^)
echo.
echo :open_browser
echo if not "!ASSIGN_ID!"=="" ^(
echo     set "URL=http://localhost/alpha-init/?assignmentId=!ASSIGN_ID!"
echo ^) else ^(
echo     set "URL=http://localhost"
echo ^)
echo.
echo echo  Opening IDE -^> !URL!
echo start "" "!URL!"
echo echo.
echo echo  IDE     -^> http://localhost
echo echo  Preview -^> http://localhost:3001
echo echo.
echo.
echo :: ── Background watchdog — stop Docker when IDE stops ────
echo start /b cmd /c "^
echo :watch_loop^
echo timeout /t 60 /nobreak ^>nul^
echo docker inspect -f {{.State.Running}} !CONTAINER! 2^>nul ^| find \"true\" ^>nul^
echo if %%errorlevel%% neq 0 (^
echo   echo IDE stopped. Quitting Docker Desktop...^
echo   taskkill /f /im \"Docker Desktop.exe\" ^>nul 2^>^&1^
echo   exit^
echo )^
echo goto watch_loop"
) > "%LAUNCHER_CMD%"

echo    OK  Launcher → %LAUNCHER_CMD%

:: ── Step 6: Register alphalearn:// protocol ───────────────
echo.
echo  [6/6] Registering alphalearn:// protocol handler...

set "REG_FILE=%TEMP%\alphalearn-protocol.reg"
(
echo Windows Registry Editor Version 5.00
echo.
echo [HKEY_CLASSES_ROOT\alphalearn]
echo @="AlphaLearn IDE"
echo "URL Protocol"=""
echo.
echo [HKEY_CLASSES_ROOT\alphalearn\DefaultIcon]
echo @="%SystemRoot%\\System32\\cmd.exe,0"
echo.
echo [HKEY_CLASSES_ROOT\alphalearn\shell]
echo.
echo [HKEY_CLASSES_ROOT\alphalearn\shell\open]
echo.
echo [HKEY_CLASSES_ROOT\alphalearn\shell\open\command]
echo @="cmd.exe /c \"%LAUNCHER_CMD%\" \"%1\""
) > "%REG_FILE%"

reg import "%REG_FILE%" >nul 2>&1
if %errorlevel% equ 0 (
    echo    OK  alphalearn:// protocol registered
) else (
    echo        Needs admin. Right-click install.bat ^> Run as Administrator
)

:: ── Desktop shortcut ──────────────────────────────────────
set "SHORTCUT=%USERPROFILE%\Desktop\AlphaLearn IDE.bat"
(
echo @echo off
echo alphalearn-ide
) > "%SHORTCUT%"
echo    OK  Desktop shortcut created

:: ── Done ─────────────────────────────────────────────────
echo.
echo  ================================================
echo    OK  AlphaLearn IDE Installed Successfully!
echo  ================================================
echo.
echo    Click "Launch IDE" on alphalearn.com
echo    — Docker starts automatically, IDE opens.
echo.
echo    Or run: alphalearn-ide
echo    Desktop shortcut: "AlphaLearn IDE"
echo.
echo    IDE     -^> http://localhost
echo    Preview -^> http://localhost:3001
echo.
pause