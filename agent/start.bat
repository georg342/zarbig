@echo off
setlocal EnableExtensions EnableDelayedExpansion
title zarbig-yt-agent

set "APPDIR=%LOCALAPPDATA%\zarbig-yt-agent"
set "BIN=%APPDIR%\bin"
set "TMP=%APPDIR%\tmp"
set "SRC=%~dp0"

set "YTDLP_URL=https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
set "DENO_URL=https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip"
set "FFMPEG_URL=https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"

echo.
echo   zarbig-yt-agent setup
echo   --------------------
echo.

if not exist "%SRC%agent.py" (
  echo [error] agent.py not found next to start.bat.
  echo         run start.bat from the unzipped folder.
  goto :fail
)

rem --- runtime ------------------------------------------------------------
set "PY="
py -3 --version >nul 2>&1 && set "PY=py -3"
if not defined PY (
  python --version >nul 2>&1 && set "PY=python"
)
if not defined PY (
  echo [error] python 3 not found.
  echo         install it from https://www.python.org/downloads/windows/
  echo         then run start.bat again.
  goto :fail
)

where curl >nul 2>&1
if errorlevel 1 (
  echo [error] curl not found. windows 10 1803+ ships it.
  echo         open windows update or install curl manually.
  goto :fail
)

where tar >nul 2>&1
if errorlevel 1 (
  echo [error] tar not found. windows 10 1803+ ships it.
  goto :fail
)

if not exist "%BIN%" mkdir "%BIN%" >nul 2>&1
if not exist "%TMP%" mkdir "%TMP%" >nul 2>&1
if not exist "%BIN%" (
  echo [error] could not create "%APPDIR%".
  goto :fail
)

rem --- first run confirmation --------------------------------------------
if not exist "%APPDIR%\.installed" (
  echo   the agent downloads about 300 MB once:
  echo     yt-dlp.exe   ~23 MB
  echo     deno.exe    ~112 MB
  echo     ffmpeg      ~160 MB
  echo   everything is stored in %APPDIR%
  echo.
  choice /c YN /n /m "  continue? [Y/N] "
  if errorlevel 2 goto :cancelled
  echo.
)

rem --- dependencies ------------------------------------------------------
call :download "%YTDLP_URL%" "%BIN%\yt-dlp.exe" 10000000 "yt-dlp.exe"
if errorlevel 1 goto :fail

if not exist "%BIN%\deno.exe" (
  call :download "%DENO_URL%" "%TMP%\deno.zip" 50000000 "deno.zip"
  if errorlevel 1 goto :fail
  echo [..]   extracting deno.exe
  tar -xf "%TMP%\deno.zip" -C "%BIN%"
  if errorlevel 1 (
    echo [error] could not extract deno.zip
    goto :fail
  )
  if not exist "%BIN%\deno.exe" (
    echo [error] deno.exe missing after extraction
    goto :fail
  )
  echo [ok]   deno.exe ready
)

if not exist "%BIN%\ffmpeg.exe" (
  call :download "%FFMPEG_URL%" "%TMP%\ffmpeg.zip" 40000000 "ffmpeg.zip"
  if errorlevel 1 goto :fail
  echo [..]   extracting ffmpeg
  if exist "%TMP%\ffmpeg" rmdir /s /q "%TMP%\ffmpeg"
  mkdir "%TMP%\ffmpeg"
  tar -xf "%TMP%\ffmpeg.zip" -C "%TMP%\ffmpeg"
  for /d %%D in ("%TMP%\ffmpeg\ffmpeg-*") do (
    if exist "%%D\bin\ffmpeg.exe" copy /y "%%D\bin\ffmpeg.exe" "%BIN%\" >nul
    if exist "%%D\bin\ffprobe.exe" copy /y "%%D\bin\ffprobe.exe" "%BIN%\" >nul
    if exist "%%D\bin\ffplay.exe" copy /y "%%D\bin\ffplay.exe" "%BIN%\" >nul
  )
  if not exist "%BIN%\ffmpeg.exe" (
    echo [error] ffmpeg.exe missing after extraction
    goto :fail
  )
  echo [ok]   ffmpeg.exe ready
)

rem --- cleanup + agent copy ----------------------------------------------
if exist "%TMP%\deno.zip" del /q "%TMP%\deno.zip"
if exist "%TMP%\ffmpeg.zip" del /q "%TMP%\ffmpeg.zip"
if exist "%TMP%\ffmpeg" rmdir /s /q "%TMP%\ffmpeg"

copy /y "%SRC%agent.py" "%APPDIR%\agent.py" >nul
if errorlevel 1 (
  echo [error] could not copy agent.py to "%APPDIR%".
  goto :fail
)
echo ok> "%APPDIR%\.installed"

echo.
echo   starting the agent...
echo.
%PY% "%APPDIR%\agent.py"
echo.
echo   agent stopped.
pause
exit /b 0

:cancelled
echo.
echo   cancelled. nothing was installed.
pause
exit /b 1

:fail
echo.
echo   press any key to close.
pause >nul
exit /b 1

rem --- helpers ----------------------------------------------------------
:download
set "URL=%~1"
set "DEST=%~2"
set "MIN=%~3"
set "LABEL=%~4"
set "SIZE="
if exist "%DEST%" for %%A in ("%DEST%") do set "SIZE=%%~zA"
if defined SIZE if !SIZE! GEQ %MIN% (
  echo [ok]   %LABEL% already installed ^(!SIZE! bytes^)
  exit /b 0
)
echo [..]   downloading %LABEL%
if exist "%DEST%" del /q "%DEST%"
curl -L --fail --retry 3 --connect-timeout 20 -# -o "%DEST%" "%URL%"
if errorlevel 1 (
  if exist "%DEST%" del /q "%DEST%"
  echo [error] download failed: %LABEL%
  echo         check your connection and run start.bat again.
  exit /b 1
)
set "SIZE="
for %%A in ("%DEST%") do set "SIZE=%%~zA"
if not defined SIZE (
  echo [error] %LABEL% is missing after the download.
  exit /b 1
)
if !SIZE! LSS %MIN% (
  echo [error] %LABEL% looks truncated ^(!SIZE! bytes^).
  del /q "%DEST%"
  exit /b 1
)
echo [ok]   %LABEL% ^(!SIZE! bytes^)
exit /b 0

