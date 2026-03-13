# 🔥 ИНСТРУКЦИЯ: Установка libbox.aar для sing-box VPN

## ЧТО ПРОИЗОШЛО:

Твой проект требует **libbox.aar** - это нативная библиотека sing-box для Android VPN.
Без неё VPN не будет работать на уровне системы (только HTTP proxy).

---

## 📥 ШАГ 1: СКАЧАЙ libbox.aar

### Вариант A: Скачать с F-Droid (РЕКОМЕНДУЕТСЯ)

1. Открой: https://f-droid.org/packages/io.nekohasekai.sfa/
2. Нажми "Download APK"
3. Скачай последнюю версию **SFA (sing-box for Android)**

### Вариант B: Скачать с GitHub Releases

1. Открой: https://github.com/SagerNet/sing-box/releases
2. Найди последнюю версию (например v1.10.0)
3. Скачай файл: `SFA-1.10.0-universal.apk`

---

## 🔧 ШАГ 2: ИЗВЛЕКИ libbox.aar

### На Windows:

1. Установи 7-Zip если нет: https://www.7-zip.org/
2. Кликни правой кнопкой на скачанный APK файл
3. Выбери "7-Zip" → "Open archive"
4. Внутри найди папку `lib/`
5. В папке `lib/` найди файл `libbox.aar` или `libbox.so`
6. Скопируй его в свой проект

### Если нет libbox.aar внутри APK:

sing-box может быть скомпилирован статически. В этом случае:

1. Скачай **sing-box ядро**: https://github.com/SagerNet/sing-box/releases
2. Файл: `sing-box-1.10.0-linux-arm64.tar.gz`
3. Распакуй и положи в `android/app/src/main/assets/sing-box`

---

## 📁 ШАГ 3: ПОЛОЖИ ФАЙЛ В ПРОЕКТ

Создай папку и положи файл:

```
D:\OSPanel\domains\proxi-mob.loc\android\app\libs\libbox.aar
```

Структура должна быть:
```
proxi-mob.loc/
├── android/
│   └── app/
│       └── libs/
│           └── libbox.aar  ← СЮДА
```

---

## 🔄 ШАГ 4: ОБНОВИ package.json

Добавь скрипт для автоматической загрузки:

```json
{
  "scripts": {
    "postinstall": "node scripts/download-libbox.js && patch-package"
  }
}
```

---

## 📝 ШАГ 5: ЗАКОММИТЬ В GIT

```bash
cd D:\OSPanel\domains\proxi-mob.loc

# Добавь файл
git add android/app/libs/libbox.aar

# Закоммить
git commit -m "Add libbox.aar for sing-box VPN functionality"

# Запушь
git push
```

---

## ✅ ШАГ 6: ПРОВЕРЬ СБОРКУ

```bash
# Локальная проверка
npx expo export --platform android

# EAS сборка
eas build --platform android --profile preview
```

---

## 🚀 ЧТО БУДЕТ ПОСЛЕ УСТАНОВКИ:

✅ **Полноценный VPN туннель** на уровне системы
✅ **Все приложения** работают через VPN (не только приложение)
✅ **Обход блокировок** для Instagram, YouTube, Telegram
✅ **VLESS, VMess, Trojan** поддержка
✅ **Маршрутизация** через sing-box rules

---

## ⚠️ ЕСЛИ ЧТО-ТО ПОШЛО НЕ ТАК:

### Ошибка: "Failed to transform libbox.aar"

**Решение:** Файл битый или пустой. Скачай заново.

### Ошибка: "Could not resolve io.github.nekohasekai:libbox"

**Решение:** Удали эту строку из `android/app/build.gradle`:
```gradle
implementation("io.github.nekohasekai:libbox:1.9.6")
```

Используй вместо этого:
```gradle
implementation files('libs/libbox.aar')
```

### Ошибка: "VpnModule not found"

**Решение:** Убедись что `VpnModule.kt` находится в:
`android/app/src/main/java/com/phoenix/vpn/VpnModule.kt`

---

## 📞 ПОДДЕРЖКА:

Если возникли проблемы - создай issue на GitHub:
https://github.com/wysiwygwebbuilder

---

**УДАЧИ! 🎉**

После установки libbox.aar - VPN будет работать на 100%!
