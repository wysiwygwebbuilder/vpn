@echo off
echo Setting up environment for D: drive...

REM NPM settings
set npm_config_cache=D:\npm-cache
set npm_config_prefix=D:\npm-global

REM Gradle settings
set GRADLE_USER_HOME=D:\.gradle
set GRADLE_OPTS=-Xmx2048m -Dorg.gradle.daemon=true -Dorg.gradle.caching=true

REM Android settings
set ANDROID_SDK_ROOT=D:\android-sdk
set ANDROID_HOME=D:\android-sdk

echo Environment configured!
echo.
echo Now installing dependencies...
npm install --legacy-peer-deps

