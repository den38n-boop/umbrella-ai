# Проверка изменений — 6 октября 2026

Исходный коммит: `c2d0dbb`. Прочитаны все исходные файлы: `server.js`, `package.json`, `world.json`, `agents.json`, `public/index.html`, manifest и README.

Первопричины: `apply()` добавлял сообщения модели через spread без author/channel validation; prompt получал все приватные сведения и hidden truth; `/api/start` сбрасывал сессию на reload; клиент заменял историю последними 12 сообщениями; отсутствовали SW, личные чаты и проверяемое восстановление. README и клиентская ошибка указывали неправильный OPENAI_API_KEY.

## Фактически выполнено

- `npm install`: 0 уязвимостей на момент установки; добавлен lockfile для `npm ci`.
- `npm run check`: синтаксические проверки server, simulation, save, app и service worker.
- `npm test`: 28 тестов server/API/state. Модель подставлена тестовой функцией, внешние AI-вызовы в тестах не выполняются.
- Блокируются все перечисленные player aliases, System и неизвестные авторы. Отдельный HTTP integration test возвращает злонамеренные AI-сообщения, проверяет отсутствие их в истории и буквальное сохранение пользовательского текста.
- Проверены channel/actor isolation, ограничение отношений и памяти, отсутствие скрытой истины/чужой переписки в NPC context, запрет редактирования пользовательских сообщений.
- Проверены malformed JSON retry, AI failure fallback, идемпотентность start/message, восстановление после создания нового серверного процесса, повреждённый/чужой snapshot, concurrent requests и tick cooldown.
- Проверен транспорт сохранений при длинных русскоязычных историях.
- `npm start`: приложение действительно запускается на localhost:3000.
- Headless Chromium: 1280×900 desktop, 390×844 mobile; горизонтального overflow нет. При уменьшении viewport до 390×460 поле ввода находится в пределах экрана (y=387, height=35). Это имитация доступной высоты, а не физическая iOS-клавиатура.
- Браузер: собственное сообщение ровно одно, reload сохраняет историю, черновик восстанавливается, service worker управляет страницей, offline reload открывает оболочку и чаты; ошибок JS нет.
- Прежний рабочий Render `/api/health` ответил `ok:true, ai:true, provider:openrouter`. Это прежняя версия, ответ не доказывает работоспособность новой генерации.

Браузерный сценарий сохранён в `scripts/browser-smoke.cjs`. Он использует отдельно доступный `playwright` (не runtime dependency приложения), переменные `PLAYWRIGHT_MODULE`, `PLAYWRIGHT_BROWSERS_PATH`, `BROWSER_ARTIFACT_DIR`, `BASE_URL`. Запускать против локального сервера без AI-ключа: сценарий проверяет корректное сохранение при отсутствии провайдера.

## Ещё не подтверждено

- Реальные ответы нового кода от OpenRouter: локального API-ключа нет. Проверка provider failure и JSON validation выполнена, но художественная достоверность ответов и поведение выбранной бесплатной модели требуют live-проверки после деплоя.
- Физический iPhone/Safari, safe areas на устройстве, установка и запуск с экрана Домой, настоящее поведение клавиатуры/уведомлений.
- Обновление исходного Render: у подключённого GitHub-аккаунта право READ на исходный репозиторий, поэтому изменения передаются через fork/PR; production не обновлён.

Пределы: последние 600 сообщений и до 200 КБ UTF-8 истории, 18 memories на NPC, бесплатные квоты, холодный запуск Render, отсутствие симуляции/push при закрытом клиенте. Полный художественный аудит длительной игры не выполнен.

## Изменённые и добавленные файлы

- `server.js`
- `lib/simulation.js`, `lib/save.js`
- `public/index.html`, `public/app.js`, `public/style.css`
- `public/manifest.webmanifest`, `public/sw.js`
- `public/icon.svg`, `public/icon-192.png`, `public/icon-512.png`
- `package.json`, `package-lock.json`
- `.env.example`, `.gitignore`
- `test/api.test.js`, `test/simulation.test.js`, `test/retention.test.js`
- `scripts/browser-smoke.cjs`
- `README.md`, `docs/VERIFICATION.md`

`world.json` и `agents.json` прочитаны и сохранены без изменений; код использует существующие определения мира и характеров.
