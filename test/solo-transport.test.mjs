import test from 'node:test';
import assert from 'node:assert/strict';
import { SoloSocket } from '../public/solo-transport.js';
import { uploadPlan } from '../public/save-game.js';

const flushMessages = () => new Promise(resolve => queueMicrotask(resolve));

async function open(options = {}) {
  const messages = [];
  const socket = new SoloSocket('ignored', { autoTick: false, playerId: '0123456789abcdef', random: () => .5, ...options });
  socket.addEventListener('message', event => messages.push(JSON.parse(event.data)));
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  const send = message => socket.send(JSON.stringify(message));
  return { socket, messages, send };
}

test('opens asynchronously and starts one local survivor using the existing protocol', async t => {
  const { socket, messages, send } = await open(); t.after(() => socket.close());
  assert.equal(socket.readyState, SoloSocket.OPEN);
  send({ type: 'join', name: 'Solo', build: 'test-build' });
  assert.equal(messages.length, 0, 'responses must not reenter the client sending a packet');
  await flushMessages();
  assert.equal(messages[0].type, 'welcome');
  assert.equal(messages[0].build, 'test-build');
  assert.equal(messages[0].mapId, 'cabin');
  assert.equal(messages[0].id, messages[0].hostId);
  assert.equal(messages[1].phase, 'lobby');
  assert.equal(messages[1].players.length, 1);
  assert.equal(messages[1].companionsAvailable, false);
  send({ type: 'start' });
  await flushMessages();
  assert.equal(messages.at(-1).phase, 'countdown');
  for (let tick = 0; tick < 151; tick++) socket.tick();
  assert.equal(socket.simulation.phase, 'wave');
  assert.equal(socket.simulation.wave, 1);
  assert.equal(socket.simulation.wavePlayerCount, 1);
});

test('welcome handlers can send commands without overtaking the initial lobby snapshot', async t => {
  const { socket, send, messages } = await open(); t.after(() => socket.close());
  socket.addEventListener('message', event => {
    if (JSON.parse(event.data).type === 'welcome') send({ type: 'ping' });
  });
  send({ type: 'join', name: 'Solo' });
  await flushMessages();
  assert.deepEqual(messages.map(message => message.type), ['welcome', 'state', 'pong']);
  assert.equal(messages[1].phase, 'lobby');
});

test('local input moves the survivor and pause freezes both the clock and gameplay packets', async t => {
  const { socket, send } = await open(); t.after(() => socket.close());
  send({ type: 'join', name: 'Solo' }); send({ type: 'start' });
  const sim = socket.simulation, player = sim.players.get(socket.playerId);
  const before = { x: player.x, z: player.z };
  for (let tick = 0; tick < 15; tick++) { send({ type: 'input', forward: 1, strafe: 0, yaw: 0, pitch: 0 }); socket.tick(); }
  assert.notDeepEqual({ x: player.x, z: player.z }, before);
  send({ type: 'pause', paused: true });
  const frozen = JSON.stringify(sim.snapshot());
  send({ type: 'input', forward: -1, strafe: 0, yaw: 2, pitch: 1 });
  send({ type: 'shoot' }); send({ type: 'drop-weapon' });
  for (let tick = 0; tick < 60; tick++) socket.tick();
  assert.equal(JSON.stringify(sim.snapshot()), frozen);
  send({ type: 'pause', paused: false }); socket.tick();
  assert.ok(sim.time > JSON.parse(frozen).time);
});

test('practice shots consume real ammunition and produce combat events without a remote connection', async t => {
  const { socket, send, messages } = await open(); t.after(() => socket.close());
  send({ type: 'join', name: 'Solo', practice: true });
  const player = socket.simulation.players.get(socket.playerId);
  const ammunition = player.inventory.assault.ammo;
  send({ type: 'shoot' });
  await flushMessages();
  assert.equal(player.inventory.assault.ammo, ammunition - 1);
  assert.ok(messages.some(message => message.type === 'event' && message.event === 'shot'));
  assert.equal(socket.simulation.players.size, 1);
});

test('save and chunked load restore the sole survivor paused with their original progress', async t => {
  const first = await open(); t.after(() => first.socket.close());
  first.send({ type: 'join', name: 'Solo' }); first.send({ type: 'start' });
  for (let tick = 0; tick < 12; tick++) first.socket.tick();
  first.send({ type: 'pause', paused: true }); first.send({ type: 'save-game' });
  await flushMessages();
  const saved = first.messages.findLast(message => message.type === 'save-game')?.save;
  assert.ok(saved); assert.equal(saved.players.length, 1);
  const second = await open({ playerId: 'fedcba9876543210' }); t.after(() => second.socket.close());
  second.send({ type: 'join', name: 'Solo' });
  const plan = uploadPlan(JSON.stringify(saved));
  second.send({ type: 'load-begin', chunks: plan.chunks.length, size: plan.size });
  let pending = { sent: 0 };
  second.socket.addEventListener('message', event => {
    if (JSON.parse(event.data).type === 'load-result') pending = null;
  });
  // Match the real client's loop: the load-result callback clears pending.
  // A synchronous response on the final chunk would crash its increment.
  for (; pending.sent < plan.chunks.length; pending.sent++) second.send({ type: 'load-chunk', index: pending.sent, data: plan.chunks[pending.sent] });
  assert.equal(pending.sent, plan.chunks.length);
  await flushMessages();
  assert.equal(pending, null);
  assert.deepEqual(second.messages.at(-1), { type: 'load-result', ok: true, wave: 0, phase: 'countdown' });
  assert.equal(second.socket.simulation.paused, true);
  assert.equal(second.socket.simulation.players.size, 1);
  assert.ok(Math.abs(second.socket.simulation.time - first.socket.simulation.time) < 1e-8);
  assert.equal(second.socket.simulation.players.get(second.socket.playerId).name, 'Solo');
});

test('rejects room codes, repeated joins and multiplayer save records', async t => {
  const { socket, send, messages } = await open(); t.after(() => socket.close());
  send({ type: 'join', room: 'ABCDEF', name: 'Not joined' });
  await flushMessages();
  assert.equal(socket.simulation, null); assert.match(messages.at(-1).message, /single-player/);
  send({ type: 'join', name: 'Solo' }); send({ type: 'join', name: 'Second' });
  await flushMessages();
  assert.equal(socket.simulation.players.size, 1); assert.match(messages.at(-1).message, /already/);
  const plan = uploadPlan(JSON.stringify({ players: [{ name: 'One' }, { name: 'Two' }] }));
  send({ type: 'load-begin', chunks: plan.chunks.length, size: plan.size });
  plan.chunks.forEach((data, index) => send({ type: 'load-chunk', index, data }));
  await flushMessages();
  assert.deepEqual(messages.at(-1), { type: 'load-result', ok: false, reason: 'crowded' });
  assert.equal(socket.simulation.phase, 'lobby');
});

test('closing cancels the local timer and prevents later ticks, packets or reopening', async () => {
  const pending = new Map(); let counter = 0, now = 0;
  const { socket, send, messages } = await open({ autoTick: true, clock: () => now,
    schedule: (callback, delay) => { const id = ++counter; pending.set(id, { callback, delay }); return id; }, cancel: id => pending.delete(id) });
  send({ type: 'join', name: 'Solo' });
  assert.equal(pending.size, 1);
  const run = pending.values().next().value.callback;
  pending.clear(); now += 34; run();
  assert.equal(pending.size, 1);
  await flushMessages();
  const count = messages.length;
  send({ type: 'ping' }); // Already queued before close: must be discarded too.
  socket.close();
  assert.equal(socket.readyState, SoloSocket.CLOSED);
  assert.equal(pending.size, 0); assert.equal(socket.simulation, null);
  assert.equal(socket.tick(), false); send({ type: 'start' }); run();
  await flushMessages();
  assert.equal(messages.length, count); assert.equal(pending.size, 0);
});

test('default timers keep the host receiver required by browser timer APIs', async t => {
  let callback = null, cancelled = null;
  t.mock.method(globalThis, 'setTimeout', function (run, delay) {
    assert.equal(this, globalThis, 'browser timer methods require their host receiver');
    assert.ok(delay > 0);
    callback = run;
    return 12345;
  });
  t.mock.method(globalThis, 'clearTimeout', function (handle) {
    assert.equal(this, globalThis, 'cancelling must keep the host receiver too');
    cancelled = handle;
  });
  const { socket, send } = await open({ autoTick: true });
  send({ type: 'join', name: 'Solo' });
  assert.equal(typeof callback, 'function');
  socket.close();
  assert.equal(cancelled, 12345);
});
