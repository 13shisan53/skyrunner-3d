const KEY = 'skyrunner.analytics.v1';
const MAX_EVENTS = 200;
const MAX_AGE = 30 * 24 * 3600 * 1000;

export class Analytics {
  constructor(opts = {}) {
    this.storage = opts.storage || null;
    this.key = opts.key || KEY;
    this.enabled = opts.enabled !== false;
    this.now = opts.now || (() => Date.now());
    this.events = [];
    this.load();
  }

  load() {
    try {
      if (!this.storage) return;
      const raw = this.storage.getItem(this.key);
      const parsed = raw ? JSON.parse(raw) : [];
      this.events = Array.isArray(parsed) ? parsed.slice(-MAX_EVENTS) : [];
    } catch {
      this.events = [];
    }
  }

  save() {
    try {
      if (!this.storage) return;
      this.storage.setItem(this.key, JSON.stringify(this.events.slice(-MAX_EVENTS)));
    } catch {
      // local stats are best-effort; never break the game
    }
  }

  setEnabled(on) {
    this.enabled = !!on;
    return this.enabled;
  }

  log(name, data = {}) {
    if (!this.enabled) return;
    this.events.push({ t: this.now(), name, ...data });
    if (this.events.length > MAX_EVENTS) this.events = this.events.slice(-MAX_EVENTS);
    this.save();
  }

  prune() {
    const cutoff = this.now() - MAX_AGE;
    const before = this.events.length;
    this.events = this.events.filter((e) => e && e.t >= cutoff);
    if (this.events.length !== before) this.save();
    return before - this.events.length;
  }
}
