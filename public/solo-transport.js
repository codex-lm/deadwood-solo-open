import { RoomSimulation, TICK_RATE } from '../simulation.mjs';
import { receiveSaveUpload, parseSaveText } from '../save-transfer.mjs';
import { LEVEL_ID } from './level-id.js';

const PAUSED_MESSAGES = new Set(['pause', 'start', 'restart', 'ping', 'leave', 'ready', 'save-game', 'claim-seat', 'load-begin', 'load-chunk']);
const identifier = () => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(8)), byte => byte.toString(16).padStart(2, '0')).join('');

/**
 * The existing client protocol, executed against one local simulation.
 * No request, socket, worker or remote game service is created here.
 */
export class SoloSocket extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(_url, { clock = () => globalThis.performance.now(),
    schedule = (callback, delay) => globalThis.setTimeout(callback, delay),
    cancel = handle => globalThis.clearTimeout(handle),
    autoTick = true, random = Math.random, playerId = identifier(), build = null } = {}) {
    super();
    this.readyState = SoloSocket.CONNECTING;
    this.bufferedAmount = 0;
    this.playerId = playerId;
    this.roomCode = '000000';
    this.build = build;
    this.simulation = null;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    this._clock = clock;
    this._schedule = schedule;
    this._cancel = cancel;
    this._autoTick = autoTick;
    this._random = random;
    this._timer = null;
    this._nextTickAt = 0;
    this._lastTickAt = clock();
    this._ticks = 0;
    this._joined = false;
    this._impactNumbers = false;
    this.saveUpload = null;
    queueMicrotask(() => {
      if (this.readyState !== SoloSocket.CONNECTING) return;
      this.readyState = SoloSocket.OPEN;
      this._event(new Event('open'));
    });
  }

  _event(event) {
    this.dispatchEvent(event);
    const listener = this['on' + event.type];
    if (typeof listener === 'function') listener.call(this, event);
  }

  _packet(message) {
    if (this.readyState !== SoloSocket.OPEN) return;
    const data = JSON.stringify(message);
    // The client was written for WebSocket delivery: a response must never
    // reenter its send loop (a finished save upload clears that loop's state).
    queueMicrotask(() => {
      if (this.readyState === SoloSocket.OPEN) this._event(new MessageEvent('message', { data }));
    });
  }

  _state() {
    if (this.simulation && this._joined) this._packet(this.simulation.snapshot());
  }

  _impacts() {
    if (!this.simulation) return;
    for (const [id, impacts] of this.simulation.takeImpactNumbers()) {
      if (id === this.playerId) this._packet({ type: 'impacts', impacts });
    }
  }

  _watchImpacts() {
    this.simulation.setImpactObservers(this._impactNumbers ? [this.playerId] : []);
  }

  _join(message) {
    if (this._joined) {
      this._packet({ type: 'error', message: 'A solo game already has its survivor.' });
      return;
    }
    if (typeof message.room === 'string' && message.room.trim()) {
      this._packet({ type: 'error', message: 'This edition is single-player. Start your own solo game.' });
      return;
    }
    this.build ??= typeof message.build === 'string' ? message.build : 'solo-open-v1';
    this.simulation = new RoomSimulation(this.roomCode, { practice: message.practice === true,
      ambiance: message.ambiance, random: this._random,
      onEvent: event => { if (this._joined) this._packet(event); } });
    this.simulation.companionsAvailable = false;
    this.simulation.addPlayer(this.playerId, typeof message.name === 'string' ? message.name : 'Survivor', message.weapon,
      { defer: true, sheet: message.sheet });
    this._joined = true;
    this._watchImpacts();
    this._lastTickAt = this._clock();
    this._packet({ type: 'welcome', id: this.playerId, room: this.roomCode, hostId: this.playerId,
      practice: this.simulation.practice, ambiance: this.simulation.ambiance, build: this.build, mapId: LEVEL_ID });
    this._state();
    if (this._autoTick && this.readyState === SoloSocket.OPEN) this._startTimer();
  }

  _startTimer() {
    const period = 1000 / TICK_RATE;
    this._nextTickAt = this._clock() + period;
    const run = () => {
      this._timer = null;
      if (this.readyState !== SoloSocket.OPEN || !this.simulation) return;
      try { this.tick(); }
      catch (error) {
        const event = new Event('error');
        Object.defineProperty(event, 'error', { value: error });
        this._event(event);
        this.close(1011, 'The local simulation stopped.');
        return;
      }
      this._nextTickAt += period;
      const now = this._clock();
      // A suspended/background tab never returns to a burst of queued ticks.
      if (this._nextTickAt <= now) this._nextTickAt += (Math.floor((now - this._nextTickAt) / period) + 1) * period;
      if (this.readyState === SoloSocket.OPEN) this._timer = this._schedule(run, Math.max(0, this._nextTickAt - this._clock()));
    };
    this._timer = this._schedule(run, period);
  }

  // Manual stepping is used by deterministic tests; production uses the same
  // fixed step from the local timer above, with snapshots at 15 Hz.
  tick() {
    if (this.readyState !== SoloSocket.OPEN || !this.simulation) return false;
    this._lastTickAt = this._clock();
    this.simulation.tick(1 / TICK_RATE);
    this._impacts();
    if (this._ticks++ % 2 === 0) this._state();
    return true;
  }

  _load(message) {
    const sim = this.simulation;
    const refusal = sim.practice ? 'practice' : sim.phase !== 'lobby' ? 'phase' : null;
    const step = receiveSaveUpload(this, message, { refusal });
    if (step.reply) { this._packet(step.reply); return; }
    if (step.text === undefined) return;
    const parsed = parseSaveText(step.text);
    // Other editions' multiplayer saves must not introduce extra survivors or
    // companion records into a solo game.
    const solo = Array.isArray(parsed.save?.players) && parsed.save.players.length === 1 && parsed.save.players[0]?.companion !== true;
    const result = parsed.reason ? { ok: false, reason: parsed.reason }
      : !solo ? { ok: false, reason: 'crowded' } : sim.importSave(parsed.save, this.playerId);
    if (!result.ok) { this._packet({ type: 'load-result', ok: false, reason: result.reason }); return; }
    sim.announceRestore();
    this._watchImpacts();
    this._state();
    this._packet({ type: 'load-result', ok: true, wave: result.wave, phase: result.phase });
  }

  send(raw) {
    if (this.readyState === SoloSocket.CONNECTING) throw new DOMException('The local session is not open.', 'InvalidStateError');
    if (this.readyState !== SoloSocket.OPEN) return;
    let message;
    try { message = JSON.parse(raw); }
    catch { this._packet({ type: 'error', message: 'Invalid game message.' }); return; }
    if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') return;
    if (message.type === 'join') { this._join(message); return; }
    const sim = this.simulation, id = this.playerId;
    if (!sim) return;
    if (message.type === 'impact-numbers') {
      if (typeof message.enabled !== 'boolean') return;
      this._impactNumbers = message.enabled;
      this._watchImpacts();
      this._packet({ type: 'impact-numbers', enabled: message.enabled });
      return;
    }
    if (sim.paused && !PAUSED_MESSAGES.has(message.type)) return;
    switch (message.type) {
      case 'ready': sim.readyPlayer(id); this._state(); break;
      case 'pause': if (sim.setPause(id, message.paused)) this._state(); break;
      case 'practice': sim.practiceAction(id, message); break;
      case 'input': sim.setInput(id, message); break;
      case 'umbrella': sim.setUmbrella(id, message.open); break;
      case 'next-wave': sim.voteNextWave(id, message.ready); break;
      case 'revive-kit': sim.useReviveKit(id); break;
      case 'drop-coins': sim.dropCoins(id); break;
      case 'difficulty': if (sim.setDifficulty(id, message.level)) this._state(); break;
      case 'friendly-fire': if (sim.setFriendlyFire(id, message.level)) this._state(); break;
      case 'sheet': if (sim.setSheet(id, message.sheet)) this._state(); break;
      case 'shoot': sim.shoot(id, Math.max(0, Math.min(.1, (this._clock() - this._lastTickAt) / 1000)), message.attack, message.hand); this._impacts(); break;
      case 'melee-cancel': sim.cancelMelee(id); break;
      case 'minigun-spin': if (message.hand === undefined || ['primary', 'secondary'].includes(message.hand)) sim.setMinigunSpin(id, message.spinning, message.hand); break;
      case 'reload': sim.reload(id, message.hand); break;
      case 'dual-wield': sim.setDualWield(id, message.enabled, message.secondaryWeaponId); break;
      case 'drop-weapon': sim.dropWeapon(id); break;
      case 'grenade': sim.throwGrenade(id); break;
      case 'interact': sim.interact(id, { revive: message.revive === true }); break;
      case 'buy': sim.buyWeapon(id, message.crateId); break;
      case 'supply-claim': sim.claimSupply(id, message.bonus, message.crateId); break;
      case 'supply-buy': sim.buySupply(id, message.service); break;
      case 'weapon': if (!sim.chooseWeapon(id, message.weaponId ?? message.weapon)) this._packet({ type: 'error', message: 'Buy this weapon at its rack before equipping it.' }); break;
      case 'start': case 'restart': sim.start(id); this._watchImpacts(); this._state(); break;
      case 'ping': this._packet({ type: 'pong', time: Date.now() }); break;
      case 'save-game':
        try { this._packet({ type: 'save-game', save: sim.exportSave({ build: this.build, requesterId: id }) }); }
        catch (error) { this._packet({ type: 'save-denied', reason: typeof error?.code === 'string' ? error.code : 'error' }); }
        break;
      case 'claim-seat': if (sim.claimSeat(id, message.seat)) this._state(); break;
      case 'load-begin': case 'load-chunk': this._load(message); break;
      case 'leave': this.close(); break;
    }
  }

  close(code = 1000, reason = '') {
    if (this.readyState === SoloSocket.CLOSING || this.readyState === SoloSocket.CLOSED) return;
    this.readyState = SoloSocket.CLOSING;
    if (this._timer !== null) this._cancel(this._timer);
    this._timer = null;
    this.saveUpload = null;
    this._joined = false;
    this.simulation = null;
    this.readyState = SoloSocket.CLOSED;
    const event = new Event('close');
    Object.defineProperties(event, { code: { value: code }, reason: { value: reason }, wasClean: { value: code === 1000 } });
    queueMicrotask(() => this._event(event));
  }
}
