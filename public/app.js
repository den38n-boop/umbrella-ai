const $ = id => document.getElementById(id);
const CACHE_KEY = 'ua_scene_v3';
let cached;
try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch {}
// Carry forward the authenticated snapshot; the server migrates old messenger history.
let legacy;
if (!cached) { try { legacy = JSON.parse(localStorage.getItem('ua_game_v2') || 'null'); } catch {} }
let sid = cached?.sessionId || legacy?.sessionId || crypto.randomUUID();
let events = cached?.events || [], save = cached?.save || legacy?.save || '';
let scene = cached?.scene || {}, inventory = cached?.inventory || [], objects = cached?.nearbyObjects || [], exits = cached?.exits || [];
let delivered = new Set(cached?.delivered || events.map(e => e.id));
let draft = cached?.draft || '', pending = cached?.pending || null;
let working = false, restored = false, storageWarned = false;
let renderedIds = new Set();
const initials = { Five: 'F', Klaus: 'K', Diego: 'D', Luther: 'L', Allison: 'A', Viktor: 'V', Lila: 'L', '08': '08' };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const gameTime = at => new Date(at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
function node(tag, cls, text) { const n = document.createElement(tag); n.className = cls; if (text !== undefined) n.textContent = text; return n; }
function persist() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ version: 3, sessionId: sid, events, save, scene, inventory, nearbyObjects: objects, exits, delivered: [...delivered], draft, pending })); }
  catch { if (!storageWarned) { storageWarned = true; banner('Не удалось сохранить историю на устройстве. Скачайте сохранение в настройках.'); } }
}
function banner(text, retry = false) {
  $('banner').replaceChildren(document.createTextNode(text)); $('banner').hidden = false;
  if (retry) { const b = node('button', '', 'Повторить'); b.onclick = () => pending ? sendPending() : connect(); $('banner').append(b); }
}
function renderScene() {
  $('location').textContent = scene.locationName || 'Академия · гостиная';
  $('panel-location').textContent = (scene.locationName || 'Академия · гостиная').split(' · ').at(-1);
  $('situation').textContent = scene.situation || 'Из коридора слышны часы.';
  $('game-time').textContent = gameTime(scene.time || Date.UTC(2019, 3, 1, 23, 47));
  const present = (scene.presentCharacters || ['Alina','Five','Klaus']).filter(a => a !== 'Alina');
  $('present-short').textContent = present.join(', ') || 'никого';
  $('present').replaceChildren();
  for (const a of present) {
    const row = node('div', 'present-row'), copy = node('div', '');
    copy.append(node('strong', '', a), node('small', '', scene.characterStates?.[a]?.activity || 'рядом'));
    row.append(node('span', `avatar ${a}`, initials[a]), copy); $('present').append(row);
  }
  if (!present.length) $('present').append(node('div', 'empty-item', 'Ты здесь одна.'));
  for (const [id, data, empty] of [['inventory', inventory, 'Пока ничего.'], ['objects', objects, 'Ничего заметного.'], ['exits', exits, 'Выход не виден.']]) {
    $(id).replaceChildren(); for (const item of data) $(id).append(node('div', id === 'exits' ? 'exit' : 'item', item.name));
    if (!data.length) $(id).append(node('div', 'empty-item', empty));
  }
}
function renderHistory(forceBottom = false) {
  const history = $('history');
  const oldTop = history.scrollTop;
  const nearBottom = forceBottom || history.scrollHeight - history.scrollTop - history.clientHeight < 90;
  history.replaceChildren();
  const visible = events.filter(e => delivered.has(e.id));
  if (pending && !visible.some(e => e.requestId === pending.requestId)) visible.push({ type: 'player_input', actor: 'Alina', text: pending.text, time: scene.time, pending: true });
  let room = null;
  for (const e of visible) {
    const fresh = e.id && !renderedIds.has(e.id) && e.source !== 'player' ? ' fresh' : '';
    if (e.location && e.location !== room) { room = e.location; history.append(node('div', 'scene-divider', `${gameTime(e.time)} / ${(e.locationName || 'Академия').toLocaleUpperCase('ru-RU')}`)); }
    if (e.type === 'player_input') {
      const block = node('div', 'event player' + fresh), bubble = node('div', 'bubble');
      bubble.append(node('div', 'actor', 'АЛИНА · ТВОЙ ХОД'), node('div', 'event-text', e.text), node('div', 'event-time', `${gameTime(e.time)}${e.pending ? ' · сохраняем' : ''}`)); block.append(bubble); history.append(block);
    } else if (e.type === 'dialogue') {
      const block = node('div', 'event dialogue' + fresh), bubble = node('div', 'bubble');
      bubble.append(node('div', 'actor', e.actor), node('div', 'event-text', e.text), node('div', 'event-time', gameTime(e.time)));
      block.append(node('span', `avatar ${e.actor}`, initials[e.actor] || '·'), bubble); history.append(block);
    } else if (e.type === 'action') {
      // Player actions are already represented by the exact input. NPC actions get a separate stage direction.
      if (e.actor !== 'Alina') history.append(node('div', 'event action' + fresh, e.text));
    } else if (e.type === 'phone') {
      const block = node('div', 'event phone' + fresh); block.append(node('div', 'event-label', `▣ ТЕЛЕФОН · ${e.actor === 'Alina' ? 'ИСХОДЯЩЕЕ' : 'ВХОДЯЩЕЕ'} · ${e.actor || 'АРХИВ'}`), node('div', 'event-text', e.text), node('div', 'event-time', gameTime(e.time))); history.append(block);
    } else if (e.type === 'environment' || e.type === 'anomaly') {
      const block = node('div', `event ${e.type}${fresh}`); block.append(node('div', 'event-label', e.type === 'anomaly' ? 'ЧТО-ТО НЕ ТАК' : 'СЦЕНА'), node('div', 'event-text', e.text)); history.append(block);
    }
  }
  renderedIds = new Set(visible.map(e => e.id).filter(Boolean));
  if (nearBottom) history.scrollTop = history.scrollHeight; else history.scrollTop = oldTop;
  $('new-events').hidden = nearBottom;
}
async function call(path, data = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 95000);
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sid, save, ...data }), signal: controller.signal });
    const j = await r.json(); if (!r.ok) { const e = Error(j.error || 'Не удалось продолжить сцену.'); e.code = j.code; throw e; } return j;
  } finally { clearTimeout(timer); }
}
function notify(e) {
  if (e.type === 'phone' && document.hidden && 'Notification' in window && Notification.permission === 'granted') navigator.serviceWorker?.ready.then(reg => reg.showNotification(`Телефон · ${e.actor}`, { body: e.text, tag: 'umbrella-phone', icon: '/icon-192.png' })).catch(() => {});
}
async function ingest(result, animate = true) {
  const incoming = result.events.filter(e => !delivered.has(e.id));
  sid = result.sessionId; save = result.save; events = result.events; scene = result.scene; inventory = result.inventory; objects = result.nearbyObjects; exits = result.exits;
  const ids = new Set(events.map(e => e.id)); delivered = new Set([...delivered].filter(id => ids.has(id)));
  if (pending && events.some(e => e.requestId === pending.requestId)) pending = null;
  persist(); renderScene(); renderHistory();
  for (const e of incoming) {
    if (animate && e.source !== 'player' && !document.hidden) {
      $('typing').textContent = e.type === 'dialogue' ? `${e.actor}…` : e.type === 'phone' ? 'Телефон вибрирует…' : '…';
      await sleep(matchMedia('(prefers-reduced-motion: reduce)').matches ? 80 : Math.min(1700, 550 + e.text.length * 8));
    }
    delivered.add(e.id); renderHistory(); notify(e); persist();
  }
  $('typing').textContent = '';
  if (result.aiStatus === 'unavailable') banner('Продолжение сцены временно недоступно. Твой ход и состояние мира сохранены.'); else $('banner').hidden = true;
}
function setWorking(value) { working = value; $('send').disabled = value || !restored; }
function report(error) {
  $('typing').textContent = '';
  banner(error instanceof TypeError ? 'Нет связи с сервером. История и черновик остаются на устройстве.' : error.name === 'AbortError' ? 'Сервер долго отвечает. Повторная отправка не создаст второй ход.' : error.message, error.code !== 'INVALID_SAVE');
}
async function connect() {
  if (working) return; setWorking(true);
  try { await ingest(await call('/api/start')); restored = true; }
  catch (e) { report(e); }
  finally { setWorking(false); }
}
async function sendPending() {
  if (working || !pending) return; setWorking(true); $('typing').textContent = 'Сцена продолжается…';
  try {
    if (!restored) { await ingest(await call('/api/start'), false); restored = true; }
    if (pending) await ingest(await call('/api/message', pending));
  } catch (e) { report(e); } finally { setWorking(false); }
}
$('form').onsubmit = async e => {
  e.preventDefault(); if (working) return;
  if (pending) { banner('Предыдущий ход ещё ожидает отправки.', true); return; }
  const text = $('input').value; if (!text.trim()) return;
  pending = { text, requestId: crypto.randomUUID() }; draft = ''; $('input').value = ''; persist(); resizeInput(); renderHistory(true); await sendPending();
};
function resizeInput() { $('input').style.height = 'auto'; $('input').style.height = Math.min(120, $('input').scrollHeight) + 'px'; }
$('input').oninput = () => { draft = $('input').value; resizeInput(); persist(); };
$('input').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && innerWidth > 700) { e.preventDefault(); $('form').requestSubmit(); } };
$('new-events').onclick = () => { $('history').scrollTop = $('history').scrollHeight; $('new-events').hidden = true; };
$('history').onscroll = () => { if ($('history').scrollHeight - $('history').scrollTop - $('history').clientHeight < 90) $('new-events').hidden = true; };
$('settings-toggle').onclick = () => { $('settings').hidden = !$('settings').hidden; };
$('scene-toggle').onclick = () => { const open = $('scene-panel').classList.toggle('open'); $('scene-toggle').setAttribute('aria-expanded', open); };
$('scene-close').onclick = () => { $('scene-panel').classList.remove('open'); $('scene-toggle').setAttribute('aria-expanded', 'false'); $('scene-toggle').focus(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('scene-close').click(); });
$('history').onclick = () => { $('scene-panel').classList.remove('open'); $('scene-toggle').setAttribute('aria-expanded', 'false'); };
$('notifications').onclick = async () => {
  if (!('Notification' in window)) { banner('Для уведомлений на iPhone добавь приложение на экран Домой, если браузер это поддерживает.'); return; }
  const result = await Notification.requestPermission(); banner(result === 'granted' ? 'Уведомления о входящих сообщениях телефона включены, пока приложение открыто.' : 'Уведомления не разрешены.');
};
$('export').onclick = () => {
  persist(); const blob = new Blob([JSON.stringify({ version: 3, sessionId: sid, save, events, scene, inventory, nearbyObjects: objects, exits, delivered: [...delivered], draft, pending })], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'umbrella-story.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('import').onchange = async e => {
  if (working) return; const file = e.target.files[0]; if (!file || file.size > 1500000) { banner('Файл сохранения слишком большой.'); return; }
  setWorking(true);
  try {
    const data = JSON.parse(await file.text()); if (![2,3].includes(data.version) || typeof data.sessionId !== 'string' || !data.save) throw Error('Неверный формат сохранения.');
    const r = await fetch('/api/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: data.sessionId, save: data.save }) });
    const result = await r.json(); if (!r.ok) throw Error(result.error);
    pending = null; delivered = new Set(); draft = ''; $('input').value = ''; await ingest(result, false); restored = true;
  } catch (e) { report(e); } finally { setWorking(false); e.target.value = ''; }
};
$('new-game').onclick = async () => {
  if (working || !confirm('Начать новую историю? Текущую можно предварительно скачать в настройках.')) return;
  sid = crypto.randomUUID(); events = []; save = ''; scene = {}; inventory = []; objects = []; exits = []; delivered = new Set(); pending = null; draft = ''; $('input').value = ''; restored = false;
  persist(); renderHistory(true); renderScene(); await connect();
};
async function tick() {
  if (document.hidden || working || pending || !restored || !navigator.onLine) return;
  setWorking(true); try { await ingest(await call('/api/tick')); } catch (e) { report(e); } finally { setWorking(false); }
}
setInterval(tick, 90000);
window.addEventListener('online', () => pending ? sendPending() : connect());
window.addEventListener('offline', () => banner('Нет соединения. История и черновик сохранены на устройстве.'));
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
function viewport() {
  document.documentElement.style.setProperty('--viewport', `${window.visualViewport?.height || innerHeight}px`);
  document.documentElement.style.setProperty('--panel-top', `${document.querySelector('.scene-heading').getBoundingClientRect().bottom}px`);
}
window.visualViewport?.addEventListener('resize', viewport); window.addEventListener('resize', viewport); viewport();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
$('input').value = draft; resizeInput(); renderScene(); renderHistory(true); setWorking(false);
(async () => { if (!cached && !legacy) { $('intro').hidden = false; await sleep(1600); $('intro').hidden = true; } await connect(); if (pending) banner('Есть ход, ожидающий отправки.', true); })();
