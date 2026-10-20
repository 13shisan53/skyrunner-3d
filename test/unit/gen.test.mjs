import test from 'node:test';
import assert from 'node:assert/strict';
import { Course } from '../../src/gen.js';
import { SEG, speedAt, difficultyAt } from '../../src/config.js';

const take = (seed, n) => {
  const c = new Course(seed);
  return Array.from({ length: n }, () => c.next());
};

test('same seed, same 30 segments', () => {
  assert.deepEqual(take(1234, 30), take(1234, 30));
});

test('different seeds produce different courses', () => {
  assert.notDeepEqual(take(1, 20), take(2, 20));
});

test('first platform is the onboarding runway', () => {
  const [s0, s1] = take(7, 2);
  assert.equal(s0.index, 0);
  assert.equal(s0.gap, 0);
  assert.equal(s0.w, SEG.firstWidth);
  assert.equal(s0.d, SEG.firstDepth);
  assert.ok(s1.gap >= SEG.gapFrom - 0.01);
});

test('gaps, lateral steps, height steps stay reachable', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const segs = take(seed, 60);
    for (let i = 1; i < segs.length; i++) {
      const prev = segs[i - 1];
      const cur = segs[i];
      const actualGap = cur.z - cur.d / 2 - (prev.z + prev.d / 2);
      assert.ok(actualGap >= 1.9 && actualGap <= 5.35, `gap ${actualGap}`);
      assert.ok(Math.abs(cur.y - prev.y) <= 1.11);
      assert.ok(Math.abs(cur.x - prev.x) <= 3.81);
      assert.ok(cur.w >= 3.95 && cur.w <= 9.8, `width ${cur.w}`);
      assert.ok(cur.d >= 3.35);
    }
  }
});

test('drones never sit on the landing edge', () => {
  for (const seg of take(99, 80)) {
    for (const d of seg.drones) {
      assert.ok(seg.frontEdge - d.z >= 1.5 || d.z - seg.backEdge >= 1.5);
    }
  }
});

test('shields respect the 12–16 segment cooldown', () => {
  const segs = take(2026, 120);
  const at = segs.map((s, i) => (s.shield ? i : -1)).filter((i) => i >= 0);
  for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= 12);
  assert.ok(at.length >= 4, `only ${at.length} shields`);
});

test('biome changes every 18 segments and difficulty caps', () => {
  const segs = take(5, 60);
  for (const s of segs) assert.equal(s.biome, Math.floor(s.index / SEG.biomeEvery) % 4);
  assert.equal(difficultyAt(45), 1);
  assert.equal(difficultyAt(60), 1);
  assert.equal(speedAt(0), 6.8);
  assert.equal(speedAt(520), 10.8);
  assert.equal(speedAt(9999), 10.8);
});

test('ahead() fills to the requested edge', () => {
  const c = new Course(88);
  const added = c.ahead(80);
  assert.ok(added.length >= 5);
  for (let i = 1; i < added.length; i++) {
    const prev = added[i - 1];
    const cur = added[i];
    assert.ok(cur.z - cur.d / 2 > prev.z - prev.d / 2);
  }
});
