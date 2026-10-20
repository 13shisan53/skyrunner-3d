import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultSave, loadSave, persist, applyRun, rollMissions, dailySeed,
  beginDailyAttempt, dailyRewardAvailable, unlock, wear, todayKey,
} from '../../src/meta.js';

class Mem {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

const run = (over = {}) => ({
  score: 500, distance: 400, coins: 12, maxCombo: 6, duration: 50,
  cause: 'fall', stomps: 2, edges: 1, ...over,
});

test('corrupt or blocked storage falls back to defaults', () => {
  const m = new Mem();
  m.setItem('skyrunner.save.v2', '{not json');
  const s = loadSave(m);
  assert.equal(s.best, 0);
  assert.equal(s.version, 2);

  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  assert.doesNotThrow(() => persist(defaultSave(), throwing));
  assert.equal(loadSave(throwing).best, 0);
});

test('new best reports the gap to the old record', () => {
  const s = defaultSave();
  s.best = 620;
  const r = applyRun(s, run({ score: 500 }), { date: new Date(2026, 9, 20) });
  assert.equal(r.isBest, false);
  assert.equal(r.delta, -120);
  const r2 = applyRun(s, run({ score: 700 }), { date: new Date(2026, 9, 20) });
  assert.equal(r2.isBest, true);
  assert.equal(r2.delta, 80);
  assert.equal(s.best, 700);
});

test('unlocks spend coins and wear only owned items', () => {
  const s = defaultSave();
  s.coins = 60;
  assert.equal(unlock(s, 'char.sunset'), true);
  assert.equal(s.coins, 0);
  assert.equal(s.worn.char, 'char.sunset');
  assert.equal(wear(s, 'char', 'char.gold'), false);
});

test('missions are deterministic per local date and progress across runs', () => {
  const d = new Date(2026, 9, 20);
  assert.deepEqual(rollMissions(d).map((m) => m.id), rollMissions(d).map((m) => m.id));
  assert.notDeepEqual(rollMissions(d).map((m) => m.id), rollMissions(new Date(2026, 9, 21)).map((m) => m.id));

  const s = defaultSave(d);
  s.coins = 0;
  for (let i = 0; i < 3; i++) {
    applyRun(s, run({ coins: 999, stomps: 999, distance: 9999, maxCombo: 99, edges: 99 }), { date: d });
  }
  assert.ok(s.missions.items.every((m) => m.done), JSON.stringify(s.missions.items));
  assert.ok(s.coins > 0);
});

test('daily seed is stable per day and first attempt is the only rewarded one', () => {
  const d = new Date(2026, 9, 20);
  assert.equal(dailySeed(d), 20261020);
  assert.notEqual(dailySeed(d), dailySeed(new Date(2026, 9, 21)));
  const s = defaultSave(d);
  assert.equal(dailyRewardAvailable(s, d), true);
  assert.equal(beginDailyAttempt(s, d), true);
  assert.equal(beginDailyAttempt(s, d), false);
  assert.equal(dailyRewardAvailable(s, d), false);
});

test('blocked global localStorage does not throw', () => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new Error('blocked'); },
  });
  try {
    assert.doesNotThrow(() => loadSave());
    assert.doesNotThrow(() => persist(defaultSave()));
    assert.equal(loadSave().best, 0);
  } finally {
    if (desc) Object.defineProperty(globalThis, 'localStorage', desc);
    else delete globalThis.localStorage;
  }
});

test('todayKey uses local calendar fields', () => {
  assert.equal(todayKey(new Date(2026, 0, 2)), '2026-01-02');
});
