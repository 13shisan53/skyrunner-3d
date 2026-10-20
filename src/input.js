import { clamp } from './config.js';

export class Input {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.cb = callbacks;
    this.keys = Object.create(null);
    this.state = {
      steer: 0,
      jumpPressed: false,
      jumpHeld: false,
      lookX: 0,
      lookY: 0,
    };
    this.stick = { active: false, x: 0, pointerId: null };
    this.drag = { active: false, id: null, lastX: 0, lastY: 0 };
    this.enabled = true;
    this.attached = false;
    this.stickEl = document.getElementById('stick');
    this.knobEl = document.getElementById('knob');
    this.jumpEl = document.getElementById('jump');
  }

  attach() {
    if (this.attached) return;
    this.attached = true;
    this.onKeyDown = (e) => this.keyDown(e);
    this.onKeyUp = (e) => this.keyUp(e);
    this.onBlur = () => { this.clear(); if (this.cb.onBlur) this.cb.onBlur(); };
    this.onVisibility = () => { if (document.hidden) this.onBlur(); };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.bindTouch();
  }

  detach() {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  keyDown(e) {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.keys[e.code] = true;
    if (e.code === 'Space') {
      this.state.jumpPressed = true;
      this.state.jumpHeld = true;
    }
    if (e.code === 'Escape' && this.cb.onPause) this.cb.onPause();
    if (e.code === 'KeyR' && this.cb.onRestart) this.cb.onRestart();
    if (e.code === 'KeyM' && this.cb.onMute) this.cb.onMute();
  }

  keyUp(e) {
    this.keys[e.code] = false;
    if (e.code === 'Space') this.state.jumpHeld = false;
  }

  bindTouch() {
    if (!this.stickEl) return;
    const setStick = (e) => {
      const r = this.stickEl.getBoundingClientRect();
      const ox = r.left + r.width / 2;
      const oy = r.top + r.height / 2;
      const dx = e.clientX - ox;
      const dy = e.clientY - oy;
      const len = Math.hypot(dx, dy) || 1;
      const max = r.width * 0.34;
      const nx = clamp((dx / len) * Math.min(len, max), -max, max);
      const ny = clamp((dy / len) * Math.min(len, max), -max, max);
      if (this.knobEl) this.knobEl.style.transform = `translate(${nx}px, ${ny}px)`;
      this.stick.x = clamp(nx / max, -1, 1);
    };
    this.stickEl.addEventListener('pointerdown', (e) => {
      this.stick.pointerId = e.pointerId;
      this.stick.active = true;
      try { this.stickEl.setPointerCapture(e.pointerId); } catch {}
      setStick(e);
      e.preventDefault();
    });
    this.stickEl.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stick.pointerId) return;
      setStick(e);
      e.preventDefault();
    });
    const endStick = (e) => {
      if (e.pointerId !== this.stick.pointerId) return;
      this.stick.active = false;
      this.stick.pointerId = null;
      this.stick.x = 0;
      if (this.knobEl) this.knobEl.style.transform = 'translate(0px, 0px)';
    };
    this.stickEl.addEventListener('pointerup', endStick);
    this.stickEl.addEventListener('pointercancel', endStick);

    if (this.jumpEl) {
      this.jumpEl.addEventListener('pointerdown', (e) => {
        this.state.jumpPressed = true;
        this.state.jumpHeld = true;
        this.jumpEl.classList.add('down');
        try { this.jumpEl.setPointerCapture(e.pointerId); } catch {}
        e.preventDefault();
      });
      const up = () => {
        this.state.jumpHeld = false;
        this.jumpEl.classList.remove('down');
      };
      this.jumpEl.addEventListener('pointerup', up);
      this.jumpEl.addEventListener('pointercancel', up);
      this.jumpEl.addEventListener('pointerleave', up);
    }

    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.target !== this.canvas) return;
      this.drag.active = true;
      this.drag.id = e.pointerId;
      this.drag.lastX = e.clientX;
      this.drag.lastY = e.clientY;
      try { this.canvas.setPointerCapture(e.pointerId); } catch {}
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.drag.active || e.pointerId !== this.drag.id) return;
      this.state.lookX += e.clientX - this.drag.lastX;
      this.state.lookY += e.clientY - this.drag.lastY;
      this.drag.lastX = e.clientX;
      this.drag.lastY = e.clientY;
    });
    const endDrag = (e) => {
      if (e.pointerId !== this.drag.id) return;
      this.drag.active = false;
      this.drag.id = null;
    };
    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', endDrag);
  }

  update() {
    if (!this.enabled) { this.state.steer = 0; return; }
    let x = 0;
    if (this.keys.KeyA || this.keys.ArrowLeft) x -= 1;
    if (this.keys.KeyD || this.keys.ArrowRight) x += 1;
    if (this.stick.active) x += this.stick.x;
    this.state.steer = clamp(x, -1, 1);
  }

  consumeJump() {
    const pressed = this.state.jumpPressed;
    this.state.jumpPressed = false;
    return pressed;
  }

  consumeLook() {
    const out = { x: this.state.lookX, y: this.state.lookY };
    this.state.lookX = 0;
    this.state.lookY = 0;
    return out;
  }

  clear() {
    for (const k of Object.keys(this.keys)) this.keys[k] = false;
    this.state.steer = 0;
    this.state.jumpPressed = false;
    this.state.jumpHeld = false;
    this.state.lookX = 0;
    this.state.lookY = 0;
    this.stick.active = false;
    this.stick.x = 0;
    this.stick.pointerId = null;
    if (this.knobEl) this.knobEl.style.transform = 'translate(0px, 0px)';
    if (this.jumpEl) this.jumpEl.classList.remove('down');
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (!on) this.clear();
  }
}
