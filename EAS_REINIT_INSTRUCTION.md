# 🔄 ПЕРЕИНИЦИАЛИЗАЦИЯ EAS ПРОЕКТА

## Проблема
Старый проект был на аккаунте `web-impuls3`, новый аккаунт `web-impuls4`

## ✅ ЧТО СДЕЛАНО

1. **Обновлён `app.json`** — удалён старый projectId и owner
2. **Обновлён `eas-build-pre-install.sh`** — теперь libbox.aar скачивается автоматически в облаке

---

## 📋 СПИСОК КОМАНД ДЛЯ ВЫПОЛНЕНИЯ

### Шаг 1: Выйти из старого аккаунта
```bash
npx eas logout
```

### Шаг 2: Войти под новым аккаунтом
```bash
npx eas login
```
Введи:
- Username: `web-impuls4`
- Password: `Valeriyadoch1979`

### Шаг 3: Проверить кто ты
```bash
npx eas whoami
```
Должно вывести: `web-impuls4`

### Шаг 4: Создать новый EAS проект
```bash
npx eas init --id
```
- Нажми Enter для авто-имени или введи своё
- Запомни новый projectId из output

### Шаг 5: Закоммитить изменения
```bash
git add app.json eas-build-pre-install.sh
git commit -m "Init new EAS project for web-impuls4"
git push
```

### Шаг 6: Запустить сборку
```bash
npx eas build --platform android --profile preview
```

---

## ☁️ КАК РАБОТАЕТ АВТО-СКАЧИВАНИЕ LIBBOX

Теперь при каждой сборке в облаке EAS:

1. **Запускается `eas-build-pre-install.sh`** (перед `npm install`)
2. **Проверяет** есть ли `android/app/libs/libbox.aar`
3. **Если нет** — скачивает с GitHub (61 MB)
4. **Проверяет** что файл содержит `classes.jar`
5. **Продолжает** сборку

### Преимущества:
- ✅ Не нужно хранить 61 MB файл в Git
- ✅ Файл всегда актуальный
- ✅ Сборка работает и локально и в облаке

---

## 🐛 ЕСЛИ ЧТО-ТО ПОШЛО НЕ ТАК

### Ошибка "Project not found"
```bash
# Удалишь projectId из app.json вручную и повтори шаг 4
```

### Ошибка "Failed to download libbox.aar"
```bash
# Проверь интернет в логах EAS
# Или закоммить libbox.aar в Git:
git add android/app/libs/libbox.aar
git commit -m "Add libbox.aar"
git push
```

### Ошибка "Permission denied" на eas-build-pre-install.sh
```bash
chmod +x eas-build-pre-install.sh
git add eas-build-pre-install.sh
git commit -m "Make pre-install script executable"
git push
```

---

## 📊 ПРОВЕРКА ПЕРЕД СБОРКОЙ

```bash
# 1. Проверить кто logged in
npx eas whoami

# 2. Проверить что libbox.aar существует локально
ls -lh android/app/libs/libbox.aar

# 3. Проверить что скрипт исполняемый
ls -l eas-build-pre-install.sh

# 4. Проверить app.json что нет projectId
grep -c "projectId" app.json  # должно быть 0
```

---

## 🎯 ИТОГ

После выполнения всех команд:
- ✅ EAS проект привязан к `web-impuls4`
- ✅ libbox.aar скачивается автоматически в облаке
- ✅ Сборка должна пройти успешно
