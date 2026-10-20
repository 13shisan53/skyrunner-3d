import test from 'node:test';
import assert from 'node:assert/strict';
import { stepBody, aabbOf, overlaps } from '../../src/physics.js';

const platform = { min: { x: -2, y: -1, z: -2 }, max: { x: 2, y: 0, z: 2 } };
const body = (x, y, z, vx, vy, vz) => ({
  pos: { x, y, z }, vel: { x: vx, y: vy, z: vz }, grounded: false,
});

test('falls, lands and comes to rest on top', () => {
  const b = body(0, 0.7, 0, 0, -5, 0);
  const ev = stepBody(b, [platform], 1 / 30, { radius: 0.36, halfH: 0.55, forgiving: 0.12 });
  assert.equal(ev.landed, true);
  assert.equal(b.pos.y, 0.551);
  assert.equal(b.vel.y, 0);
  assert.equal(b.grounded, true);
});

test('edge forgiveness lets a toe land, but not a full miss', () => {
  const toe = body(2.4, 0.7, 0, 0, -5, 0);
  const miss = body(2.6, 0.7, 0, 0, -5, 0);
  assert.equal(stepBody(toe, [platform], 1 / 30, { radius: .36, halfH: .55, forgiving: .12 }).landed, true);
  const ev = stepBody(miss, [platform], 1 / 30, { radius: .36, halfH: .55, forgiving: .12 });
  assert.equal(ev.landed, false);
  assert.ok(miss.pos.y < 0.55);
});

test('a 0.1s frame still cannot tunnel through a 1m platform', () => {
  const b = body(0, 1.5, 0, 0, -30, 0);
  const ev = stepBody(b, [platform], 0.1, { radius: .36, halfH: .55, forgiving: .12 });
  assert.equal(ev.landed, true);
  assert.equal(b.pos.y, 0.551);
});

test('aabb helpers agree on overlap', () => {
  const a = aabbOf({ x: 0, y: 0, z: 0 }, 1, 1);
  const b = aabbOf({ x: 1.5, y: 0, z: 0 }, 1, 1);
  assert.equal(overlaps(a, b), true);
  assert.equal(overlaps(a, { min: { x: 3, y: 3, z: 3 }, max: { x: 4, y: 4, z: 4 } }), false);
});
