import { NPCS, METRICS, clamp } from './world-state.js';
const obj = value => value && typeof value === 'object' && !Array.isArray(value);
const list = value => Array.isArray(value) ? value.slice(0, 16) : [];
const text = (value, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export function parseAIOutput(raw) {
  if (typeof raw === 'string') {
    if (raw.length > 30000) throw Error('invalid_ai_json');
    raw = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  }
  if (!obj(raw) || !Array.isArray(raw.events)) throw Error('invalid_ai_structure');
  return raw;
}
// Reject narrator/player impersonation even when hidden inside an NPC dialogue.
// Actions NEVER use model-authored prose: the physical engine supplies their text.
export function safeDialogue(value) {
  const t = text(value);
  if (!t) return '';
  if (/(?:^|\n|[.!?]\s+)(?:[*—\s]*)(?:alina|алина|user|player)\s*[:：—]/iu.test(t)) return '';
  if (/(?:алина|alina|ты)\s+(?:испугал|отступил|подумал|решил|почувствовал|согласил|ответил|сказал|пош[её]л|уш[её]л|взял|побежал|кивнул|вста[её]шь|ид[её]шь|говоришь|решаешь|думаешь|боишься)/iu.test(t)) return '';
  return t;
}
export function sanitizeAIOutput(raw, { actor }) {
  const safe = { events: [], memories: [], relationships: {}, emotion: null };
  if (!NPCS.includes(actor)) return safe;
  let out; try { out = parseAIOutput(raw); } catch { return safe; }
  for (const e of list(out.events)) {
    if (!obj(e) || e.actor !== actor || !NPCS.includes(e.actor) || safe.events.length >= 4) continue;
    if (e.type === 'dialogue' || e.type === 'phone') {
      const t = safeDialogue(e.text); if (t) safe.events.push({ type: e.type, actor, text: t });
    } else if (e.type === 'action' && ['move','take','drop','give','hide','inspect','open','close','touch','gesture'].includes(e.op)) {
      // No arbitrary text, player state change, object creation, teleport or narrator output.
      safe.events.push({ type: 'action', actor, op: e.op, target: text(e.target, 40), object: text(e.object, 40), gesture: text(e.gesture, 40) });
    }
  }
  for (const u of list(out.memory_updates).slice(0, 2)) if (obj(u) && u.agent === actor && text(u.memory, 240)) safe.memories.push(text(u.memory, 240));
  const delta = list(out.relationship_updates).find(u => obj(u) && u.agent === actor);
  for (const k of METRICS) if (delta && Number.isFinite(delta[k])) safe.relationships[k] = clamp(delta[k], -3, 3);
  if (text(out.emotion, 80)) safe.emotion = text(out.emotion, 80);
  return safe;
}
