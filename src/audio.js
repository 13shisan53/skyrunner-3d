// Procedural audio. No files: every tone and the music are synthesised here.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.music = null;
    this.muted = false;
    this.sound = true;
    this.musicOn = true;
    this.running = false;
    this.timer = null;
    this.intensity = 0;
    this._nextStep = 0;
    this._step = 0;
    this._bar = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.ctx;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      const delay = this.ctx.createDelay(1);
      delay.delayTime.value = 0.33;
      const fb = this.ctx.createGain();
      fb.gain.value = 0.24;
      const wet = this.ctx.createGain();
      wet.gain.value = 0.22;
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.85;
      this.musicBus.connect(this.master);
      this.musicBus.connect(delay);
      delay.connect(fb);
      fb.connect(delay);
      delay.connect(wet);
      wet.connect(this.master);
      return this.ctx;
    } catch {
      this.ctx = null;
      return null;
    }
  }

  tone(freq, dur, type = 'sine', gain = 0.05, slideTo = null, when = 0) {
    if (!this.ctx || this.muted || !this.sound) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }

  play(name, opts = {}) {
    if (!this.ctx || this.muted || !this.sound) return;
    switch (name) {
      case 'jump': this.tone(330, 0.16, 'triangle', 0.05, 640); break;
      case 'land': {
        const hard = Math.min(1, (opts.impact || 6) / 20);
        this.tone(130 + hard * 40, 0.1, 'sine', 0.035 + hard * 0.03, 80);
        break;
      }
      case 'coin': {
        const notes = [1046, 1175, 1318, 1568, 1760];
        const f = notes[Math.min(notes.length - 1, Math.floor((opts.streak || 0) / 6))];
        this.tone(f, 0.07, 'sine', 0.04);
        this.tone(f * 1.5, 0.11, 'sine', 0.03, null, 0.05);
        break;
      }
      case 'stomp': this.tone(220, 0.14, 'square', 0.035, 70); break;
      case 'shield': this.tone(660, 0.1, 'sine', 0.04, 1320); this.tone(990, 0.14, 'sine', 0.03, null, 0.06); break;
      case 'edge': this.tone(880, 0.1, 'triangle', 0.04, 1760); this.tone(1320, 0.2, 'sine', 0.035, null, 0.07); break;
      case 'graze': this.tone(1568, 0.06, 'sine', 0.02); break;
      case 'record': {
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.24, 'triangle', 0.04, null, i * 0.07));
        break;
      }
      case 'fall': this.tone(300, 0.55, 'sawtooth', 0.045, 55); break;
      case 'over': this.tone(392, 0.3, 'triangle', 0.04); this.tone(294, 0.42, 'triangle', 0.04, null, 0.16); break;
      case 'ui': this.tone(660, 0.05, 'sine', 0.025); break;
      case 'mission': this.tone(1046, 0.12, 'sine', 0.035); this.tone(1318, 0.2, 'sine', 0.03, null, 0.08); break;
      case 'unlock': [784, 988, 1175].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.035, null, i * 0.06)); break;
      default: break;
    }
  }

  setMuted(on) {
    this.muted = !!on;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }

  setSound(on) {
    this.sound = !!on;
  }

  setMusicEnabled(on) {
    this.musicOn = !!on;
    if (!on) this.stopMusic();
  }

  setIntensity(v) {
    this.intensity = Math.max(0, Math.min(1, v));
  }

  duck(seconds = 1.2) {
    if (!this.ctx || !this.musicBus) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
    this.musicBus.gain.linearRampToValueAtTime(0.18, t + 0.08);
    this.musicBus.gain.linearRampToValueAtTime(0.85, t + seconds);
  }

  startMusic() {
    if (!this.musicOn) return;
    const ctx = this.init();
    if (!ctx || this.timer) return;
    this._step = 0;
    this._bar = 0;
    this._nextStep = ctx.currentTime + 0.12;
    this.timer = setInterval(() => this.schedule(), 40);
    this.running = true;
    this.schedule();
  }

  stopMusic() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.running = false;
  }

  midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'suspended') return;
    const bpm = 92;
    const stepDur = 60 / bpm / 2;
    const chords = [
      [50, 54, 57, 61, 64],
      [47, 50, 54, 57, 61],
      [43, 47, 50, 54, 57],
      [45, 49, 52, 55, 59],
    ];
    const arp = [0, 2, 4, 2, 1, 3, 2, 4];
    while (this._nextStep < ctx.currentTime + 0.2) {
      const c = chords[this._bar % chords.length];
      const s = this._step % 16;
      const time = this._nextStep;
      if (s === 0) {
        this.pad(c.map((n) => this.midi(n)), time, stepDur * 16, 0.016);
        this.piano(this.midi(c[0]), time, 1.6, 0.04);
      }
      if (s % 2 === 0) {
        const idx = arp[(s / 2) % arp.length];
        this.piano(this.midi(c[idx % c.length] + (s >= 8 ? 12 : 0)), time, 0.9, 0.02 + this.intensity * 0.03);
      }
      if (s % 8 === 0) this.piano(this.midi(c[0] - 12), time, 1.4, 0.025 + this.intensity * 0.02);
      if (s % 4 === 0) this.hat(time, 0.02 + this.intensity * 0.02);
      else if (s % 2 === 1) this.hat(time, 0.008 + this.intensity * 0.012);

      this._nextStep += stepDur;
      this._step++;
      if (this._step % 16 === 0) this._bar++;
    }
  }

  piano(freq, time, dur, gain) {
    const ctx = this.ctx;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    const g2 = ctx.createGain();
    o1.type = 'triangle';
    o2.type = 'sine';
    o1.frequency.value = freq;
    o2.frequency.value = freq * 2.004;
    g2.gain.value = 0.28;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), time + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o1.connect(g);
    o2.connect(g2).connect(g);
    g.connect(this.musicBus);
    o1.start(time); o1.stop(time + dur + 0.05);
    o2.start(time); o2.stop(time + dur + 0.05);
  }

  pad(freqs, time, dur, gain) {
    const ctx = this.ctx;
    for (const f of freqs) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 850;
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = 3;
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(gain, time + 0.5);
      g.gain.linearRampToValueAtTime(0.0001, time + dur);
      o.connect(lp).connect(g).connect(this.musicBus);
      o.start(time); o.stop(time + dur + 0.1);
    }
  }

  hat(time, gain) {
    const ctx = this.ctx;
    if (!this._hatBuf) {
      const len = Math.floor(ctx.sampleRate * 0.06);
      this._hatBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this._hatBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const s = ctx.createBufferSource();
    const g = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6500;
    s.buffer = this._hatBuf;
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    s.connect(hp).connect(g).connect(this.musicBus);
    s.start(time);
    s.stop(time + 0.07);
  }
}
