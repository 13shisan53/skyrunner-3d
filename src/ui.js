import { t, setLocale, getLocale } from './strings.js';
import { CHARACTERS, TRAILS, MISSIONS } from './config.js';
import { nextUnlock } from './meta.js';

const $ = (id) => document.getElementById(id);
const all = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export class UI {
  constructor(handlers = {}) {
    this.h = handlers;
    this.el = {
      menu: $('menu'), hud: $('hud'), over: $('over'), pause: $('pause'),
      settings: $('settings'), locker: $('locker'), touch: $('touch'),
      bestTop: $('bestTop'), menuBest: $('menuBest'), menuRuns: $('menuRuns'),
      menuTotal: $('menuTotal'), menuCombo: $('menuCombo'), menuCoins: $('menuCoins'),
      menuDailyBest: $('menuDailyBest'), sparkline: $('sparklinePath'),
      score: $('score'), coins: $('coins'), dist: $('dist'),
      combo: $('combo'), comboFill: $('comboFill'), comboMult: $('comboMult'),
      bestGap: $('bestGap'), bestGapText: $('bestGapText'), bestGapFill: $('bestGapFill'),
      dailyChip: $('dailyChip'),
      overDelta: $('overDelta'), overScore: $('overScore'), overDist: $('overDist'),
      overCoins: $('overCoins'), overCombo: $('overCombo'), overBar: $('overBar'),
      overBest: $('overBest'), overClose: $('overClose'), overUnlock: $('overUnlock'),
      overMissions: $('overMissions'), retryBtn: $('retryBtn'),
      muteBtn: $('muteBtn'), hudMuteBtn: $('hudMuteBtn'),
      toasts: $('toasts'), loading: $('loading'),
      lockerChars: $('lockerChars'), lockerTrails: $('lockerTrails'), lockerCoins: $('lockerCoins'),
      resetBtn: $('resetBtn'),
    };
    this.bind();
    this.applyStatic();
  }

  bind() {
    const click = (id, fn) => {
      const el = $(id);
      if (el) el.addEventListener('click', (e) => { e.preventDefault(); fn(e); });
    };
    click('playBtn', () => this.h.onStart && this.h.onStart(false));
    click('dailyBtn', () => this.h.onDaily && this.h.onDaily());
    click('retryBtn', () => this.h.onRetry && this.h.onRetry());
    click('menuBtn2', () => this.h.onMenu && this.h.onMenu());
    click('resumeBtn', () => this.h.onResume && this.h.onResume());
    click('pauseRestart', () => this.h.onRestart && this.h.onRestart());
    click('pauseMenu', () => this.h.onMenu && this.h.onMenu());
    click('pauseSettings', () => this.openSettings(this.save));
    click('pauseBtn', () => this.h.onPause && this.h.onPause());
    click('settingsBtn', () => this.openSettings(this.save));
    click('closeSettings', () => this.closeSettings());
    click('lockerBtn', () => this.openLocker(this.save));
    click('closeLocker', () => this.closeLocker());
    click('muteBtn', () => this.h.onMute && this.h.onMute());
    click('hudMuteBtn', () => this.h.onMute && this.h.onMute());

    const quality = $('qualitySeg');
    if (quality) {
      quality.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-quality]');
        if (!btn) return;
        this.setQuality(btn.dataset.quality);
        this.h.onSettingsChange && this.h.onSettingsChange({ quality: btn.dataset.quality });
      });
    }
    const locale = $('localeSeg');
    if (locale) {
      locale.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-locale]');
        if (!btn) return;
        this.setLocale(btn.dataset.locale);
        this.h.onSettingsChange && this.h.onSettingsChange({ locale: btn.dataset.locale });
      });
    }
    for (const id of ['lowStim', 'reduceMotion', 'soundToggle', 'musicToggle', 'statsToggle']) {
      const el = $(id);
      if (el) {
        el.addEventListener('click', () => {
          const on = el.getAttribute('aria-checked') !== 'true';
          el.setAttribute('aria-checked', String(on));
          const key = { lowStim: 'lowStim', reduceMotion: 'reduceMotion', soundToggle: 'sound', musicToggle: 'music', statsToggle: 'localStats' }[id];
          this.applySetting(key, on);
          this.h.onSettingsChange && this.h.onSettingsChange({ [key]: on });
        });
      }
    }
    if (this.el.resetBtn) {
      let armed = 0;
      this.el.resetBtn.addEventListener('click', () => {
        if (Date.now() - armed > 3200) {
          armed = Date.now();
          this.el.resetBtn.classList.add('confirm');
          this.el.resetBtn.textContent = t('settings.resetConfirm');
          return;
        }
        this.h.onReset && this.h.onReset();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.el.settings.classList.contains('open')) this.closeSettings();
        else if (this.el.locker.classList.contains('open')) this.closeLocker();
      }
    });
  }

  applySetting(key, on) {
    if (key === 'lowStim') document.body.classList.toggle('low-stim', on);
    if (key === 'reduceMotion') document.body.classList.toggle('reduce-motion', on);
  }

  applyStatic() {
    for (const el of all('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of all('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
    document.documentElement.lang = getLocale();
  }

  setLocale(locale) {
    setLocale(locale);
    this.applyStatic();
    const loc = $('localeSeg');
    if (loc) for (const b of all('[data-locale]', loc)) b.classList.toggle('active', b.dataset.locale === locale);
    if (this.save) this.showMenu(this.save);
  }

  fillMenu(save) {
    this.save = save;
    const stats = save.stats || { runs: 0, totalDistance: 0, maxCombo: 0 };
    if (this.el.bestTop) this.el.bestTop.textContent = String(save.best);
    if (this.el.menuBest) this.el.menuBest.textContent = String(save.best);
    if (this.el.menuRuns) this.el.menuRuns.textContent = String(stats.runs);
    if (this.el.menuTotal) this.el.menuTotal.textContent = `${(stats.totalDistance / 1000).toFixed(1)}km`;
    if (this.el.menuCombo) this.el.menuCombo.textContent = String(stats.maxCombo);
    if (this.el.menuCoins) this.el.menuCoins.textContent = String(save.coins);
    if (this.el.menuDailyBest) this.el.menuDailyBest.textContent = save.daily && save.daily.best ? String(save.daily.best) : '—';
    this.renderSparkline(save.runs || []);
  }

  renderSparkline(runs) {
    const poly = this.el.sparkline;
    if (!poly) return;
    const scores = runs.slice(0, 10).map((r) => r.score || 0).reverse();
    if (scores.length < 2) { poly.setAttribute('points', ''); return; }
    const max = Math.max(...scores, 1);
    const w = 180, h = 40;
    const pts = scores.map((v, i) => `${(i / (scores.length - 1)) * w},${h - (v / max) * (h - 4) - 2}`);
    poly.setAttribute('points', pts.join(' '));
  }

  showMenu(save) {
    this.save = save;
    this.fillMenu(save);
    this.el.menu.classList.remove('hidden');
    this.el.hud.classList.add('hidden');
    this.el.over.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.touch.classList.add('hidden');
    this.el.dailyChip.classList.add('hidden');
    this.syncSettings(save);
  }

  showPlay(save, opts = {}) {
    this.save = save;
    this.el.menu.classList.add('hidden');
    this.el.over.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    this.el.dailyChip.classList.toggle('hidden', !opts.daily);
    if (document.body.classList.contains('touch')) this.el.touch.classList.remove('hidden');
    this.el.score.textContent = '0';
    this.el.coins.textContent = '0';
    this.el.dist.textContent = '0';
    this.el.combo.classList.remove('live');
    this.el.bestGap.classList.add('hidden');
    if (this.el.comboFill) this.el.comboFill.style.strokeDashoffset = '113.1';
  }

  showOver(result, save) {
    this.save = save;
    this.el.hud.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.menu.classList.add('hidden');
    this.el.over.classList.remove('hidden');
    const delta = result.previousBest - (result.score || 0);
    let text;
    this.el.overDelta.classList.remove('near', 'best');
    if (result.isBest) {
      text = t('over.newBest', { n: Math.max(0, result.score - result.previousBest) });
      this.el.overDelta.classList.add('best');
    } else if (result.previousBest > 0 && delta <= Math.max(1, result.previousBest * 0.05)) {
      text = t('over.near');
      this.el.overDelta.classList.add('near');
    } else {
      text = t('over.delta', { n: Math.max(0, delta) });
    }
    this.el.overDelta.textContent = text;
    this.el.overScore.textContent = String(result.score);
    this.el.overDist.textContent = `${Math.floor(result.distance)}m`;
    this.el.overCoins.textContent = String(result.coins);
    this.el.overCombo.textContent = String(result.maxCombo);
    this.el.overBest.textContent = `${t('over.best')} ${save.best}`;
    this.el.overClose.textContent = `${Math.floor(result.distance)}m`;
    const pct = save.best > 0 ? Math.min(100, (result.score / save.best) * 100) : 100;
    this.el.overBar.style.width = `${pct}%`;

    const next = nextUnlock(save);
    this.el.overUnlock.textContent = next
      ? t('over.unlock', { n: next.missing, name: t(next.item.nameKey) })
      : '';
    this.renderMissions(save.missions ? save.missions.items : []);
  }

  renderMissions(items) {
    if (!this.el.overMissions) return;
    const rows = items.map((item) => {
      const def = MISSIONS.find((m) => m.id === item.id);
      if (!def) return '';
      const pct = Math.min(100, (item.progress / def.target) * 100);
      return `<li class="mission-row ${item.done ? 'done' : ''}">
        <span>${esc(t(`mission.${def.id}`))}</span>
        <b>${item.done ? esc(t('mission.done')) : `${item.progress}/${def.target}`}</b>
        <div class="bar"><i style="width:${pct}%"></i></div>
      </li>`;
    });
    this.el.overMissions.innerHTML = rows.join('');
  }

  showPause() {
    this.el.pause.classList.remove('hidden');
    this.el.touch.classList.add('hidden');
  }

  hidePause() {
    this.el.pause.classList.add('hidden');
    if (document.body.classList.contains('touch')) this.el.touch.classList.remove('hidden');
  }

  updateHud(s) {
    if (!this.el.score) return;
    this.el.score.textContent = String(Math.floor(s.score || 0));
    this.el.coins.textContent = String(s.coins || 0);
    this.el.dist.textContent = String(Math.floor(s.distance || 0));
    const mult = s.mult || 1;
    const streak = s.streak || 0;
    this.el.combo.classList.toggle('live', streak > 0);
    if (this.el.comboMult) this.el.comboMult.textContent = `×${mult}`;
    if (this.el.comboFill) {
      const phase = (streak % 8) / 8;
      this.el.comboFill.style.strokeDashoffset = String(113.1 * (1 - phase));
      this.el.comboFill.style.stroke = mult >= 5 ? '#ffd166' : mult >= 3 ? '#9fe8ff' : '#5ff2d0';
    }
    if (s.best > 0 && s.score < s.best) {
      const gap = s.best - s.score;
      this.el.bestGap.classList.remove('hidden');
      this.el.bestGapText.textContent = t('hud.bestGap', { n: Math.max(0, Math.ceil(gap)) });
      this.el.bestGapFill.style.width = `${Math.min(100, (s.score / s.best) * 100)}%`;
      this.el.bestGap.classList.toggle('near', gap <= s.best * 0.1);
    } else {
      this.el.bestGap.classList.add('hidden');
    }
  }

  toast(key, vars = {}, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`.trim();
    el.textContent = t(key, vars);
    this.el.toasts.appendChild(el);
    while (this.el.toasts.children.length > 3) this.el.toasts.firstElementChild.remove();
    setTimeout(() => el.remove(), 2400);
  }

  syncSettings(save) {
    this.save = save;
    const s = save.settings;
    const seg = $('qualitySeg');
    if (seg) for (const b of all('[data-quality]', seg)) b.classList.toggle('active', b.dataset.quality === s.quality);
    const loc = $('localeSeg');
    if (loc) for (const b of all('[data-locale]', loc)) b.classList.toggle('active', b.dataset.locale === s.locale);
    this.setToggle('lowStim', s.lowStim);
    this.setToggle('reduceMotion', s.reduceMotion);
    this.setToggle('soundToggle', s.sound);
    this.setToggle('musicToggle', s.music);
    this.setToggle('statsToggle', s.localStats);
    this.setLowStim(s.lowStim);
    this.setReduceMotion(s.reduceMotion);
  }

  setToggle(id, on) {
    const el = $(id);
    if (el) el.setAttribute('aria-checked', String(!!on));
  }

  setLowStim(on) { document.body.classList.toggle('low-stim', !!on); }
  setReduceMotion(on) { document.body.classList.toggle('reduce-motion', !!on); }

  setQuality(tier) {
    const seg = $('qualitySeg');
    if (seg) for (const b of all('[data-quality]', seg)) b.classList.toggle('active', b.dataset.quality === tier);
  }

  syncMute(muted) {
    for (const el of [this.el.muteBtn, this.el.hudMuteBtn]) {
      if (!el) continue;
      el.classList.toggle('off', muted);
      el.textContent = muted ? '✕' : '♪';
    }
  }

  openSettings(save) {
    if (save) this.syncSettings(save);
    this.el.settings.classList.add('open');
    this.el.settings.setAttribute('aria-hidden', 'false');
  }

  closeSettings() {
    this.el.settings.classList.remove('open');
    this.el.settings.setAttribute('aria-hidden', 'true');
    if (this.el.resetBtn) { this.el.resetBtn.classList.remove('confirm'); this.el.resetBtn.textContent = t('settings.reset'); }
  }

  openLocker(save) {
    if (save) this.renderLocker(save);
    this.el.locker.classList.add('open');
    this.el.locker.setAttribute('aria-hidden', 'false');
  }

  closeLocker() {
    this.el.locker.classList.remove('open');
    this.el.locker.setAttribute('aria-hidden', 'true');
  }

  renderLocker(save) {
    this.save = save;
    if (this.el.lockerCoins) this.el.lockerCoins.textContent = t('locker.coins', { n: save.coins });
    const render = (items, kind, root) => {
      if (!root) return;
      root.innerHTML = items.map((item) => {
        const owned = save.unlocked.includes(item.id);
        const worn = save.worn[kind] === item.id;
        const color = kind === 'char' ? item.color : item.color;
        const label = t(item.nameKey);
        const price = owned ? (worn ? t('locker.equipped') : '') : `${t('locker.unlock')} · ${item.cost}`;
        return `<button class="locker-card ${worn ? 'worn' : ''}" data-buy="${esc(item.id)}" data-kind="${kind}">
          <span class="locker-orb" style="background:radial-gradient(circle at 34% 30%, #ffffff, #${color.toString(16).padStart(6, '0')} 62%, #${color.toString(16).padStart(6, '0')})">${item.id.startsWith('char.') ? '●' : '✦'}</span>
          <span class="locker-name">${esc(label)}</span>
          <span class="locker-price">${owned ? esc(price) : `<b>${item.cost}</b> ${esc(t('hud.coins'))}`}</span>
        </button>`;
      }).join('');
      root.onclick = (e) => {
        const btn = e.target.closest('[data-buy]');
        if (!btn) return;
        const id = btn.dataset.buy;
        if (save.unlocked.includes(id)) {
          if (this.h.onWear) this.h.onWear(kind, id);
        } else if (this.h.onUnlock) {
          this.h.onUnlock(id);
        }
      };
    };
    render(CHARACTERS, 'char', this.el.lockerChars);
    render(TRAILS, 'trail', this.el.lockerTrails);
  }

  hideLoading() {
    if (this.el.loading) this.el.loading.classList.add('gone');
  }
}
