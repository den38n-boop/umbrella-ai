import test from 'node:test';
import assert from 'node:assert/strict';
import { freshState, applyAIOutput, sanitizeAIOutput, actorContext, message, advanceWorld, selectActors, NPCS, WORLD } from '../lib/simulation.js';
import { saveCodec } from '../lib/save.js';

for (const author of ['Alina', 'Алина', 'user', 'User', 'PLAYER', 'player', ' alina ', 'ALINA', 'Number Eight', 'System', '__proto__', 'Unknown']) {
  test(`AI cannot write as ${author}`, () => {
    const state = freshState();
    applyAIOutput(state, { messages: [{ author, text: 'рандомная реплика', channel: 'group' }], private_messages: [{ author, text: 'тайная подмена', channel: 'Five' }] }, { actor: 'Five', channel: 'group' });
    assert.deepEqual(state.messages, []);
  });
}
test('one actor, exact channel, length limit, no untrusted metadata', () => {
  const state = freshState();
  applyAIOutput(state, { messages: [
    { author: 'Five', text: 'x'.repeat(1000), channel: 'group', id: 'fake', at: -1, requestId: 'fake' },
    { author: 'Klaus', text: 'cross actor', channel: 'group' },
    { author: 'Five', text: 'cross channel', channel: 'Klaus' }
  ] }, { actor: 'Five', channel: 'group' });
  assert.equal(state.messages.length, 1); assert.equal(state.messages[0].text.length, 600);
  assert.notEqual(state.messages[0].id, 'fake'); assert.ok(state.messages[0].at > 0); assert.equal(state.messages[0].requestId, undefined);
});
test('damaged output and wrong data types never crash or mutate state', () => {
  for (const raw of ['not json', 'null', '{', '[]', '"hello"', 12, null, { messages: 'oops', actions: {} }]) {
    const state = freshState();
    assert.doesNotThrow(() => applyAIOutput(state, raw, { actor: 'Five', channel: 'group' }));
    assert.equal(state.messages.length, 0);
  }
});
test('relationships bounded, foreign memory and arbitrary world mutation rejected', () => {
  const state = freshState();
  const before = structuredClone(state);
  applyAIOutput(state, { messages: [], memory_updates: [{ agent: 'Klaus', memory: 'leak' }, { agent: 'Five', memory: 'noticed contradiction' }], relationship_updates: [{ agent: 'Five', trust: 999, fear: '999', affection: -999 }], world_changes: { timeline_stability_delta: -1, new_dangers: ['fake'] }, character_state: { location: 'коридор', admin: true }, discoveredInformation: { Five: WORLD.truth }, actions: [{ actor: 'Klaus', action: 'foreign action' }] }, { actor: 'Five', channel: 'group' });
  assert.equal(state.relationships.Five.Alina.trust, 3); assert.equal(state.relationships.Five.Alina.affection, -3); assert.equal(state.relationships.Five.Alina.fear, 0);
  assert.deepEqual(state.memories.Klaus, []); assert.equal(state.memories.Five[0], 'noticed contradiction');
  assert.equal(state.timeline_stability, before.timeline_stability); assert.deepEqual(state.active_dangers, []);
  assert.equal(state.characterStates.Five.admin, undefined); assert.deepEqual(state.discoveredInformation, before.discoveredInformation);
});
test('private knowledge and hidden truth never enter another NPC context', () => {
  const state = freshState();
  message(state, 'Alina', 'секрет для Клауса', 'Klaus');
  state.memories.Klaus.push('секретная память'); state.discoveredInformation.Klaus.push('секретная улика');
  const context = JSON.stringify(actorContext(state, 'Five', 'group', { type: 'SIMULATION_TICK' }));
  for (const term of ['секрет для Клауса', 'секретная память', 'секретная улика', 'alina_is_number_eight', 'reginald_erased_her_records']) assert.ok(!context.includes(term));
  assert.ok(JSON.stringify(actorContext(state, 'Klaus', 'Klaus', {})).includes('секрет для Клауса'));
});
test('edit/delete only own messages in current channel', () => {
  const state = freshState();
  const user = message(state, 'Alina', 'оригинал', 'group');
  const other = message(state, 'Klaus', 'чужое', 'group');
  const own = message(state, 'Five', 'моя опечатка', 'group');
  for (const id of [user.id, other.id]) applyAIOutput(state, { messages: [], edits: [{ id, deleted: true }] }, { actor: 'Five', channel: 'group' });
  assert.equal(user.text, 'оригинал'); assert.equal(other.text, 'чужое');
  applyAIOutput(state, { messages: [], edits: [{ id: own.id, deleted: true }] }, { actor: 'Five', channel: 'group' });
  assert.equal(own.deleted, true); assert.equal(own.text, '');
});
test('compact memory stays bounded and silence is allowed', () => {
  const state = freshState();
  for (let i = 0; i < 40; i++) applyAIOutput(state, { messages: [], memory_updates: [{ agent: 'Five', memory: `important ${i}` }] }, { actor: 'Five', channel: 'group' });
  assert.equal(state.messages.length, 0); assert.equal(state.memories.Five.length, 18);
  assert.equal(sanitizeAIOutput({ messages: [] }, { actor: 'Alina', channel: 'group', state }).messages.length, 0);
});
test('evidence requires investigation, is spaced, and is visible only to witness', () => {
  const state = freshState();
  for (let i = 0; i < 6; i++) advanceWorld(state, { type: 'USER_MESSAGE', text: 'Привет', channel: 'group' });
  advanceWorld(state, { type: 'SIMULATION_TICK' }); assert.equal(state.known_anomalies.length, 0);
  advanceWorld(state, { type: 'USER_MESSAGE', text: 'Клаус, посмотри фотографию', channel: 'Klaus' });
  advanceWorld(state, { type: 'USER_MESSAGE', text: 'Ты там?', channel: 'Klaus' });
  advanceWorld(state, { type: 'SIMULATION_TICK' }); assert.equal(state.known_anomalies.length, 1);
  assert.ok(state.discoveredInformation.Klaus.some(k => k.includes('силуэт')));
  assert.ok(!JSON.stringify(actorContext(state, 'Five', 'group', {})).includes('силуэт'));
  advanceWorld(state, { type: 'SIMULATION_TICK' }); assert.equal(state.known_anomalies.length, 1);
});
test('selection respects direct chats, names, and at most two speakers', () => {
  const state = freshState();
  assert.deepEqual(selectActors(state, { channel: 'Klaus', text: 'Five?' }), ['Klaus']);
  assert.deepEqual(selectActors(state, { channel: 'group', text: 'Клаус, ты опять пьян?' }), ['Klaus']);
  assert.equal(selectActors(state, { channel: 'group', text: NPCS.join(' ') }).length, 2);
});
test('encrypted authenticated saves survive restart but reject tampering and session substitution', () => {
  const codec = saveCodec('stable-secret'), state = freshState();
  message(state, 'Alina', 'original', 'Klaus');
  const token = codec.encode('session-a', state);
  assert.ok(!Buffer.from(token, 'base64url').toString('utf8').includes('original'));
  assert.deepEqual(saveCodec('stable-secret').decode('session-a', token), state);
  assert.throws(() => codec.decode('session-b', token));
  const altered = Buffer.from(token, 'base64url'); altered[30] ^= 1;
  assert.throws(() => codec.decode('session-a', altered.toString('base64url')));
  assert.throws(() => saveCodec('wrong-secret').decode('session-a', token));
});
