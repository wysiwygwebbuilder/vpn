@echo off
set GRADLE_USER_HOME=D:\.gradle
set NODE_ENV=production
set GRADLE_OPTS=-Xmx2048m
cd android
call gradlew.bat assembleRelease --no-daemon --max-workers=2
cd ..
echo.
echo APK: android\app\build\outputs\apk\release\app-release.apk
pause
