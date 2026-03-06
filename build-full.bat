@echo off
echo ========================================
echo Full Android APK Build Process
echo ========================================
echo.
echo This will:
echo 1. Create static Metro bundle (optimized)
echo 2. Build release APK
echo.
echo Using production settings for fastest build
echo.
pause

REM Set production environment
set NODE_ENV=production
set EXPO_NO_TELEMETRY=1
set EXPO_NO_DEPLOY=1

REM Step 1: Create bundle
echo.
echo [STEP 1/2] Creating static bundle...
echo.
call build-bundle.bat

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Bundle creation failed!
    echo.
    pause
    exit /b 1
)

REM Step 2: Build APK
echo.
echo [STEP 2/2] Building APK...
echo.
call build-apk.bat

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: APK build failed!
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo COMPLETE! APK is ready to install
echo ========================================
echo.
pause
