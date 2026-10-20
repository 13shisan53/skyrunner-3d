// Frame-time driven quality judge. Pure: the renderer applies the decision.

export const TIERS = ['high', 'mid', 'low'];

export class QualityJudge {
  constructor(tier = 'high') {
    this.tier = TIERS.includes(tier) ? tier : 'high';
    this.samples = [];
    this.badTime = 0;
    this.goodTime = 0;
  }

  reset(tier = this.tier) {
    this.tier = TIERS.includes(tier) ? tier : 'high';
    this.samples.length = 0;
    this.badTime = 0;
    this.goodTime = 0;
  }

  push(frameMs, dt) {
    if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 250) return null;
    this.samples.push(Math.min(frameMs, 50));
    if (this.samples.length > 120) this.samples.shift();
    if (this.samples.length < 30) return null;

    const sorted = this.samples.slice().sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];

    this.badTime = p95 > 22 ? this.badTime + dt : 0;
    this.goodTime = p95 < 14 ? this.goodTime + dt : 0;

    if (this.badTime >= 2 && this.tier !== 'low') {
      const i = TIERS.indexOf(this.tier);
      this.reset(TIERS[Math.min(TIERS.length - 1, i + 1)]);
      return 'down';
    }
    if (this.goodTime >= 8 && this.tier !== 'high') {
      const i = TIERS.indexOf(this.tier);
      this.reset(TIERS[Math.max(0, i - 1)]);
      return 'up';
    }
    return null;
  }
}
