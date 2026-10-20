import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreOf, Combo } from '../../src/score.js';

test('score combines distance, coins and tricks', () => {
  assert.equal(scoreOf(123.9, 400, 150), 1230 + 400 + 150);
  assert.equal(scoreOf(-10, 0, 0), 0);
});

test('combo caps at 5x and decays one step at a time', () => {
  const c = new Combo();
  for (let i = 0; i < 8; i++) c.add();
  assert.equal(c.streak, 8);
  assert.equal(c.mult, 2);

  const cap = new Combo();
  for (let i = 0; i < 40; i++) cap.add();
  assert.equal(cap.mult, 5);

  c.update(6.1);
  assert.equal(c.streak, 8);
  c.update(0.7);
  assert.equal(c.streak, 7);
  c.break();
  assert.equal(c.streak, 0);
  assert.equal(c.mult, 1);
});
