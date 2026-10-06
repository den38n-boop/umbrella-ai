import test from 'node:test';
import assert from 'node:assert/strict';
import { freshState, appendEvent } from '../lib/world-state.js';
import { saveCodec } from '../lib/save.js';
test('long Cyrillic scene history stays within encrypted save transport limits',()=>{
  const state=freshState();for(let i=0;i<150;i++)appendEvent(state,{type:'player_input',actor:'Alina',text:'я'.repeat(3000),visible:true,witnesses:[]},'player');
  assert.ok(state.events.length<150);assert.ok(Buffer.byteLength(JSON.stringify(state.events))<=220000);
  const codec=saveCodec('test'),token=codec.encode('session',state);assert.ok(token.length<800000);assert.deepEqual(codec.decode('session',token),state);
});
