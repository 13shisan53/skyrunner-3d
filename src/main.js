import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CFG, QUALITY_TIERS, BIOMES, CHARACTERS } from './config.js';
import { t, setLocale } from './strings.js';
import { loadSave, persist, unlock, wear, applyRun, beginDailyAttempt, dailySeed as daySeed } from './meta.js';
import { QualityJudge } from './quality.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { Combo, scoreOf } from './score.js';
import { speedAt } from './config.js';

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
  sunDir: { value: new THREE.Vector3(0.4, 0.5, -1).normalize() },
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
        c += sunColor * pow(sd, 220.0) * 1.6;
        c += sunColor * pow(sd, 12.0) * 0.12;
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

/* ---------------- arena (replaced by World in Task 6) ---------------- */
const arena = new THREE.Group();
arena.visible = false;
scene.add(arena);
const colliders = [];
const platforms = [];
function addArenaPlatform(z, w, d, y, color) {
  const g = makePlatform(w, d, color);
  g.position.set(0, y, z);
  arena.add(g);
  const collider = { min: { x: -w / 2, y: y - 1, z: z - d / 2 }, max: { x: w / 2, y, z: z + d / 2 } };
  colliders.push(collider);
  platforms.push({ z, w, d, y, frontEdge: z + d / 2, collider, group: g });
}
addArenaPlatform(0, 14, 22, 0, PALETTE[0]);
addArenaPlatform(18, 9, 9, 0, PALETTE[1]);
addArenaPlatform(30, 8, 8, 0, PALETTE[2]);

const world = {
  colliders,
  platforms,
  groundYAt(x, z) {
    let best = -Infinity;
    for (const c of colliders) {
      if (x > c.min.x - 0.25 && x < c.max.x + 0.25 && z > c.min.z - 0.25 && z < c.max.z + 0.25) {
        if (c.max.y > best) best = c.max.y;
      }
    }
    return best;
  },
  platformAt(x, z) {
    for (const p of platforms) {
      if (x > p.collider.min.x - 0.2 && x < p.collider.max.x + 0.2 &&
          z > p.collider.min.z - 0.2 && z < p.collider.max.z + 0.2) return p;
    }
    return null;
  },
};

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
};

const combo = new Combo();
const cameraRig = new CameraRig(camera);
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
  onRetry: () => startRun(state.daily ? daySeed() : null, { daily: state.daily, dailyReward: !state.daily }),
  onMenu: () => toMenu(),
  onResume: () => resume(),
  onRestart: () => startRun(state.daily ? daySeed() : null, { daily: state.daily, dailyReward: !state.daily }),
  onPause: () => togglePause(),
  onMute: () => {
    save.settings.sound = !save.settings.sound;
    save.settings.music = save.settings.sound;
    persist(save);
    ui.syncMute(!save.settings.sound);
    ui.syncSettings(save);
  },
  onSettingsChange: (patch) => {
    Object.assign(save.settings, patch);
    persist(save);
    if (patch.quality && quality) quality.setMode(patch.quality);
    if (patch.locale) { setLocale(patch.locale); ui.setLocale(patch.locale); }
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
      ui.toast('locker.need', { n: 0 });
    }
  },
  onWear: (kind, id) => {
    wear(save, kind, id);
    persist(save);
    player.setCharacter(currentCharacter());
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
});
ui.syncMute(!save.settings.sound);
ui.showMenu(save);
player.setCharacter(currentCharacter());

/* ---------------- input ---------------- */
const input = new Input(canvas, {
  onPause: () => togglePause(),
  onRestart: () => startRun(state.daily ? daySeed() : null, { daily: state.daily, dailyReward: false }),
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
  state.best = save.best;
  combo.reset();
  player.reset({ x: 0, y: CFG.halfH + 0.05, z: 0 });
  player.setCharacter(currentCharacter());
  player.rig.visible = true;
  menuWorld.visible = false;
  arena.visible = true;
  cameraRig.reset(player);
  ui.showPlay(save, { daily: state.daily });
  input.clear();
  input.setEnabled(true);
  acc = 0;
  hudAcc = 0;
  last = performance.now();
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
  input.setEnabled(false);
  input.clear();
  ui.showMenu(save);
  player.rig.visible = false;
  player.blob.visible = false;
  arena.visible = false;
  menuWorld.visible = true;
}

function finishRun() {
  if (state.mode !== 'play') return;
  state.mode = 'over';
  input.setEnabled(false);
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
  state.best = save.best;
  ui.showOver({ ...run, ...out, previousBest: out.previousBest }, save);
}

/* ---------------- fixed update ---------------- */
function handleEvents(events) {
  for (const ev of events) {
    if (ev.type === 'jump') {
      cameraRig.shake(0.035);
    } else if (ev.type === 'land') {
      cameraRig.shake(Math.min(0.1, ev.impact * 0.006));
    } else if (ev.type === 'edge') {
      state.edges += 1;
      state.trick += CFG.edgeBonus;
      combo.add();
      state.maxCombo = Math.max(state.maxCombo, combo.streak);
      cameraRig.shake(0.12);
      ui.toast('toast.edge', {}, 'mint');
    } else if (ev.type === 'fall') {
      finishRun();
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
  handleEvents(events);
  if (state.mode !== 'play') return;
  combo.update(dt);
  state.time += dt;
  state.distance = Math.max(state.distance, player.pos.z);
  state.maxCombo = Math.max(state.maxCombo, combo.streak);
  state.score = scoreOf(state.distance, state.coinPoints, state.trick);
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
    acc += frameDt;
    let steps = 0;
    while (acc >= CFG.step && steps < 8) {
      fixed(CFG.step);
      acc -= CFG.step;
      steps += 1;
      if (state.mode !== 'play') { acc = 0; break; }
    }
    if (steps >= 8) acc = 0;
    const alpha = Math.min(1, acc / CFG.step);
    player.setVisual(alpha, state.time, player.speed, world, frameDt);
    cameraRig.update(frameDt, player, { speed: player.speed });
    updateHud(frameDt);
  } else if (state.mode === 'paused' || state.mode === 'over') {
    player.setVisual(1, state.time, 0, world, frameDt);
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

quality.setMode(save.settings.quality);

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
  version: '1.1.0',
  startRun,
  dailySeed: () => daySeed(),
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
  },
};

requestAnimationFrame(tick);
