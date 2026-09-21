@echo off
cd /d "%~dp0"

echo ==============================================
echo       Avvio del progetto OMR Exams in corso
echo ==============================================
echo.

if exist ".git" (
    echo Aggiornamento del core OMRExams...
    git submodule update --init --recursive
    if errorlevel 1 (
        echo ERRORE: Impossibile inizializzare il submodule OMRExams.
        exit /b 1
    )
)

if not exist "backend\omrexams\pyproject.toml" (
    echo ERRORE: Il core OMRExams non e' disponibile.
    echo Clona il repository con --recurse-submodules oppure esegui:
    echo git submodule update --init --recursive
    exit /b 1
)

echo [1/4] Controllo stato del motore Docker...
docker info >nul 2>&1
if %errorlevel% equ 0 (
    echo Il motore Docker e' gia' in esecuzione.
    goto DockerIsRunning
)

echo Il motore Docker non e' in esecuzione. Provo ad avviarlo...
if not exist "C:\Program Files\Docker\Docker\Docker Desktop.exe" (
    echo Non riesco a trovare Docker Desktop. Avvialo manualmente.
    pause
    exit /b 1
)

start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
echo Attendo l'avvio di Docker (potrebbe richiedere da 30 a 60 secondi)...

:waitForDocker
timeout /t 5 /nobreak >nul
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo In attesa di Docker...
    goto waitForDocker
)
echo Docker e' ora in esecuzione

:DockerIsRunning

echo.
echo [2/4] Aggiornamento incrementale dei container Docker...
echo ^(NOTA: La primissima volta questa operazione potrebbe richiedere
echo diversi minuti per scaricare le immagini base e compilare il codice^)

docker-compose build --no-cache
if %errorlevel% neq 0 (
    echo.
    echo ==============================================
    echo ERRORE: La fase di build e' fallita.
    echo Scorri in alto per leggere il messaggio d'errore
    echo ed individuare il problema.
    echo ==============================================
    pause
    exit /b %errorlevel%
)

echo.
echo [3/4] Avvio dei container in background...
docker-compose up -d

echo.
echo [4/4] Attendo che il server web sia completamente avviato e pronto...
powershell -Command "$ErrorActionPreference = 'SilentlyContinue'; while($true){ try { $resp=Invoke-WebRequest http://localhost:8080 -UseBasicParsing; if($resp.StatusCode -eq 200 -or $resp.StatusCode -eq 304){ break } } catch {}; Start-Sleep -Seconds 2 }"

echo.
echo Apro l'applicazione nel browser predefinito...
start http://localhost:8080

echo.
echo ==============================================
echo                  Avvio completato
echo ==============================================
echo L'applicazione e' ora in esecuzione nel browser.
echo.
echo PER SPEGNERE L'APPLICAZIONE:
echo Premi un tasto qualsiasi all'interno di questa finestra...
pause >nul

echo.
echo ==============================================
echo [1/2] Spegnimento dei container in corso...
docker-compose stop

echo.
set /p STOP_DOCKER="Vuoi spegnere anche il motore Docker Desktop? (s/n): "
if /i "%STOP_DOCKER%"=="s" (
    echo [2/2] Chiusura del motore Docker Desktop...
    taskkill /IM "Docker Desktop.exe" /F >nul 2>&1
    taskkill /IM "com.docker.backend.exe" /F >nul 2>&1
    echo Motore Docker spento.
) else (
    echo Motore Docker lasciato in esecuzione.
)

echo.
echo Applicazione chiusa correttamente.
echo Puoi chiudere il terminale.
pause
