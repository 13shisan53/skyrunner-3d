import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CFG, QUALITY_TIERS, BIOMES, CHARACTERS, TRAILS, MISSIONS } from './config.js';
import { t, setLocale } from './strings.js';
import { loadSave, persist, unlock, wear, applyRun, beginDailyAttempt, dailySeed as daySeed } from './meta.js';
import { QualityJudge } from './quality.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { Combo, scoreOf } from './score.js';
import { speedAt } from './config.js';
import { World } from './world.js';
import { FX } from './fx.js';
import { Analytics } from './analytics.js';
import { AudioEngine } from './audio.js';

function fatal(message) {
  if (typeof window.showFatal === 'function') window.showFatal(message);
  else console.error(message);
}

/* ---------------- renderer ---------------- */
const canvas = document.getElementById('game');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  fatal(t('errors.webgl') + ': ' + err.message);
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
const initial = BIOMES[1];
scene.fog = new THREE.FogExp2(initial.fog, initial.fogDensity);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 460);
camera.position.set(9, 6.5, -12);

/* ---------------- sky ---------------- */
const skyUniforms = {
  top: { value: new THREE.Color(initial.skyTop) },
  mid: { value: new THREE.Color(initial.skyMid) },
  bottom: { value: new THREE.Color(initial.skyBottom) },
  sunDir: { value: new THREE.Vector3(-0.42, 0.3, 0.86).normalize() },
  sunColor: { value: new THREE.Color(initial.sun) },
  sunSize: { value: 0.046 },
  starAmt: { value: 0 },
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(320, 32, 20),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: skyUniforms,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
      uniform vec3 sunDir; uniform vec3 sunColor; uniform float starAmt;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = mix(bottom, mid, smoothstep(-0.22, 0.16, h));
        c = mix(c, top, smoothstep(0.1, 0.92, h));
        float sd = max(0.0, dot(d, normalize(sunDir)));
        c += sunColor * pow(sd, 1400.0) * 0.35;
        if (starAmt > 0.01 && h > -0.05) {
          vec3 q = floor(d * 260.0);
          float s = step(0.9975, hash(q)) * starAmt * smoothstep(0.0, 0.25, h);
          c += vec3(s) * 0.8;
        }
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  })
);
sky.renderOrder = -10;
scene.add(sky);

const hemi = new THREE.HemisphereLight(initial.hemiSky, initial.hemiGround, 0.65);
scene.add(hemi);
const sun = new THREE.DirectionalLight(initial.sun, initial.sunIntensity);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 120;
sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
sun.position.set(14, 26, -12);
scene.add(sun);
scene.add(sun.target);
const fill = new THREE.DirectionalLight(0x9fc4ff, 0.5);
fill.position.set(-18, 10, 20);
scene.add(fill);

/* ---------------- shared helpers ---------------- */
const PALETTE = [0xff8a80, 0xffd166, 0x7bd389, 0x66c7f4, 0x9d78ff];
const geoCache = new Map();
function rounded(w, h, d, r) {
  const key = `${w.toFixed(2)}-${h.toFixed(2)}-${d.toFixed(2)}-${r.toFixed(2)}`;
  if (!geoCache.has(key)) geoCache.set(key, new RoundedBoxGeometry(w, h, d, 3, r));
  return geoCache.get(key);
}

function makePlatform(w, d, color) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.04 });
  const g = new THREE.Group();
  const body = new THREE.Mesh(rounded(w, 1, d, 0.3), mat);
  body.position.y = -0.5;
  body.receiveShadow = true;
  g.add(body);
  const top = new THREE.Mesh(
    rounded(w * 0.94, 0.16, d * 0.94, 0.08),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(color).offsetHSL(0, -0.12, 0.16), roughness: 0.45 })
  );
  top.position.y = 0.02;
  top.receiveShadow = true;
  g.add(top);
  return g;
}

/* ---------------- menu scene ---------------- */
const menuWorld = new THREE.Group();
scene.add(menuWorld);
for (let i = 0; i < 5; i++) {
  const g = makePlatform(9 - i * 0.7, 8 - i * 0.5, PALETTE[i % PALETTE.length]);
  g.position.set(0, 1.6 + i * 0.5, 2 + i * 10);
  menuWorld.add(g);
}

/* ---------------- endless world ---------------- */
const world = new World(scene, { skyUniforms, sun, hemi, scene });
const fx = new FX(scene, camera);

/* ---------------- player ---------------- */
const player = new Player(scene);
player.rig.visible = false;

/* ---------------- quality ---------------- */
class QualityManager {
  constructor(renderer, scene, camera, onChange) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.mode = 'auto';
    this.tier = 'high';
    this.judge = new QualityJudge('high');
    this.onChange = onChange;
  }
  apply(tier) {
    this.tier = tier;
    const q = QUALITY_TIERS[tier];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dprCap));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = q.shadow > 0;
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    sun.shadow.mapSize.set(q.shadow || 512, q.shadow || 512);
    if (this.onChange) this.onChange(tier, q);
  }
  setMode(mode) {
    this.mode = mode;
    if (mode === 'auto') this.apply(this.tier);
    else { this.apply(mode); this.judge.reset(mode); }
  }
  sample(frameMs, dt) {
    if (this.mode !== 'auto') return;
    const action = this.judge.push(frameMs, dt);
    if (action) this.apply(this.judge.tier);
  }
}

/* ---------------- save + UI ---------------- */
const save = loadSave();
let safeStorage = null;
try { safeStorage = window.localStorage; } catch {}
const analytics = new Analytics({ enabled: save.settings.localStats, storage: safeStorage });
analytics.prune();
const audio = new AudioEngine();
audio.setSound(save.settings.sound);
audio.setMusicEnabled(save.settings.music);
audio.setMuted(!save.settings.sound && !save.settings.music);
setLocale(save.settings.locale);
document.body.classList.toggle('low-stim', !!save.settings.lowStim);
document.body.classList.toggle('reduce-motion', !!save.settings.reduceMotion);
const isTouch = ('ontouchstart' in window) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
if (isTouch) document.body.classList.add('touch');

const state = {
  mode: 'menu',
  score: 0,
  coins: 0,
  coinPoints: 0,
  distance: 0,
  best: save.best,
  trick: 0,
  maxCombo: 0,
  daily: false,
  dailyReward: true,
  seed: 0,
  time: 0,
  edges: 0,
  stomps: 0,
  milestone: 0,
  newBest: false,
  deathAt: 0,
  timeScale: 1,
  frozen: false,
};

const combo = new Combo();
const cameraRig = new CameraRig(camera);
cameraRig.lowStim = !!save.settings.lowStim;
cameraRig.reduceMotion = !!save.settings.reduceMotion;
fx.setLowStim(!!save.settings.lowStim);
const perf = {
  samples: [],
  reset() { this.samples.length = 0; },
  snapshot() {
    const s = this.samples.slice().sort((a, b) => a - b);
    const pct = (p) => (s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0);
    const avg = s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0;
    return {
      frames: s.length,
      p50: +pct(0.5).toFixed(2), p95: +pct(0.95).toFixed(2), p99: +pct(0.99).toFixed(2),
      max: +(s[s.length - 1] || 0).toFixed(2),
      longFrames: s.filter((x) => x > 50).length,
      drawCalls: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
      fps: avg ? +(1000 / avg).toFixed(1) : 0,
    };
  },
};
let ui = null;
let quality = null;

function currentCharacter() {
  return CHARACTERS.find((c) => c.id === save.worn.char) || CHARACTERS[0];
}

const handlers = {
  onStart: () => startRun(null, { daily: false }),
  onDaily: () => {
    const first = beginDailyAttempt(save);
    persist(save);
    startRun(daySeed(), { daily: true, dailyReward: first });
  },
  onRetry: () => { analytics.log('restart_click', { score: state.score }); startRun(state.daily ? daySeed() : null, { daily: state.daily, dailyReward: !state.daily }); },
  onMenu: () => toMenu(),
  onResume: () => resume(),
  onRestart: () => { analytics.log('restart_click', { score: state.score }); startRun(state.daily ? daySeed() : null, { daily: state.daily, dailyReward: !state.daily }); },
  onPause: () => togglePause(),
  onMute: () => {
    save.settings.sound = !save.settings.sound;
    save.settings.music = save.settings.sound;
    persist(save);
    audio.setSound(save.settings.sound);
    audio.setMusicEnabled(save.settings.music);
    audio.setMuted(!save.settings.sound);
    if (!save.settings.music) audio.stopMusic();
    else if (state.mode === 'play') audio.startMusic();
    ui.syncMute(!save.settings.sound);
    ui.syncSettings(save);
  },
  onSettingsChange: (patch) => {
    Object.assign(save.settings, patch);
    persist(save);
    if (patch.quality && quality) quality.setMode(patch.quality);
    if (patch.locale) { setLocale(patch.locale); ui.setLocale(patch.locale); }
    if (patch.lowStim !== undefined) { cameraRig.lowStim = !!patch.lowStim; fx.setLowStim(!!patch.lowStim); }
    if (patch.reduceMotion !== undefined) cameraRig.reduceMotion = !!patch.reduceMotion;
    if (patch.localStats !== undefined) analytics.setEnabled(patch.localStats);
    if (patch.sound !== undefined) { audio.setSound(patch.sound); audio.setMuted(!patch.sound && !save.settings.music); }
    if (patch.music !== undefined) {
      audio.setMusicEnabled(patch.music);
      if (!patch.music) audio.stopMusic();
      else if (state.mode === 'play') { audio.init(); audio.startMusic(); }
    }
    ui.syncSettings(save);
    ui.setLowStim(save.settings.lowStim);
    ui.setReduceMotion(save.settings.reduceMotion);
  },
  onUnlock: (id) => {
    if (unlock(save, id)) {
      persist(save);
      player.setCharacter(currentCharacter());
      ui.renderLocker(save);
      ui.toast('toast.unlock', { name: t(id) }, 'gold');
    } else {
      const item = [...CHARACTERS, ...TRAILS].find((i) => i.id === id);
      ui.toast('locker.need', { n: Math.max(0, (item ? item.cost : 0) - save.coins) });
    }
  },
  onWear: (kind, id) => {
    wear(save, kind, id);
    persist(save);
    player.setCharacter(currentCharacter());
    fx.setTrail(save.worn.trail);
    ui.renderLocker(save);
  },
  onReset: () => {
    try { localStorage.removeItem('skyrunner.save.v2'); } catch {}
    location.reload();
  },
};

ui = new UI(handlers);
quality = new QualityManager(renderer, scene, camera, (tier) => {
  document.body.dataset.quality = tier;
  ui.setQuality(save.settings.quality === 'auto' ? 'auto' : tier);
  fx.setQuality(tier);
  world.setQuality(tier);
});
ui.syncMute(!save.settings.sound);
ui.showMenu(save);
player.setCharacter(currentCharacter());

/* ---------------- input ---------------- */
const input = new Input(canvas, {
  onPause: () => togglePause(),
  onRestart: () => { analytics.log('restart_click', { score: state.score }); startRun(state.daily ? daySeed() : null, { daily: state.daily, dailyReward: !state.daily }); },
  onMute: () => handlers.onMute(),
  onBlur: () => { if (state.mode === 'play') pause(); },
});
input.attach();
input.setEnabled(false);

/* ---------------- run lifecycle ---------------- */
let acc = 0;
let hudAcc = 0;
let last = performance.now();

function startRun(seed, opts = {}) {
  state.mode = 'play';
  state.seed = seed == null ? ((Math.random() * 1e9) | 0) : seed;
  state.daily = !!opts.daily;
  state.dailyReward = opts.dailyReward !== false;
  state.score = 0;
  state.coins = 0;
  state.coinPoints = 0;
  state.distance = 0;
  state.trick = 0;
  state.maxCombo = 0;
  state.time = 0;
  state.edges = 0;
  state.stomps = 0;
  state.milestone = 0;
  state.newBest = false;
  state.deathAt = 0;
  state.timeScale = 1;
  state.frozen = false;
  state.best = save.best;
  combo.reset();
  player.reset({ x: 0, y: CFG.halfH + 0.05, z: 0 });
  player.setCharacter(currentCharacter());
  player.rig.visible = true;
  menuWorld.visible = false;
  world.reset(state.seed);
  cameraRig.reset(player);
  ui.showPlay(save, { daily: state.daily });
  fx.setTrail(save.worn.trail);
  input.clear();
  input.setEnabled(true);
  audio.init();
  audio.startMusic();
  audio.setIntensity(0);
  acc = 0;
  hudAcc = 0;
  last = performance.now();
  analytics.log('run_start', { seed: state.seed, daily: state.daily });
}

function pause() {
  if (state.mode !== 'play') return;
  state.mode = 'paused';
  input.setEnabled(false);
  ui.showPause();
}

function resume() {
  if (state.mode !== 'paused') return;
  state.mode = 'play';
  input.setEnabled(true);
  ui.hidePause();
  acc = 0;
  last = performance.now();
}

function togglePause() {
  if (state.mode === 'play') pause();
  else if (state.mode === 'paused') resume();
}

function toMenu() {
  state.mode = 'menu';
  state.frozen = false;
  input.setEnabled(false);
  input.clear();
  audio.stopMusic();
  ui.showMenu(save);
  player.rig.visible = false;
  player.blob.visible = false;
  world.setVisible(false);
  world.biomeLock = null;
  world.applyBiome(1, true);
  menuWorld.visible = true;
}

function beginDeath() {
  if (state.mode !== 'play') return;
  state.mode = 'dying';
  state.deathAt = performance.now();
  state.timeScale = 0.25;
  input.setEnabled(false);
  audio.play('fall');
  audio.duck(1.6);
}

function finishRun() {
  if (state.mode !== 'play' && state.mode !== 'dying') return;
  state.mode = 'over';
  state.timeScale = 1;
  input.setEnabled(false);
  audio.stopMusic();
  audio.play('over');
  const run = {
    score: state.score,
    distance: state.distance,
    coins: state.coins,
    maxCombo: state.maxCombo,
    duration: state.time,
    cause: 'fall',
    stomps: state.stomps,
    edges: state.edges,
    daily: state.daily,
  };
  const out = applyRun(save, run, { daily: state.daily, reward: state.dailyReward });
  persist(save);
  analytics.log('run_end', {
    score: run.score, distance: Math.round(run.distance), coins: run.coins,
    combo: run.maxCombo, duration: +run.duration.toFixed(1), cause: run.cause, daily: run.daily,
  });
  state.best = save.best;
  ui.showOver({ ...run, ...out, previousBest: out.previousBest }, save);
  for (const id of out.completed || []) {
    const def = MISSIONS.find((m) => m.id === id);
    ui.toast('toast.mission', { n: def ? def.reward : 0 }, 'gold');
    audio.play('mission');
  }
}

/* ---------------- fixed update ---------------- */
function handleEvents(events) {
  for (const ev of events) {
    if (ev.type === 'jump') {
      cameraRig.shake(0.035);
      fx.dust(player.pos, 0xd8f5ff, 4);
      audio.play('jump');
    } else if (ev.type === 'land') {
      cameraRig.shake(Math.min(0.1, ev.impact * 0.006));
      fx.dust(player.pos, 0xcdbfae, ev.impact > 10 ? 9 : 5);
      audio.play('land', { impact: ev.impact });
    } else if (ev.type === 'edge') {
      state.edges += 1;
      state.trick += CFG.edgeBonus;
      combo.add();
      state.maxCombo = Math.max(state.maxCombo, combo.streak);
      cameraRig.shake(0.12);
      fx.ring(player.pos, 0x5ff2d0);
      ui.toast('toast.edge', {}, 'mint');
      audio.play('edge');
    } else if (ev.type === 'coin') {
      state.coins += 1;
      state.coinPoints += CFG.coinValue * combo.mult;
      combo.add();
      state.maxCombo = Math.max(state.maxCombo, combo.streak);
      cameraRig.shake(0.02);
      fx.burst({ x: ev.x, y: ev.y, z: ev.z }, 0xffd166, 7, 3);
      audio.play('coin', { streak: combo.streak });
    } else if (ev.type === 'stomp') {
      state.stomps += 1;
      state.coins += 2;
      state.coinPoints += 2 * CFG.coinValue * combo.mult;
      combo.add();
      state.maxCombo = Math.max(state.maxCombo, combo.streak);
      cameraRig.shake(0.13);
      fx.ring(player.pos, 0xffd166);
      fx.burst(player.pos, 0xffd166, 12, 4);
      audio.play('stomp');
    } else if (ev.type === 'shield') {
      player.grantShield();
      fx.burst(player.pos, 0x8dfff0, 14, 4);
      ui.toast('toast.shield', {}, 'mint');
      audio.play('shield');
    } else if (ev.type === 'graze') {
      state.trick += CFG.grazeBonus;
      combo.add();
      state.maxCombo = Math.max(state.maxCombo, combo.streak);
      ui.toast('toast.graze', {}, 'mint');
      cameraRig.shake(0.06);
      fx.burst(player.pos, 0x9fe8ff, 7, 2.5);
      audio.play('graze');
    } else if (ev.type === 'hit') {
      const result = player.hit();
      player.vel.x *= -0.4;
      player.vel.z -= 3;
      player.vel.y = Math.max(player.vel.y, 7);
      fx.ring(player.pos, 0xff6f8f);
      audio.play('stomp');
      if (result === 'shield') {
        cameraRig.shake(0.2);
        ui.toast('toast.near', {}, 'gold');
      } else if (result === 'hit') {
        combo.break();
        cameraRig.shake(0.26);
        ui.toast('toast.near', {}, 'gold');
      }
    } else if (ev.type === 'biome') {
      ui.toast('toast.biome', { b: t('biome.' + BIOMES[ev.index].id) });
    } else if (ev.type === 'fall') {
      beginDeath();
      return;
    }
  }
}

function fixed(dt) {
  player.prev.copy(player.pos);
  input.update();
  const look = input.consumeLook();
  if (look.x || look.y) cameraRig.look(look.x, look.y);
  player.speed = speedAt(Math.max(0, player.pos.z));
  const jump = input.consumeJump();
  const events = [];
  player.update(dt, { steer: input.state.steer, jumpPressed: jump, jumpHeld: input.state.jumpHeld }, world, events);
  world.fixedUpdate(dt, player, events);
  handleEvents(events);
  if (state.mode !== 'play') return;
  combo.update(dt);
  audio.setIntensity(Math.min(1, (player.speed - CFG.speedStart) / (CFG.speedMax - CFG.speedStart) * 0.7 + combo.mult / CFG.comboMax * 0.3));
  state.time += dt;
  state.distance = Math.max(state.distance, player.pos.z);
  const milestone = Math.floor(state.distance / 100);
  if (milestone > state.milestone && milestone > 0) {
    state.milestone = milestone;
    ui.toast('toast.milestone', { n: milestone * 100 });
  }
  state.maxCombo = Math.max(state.maxCombo, combo.streak);
  state.score = scoreOf(state.distance, state.coinPoints, state.trick);
  if (!state.newBest && state.best > 0 && state.score > state.best) {
    state.newBest = true;
    ui.toast('toast.record', {}, 'gold');
    fx.confetti();
    cameraRig.shake(0.16);
    audio.play('record');
  }
}

function updateHud(dt) {
  hudAcc += dt;
  if (hudAcc < 0.08) return;
  hudAcc = 0;
  ui.updateHud({
    score: state.score,
    coins: state.coins,
    distance: state.distance,
    mult: combo.mult,
    streak: combo.streak,
    best: state.best,
  });
}

/* ---------------- render loop ---------------- */
let frames = 0;
let ready = false;
let menuT = 0;

function menuCamera(dt) {
  menuT += dt;
  const a = 0.32 + Math.sin(menuT * 0.08) * 0.1;
  camera.position.set(Math.sin(a) * 19, 8.6 + Math.sin(menuT * 0.16) * 0.25, -13 + Math.cos(a) * 2.5);
  camera.lookAt(0, 4.2, 28);
  menuWorld.rotation.y = Math.sin(menuT * 0.06) * 0.04;
}

function tick(now) {
  const frameDt = Math.min(Math.max(0, (now - last) / 1000), CFG.maxFrame);
  last = now;
  renderer.info.reset();

  if (state.mode === 'play') {
    if (!state.frozen) {
      acc += frameDt;
      let steps = 0;
      while (acc >= CFG.step && steps < 8) {
        fixed(CFG.step);
        acc -= CFG.step;
        steps += 1;
        if (state.mode !== 'play') { acc = 0; break; }
      }
      if (steps >= 8) acc = 0;
    }
    const alpha = Math.min(1, acc / CFG.step);
    player.setVisual(alpha, state.time, player.speed, world, frameDt);
    world.render(frameDt, state.time, alpha, player, camera);
    fx.updateTrail(player.pos, player.speed);
    fx.updateLines(camera, player.speed);
    fx.update(frameDt);
    cameraRig.update(frameDt, player, { speed: player.speed });
    updateHud(frameDt);
  } else if (state.mode === 'dying') {
    player.prev.copy(player.pos);
    player.pos.y -= 9 * frameDt;
    player.setVisual(1, state.time, 0, world, frameDt);
    world.render(frameDt, state.time, 1, player, camera);
    fx.update(frameDt);
    cameraRig.update(frameDt, player, { speed: 0 });
    if ((now - state.deathAt) / 1000 > 1.1) finishRun();
  } else if (state.mode === 'paused' || state.mode === 'over') {
    player.setVisual(1, state.time, 0, world, frameDt);
    world.render(frameDt, state.time, 1, player, camera);
    fx.update(frameDt);
    cameraRig.update(frameDt, player, { speed: 0 });
  } else {
    menuCamera(frameDt);
  }

  sky.position.copy(camera.position);
  sun.position.set(player.pos.x + 14, player.pos.y + 26, player.pos.z - 12);
  sun.target.position.set(player.pos.x, player.pos.y, player.pos.z);
  sun.target.updateMatrixWorld();
  renderer.render(scene, camera);
  quality.sample(frameDt * 1000, frameDt);
  if (state.mode === 'play' || state.mode === 'paused') {
    perf.samples.push(frameDt * 1000);
    if (perf.samples.length > 900) perf.samples.shift();
  }

  frames += 1;
  if (!ready && frames >= 3) {
    ready = true;
    document.body.dataset.ready = '1';
    ui.hideLoading();
  }
  requestAnimationFrame(tick);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  fatal(t('errors.contextLost'));
});

window.addEventListener('keydown', (e) => {
  if (state.mode === 'dying' && (e.code === 'Space' || e.code === 'Enter') && performance.now() - state.deathAt > 400) {
    finishRun();
  }
});

quality.setMode(save.settings.quality);
analytics.log('session_start', { tier: quality.tier, touch: isTouch, locale: save.settings.locale });
window.addEventListener('beforeunload', () => analytics.log('leave', { playtime: +state.time.toFixed(1) }));

window.__skyrunner = {
  state,
  renderer,
  scene,
  camera,
  ui,
  quality,
  meta: { save },
  player,
  input,
  cameraRig,
  combo,
  world,
  fx,
  audio,
  version: '1.1.0',
  startRun,
  dailySeed: () => daySeed(),
  perf,
  get timeScale() { return state.timeScale; },
  debug: {
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    },
    teleport(x, y, z) {
      player.pos.set(x, y, z);
      player.prev.copy(player.pos);
      player.vel.set(0, 0, 0);
    },
    kill() {
      player.pos.y = -100;
    },
    grantCoins(n) {
      save.coins += n;
      persist(save);
      ui.fillMenu(save);
      ui.toast('locker.coins', { n: save.coins });
    },
    setBiome(index) {
      world.biomeLock = index;
      world.applyBiome(index, true);
    },
    triggerEdge() {
      handleEvents([{ type: 'edge', distance: 0.2 }]);
    },
    shield() {
      player.grantShield();
    },
    hit() {
      handleEvents([{ type: 'hit' }]);
    },
    freeze(on) {
      state.frozen = !!on;
    },
    scenery(on) {
      world.scenery.visible = !!on;
    },
  },
};

requestAnimationFrame(tick);
