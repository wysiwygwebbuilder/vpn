@echo off
echo ========================================
echo Building Android APK (Release)
echo ========================================

REM Set environment - все на диск D
set NODE_ENV=production
set JAVA_OPTS=-Xmx2048m -XX:+UseG1GC
set GRADLE_USER_HOME=D:\.gradle
set GRADLE_OPTS=-Dorg.gradle.daemon=true -Dorg.gradle.caching=true -Dorg.gradle.parallel=true -Xmx2048m -XX:+UseG1GC
set TMPDIR=D:\npm-tmp
set TEMP=D:\npm-tmp
set TMP=D:\npm-tmp

REM Create temp directory if not exists
if not exist "%TEMP%" mkdir "%TEMP%"

REM Check if bundle exists
if not exist "android\app\src\main\assets\index.android.bundle" (
    echo.
    echo WARNING: Bundle not found!
    echo Please run build-bundle.bat first to create the bundle.
    echo.
    pause
    exit /b 1
)

echo.
echo Bundle found: android\app\src\main\assets\index.android.bundle
echo.
echo Starting Gradle build with optimizations...
echo.

cd android

REM Build without clean (faster) - only if you didn't change native code
call gradlew assembleRelease --no-daemon --max-workers=2 -Dorg.gradle.jvmargs="-Xmx2048m -XX:+UseG1GC"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Build failed! Trying with clean...
    echo.
    call gradlew clean assembleRelease --no-daemon --max-workers=2 -Dorg.gradle.jvmargs="-Xmx2048m -XX:+UseG1GC"
    
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo ERROR: Build failed after clean!
        echo.
        cd ..
        pause
        exit /b 1
    )
)

cd ..

echo.
echo ========================================
echo APK Built Successfully!
echo ========================================
echo.
echo Location: android\app\build\outputs\apk\release\app-release.apk
echo.
echo You can now install it on your device!
echo.
pause
