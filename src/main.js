import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CFG, QUALITY_TIERS, BIOMES } from './config.js';
import { t, setLocale } from './strings.js';
import { loadSave, persist, unlock, wear, defaultSave } from './meta.js';
import { QualityJudge } from './quality.js';
import { UI } from './ui.js';

/* ---------------- fatal handling ---------------- */
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
      uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunSize; uniform float starAmt;
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

/* ---------------- lights ---------------- */
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

/* ---------------- placeholder menu world ---------------- */
const menuWorld = new THREE.Group();
scene.add(menuWorld);

const PALETTE = [0xff8a80, 0xffd166, 0x7bd389, 0x66c7f4, 0x9d78ff];
const geoCache = new Map();
function rounded(w, h, d, r) {
  const key = `${w.toFixed(2)}-${h.toFixed(2)}-${d.toFixed(2)}-${r.toFixed(2)}`;
  if (!geoCache.has(key)) geoCache.set(key, new RoundedBoxGeometry(w, h, d, 3, r));
  return geoCache.get(key);
}
for (let i = 0; i < 5; i++) {
  const color = PALETTE[i % PALETTE.length];
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.04 });
  const g = new THREE.Group();
  const body = new THREE.Mesh(rounded(9 - i * 0.7, 1, 8 - i * 0.5, 0.3), mat);
  body.position.y = -0.5;
  body.castShadow = false;
  body.receiveShadow = true;
  g.add(body);
  const topMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).offsetHSL(0, -0.12, 0.16), roughness: 0.45 });
  const top = new THREE.Mesh(rounded((9 - i * 0.7) * 0.94, 0.16, (8 - i * 0.5) * 0.94, 0.08), topMat);
  top.position.y = 0.02;
  g.add(top);
  g.position.set(0, 1.6 + i * 0.5, 2 + i * 10);
  menuWorld.add(g);
}

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
    if (mode === 'auto') {
      this.apply(this.tier);
    } else {
      this.apply(mode);
      this.judge.reset(mode);
    }
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
  distance: 0,
  best: save.best,
  trick: 0,
  maxCombo: 0,
  daily: false,
  time: 0,
};

const quality = new QualityManager(renderer, scene, camera, (tier, q) => {
  document.body.dataset.quality = tier;
  if (ui) ui.setQuality(save.settings.quality === 'auto' ? 'auto' : tier);
});

const handlers = {
  onStart: () => { /* wired in Task 5 */ },
  onDaily: () => { /* wired in Task 5 */ },
  onRetry: () => { /* wired in Task 5 */ },
  onMenu: () => { ui.showMenu(save); state.mode = 'menu'; },
  onResume: () => { /* wired in Task 5 */ },
  onRestart: () => { /* wired in Task 5 */ },
  onPause: () => { /* wired in Task 5 */ },
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
    if (patch.quality) quality.setMode(patch.quality);
    if (patch.locale) { setLocale(patch.locale); ui.setLocale(patch.locale); }
    if (patch.lowStim !== undefined) { document.body.classList.toggle('low-stim', patch.lowStim); ui.setLowStim(patch.lowStim); }
    if (patch.reduceMotion !== undefined) { document.body.classList.toggle('reduce-motion', patch.reduceMotion); ui.setReduceMotion(patch.reduceMotion); }
    ui.syncSettings(save);
  },
  onUnlock: (id) => {
    if (unlock(save, id)) {
      persist(save);
      ui.renderLocker(save);
      ui.toast('toast.unlock', { name: t(id) }, 'gold');
    } else {
      ui.toast('locker.need', { n: Math.max(0, 60 - save.coins) });
    }
  },
  onWear: (kind, id) => {
    wear(save, kind, id);
    persist(save);
    ui.renderLocker(save);
  },
  onReset: () => {
    try { localStorage.removeItem('skyrunner.save.v2'); } catch {}
    location.reload();
  },
};

const ui = new UI(handlers);
ui.syncMute(!save.settings.sound);
ui.showMenu(save);

/* ---------------- loop ---------------- */
let last = performance.now();
let frames = 0;
let menuT = 0;
let ready = false;

function renderFrame(dt) {
  if (state.mode === 'menu') {
    menuT += dt;
    const a = 0.32 + Math.sin(menuT * 0.08) * 0.1;
    camera.position.set(Math.sin(a) * 19, 8.6 + Math.sin(menuT * 0.16) * 0.25, -13 + Math.cos(a) * 2.5);
    camera.lookAt(0, 4.2, 28);
    menuWorld.rotation.y = Math.sin(menuT * 0.06) * 0.04;
  }
  sun.position.set(14, 26, -12);
  sun.target.position.set(0, 0, 12);
  sun.target.updateMatrixWorld();
  sky.position.copy(camera.position);
  renderer.render(scene, camera);
}

function tick(now) {
  const dt = Math.min(Math.max(0, (now - last) / 1000), CFG.maxFrame);
  last = now;
  renderer.info.reset();
  renderFrame(dt);
  quality.sample(dt * 1000, dt);
  frames++;
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

window.__skyrunner = {
  state,
  renderer,
  scene,
  camera,
  ui,
  quality,
  meta: { save },
  version: '1.1.0',
  startRun: () => {},
  dailySeed: () => 0,
  debug: {
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    },
    kill() { state.mode = 'over'; },
  },
};

quality.setMode(save.settings.quality);
requestAnimationFrame(tick);
