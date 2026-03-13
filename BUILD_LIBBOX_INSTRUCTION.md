# Инструкция по сборке libbox.aar для Феникс VPN

## Проблема
Проект использует `libbox.CommandServer` и `libbox.CommandServerHandler` из sing-box библиотеки.
Официально libbox.aar не распространяется в готовом виде — только .so файлы в APK.

## Решение 1: Сборка через Docker (Рекомендуется)

### Требования:
- Docker Desktop для Windows
- 10 GB свободного места
- 30-60 минут времени

### Шаги:

1. **Установите Docker Desktop**
   - Скачайте с https://www.docker.com/products/docker-desktop/
   - Установите и перезагрузите компьютер

2. **Склонируйте sing-box**
   ```bash
   git clone https://github.com/SagerNet/sing-box.git
   cd sing-box
   git checkout v1.10.0
   git submodule update --init --recursive
   ```

3. **Соберите libbox.aar через Docker**
   ```bash
   # Создайте Docker образ для сборки
   docker build -t sing-box-builder -f Dockerfile.libbox .
   
   # Запустите сборку
   docker run --rm -v ${PWD}:/src sing-box-builder
   ```

4. **Скопируйте libbox.aar в проект**
   ```bash
   cp clients/android/app/libs/libbox.aar D:/OSPanel/domains/proxi-mob.loc/android/app/libs/
   ```

## Решение 2: Использование готового билда (Быстро)

1. **Скачайте SFA APK**
   - https://github.com/SagerNet/sing-box/releases/download/v1.10.0/SFA-1.10.0-universal.apk

2. **Извлеките .so файлы**
   - Откройте APK в 7-Zip
   - Извлеките `lib/arm64-v8a/libbox.so` (25.88 MB)

3. **НО ЭТО НЕ СРАБОТАЕТ!**
   - .so файл не содержит Java API (CommandServer, CommandServerHandler)
   - Нужен полный AAR с Java классами

## Решение 3: Скачать из F-Droid билдов

1. **Посетите F-Droid**
   - https://f-droid.org/packages/io.nekohasekai.sfa/

2. **Скачайте последнюю версию**

3. **Извлеките libbox.aar**
   - F-Droid строит AAR отдельно
   - Проверьте https://monitor.f-droid.org/builds/io.nekohasekai.sfa/

## Решение 4: Использовать альтернативную реализацию

Если libbox.aar недоступен, можно переписать VPN сервис на чистом Java/Kotlin:

1. Удалить зависимость от libbox
2. Использовать нативный Android VpnService API
3. Интегрировать sing-box ядро через JNI вручную

Это требует значительных изменений в коде.

## После установки libbox.aar

1. **Очистите Gradle кэш**
   ```bash
   cd android
   gradlew clean
   ```

2. **Соберите проект**
   ```bash
   eas build --platform android --profile preview
   ```

## Проверка libbox.aar

Файл должен содержать:
- AndroidManifest.xml
- classes.jar (с Java классами CommandServer, CommandServerHandler)
- jni/arm64-v8a/libbox.so
- jni/armeabi-v7a/libbox.so
- jni/x86/libbox.so
- jni/x86_64/libbox.so

Размер: ~30-40 MB
