# Umbrella Academy AI Simulation — Render build

Это серверная версия. Никаких глав/сцен/готовых диалогов нет.

## Render
Build Command: `npm install`
Start Command: `npm start`

Environment variables:
- `OPENAI_API_KEY` — ваш API key (никогда не кладите его в GitHub)
- `OPENAI_MODEL` — необязательно, по умолчанию `gpt-5-mini`

После деплоя откройте `/api/health`: `{"ok":true,"ai":true}` означает, что AI подключён.

Важно: текущая память хранится в памяти процесса Render. Для долговременной production-памяти нужен Redis/Postgres.
