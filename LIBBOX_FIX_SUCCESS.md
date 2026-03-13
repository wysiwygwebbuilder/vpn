# ✅ ОШИБКА LIBBOX.AAR ИСПРАВЛЕНА!

## Проблема
```
> Task :app:processReleaseResources FAILED
FAILURE: Build failed with an exception.
* What went wrong:
Execution failed for task ':app:processReleaseResources'.
> Could not resolve all files for configuration ':app:releaseRuntimeClasspath'.
   > Failed to transform libbox.aar to match attributes {artifactType=android-compiled-dependencies-resources}.
```

## Причина
Файл `libbox.aar` который был в проекте — **неправильный**. Он содержал только `.so` файлы без Java классов (CommandServer, CommandServerHandler), которые требуются в коде `RouteVpnService.kt`.

## Решение
Скачан правильный `libbox.aar` из проекта [xinggaoya/sing-box-windows-android](https://github.com/xinggaoya/sing-box-windows-android):

**Путь:** `android/app/libs/libbox.aar`  
**Размер:** 61.31 MB  
**Содержимое:**
- AndroidManifest.xml ✓
- classes.jar (79 KB — содержит Java классы libbox.CommandServer, libbox.CommandServerHandler) ✓
- jni/armeabi-v7a/libbox.so ✓
- jni/arm64-v8a/libbox.so ✓
- jni/x86/libbox.so ✓
- jni/x86_64/libbox.so ✓
- proguard.txt ✓
- R.txt ✓

## Что было сделано

### 1. Скачан правильный libbox.aar
```bash
node scripts/download-libbox-https.js
```

### 2. Очищен кэш Gradle
```bash
cd android
gradlew clean
```

### 3. Запущена сборка
```bash
gradlew assembleDebug
# или
gradlew assembleRelease
```

## Результат
✅ **BUILD SUCCESSFUL** — сборка прошла успешно!

## Скрипты для будущей переустановки

Если понадобится переустановить libbox.aar:

```bash
# Скачать правильный libbox.aar
node scripts/download-libbox-https.js

# Проверить содержимое
node scripts/check-aar.js

# Очистить и пересобрать
cd android && gradlew clean && gradlew assembleRelease
```

## Примечания

1. **Почему не официальный AAR?**  
   Официально sing-box не распространяет готовый `libbox.aar`. Они используют статическую компоновку в APK.

2. **Источник libbox.aar**  
   Файл взят из проекта [xinggaoya/sing-box-windows-android](https://github.com/xinggaoya/sing-box-windows-android) — это форк sing-box с готовой Android библиотекой.

3. **Размер файла**  
   Правильный libbox.aar должен быть ~60 MB (содержит Java классы + native библиотеки для всех архитектур).

4. **Если сборка упадёт снова**  
   - Проверить размер файла: должен быть > 50 MB
   - Проверить содержимое: `node scripts/check-aar.js`
   - Очистить кэш: `cd android && gradlew clean`
   - Попробовать снова: `gradlew assembleRelease --no-daemon`

## Контакты
Если возникнут проблемы — проверить логи сборки в:
- `android/app/build/outputs/apk/release/`
- `android/app/build/logs/`
