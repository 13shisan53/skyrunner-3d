import * as THREE from 'three';

/* ============================================================
   SKYRUNNER — a small 3D platformer
   Everything is original: no third-party art, models or sounds.
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
  lives: 3,
  respawnY: -22,
};

/* ---------------- math helpers ---------------- */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
const approach = (cur, tgt, maxDelta) => {
  const d = tgt - cur;
  if (Math.abs(d) <= maxDelta) return tgt;
  return cur + Math.sign(d) * maxDelta;
};

/* ---------------- renderer ---------------- */
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0b1626, 0.011);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 6, -12);

/* ---------------- sky ---------------- */
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(320, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x0a1430) },
      mid: { value: new THREE.Color(0x1d3f6b) },
      bot: { value: new THREE.Color(0x0a111d) },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
      varying vec3 vPos;
      void main() {
        float h = normalize(vPos).y;
        vec3 c = mix(bot, mid, smoothstep(-0.35, 0.12, h));
        c = mix(c, top, smoothstep(0.08, 0.85, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  })
);
scene.add(sky);

/* ---------------- lights ---------------- */
scene.add(new THREE.HemisphereLight(0x9fc4ff, 0x1a2334, 0.62));

const sun = new THREE.DirectionalLight(0xffe3b8, 3.0);
sun.position.set(16, 30, -10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 120;
sun.shadow.camera.left = -46;
sun.shadow.camera.right = 46;
sun.shadow.camera.top = 46;
sun.shadow.camera.bottom = -46;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
scene.add(sun);
scene.add(sun.target);

const fill = new THREE.DirectionalLight(0x67b7ff, 0.7);
fill.position.set(-20, 12, 24);
scene.add(fill);

/* ---------------- materials ---------------- */
const MAT = {
  rock: new THREE.MeshStandardMaterial({ color: 0x1b2637, roughness: 0.92, metalness: 0.08 }),
  top: new THREE.MeshStandardMaterial({ color: 0x2f4a63, roughness: 0.55, metalness: 0.28 }),
  edge: new THREE.LineBasicMaterial({ color: 0x5ce1e6, transparent: true, opacity: 0.22 }),
  coin: new THREE.MeshStandardMaterial({
    color: 0xffc85c, emissive: 0xff9d2e, emissiveIntensity: 1.1, roughness: 0.25, metalness: 0.9,
  }),
  drone: new THREE.MeshStandardMaterial({ color: 0x2a3546, roughness: 0.35, metalness: 0.7 }),
  droneCore: new THREE.MeshStandardMaterial({
    color: 0xff5d6c, emissive: 0xff2d44, emissiveIntensity: 2.4, roughness: 0.4,
  }),
  pad: new THREE.MeshStandardMaterial({
    color: 0x5ce1e6, emissive: 0x2fd2da, emissiveIntensity: 0.85, roughness: 0.3, metalness: 0.6,
  }),
  goal: new THREE.MeshStandardMaterial({
    color: 0x8ff7ff, emissive: 0x36d6e8, emissiveIntensity: 2.2, roughness: 0.2, metalness: 0.8,
  }),
};

/* procedural panel texture for platform tops */
const GRID_TEX = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2b4055';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  g.strokeStyle = 'rgba(122,226,255,0.20)';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, 253, 253);
  g.strokeStyle = 'rgba(122,226,255,0.08)';
  g.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const q = i * 64;
    g.beginPath(); g.moveTo(q, 0); g.lineTo(q, 256); g.stroke();
    g.beginPath(); g.moveTo(0, q); g.lineTo(256, q); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
})();

/* ---------------- world ---------------- */
const colliders = [];
const coins = [];
const drones = [];
const pads = [];
const world = new THREE.Group();
scene.add(world);

function addPlatform(x, y, z, w, h, d, kind = 'rock') {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, MAT[kind === 'top' ? 'top' : 'rock']);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  world.add(mesh);

  // thin lit cap on top
  const capMat = MAT.top.clone();
  capMat.color.setHex(0xffffff);
  capMat.map = GRID_TEX.clone();
  capMat.map.needsUpdate = true;
  capMat.map.repeat.set(Math.max(1, Math.round(w / 3)), Math.max(1, Math.round(d / 3)));
  const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 0.99, 0.16, d * 0.99), capMat);
  cap.position.set(x, y + h / 2 - 0.07, z);
  cap.receiveShadow = true;
  world.add(cap);

  // neon outline
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), MAT.edge);
  edges.position.copy(mesh.position);
  world.add(edges);

  colliders.push({
    min: new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
    max: new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2),
  });
  return mesh;
}

function addCoin(x, y, z) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.085, 10, 20), MAT.coin);
  m.position.set(x, y, z);
  m.castShadow = true;
  world.add(m);
  coins.push({ mesh: m, base: y, alive: true, spin: Math.random() * Math.PI * 2 });
}

function addDrone(x, y, z, axis, range, speed = 1.2) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.46, 0), MAT.drone);
  body.castShadow = true;
  g.add(body);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), MAT.droneCore);
  g.add(core);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.62, 0.035, 8, 28),
    new THREE.MeshStandardMaterial({ color: 0xff5d6c, emissive: 0xff2d44, emissiveIntensity: 1.2, roughness: 0.4 })
  );
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  g.position.set(x, y, z);
  world.add(g);
  drones.push({ group: g, core, ring, base: new THREE.Vector3(x, y, z), axis, range, speed, t: Math.random() * 6, alive: true });
}

function addPad(x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 0.16, 20), MAT.pad);
  m.position.set(x, y, z);
  world.add(m);
  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 0.02, 20),
    new THREE.MeshBasicMaterial({ color: 0xbdfbff, transparent: true, opacity: 0.32 })
  );
  glow.position.set(x, y + 0.1, z);
  world.add(glow);
  pads.push({ mesh: m, pos: new THREE.Vector3(x, y, z) });
  return m;
}

/* ----- course layout (hand-placed, loose but readable) ----- */
addPlatform(0, 0, 0, 11, 1.2, 11);            // start
addPlatform(0, 1.1, 11, 5, 1.0, 4);
addPlatform(3.6, 2.1, 16.5, 4, 1.0, 4);
addPlatform(-2.2, 3.1, 20.5, 4, 1.0, 4);
addPlatform(1.4, 4.2, 27, 4.5, 1.0, 4.5);
addPlatform(0, 5.1, 35, 3, 0.8, 11);          // bridge
addPlatform(0, 6.3, 45, 11, 1.2, 11);         // mid island (checkpoint)
addPlatform(4.2, 7.5, 52.5, 3, 1.0, 3);
addPlatform(-1.2, 8.7, 57.5, 3.5, 1.0, 3.5);
addPlatform(0, 9.9, 63.5, 8, 1.2, 8);         // finish

addPad(0, 6.3 + 0.6 + 0.1, 41.5);

/* coins: an arc along the route */
const coinRoute = [
  [0, 1.6, 5.5], [0, 1.9, 8.6], [0, 2.5, 11], [1.8, 3.1, 14], [3.6, 3.3, 16.5],
  [0.5, 4.1, 19], [-2.2, 4.3, 20.5], [-0.6, 5.2, 24.5], [1.4, 5.4, 27],
  [1.4, 5.9, 30], [0, 6.5, 35], [0, 7.2, 40], [2.5, 8.0, 45], [-2.5, 8.0, 45],
  [4.2, 8.8, 52.5], [-1.2, 10.0, 57.5], [0, 11.2, 61],
];
coinRoute.forEach(([x, y, z]) => addCoin(x, y, z));

/* enemies */
addDrone(0, 7.6, 45, 'x', 4.2, 1.1);
addDrone(0, 7.6, 45, 'z', 3.6, 1.35);
addDrone(0, 6.2, 35, 'x', 1.0, 1.6);
addDrone(0, 11.4, 63.5, 'x', 2.6, 1.0);

/* goal ring */
const goalGroup = new THREE.Group();
const goalRing = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.13, 16, 48), MAT.goal);
goalGroup.add(goalRing);
const goalHalo = new THREE.Mesh(
  new THREE.CircleGeometry(1.05, 36),
  new THREE.MeshBasicMaterial({ color: 0x8ff7ff, transparent: true, opacity: 0.16, side: THREE.DoubleSide })
);
goalGroup.add(goalHalo);
goalGroup.position.set(0, 11.9, 63.5);
world.add(goalGroup);
const GOAL_POS = goalGroup.position.clone();

/* ---------------- ambient particles ---------------- */
const DUST = 380;
const dustGeo = new THREE.BufferGeometry();
const dustPos = new Float32Array(DUST * 3);
for (let i = 0; i < DUST; i++) {
  dustPos[i * 3] = (Math.random() - 0.5) * 70;
  dustPos[i * 3 + 1] = Math.random() * 34 - 4;
  dustPos[i * 3 + 2] = Math.random() * 80 - 10;
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(
  dustGeo,
  new THREE.PointsMaterial({ color: 0x9fd8ff, size: 0.07, transparent: true, opacity: 0.5, depthWrite: false })
);
scene.add(dust);

/* ---------------- player ---------------- */
const player = {
  pos: new THREE.Vector3(0, 0.6 + CFG.halfH + 0.05, 0),
  vel: new THREE.Vector3(),
  grounded: false,
  coyote: 0,
  buffer: 0,
  facing: Math.PI,
  squash: 1,
  invuln: 0,
};

const playerGroup = new THREE.Group();
scene.add(playerGroup);

const bodyMat = new THREE.MeshStandardMaterial({ color: 0xdfe9f5, roughness: 0.35, metalness: 0.2 });
const suitMat = new THREE.MeshStandardMaterial({ color: 0x2b6f8f, roughness: 0.5, metalness: 0.35 });
const visorMat = new THREE.MeshStandardMaterial({
  color: 0x0b1a24, emissive: 0x5ce1e6, emissiveIntensity: 1.15, roughness: 0.2, metalness: 0.4,
});

const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.34, 6, 14), suitMat);
body.castShadow = true;
playerGroup.add(body);

const head = new THREE.Mesh(new THREE.SphereGeometry(0.31, 20, 16), bodyMat);
head.position.y = 0.46;
head.castShadow = true;
playerGroup.add(head);

const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.1), visorMat);
visor.position.set(0, 0.48, 0.27);
playerGroup.add(visor);

const pack = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.14), suitMat);
pack.position.set(0, 0.02, -0.3);
pack.castShadow = true;
playerGroup.add(pack);

/* soft contact shadow, independent of the shadow map */
const blobTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.58)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.20)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
const blob = new THREE.Mesh(
  new THREE.PlaneGeometry(1.45, 1.45),
  new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.85 })
);
blob.rotation.x = -Math.PI / 2;
blob.renderOrder = 2;
scene.add(blob);

/* ---------------- checkpoints ---------------- */
const checkpoints = [
  new THREE.Vector3(0, 0.6 + CFG.halfH + 0.05, 0),
  new THREE.Vector3(0, 6.3 + 0.6 + CFG.halfH + 0.05, 45),
];
let checkpointIndex = 0;

/* ---------------- input ---------------- */
const keys = Object.create(null);
const input = { jumpPressed: false, jumpHeld: false };
const state = { mode: 'menu', lives: CFG.lives, coins: 0, time: 0, startedAt: 0 };

window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'Space') {
    input.jumpPressed = true;
    input.jumpHeld = true;
  }
  if (e.code === 'KeyR' && state.mode === 'play') restart();
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'Space') input.jumpHeld = false;
});
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  input.jumpHeld = false;
});

/* mouse / touch orbit */
let camYaw = Math.PI;
let camPitch = 0.34;
let dragging = false;
let lastX = 0, lastY = 0;

canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  lastX = e.clientX; lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  camYaw -= (e.clientX - lastX) * 0.0055;
  camPitch = clamp(camPitch - (e.clientY - lastY) * 0.004, 0.06, 1.05);
  lastX = e.clientX; lastY = e.clientY;
});
canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointercancel', () => { dragging = false; });

/* ---------------- audio (synthesised, no assets) ---------------- */
let actx = null;
function audio() {
  if (!actx) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { actx = null; }
  }
  return actx;
}
function tone(freq, dur, type = 'sine', gain = 0.06, slideTo = null) {
  const ctx = audio();
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + dur + 0.02);
}
const sfx = {
  jump: () => tone(340, 0.16, 'triangle', 0.05, 620),
  land: () => tone(150, 0.1, 'sine', 0.05, 90),
  coin: () => { tone(1046, 0.08, 'sine', 0.05); setTimeout(() => tone(1568, 0.12, 'sine', 0.045), 60); },
  stomp: () => tone(200, 0.14, 'square', 0.04, 70),
  hurt: () => tone(240, 0.3, 'sawtooth', 0.05, 90),
  pad: () => tone(520, 0.22, 'triangle', 0.055, 1040),
  win: () => {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.24, 'triangle', 0.05), i * 110));
  },
};

/* ---------------- HUD ---------------- */
const el = {
  coins: document.getElementById('coins'),
  coinsTotal: document.getElementById('coinsTotal'),
  lives: document.getElementById('lives'),
  time: document.getElementById('time'),
  start: document.getElementById('start'),
  win: document.getElementById('win'),
  winTitle: document.getElementById('winTitle'),
  winTag: document.getElementById('winTag'),
  winStats: document.getElementById('winStats'),
  fps: document.getElementById('fps'),
};
el.coinsTotal.textContent = String(coins.length);

function renderLives() {
  el.lives.innerHTML = '';
  for (let i = 0; i < CFG.lives; i++) {
    const d = document.createElement('div');
    d.className = 'pip' + (i >= state.lives ? ' off' : '');
    el.lives.appendChild(d);
  }
}
function updateHud() {
  el.coins.textContent = String(state.coins);
  const t = state.time;
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  el.time.textContent = `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
renderLives();

/* ---------------- game flow ---------------- */
function resetRun() {
  state.lives = CFG.lives;
  state.coins = 0;
  state.time = 0;
  checkpointIndex = 0;
  player.pos.copy(checkpoints[0]);
  player.vel.set(0, 0, 0);
  player.facing = Math.PI;
  player.invuln = 0;
  coins.forEach((c) => { c.alive = true; c.mesh.visible = true; });
  drones.forEach((d) => { d.alive = true; d.group.visible = true; });
  renderLives();
  updateHud();
}

function startGame() {
  resetRun();
  state.mode = 'play';
  state.startedAt = performance.now();
  el.start.classList.add('hidden');
  el.win.classList.add('hidden');
  audio();
}

function restart() {
  startGame();
}

function win() {
  if (state.mode !== 'play') return;
  state.mode = 'win';
  sfx.win();
  el.winTag.textContent = 'Course clear';
  el.winTitle.textContent = '通关';
  el.winStats.textContent = `用时 ${state.time.toFixed(1)} 秒 · 能量核心 ${state.coins} / ${coins.length}`;
  el.win.classList.remove('hidden');
}

function loseLife() {
  if (state.mode !== 'play') return;
  state.lives -= 1;
  renderLives();
  if (state.lives <= 0) {
    state.mode = 'win';
    el.winTag.textContent = 'Out of lives';
    el.winTitle.textContent = '失败';
    el.winStats.textContent = `收集了 ${state.coins} / ${coins.length} 个能量核心。按 R 或点击按钮重来。`;
    el.win.classList.remove('hidden');
    return;
  }
  respawn();
}

function respawn() {
  player.pos.copy(checkpoints[checkpointIndex]);
  player.vel.set(0, 0, 0);
  player.invuln = 1.4;
  player.squash = 0.7;
  // reset the checkpoint's nearby drones so you are not spawned into one
  drones.forEach((d) => {
    if (!d.alive) return;
    if (d.group.position.distanceTo(player.pos) < 6) {
      d.alive = true;
      d.group.visible = true;
    }
  });
}

el.start.querySelector('button').addEventListener('click', startGame);
document.getElementById('play').addEventListener('click', startGame);
document.getElementById('again').addEventListener('click', () => { audio(); startGame(); });

/* ---------------- physics ---------------- */
const tmpV = new THREE.Vector3();

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
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (!overlaps(playerAabb(), c)) continue;

    if (axis === 'y') {
      if (v.y <= 0) {
        p.y = c.max.y + h + 0.001;
        if (v.y < -6) { sfx.land(); player.squash = 0.72; }
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
  }
}

function updatePlayer(dt) {
  if (state.mode !== 'play') return;

  /* --- desired direction, camera relative --- */
  let ix = 0, iz = 0;
  if (keys.KeyW || keys.ArrowUp) iz += 1;
  if (keys.KeyS || keys.ArrowDown) iz -= 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1;
  if (keys.KeyD || keys.ArrowRight) ix += 1;

  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
  const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);

  let wx = fx * iz + rx * ix;
  let wz = fz * iz + rz * ix;
  const wl = Math.hypot(wx, wz);
  if (wl > 0.0001) { wx /= wl; wz /= wl; }

  const sprinting = keys.ShiftLeft || keys.ShiftRight;
  const top = CFG.maxRun * (sprinting ? CFG.sprintMul : 1);

  const hasInput = wl > 0.0001;
  const accel = player.grounded
    ? (hasInput ? CFG.groundAccel : CFG.groundDecel)
    : (hasInput ? CFG.airAccel : CFG.airDecel);

  if (hasInput) {
    player.vel.x = approach(player.vel.x, wx * top, accel * dt);
    player.vel.z = approach(player.vel.z, wz * top, accel * dt);
    const targetFacing = Math.atan2(wx, wz);
    let d = targetFacing - player.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    player.facing += d * Math.min(1, dt * 14);
  } else if (player.grounded) {
    const f = Math.exp(-CFG.groundFriction * dt);
    player.vel.x *= f;
    player.vel.z *= f;
  }

  /* --- jump buffering + coyote time --- */
  if (input.jumpPressed) { player.buffer = CFG.buffer; input.jumpPressed = false; }
  player.buffer = Math.max(0, player.buffer - dt);

  if (player.grounded) player.coyote = CFG.coyote;
  else player.coyote = Math.max(0, player.coyote - dt);

  if (player.buffer > 0 && player.coyote > 0) {
    player.vel.y = CFG.jumpSpeed;
    player.grounded = false;
    player.coyote = 0;
    player.buffer = 0;
    player.squash = 1.18;
    sfx.jump();
  }

  /* variable jump height */
  if (!input.jumpHeld && player.vel.y > 0) {
    player.vel.y -= CFG.jumpSpeed * CFG.jumpCut * dt * 9;
  }

  /* --- gravity --- */
  const g = player.vel.y < 0 ? CFG.fallGravity : CFG.gravity;
  player.vel.y -= g * dt;
  player.vel.y = Math.max(player.vel.y, -CFG.maxFall);

  /* --- integrate + resolve --- */
  player.grounded = false;
  // vertical first: resolve ground contact before the horizontal sweeps,
  // otherwise a one-millimetre dip lets the side resolver shove you off the ledge
  player.pos.y += player.vel.y * dt;
  resolve('y');
  player.pos.x += player.vel.x * dt;
  resolve('x');
  player.pos.z += player.vel.z * dt;
  resolve('z');

  /* --- jump pads --- */
  for (const p of pads) {
    if (player.pos.distanceTo(tmpV.copy(p.pos).add(new THREE.Vector3(0, 0.3, 0))) < 1.0 && player.vel.y <= 0.5) {
      player.vel.y = 19;
      player.squash = 1.25;
      sfx.pad();
    }
  }

  /* --- checkpoint --- */
  if (checkpointIndex === 0 && player.pos.z > 40 && player.pos.y > 5) checkpointIndex = 1;

  /* --- fell off --- */
  if (player.pos.y < CFG.respawnY) loseLife();

  /* --- visual --- */
  player.squash = damp(player.squash, 1, 9, dt);
  playerGroup.position.copy(player.pos);
  playerGroup.rotation.y = damp(playerGroup.rotation.y, player.facing, 16, dt);
  const sq = player.squash;
  playerGroup.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
  player.invuln = Math.max(0, player.invuln - dt);
  playerGroup.visible = player.invuln <= 0 || Math.floor(player.invuln * 18) % 2 === 0;

  /* contact shadow: project onto the highest surface underneath */
  let groundY = -Infinity;
  for (const c of colliders) {
    if (player.pos.x > c.min.x - 0.25 && player.pos.x < c.max.x + 0.25 &&
        player.pos.z > c.min.z - 0.25 && player.pos.z < c.max.z + 0.25 &&
        c.max.y <= player.pos.y - CFG.halfH + 0.25) {
      if (c.max.y > groundY) groundY = c.max.y;
    }
  }
  if (groundY > -Infinity) {
    const hgt = Math.max(0, player.pos.y - CFG.halfH - groundY);
    blob.visible = true;
    blob.position.set(player.pos.x, groundY + 0.02, player.pos.z);
    blob.scale.setScalar(clamp(1 - hgt * 0.07, 0.4, 1));
    blob.material.opacity = clamp(0.85 - hgt * 0.08, 0.08, 0.85);
  } else {
    blob.visible = false;
  }

  visor.material.emissiveIntensity = 1.05 + Math.sin(performance.now() * 0.004) * 0.18;
}

/* ---------------- entities ---------------- */
function updateCoins(dt, t) {
  for (const c of coins) {
    if (!c.alive) continue;
    c.mesh.rotation.y += dt * 2.6;
    c.mesh.position.y = c.base + Math.sin(t * 2.2 + c.spin) * 0.12;
    if (state.mode !== 'play') continue;
    if (c.mesh.position.distanceTo(player.pos) < 1.0) {
      c.alive = false;
      c.mesh.visible = false;
      state.coins += 1;
      sfx.coin();
      updateHud();
    }
  }
}

function updateDrones(dt, t) {
  for (const d of drones) {
    if (!d.alive) continue;
    d.t += dt * d.speed;
    const p = d.group.position;
    p.copy(d.base);
    if (d.axis === 'x') p.x += Math.sin(d.t) * d.range;
    else if (d.axis === 'z') p.z += Math.sin(d.t) * d.range;
    else p.y += Math.sin(d.t) * d.range;

    p.y = d.base.y + Math.sin(t * 1.6 + d.base.x) * 0.18;
    d.ring.rotation.z += dt * 2.2;
    d.group.rotation.y += dt * 0.7;

    if (state.mode !== 'play') continue;
    const dx = Math.abs(p.x - player.pos.x);
    const dy = Math.abs(p.y - player.pos.y);
    const dz = Math.abs(p.z - player.pos.z);
    if (dx < 0.85 && dy < 0.95 && dz < 0.85) {
      const fromAbove = player.vel.y < -2 && player.pos.y > p.y + 0.28;
      if (fromAbove) {
        d.alive = false;
        d.group.visible = false;
        player.vel.y = 10.5;
        player.squash = 1.2;
        sfx.stomp();
      } else if (player.invuln <= 0) {
        sfx.hurt();
        loseLife();
      }
    }
  }
}

/* ---------------- camera ---------------- */
const camTarget = new THREE.Vector3();
const camDesired = new THREE.Vector3();

function updateCamera(dt) {
  const dist = 7.4;
  const cp = Math.cos(camPitch), sp = Math.sin(camPitch);

  camTarget.set(player.pos.x, player.pos.y + 0.9, player.pos.z);
  camDesired.set(
    camTarget.x + Math.sin(camYaw) * cp * dist,
    camTarget.y + sp * dist,
    camTarget.z + Math.cos(camYaw) * cp * dist
  );

  camera.position.x = damp(camera.position.x, camDesired.x, 9, dt);
  camera.position.y = damp(camera.position.y, camDesired.y, 9, dt);
  camera.position.z = damp(camera.position.z, camDesired.z, 9, dt);

  camera.lookAt(camTarget);

  // keep the sun's shadow frustum around the player
  sun.position.set(player.pos.x + 16, player.pos.y + 30, player.pos.z - 10);
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
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), 0.42, 0.6, 0.95
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  } catch (err) {
    console.warn('post-processing unavailable, falling back to direct render', err);
    composer = null;
  }
}

/* ---------------- loop ---------------- */
const clock = new THREE.Clock();
let frames = 0;
let fpsAccum = 0, fpsFrames = 0;
const SELFTEST = new URLSearchParams(location.search).has('selftest');

function tick() {
  const dt = Math.min(clock.getDelta(), 1 / 30);
  const t = clock.elapsedTime;

  if (SELFTEST && state.mode === 'menu') startGame();
  if (SELFTEST) {
    keys.KeyW = state.time < 2.2;
    if (state.time > 2.4 && !document.body.dataset.selftest) {
      document.body.dataset.selftest =
        `${player.pos.x.toFixed(2)},${player.pos.y.toFixed(2)},${player.pos.z.toFixed(2)}`;
    }
  }

  if (state.mode === 'play') state.time = (performance.now() - state.startedAt) / 1000;

  updatePlayer(dt);
  updateCoins(dt, t);
  updateDrones(dt, t);
  updateCamera(dt);

  goalRing.rotation.y += dt * 0.9;
  goalRing.rotation.z += dt * 0.35;
  goalHalo.lookAt(camera.position);

  const dustPosAttr = dust.geometry.attributes.position;
  for (let i = 0; i < DUST; i++) {
    let y = dustPosAttr.getY(i) + Math.sin(t * 0.4 + i) * 0.004;
    if (y > 30) y = -4;
    dustPosAttr.setY(i, y);
  }
  dustPosAttr.needsUpdate = true;

  if (state.mode === 'play' && player.pos.distanceTo(GOAL_POS) < 1.5) win();
  if (state.mode === 'play') updateHud();

  if (composer) composer.render(); else renderer.render(scene, camera);

  frames++;
  fpsAccum += dt; fpsFrames++;
  if (fpsAccum > 0.5) {
    el.fps.textContent = SELFTEST
      ? `x${player.pos.x.toFixed(1)} y${player.pos.y.toFixed(1)} z${player.pos.z.toFixed(1)} g${player.grounded ? 1 : 0} ${Math.round(fpsFrames / fpsAccum)}fps`
      : `${Math.round(fpsFrames / fpsAccum)} fps`;
    fpsAccum = 0; fpsFrames = 0;
  }
  if (frames === 10) document.body.dataset.ready = '1';

  requestAnimationFrame(tick);
}

/* ---------------- boot ---------------- */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
});

(async function boot() {
  await setupPost();
  resetRun();
  updateHud();
  camera.position.set(player.pos.x, player.pos.y + 4, player.pos.z - 9);
  tick();
  window.__skyrunner = {
  scene, camera, renderer, player, state, colliders, coins, drones,
  setCam: (yaw, pitch) => { camYaw = yaw; camPitch = pitch; },
  teleport: (x, y, z) => { player.pos.set(x, y, z); player.vel.set(0, 0, 0); },
};
})();
