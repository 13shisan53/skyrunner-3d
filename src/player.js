import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CFG } from './config.js';
import { stepBody } from './physics.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));

function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.52)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.2)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.pos = new THREE.Vector3(0, CFG.halfH + 0.05, 0);
    this.prev = new THREE.Vector3().copy(this.pos);
    this.vel = new THREE.Vector3();
    this.grounded = false;
    this.coyote = 0;
    this.buffer = 0;
    this.facing = 0;
    this.squash = 1;
    this.lean = 0;
    this.speed = CFG.speedStart;
    this.airTime = 0;
    this.edgeLatch = false;
    this.shield = false;
    this.invuln = 0;
    this.dead = false;
    this.blinkOffset = Math.random() * 4;
    this.time = 0;

    this.rig = new THREE.Group();
    scene.add(this.rig);
    this.buildRig();
    this.buildBlob();
  }

  buildRig() {
    const skin = new THREE.MeshStandardMaterial({ color: 0xfff4e2, roughness: 0.68 });
    const suit = new THREE.MeshStandardMaterial({ color: 0x2fbfa6, roughness: 0.45 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1d8d7c, roughness: 0.5 });
    const scarf = new THREE.MeshStandardMaterial({ color: 0xff7a8a, roughness: 0.72, side: THREE.DoubleSide });
    const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const eyeBlack = new THREE.MeshStandardMaterial({ color: 0x1a1f2b, roughness: 0.25 });
    const cheek = new THREE.MeshStandardMaterial({ color: 0xff9db0, roughness: 0.7 });
    const bulb = new THREE.MeshStandardMaterial({ color: 0xfff6c9, emissive: 0xffd166, emissiveIntensity: 1.5, roughness: 0.3 });
    this.mat = { skin, suit, dark, scarf, eyeWhite, eyeBlack, cheek, bulb };

    const torso = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.58, 0.5, 4, 0.16), suit);
    torso.position.y = -0.06;
    torso.castShadow = true;
    this.rig.add(torso);
    this.torso = torso;

    const belly = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.28, 0.08, 3, 0.05), skin);
    belly.position.set(0, -0.1, 0.25);
    this.rig.add(belly);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 18), skin);
    head.position.y = 0.54;
    head.castShadow = true;
    this.rig.add(head);
    this.head = head;

    this.eyes = [];
    for (const sx of [-1, 1]) {
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.108, 14, 14), eyeWhite);
      white.position.set(sx * 0.145, 0.58, 0.35);
      this.rig.add(white);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 12), eyeBlack);
      pupil.position.set(sx * 0.15, 0.575, 0.43);
      this.rig.add(pupil);
      const ch = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 10), cheek);
      ch.position.set(sx * 0.28, 0.45, 0.31);
      this.rig.add(ch);
      this.eyes.push({ white, pupil, baseX: sx * 0.15 });
    }

    this.antenna = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 6), dark);
    rod.position.y = 0.98;
    this.antenna.add(rod);
    this.bulb = new THREE.Mesh(new THREE.SphereGeometry(0.078, 12, 12), bulb);
    this.bulb.position.y = 1.12;
    this.antenna.add(this.bulb);
    this.rig.add(this.antenna);

    this.arms = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.35, 0.14, 0);
      const arm = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.36, 0.17, 3, 0.07), dark);
      arm.position.y = -0.17;
      arm.castShadow = true;
      pivot.add(arm);
      this.rig.add(pivot);
      this.arms.push(pivot);
    }

    this.legs = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.17, -0.34, 0);
      const leg = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.26, 0.3, 3, 0.09), dark);
      leg.position.set(0, -0.11, 0.05);
      leg.castShadow = true;
      pivot.add(leg);
      this.rig.add(pivot);
      this.legs.push(pivot);
    }

    // scarf ribbon
    const N = 10;
    this.scarfN = N;
    const pos = new Float32Array(N * 2 * 3);
    const idx = [];
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
      idx.push(a, b, c, b, d, c);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geom.setIndex(idx);
    this.scarfGeom = geom;
    this.scarf = new THREE.Mesh(geom, scarf);
    this.scarf.frustumCulled = false;
    this.rig.add(this.scarf);

    this.goggles = new THREE.Group();
    for (const sx of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.022, 8, 18), new THREE.MeshStandardMaterial({ color: 0x2c3b57, roughness: 0.4, metalness: 0.5 }));
      ring.position.set(sx * 0.145, 0.58, 0.45);
      this.goggles.add(ring);
    }
    this.goggles.visible = false;
    this.rig.add(this.goggles);

    this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.028, 8, 28), new THREE.MeshStandardMaterial({ color: 0xfff2a8, emissive: 0xffd166, emissiveIntensity: 1.6, roughness: 0.3 }));
    this.halo.rotation.x = Math.PI / 2;
    this.halo.position.y = 1.02;
    this.halo.visible = false;
    this.rig.add(this.halo);

    this.crown = new THREE.Group();
    const gold = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x9a6b12, emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.4 });
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 5), gold);
      cone.position.set((i - 1) * 0.13, 1.02, 0);
      this.crown.add(cone);
    }
    this.crown.visible = false;
    this.rig.add(this.crown);

    this.setCharacter({ color: 0x2fbfa6, suit: 0x1d8d7c, scarf: 0xff7a8a, accessory: 'antenna' });
  }

  buildBlob() {
    this.blob = new THREE.Mesh(
      new THREE.PlaneGeometry(1.35, 1.35),
      new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.8 })
    );
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.renderOrder = 2;
    this.scene.add(this.blob);
  }

  setCharacter(def) {
    if (!def) return;
    this.character = def;
    this.mat.suit.color.setHex(def.color);
    this.mat.dark.color.setHex(def.suit);
    this.mat.scarf.color.setHex(def.scarf);
    this.antenna.visible = def.accessory === 'antenna';
    this.goggles.visible = def.accessory === 'goggles';
    this.halo.visible = def.accessory === 'halo';
    this.crown.visible = def.accessory === 'crown';
  }

  reset({ x = 0, y = CFG.halfH + 0.05, z = 0 } = {}) {
    this.pos.set(x, y, z);
    this.prev.copy(this.pos);
    this.vel.set(0, 0, 0);
    this.grounded = false;
    this.coyote = 0;
    this.buffer = 0;
    this.facing = 0;
    this.squash = 1;
    this.lean = 0;
    this.airTime = 0;
    this.edgeLatch = false;
    this.shield = false;
    this.invuln = 0;
    this.dead = false;
    this.speed = CFG.speedStart;
    this.rig.visible = true;
  }

  grantShield() {
    this.shield = true;
    this.invuln = 0.2;
  }

  hit() {
    if (this.invuln > 0) return 'ignore';
    if (this.shield) {
      this.shield = false;
      this.invuln = 0.8;
      return 'shield';
    }
    this.invuln = 0.9;
    return 'hit';
  }

  update(dt, input, world, events) {
    this.time += dt;
    this.squash = damp(this.squash, 1, 10, dt);
    this.lean = damp(this.lean, (input.steer || 0) * 0.12, 10, dt);
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);

    const steer = clamp(input.steer || 0, -1, 1);
    const accel = this.grounded ? CFG.steerAccelGround : CFG.steerAccelAir;
    const targetX = steer * CFG.steerMax;

    if (Math.abs(this.vel.x - targetX) > 0.01) {
      const step = accel * dt;
      this.vel.x += clamp(targetX - this.vel.x, -step, step);
    }

    const targetZ = this.speed;
    const fstep = (this.grounded ? CFG.groundAccel : CFG.steerAccelAir) * dt;
    this.vel.z += clamp(targetZ - this.vel.z, -fstep, fstep);

    if (input.jumpPressed) {
      this.buffer = CFG.buffer;
      input.jumpPressed = false;
    }
    this.buffer = Math.max(0, this.buffer - dt);

    if (this.grounded) this.coyote = CFG.coyote;
    else this.coyote = Math.max(0, this.coyote - dt);

    if (this.buffer > 0 && this.coyote > 0) {
      this.vel.y = CFG.jumpSpeed;
      this.grounded = false;
      this.coyote = 0;
      this.buffer = 0;
      this.squash = 1.18;
      this.edgeLatch = false;
      events.push({ type: 'jump' });
    }

    if (!input.jumpHeld && this.vel.y > 0) {
      this.vel.y -= CFG.jumpSpeed * CFG.jumpCut * dt * 9;
    }

    const g = this.vel.y < 0 ? CFG.fallGravity : CFG.gravity;
    this.vel.y -= g * dt;
    this.vel.y = Math.max(this.vel.y, -CFG.maxFall);

    if (!this.grounded) this.airTime += dt;
    const air = this.airTime;
    const body = { pos: this.pos, vel: this.vel, grounded: this.grounded };
    const ev = stepBody(body, world.colliders, dt, { radius: CFG.radius, halfH: CFG.halfH, forgiving: CFG.edgeForgiveness });
    this.grounded = body.grounded;

    if (ev.landed) {
      this.airTime = 0;
      this.squash = clamp(1 - ev.impact * 0.025, 0.72, 1.06);
      events.push({ type: 'land', impact: ev.impact });
      if (air > CFG.edgeMinAirtime && !this.edgeLatch && world.platformAt) {
        const p = world.platformAt(this.pos.x, this.pos.z);
        if (p && p.d > CFG.edgeMinDepth) {
          const dist = p.frontEdge - this.pos.z;
          if (dist >= 0 && dist < CFG.edgeWindow) {
            this.edgeLatch = true;
            events.push({ type: 'edge', distance: dist });
          }
        }
      }
    }

    this.speed = clamp(this.speed, CFG.speedStart, CFG.speedMax);
    const planar = Math.hypot(this.vel.x, this.vel.z);
    if (planar > 0.4) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      let d = target - this.facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.facing += d * Math.min(1, dt * 12);
    }

    if (this.pos.y < CFG.deathY && !this.dead) {
      this.dead = true;
      events.push({ type: 'fall' });
    }
  }

  setVisual(alpha, time, speed, world, dt) {
    const p = this.rig.position;
    p.lerpVectors(this.prev, this.pos, clamp(alpha, 0, 1));
    this.rig.rotation.y = damp(this.rig.rotation.y, this.facing, 16, dt);
    this.rig.rotation.z = damp(this.rig.rotation.z, -this.lean, 12, dt);
    const sq = this.squash;
    this.rig.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));

    const planSpeed = Math.hypot(this.vel.x, this.vel.z);
    const swing = this.grounded ? Math.sin(time * 13) * Math.min(1, planSpeed / 5.5) : 0.85;
    this.arms[0].rotation.x = swing * 0.9;
    this.arms[1].rotation.x = -swing * 0.9;
    this.legs[0].rotation.x = -swing * 0.75;
    this.legs[1].rotation.x = swing * 0.75;
    if (!this.grounded) {
      this.arms[0].rotation.z = 0.5;
      this.arms[1].rotation.z = -0.5;
      this.legs[0].rotation.x = -0.55;
      this.legs[1].rotation.x = 0.45;
    } else {
      this.arms[0].rotation.z = damp(this.arms[0].rotation.z, 0, 12, dt);
      this.arms[1].rotation.z = damp(this.arms[1].rotation.z, 0, 12, dt);
    }

    this.mat.bulb.emissiveIntensity = 1.3 + Math.sin(time * 5) * 0.35;
    this.head.position.y = 0.54 + Math.sin(time * 3) * 0.012;
    this.blinkOffset += 0;
    const phase = (time + this.blinkOffset) % 4.4;
    const blink = phase < 0.09 ? 0.12 : 1;
    for (const e of this.eyes) {
      e.white.scale.y = blink;
      e.pupil.scale.y = blink;
      e.pupil.position.x = e.baseX + clamp(this.vel.x / CFG.steerMax, -1, 1) * 0.022;
    }

    // scarf wave
    const arr = this.scarfGeom.attributes.position.array;
    for (let i = 0; i < this.scarfN; i++) {
      const t = i / (this.scarfN - 1);
      const z = -0.16 - t * 1.15;
      const wave = Math.sin(time * 7 - t * 4.2) * (0.035 + t * 0.06) * (0.4 + planSpeed / 10);
      const y = 0.36 - t * 0.1 + Math.sin(time * 5 - t * 3) * 0.02;
      const w = 0.075 + t * 0.02;
      const k = i * 6;
      arr[k] = -w + wave; arr[k + 1] = y; arr[k + 2] = z;
      arr[k + 3] = w + wave; arr[k + 4] = y; arr[k + 5] = z;
    }
    this.scarfGeom.attributes.position.needsUpdate = true;

    if (world && world.groundYAt) {
      const gy = world.groundYAt(this.pos.x, this.pos.z);
      if (Number.isFinite(gy)) {
        const h = Math.max(0, this.pos.y - CFG.halfH - gy);
        this.blob.visible = true;
        this.blob.position.set(this.pos.x, gy + 0.02, this.pos.z);
        this.blob.scale.setScalar(clamp(1 - h * 0.07, 0.4, 1));
        this.blob.material.opacity = clamp(0.8 - h * 0.075, 0.08, 0.8);
      } else {
        this.blob.visible = false;
      }
    }
  }
}
