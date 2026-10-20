import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CFG, SEG, BIOMES, QUALITY_TIERS } from './config.js';
import { Course } from './gen.js';

const PALETTE = [0xff8a80, 0xffd166, 0x7bd389, 0x66c7f4, 0x9d78ff, 0xff8a3d, 0x1fc9b4];

function ringEmblem() {
  return new THREE.RingGeometry(0.17, 0.27, 22);
}
function squareEmblem() {
  return new THREE.PlaneGeometry(0.28, 0.28);
}
function triangleEmblem() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.18);
  s.lineTo(-0.16, -0.12);
  s.lineTo(0.16, -0.12);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

export class World {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.skyUniforms = opts.skyUniforms || null;
    this.sun = opts.sun || null;
    this.hemi = opts.hemi || null;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.root.visible = false;

    this.colliders = [];
    this.platforms = [];
    this.coins = [];
    this.drones = [];
    this.shields = [];
    this.course = null;
    this.seed = 1;
    this.time = 0;
    this.biome = 0;
    this.biomeT = 1;
    this.biomeFrom = null;
    this.biomeTo = null;
    this.biomeLock = null;
    this.quality = 'high';

    this.geo = new Map();
    this.mat = new Map();
    this.emblemMats = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false });
    this.emblemGeos = [ringEmblem(), triangleEmblem(), squareEmblem()];
    this.coinGeo = new THREE.TorusGeometry(0.26, 0.085, 8, 18);
    this.coinMat = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xff9d2e, emissiveIntensity: 1.2, roughness: 0.24, metalness: 0.75 });
    this.droneBodyMat = new THREE.MeshStandardMaterial({ color: 0x5b4b8a, roughness: 0.45, metalness: 0.35 });
    this.droneEyeMat = new THREE.MeshStandardMaterial({ color: 0xff5d6c, emissive: 0xff2d44, emissiveIntensity: 2.2, roughness: 0.35 });
    this.droneRingMat = new THREE.MeshStandardMaterial({ color: 0xff8fa8, emissive: 0xff5d7c, emissiveIntensity: 1.0, roughness: 0.5 });
    this.droneRotorMat = new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.28, depthWrite: false });
    this.shieldMat = new THREE.MeshStandardMaterial({ color: 0x8dfff0, emissive: 0x2fc9c9, emissiveIntensity: 1.2, transparent: true, opacity: 0.22, roughness: 0.2, side: THREE.DoubleSide });
    this.shieldRingMat = new THREE.MeshBasicMaterial({ color: 0x9ffff0, transparent: true, opacity: 0.55, depthWrite: false });

    this.rockGeo = new THREE.ConeGeometry(0.9, 1.8, 6);
    this.rockMat = new THREE.MeshStandardMaterial({ color: 0x4a3b54, roughness: 0.9, flatShading: true });

    this.scenery = new THREE.Group();
    scene.add(this.scenery);
    this.cloudLayers = [];
    this.cloudMats = [];
    this.islands = [];
    this.islandMesh = null;
    this.capMesh = null;
    this.stars = null;
    this.sea = null;
    this.starTarget = 0;
    this.buildScenery();
  }

  buildScenery() {
    const cloudCanvas = document.createElement('canvas');
    cloudCanvas.width = cloudCanvas.height = 128;
    const cg = cloudCanvas.getContext('2d');
    for (let i = 0; i < 7; i++) {
      const x = 28 + Math.random() * 72;
      const y = 38 + Math.random() * 52;
      const r = 18 + Math.random() * 30;
      const grad = cg.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,.95)');
      grad.addColorStop(0.55, 'rgba(255,255,255,.35)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      cg.fillStyle = grad;
      cg.fillRect(0, 0, 128, 128);
    }
    const cloudTex = new THREE.CanvasTexture(cloudCanvas);

    const layers = [
      { count: 14, yMin: 24, yMax: 40, sMin: 32, sMax: 58, aMin: 0.1, aMax: 0.18, zMin: 40, zMax: 300, tint: 0xffe3d0 },
      { count: 12, yMin: 44, yMax: 66, sMin: 45, sMax: 85, aMin: 0.07, aMax: 0.13, zMin: 70, zMax: 330, tint: 0xcfe6ff },
      { count: 8, yMin: 66, yMax: 92, sMin: 60, sMax: 110, aMin: 0.04, aMax: 0.09, zMin: 100, zMax: 360, tint: 0xa8c8f0 },
      { count: 18, yMin: -18, yMax: -7, sMin: 90, sMax: 170, aMin: 0.28, aMax: 0.5, zMin: 10, zMax: 300, tint: 0xffffff },
      { count: 16, yMin: -7, yMax: -1, sMin: 70, sMax: 140, aMin: 0.16, aMax: 0.28, zMin: 20, zMax: 280, tint: 0xfff0e0 },
      { count: 12, yMin: 2, yMax: 12, sMin: 55, sMax: 100, aMin: 0.12, aMax: 0.22, zMin: 20, zMax: 200, tint: 0xfff4e4, side: true },
    ];
    for (const layer of layers) {
      const geo = new THREE.BufferGeometry();
      const n = layer.count;
      const pos = new Float32Array(n * 3);
      const size = new Float32Array(n);
      const alpha = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = layer.side
          ? (i % 2 ? 1 : -1) * (40 + Math.random() * 100)
          : (Math.random() - 0.5) * 280;
        pos[i * 3 + 1] = layer.yMin + Math.random() * (layer.yMax - layer.yMin);
        pos[i * 3 + 2] = layer.zMin + Math.random() * (layer.zMax - layer.zMin);
        size[i] = layer.sMin + Math.random() * (layer.sMax - layer.sMin);
        alpha[i] = layer.aMin + Math.random() * (layer.aMax - layer.aMin);
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
      geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { map: { value: cloudTex }, color: { value: new THREE.Color(layer.tint) } },
        vertexShader: `
          attribute float aSize; attribute float aAlpha; varying float vAlpha;
          void main() {
            vAlpha = aAlpha;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aSize * clamp(130.0 / max(1.0, -mv.z), 0.3, 2.4);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: `
          uniform sampler2D map; uniform vec3 color; varying float vAlpha;
          void main() {
            vec4 t = texture2D(map, gl_PointCoord);
            if (t.a < 0.01) discard;
            gl_FragColor = vec4(color, t.a * vAlpha);
          }
        `,
      });
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      points.renderOrder = -2;
      this.scenery.add(points);
      this.cloudLayers.push({ points, geo, base: n });
      this.cloudMats.push(mat);
    }

    const coneGeo = new THREE.ConeGeometry(1, 1, 7);
    coneGeo.translate(0, -0.5, 0);
    const capGeo = new THREE.CylinderGeometry(1, 1.04, 0.18, 7);
    this.islandMesh = new THREE.InstancedMesh(coneGeo, new THREE.MeshStandardMaterial({ color: 0x4b3f5e, roughness: 0.95, flatShading: true }), 7);
    this.capMesh = new THREE.InstancedMesh(capGeo, new THREE.MeshStandardMaterial({ color: 0x4f8a67, roughness: 0.85, flatShading: true }), 7);
    this.capMesh.visible = false;
    this.islandMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.capMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.islandMesh.frustumCulled = false;
    this.capMesh.frustumCulled = false;
    this.scenery.add(this.islandMesh, this.capMesh);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i < 7; i++) {
      const x = (i % 2 ? 1 : -1) * (118 + Math.random() * 140);
      const z = 90 + Math.random() * 300;
      const r = 5 + Math.random() * 9;
      const h = 10 + Math.random() * 22;
      const baseY = -8 + Math.random() * 12;
      this.islands.push({ x, z, r, h, baseY, phase: Math.random() * 6 });
      p.set(x, baseY, z);
      q.identity();
      s.set(r, h, r);
      m.compose(p, q, s);
      this.islandMesh.setMatrixAt(i, m);
      p.set(x, baseY + 0.05, z);
      s.set(r * 1.02, 1, r * 1.02);
      m.compose(p, q, s);
      this.capMesh.setMatrixAt(i, m);
    }
    this.islandMesh.instanceMatrix.needsUpdate = true;
    this.capMesh.instanceMatrix.needsUpdate = true;

    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(280 * 3);
    for (let i = 0; i < 280; i++) {
      const a = Math.random() * Math.PI * 2;
      const y = 0.08 + Math.random() * 0.9;
      const r = Math.sqrt(Math.max(0, 1 - y * y)) * 300;
      starPos[i * 3] = Math.cos(a) * r;
      starPos[i * 3 + 1] = y * 300;
      starPos[i * 3 + 2] = Math.sin(a) * r;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xdcefff, size: 1.7, transparent: true, opacity: 0, depthWrite: false }));
    this.stars.frustumCulled = false;
    this.scenery.add(this.stars);

    const seaGeo = new THREE.PlaneGeometry(700, 700);
    const seaMat = new THREE.MeshBasicMaterial({ map: cloudTex, color: 0xdceaff, transparent: true, opacity: 0.24, depthWrite: false });
    seaMat.map.wrapS = seaMat.map.wrapT = THREE.RepeatWrapping;
    seaMat.map.repeat.set(6, 6);
    this.sea = new THREE.Mesh(seaGeo, seaMat);
    this.sea.rotation.x = -Math.PI / 2;
    this.sea.position.y = -21;
    this.scenery.add(this.sea);
  }

  geometry(w, h, d, r) {
    const key = `${w.toFixed(2)}|${h.toFixed(2)}|${d.toFixed(2)}|${r.toFixed(2)}`;
    if (!this.geo.has(key)) {
      if (this.geo.size > 160) this.geo.clear();
      this.geo.set(key, new RoundedBoxGeometry(w, h, d, 3, r));
    }
    return this.geo.get(key);
  }

  material(color, rough = 0.55, emissive = 0x000000, ei = 0) {
    const key = `${color}|${rough}|${emissive}|${ei}`;
    if (!this.mat.has(key)) {
      this.mat.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.04, emissive, emissiveIntensity: ei }));
    }
    return this.mat.get(key);
  }

  reset(seed = 1) {
    this.clear();
    this.seed = seed;
    this.course = new Course(seed);
    this.time = 0;
    this.biome = 0;
    this.biomeT = 1;
    this.biomeFrom = null;
    this.biomeTo = null;
    this.biomeLock = null;
    this.applyBiome(0, true);
    this.ensureAhead(0);
    this.root.visible = true;
  }

  clear() {
    this.root.clear();
    this.colliders.length = 0;
    this.platforms.length = 0;
    this.coins.length = 0;
    this.drones.length = 0;
    this.shields.length = 0;
    this.course = null;
  }

  setQuality(tier) {
    this.quality = tier;
    const budget = (QUALITY_TIERS[tier] || QUALITY_TIERS.high).clouds;
    const total = this.cloudLayers.reduce((a, l) => a + l.base, 0) || 1;
    for (const layer of this.cloudLayers) {
      const take = Math.min(layer.base, Math.max(3, Math.round((layer.base / total) * budget)));
      layer.geo.setDrawRange(0, take);
      layer.points.visible = budget > 0;
    }
  }

  get cloudCount() {
    return this.cloudLayers.reduce((sum, layer) => sum + Math.min(layer.base, layer.geo.drawRange.count), 0);
  }

  setVisible(visible) {
    this.root.visible = !!visible;
  }

  ensureAhead(z) {
    if (!this.course) return;
    const target = z + SEG.ahead;
    let guard = 0;
    while (this.course.nextZ + this.course.nextD / 2 < target && guard++ < 200) {
      this.spawn(this.course.next());
    }
  }

  spawn(seg) {
    const palette = BIOMES[seg.biome % BIOMES.length].palette;
    const color = palette[seg.index % palette.length] ?? PALETTE[seg.index % PALETTE.length];
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.geometry(seg.w, 1, seg.d, Math.min(0.32, seg.w * 0.12, seg.d * 0.12)), this.material(color, 0.58));
    body.position.y = -0.5;
    body.receiveShadow = true;
    g.add(body);
    const lighter = new THREE.Color(color).offsetHSL(0, -0.1, 0.14).getHex();
    const top = new THREE.Mesh(this.geometry(seg.w * 0.94, 0.14, seg.d * 0.94, 0.07), this.material(lighter, 0.45));
    top.position.y = 0.03;
    top.receiveShadow = true;
    g.add(top);
    const rim = new THREE.Mesh(
      this.geometry(seg.w * 0.9, 0.05, seg.d * 0.9, 0.025),
      this.material(lighter, 0.35, color, 0.25)
    );
    rim.position.y = 0.095;
    g.add(rim);
    const emblem = new THREE.Mesh(this.emblemGeos[seg.index % this.emblemGeos.length], this.emblemMats);
    emblem.rotation.x = -Math.PI / 2;
    emblem.position.y = 0.14;
    g.add(emblem);
    if (seg.index % 4 === 1 && seg.d > 4.5) {
      const rock = new THREE.Mesh(this.rockGeo, this.rockMat);
      rock.position.set(0, -1.7, 0);
      rock.rotation.z = Math.PI;
      g.add(rock);
    }
    g.position.set(seg.x, seg.y, seg.z);
    this.root.add(g);

    const collider = {
      min: { x: seg.x - seg.w / 2, y: seg.y - 1, z: seg.z - seg.d / 2 },
      max: { x: seg.x + seg.w / 2, y: seg.y, z: seg.z + seg.d / 2 },
    };
    this.colliders.push(collider);
    const platform = {
      z: seg.z, x: seg.x, w: seg.w, d: seg.d, y: seg.y,
      frontEdge: seg.frontEdge, backEdge: seg.backEdge, collider, group: g,
      phase: (seg.index % 7) * 0.7,
    };
    this.platforms.push(platform);

    for (const c of seg.coins) this.spawnCoin(c.x, c.y, c.z);
    for (const d of seg.drones) this.spawnDrone(d);
    if (seg.shield) this.spawnShield(seg.shield.x, seg.shield.y, seg.shield.z);
  }

  spawnCoin(x, y, z) {
    const mesh = new THREE.Mesh(this.coinGeo, this.coinMat);
    mesh.position.set(x, y, z);
    this.root.add(mesh);
    this.coins.push({ mesh, baseY: y, phase: Math.random() * 6, alive: true, magnet: 0 });
  }

  spawnDrone(d) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.46, 0), this.droneBodyMat);
    body.castShadow = true;
    g.add(body);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), this.droneEyeMat);
    eye.position.z = 0.32;
    g.add(eye);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.04, 8, 26), this.droneRingMat);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    const rotor = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.025, 0.07), this.droneRotorMat);
    const blade2 = blade.clone();
    blade2.rotation.y = Math.PI / 2;
    rotor.add(blade, blade2);
    rotor.position.y = 0.3;
    g.add(rotor);
    g.position.set(d.x, d.y, d.z);
    this.root.add(g);
    this.drones.push({
      group: g, base: new THREE.Vector3(d.x, d.y, d.z), axis: d.axis, range: d.range,
      speed: d.speed, t: Math.random() * 6, ring, rotor, alive: true, grazed: false, cooldown: 0,
    });
  }

  spawnShield(x, y, z) {
    const g = new THREE.Group();
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.48, 16, 12), this.shieldMat);
    g.add(bubble);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 8, 24), this.shieldRingMat);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    g.position.set(x, y, z);
    this.root.add(g);
    this.shields.push({ group: g, baseY: y, phase: Math.random() * 6, alive: true });
  }

  recycle(playerZ) {
    const cut = playerZ - SEG.behind;
    for (let i = this.platforms.length - 1; i >= 0; i--) {
      const p = this.platforms[i];
      if (p.z + p.d / 2 < cut) {
        this.root.remove(p.group);
        const ci = this.colliders.indexOf(p.collider);
        if (ci >= 0) this.colliders.splice(ci, 1);
        this.platforms.splice(i, 1);
      }
    }
    for (let i = this.coins.length - 1; i >= 0; i--) {
      if (this.coins[i].mesh.position.z < cut) {
        this.root.remove(this.coins[i].mesh);
        this.coins.splice(i, 1);
      }
    }
    for (let i = this.drones.length - 1; i >= 0; i--) {
      if (this.drones[i].base.z < cut) {
        this.root.remove(this.drones[i].group);
        this.drones.splice(i, 1);
      }
    }
    for (let i = this.shields.length - 1; i >= 0; i--) {
      if (this.shields[i].group.position.z < cut) {
        this.root.remove(this.shields[i].group);
        this.shields.splice(i, 1);
      }
    }
  }

  fixedUpdate(dt, player, events) {
    if (!this.course) return;
    this.time += dt;
    const px = player.pos.x, py = player.pos.y, pz = player.pos.z;

    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      if (!c.alive) continue;
      const dx = c.mesh.position.x - px, dy = c.mesh.position.y - py, dz = c.mesh.position.z - pz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 2.4 * 2.4) {
        c.magnet = Math.min(1, c.magnet + dt * 5);
        c.mesh.position.x += (px - c.mesh.position.x) * Math.min(1, dt * 6);
        c.mesh.position.z += (pz - c.mesh.position.z) * Math.min(1, dt * 6);
      }
      if (d2 < 1.15 * 1.15) {
        c.alive = false;
        const at = { x: c.mesh.position.x, y: c.mesh.position.y, z: c.mesh.position.z };
        this.root.remove(c.mesh);
        this.coins.splice(i, 1);
        events.push({ type: 'coin', ...at });
      }
    }

    for (let i = this.shields.length - 1; i >= 0; i--) {
      const s = this.shields[i];
      const dx = s.group.position.x - px, dy = s.group.position.y - py, dz = s.group.position.z - pz;
      if (dx * dx + dy * dy + dz * dz < 1.2 * 1.2) {
        this.root.remove(s.group);
        this.shields.splice(i, 1);
        events.push({ type: 'shield' });
      }
    }

    for (const d of this.drones) {
      if (!d.alive) continue;
      d.t += dt * d.speed;
      const p = d.group.position;
      p.x = d.base.x + Math.sin(d.t) * d.range;
      p.y = d.base.y + Math.sin(this.time * 1.8 + d.base.x) * 0.16;
      if (d.cooldown > 0) d.cooldown -= dt;

      const dx = p.x - px, dy = p.y - py, dz = p.z - pz;
      const dist2 = dx * dx + dy * dy + dz * dz;
      const touching = Math.abs(dx) < 0.9 && Math.abs(dy) < 0.95 && Math.abs(dz) < 0.9;
      if (touching && player.invuln <= 0 && d.cooldown <= 0) {
        if (player.vel.y < -2 && py > p.y + 0.2) {
          d.alive = false;
          this.root.remove(d.group);
          player.vel.y = 11;
          player.squash = 1.2;
          events.push({ type: 'stomp' });
        } else {
          d.cooldown = 1.0;
          events.push({ type: 'hit' });
        }
      } else if (!d.grazed && !touching && dist2 < CFG.grazeRadius * CFG.grazeRadius) {
        d.grazed = true;
        events.push({ type: 'graze' });
      }
    }

    this.recycle(pz);
    this.ensureAhead(pz);
    this.updateBiome(pz, events);
  }

  updateBiome(z, events) {
    if (this.biomeLock !== null) return;
    const next = Math.floor(Math.max(0, z) / 205) % BIOMES.length;
    if (next !== this.biome) {
      this.applyBiome(next, false);
      events.push({ type: 'biome', index: next });
    }
  }

  applyBiome(index, immediate) {
    const target = BIOMES[index % BIOMES.length];
    if (!target) return;
    this.starTarget = target.id === 'night' ? 0.95 : target.id === 'dusk' ? 0.3 : target.id === 'dawn' ? 0.05 : 0;
    for (const mat of this.cloudMats) mat.uniforms.color.value.setHex(target.skyBottom);
    const next = {
      top: new THREE.Color(target.skyTop),
      mid: new THREE.Color(target.skyMid),
      bottom: new THREE.Color(target.skyBottom),
      fog: new THREE.Color(target.fog),
      sun: new THREE.Color(target.sun),
      hemiSky: new THREE.Color(target.hemiSky),
      hemiGround: new THREE.Color(target.hemiGround),
      density: target.fogDensity,
      intensity: target.sunIntensity,
      star: target.id === 'night' ? 1 : 0,
    };
    if (immediate || !this.skyUniforms) {
      this.biome = index % BIOMES.length;
      this.biomeT = 1;
      this.biomeFrom = null;
      this.biomeTo = null;
      if (this.skyUniforms) {
        this.skyUniforms.top.value.copy(next.top);
        this.skyUniforms.mid.value.copy(next.mid);
        this.skyUniforms.bottom.value.copy(next.bottom);
        this.skyUniforms.sunColor.value.copy(next.sun);
        this.skyUniforms.starAmt.value = next.star;
      }
      if (this.scene.fog) {
        this.scene.fog.color.copy(next.fog);
        this.scene.fog.density = next.density;
      }
      if (this.sun) { this.sun.color.copy(next.sun); this.sun.intensity = next.intensity; }
      if (this.hemi) { this.hemi.color.copy(next.hemiSky); this.hemi.groundColor.copy(next.hemiGround); }
      return;
    }
    this.biome = index % BIOMES.length;
    this.biomeFrom = {
      top: this.skyUniforms.top.value.clone(), mid: this.skyUniforms.mid.value.clone(),
      bottom: this.skyUniforms.bottom.value.clone(), fog: this.scene.fog.color.clone(),
      sun: this.sun ? this.sun.color.clone() : new THREE.Color(),
      density: this.scene.fog.density, intensity: this.sun ? this.sun.intensity : 1,
      star: this.skyUniforms.starAmt.value,
    };
    this.biomeTo = next;
    this.biomeT = 0;
  }

  updateScenery(dt, time, player, camera) {
    for (const layer of this.cloudLayers) {
      const pos = layer.geo.attributes.position;
      for (let i = 0; i < layer.base; i++) {
        let x = pos.getX(i) + dt * 0.55;
        let z = pos.getZ(i);
        if (x > 150) x -= 300;
        if (z < player.pos.z - 100) z += 360;
        else if (z > player.pos.z + 280) z -= 360;
        pos.setX(i, x);
        pos.setZ(i, z);
      }
      pos.needsUpdate = true;
    }

    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const m = new THREE.Matrix4();
    for (let i = 0; i < this.islands.length; i++) {
      const island = this.islands[i];
      if (island.z < player.pos.z - 170) {
        island.z += 330;
        island.x = (i % 2 ? 1 : -1) * (118 + Math.random() * 140);
        island.baseY = -8 + Math.random() * 12;
        island.r = 5 + Math.random() * 9;
        island.h = 10 + Math.random() * 22;
      }
      p.set(island.x, island.baseY + Math.sin(time * 0.2 + island.phase) * 0.8, island.z);
      q.identity();
      s.set(island.r, island.h, island.r);
      m.compose(p, q, s);
      this.islandMesh.setMatrixAt(i, m);
      p.set(island.x, island.baseY + 0.05 + Math.sin(time * 0.2 + island.phase) * 0.8, island.z);
      s.set(island.r * 1.02, 1, island.r * 1.02);
      m.compose(p, q, s);
      this.capMesh.setMatrixAt(i, m);
    }
    this.islandMesh.instanceMatrix.needsUpdate = true;
    this.capMesh.instanceMatrix.needsUpdate = true;

    if (this.stars) {
      this.stars.position.set(player.pos.x, 0, player.pos.z);
      const mat = this.stars.material;
      mat.opacity += (this.starTarget - mat.opacity) * Math.min(1, dt * 1.4);
    }
    if (this.sea) this.sea.position.set(player.pos.x, -21, player.pos.z);
    if (camera) this.scenery.position.set(0, 0, 0);
  }

  render(dt, time, alpha, player, camera) {
    if (!this.root.visible) {
      this.updateScenery(dt, time, player, camera);
      return;
    }
    this.updateScenery(dt, time, player, camera);
    for (const p of this.platforms) {
      p.group.position.y = p.y + Math.sin(time * 1.1 + p.phase) * 0.02;
    }
    for (const c of this.coins) {
      c.mesh.rotation.y += dt * 3;
      const base = c.baseY + Math.sin(time * 2.4 + c.phase) * 0.1;
      c.mesh.position.y = c.magnet > 0 ? c.mesh.position.y : base;
    }
    for (const d of this.drones) {
      if (!d.alive) continue;
      d.ring.rotation.z += dt * 2.6;
      d.rotor.rotation.y += dt * 9;
    }
    for (const s of this.shields) {
      s.group.rotation.y += dt * 0.8;
      s.group.position.y = s.baseY + Math.sin(time * 2 + s.phase) * 0.12;
    }
    if (this.biomeT < 1 && this.biomeTo) {
      this.biomeT = Math.min(1, this.biomeT + dt / 2.5);
      const t = this.biomeT;
      const f = this.biomeFrom, to = this.biomeTo;
      this.skyUniforms.top.value.lerpColors(f.top, to.top, t);
      this.skyUniforms.mid.value.lerpColors(f.mid, to.mid, t);
      this.skyUniforms.bottom.value.lerpColors(f.bottom, to.bottom, t);
      this.skyUniforms.sunColor.value.lerpColors(f.sun, to.sun, t);
      this.skyUniforms.starAmt.value = f.star + (to.star - f.star) * t;
      this.scene.fog.color.lerpColors(f.fog, to.fog, t);
      this.scene.fog.density = f.density + (to.density - f.density) * t;
      if (this.sun) { this.sun.color.lerpColors(f.sun, to.sun, t); this.sun.intensity = f.intensity + (to.intensity - f.intensity) * t; }
    }
  }

  groundYAt(x, z) {
    let best = -Infinity;
    for (const c of this.colliders) {
      if (x > c.min.x - 0.25 && x < c.max.x + 0.25 && z > c.min.z - 0.25 && z < c.max.z + 0.25) {
        if (c.max.y > best) best = c.max.y;
      }
    }
    return best;
  }

  platformAt(x, z) {
    for (const p of this.platforms) {
      if (x > p.collider.min.x - 0.2 && x < p.collider.max.x + 0.2 &&
          z > p.collider.min.z - 0.2 && z < p.collider.max.z + 0.2) return p;
    }
    return null;
  }
}
