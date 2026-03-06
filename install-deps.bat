@echo off
echo ========================================
echo Installing Dependencies (using D: drive)
echo ========================================

REM Устанавливаем переменные окружения
set GRADLE_USER_HOME=D:\.gradle
set TMPDIR=D:\npm-tmp
set TEMP=D:\npm-tmp
set TMP=D:\npm-tmp
set NODE_OPTIONS=--max-old-space-size=2048

echo.
echo Installing npm packages...
echo This will use D:\npm-cache for cache
echo.

call npm install --legacy-peer-deps

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Installation failed!
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo Dependencies installed successfully!
echo ========================================
echo.
echo Next step: build-bundle.bat
echo.
pause
