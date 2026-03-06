# Феникс VPN - React Native Приложение

Полноценное мобильное приложение VPN на React Native с использованием Expo.

## 🚀 Технологии

- **React Native** - кроссплатформенная разработка
- **Expo** - инструмент разработки и сборки
- **Expo Router** - файловая навигация (как Next.js)
- **NativeWind** - Tailwind CSS для React Native
- **MMKV** - быстрое хранилище данных
- **TypeScript** - типизация

## 📁 Структура проекта

```
phoenix-vpn/
├── app/                      # Expo Router (файловая навигация)
│   ├── _layout.tsx          # Корневой layout
│   ├── index.tsx            # Главный экран
│   └── add-list.tsx         # Экран добавления списка
├── src/
│   ├── components/          # UI компоненты
│   │   ├── ServerGroupCard.tsx
│   │   └── ServerItem.tsx
│   ├── services/            # Сервисы
│   │   ├── storage.ts       # MMKV хранилище
│   │   └── vpnService.ts    # VPN сервис (заглушка)
│   └── utils/               # Утилиты
│       └── vless.ts         # Парсинг VLESS ссылок
├── assets/                   # Ресурсы (иконки, сплэш)
├── tailwind.config.js       # Конфигурация Tailwind
├── babel.config.js          # Конфигурация Babel
├── metro.config.js          # Конфигурация Metro
└── package.json
```

## 🛠 Установка

```bash
# Установка зависимостей
npm install

# Запуск сервера разработки
npm start

# Запуск на Android
npm run android

# Запуск на iOS (требуется macOS)
npm run ios
```

## 📝 Основные возможности

1. **Загрузка серверов** из публичных источников
2. **Проверка доступности** серверов (ping)
3. **Пользовательские списки** серверов
4. **Редактирование** конфигураций
5. **Сохранение** состояния в MMKV

## 🔧 VPN Функционал

### Текущее состояние
VPN сервис реализован как заглушка. Для реальной работы необходимо интегрировать нативное ядро.

### План интеграции VPN

#### Android (Kotlin)
1. Интегрировать Xray-core как AAR библиотеку
2. Реализовать Android VpnService
3. Настроить Tun2Socks для перехвата трафика
4. Создать React Native модуль (VpnModule)

#### iOS (Swift)
1. Создать Packet Tunnel Provider
2. Интегрировать Xray-core (XrayKit)
3. Настроить React Native модуль

### Готовые решения
- [2Ray](https://github.com/2dust/v2rayNG) - Android клиент
- [v2box](https://github.com/v2box/v2box) - iOS клиент

## 📱 Deep Linking

Приложение поддерживает открытие ссылок:
- `phoenix-vpn://` - схема приложения
- `vless://` - конфигурации серверов

## 🎨 Дизайн

- **Цвета**: Оранжевая тема (#f97316)
- **Иконки**: lucide-react-native
- **Стилизация**: NativeWind (Tailwind CSS)

## 📦 Сборка

### Android APK
```bash
eas build --platform android
```

### iOS IPA
```bash
eas build --platform ios
```

## 🔐 Безопасность

- Хранение конфигураций в зашифрованном MMKV
- Поддержка Reality протокола
- Проверка доступности серверов

## 📄 Лицензия

Apache 2.0
