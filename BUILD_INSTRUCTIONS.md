# 🔥 EAS BUILD - ПОЛНАЯ ИНСТРУКЦИЯ ПО СБОРКЕ 2026

## ✅ ГОТОВАЯ КОНФИГУРАЦИЯ ДЛЯ СТАБИЛЬНОЙ СБОРКИ

Эта инструкция гарантирует успешную сборку Android APK в EAS Cloud без ошибок.

---

## 📋 ЧТО УЖЕ НАСТРОЕНО (НЕ МЕНЯТЬ):

### 1. **package.json**
```json
{
  "dependencies": {
    "expo": "~52.0.0",
    "expo-build-properties": "~0.13.0",
    "@react-native-async-storage/async-storage": "1.23.1",
    "nativewind": "4.0.36",
    "react-native-reanimated": "~3.16.0",
    "tailwindcss": "^3.4.17"
  }
}
```

**Важно:**
- ❌ **НЕ добавлять `lightningcss`** — ломает Linux сборку EAS
- ❌ **НЕ добавлять `react-native-mmkv`** — требует New Architecture
- ✅ **Использовать `@react-native-async-storage/async-storage`**

### 2. **app.json**
```json
{
  "expo": {
    "plugins": [
      [
        "expo-build-properties",
        {
          "ios": {
            "deploymentTarget": "15.1",
            "useFrameworks": "static",
            "newArchEnabled": false
          },
          "android": {
            "compileSdkVersion": 35,
            "targetSdkVersion": 35,
            "minSdkVersion": 24,
            "buildToolsVersion": "35.0.0",
            "enableProguardInReleaseBuilds": false,
            "enableShrinkResourcesInReleaseBuilds": false,
            "kotlinVersion": "2.0.21",
            "newArchEnabled": false
          }
        }
      ]
    ],
    "android": {
      "buildProperties": {
        "newArchEnabled": false,
        "compileSdkVersion": 35,
        "targetSdkVersion": 35,
        "minSdkVersion": 24
      }
    },
    "ios": {
      "buildProperties": {
        "newArchEnabled": false
      }
    }
  }
}
```

**Важно:**
- ✅ **New Architecture отключена** — для совместимости
- ✅ **Kotlin 2.0.21** — стабильная версия
- ✅ **Compile SDK 35** — требования Google Play 2026

### 3. **eas.json**
```json
{
  "build": {
    "preview": {
      "android": {
        "buildType": "apk",
        "gradleCommand": ":app:assembleRelease",
        "withoutCredentials": true,
        "image": "latest"
      },
      "node": "20.19.0",
      "env": {
        "NPM_CONFIG_LEGACY_PEER_DEPS": "true",
        "NODE_OPTIONS": "--max-old-space-size=4096"
      }
    }
  }
}
```

**Важно:**
- ✅ **`image: "latest"`** — свежие инструменты сборки
- ✅ **`NODE_OPTIONS: 4096`** — память для сборки
- ✅ **`NPM_CONFIG_LEGACY_PEER_DEPS: true`** — совместимость зависимостей

### 4. **babel.config.js**
```javascript
module.exports = function (api) {
  api.cache(true);

  return {
    presets: [
      [
        'babel-preset-expo',
        {
          jsxImportSource: 'nativewind',
        },
      ],
      'nativewind/babel',
    ],
    plugins: [
      [
        'react-native-reanimated/plugin',
        {
          globals: ['__scanCodes', '__scanOCR'],
          processNestedTransforms: true,
          disableProcessTransforms: false,
        },
      ],
    ],
    env: {
      production: {
        plugins: ['transform-remove-console'],
      },
    },
  };
};
```

**Важно:**
- ❌ **НЕ добавлять `unstable_transformProfile: 'hermes-stable'`** — ломает ворклеты

### 5. **metro.config.js**
```javascript
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, {
  input: './src/global.css',
});
```

**Важно:**
- ❌ **НЕ добавлять `configPath`** — только `input`

### 6. **android/build.gradle**
```gradle
buildscript {
    ext {
        kotlinVersion = findProperty('android.kotlinVersion') ?: '2.0.21'
    }
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
    dependencies {
        classpath('com.android.tools.build:gradle:8.2.2')
        classpath('com.facebook.react:react-native-gradle-plugin')
        classpath('org.jetbrains.kotlin:kotlin-gradle-plugin:2.0.21')
    }
}
```

**Важно:**
- ✅ **`gradlePluginPortal()`** — для Kotlin компилятора
- ✅ **Явная версия Kotlin** — 2.0.21

### 7. **android/gradle.properties**
```properties
newArchEnabled=false
android.kotlinVersion=2.0.21
org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m
USE_BRIDGE=true
```

---

## 🚀 ПОШАГОВАЯ ИНСТРУКЦИЯ ПО СБОРКЕ

### Шаг 1: Подготовка (локально)

```bash
# Очистка старых зависимостей
rm -rf node_modules package-lock.json

# Установка зависимостей
npm install --legacy-peer-deps

# Проверка конфигурации
npx expo config

# Проверка зависимостей
npx expo-doctor
```

### Шаг 2: Запуск сборки в EAS Cloud

```bash
# Сборка APK для тестирования (preview)
eas build --platform android --profile preview

# Или сборка для production
eas build --platform android --profile production
```

### Шаг 3: Мониторинг сборки

1. Открой https://expo.dev
2. Перейди в проект: **Феникс VPN (van21)**
3. Вкладка **Builds** — статус сборки
4. Кликни на сборку для просмотра логов

### Шаг 4: Скачивание APK

```bash
# Скачать последний APK
eas build:download --platform android --latest

# Или скачать конкретную сборку
eas build:download --platform android --id <BUILD_ID>
```

---

## 🔧 ВОЗМОЖНЫЕ ОШИБКИ И РЕШЕНИЯ

### Ошибка 1: lightningcss.linux-x64-gnu.node не найден

**Симптомы:**
```
Error: Cannot find module '../lightningcss.linux-x64-gnu.node'
```

**Решение:**
- ❌ Удалить `lightningcss` из `package.json`
- ✅ Использовать `nativewind: 4.0.36` (не имеет зависимости от lightningcss)

### Ошибка 2: react-native-mmkv ломает сборку

**Симптомы:**
```
Task :react-native-mmkv:compileReleaseJavaWithJavac FAILED
symbol: class NativeMmkvPlatformContextSpec
```

**Решение:**
- ❌ Удалить `react-native-mmkv` из `package.json`
- ✅ Использовать `@react-native-async-storage/async-storage`

### Ошибка 3: Kotlin compiler не найден

**Симптомы:**
```
Could not find org.jetbrains.kotlin:kotlin-compose-compiler-plugin-embeddable
```

**Решение:**
- ✅ Добавить `gradlePluginPortal()` в `android/build.gradle`
- ✅ Указать явную версию Kotlin: `2.0.21`

### Ошибка 4: Нехватка памяти при сборке

**Симптомы:**
```
Gradle build daemon disappeared unexpectedly (it may have been killed)
```

**Решение:**
- ✅ Добавить в `eas.json`: `"NODE_OPTIONS": "--max-old-space-size=4096"`
- ✅ Использовать `resourceClass: "medium"` или `"large"`

### Ошибка 5: Конфликты зависимостей

**Симптомы:**
```
Could not resolve all dependencies
```

**Решение:**
- ✅ Добавить в `eas.json`: `"NPM_CONFIG_LEGACY_PEER_DEPS": "true"`
- ✅ Использовать `npm install --legacy-peer-deps`

---

## 📊 МОНИТОРИНГ И ЛОГИ

```bash
# Посмотреть все сборки
eas build:list

# Посмотреть последнюю сборку
eas build:view --latest

# Логи последней сборки
eas build:logs --latest

# Отменить сборку
eas build:cancel <BUILD_ID>
```

---

## ⚡ БЫСТРЫЕ КОМАНДЫ

```bash
# Полная переустановка зависимостей
rm -rf node_modules package-lock.json && npm install --legacy-peer-deps

# Очистка кэша Metro
npx expo start -c

# Проверка проекта
npx expo-doctor

# Проверка конфигурации
npx expo config

# Сборка APK
eas build -p android --profile preview

# Скачать APK
eas build:download -p android --latest
```

---

## 🎯 РЕКОМЕНДАЦИИ

1. **Всегда используй `--legacy-peer-deps`** при установке
2. **Коммить `package-lock.json`** для воспроизводимости
3. **НЕ обновляй зависимости в день сборки** 😄
4. **Проверяй `npx expo-doctor`** после изменений
5. **Используй профиль `preview`** для тестов
6. **Сохраняй `NPM_CONFIG_LEGACY_PEER_DEPS=true`** в `eas.json`

---

## 🆘 ПОДДЕРЖКА

- **Документация EAS:** https://docs.expo.dev/build/introduction/
- **Discord Expo:** https://discord.gg/expo
- **Форумы:** https://forums.expo.dev/
- **Статус EAS:** https://status.expo.dev/

---

## 📦 АРХИТЕКТУРА СБОРКИ

```
┌─────────────────────────────────────────────────────────┐
│                    EAS BUILD CLOUD                      │
├─────────────────────────────────────────────────────────┤
│  1. Загрузка архива проекта                             │
│  2. Установка Node.js 20.19.0                           │
│  3. npm install --legacy-peer-deps                      │
│  4. npx expo export:embed                               │
│  5. Gradle сборка (Android)                             │
│  6. Подпись APK                                         │
│  7. Публикация результата                               │
└─────────────────────────────────────────────────────────┘
```

**Время сборки:** 10-20 минут

---

**ВСЁ ГОТОВО! 🎉**

Сборка настроена и протестирована. Просто запусти `eas build --platform android --profile preview`
