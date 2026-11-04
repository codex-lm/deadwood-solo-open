// Opt-in campaign: the shared room, Classic saves and Last Night are unchanged.
import { LastNightSimulation } from './last-night.js';
import { waveBalance } from './rules.js';
import { characterStats } from './character-bonuses.js';
import { SIEGE, SIEGE_COSTS, newSiegeLedger, purchaseSiegeItem, finishSiegeAssault, siegeWaveProfile } from './supply-siege-rules.js';

export class SupplySiegeSimulation extends LastNightSimulation {
  constructor(code, options = {}) {
    super(code, options);
    this.ledger = newSiegeLedger();
    this.planning = false;
    this.convoy = false;
  }
  get mode() { return SIEGE.mode; }
  get maxWaves() { return SIEGE.waves; }
  currentWaveBalance() {
    return siegeWaveProfile(this.wave, this.convoy, waveBalance(Math.max(1, this.wave * 2 - 1), 1));
  }
  start(id) {
    if (!super.start(id)) return false;
    this.ledger = newSiegeLedger();
    this.convoy = false;
    this.planning = true;
    this.resetPlayerControls(true);
    return true;
  }
  beginWave() {
    if (this.planning) return false;
    const begun = super.beginWave();
    if (begun) this.waveTimeLeft = this.currentWaveBalance().seconds;
    return begun;
  }
  // Never call the automatic resupply path: wounds, ammo and armour carry over.
  finishWave() {
    if (this.phase !== 'wave' || this.waveTimeLeft > 0 || this.spawnWarnings.size || !this.livingPlayers().length) return false;
    if (this.wave >= this.maxWaves) return this.beginExtraction();
    this.payReviveCredits('wave');
    this.ledger = finishSiegeAssault(this.ledger, this.convoy);
    this.phase = 'intermission';
    this.timeLeft = 3;
    this.planning = true;
    this.resetPlayerControls(true);
    this.bullets.clear(); this.grenades.clear();
    for (const player of this.players.values()) this.clearWeaponReloads(player);
    this.event('siege-break', { wave: this.wave, supplies: this.ledger.supplies });
    return true;
  }
  availability(player = this.players.get(this.hostId)) {
    const usable = this.planning && player?.alive && !player.downed;
    const eligible = {
      ammo: usable && Object.entries(player.inventory).some(([id, stock]) => {
        const profile = this.weaponProfile(player, id);
        return !profile.melee && (stock.ammo < profile.magazine || stock.reserve < profile.reserve);
      }),
      medicine: usable && player.hp < characterStats(player).maxHp,
      barricades: usable && this.doors.some(door => !door.sealed && door.hp < door.maxHp),
      shotgun: usable && this.wave >= 1 && !player.inventory.shotgun && !player.issuedWeapons.has('shotgun') && Object.keys(player.inventory).length < this.weaponSlots(player),
    };
    return Object.fromEntries(Object.keys(SIEGE_COSTS).map(item => [item, !!eligible[item] && !!purchaseSiegeItem(this.ledger, item)]));
  }
  buySiege(id, item) {
    if (id !== this.hostId || !Object.hasOwn(SIEGE_COSTS, item) || !this.availability()[item]) return false;
    const next = purchaseSiegeItem(this.ledger, item), player = this.players.get(id);
    if (!next) return false;
    if (item === 'medicine') player.hp = Math.min(characterStats(player).maxHp, player.hp + 45);
    if (item === 'barricades') for (const door of this.doors) if (!door.sealed) door.hp = door.maxHp;
    if (item === 'shotgun') {
      const profile = this.weaponProfile(player, 'shotgun');
      player.inventory.shotgun = { ammo: profile.magazine, reserve: profile.reserve };
      player.issuedWeapons.add('shotgun');
    }
    if (item === 'ammo') {
      for (const [weapon, stock] of Object.entries(player.inventory)) {
        const profile = this.weaponProfile(player, weapon);
        if (!profile.melee) Object.assign(stock, { ammo: profile.magazine, reserve: profile.reserve });
      }
      this.clearWeaponReloads(player);
    }
    this.ledger = next;
    this.event('siege-purchase', { item, supplies: this.ledger.supplies });
    return true;
  }
  startSiegeAssault(id, convoy) {
    if (id !== this.hostId || typeof convoy !== 'boolean' || !this.planning || !this.livingPlayers().length) return false;
    if (convoy && this.wave >= this.maxWaves - 1) return false;
    this.convoy = convoy;
    this.planning = false;
    this.paused = false; this.pauseById = null;
    this.timeLeft = 3;
    this.resetPlayerControls(true);
    return true;
  }
  // The planning desk is a true freeze, including projectiles and reloads.
  setPause(id, paused) { return this.planning ? false : super.setPause(id, paused); }
  voteNextWave() { return false; }
  tick(delta) { if (!this.planning) super.tick(delta); }
  snapshot() {
    const state = super.snapshot();
    const player = this.players.get(this.hostId);
    state.siege = { planning: this.planning, supplies: this.ledger.supplies,
      purchased: [...this.ledger.purchased], convoys: this.ledger.convoys, convoy: this.convoy,
      available: this.availability(player), nextAssault: Math.min(SIEGE.waves, this.wave + 1),
      reserveAmmo: player ? Object.values(player.inventory).reduce((sum, stock) => sum + (Number.isFinite(stock.reserve) ? stock.reserve : 0), 0) : 0 };
    return state;
  }
}
