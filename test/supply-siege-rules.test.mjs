import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIEGE,
  SIEGE_COSTS,
  newSiegeLedger,
  purchaseSiegeItem,
  finishSiegeAssault,
  siegeWaveProfile,
} from '../public/supply-siege-rules.js';

const snapshot = (value) => JSON.parse(JSON.stringify(value));

const classic = () => ({
  hp: 10,
  speed: 3.5,
  total: 5,
  maxActive: 2,
  spawnInterval: 9,
  brutes: 7,
  bosses: 2,
  seconds: 99,
  label: 'classic',
});

test('SIEGE constant is frozen with the exact shape', () => {
  assert.equal(Object.isFrozen(SIEGE), true);
  assert.deepEqual(SIEGE, {
    mode: 'supply-siege',
    waves: 6,
    startingSupplies: 4,
    waveSeconds: 30,
    convoySeconds: 45,
    quietReward: 2,
    convoyReward: 5,
  });
});

test('SIEGE_COSTS constant is frozen with the exact shape', () => {
  assert.equal(Object.isFrozen(SIEGE_COSTS), true);
  assert.deepEqual(SIEGE_COSTS, { ammo: 1, medicine: 2, barricades: 2, shotgun: 3 });
});

test('newSiegeLedger returns fresh independent ledgers', () => {
  const a = newSiegeLedger();
  const b = newSiegeLedger();
  assert.deepEqual(a, { supplies: 4, purchased: [], convoys: 0 });
  assert.notEqual(a, b);
  assert.notEqual(a.purchased, b.purchased);
  a.purchased.push('ammo');
  a.supplies = 0;
  a.convoys = 9;
  assert.deepEqual(b, { supplies: 4, purchased: [], convoys: 0 });
});

test('purchases across several breaks cover all four categories', () => {
  const first = newSiegeLedger();

  const withAmmo = purchaseSiegeItem(first, 'ammo');
  assert.deepEqual(withAmmo, { supplies: 3, purchased: ['ammo'], convoys: 0 });
  const withBarricades = purchaseSiegeItem(withAmmo, 'barricades');
  assert.deepEqual(withBarricades, { supplies: 1, purchased: ['ammo', 'barricades'], convoys: 0 });
  assert.equal(purchaseSiegeItem(withBarricades, 'medicine'), null);

  const afterQuiet = finishSiegeAssault(withBarricades, false);
  assert.deepEqual(afterQuiet, { supplies: 3, purchased: [], convoys: 0 });
  const withMedicine = purchaseSiegeItem(afterQuiet, 'medicine');
  assert.deepEqual(withMedicine, { supplies: 1, purchased: ['medicine'], convoys: 0 });

  const afterConvoy = finishSiegeAssault(withMedicine, true);
  assert.deepEqual(afterConvoy, { supplies: 6, purchased: [], convoys: 1 });
  const withShotgun = purchaseSiegeItem(afterConvoy, 'shotgun');
  assert.deepEqual(withShotgun, { supplies: 3, purchased: ['shotgun'], convoys: 1 });
  const rearmed = purchaseSiegeItem(withShotgun, 'ammo');
  assert.deepEqual(rearmed, { supplies: 2, purchased: ['shotgun', 'ammo'], convoys: 1 });

  assert.deepEqual(first, { supplies: 4, purchased: [], convoys: 0 });
});

test('purchase returns a new ledger without mutating the input', () => {
  const ledger = { supplies: 4, purchased: ['ammo'], convoys: 1 };
  const before = snapshot(ledger);
  const next = purchaseSiegeItem(ledger, 'medicine');
  assert.notEqual(next, ledger);
  assert.notEqual(next.purchased, ledger.purchased);
  assert.deepEqual(ledger, before);
  assert.deepEqual(next, { supplies: 2, purchased: ['ammo', 'medicine'], convoys: 1 });
});

test('purchase rejects unknown, prototype, and non-string items', () => {
  const ledger = newSiegeLedger();
  const items = ['rockets', 'constructor', '__proto__', 'toString', 'hasOwnProperty', '', 1, 0, null, undefined, {}, [], true];
  for (const item of items) {
    assert.equal(purchaseSiegeItem(ledger, item), null, `item ${String(item)}`);
  }
  assert.deepEqual(ledger, { supplies: 4, purchased: [], convoys: 0 });
});

test('purchase rejects duplicates within the same break', () => {
  const ledger = purchaseSiegeItem(newSiegeLedger(), 'ammo');
  assert.equal(purchaseSiegeItem(ledger, 'ammo'), null);
});

test('purchase rejects overspending', () => {
  const ledger = { supplies: 2, purchased: [], convoys: 0 };
  assert.equal(purchaseSiegeItem(ledger, 'shotgun'), null);
  assert.equal(purchaseSiegeItem({ supplies: 0, purchased: [], convoys: 0 }, 'ammo'), null);
  assert.deepEqual(ledger, { supplies: 2, purchased: [], convoys: 0 });
});

test('purchase and finish reject malformed ledgers', () => {
  const badLedgers = [
    null,
    undefined,
    42,
    'ledger',
    true,
    [],
    {},
    { supplies: -1, purchased: [], convoys: 0 },
    { supplies: 1.5, purchased: [], convoys: 0 },
    { supplies: NaN, purchased: [], convoys: 0 },
    { supplies: Infinity, purchased: [], convoys: 0 },
    { supplies: '4', purchased: [], convoys: 0 },
    { supplies: 4, purchased: 'ammo', convoys: 0 },
    { supplies: 4, purchased: null, convoys: 0 },
    { supplies: 4, purchased: ['rockets'], convoys: 0 },
    { supplies: 4, purchased: ['constructor'], convoys: 0 },
    { supplies: 4, purchased: ['__proto__'], convoys: 0 },
    { supplies: 4, purchased: ['ammo', 'ammo'], convoys: 0 },
    { supplies: 4, purchased: [1], convoys: 0 },
    { supplies: 4, purchased: [null], convoys: 0 },
    { supplies: 4, purchased: [], convoys: -1 },
    { supplies: 4, purchased: [], convoys: 7 },
    { supplies: 4, purchased: [], convoys: 0.5 },
    { supplies: 4, purchased: [], convoys: NaN },
    { supplies: 4, purchased: [], convoys: '1' },
  ];
  for (const ledger of badLedgers) {
    assert.equal(purchaseSiegeItem(ledger, 'ammo'), null, `purchase ${JSON.stringify(ledger)}`);
    assert.equal(finishSiegeAssault(ledger, true), null, `finish ${JSON.stringify(ledger)}`);
    assert.equal(finishSiegeAssault(ledger), null, `finish-default ${JSON.stringify(ledger)}`);
  }
});

test('finishSiegeAssault rewards, resets purchases, and keeps history', () => {
  const ledger = { supplies: 1, purchased: ['shotgun', 'ammo'], convoys: 2 };
  const before = snapshot(ledger);
  const quiet = finishSiegeAssault(ledger);
  assert.deepEqual(quiet, { supplies: 3, purchased: [], convoys: 2 });
  const signaled = finishSiegeAssault(ledger, true);
  assert.deepEqual(signaled, { supplies: 6, purchased: [], convoys: 3 });
  assert.notEqual(quiet, ledger);
  assert.notEqual(signaled.purchased, ledger.purchased);
  assert.deepEqual(ledger, before);
});

test('finishSiegeAssault requires convoy to be exactly true', () => {
  const ledger = { supplies: 0, purchased: [], convoys: 0 };
  for (const convoy of [1, 'true', 'yes', {}, [], 2, null, undefined]) {
    const after = finishSiegeAssault(ledger, convoy);
    assert.deepEqual(after, { supplies: 2, purchased: [], convoys: 0 }, `convoy ${String(convoy)}`);
  }
  assert.deepEqual(finishSiegeAssault(ledger, true), { supplies: 5, purchased: [], convoys: 1 });
});

test('convoys are capped at six', () => {
  const ledger = { supplies: 10, purchased: [], convoys: 6 };
  const after = finishSiegeAssault(ledger, true);
  assert.deepEqual(after, { supplies: 15, purchased: [], convoys: 6 });
  assert.deepEqual(ledger, { supplies: 10, purchased: [], convoys: 6 });
});

test('a full six-convoy run peaks at 34 supplies', () => {
  let ledger = newSiegeLedger();
  for (let i = 0; i < SIEGE.waves; i += 1) {
    ledger = finishSiegeAssault(ledger, true);
  }
  assert.equal(ledger.supplies, 34);
  assert.equal(ledger.convoys, 6);
});

test('wave profiles are finite and bounded for all six waves', () => {
  const totals = [8, 10, 12, 14, 16, 20];
  for (let wave = 1; wave <= 6; wave += 1) {
    for (const convoy of [false, true]) {
      const profile = siegeWaveProfile(wave, convoy, classic());
      const expectedTotal = totals[wave - 1] + (convoy ? 4 : 0);
      assert.equal(profile.total, expectedTotal);
      assert.equal(profile.maxActive, Math.min(expectedTotal, 6 + wave));
      assert.equal(profile.spawnInterval, Math.min(2, 25 / expectedTotal));
      assert.equal(profile.brutes, wave >= 5 ? 1 : 0);
      assert.equal(profile.bosses, 0);
      assert.equal(profile.seconds, convoy ? 45 : 30);
      for (const key of ['total', 'maxActive', 'spawnInterval', 'brutes', 'bosses', 'seconds']) {
        assert.ok(Number.isFinite(profile[key]), `${key} wave ${wave} convoy ${convoy}`);
      }
      assert.ok(profile.maxActive <= profile.total);
      assert.ok(profile.spawnInterval > 0 && profile.spawnInterval <= 2);
    }
  }
});

test('convoy signal adds four to the total and extends seconds', () => {
  const quiet = siegeWaveProfile(6, false, classic());
  const signaled = siegeWaveProfile(6, true, classic());
  assert.equal(signaled.total, quiet.total + 4);
  assert.equal(quiet.total, 20);
  assert.equal(signaled.total, 24);
  assert.equal(quiet.seconds, 30);
  assert.equal(signaled.seconds, 45);
  assert.equal(signaled.maxActive, 12);
  assert.equal(signaled.spawnInterval, 25 / 24);
});

test('profile keeps classic stats and never mutates the input balance', () => {
  const base = classic();
  const before = snapshot(base);
  const profile = siegeWaveProfile(3, false, base);
  assert.notEqual(profile, base);
  assert.equal(profile.hp, 10);
  assert.equal(profile.speed, 3.5);
  assert.equal(profile.label, 'classic');
  assert.equal(profile.total, 12);
  assert.equal(profile.maxActive, 9);
  assert.deepEqual(base, before);
});

test('invalid waves normalize to wave 1', () => {
  const invalid = [0, 7, -1, 2.5, NaN, Infinity, -Infinity, '3', '1', undefined, null, {}, [], true];
  for (const wave of invalid) {
    const profile = siegeWaveProfile(wave, false, classic());
    assert.equal(profile.total, 8, `wave ${String(wave)}`);
    assert.equal(profile.maxActive, 7);
    assert.equal(profile.spawnInterval, 2);
    assert.equal(profile.brutes, 0);
    assert.equal(profile.bosses, 0);
    assert.equal(profile.seconds, 30);
  }
});

test('convoy wave bonus requires exactly true', () => {
  const base = classic();
  for (const convoy of [1, 'true', 'yes', {}, [], 2, null, undefined]) {
    const profile = siegeWaveProfile(1, convoy, base);
    assert.equal(profile.total, 8, `convoy ${String(convoy)}`);
    assert.equal(profile.seconds, 30);
  }
  const signaled = siegeWaveProfile(1, true, base);
  assert.equal(signaled.total, 12);
  assert.equal(signaled.seconds, 45);
});

test('profiles for the same wave and convoy are independent objects', () => {
  const base = classic();
  const a = siegeWaveProfile(2, true, base);
  const b = siegeWaveProfile(2, true, base);
  assert.notEqual(a, b);
  assert.deepEqual(a, b);
  a.total = 999;
  assert.equal(b.total, 14);
  assert.equal(base.total, 5);
});
