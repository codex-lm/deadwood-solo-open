import test from 'node:test';
import assert from 'node:assert';

import {
  LAST_NIGHT,
  advanceLastNightTimer,
  lastNightBalance,
} from '../public/last-night-rules.js';

const RAMP = [6, 8, 10, 12, 14, 16, 18, 20, 22, 24];

test('LAST_NIGHT is a frozen single-player mode descriptor', () => {
  assert.deepStrictEqual({ ...LAST_NIGHT }, {
    mode: 'last-night',
    waves: 10,
    waveSeconds: 25,
    intermissionSeconds: 5,
  });
  assert.ok(Object.isFrozen(LAST_NIGHT));
});

test('lastNightBalance yields ten finite bounded wave profiles', () => {
  const classic = { hp: 120, speed: 5, headshot: 2, total: 40, maxActive: 15, spawnInterval: 0.4, brutes: 4, bosses: 1 };
  for (let wave = 1; wave <= 10; wave += 1) {
    const profile = lastNightBalance(wave, classic);
    assert.strictEqual(profile.total, RAMP[wave - 1], `wave ${wave} total`);
    assert.strictEqual(profile.bosses, 0, `wave ${wave} bosses`);
    assert.strictEqual(profile.brutes, wave >= 7 ? 1 : 0, `wave ${wave} brutes`);
    assert.ok(Number.isFinite(profile.maxActive), `wave ${wave} maxActive finite`);
    assert.ok(profile.maxActive >= 1 && profile.maxActive <= profile.total, `wave ${wave} maxActive within total`);
    assert.ok(profile.maxActive <= 8 + wave, `wave ${wave} maxActive ramp cap`);
    assert.ok(Number.isFinite(profile.spawnInterval), `wave ${wave} spawnInterval finite`);
    assert.ok(profile.spawnInterval > 0 && profile.spawnInterval <= 2, `wave ${wave} spawnInterval bounded`);
  }
});

test('lastNightBalance does not mutate and keeps classic combat stats', () => {
  const classic = {
    hp: 120,
    speed: 5.5,
    headshot: 2.5,
    total: 40,
    maxActive: 15,
    spawnInterval: 0.4,
    brutes: 4,
    bosses: 3,
    label: 'classic-night',
  };
  const snapshot = { ...classic };
  const profile = lastNightBalance(9, classic);
  assert.deepStrictEqual(classic, snapshot);
  assert.notStrictEqual(profile, classic);
  assert.strictEqual(profile.hp, 120);
  assert.strictEqual(profile.speed, 5.5);
  assert.strictEqual(profile.headshot, 2.5);
  assert.strictEqual(profile.label, 'classic-night');
  assert.strictEqual(profile.bosses, 0);
  assert.strictEqual(profile.total, 22);
});

test('lastNightBalance normalizes invalid wave input', () => {
  const classic = { hp: 100 };
  for (const bad of [NaN, Infinity, -Infinity, undefined, null, 'x', {}, []]) {
    assert.strictEqual(lastNightBalance(bad, classic).total, RAMP[0], `wave ${String(bad)}`);
  }
  assert.strictEqual(lastNightBalance(0, classic).total, RAMP[0]);
  assert.strictEqual(lastNightBalance(-4, classic).total, RAMP[0]);
  assert.strictEqual(lastNightBalance(3.9, classic).total, RAMP[2]);
  assert.strictEqual(lastNightBalance(11, classic).total, RAMP[9]);
});

test('advanceLastNightTimer counts down ordinarily', () => {
  assert.strictEqual(advanceLastNightTimer(10, 0.25), 9.75);
  assert.strictEqual(advanceLastNightTimer(25, 0), 25);
  const next = advanceLastNightTimer(25, 0.1);
  assert.ok(next < 25 && next > 24.8, `expected ~24.9, got ${next}`);
});

test('advanceLastNightTimer returns remaining unchanged while paused', () => {
  assert.strictEqual(advanceLastNightTimer(12.5, 0.1, true), 12.5);
  assert.strictEqual(advanceLastNightTimer(3, 1, true), 3);
  assert.ok(Number.isNaN(advanceLastNightTimer(NaN, 0.1, true)));
});

test('advanceLastNightTimer ignores invalid or oversized delta', () => {
  for (const bad of [NaN, Infinity, -Infinity, -0.5, undefined, 'x']) {
    assert.strictEqual(advanceLastNightTimer(12.5, bad), 12.5, `delta ${String(bad)}`);
  }
  assert.strictEqual(advanceLastNightTimer(10, 1), 9.75);
  assert.strictEqual(advanceLastNightTimer(10, 30), 9.75);
});

test('advanceLastNightTimer never returns negative and repairs malformed remaining', () => {
  assert.strictEqual(advanceLastNightTimer(0.1, 0.25), 0);
  assert.strictEqual(advanceLastNightTimer(0, 0.25), 0);
  assert.strictEqual(advanceLastNightTimer(-5, 0.25), 0);
  assert.strictEqual(advanceLastNightTimer(NaN, 0.25), 24.75);
  assert.strictEqual(advanceLastNightTimer(undefined, 0), 25);
});
