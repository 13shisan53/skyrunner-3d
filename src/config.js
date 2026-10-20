// All tunables in one place. Pure data: no DOM, no three.js.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

export const CFG = Object.freeze({
  step: 1 / 120,
  maxFrame: 0.1,

  gravity: 34,
  fallGravity: 46,
  jumpSpeed: 12.6,
  maxFall: 44,
  coyote: 0.11,
  buffer: 0.12,
  jumpCut: 0.45,

  radius: 0.36,
  halfH: 0.55,
  deathY: -18,
  platformH: 1.0,

  speedStart: 6.8,
  speedMax: 10.8,
  speedRampMetres: 520,
  launchRamp: 1.2,

  steerMax: 6.0,
  steerAccelGround: 55,
  steerAccelAir: 26,

  edgeForgiveness: 0.12,
  edgeWindow: 0.35,
  edgeMinAirtime: 0.25,
  edgeMinDepth: 4,
  grazeRadius: 1.2,

  comboStep: 8,
  comboMax: 5,
  comboTimeout: 6,
  comboDecayStep: 0.75,

  coinValue: 100,
  scorePerMetre: 10,
  edgeBonus: 150,
  grazeBonus: 80,

  shieldEveryMin: 12,
  shieldEveryMax: 16,
});

export const SEG = Object.freeze({
  firstWidth: 14,
  firstDepth: 22,
  widthFrom: 9,
  widthTo: 4.4,
  gapFrom: 2.0,
  gapTo: 4.3,
  gapJitter: 0.8,
  heightJitter: 1.1,
  lateralFrom: 2.6,
  lateralTo: 3.8,
  cap: 45,
  biomeEvery: 18,
  ahead: 80,
  behind: 34,
  droneFrom: 4,
  droneChance: 0.32,
});

export const BIOMES = Object.freeze([
  {
    id: 'dawn',
    skyTop: 0x2b3a67, skyMid: 0xff9e7a, skyBottom: 0xffe7c7,
    fog: 0xf7c6a3, fogDensity: 0.0055,
    sun: 0xffd9a0, sunIntensity: 2.6,
    hemiSky: 0x9fb7ff, hemiGround: 0x6b5a7a,
    palette: [0xff8a80, 0xffd166, 0x7bd389, 0x66c7f4],
    particles: 'petal',
  },
  {
    id: 'day',
    skyTop: 0x1f6fd0, skyMid: 0x8fd0ff, skyBottom: 0xeaf7ff,
    fog: 0xcfe9ff, fogDensity: 0.0046,
    sun: 0xfff6d8, sunIntensity: 3.0,
    hemiSky: 0xbfdcff, hemiGround: 0x6f83a8,
    palette: [0xff6f8f, 0xffc849, 0x4fd36a, 0x3f9dff, 0x9d78ff, 0xff8a3d, 0x1fc9b4],
    particles: 'dust',
  },
  {
    id: 'dusk',
    skyTop: 0x2a1e5c, skyMid: 0xff5f7e, skyBottom: 0xffc98a,
    fog: 0xd98a9a, fogDensity: 0.0060,
    sun: 0xff8a5c, sunIntensity: 2.7,
    hemiSky: 0xffb7a8, hemiGround: 0x3a2a4a,
    palette: [0xff6f8f, 0xff8a3d, 0xffc849, 0x9d78ff],
    particles: 'firefly',
  },
  {
    id: 'night',
    skyTop: 0x050a1e, skyMid: 0x1a2a5e, skyBottom: 0x3d5a8a,
    fog: 0x14203c, fogDensity: 0.0072,
    sun: 0xcfe4ff, sunIntensity: 1.5,
    hemiSky: 0x3f5a9a, hemiGround: 0x0a1020,
    palette: [0x3f9dff, 0x9d78ff, 0x1fc9b4, 0xff6f8f],
    particles: 'star',
  },
]);

export const CHARACTERS = Object.freeze([
  { id: 'char.default', nameKey: 'char.default', color: 0x2fbfa6, suit: 0x1d8d7c, scarf: 0xff7a8a, accessory: 'antenna', cost: 0 },
  { id: 'char.sunset', nameKey: 'char.sunset', color: 0xff8a5c, suit: 0xc75a3a, scarf: 0xffd166, accessory: 'goggles', cost: 60 },
  { id: 'char.night', nameKey: 'char.night', color: 0x6c7dff, suit: 0x3f4bb5, scarf: 0x57e2c8, accessory: 'halo', cost: 150 },
  { id: 'char.gold', nameKey: 'char.gold', color: 0xffd166, suit: 0xd99b2b, scarf: 0xff6f8f, accessory: 'crown', cost: 300 },
]);

export const TRAILS = Object.freeze([
  { id: 'trail.none', nameKey: 'trail.none', color: 0xffffff, cost: 0 },
  { id: 'trail.stardust', nameKey: 'trail.stardust', color: 0x9fe8ff, cost: 40 },
  { id: 'trail.rainbow', nameKey: 'trail.rainbow', color: 0xff9ecf, cost: 120 },
  { id: 'trail.flame', nameKey: 'trail.flame', color: 0xff8a3d, cost: 240 },
]);

export const MISSIONS = Object.freeze([
  { id: 'coins40', type: 'coins', target: 40, reward: 40 },
  { id: 'stomps3', type: 'stomps', target: 3, reward: 60 },
  { id: 'distance600', type: 'distance', target: 600, reward: 80 },
  { id: 'edge5', type: 'edge', target: 5, reward: 60 },
  { id: 'combo8', type: 'combo', target: 8, reward: 60 },
  { id: 'runs3', type: 'runs', target: 3, reward: 40 },
]);

export const QUALITY_TIERS = Object.freeze({
  high: { dprCap: 2, shadow: 512, bloom: true, clouds: 40, particles: 180, antialias: true },
  mid: { dprCap: 1.25, shadow: 512, bloom: true, clouds: 30, particles: 120, antialias: true },
  low: { dprCap: 1, shadow: 0, bloom: false, clouds: 18, particles: 70, antialias: false },
});

export const STORAGE_KEY = 'skyrunner.save.v2';
export const ANALYTICS_KEY = 'skyrunner.analytics.v1';
export const SAVE_VERSION = 2;

export function speedAt(distance) {
  const t = clamp(distance / CFG.speedRampMetres, 0, 1);
  return CFG.speedStart + (CFG.speedMax - CFG.speedStart) * t;
}

export function difficultyAt(index) {
  return clamp(index / SEG.cap, 0, 1);
}
