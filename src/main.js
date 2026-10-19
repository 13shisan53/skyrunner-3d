import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/* ============================================================
   SKYRUNNER — endless 3D platformer
   Original art, geometry, textures and music (synthesised live).
   ============================================================ */

const CFG = {
  gravity: 34,
  fallGravity: 46,
  jumpSpeed: 12.6,
  maxRun: 8.4,
  sprintMul: 1.35,
  groundAccel: 62,
  groundDecel: 46,
  airAccel: 30,
  airDecel: 9,
  groundFriction: 11,
  coyote: 0.11,
  buffer: 0.12,
  jumpCut: 0.45,
  radius: 0.36,
  halfH: 0.55,
  maxFall: 44,
  deathY: -18,
  platformH: 1.0,
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
const approach = (c, t, m) => (Math.abs(t - c) <= m ? t : c + Math.sign(t - c) * m);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);

/* ---------------- renderer ---------------- */
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xa8cdf0, 0.0062);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(0, 6, -10);

/* ---------------- sky ---------------- */
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(260, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x1f57b0) },
      mid: { value: new THREE.Color(0x74b3ea) },
      bot: { value: new THREE.Color(0xffd9ae) },
    },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP;
      void main(){
        float h = normalize(vP).y;
        vec3 c = mix(bot, mid, smoothstep(-0.25, 0.18, h));
        c = mix(c, top, smoothstep(0.12, 0.9, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  })
);
scene.add(sky);

/* ---------------- lights ---------------- */
scene.add(new THREE.HemisphereLight(0xbfdcff, 0x6f83a8, 0.62));

const sun = new THREE.DirectionalLight(0xfff0d0, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 140;
sun.shadow.camera.left = -42;
sun.shadow.camera.right = 42;
sun.shadow.camera.top = 42;
sun.shadow.camera.bottom = -42;
sun.shadow.bias = -0.0007;
sun.shadow.normalBias = 0.035;
scene.add(sun);
scene.add(sun.target);

const fill = new THREE.DirectionalLight(0x9fc4ff, 0.55);
fill.position.set(-18, 10, 20);
scene.add(fill);

/* ---------------- palette ---------------- */
const PALETTE = [0xff6f8f, 0xffc849, 0x4fd36a, 0x3f9dff, 0x9d78ff, 0xff8a3d, 0x1fc9b4];

const matCache = new Map();
function plastic(hex, rough = 0.5) {
  const key = `${hex}-${rough}`;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0.05 }));
  }
  return matCache.get(key);
}

/* ---------------- shared entity materials ---------------- */
const coinMat = new THREE.MeshStandardMaterial({
  color: 0xffc85c, emissive: 0xff9d2e, emissiveIntensity: 1.1, roughness: 0.25, metalness: 0.85,
});
const droneMat = new THREE.MeshStandardMaterial({ color: 0x5b4b8a, roughness: 0.45, metalness: 0.35 });
const droneCoreMat = new THREE.MeshStandardMaterial({ color: 0xff5d6c, emissive: 0xff2d44, emissiveIntensity: 2.0, roughness: 0.4 });
const droneRingMat = new THREE.MeshStandardMaterial({ color: 0xff8fa8, emissive: 0xff5d7c, emissiveIntensity: 1.0, roughness: 0.5 });

/* ---------------- endless world ---------------- */
const colliders = [];
const platforms = [];
const coins = [];
const drones = [];
const world = new THREE.Group();
scene.add(world);

const worldState = { index: 0, nextZ: 0, nextX: 0, nextY: 0, nextD: 11 };

function disposeGroup(g) {
  g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
}

function addCoin(x, y, z) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.085, 10, 20), coinMat);
  m.position.set(x, y, z);
  m.castShadow = true;
  world.add(m);
  coins.push({ mesh: m, base: y, phase: Math.random() * 6 });
}

function addDrone(x, y, z, axis, range, speed) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.46, 0), droneMat);
  body.castShadow = true;
  g.add(body);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), droneCoreMat);
  g.add(core);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.04, 8, 26), droneRingMat);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  g.position.set(x, y, z);
  world.add(g);
  drones.push({ group: g, ring, base: new THREE.Vector3(x, y, z), axis, range, speed, t: Math.random() * 6 });
}

function addSegment() {
  const i = worldState.index++;
  const diff = Math.min(1, i / 45);
  const first = i === 0;

  const w = first ? 11 : lerp(9, 4.4, diff) * rand(0.92, 1.08);
  const d = first ? 11 : lerp(9, 4.4, diff) * rand(0.92, 1.08);
  const gap = first ? 0 : lerp(2.0, 4.3, diff) + rand(0, 1.0);
  const x = first ? 0 : clamp(worldState.nextX + rand(-4.2, 4.2), -9, 9);
  const y = first ? 0 : clamp(worldState.nextY + rand(-1.1, 1.1), -2.5, 5.5);
  const z = first ? 0 : worldState.nextZ + worldState.nextD / 2 + gap + d / 2;

  const color = PALETTE[i % PALETTE.length];
  const g = new THREE.Group();

  const body = new THREE.Mesh(
    new RoundedBoxGeometry(w, CFG.platformH, d, 3, Math.min(0.32, w * 0.14, d * 0.14)),
    plastic(color, 0.55)
  );
  body.position.y = -CFG.platformH / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  const lighter = new THREE.Color(color).offsetHSL(0, -0.12, 0.16).getHex();
  const top = new THREE.Mesh(
    new RoundedBoxGeometry(w * 0.94, 0.18, d * 0.94, 3, 0.09),
    plastic(lighter, 0.45)
  );
  top.position.y = 0.02;
  top.receiveShadow = true;
  g.add(top);

  g.position.set(x, y, z);
  world.add(g);

  const collider = {
    min: new THREE.Vector3(x - w / 2, y - CFG.platformH, z - d / 2),
    max: new THREE.Vector3(x + w / 2, y, z + d / 2),
  };
  colliders.push(collider);
  platforms.push({ group: g, collider, z, halfD: d / 2 });

  if (!first && Math.random() < 0.85) {
    const n = 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? 0.5 : k / (n - 1);
      addCoin(x + lerp(-w * 0.26, w * 0.26, t), y + 1.15, z + lerp(-d * 0.22, d * 0.22, t));
    }
  }

  if (i >= 4 && Math.random() < 0.32) {
    addDrone(x, y + 1.15, z, 'x', Math.max(0.6, w * 0.22), rand(0.9, 1.5));
  }

  worldState.nextZ = z;
  worldState.nextX = x;
  worldState.nextY = y;
  worldState.nextD = d;
}

function clearWorld() {
  for (const p of platforms) { disposeGroup(p.group); world.remove(p.group); }
  platforms.length = 0;
  colliders.length = 0;
  for (const c of coins) { c.mesh.geometry.dispose(); world.remove(c.mesh); }
  coins.length = 0;
  for (const d of drones) { disposeGroup(d.group); world.remove(d.group); }
  drones.length = 0;
  worldState.index = 0;
  worldState.nextZ = 0;
  worldState.nextX = 0;
  worldState.nextY = 0;
  worldState.nextD = 11;
}

/* ---------------- player state (declared before recycling uses it) ---------------- */
const player = {
  pos: new THREE.Vector3(0, CFG.halfH + 0.05, 0),
  vel: new THREE.Vector3(),
  grounded: false,
  coyote: 0,
  buffer: 0,
  facing: Math.PI,
  squash: 1,
};

function recycleWorld() {
  const cutZ = player.pos.z - 34;

  for (let i = platforms.length - 1; i >= 0; i--) {
    const p = platforms[i];
    if (p.z + p.halfD < cutZ) {
      disposeGroup(p.group);
      world.remove(p.group);
      const ci = colliders.indexOf(p.collider);
      if (ci >= 0) colliders.splice(ci, 1);
      platforms.splice(i, 1);
    }
  }
  for (let i = coins.length - 1; i >= 0; i--) {
    if (coins[i].mesh.position.z < cutZ) {
      coins[i].mesh.geometry.dispose();
      world.remove(coins[i].mesh);
      coins.splice(i, 1);
    }
  }
  for (let i = drones.length - 1; i >= 0; i--) {
    if (drones[i].base.z < cutZ) {
      disposeGroup(drones[i].group);
      world.remove(drones[i].group);
      drones.splice(i, 1);
    }
  }
}

function generateAhead() {
  while (worldState.nextZ < player.pos.z + 80) addSegment();
}

/* ---------------- contact shadow ---------------- */
const blobTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.5)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.18)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
const blob = new THREE.Mesh(
  new THREE.PlaneGeometry(1.5, 1.5),
  new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.8 })
);
blob.rotation.x = -Math.PI / 2;
blob.renderOrder = 2;
scene.add(blob);

/* ---------------- cartoon character ---------------- */
const rig = new THREE.Group();
scene.add(rig);

const skinMat = new THREE.MeshStandardMaterial({ color: 0xfff4e2, roughness: 0.65 });
const suitMat = new THREE.MeshStandardMaterial({ color: 0x2fbfa6, roughness: 0.45 });
const suitDarkMat = new THREE.MeshStandardMaterial({ color: 0x1d8d7c, roughness: 0.5 });
const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
const eyeBlackMat = new THREE.MeshStandardMaterial({ color: 0x1a1f2b, roughness: 0.25 });
const cheekMat = new THREE.MeshStandardMaterial({ color: 0xff9db0, roughness: 0.7 });
const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff6c9, emissive: 0xffd166, emissiveIntensity: 1.5, roughness: 0.3 });

const torso = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.56, 0.48, 4, 0.15), suitMat);
torso.position.y = -0.06;
torso.castShadow = true;
rig.add(torso);

const belly = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.3, 0.1, 3, 0.06), skinMat);
belly.position.set(0, -0.1, 0.24);
rig.add(belly);

const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 18), skinMat);
head.position.y = 0.52;
head.castShadow = true;
rig.add(head);

for (const sx of [-1, 1]) {
  const white = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 14), eyeWhiteMat);
  white.position.set(sx * 0.14, 0.56, 0.33);
  rig.add(white);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 12), eyeBlackMat);
  pupil.position.set(sx * 0.145, 0.555, 0.41);
  rig.add(pupil);
  const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), cheekMat);
  cheek.position.set(sx * 0.27, 0.44, 0.3);
  rig.add(cheek);
}

const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 6), suitDarkMat);
antenna.position.y = 0.94;
rig.add(antenna);
const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 12), bulbMat);
bulb.position.y = 1.06;
rig.add(bulb);

const arms = [];
for (const sx of [-1, 1]) {
  const pivot = new THREE.Group();
  pivot.position.set(sx * 0.34, 0.14, 0);
  const arm = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.34, 0.16, 3, 0.07), suitDarkMat);
  arm.position.y = -0.16;
  arm.castShadow = true;
  pivot.add(arm);
  rig.add(pivot);
  arms.push(pivot);
}

const legs = [];
for (const sx of [-1, 1]) {
  const pivot = new THREE.Group();
  pivot.position.set(sx * 0.16, -0.34, 0);
  const leg = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.24, 0.28, 3, 0.09), suitDarkMat);
  leg.position.set(0, -0.1, 0.05);
  leg.castShadow = true;
  pivot.add(leg);
  rig.add(pivot);
  legs.push(pivot);
}

/* ---------------- input ---------------- */
const keys = Object.create(null);
const input = { jumpPressed: false, jumpHeld: false, stickX: 0, stickZ: 0, stickActive: false };
const isTouch = ('ontouchstart' in window) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
if (isTouch) document.body.classList.add('touch');

window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'Space') { input.jumpPressed = true; input.jumpHeld = true; }
  if (e.code === 'KeyR') startRun();
  if (e.code === 'KeyM') toggleMute();
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'Space') input.jumpHeld = false;
});
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  input.jumpHeld = false;
  input.stickActive = false;
  input.stickX = input.stickZ = 0;
});

const stickEl = document.getElementById('stick');
const knobEl = document.getElementById('knob');
const jumpEl = document.getElementById('jump');
const STICK_R = 46;
let stickId = null;

function updateStick(cx, cy) {
  const r = stickEl.getBoundingClientRect();
  const ox = r.left + r.width / 2;
  const oy = r.top + r.height / 2;
  let dx = cx - ox;
  let dy = cy - oy;
  const len = Math.hypot(dx, dy) || 1;
  if (len > STICK_R) { dx = (dx / len) * STICK_R; dy = (dy / len) * STICK_R; }
  knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
  input.stickX = dx / STICK_R;
  input.stickZ = -dy / STICK_R;
  input.stickActive = true;
}
stickEl.addEventListener('pointerdown', (e) => {
  stickId = e.pointerId;
  try { stickEl.setPointerCapture(e.pointerId); } catch {}
  updateStick(e.clientX, e.clientY);
  e.preventDefault();
});
stickEl.addEventListener('pointermove', (e) => {
  if (e.pointerId !== stickId) return;
  updateStick(e.clientX, e.clientY);
  e.preventDefault();
});
function endStick(e) {
  if (e.pointerId !== stickId) return;
  stickId = null;
  input.stickActive = false;
  input.stickX = input.stickZ = 0;
  knobEl.style.transform = 'translate(0px, 0px)';
}
stickEl.addEventListener('pointerup', endStick);
stickEl.addEventListener('pointercancel', endStick);

jumpEl.addEventListener('pointerdown', (e) => {
  input.jumpPressed = true;
  input.jumpHeld = true;
  jumpEl.classList.add('down');
  e.preventDefault();
});
function jumpUp() { input.jumpHeld = false; jumpEl.classList.remove('down'); }
jumpEl.addEventListener('pointerup', jumpUp);
jumpEl.addEventListener('pointercancel', jumpUp);
jumpEl.addEventListener('pointerleave', jumpUp);

let camYaw = Math.PI;
let camPitch = 0.30;
let dragId = null;
let lastX = 0, lastY = 0;

canvas.addEventListener('pointerdown', (e) => {
  dragId = e.pointerId;
  try { canvas.setPointerCapture(e.pointerId); } catch {}
  lastX = e.clientX; lastY = e.clientY;
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== dragId) return;
  camYaw -= (e.clientX - lastX) * 0.0055;
  camPitch = clamp(camPitch - (e.clientY - lastY) * 0.004, 0.06, 1.0);
  lastX = e.clientX; lastY = e.clientY;
});
function endDrag(e) { if (e.pointerId === dragId) dragId = null; }
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

/* ---------------- audio ---------------- */
let ctx = null;
let master = null;
let musicBus = null;
let muted = false;

function ensureAudio() {
  if (ctx) return ctx;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.34;
    const fb = ctx.createGain();
    fb.gain.value = 0.26;
    const wet = ctx.createGain();
    wet.gain.value = 0.3;
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.9;
    musicBus.connect(master);
    musicBus.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(master);
  } catch {
    ctx = null;
  }
  return ctx;
}

function tone(freq, dur, type = 'sine', gain = 0.06, slideTo = null, when = 0) {
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

const sfx = {
  jump: () => tone(330, 0.16, 'triangle', 0.05, 640),
  land: () => tone(140, 0.1, 'sine', 0.05, 90),
  coin: () => { tone(1046, 0.08, 'sine', 0.05); tone(1568, 0.12, 'sine', 0.04, null, 0.06); },
  stomp: () => tone(220, 0.14, 'square', 0.04, 80),
  fall: () => tone(300, 0.5, 'sawtooth', 0.05, 60),
  over: () => { tone(392, 0.3, 'triangle', 0.05); tone(294, 0.4, 'triangle', 0.05, null, 0.16); },
};

/* ---- original background loop: piano arpeggio, pad, bass, hats ---- */
const Music = (() => {
  const BPM = 88;
  const stepDur = 60 / BPM / 2;
  const chords = [
    [50, 54, 57, 61, 64],
    [47, 50, 54, 57, 61],
    [43, 47, 50, 54, 57],
    [45, 49, 52, 55, 59],
  ];
  const ARP = [0, 2, 4, 2, 1, 3, 2, 4];
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  let timer = null;
  let step = 0;
  let bar = 0;
  let nextTime = 0;
  let hatBuf = null;

  function makeHat() {
    const len = Math.floor(ctx.sampleRate * 0.06);
    hatBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = hatBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }

  function piano(freq, time, dur, gain) {
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    const g2 = ctx.createGain();
    o1.type = 'triangle';
    o2.type = 'sine';
    o1.frequency.value = freq;
    o2.frequency.value = freq * 2.005;
    g2.gain.value = 0.3;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o1.connect(g);
    o2.connect(g2).connect(g);
    g.connect(musicBus);
    o1.start(time); o1.stop(time + dur + 0.05);
    o2.start(time); o2.stop(time + dur + 0.05);
  }

  function pad(freqs, time, dur, gain) {
    for (const f of freqs) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = 4;
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(gain, time + 0.5);
      g.gain.linearRampToValueAtTime(0.0001, time + dur);
      o.connect(lp).connect(g).connect(musicBus);
      o.start(time); o.stop(time + dur + 0.1);
    }
  }

  function hat(time, gain) {
    if (!hatBuf) return;
    const s = ctx.createBufferSource();
    const g = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    s.buffer = hatBuf;
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    s.connect(hp).connect(g).connect(musicBus);
    s.start(time);
    s.stop(time + 0.07);
  }

  function schedule() {
    if (!ctx || ctx.state === 'suspended') return;
    while (nextTime < ctx.currentTime + 0.2) {
      const c = chords[bar % chords.length];
      const s = step % 16;

      if (s === 0) {
        pad(c.map(midi), nextTime, stepDur * 16, 0.022);
        piano(midi(c[0]), nextTime, 1.6, 0.05);
      }
      if (s % 2 === 0) {
        const idx = ARP[(s / 2) % ARP.length];
        piano(midi(c[idx % c.length] + (s >= 8 ? 12 : 0)), nextTime, 0.9, 0.07);
      }
      if (s % 8 === 0) piano(midi(c[0] - 12), nextTime, 1.4, 0.06);
      if (s % 4 === 0) hat(nextTime, 0.045);
      else if (s % 2 === 1) hat(nextTime, 0.015);

      nextTime += stepDur;
      step++;
      if (step % 16 === 0) bar++;
    }
  }

  return {
    start() {
      ensureAudio();
      if (!ctx || timer) return;
      makeHat();
      step = 0;
      bar = 0;
      nextTime = ctx.currentTime + 0.15;
      if (ctx.state === 'suspended') ctx.resume();
      timer = setInterval(schedule, 40);
      schedule();
    },
    stop() {
      if (timer) { clearInterval(timer); timer = null; }
    },
    setMuted(m) {
      if (!ctx || !master) return;
      master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.05);
    },
    get running() { return !!timer; },
  };
})();

function toggleMute() {
  muted = !muted;
  Music.setMuted(muted);
  const b = document.getElementById('mute');
  b.classList.toggle('off', muted);
  b.textContent = muted ? '✕' : '♪';
}
document.getElementById('mute').addEventListener('click', () => {
  ensureAudio();
  toggleMute();
});

/* ---------------- state / hud ---------------- */
const state = { mode: 'menu', score: 0, coins: 0, dist: 0, best: 0, time: 0, startedAt: 0 };
try { state.best = Number(localStorage.getItem('skyrunner.best') || 0) || 0; } catch {}

const el = {
  score: document.getElementById('score'),
  coins: document.getElementById('coins'),
  dist: document.getElementById('dist'),
  start: document.getElementById('start'),
  over: document.getElementById('over'),
  overStats: document.getElementById('overStats'),
  bestStart: document.getElementById('bestStart'),
  bestOver: document.getElementById('bestOver'),
  fps: document.getElementById('fps'),
};

function updateHud() {
  el.score.textContent = String(state.score);
  el.coins.textContent = String(state.coins);
  el.dist.textContent = String(Math.max(0, Math.floor(state.dist)));
  el.bestStart.textContent = String(state.best);
  el.bestOver.textContent = String(state.best);
}

function startRun() {
  ensureAudio();
  Music.start();
  clearWorld();
  addSegment();

  player.pos.set(0, CFG.halfH + 0.05, 0);
  player.vel.set(0, 0, 0);
  player.facing = Math.PI;
  player.grounded = false;
  player.squash = 1;
  camYaw = Math.PI;
  camPitch = isTouch ? 0.38 : 0.30;

  state.mode = 'play';
  state.score = 0;
  state.coins = 0;
  state.dist = 0;
  state.time = 0;
  state.startedAt = performance.now();

  el.start.classList.add('hidden');
  el.over.classList.add('hidden');
  updateHud();
  generateAhead();
}

function gameOver() {
  if (state.mode !== 'play') return;
  state.mode = 'over';
  Music.stop();
  sfx.over();
  if (state.score > state.best) {
    state.best = state.score;
    try { localStorage.setItem('skyrunner.best', String(state.best)); } catch {}
  }
  el.overStats.textContent = `得分 ${state.score} · 跑出 ${Math.floor(state.dist)} 米 · 金币 ${state.coins}`;
  el.bestOver.textContent = String(state.best);
  el.over.classList.remove('hidden');
  updateHud();
}

document.getElementById('play').addEventListener('click', startRun);
document.getElementById('again').addEventListener('click', startRun);

/* ---------------- physics ---------------- */
function playerAabb() {
  const p = player.pos;
  return {
    minX: p.x - CFG.radius, maxX: p.x + CFG.radius,
    minY: p.y - CFG.halfH, maxY: p.y + CFG.halfH,
    minZ: p.z - CFG.radius, maxZ: p.z + CFG.radius,
  };
}

function overlaps(a, c) {
  return a.maxX > c.min.x && a.minX < c.max.x &&
         a.maxY > c.min.y && a.minY < c.max.y &&
         a.maxZ > c.min.z && a.minZ < c.max.z;
}

function resolve(axis) {
  const h = CFG.halfH, r = CFG.radius, p = player.pos, v = player.vel;
  const box = playerAabb();
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (!overlaps(box, c)) continue;

    if (axis === 'y') {
      if (v.y <= 0) {
        p.y = c.max.y + h + 0.001;
        if (v.y < -7) { sfx.land(); player.squash = 0.74; }
        v.y = 0;
        player.grounded = true;
      } else {
        p.y = c.min.y - h;
        v.y = 0;
      }
    } else if (axis === 'x') {
      if (v.x > 0) p.x = c.min.x - r;
      else if (v.x < 0) p.x = c.max.x + r;
      v.x = 0;
    } else {
      if (v.z > 0) p.z = c.min.z - r;
      else if (v.z < 0) p.z = c.max.z + r;
      v.z = 0;
    }
    box.minX = p.x - r; box.maxX = p.x + r;
    box.minY = p.y - h; box.maxY = p.y + h;
    box.minZ = p.z - r; box.maxZ = p.z + r;
  }
}

function updatePlayer(dt) {
  if (state.mode !== 'play') return;

  let ix = 0, iz = 0;
  if (keys.KeyW || keys.ArrowUp) iz += 1;
  if (keys.KeyS || keys.ArrowDown) iz -= 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1;
  if (keys.KeyD || keys.ArrowRight) ix += 1;
  if (input.stickActive) { ix += input.stickX; iz += input.stickZ; }

  const mag = Math.hypot(ix, iz);
  if (mag > 1) { ix /= mag; iz /= mag; }

  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
  const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);

  let wx = fx * iz + rx * ix;
  let wz = fz * iz + rz * ix;
  const wl = Math.hypot(wx, wz);
  if (wl > 0.0001) { wx /= wl; wz /= wl; }

  const sprinting = keys.ShiftLeft || keys.ShiftRight;
  const top = CFG.maxRun * (sprinting ? CFG.sprintMul : 1);
  const hasInput = wl > 0.001;
  const accel = player.grounded
    ? (hasInput ? CFG.groundAccel : CFG.groundDecel)
    : (hasInput ? CFG.airAccel : CFG.airDecel);

  if (hasInput) {
    player.vel.x = approach(player.vel.x, wx * top, accel * dt);
    player.vel.z = approach(player.vel.z, wz * top, accel * dt);
    const target = Math.atan2(wx, wz);
    let d = target - player.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    player.facing += d * Math.min(1, dt * 14);
  } else if (player.grounded) {
    const f = Math.exp(-CFG.groundFriction * dt);
    player.vel.x *= f;
    player.vel.z *= f;
  }

  if (input.jumpPressed) { player.buffer = CFG.buffer; input.jumpPressed = false; }
  player.buffer = Math.max(0, player.buffer - dt);

  if (player.grounded) player.coyote = CFG.coyote;
  else player.coyote = Math.max(0, player.coyote - dt);

  if (player.buffer > 0 && player.coyote > 0) {
    player.vel.y = CFG.jumpSpeed;
    player.grounded = false;
    player.coyote = 0;
    player.buffer = 0;
    player.squash = 1.2;
    sfx.jump();
  }

  if (!input.jumpHeld && player.vel.y > 0) {
    player.vel.y -= CFG.jumpSpeed * CFG.jumpCut * dt * 9;
  }

  const g = player.vel.y < 0 ? CFG.fallGravity : CFG.gravity;
  player.vel.y -= g * dt;
  player.vel.y = Math.max(player.vel.y, -CFG.maxFall);

  player.grounded = false;
  player.pos.y += player.vel.y * dt;
  resolve('y');
  player.pos.x += player.vel.x * dt;
  resolve('x');
  player.pos.z += player.vel.z * dt;
  resolve('z');

  state.dist = Math.max(state.dist, player.pos.z);
  state.score = Math.floor(state.dist) * 10 + state.coins * 100;

  if (player.pos.y < CFG.deathY) { sfx.fall(); gameOver(); return; }

  /* animation */
  player.squash = damp(player.squash, 1, 10, dt);
  rig.position.copy(player.pos);
  rig.rotation.y = damp(rig.rotation.y, player.facing, 16, dt);
  const sq = player.squash;
  rig.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));

  const speed = Math.hypot(player.vel.x, player.vel.z);
  const t = performance.now() / 1000;
  const swing = player.grounded ? Math.sin(t * 12) * Math.min(1, speed / 6) : 0.9;
  arms[0].rotation.x = swing * 0.9;
  arms[1].rotation.x = -swing * 0.9;
  legs[0].rotation.x = -swing * 0.7;
  legs[1].rotation.x = swing * 0.7;
  if (!player.grounded) {
    arms[0].rotation.z = 0.5;
    arms[1].rotation.z = -0.5;
  } else {
    arms[0].rotation.z = damp(arms[0].rotation.z, 0, 12, dt);
    arms[1].rotation.z = damp(arms[1].rotation.z, 0, 12, dt);
  }
  bulbMat.emissiveIntensity = 1.3 + Math.sin(t * 5) * 0.35;
  head.position.y = 0.52 + Math.sin(t * 3) * 0.012;

  /* contact shadow */
  let groundY = -Infinity;
  for (const c of colliders) {
    if (player.pos.x > c.min.x - 0.25 && player.pos.x < c.max.x + 0.25 &&
        player.pos.z > c.min.z - 0.25 && player.pos.z < c.max.z + 0.25 &&
        c.max.y <= player.pos.y - CFG.halfH + 0.3) {
      if (c.max.y > groundY) groundY = c.max.y;
    }
  }
  if (groundY > -Infinity) {
    const hgt = Math.max(0, player.pos.y - CFG.halfH - groundY);
    blob.visible = true;
    blob.position.set(player.pos.x, groundY + 0.02, player.pos.z);
    blob.scale.setScalar(clamp(1 - hgt * 0.07, 0.4, 1));
    blob.material.opacity = clamp(0.8 - hgt * 0.075, 0.08, 0.8);
  } else {
    blob.visible = false;
  }
}

/* ---------------- entities ---------------- */
function updateCoins(dt) {
  const t = performance.now() / 1000;
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    c.mesh.rotation.y += dt * 2.8;
    c.mesh.position.y = c.base + Math.sin(t * 2.4 + c.phase) * 0.12;
    if (state.mode !== 'play') continue;
    if (c.mesh.position.distanceTo(player.pos) < 1.05) {
      c.mesh.geometry.dispose();
      world.remove(c.mesh);
      coins.splice(i, 1);
      state.coins += 1;
      sfx.coin();
    }
  }
}

function updateDrones(dt) {
  const t = performance.now() / 1000;
  for (const d of drones) {
    d.t += dt * d.speed;
    const p = d.group.position;
    p.copy(d.base);
    p.x += Math.sin(d.t) * d.range;
    p.y = d.base.y + Math.sin(t * 1.8 + d.base.x) * 0.16;
    d.ring.rotation.z += dt * 2.4;
    d.group.rotation.y += dt * 0.8;
    if (state.mode !== 'play' || !d.group.visible) continue;

    const dx = Math.abs(p.x - player.pos.x);
    const dy = Math.abs(p.y - player.pos.y);
    const dz = Math.abs(p.z - player.pos.z);
    if (dx < 0.85 && dy < 0.95 && dz < 0.85) {
      const stomped = player.vel.y < -2 && player.pos.y > p.y + 0.25;
      if (stomped) {
        d.group.visible = false;
        player.vel.y = 11;
        player.squash = 1.2;
        sfx.stomp();
        state.coins += 2;
      } else {
        player.vel.y = Math.max(player.vel.y, 7);
        player.vel.x *= -0.5;
        player.vel.z -= 3;
        sfx.stomp();
      }
    }
  }
}

/* ---------------- camera ---------------- */
const camTarget = new THREE.Vector3();
const camDesired = new THREE.Vector3();

function updateCamera(dt) {
  const dist = isTouch ? 9.6 : 7.6;
  const cp = Math.cos(camPitch), sp = Math.sin(camPitch);
  camTarget.set(player.pos.x, player.pos.y + (isTouch ? 0.55 : 0.95), player.pos.z);
  camDesired.set(
    camTarget.x + Math.sin(camYaw) * cp * dist,
    camTarget.y + sp * dist,
    camTarget.z + Math.cos(camYaw) * cp * dist
  );

  camera.position.x = damp(camera.position.x, camDesired.x, 9, dt);
  camera.position.y = damp(camera.position.y, camDesired.y, 9, dt);
  camera.position.z = damp(camera.position.z, camDesired.z, 9, dt);
  camera.lookAt(camTarget);

  sun.position.set(player.pos.x + 14, player.pos.y + 26, player.pos.z - 12);
  sun.target.position.copy(player.pos);
  sun.target.updateMatrixWorld();
  sky.position.copy(camera.position);
}

/* ---------------- post processing ---------------- */
let composer = null;
async function setupPost() {
  try {
    const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
    ]);
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.36, 0.62, 0.9));
    composer.addPass(new OutputPass());
  } catch (err) {
    console.warn('post-processing unavailable', err);
    composer = null;
  }
}

/* ---------------- loop ---------------- */
const clock = new THREE.Clock();
let frames = 0, fpsAccum = 0, fpsFrames = 0;

function tick() {
  const dt = Math.min(clock.getDelta(), 1 / 30);
  const t = clock.elapsedTime;

  if (state.mode === 'play') {
    state.time += dt;
    updatePlayer(dt);
    updateCoins(dt);
    updateDrones(dt);
    recycleWorld();
    generateAhead();
    updateHud();
  } else {
    updateCoins(dt);
    updateDrones(dt);
    if (state.mode === 'menu') {
      rig.position.copy(player.pos);
      rig.rotation.y += dt * 0.5;
      const s = Math.sin(t * 3) * 0.035;
      rig.scale.set(1 - s, 1 + s, 1 - s);
    }
  }

  updateCamera(dt);

  if (composer) composer.render(); else renderer.render(scene, camera);

  frames++;
  fpsAccum += dt; fpsFrames++;
  if (fpsAccum > 0.5) {
    el.fps.textContent = `${Math.round(fpsFrames / fpsAccum)} fps`;
    fpsAccum = 0; fpsFrames = 0;
  }
  if (frames === 10) document.body.dataset.ready = '1';
  requestAnimationFrame(tick);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
});

(async function boot() {
  await setupPost();
  addSegment();
  generateAhead();
  updateHud();
  camera.position.set(player.pos.x, player.pos.y + 4, player.pos.z - 9);
  tick();

  window.__skyrunner = {
    scene, camera, renderer, player, state, colliders, platforms, coins, drones,
    setCam: (yaw, pitch) => { camYaw = yaw; camPitch = pitch; },
    teleport: (x, y, z) => { player.pos.set(x, y, z); player.vel.set(0, 0, 0); },
    start: startRun,
    musicRunning: () => Music.running,
  };
})();
