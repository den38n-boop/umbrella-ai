import test from 'node:test';
import assert from 'node:assert/strict';
import { freshState, message } from '../lib/simulation.js';
import { saveCodec } from '../lib/save.js';
test('long Russian histories remain within save transport limit', () => {
  const state = freshState();
  for (let i = 0; i < 150; i++) message(state, 'Alina', 'я'.repeat(3000), 'group');
  assert.ok(state.messages.length < 150);
  assert.ok(Buffer.byteLength(JSON.stringify(state.messages)) <= 200000);
  const codec = saveCodec('test');
  const snapshot = codec.encode('session', state);
  assert.ok(snapshot.length < 800000);
  assert.deepEqual(codec.decode('session', snapshot), state);
});
