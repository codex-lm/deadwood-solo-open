import test from 'node:test';
import assert from 'node:assert/strict';
import { LastNightSimulation } from '../public/last-night.js';
import { RoomSimulation } from '../simulation.mjs';
import { SoloSocket } from '../public/solo-transport.js';

const id = '0123456789abcdef';
function room() {
  const sim = new LastNightSimulation('000000', { random: () => .5 });
  sim.addPlayer(id, 'Test'); sim.start(id);
  for (let i = 0; i < 51; i++) sim.tick(.1);
  assert.equal(sim.phase, 'wave');
  return sim;
}

test('Last Night exposes ten waves without raids, fuel missions or changed classic defaults', () => {
  const sim = room(), classic = new RoomSimulation('000000');
  assert.equal(sim.snapshot().maxWaves, 10);
  assert.equal(sim.snapshot().mode, 'last-night');
  assert.equal(sim.snapshot().expedition.enabled, false);
  assert.equal(sim.raidsEnabled, false);
  assert.equal(sim.beginExpeditionMission(), false);
  assert.equal(classic.maxWaves, 20);
  assert.equal(classic.intermissionSeconds, 12);
  assert.equal(classic.snapshot().mode, undefined);
});

test('clearing a wave early does not skip its survival timer', () => {
  const sim = room();
  sim.toSpawn = 0; sim.spawnWarnings.clear(); sim.zombies.clear();
  assert.equal(sim.finishWave(), false);
  sim.tick(.1);
  assert.equal(sim.phase, 'wave');
  assert.ok(sim.waveTimeLeft > 24);
});

test('all ten timed waves reach extraction and victory, then freeze', () => {
  const sim = room(), waves = new Set();
  // Isolate progression from aiming/enemy damage. Browser acceptance uses real combat.
  for (let i = 0; i < 3300 && sim.phase !== 'victory'; i++) {
    if (sim.phase === 'wave') waves.add(sim.wave);
    sim.toSpawn = 0; sim.spawnWarnings.clear(); sim.zombies.clear();
    sim.tick(.1);
  }
  assert.deepEqual([...waves], [1,2,3,4,5,6,7,8,9,10]);
  assert.equal(sim.phase, 'victory');
  assert.ok(sim.time >= 300 && sim.time <= 315, sim.time);
  assert.equal(sim.beginWave(), false);
  const finished = JSON.stringify(sim.snapshot()); sim.tick(.1);
  assert.equal(JSON.stringify(sim.snapshot()), finished);
});

test('wave timeout routes enemies without awarding kills, then refills supplies', () => {
  const sim = room(), player = sim.players.get(id);
  const kills = player.kills, score = player.score;
  sim.createZombie(); sim.toSpawn = 4;
  player.hp = 45; player.inventory.pistol.ammo = 2;
  sim.waveTimeLeft = .01; sim.tick(.1);
  assert.equal(sim.phase, 'intermission');
  assert.equal(sim.timeLeft, 5);
  assert.equal(sim.zombies.size, 0); assert.equal(sim.spawnWarnings.size, 0);
  assert.equal(sim.toSpawn, 0); assert.equal(player.kills, kills); assert.equal(player.score, score);
  assert.equal(player.hp, 100); assert.equal(player.inventory.pistol.ammo, 12);
});

test('pause freezes the wave and invalid time steps do not advance it', () => {
  const sim = room();
  assert.equal(sim.setPause(id, true), true);
  const state = JSON.stringify(sim.snapshot()); sim.tick(.1);
  assert.equal(JSON.stringify(sim.snapshot()), state);
  sim.setPause(id, false);
  const remaining = sim.waveTimeLeft;
  for (const step of [NaN, Infinity, -1]) sim.tick(step);
  assert.equal(sim.waveTimeLeft, remaining);
  sim.tick(.1); assert.ok(sim.waveTimeLeft < remaining);
});

test('death at timeout remains a loss and replay resets the same mode', () => {
  const sim = room(); sim.wave = 10; sim.waveTimeLeft = .01;
  sim.players.get(id).alive = false; sim.tick(.1);
  assert.equal(sim.phase, 'gameover');
  const state = JSON.stringify(sim.snapshot()); sim.tick(.1); assert.equal(JSON.stringify(sim.snapshot()), state);
  assert.equal(sim.start(id), true); assert.equal(sim.wave, 0); assert.equal(sim.waveTimeLeft, 0);
  assert.equal(sim.maxWaves, 10); assert.equal(sim.phase, 'countdown');
});

test('Last Night cannot create or accept a save labelled as classic', () => {
  const sim = room(); sim.setPause(id, true);
  assert.throws(() => sim.exportSave({ requesterId: id, build: 'test' }), error => error.code === 'mode');
  assert.deepEqual(sim.importSave({}), { ok: false, reason: 'mode' });
});

test('ordinary solo transport opts into Last Night; practice ignores the mode', async t => {
  for (const practice of [false, true]) {
    const socket = new SoloSocket('', { autoTick: false, playerId: id }); t.after(() => socket.close());
    const packets = []; socket.addEventListener('message', event => packets.push(JSON.parse(event.data)));
    await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
    socket.send(JSON.stringify({ type: 'join', name: 'Test', mode: 'last-night', practice }));
    await new Promise(resolve => queueMicrotask(resolve));
    assert.equal(socket.simulation.mode, practice ? 'classic' : 'last-night');
    assert.equal(socket.simulation.practice, practice);
    if (!practice) {
      socket.send(JSON.stringify({ type: 'save-game' })); await new Promise(resolve => queueMicrotask(resolve));
      assert.equal(packets.at(-1).type, 'save-denied'); assert.equal(packets.at(-1).reason, 'mode');
    }
  }
});

test('Last Night descriptions, pause and endings translate between English and French', async t => {
  const { setLanguage, getLanguage, t: translate } = await import('../public/i18n.js');
  const previous = getLanguage(); t.after(() => setLanguage(previous));
  setLanguage('en');
  assert.match(translate('solo.modeHelp'), /ten 25-second waves/);
  assert.match(translate('solo.noSave'), /without saves/);
  assert.match(translate('solo.dawn'), /dawn/);
  assert.match(translate('solo.lossSummary', { mode: 'Last Night', wave: 3, total: 10 }), /3\/10/);
  setLanguage('fr');
  assert.match(translate('solo.modeHelp'), /dix vagues de 25 secondes/);
  assert.match(translate('solo.noSave'), /sans sauvegarde/);
  assert.match(translate('solo.dawn'), /aube/);
});
