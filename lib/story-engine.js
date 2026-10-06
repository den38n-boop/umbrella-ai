import { LOCATIONS, appendEvent, presentAt, learn, clamp, refreshScene } from './world-state.js';
import { SEASON } from './season.js';
// Private director: authored milestones and prerequisites, not NPC omniscience.
// Only this module can issue environment/anomaly descriptions or unlock world evidence.
export function advanceStory(state, cause = 'player') {
  const unlocked = state.story.unlocked;
  const has = id => unlocked.includes(id);
  const room = state.currentLocation;
  const witnesses = presentAt(state, room);
  const photo = state.importantObjects.photograph;
  const file = state.importantObjects.file08;
  state.story.act = has('record_recovered') ? SEASON.acts[2].id : has('commission') ? SEASON.acts[1].id : SEASON.acts[0].id;
  const nearby = obj => obj.holder === 'Alina' || (!obj.holder && obj.location === room && !obj.hidden);
  const beats = [
    { id: 'time_slip', when: state.turn >= 3 && ['salon','corridor','kitchen'].includes(room),
      text: 'Тиканье обрывается. Через секунду из коридора слышны те же три удара — в обратном порядке.',
      fact: 'В Академии повторилась короткая последовательность звуков в обратном порядке.' },
    { id: 'eighth_shadow', observers: ['Alina'], when: has('time_slip') && state.turn >= 6 && nearby(photo) && photo.examinedBy.includes('Alina'),
      text: 'На краю фотографии проступает ещё один силуэт. Лицо не различить. Бумага по-прежнему сухая.',
      fact: 'На семейной фотографии появился дополнительный неясный силуэт.' },
    { id: 'archive_08', observers: ['Alina'], when: has('time_slip') && state.turn >= 6 && nearby(file) && file.examinedBy.includes('Alina'),
      text: 'В папке обнаруживается второй лист. На нём «Hargreeves / 08», но строка с именем тщательно выскоблена.',
      fact: 'В архиве есть запись Hargreeves / 08 с удалённым именем.' },
    { id: 'ghost_warning', when: has('time_slip') && state.turn >= 9 && witnesses.includes('Klaus'),
      text: 'В пустом дверном проёме на мгновение появляется мокрый след ладони. Klaus смотрит на него прежде, чем свет моргает.',
      fact: 'В дверном проёме появился и исчез мокрый след ладони.' },
    { id: 'commission', when: state.turn >= 14 && (LOCATIONS[room].window || room === 'courtyard') && ['eighth_shadow','archive_08','ghost_warning'].filter(has).length >= 2,
      text: room === 'courtyard' ? 'За оградой щёлкает затвор фотоаппарата. На лацкане незнакомца виден значок, похожий на обломанную стрелку часов.' : 'Из-за окна слышен щелчок фотоаппарата. На стекле отражается значок, похожий на обломанную стрелку часов.',
      fact: 'За Академией наблюдает неизвестный человек со знаком часов.' },
    { id: 'competing_futures', when: has('commission') && state.turn >= 20 && has('eighth_shadow') && has('archive_08'),
      text: 'Дверь одновременно кажется открытой и закрытой. Два звука шагов совпадают, хотя в коридоре виден один человек. Несколько секунд спустя остаётся только одна версия.',
      fact: 'Наблюдались две несовместимые версии состояния двери; затем осталась одна.' },
    { id: 'record_recovered', observers: ['Alina'], when: has('competing_futures') && state.turn >= 26 && nearby(file) && file.lastExaminedBy === 'Alina' && file.lastExaminedTurn >= 26,
      text: 'Под стёртым именем проступает новая строка: «Алина / восьмой ребёнок». В графе способности — «конкурирующие вероятности». На полях несколько раз зачёркнута одна и та же дата.',
      fact: 'Восстановленная запись указывает: Алина — восьмой ребёнок Hargreeves. Поле способности: конкурирующие вероятности.' },
    { id: 'convergence', when: has('record_recovered') && state.turn >= 30 && nearby(file),
      text: 'По дому проходит низкий гул. На стекле проступают три отражения одной комнаты. Из подвала доносится щелчок реле, а на старой папке проступает предупреждение: «Не изымать оригинал из контура».',
      fact: 'После гула на папке появилось предупреждение о сохранении оригинала в контуре; звук реле шёл из подвала.' },
    { id: 'resolution', when: has('convergence') && state.turn >= 34 && (
        (room === 'basement' && file.holder === 'Alina' && file.lastExaminedBy === 'Alina' && file.lastExaminedTurn > state.story.lastBeatTurn) ||
        (room === 'courtyard' && file.holder === 'Alina') ||
        (room === 'archive' && file.location === 'archive' && !file.holder && !file.hidden)),
      text: room === 'basement' ? 'Под папкой загорается контур на столе. Три отражения совпадают. Часы наверху идут вперёд; снаружи продолжает ждать машина. Связь восстановлена, но запись осталась доступной тем, кто придёт за ней.' : room === 'courtyard' ? 'За воротами включаются фары. С оригиналом вне дома гул Академии обрывается, но на странице исчезает последняя строка. На дверце машины открывается знак сломанной стрелки. Дорога дальше существует — её условия ещё неизвестны.' : 'Папка остаётся в архиве. Листы перестают меняться; на стекле сохраняются два отражения. Дом удержал доказательство, но временной разрыв не закрылся. Снаружи хлопает дверца машины.',
      fact: room === 'basement' ? 'Контур в подвале стабилизировал дом; оригинал сохранился, наблюдение продолжается.' : room === 'courtyard' ? 'С оригиналом вне дома гул прекратился, но запись начала исчезать; наблюдатель ждёт у ворот.' : 'Оригинал остался в архиве; доказательство сохранилось, временной разрыв остался.' }
  ];
  if (state.turn - state.story.lastBeatTurn >= 3) {
    const beat = beats.find(b => !has(b.id) && b.when);
    if (beat) {
      unlocked.push(beat.id); state.story.lastBeatTurn = state.turn;
      const observers = beat.observers || witnesses;
      appendEvent(state, { type: 'anomaly', text: beat.text, location: room, witnesses: observers });
      learn(state, observers, beat.fact);
      state.known_anomalies.push({ id: beat.id, location: room, witnesses: observers, fact: beat.fact });
      state.timeline_stability = clamp(state.timeline_stability - 0.035, 0, 1);
      state.commission_activity = clamp(state.commission_activity + 0.04, 0, 1);
      state.consequences = [...state.consequences, { id: beat.id, time: state.currentTime }].slice(-40);
      if (beat.id === 'ghost_warning') learn(state, ['Klaus'], 'У проёма стоял неизвестный дух. Он произнёс: «Её уже искали». Он не назвал имя.');
      if (beat.id === 'commission') state.active_dangers.push('Наблюдение за Академией');
      if (beat.id === 'competing_futures') {
        state.active_dangers.push('Временные версии комнаты конкурируют');
        appendEvent(state, { type: 'phone', actor: '08', text: 'Ты сейчас у двери? В другой версии там никого нет.', witnesses: ['Alina'], visible: true }, 'script');
        learn(state, ['Alina'], 'На телефоне появилось сообщение от неизвестного отправителя 08.');
      }
      if (beat.id === 'resolution') {
        state.story.ending = room === 'basement' ? 'stabilized' : room === 'courtyard' ? 'outside' : 'preserved';
        state.timeline_stability = room === 'basement' ? 0.9 : 0.5;
      }
    }
  }
  // The director advances the world clock. Character movement and conversations
  // belong to individual AI agents, never to a hardcoded arrival script.
  if (cause === 'tick') {
    state.ticks = (state.ticks || 0) + 1;
    state.currentTime += 30000;
  }
  refreshScene(state);
}
