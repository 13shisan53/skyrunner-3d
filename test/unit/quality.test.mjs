import test from 'node:test';
import assert from 'node:assert/strict';
import { QualityJudge } from '../../src/quality.js';

test('30ms frames for 2s drop a tier, 10ms frames for 8s raise it', () => {
  const q = new QualityJudge('high');
  for (let i = 0; i < 200; i++) q.push(30, 1 / 60);
  assert.equal(q.tier, 'mid');
  q.reset('mid');
  for (let i = 0; i < 600; i++) q.push(10, 1 / 60);
  assert.equal(q.tier, 'high');
});

test('never drops below low or above high', () => {
  const q = new QualityJudge('low');
  for (let i = 0; i < 400; i++) q.push(40, 1 / 60);
  assert.equal(q.tier, 'low');
  q.reset('high');
  for (let i = 0; i < 700; i++) q.push(8, 1 / 60);
  assert.equal(q.tier, 'high');
});

test('sustained 60ms frames still downgrade (slow devices are not ignored)', () => {
  const q = new QualityJudge('high');
  for (let i = 0; i < 500; i++) q.push(60, 1 / 16);
  assert.equal(q.tier, 'low');
});

test('tab-sized gaps are ignored', () => {
  const q = new QualityJudge('high');
  for (let i = 0; i < 400; i++) q.push(500, 1 / 60);
  assert.equal(q.tier, 'high');
});
