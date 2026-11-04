// Last Night: a short solo mode — ten timed waves of 25 s with 5 s resupplies,
// survive until dawn. A subclass of the room keeps the classic simulation and
// its save file byte-for-byte identical: every hook here is opt-in, raids and
// the fuel mission stay out, and a five-minute stand is never saved.
import { RoomSimulation, TICK_RATE } from '../simulation.mjs';
import { waveBalance } from './rules.js';
import { LAST_NIGHT, lastNightBalance as balanceProfile, advanceLastNightTimer } from './last-night-rules.js';

export { LAST_NIGHT } from './last-night-rules.js';

export const LAST_NIGHT_MODE = 'last-night';

// Per wave: how many zombies come, how fast, how many stand at once, and how
// many brutes among them. Health, speed and runner share follow the classic
// curve for waves one through ten, with fewer enemies and no final boss.
export function lastNightBalance(wave = 1, playerCount = 1) {
  const level = Math.max(1, Math.min(LAST_NIGHT.waves, Math.floor(Number.isFinite(wave) ? wave : 1)));
  const balance = balanceProfile(level, waveBalance(level, playerCount));
  return { ...balance, soloTotal: balance.total };
}

export class LastNightSimulation extends RoomSimulation {
  constructor(code, options = {}) {
    super(code, { ...options, practice: false, raids: false });
    this.waveTimeLeft = 0;
  }

  get mode() { return LAST_NIGHT_MODE; }
  get maxWaves() { return LAST_NIGHT.waves; }
  get intermissionSeconds() { return LAST_NIGHT.intermissionSeconds; }

  currentWaveBalance() { return lastNightBalance(this.wave, this.wavePlayerCount ?? this.participantCount()); }

  // The generator's fuel mission belongs to the long night.
  beginExpeditionMission() { return false; }

  // No Last Night save records ever exist; classic saves load into classic
  // rooms, never onto this subclass.
  saveDenial() { return 'mode'; }
  importSave() { return { ok: false, reason: 'mode' }; }

  start(id) {
    const started = super.start(id);
    if (started) this.waveTimeLeft = 0;
    return started;
  }

  beginWave() {
    const begun = super.beginWave();
    if (begun) this.waveTimeLeft = LAST_NIGHT.waveSeconds;
    return begun;
  }

  finishWave() {
    // Clearing the enemies buys breathing space; the full timed wave remains.
    if (this.waveTimeLeft > 0) return false;
    return super.finishWave();
  }

  snapshot() {
    const state = super.snapshot();
    state.expedition.enabled = false;
    return state;
  }

  // Timed wave end: the horde scatters as the sky pales. Remaining bodies and
  // pending spawns are routed — removed, never killed nor paid — then the
  // usual resupply (or dawn after the tenth wave) follows on the same tick.
  routeWave() {
    const routed = this.toSpawn + this.spawnWarnings.size + this.zombies.size;
    this.toSpawn = 0;
    this.brutesToSpawn = 0;
    this.bruteSpawnAt = [];
    this.spawnWarnings.clear();
    this.zombies.clear();
    if (routed > 0) this.event('wave-routed', { wave: this.wave, routed });
  }

  tick(delta = 1 / TICK_RATE) {
    if (!Number.isFinite(delta) || delta < 0 || ['victory', 'gameover'].includes(this.phase)) return;
    const step = Math.min(delta, 0.1);
    if (!this.paused && this.phase === 'wave') {
      this.waveTimeLeft = advanceLastNightTimer(this.waveTimeLeft, step);
      if (this.waveTimeLeft <= 0) this.routeWave();
    }
    super.tick(step);
  }
}
