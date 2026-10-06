import express from 'express';
import OpenAI from 'openai';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { freshState, message, parseAIOutput, applyAIOutput, actorContext, selectActors, advanceWorld, publicState, validChannel, SYSTEM } from './lib/simulation.js';
import { saveCodec } from './lib/save.js';

export function createApp({ generate, secret = process.env.SAVE_SECRET || process.env.OPENROUTER_API_KEY || randomBytes(32).toString('hex'), now = () => Date.now() } = {}) {
  const app = express();
  const sessions = new Map();
  const busy = new Set();
  const codec = saveCodec(secret);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '900kb' }));
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
    if (req.method === 'POST' && req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({ error: 'Недопустимый источник запроса.' });
    next();
  });
  app.use(express.static(fileURLToPath(new URL('./public', import.meta.url)), { maxAge: 0 }));
  const completion = generate || (async payload => {
    if (!process.env.OPENROUTER_API_KEY) throw new Error('ai_unconfigured');
    const client = new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY, baseURL: 'https://openrouter.ai/api/v1', timeout: 20000, maxRetries: 0 });
    const response = await client.chat.completions.create({
      model: process.env.OPENROUTER_MODEL || 'openrouter/free',
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: JSON.stringify(payload) }],
      response_format: { type: 'json_object' }, temperature: 0.8, max_tokens: 1000
    });
    return response.choices?.[0]?.message?.content || '';
  });
  async function simulate(state, event) {
    let aiStatus = 'ok';
    for (const actor of selectActors(state, event)) {
      const context = actorContext(state, actor, event.channel, event);
      let output;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          output = parseAIOutput(await completion({ ...context, retry: attempt ? 'Предыдущий ответ не был корректным JSON. Верни только JSON с массивом messages.' : undefined }));
          break;
        } catch (error) {
          // Log only an allowlisted category, never SDK request bodies, tokens or game text.
          const category = error.message === 'invalid_ai_json' || error instanceof SyntaxError || error.message === 'invalid_ai_structure' ? 'invalid_json' : 'provider_unavailable';
          if (category !== 'invalid_json' || attempt === 1) { console.warn(`AI: ${category}`); aiStatus = 'unavailable'; break; }
        }
      }
      if (output) applyAIOutput(state, output, { actor, channel: event.channel });
    }
    return aiStatus;
  }
  function reply(res, id, state, aiStatus = 'idle') {
    state.lastAccess = now();
    res.json({ sessionId: id, ...publicState(state), save: codec.encode(id, state), aiStatus });
  }
  function prune() {
    for (const [id, state] of sessions) if (!busy.has(id) && now() - state.lastAccess > 3600000) sessions.delete(id);
    if (sessions.size >= 200) {
      const candidate = [...sessions].filter(([id]) => !busy.has(id)).sort((a, b) => a[1].lastAccess - b[1].lastAccess)[0];
      if (candidate) sessions.delete(candidate[0]);
    }
  }
  const route = handler => async (req, res, next) => {
    const id = req.body?.sessionId;
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(id)) return res.status(400).json({ error: 'Некорректная сессия.' });
    if (busy.has(id)) return res.status(409).json({ error: 'Дождитесь завершения предыдущего сообщения.' });
    busy.add(id);
    try { await handler(req, res, id); } catch (error) { next(error); } finally { busy.delete(id); }
  };
  function existing(req, res, id) {
    if (sessions.has(id)) return sessions.get(id);
    if (req.body.save) {
      try { const state = codec.decode(id, req.body.save); prune(); sessions.set(id, state); return state; }
      catch { res.status(422).json({ error: 'Сохранение не удалось проверить. Локальная переписка остаётся на устройстве.', code: 'INVALID_SAVE' }); return; }
    }
    res.status(410).json({ error: 'Сессия отсутствует. Восстановите сохранение или начните новую игру.', code: 'SESSION_MISSING' });
  }
  app.post('/api/start', route(async (req, res, id) => {
    let state = sessions.get(id);
    if (!state && req.body.save) { state = existing(req, res, id); if (!state) return; }
    if (!state) {
      prune(); state = freshState(); sessions.set(id, state);
      message(state, 'Five', 'Где ты?', 'Five');
      message(state, 'Five', 'Алина?', 'Five');
      message(state, 'Five', 'Ответь.', 'Five');
    }
    reply(res, id, state);
  }));
  app.post('/api/message', route(async (req, res, id) => {
    const { text, channel = 'group', requestId } = req.body;
    if (typeof text !== 'string' || !text.trim() || text.length > 3000 || !validChannel(channel) || typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(requestId)) return res.status(400).json({ error: 'Проверьте сообщение, чат и идентификатор запроса (до 3000 символов).' });
    const state = existing(req, res, id); if (!state) return;
    if (state.processed.includes(requestId)) return reply(res, id, state);
    if (now() - (state.lastUserAt || 0) < 1500) return res.status(429).json({ error: 'Подождите секунду перед следующим сообщением.' });
    state.lastUserAt = now();
    state.processed = [...state.processed, requestId].slice(-100);
    // The only source of player messages is this validated HTTP endpoint.
    message(state, 'Alina', text, channel, { requestId });
    const event = { type: 'USER_MESSAGE', author: 'Alina', text, channel };
    advanceWorld(state, event);
    reply(res, id, state, await simulate(state, event));
  }));
  app.post('/api/tick', route(async (req, res, id) => {
    const state = existing(req, res, id); if (!state) return;
    if (now() - state.lastTick < 90000) return reply(res, id, state);
    state.lastTick = now();
    const event = { type: 'SIMULATION_TICK', channel: 'group' };
    advanceWorld(state, event);
    reply(res, id, state, await simulate(state, event));
  }));
  app.get('/api/health', (req, res) => res.json({ ok: true, ai: !!process.env.OPENROUTER_API_KEY, provider: 'openrouter', model: process.env.OPENROUTER_MODEL || 'openrouter/free', durableSave: !!(process.env.SAVE_SECRET || process.env.OPENROUTER_API_KEY) }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const badRequest = error.type === 'entity.parse.failed' || error.type === 'entity.too.large';
    res.status(badRequest ? 400 : 500).json({ error: badRequest ? 'Некорректный или слишком большой запрос.' : 'Не удалось обработать запрос. Попробуйте ещё раз.' });
  });
  return app;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = process.env.PORT || 3000;
  createApp().listen(port, () => console.log(`Umbrella simulation on ${port} via OpenRouter`));
}
