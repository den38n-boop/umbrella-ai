import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
export const WORLD = JSON.parse(fs.readFileSync(new URL('../world.json', import.meta.url), 'utf8'));
export const AGENTS = JSON.parse(fs.readFileSync(new URL('../agents.json', import.meta.url), 'utf8'));
export const NPCS = Object.keys(AGENTS);
export const METRICS = ['trust', 'affection', 'respect', 'suspicion', 'fear', 'irritation', 'protectiveness'];
export const LOCATIONS = WORLD.locations;
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const presentAt = (state, location) => ['Alina', ...NPCS].filter(a => state.characterLocations[a] === location);
export const inventoryOf = (state, actor) => Object.values(state.importantObjects).filter(o => o.holder === actor).map(o => o.id);
export function freshState() {
  const characterLocations = { ...WORLD.initialLocations };
  const state = {
    schemaVersion: 3, ...structuredClone(WORLD.state), events: [], turn: 0, ticks: 0,
    currentLocation: characterLocations.Alina, characterLocations,
    currentTime: Date.UTC(2019, 3, 1, 23, 47), scene: {}, lastTick: Date.now(), lastAccess: Date.now(), processed: [],
    importantObjects: structuredClone(WORLD.objects), inventory: [],
    characterActivities: Object.fromEntries(NPCS.map(a => [a, a === 'Klaus' ? 'сидит на диване' : 'занят своими делами'])),
    characterEmotions: Object.fromEntries(NPCS.map(a => [a, 'настороженность'])),
    relationships: Object.fromEntries(NPCS.map(a => [a, { Alina: Object.fromEntries(METRICS.map(k => [k, 0])) }])),
    memories: Object.fromEntries(NPCS.map(a => [a, []])),
    knownInformation: Object.fromEntries(['Alina', ...NPCS].map(a => [a, a === 'Alina' ? [] : [...AGENTS[a].knowledge]])),
    recentEvents: [], story: { unlocked: [], lastBeatTurn: -4 }, playerPosition: 'у двери'
  };
  refreshScene(state); return state;
}
export function refreshScene(state) {
  state.currentLocation = state.characterLocations.Alina;
  state.inventory = inventoryOf(state, 'Alina');
  state.scene = {
    location: state.currentLocation, locationName: LOCATIONS[state.currentLocation].name,
    presentCharacters: presentAt(state, state.currentLocation), time: state.currentTime,
    situation: LOCATIONS[state.currentLocation].description,
    activeConflict: state.active_dangers.at(-1) || 'Причина временного сбоя неизвестна.',
    recentEvents: state.events.filter(e => e.visible).slice(-8).map(e => e.id),
    availableKnowledge: [...state.knownInformation.Alina],
    characterStates: Object.fromEntries(presentAt(state, state.currentLocation).filter(a => a !== 'Alina').map(a => [a, { location: state.characterLocations[a], activity: state.characterActivities[a], emotion: state.characterEmotions[a] }]))
  };
}
export function appendEvent(state, data, source = 'world') {
  // A generated event can NEVER impersonate the player, even if a future caller forgets validation.
  if (data.actor === 'Alina' && source !== 'player') throw new Error('player_authorship_violation');
  if (data.actor && !NPCS.includes(data.actor) && !(data.actor === 'Alina' && source === 'player') && !(data.actor === '08' && ['script','archive'].includes(source))) throw new Error('unknown_actor');
  const location = data.location || state.currentLocation;
  const witnesses = data.witnesses || presentAt(state, location);
  const event = { id: randomUUID(), type: data.type, actor: data.actor || null, text: data.text || '',
    at: Math.max(Date.now(), (state.events.at(-1)?.at || 0) + 1), time: state.currentTime, location,
    witnesses: [...new Set(witnesses)], visible: data.visible ?? witnesses.includes('Alina'), source };
  if (data.requestId) event.requestId = data.requestId;
  state.events.push(event); state.events = state.events.slice(-600);
  while (state.events.length > 1 && Buffer.byteLength(JSON.stringify(state.events)) > 220000) state.events.shift();
  state.recentEvents = state.events.slice(-20).map(e => e.id);
  return event;
}
export function learn(state, witnesses, fact) {
  for (const a of witnesses) if (state.knownInformation[a] && !state.knownInformation[a].includes(fact)) state.knownInformation[a] = [...state.knownInformation[a], fact].slice(-40);
}
export function publicState(state) {
  refreshScene(state);
  return { schemaVersion: 3, events: state.events.filter(e => e.visible).map(({ witnesses, visible, ...e }) => ({ ...e, locationName: LOCATIONS[e.location]?.name || 'Академия' })), scene: state.scene,
    inventory: inventoryOf(state, 'Alina').map(id => ({ id, name: state.importantObjects[id].name })),
    nearbyObjects: Object.values(state.importantObjects).filter(o => o.location === state.currentLocation && !o.holder && !o.hidden).map(o => ({ id: o.id, name: o.name })),
    exits: LOCATIONS[state.currentLocation].exits.map(id => ({ id, name: LOCATIONS[id].name })) };
}
export function migrateState(old) {
  if (old.schemaVersion === 3) return old;
  // Previous messenger snapshots are authenticated before this migration. Preserve their text as a past phone archive;
  // do not make their private content something every physically present character has witnessed.
  const state = freshState();
  for (const m of (old.messages || []).slice(-300)) {
    if (!['Alina', 'System', '08', ...NPCS].includes(m.author) || typeof m.text !== 'string') continue;
    const recipient = NPCS.includes(m.channel) ? m.channel : null;
    appendEvent(state, { type: 'phone', actor: m.author === 'System' ? null : m.author, text: m.text,
      witnesses: recipient ? ['Alina', recipient] : ['Alina', ...NPCS], requestId: m.requestId, visible: true }, m.author === 'Alina' ? 'player' : 'archive');
  }
  for (const a of NPCS) {
    if (Array.isArray(old.memories?.[a])) state.memories[a] = old.memories[a].filter(m => typeof m === 'string').slice(-18);
    for (const k of METRICS) if (Number.isFinite(old.relationships?.[a]?.Alina?.[k])) state.relationships[a].Alina[k] = clamp(old.relationships[a].Alina[k], -100, 100);
  }
  state.processed = Array.isArray(old.processed) ? old.processed.slice(-100) : [];
  appendEvent(state, { type: 'environment', text: 'Экран телефона гаснет. За дверью снова слышны часы.' });
  startScene(state); return state;
}
export function startScene(state) {
  appendEvent(state, { type: 'environment', text: 'Академия. Поздний вечер. На столе — старая фотография. Из коридора слышны часы, но секундная стрелка не движется.' });
  appendEvent(state, { type: 'action', actor: 'Five', text: 'Five закрывает дверь и проверяет карманные часы.' }, 'script');
  appendEvent(state, { type: 'dialogue', actor: 'Five', text: 'Ты тоже это слышишь?' }, 'script');
  appendEvent(state, { type: 'action', actor: 'Klaus', text: 'Klaus перестаёт раскачивать ногой на диване.' }, 'script');
  refreshScene(state);
}
