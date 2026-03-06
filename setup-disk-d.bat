@echo off
echo ========================================
echo Настройка сборки на диске D
echo ========================================

REM Создаем папки на D
echo Creating folders on D:...
mkdir D:\npm-cache 2>nul
mkdir D:\npm-tmp 2>nul
mkdir D:\gradle-cache 2>nul
mkdir D:\android-build 2>nul

REM Настраиваем NPM
echo Configuring NPM...
call npm config set cache D:\npm-cache --global
call npm config set store D:\npm-cache --global

REM Устанавливаем переменные окружения для текущей сессии
echo Setting environment variables...
set GRADLE_USER_HOME=D:\.gradle
set ANDROID_SDK_ROOT=D:\android-sdk
set TMPDIR=D:\npm-tmp
set TEMP=D:\npm-tmp
set TMP=D:\npm-tmp
set NODE_OPTIONS=--max-old-space-size=2048

REM Очищаем кэш NPM на C
echo Cleaning NPM cache on C:...
call npm cache clean --force 2>nul

REM Удаляем node_modules если есть (освобождаем место)
if exist "node_modules" (
    echo Removing node_modules to free space...
    rmdir /s /q node_modules 2>nul
)

echo.
echo ========================================
echo Done! Now run: npm install --legacy-peer-deps
echo ========================================
echo.
pause
