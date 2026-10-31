const WAVE_TOTALS = Object.freeze([6, 8, 10, 12, 14, 16, 18, 20, 22, 24]);
const MAX_DELTA_SECONDS = 0.25;

export const LAST_NIGHT = Object.freeze({
  mode: 'last-night',
  waves: 10,
  waveSeconds: 25,
  intermissionSeconds: 5,
});

function normalizeWave(wave) {
  if (typeof wave !== 'number' || !Number.isFinite(wave)) return 1;
  const whole = Math.trunc(wave);
  if (whole < 1) return 1;
  if (whole > LAST_NIGHT.waves) return LAST_NIGHT.waves;
  return whole;
}

export function lastNightBalance(wave, classicBalance) {
  const w = normalizeWave(wave);
  const total = WAVE_TOTALS[w - 1];
  return {
    ...classicBalance,
    total,
    maxActive: Math.min(total, 8 + w),
    spawnInterval: Math.min(2, 20 / total),
    brutes: w >= 7 ? 1 : 0,
    bosses: 0,
  };
}

export function advanceLastNightTimer(remaining, delta, paused = false) {
  if (paused) return remaining;
  const base = Number.isFinite(remaining) ? remaining : LAST_NIGHT.waveSeconds;
  const step = Number.isFinite(delta) ? Math.min(Math.max(delta, 0), MAX_DELTA_SECONDS) : 0;
  return Math.max(0, base - step);
}
