@echo off
echo ========================================
echo Creating Static JavaScript Bundle
echo ========================================

REM Set environment
set NODE_ENV=production
set EXPO_NO_TELEMETRY=1
set EXPO_NO_DEPLOY=1
set TMPDIR=D:\npm-tmp
set TEMP=D:\npm-tmp
set TMP=D:\npm-tmp

REM Create temp directory if not exists
if not exist "%TEMP%" mkdir "%TEMP%"

echo.
echo Generating optimized production bundle...
echo Using expo-router entry point
echo.

REM Create assets directory
if not exist "android\app\src\main\assets" mkdir "android\app\src\main\assets"

REM Generate bundle with Expo CLI for expo-router
npx expo export:embed ^
  --platform android ^
  --entry-file index.js ^
  --bundle-output android/app/src/main/assets/index.android.bundle ^
  --assets-dest android/app/src/main/res ^
  --dev false ^
  --minify true ^
  --reset-cache

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Bundle creation failed!
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo Bundle Created Successfully!
echo ========================================
echo.
echo Location: android\app\src\main\assets\index.android.bundle
echo.
pause
