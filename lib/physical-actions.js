import { NPCS, LOCATIONS, appendEvent, presentAt, learn, refreshScene } from './world-state.js';
export const aliases = { Five: /(?<!\p{L})(?:five|пят(?:ый|ого|ому|ым)|пять)(?!\p{L})/iu, Klaus: /klaus|клаус/iu, Diego: /diego|диего/iu, Luther: /luther|лютер/iu, Allison: /allison|эллисон|аллисон/iu, Viktor: /viktor|виктор/iu, Lila: /lila|лайла|лила/iu };
const roomNames = { salon: /гостин|зал/iu, corridor: /коридор/iu, kitchen: /кухн/iu, bedroom: /спальн/iu, archive: /архив/iu, basement: /подвал/iu, courtyard: /двор|наружу|улиц/iu };
export function objectId(state, text, actor) {
  if (/фото|снимок/iu.test(text)) return 'photograph';
  if (/папк|досье|документ/iu.test(text)) return 'file08';
  if (/карманн.*час|час.*пят|watch/iu.test(text)) return 'watch';
  if (/час/iu.test(text)) return 'clock';
  if (/окн/iu.test(text)) return LOCATIONS[state.characterLocations[actor]].window;
  const mine = Object.values(state.importantObjects).filter(o => o.holder === actor);
  if (/е[её]|его|предмет/iu.test(text) && mine.length === 1) return mine[0].id;
}
const failure = (state, actor, text) => {
  appendEvent(state, { type: 'environment', text, location: state.characterLocations[actor], witnesses: [actor], visible: actor === 'Alina' });
  return false;
};
export function performAction(state, actor, op, { target, object, gesture } = {}) {
  if (!['Alina', ...NPCS].includes(actor)) return false;
  const room = state.characterLocations[actor];
  const source = actor === 'Alina' ? 'player' : 'npc';
  const emit = text => appendEvent(state, { type: 'action', actor, text, location: room }, source);
  if (op === 'move') {
    if (!LOCATIONS[target] || target === room) return false;
    if (!LOCATIONS[room].exits.includes(target)) return failure(state, actor, 'Отсюда проход ведёт в коридор.');
    emit(`${actor} выходит в ${LOCATIONS[target].name.toLowerCase()}.`);
    state.characterLocations[actor] = target;
    if (actor === 'Alina') state.playerPosition = 'у входа';
    appendEvent(state, { type: 'action', actor, text: `${actor} входит.`, location: target }, source);
    if (actor === 'Alina') appendEvent(state, { type: 'environment', text: LOCATIONS[target].description, location: target });
    refreshScene(state); return true;
  }
  if (op === 'climb_window') {
    const window = state.importantObjects[LOCATIONS[room].window];
    if (!window?.open) return failure(state, actor, 'Окно закрыто.');
    emit(`${actor} выбирается через открытое окно.`);
    state.characterLocations[actor] = 'courtyard';
    appendEvent(state, { type: 'action', actor, text: `${actor} появляется во дворе.`, location: 'courtyard' }, source);
    refreshScene(state); return true;
  }
  const item = state.importantObjects[object];
  const accessible = item && (item.holder === actor || (item.location === room && !item.holder && !item.hidden));
  if (['take','drop','give','hide','inspect','open','close','touch'].includes(op)) {
    if (!accessible) return failure(state, actor, 'Этот предмет сейчас недоступен.');
    if (op === 'take') {
      if (item.fixed || item.holder === actor) return false;
      emit(`${actor} берёт ${item.name.toLowerCase()}.`); item.holder = actor; item.location = null;
    } else if (op === 'drop') {
      if (item.holder !== actor) return false;
      emit(`${actor} оставляет ${item.name.toLowerCase()}.`); item.holder = null; item.location = room; item.hidden = false;
    } else if (op === 'give') {
      if (item.holder !== actor || !NPCS.includes(target) || state.characterLocations[target] !== room) return false;
      emit(`${actor} передаёт предмет ${target}.`); item.holder = target; item.location = null; item.hidden = false;
    } else if (op === 'hide') {
      if (item.holder !== actor) return false;
      emit(`${actor} убирает предмет за спину.`); item.hidden = true;
    } else if (op === 'inspect') {
      emit(`${actor} рассматривает ${item.name.toLowerCase()}.`);
      if (!item.examinedBy.includes(actor)) item.examinedBy.push(actor);
      item.lastExaminedBy = actor; item.lastExaminedTurn = state.turn + (actor === 'Alina' ? 1 : 0);
      let detail = object === 'file08' ? 'На обложке папки обозначение «08». Остальной текст выцвел.' : object === 'photograph' ? 'Старая семейная фотография. Край снимка повреждён.' : object === 'clock' ? 'Секундная стрелка стоит. Тиканье продолжается.' : 'На предмете пока не видно ничего необычного.';
      if (object === 'photograph' && state.story.unlocked.includes('eighth_shadow')) detail = 'На семейной фотографии появился дополнительный неясный силуэт.';
      if (object === 'file08' && state.story.unlocked.includes('archive_08')) detail = 'В архиве есть запись Hargreeves / 08 с удалённым именем.';
      if (object === 'file08' && state.story.unlocked.includes('record_recovered')) detail = 'Восстановленная запись указывает: Алина — восьмой ребёнок Hargreeves. Поле способности: конкурирующие вероятности.';
      // Contents are private to the actual examiner; someone nearby sees the act, not automatically the contents.
      appendEvent(state, { type: 'environment', text: detail, location: room, witnesses: [actor] }); learn(state, [actor], detail);
    } else if (op === 'open' || op === 'close') {
      if (!object.endsWith('_window')) return false;
      item.open = op === 'open'; emit(`${actor} ${item.open ? 'открывает' : 'закрывает'} окно.`);
    } else emit(`${actor} касается ${item.name.toLowerCase()}.`);
    refreshScene(state); return true;
  }
  const gestures = { look: 'смотрит внимательнее', approach: 'делает шаг ближе', sit: 'садится', stand: 'поднимается', pause: 'замолкает', turn: 'оборачивается', argue: 'резко перебивает', ability: actor === 'Five' ? 'на мгновение исчезает и появляется у той же двери' : actor === 'Klaus' ? 'прислушивается к голосу, которого остальные не слышат' : null };
  if (op === 'gesture' && gestures[gesture]) {
    emit(`${actor} ${gestures[gesture]}.`); state.characterActivities[actor] = gestures[gesture]; return true;
  }
  return false;
}
function parseClause(state, text) {
  // Only explicit first-person present intent. Commands to NPCs, quotations, negations,
  // wishes, past tense and instructions to the model cannot move the player.
  const start = text.trim().replace(/^я\s+/iu, '').replace(/^(?:молча|медленно|резко|осторожно)\s+/iu, '');
  const match = start.match(/^(беру|забираю|поднимаю|оставляю|кладу|отдаю|передаю|прячу|рассматриваю|осматриваю|смотрю|открываю|закрываю|ухожу|выхожу|иду|перехожу|бегу|несусь|направляюсь|отхожу|вылезаю|выбираюсь|молчу|подхожу|сажусь|встаю)(?!\p{L})/iu);
  if (!match) return null;
  const verb = match[1].toLocaleLowerCase('ru-RU');
  const obj = objectId(state, start, 'Alina');
  const target = Object.keys(roomNames).find(id => roomNames[id].test(start));
  if (['вылезаю','выбираюсь'].includes(verb)) return { op: 'climb_window' };
  if (['ухожу','выхожу','иду','перехожу','бегу','несусь','направляюсь'].includes(verb)) return { op: 'move', target: target === state.currentLocation ? 'corridor' : target || 'corridor' };
  const ops = { беру: 'take', забираю: 'take', поднимаю: 'take', оставляю: 'drop', кладу: 'drop', отдаю: 'give', передаю: 'give', прячу: 'hide', рассматриваю: 'inspect', осматриваю: 'inspect', открываю: 'open', закрываю: 'close' };
  if (ops[verb]) return { op: ops[verb], object: obj, target: NPCS.find(a => aliases[a].test(start)) };
  if (verb === 'смотрю' && obj) return { op: 'inspect', object: obj };
  const gesture = { смотрю: 'look', молчу: 'pause', подхожу: 'approach', сажусь: 'sit', встаю: 'stand', отхожу: 'turn' }[verb];
  return gesture ? { op: 'gesture', gesture } : null;
}
export function applyPlayerInput(state, text, requestId) {
  const original = appendEvent(state, { type: 'player_input', actor: 'Alina', text, requestId, witnesses: [], visible: true }, 'player');
  const parts = text.split(/(?<=[.!?;])\s+|\n+|\s+и\s+(?=(?:беру|иду|выхожу|ухожу|открываю|закрываю|вылезаю|выбираюсь|прячу|отдаю|передаю))/iu).filter(Boolean).slice(0, 12);
  let interpreted = 0, speechWitnesses = null;
  for (const part of parts) {
    const beforeLocation = state.currentLocation;
    const beforeWitnesses = presentAt(state, beforeLocation);
    if (/^(?:я\s+)?(?:тихо\s+)?(?:шепчу|говорю\s+на\s+ухо)(?!\p{L})/iu.test(part.trim())) {
      const recipient = NPCS.find(a => aliases[a].test(part));
      speechWitnesses = recipient && beforeWitnesses.includes(recipient) ? ['Alina',recipient] : ['Alina'];
      appendEvent(state, { type: 'action', actor: 'Alina', text: 'Alina говорит тихо.', location: beforeLocation, witnesses: beforeWitnesses }, 'player');
      appendEvent(state, { type: 'dialogue', actor: 'Alina', text: part, location: beforeLocation, witnesses: speechWitnesses, visible: false }, 'player');
      if (speechWitnesses.length === 1) failure(state,'Alina','Адресата нет рядом.');
      continue;
    }
    if (/^(?:я\s+)?(?:говорю\s+громко|повышаю\s+голос)/iu.test(part.trim())) speechWitnesses = null;
    const action = parseClause(state, part);
    if (action) {
      speechWitnesses = null;
      if (action.op === 'move' && LOCATIONS[action.target]) {
        // An explicit destination authorizes walking through connected rooms, not teleportation.
        const queue = [[state.currentLocation]], seen = new Set([state.currentLocation]);
        let path;
        while (queue.length) {
          const candidate = queue.shift();
          if (candidate.at(-1) === action.target) { path = candidate; break; }
          for (const next of LOCATIONS[candidate.at(-1)].exits) if (!seen.has(next)) { seen.add(next); queue.push([...candidate,next]); }
        }
        if (path) for (const target of path.slice(1)) if (performAction(state,'Alina','move',{target})) interpreted++;
      } else if (performAction(state, 'Alina', action.op, action)) interpreted++;
      if (action.op === 'gesture' && action.gesture === 'approach') state.playerPosition = /окн/iu.test(part) ? 'у окна' : /двер/iu.test(part) ? 'у двери' : 'ближе к собеседнику';
      if (action.op === 'gesture' && action.gesture === 'turn') state.playerPosition = 'в центре комнаты';
      // No one hears an unspoken player action as a telephone message or as dialogue.
      appendEvent(state, { type: 'player_intent', actor: 'Alina', text: part, location: beforeLocation, witnesses: beforeWitnesses, visible: false }, 'player');
    } else if (/^(?:я\s+)?(?:молча\s+)?(?:ломаю|бегу|прыгаю|дерусь|ударяю|касаюсь|обнимаю|выбрасываю|срываю|толкаю|пытаюсь|лезу|несусь|отхожу|достаю|переставляю)(?!\p{L})/iu.test(part.trim())) {
      appendEvent(state, { type: 'player_intent', actor: 'Alina', text: part, location: beforeLocation, witnesses: beforeWitnesses, visible: false }, 'player');
    } else {
      appendEvent(state, { type: 'dialogue', actor: 'Alina', text: part, witnesses: speechWitnesses || beforeWitnesses, visible: false }, 'player');
    }
  }
  state.turn++; state.currentTime += 45000;
  refreshScene(state);
  return { original, interpreted };
}
