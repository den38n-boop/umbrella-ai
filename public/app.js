const $ = id => document.getElementById(id);
const names = { group: 'Академия', Five: 'Five', Klaus: 'Klaus', Diego: 'Diego', Luther: 'Luther', Allison: 'Allison', Viktor: 'Viktor', Lila: 'Lila', '08': '08 · неизвестный' };
const initials = { group: '☂', Five: 'F', Klaus: 'K', Diego: 'D', Luther: 'L', Allison: 'A', Viktor: 'V', Lila: 'L', '08': '08' };
let cache;
try { cache = JSON.parse(localStorage.getItem('ua_game_v2') || 'null'); } catch { /* damaged browser cache */ }
let sid = cache?.sessionId || crypto.randomUUID();
let messages = Array.isArray(cache?.messages) ? cache.messages : [];
let contacts = cache?.contacts || Object.keys(names).filter(a => !['group', '08'].includes(a));
let save = cache?.save || '';
let read = cache?.read || {};
let delivered = new Set(cache?.delivered || messages.map(m => m.id));
let pending = cache?.pending || null;
let channel = 'group', working = false, restored = false;
let statuses = {}, drafts = cache?.drafts || {}, storageWarned = false;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const time = at => new Date(at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
function node(tag, className, text) { const e = document.createElement(tag); e.className = className; if (text !== undefined) e.textContent = text; return e; }
function persist() {
  try { localStorage.setItem('ua_game_v2', JSON.stringify({ version: 2, sessionId: sid, messages, contacts, save, read, delivered: [...delivered].slice(-600), pending, drafts })); }
  catch { if (!storageWarned) { storageWarned = true; banner('Браузер не сохранил игру. Скачайте сохранение в настройках.'); } }
}
function banner(text, retry = false) {
  $('banner').replaceChildren(document.createTextNode(text)); $('banner').hidden = false;
  if (retry) { const b = node('button', '', 'Повторить'); b.onclick = () => pending ? sendPending() : connect(); $('banner').append(b); }
}
function avatar(author) { return node('span', `avatar ${author}`, initials[author] || '·'); }
function visible() { return messages.filter(m => delivered.has(m.id)); }
function renderList() {
  $('chat-list').replaceChildren();
  const all = visible();
  const filter = $('search').value.toLocaleLowerCase();
  for (const c of ['group', ...contacts]) {
    if (!(names[c] || c).toLocaleLowerCase().includes(filter)) continue;
    const history = all.filter(m => m.channel === c);
    const last = history.at(-1);
    const unread = history.filter(m => m.author !== 'Alina' && m.at > (read[c] || 0)).length;
    const b = node('button', `chat-item ${c === channel ? 'active' : ''}`);
    b.setAttribute('aria-label', `${names[c] || c}${unread ? `, непрочитанных: ${unread}` : ''}`);
    b.onclick = () => openChat(c);
    const copy = node('div', 'chat-copy'), top = node('div', 'chat-top');
    top.append(node('span', 'chat-name', names[c] || c), node('span', 'chat-time', last ? time(last.at) : ''));
    copy.append(top, node('div', 'chat-preview', last ? (last.deleted ? 'Сообщение удалено' : `${c === 'group' ? last.author + ': ' : ''}${last.text}`) : 'Начать разговор'));
    b.append(avatar(c), copy); if (unread) b.append(node('span', 'unread', unread));
    $('chat-list').append(b);
  }
  $('chat-count').textContent = String(contacts.length + 1).padStart(2, '0');
}
function isChatVisible() { return !document.hidden && (innerWidth > 700 || $('app').classList.contains('in-chat')); }
function markRead() {
  if (!isChatVisible()) return;
  read[channel] = Math.max(read[channel] || 0, ...visible().filter(m => m.channel === channel).map(m => m.at));
}
function renderHistory() {
  const history = $('history');
  const nearBottom = history.scrollHeight - history.scrollTop - history.clientHeight < 90;
  history.replaceChildren();
  const own = visible().filter(m => m.channel === channel);
  if (pending?.channel === channel && !own.some(m => m.requestId === pending.requestId)) own.push({ ...pending, author: 'Alina', at: pending.at, pending: true });
  if (!own.length) { const empty = node('div', 'empty'); empty.append(node('span', '', '☂'), node('p', '', 'Здесь пока тихо.\nВы можете написать первым.')); history.append(empty); }
  let day = '';
  for (const m of own) {
    const date = new Date(m.at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    if (day !== date) { day = date; history.append(node('div', 'day', date)); }
    if (m.kind === 'event') { history.append(node('div', 'system-event', m.text)); continue; }
    const row = node('div', `row ${m.author === 'Alina' ? 'mine' : ''}`), bubble = node('div', 'bubble');
    if (m.author !== 'Alina') { row.append(avatar(m.author)); bubble.append(node('div', 'author', names[m.author] || m.author)); }
    bubble.append(node('div', 'message-text', m.deleted ? 'Сообщение удалено' : m.text));
    bubble.append(node('div', 'message-meta', `${m.editedAt && !m.deleted ? 'изменено · ' : ''}${time(m.at)}${m.pending ? ' · отправляется' : m.author === 'Alina' ? ' · ✓' : ''}`));
    row.append(bubble); history.append(row);
  }
  if (nearBottom) history.scrollTop = history.scrollHeight;
  markRead(); renderList();
}
function openChat(c, capture = true) {
  if (capture) drafts[channel] = $('input').value;
  channel = c;
  $('app').classList.add('in-chat');
  $('chat-title').textContent = names[c] || c;
  $('chat-avatar').className = `avatar ${c}`; $('chat-avatar').textContent = initials[c] || '·';
  $('chat-status').textContent = c === 'group' ? '7 участников · закрытый канал' : c === '08' ? 'Источник неизвестен' : (statuses[c] || 'не в сети');
  $('input').value = drafts[c] || '';
  $('input').disabled = c === '08'; $('send').disabled = working || c === '08';
  $('input').placeholder = c === '08' ? 'Канал не принимает сообщения' : 'Написать сообщение…';
  $('typing').textContent = '';
  renderHistory(); $('history').scrollTop = $('history').scrollHeight; persist(); resizeInput();
}
async function call(path, data) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 95000);
  try {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sid, save, ...data }), signal: controller.signal });
    const result = await response.json();
    if (!response.ok) { const err = new Error(result.error || 'Ошибка соединения.'); err.code = result.code; err.status = response.status; throw err; }
    return result;
  } finally { clearTimeout(timer); }
}
function notify(m) {
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    navigator.serviceWorker?.ready.then(reg => reg.showNotification(names[m.author] || m.author, { body: m.text, tag: 'umbrella-message', icon: '/icon-192.png' })).catch(() => {});
  }
}
async function ingest(result, animate = true) {
  sid = result.sessionId; save = result.save; contacts = result.contacts; statuses = result.statuses;
  $('chat-status').textContent = channel === 'group' ? '7 участников · закрытый канал' : channel === '08' ? 'Источник неизвестен' : (statuses[channel] || 'не в сети');
  const incoming = result.messages.filter(m => !delivered.has(m.id));
  messages = result.messages;
  const currentIds = new Set(messages.map(m => m.id));
  delivered = new Set([...delivered].filter(id => currentIds.has(id)));
  if (pending && messages.some(m => m.requestId === pending.requestId)) pending = null;
  persist(); renderHistory();
  for (const m of incoming) {
    if (animate && m.author !== 'Alina' && m.kind !== 'event' && !document.hidden) {
      $('typing').textContent = m.channel === channel ? `${names[m.author] || m.author} печатает…` : '';
      await sleep(matchMedia('(prefers-reduced-motion: reduce)').matches ? 100 : Math.min(2200, 700 + m.text.length * 15));
    }
    delivered.add(m.id); renderHistory(); notify(m); persist();
  }
  $('typing').textContent = '';
  if (result.aiStatus === 'unavailable') banner('Персонажи сейчас не могут ответить: AI временно недоступен. Ваше сообщение и игра сохранены.');
  else $('banner').hidden = true;
}
function setWorking(value) { working = value; $('send').disabled = value || channel === '08'; }
function report(error) {
  $('typing').textContent = '';
  const text = error instanceof TypeError ? 'Не удалось связаться с сервером. Проверьте соединение и повторите.' : error.name === 'AbortError' ? 'Сервер долго отвечает. Переписка сохранена; повторная отправка не создаст дубликат.' : error.message;
  banner(text, !['INVALID_SAVE'].includes(error.code));
}
async function connect() {
  if (working) return;
  setWorking(true);
  try { await ingest(await call('/api/start', {})); restored = true; }
  catch (error) { report(error); }
  finally { setWorking(false); }
}
async function sendPending() {
  if (working || !pending) return;
  setWorking(true); $('typing').textContent = 'Доставляем сообщение…';
  try {
    if (!restored) { await ingest(await call('/api/start', {}), false); restored = true; }
    if (pending) await ingest(await call('/api/message', pending));
  } catch (error) { report(error); }
  finally { setWorking(false); }
}
$('form').onsubmit = async e => {
  e.preventDefault();
  if (working || channel === '08') return;
  if (pending) { banner('Предыдущее сообщение ожидает отправки.', true); return; }
  const text = $('input').value;
  if (!text.trim()) return;
  pending = { text, channel, requestId: crypto.randomUUID(), at: Date.now() };
  $('input').value = ''; drafts[channel] = ''; persist(); resizeInput(); renderHistory();
  $('history').scrollTop = $('history').scrollHeight;
  await sendPending();
};
function resizeInput() { $('input').style.height = 'auto'; $('input').style.height = Math.min(120, $('input').scrollHeight) + 'px'; }
$('input').oninput = () => { drafts[channel] = $('input').value; resizeInput(); persist(); };
$('input').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && innerWidth > 700) { e.preventDefault(); $('form').requestSubmit(); } };
$('search').oninput = renderList;
$('back').onclick = () => { $('app').classList.remove('in-chat'); $('input').blur(); renderList(); };
$('settings-toggle').onclick = () => { $('settings').hidden = !$('settings').hidden; };
$('notifications').onclick = async () => {
  if (!('Notification' in window)) { banner('На iPhone уведомления доступны для приложения, добавленного на экран Домой, при поддержке браузером.'); return; }
  const permission = await Notification.requestPermission();
  banner(permission === 'granted' ? 'Уведомления включены, пока приложение открыто. Фоновые push-уведомления не подключены.' : 'Уведомления не разрешены.');
};
$('export').onclick = () => {
  persist(); const blob = new Blob([JSON.stringify({ version: 2, sessionId: sid, messages, contacts, save, read, delivered: [...delivered], drafts, pending })], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'umbrella-save.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('import').onchange = async e => {
  if (working) return;
  const file = e.target.files[0]; if (!file || file.size > 1500000) { banner('Сохранение слишком большое.'); return; }
  try {
    const data = JSON.parse(await file.text());
    if (data.version !== 2 || typeof data.sessionId !== 'string' || typeof data.save !== 'string' || !data.save) throw Error('Неверный формат сохранения.');
    // Imported public display data is never trusted; recover the authenticated state from server.
    const response = await fetch('/api/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: data.sessionId, save: data.save }) });
    const result = await response.json(); if (!response.ok) throw Error(result.error);
    pending = null; delivered = new Set(); read = {}; drafts = {}; await ingest(result, false); restored = true; openChat('group', false);
  } catch (error) { report(error); } finally { e.target.value = ''; }
};
$('new-game').onclick = async () => {
  if (working || !confirm('Начать новую игру? Текущую игру можно предварительно скачать в настройках.')) return;
  sid = crypto.randomUUID(); messages = []; save = ''; delivered = new Set(); read = {}; pending = null; drafts = {}; contacts = Object.keys(names).filter(a => !['group', '08'].includes(a)); restored = false;
  persist(); openChat('group', false); $('app').classList.remove('in-chat'); await connect();
};
async function tick() {
  if (document.hidden || working || pending || !restored || !navigator.onLine) return;
  setWorking(true);
  try { await ingest(await call('/api/tick', {})); }
  catch (error) { report(error); }
  finally { setWorking(false); }
}
setInterval(tick, 90000);
window.addEventListener('online', () => { if (pending) sendPending(); else connect(); });
window.addEventListener('offline', () => banner('Нет соединения. Переписка и черновик остаются на устройстве.'));
document.addEventListener('visibilitychange', () => { if (!document.hidden) { markRead(); renderList(); persist(); tick(); } });
function viewport() { document.documentElement.style.setProperty('--viewport', `${window.visualViewport?.height || innerHeight}px`); }
window.visualViewport?.addEventListener('resize', viewport); window.addEventListener('resize', viewport); viewport();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
openChat('group', false); $('app').classList.remove('in-chat');
(async () => {
  if (!cache) { $('intro').hidden = false; await sleep(1800); $('intro').hidden = true; }
  await connect();
  if (pending) banner('Есть сообщение, ожидающее отправки.', true);
})();
