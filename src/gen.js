// Pure procedural course. No three.js, no DOM: unit-testable in Node.

import { CFG, SEG, difficultyAt, clamp, lerp } from './config.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(seed >>> 0);
  return {
    next,
    float: (a, b) => a + next() * (b - a),
    int: (a, b) => Math.floor(a + next() * (b - a + 1)),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

const TYPES = ['wide', 'bridge', 'stepping', 'patrol', 'stairs', 'island'];
const WEIGHTS = [3, 3, 2, 2, 1, 2];

function weightedType(rng) {
  const total = WEIGHTS.reduce((a, b) => a + b, 0);
  let roll = rng.next() * total;
  for (let i = 0; i < TYPES.length; i++) {
    roll -= WEIGHTS[i];
    if (roll <= 0) return TYPES[i];
  }
  return 'wide';
}

function coinLine(count, x, y, z, w, d, spread = 0.26) {
  const out = [];
  for (let k = 0; k < count; k++) {
    const t = count === 1 ? 0.5 : k / (count - 1);
    out.push({
      x: x + lerp(-w * spread, w * spread, t),
      y: y + 1.15,
      z: z + lerp(-d * 0.22, d * 0.22, t),
    });
  }
  return out;
}

export class Course {
  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this.rng = makeRng(this.seed);
    this.index = 0;
    this.nextZ = 0;
    this.nextX = 0;
    this.nextY = 0;
    this.nextD = SEG.firstDepth;
    this.shieldIn = this.rng.int(CFG.shieldEveryMin, CFG.shieldEveryMax);
    this.segments = [];
    this.prev = null;
  }

  next() {
    const i = this.index++;
    const rng = this.rng;

    if (i === 0) {
      const seg = {
        index: 0,
        type: 'wide',
        x: 0,
        y: 0,
        z: 0,
        w: SEG.firstWidth,
        d: SEG.firstDepth,
        gap: 0,
        biome: 0,
        coins: [
          { x: 0, y: 1.15, z: 4 },
          { x: 0, y: 1.15, z: 8 },
          { x: 0, y: 1.15, z: 12 },
        ],
        drones: [],
        shield: null,
      };
      this.finish(seg);
      return seg;
    }

    const diff = difficultyAt(i);
    const type = i <= 3 ? ['wide', 'bridge', 'wide'][i - 1] : weightedType(rng);
    const baseW = lerp(SEG.widthFrom, SEG.widthTo, diff) * rng.float(0.92, 1.08);
    const baseD = lerp(SEG.widthFrom, SEG.widthTo, diff) * rng.float(0.92, 1.08);
    const gap = lerp(SEG.gapFrom, SEG.gapTo, diff) + rng.float(0, SEG.gapJitter);
    const lat = lerp(SEG.lateralFrom, SEG.lateralTo, diff);
    const x = clamp(this.nextX + rng.float(-lat, lat), -9, 9);
    let y = clamp(this.nextY + rng.float(-SEG.heightJitter, SEG.heightJitter), -2.5, 5.5);

    let w = baseW;
    let d = baseD;
    if (type === 'wide') { d *= 0.9; }
    if (type === 'bridge') { w *= 0.78; d *= 1.25; }
    if (type === 'stepping') { w *= 0.9; d *= 0.72; }
    if (type === 'patrol') { w *= 1.0; d *= 1.15; }
    if (type === 'stairs') { y = clamp(this.nextY + 0.8, -2.5, 5.5); w *= 0.85; d *= 0.8; }
    if (type === 'island') { w *= 0.9; d *= 0.8; }
    w = clamp(w, 4.0, 11.5);
    d = clamp(d, 3.4, 16);

    const z = this.nextZ + this.nextD / 2 + gap + d / 2;
    const seg = {
      index: i,
      type,
      x,
      y,
      z,
      w,
      d,
      gap,
      biome: Math.floor(i / SEG.biomeEvery) % 4,
      coins: [],
      drones: [],
      shield: null,
    };

    const safe = { x, y, z, w, d };
    if (type === 'island' && this.prev) {
      const p = this.prev;
      for (let k = 0; k < 3; k++) {
        const t = (k + 1) / 4;
        seg.coins.push({
          x: lerp(p.x, x, t),
          y: Math.max(p.y, y) + 1.5 + Math.sin(t * Math.PI) * 0.9,
          z: lerp(p.z + p.d / 2, z - d / 2, t),
        });
      }
    } else if (rng.chance(0.85)) {
      const n = rng.int(1, type === 'bridge' ? 4 : 3);
      const spread = type === 'stepping' ? 0.15 : 0.26;
      seg.coins.push(...coinLine(n, x, y, z, w, d, spread));
    }

    if (i >= SEG.droneFrom && d >= 4.4 && rng.chance(SEG.droneChance)) {
      const range = Math.min(2.2, w * 0.25);
      const baseZ = type === 'island' ? z : z;
      seg.drones.push({
        x,
        y: y + 1.15,
        z: baseZ,
        axis: 'x',
        range,
        speed: rng.float(0.9, 1.5),
      });
    }

    this.shieldIn -= 1;
    if (this.shieldIn <= 0 && i >= 8) {
      seg.shield = { x, y: y + 1.35, z };
      this.shieldIn = rng.int(CFG.shieldEveryMin, CFG.shieldEveryMax);
    }

    this.finish(seg, safe);
    return seg;
  }

  finish(seg, safe) {
    seg.frontEdge = seg.z + seg.d / 2;
    seg.backEdge = seg.z - seg.d / 2;
    this.nextZ = seg.z;
    this.nextX = seg.x;
    this.nextY = seg.y;
    this.nextD = seg.d;
    this.prev = seg;
    this.segments.push(seg);
    if (this.segments.length > 400) this.segments.shift();
    return seg;
  }

  ahead(untilZ) {
    const out = [];
    let guard = 0;
    while (this.nextZ + this.nextD / 2 < untilZ && guard++ < 300) {
      out.push(this.next());
    }
    return out;
  }
}

export { CFG };
