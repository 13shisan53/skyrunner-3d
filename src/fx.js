import * as THREE from 'three';
import { CFG, QUALITY_TIERS, TRAILS } from './config.js';

function softDisc() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const MAX = 240;

export class FX {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.max = MAX;
    this.particles = [];
    this.count = 0;
    this.lowStim = false;
    this.tier = 'high';

    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo = geo;

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { map: { value: softDisc() } },
      vertexShader: `
        attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          vColor = aColor; vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * clamp(10.0 / max(1.0, -mv.z), 0.18, 2.2);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D map; varying vec3 vColor; varying float vAlpha;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          if (t.a * vAlpha < 0.01) discard;
          gl_FragColor = vec4(vColor, t.a * vAlpha);
        }
      `,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);

    for (let i = 0; i < MAX; i++) {
      this.particles.push({ life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, gravity: 0, size: 6, color: new THREE.Color(1, 1, 1) });
      this.alpha[i] = 0;
    }

    this.trail = this.makeTrail();
    this.lines = this.makeLines();
    this.trailId = 'trail.none';
  }

  makeTrail() {
    const N = 18;
    const positions = new Float32Array(N * 2 * 3);
    const idx = [];
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
      idx.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x9fe8ff, transparent: true, opacity: 0.5, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.scene.add(mesh);
    return { mesh, geo, N, pts: [] };
  }

  makeLines() {
    const N = 34;
    const positions = new Float32Array(N * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xd9f4ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.LineSegments(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    this.scene.add(mesh);
    const seeds = [];
    for (let i = 0; i < N; i++) {
      seeds.push({
        x: (Math.random() - 0.5) * 26,
        y: (Math.random() - 0.5) * 16,
        z: 4 + Math.random() * 22,
        len: 2 + Math.random() * 4,
      });
    }
    return { mesh, geo, mat, seeds };
  }

  setQuality(tier) {
    const q = QUALITY_TIERS[tier] || QUALITY_TIERS.high;
    this.tier = tier;
    this.max = Math.max(20, Math.floor(q.particles * (this.lowStim ? 0.5 : 1)));
    this.points.visible = this.max > 0;
    this.lines.mesh.visible = tier !== 'low' && !this.lowStim;
  }

  setLowStim(on) {
    this.lowStim = !!on;
    this.setQuality(this.tier || 'high');
  }

  setTrail(id) {
    this.trailId = id || 'trail.none';
    const def = TRAILS.find((t) => t.id === this.trailId) || TRAILS[0];
    this.trail.mesh.material.color.setHex(def.color);
    this.trail.mesh.visible = false;
    this.trail.pts.length = 0;
  }

  spawn(opts) {
    let slot = -1;
    for (let i = 0; i < this.max; i++) {
      if (this.particles[i].life <= 0) { slot = i; break; }
    }
    if (slot < 0) return;
    const p = this.particles[slot];
    p.life = opts.life;
    p.maxLife = opts.life;
    p.vx = opts.vx || 0;
    p.vy = opts.vy || 0;
    p.vz = opts.vz || 0;
    p.gravity = opts.gravity || 0;
    p.size = opts.size || 8;
    p.color.setHex(opts.color === undefined ? 0xffffff : opts.color);
    this.pos[slot * 3] = opts.x;
    this.pos[slot * 3 + 1] = opts.y;
    this.pos[slot * 3 + 2] = opts.z;
    this.col[slot * 3] = p.color.r;
    this.col[slot * 3 + 1] = p.color.g;
    this.col[slot * 3 + 2] = p.color.b;
    this.size[slot] = p.size;
    this.alpha[slot] = 1;
  }

  dust(pos, color = 0xcdbfae, n = 6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.6 + Math.random() * 1.8;
      this.spawn({
        x: pos.x + Math.cos(a) * 0.2, y: pos.y - 0.45, z: pos.z + Math.sin(a) * 0.2,
        vx: Math.cos(a) * s, vy: 0.8 + Math.random() * 1.4, vz: Math.sin(a) * s,
        gravity: 3.5, life: 0.45 + Math.random() * 0.25, size: 7 + Math.random() * 6, color,
      });
    }
  }

  burst(pos, color = 0xffd166, n = 10, speed = 4) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 0.8;
      const s = speed * (0.35 + Math.random() * 0.8);
      this.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: Math.cos(a) * s, vy: up * s + 1, vz: Math.sin(a) * s,
        gravity: 6, life: 0.45 + Math.random() * 0.45, size: 8 + Math.random() * 7, color,
      });
    }
  }

  ring(pos, color = 0x5ff2d0) {
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      this.spawn({
        x: pos.x + Math.cos(a) * 0.3, y: pos.y - 0.4, z: pos.z + Math.sin(a) * 0.3,
        vx: Math.cos(a) * 4.5, vy: 0.4, vz: Math.sin(a) * 4.5,
        gravity: 1, life: 0.32, size: 7, color,
      });
    }
  }

  confetti() {
    if (this.lowStim) return;
    const colors = [0xffd166, 0xff6f8f, 0x5ff2d0, 0x9fe8ff, 0xffffff];
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 3 + Math.random() * 8;
      this.spawn({
        x: this.camera.position.x + (Math.random() - 0.5) * 8,
        y: this.camera.position.y + 2 + Math.random() * 4,
        z: this.camera.position.z + 3 + Math.random() * 12,
        vx: Math.cos(a) * s, vy: Math.random() * 3, vz: Math.sin(a) * s,
        gravity: 7, life: 1.4 + Math.random() * 1.2, size: 9 + Math.random() * 7,
        color: colors[i % colors.length],
      });
    }
  }

  updateTrail(pos, speed) {
    const tr = this.trail;
    const def = TRAILS.find((t) => t.id === this.trailId);
    if (!def || def.id === 'trail.none' || speed < 7.2) {
      tr.mesh.visible = false;
      tr.pts.length = 0;
      return;
    }
    const last = tr.pts[0];
    if (!last || Math.hypot(last.x - pos.x, last.z - pos.z) > 0.22) {
      tr.pts.unshift({ x: pos.x, y: pos.y, z: pos.z });
      if (tr.pts.length > tr.N) tr.pts.pop();
    }
    if (tr.pts.length < 4) { tr.mesh.visible = false; return; }
    tr.mesh.visible = true;
    const arr = tr.geo.attributes.position.array;
    for (let i = 0; i < tr.N; i++) {
      const p = tr.pts[Math.min(i, tr.pts.length - 1)];
      const t = i / (tr.N - 1);
      const w = 0.12 * (1 - t) + 0.02;
      const k = i * 6;
      arr[k] = p.x - w; arr[k + 1] = p.y + 0.12; arr[k + 2] = p.z;
      arr[k + 3] = p.x + w; arr[k + 4] = p.y + 0.12; arr[k + 5] = p.z;
    }
    tr.geo.attributes.position.needsUpdate = true;
    tr.mesh.material.opacity = 0.55 * Math.min(1, (tr.pts.length / tr.N) * 1.6);
  }

  updateLines(camera, speed) {
    const ln = this.lines;
    if (!ln.mesh.visible) return;
    const on = Math.max(0, Math.min(0.35, (speed - 8) * 0.12));
    ln.mat.opacity = on;
    if (on <= 0) return;
    const arr = ln.geo.attributes.position.array;
    for (let i = 0; i < ln.seeds.length; i++) {
      const s = ln.seeds[i];
      s.z -= speed * 0.06;
      if (s.z < 2) s.z += 26;
      const x = camera.position.x + s.x;
      const y = camera.position.y + s.y;
      const z = camera.position.z + s.z;
      const k = i * 6;
      arr[k] = x; arr[k + 1] = y; arr[k + 2] = z;
      arr[k + 3] = x; arr[k + 4] = y; arr[k + 5] = z + s.len;
    }
    ln.geo.attributes.position.needsUpdate = true;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const p = this.particles[i];
      if (p.life <= 0) { this.alpha[i] = 0; continue; }
      p.life -= dt;
      const k = i * 3;
      p.vy -= p.gravity * dt;
      this.pos[k] += p.vx * dt;
      this.pos[k + 1] += p.vy * dt;
      this.pos[k + 2] += p.vz * dt;
      const a = Math.max(0, p.life / p.maxLife);
      this.alpha[i] = a * a;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }
}
