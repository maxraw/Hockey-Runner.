# START HERE — Hockey Runner MVP

## Команды из корня проекта

```bash
cd Hockey-Runner
npm install
npx expo install --fix
npm run relay
```

Оставьте relay-сервер открытым.

Во втором окне Terminal:

```bash
cd Hockey-Runner
npm run prebuild:ios
open ios/*.xcworkspace
```

Дальше запуск через Xcode.

## В Xcode

1. Откройте `ios/*.xcworkspace`, не `.xcodeproj`.
2. Выберите физический iPhone.
3. В `Signing & Capabilities` выберите свой Apple Team.
4. При необходимости поменяйте Bundle Identifier на уникальный.
5. Нажмите `Cmd + R`.

## Apple Configurator

Для первого теста Xcode проще и быстрее. Apple Configurator используйте после экспорта `.ipa`: подключите устройство, перетащите `.ipa` на устройство или используйте `Add > Apps > Choose from my Mac`.

