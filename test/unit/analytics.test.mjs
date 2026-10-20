import test from 'node:test';
import assert from 'node:assert/strict';
import { Analytics } from '../../src/analytics.js';

class Mem {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.get(k) ?? null; }
  setItem(k, v) { this.map.set(k, String(v)); }
}

test('disabled analytics writes nothing', () => {
  const a = new Analytics({ enabled: false, storage: new Mem() });
  a.log('run_start', {});
  assert.equal(a.events.length, 0);
});

test('events cap at 200 and prune after 30 days', () => {
  let now = 1_000_000_000_000;
  const a = new Analytics({ enabled: true, storage: new Mem(), now: () => now });
  for (let i = 0; i < 260; i++) a.log('run_start', { i });
  assert.equal(a.events.length, 200);
  now += 31 * 24 * 3600 * 1000;
  a.prune();
  assert.equal(a.events.length, 0);
});

test('corrupt storage does not throw', () => {
  const storage = { getItem() { return '{nope'; }, setItem() {} };
  assert.doesNotThrow(() => new Analytics({ storage }));
});
