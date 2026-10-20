import { CFG } from './config.js';

export function scoreOf(distance, coinPoints = 0, trickPoints = 0) {
  return Math.floor(Math.max(0, distance)) * CFG.scorePerMetre + Math.max(0, coinPoints) + Math.max(0, trickPoints);
}

export class Combo {
  constructor() {
    this.streak = 0;
    this.idle = 0;
    this.decayAcc = 0;
  }

  get mult() {
    return Math.min(CFG.comboMax, 1 + Math.floor(this.streak / CFG.comboStep));
  }

  add(n = 1) {
    this.streak += n;
    this.idle = 0;
    this.decayAcc = 0;
  }

  update(dt) {
    if (this.streak <= 0) return;
    this.idle += dt;
    if (this.idle <= CFG.comboTimeout) return;
    this.decayAcc += Math.min(dt, this.idle - CFG.comboTimeout);
    while (this.decayAcc >= CFG.comboDecayStep && this.streak > 0) {
      this.streak -= 1;
      this.decayAcc -= CFG.comboDecayStep;
    }
    if (this.streak <= 0) {
      this.streak = 0;
      this.idle = 0;
      this.decayAcc = 0;
    }
  }

  break() {
    this.streak = 0;
    this.idle = 0;
    this.decayAcc = 0;
  }

  reset() {
    this.break();
  }
}
