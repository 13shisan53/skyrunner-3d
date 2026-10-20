import * as THREE from 'three';
import { CFG, clamp, damp } from './config.js';

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0.30;
    this.yawOffset = 0;
    this.hold = 0;
    this.distance = 7.6;
    this.fov = 58;
    this.shakeAmt = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.initialized = false;
  }

  isPortrait() {
    return window.innerHeight > window.innerWidth * 1.05;
  }

  reset(player) {
    this.yaw = 0;
    this.yawOffset = 0;
    this.hold = 0;
    this.pitch = this.isPortrait() ? 0.38 : 0.30;
    this.distance = this.isPortrait() ? 9.6 : 7.6;
    this.fov = 58;
    this.shakeAmt = 0;
    this.compute(player, 1);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
    this.initialized = true;
  }

  look(dx, dy) {
    this.yawOffset = clamp(this.yawOffset - dx * 0.005, -0.35, 0.35);
    this.pitch = clamp(this.pitch - dy * 0.004, 0.14, 0.56);
    this.hold = 1.2;
  }

  compute(player, dt) {
    const portrait = this.isPortrait();
    this.distance = damp(this.distance, portrait ? 9.6 : 7.6, 4, dt);
    const targetY = portrait ? 0.55 : 0.95;
    this.target.set(player.pos.x, player.pos.y + targetY, player.pos.z);
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const yaw = this.yaw + this.yawOffset;
    this.pos.set(
      this.target.x + Math.sin(yaw) * cp * this.distance,
      this.target.y + sp * this.distance,
      this.target.z - Math.cos(yaw) * cp * this.distance
    );
    this.look.set(this.target.x, this.target.y + 0.1, this.target.z + 4.2);
  }

  update(dt, player, opts = {}) {
    if (this.hold > 0) this.hold -= dt;
    else this.yawOffset = damp(this.yawOffset, 0, 2.2, dt);

    this.compute(player, dt);
    if (!this.initialized) {
      this.camera.position.copy(this.pos);
      this.look.copy(this.target);
      this.initialized = true;
    } else {
      this.camera.position.x = damp(this.camera.position.x, this.pos.x, 8.5, dt);
      this.camera.position.y = damp(this.camera.position.y, this.pos.y, 8.5, dt);
      this.camera.position.z = damp(this.camera.position.z, this.pos.z, 8.5, dt);
    }

    const speed = clamp((opts.speed || 0) / CFG.speedMax, 0, 1);
    const targetFov = 58 + speed * 8;
    this.fov = damp(this.fov, targetFov, 3, dt);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();

    if (!this.lookTarget) this.lookTarget = new THREE.Vector3().copy(this.look);
    this.lookTarget.lerp(this.look, 1 - Math.exp(-12 * dt));

    if (this.shakeAmt > 0) {
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.2);
      const s = this.shakeAmt * 0.12;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.lookTarget);
  }

  shake(amount) {
    this.shakeAmt = Math.min(0.5, Math.max(this.shakeAmt, amount));
  }
}
