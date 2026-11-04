export const SIEGE = Object.freeze({
  mode: 'supply-siege',
  waves: 6,
  startingSupplies: 4,
  waveSeconds: 30,
  convoySeconds: 45,
  quietReward: 2,
  convoyReward: 5,
});

export const SIEGE_COSTS = Object.freeze({
  ammo: 1,
  medicine: 2,
  barricades: 2,
  shotgun: 3,
});

const WAVE_TOTALS = Object.freeze([8, 10, 12, 14, 16, 20]);
const CONVOY_BONUS_TOTAL = 4;

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export function newSiegeLedger() {
  return { supplies: SIEGE.startingSupplies, purchased: [], convoys: 0 };
}

function isValidLedger(ledger) {
  if (ledger === null || typeof ledger !== 'object' || Array.isArray(ledger)) return false;
  const { supplies, purchased, convoys } = ledger;
  if (!Number.isInteger(supplies) || supplies < 0) return false;
  if (!Array.isArray(purchased)) return false;
  const seen = new Set();
  for (const entry of purchased) {
    if (typeof entry !== 'string' || !hasOwn(SIEGE_COSTS, entry)) return false;
    if (seen.has(entry)) return false;
    seen.add(entry);
  }
  if (!Number.isInteger(convoys) || convoys < 0 || convoys > SIEGE.waves) return false;
  return true;
}

export function purchaseSiegeItem(ledger, item) {
  if (!isValidLedger(ledger)) return null;
  if (typeof item !== 'string' || !hasOwn(SIEGE_COSTS, item)) return null;
  if (ledger.purchased.includes(item)) return null;
  const cost = SIEGE_COSTS[item];
  if (ledger.supplies < cost) return null;
  return {
    supplies: ledger.supplies - cost,
    purchased: [...ledger.purchased, item],
    convoys: ledger.convoys,
  };
}

export function finishSiegeAssault(ledger, convoy = false) {
  if (!isValidLedger(ledger)) return null;
  const signaled = convoy === true;
  return {
    supplies: ledger.supplies + (signaled ? SIEGE.convoyReward : SIEGE.quietReward),
    purchased: [],
    convoys: signaled ? Math.min(ledger.convoys + 1, SIEGE.waves) : ledger.convoys,
  };
}

export function siegeWaveProfile(wave, convoy, classicBalance) {
  const normalized = Number.isInteger(wave) && wave >= 1 && wave <= SIEGE.waves ? wave : 1;
  const signaled = convoy === true;
  const total = WAVE_TOTALS[normalized - 1] + (signaled ? CONVOY_BONUS_TOTAL : 0);
  const base = classicBalance !== null && typeof classicBalance === 'object' ? classicBalance : {};
  return {
    ...base,
    total,
    maxActive: Math.min(total, 6 + normalized),
    spawnInterval: Math.min(2, 25 / total),
    brutes: normalized >= 5 ? 1 : 0,
    bosses: 0,
    seconds: signaled ? SIEGE.convoySeconds : SIEGE.waveSeconds,
  };
}
