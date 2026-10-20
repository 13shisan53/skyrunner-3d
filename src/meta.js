import { CHARACTERS, TRAILS, MISSIONS, STORAGE_KEY, SAVE_VERSION } from './config.js';
import { mulberry32 } from './gen.js';

const pad = (n) => String(n).padStart(2, '0');

export function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dailySeed(date = new Date()) {
  return Number(`${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`);
}

export function rollMissions(date = new Date()) {
  const rng = mulberry32(dailySeed(date) ^ 0x9e3779b9);
  const pool = MISSIONS.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3).map((m) => ({ id: m.id, type: m.type, target: m.target, reward: m.reward }));
}

function freshMissions(date) {
  return {
    date: todayKey(date),
    items: rollMissions(date).map((m) => ({ id: m.id, progress: 0, done: false })),
  };
}

function freshDaily(date) {
  return { date: todayKey(date), best: 0, attempts: 0, rewarded: false };
}

export function defaultSave(now = new Date()) {
  return {
    version: SAVE_VERSION,
    best: 0,
    coins: 0,
    unlocked: ['char.default', 'trail.none'],
    worn: { char: 'char.default', trail: 'trail.none' },
    settings: {
      quality: 'auto',
      lowStim: false,
      reduceMotion: false,
      sound: true,
      music: true,
      locale: 'zh-CN',
      localStats: true,
    },
    daily: freshDaily(now),
    missions: freshMissions(now),
    stats: { runs: 0, totalDistance: 0, maxCombo: 0 },
    runs: [],
  };
}

function ensureDaily(save, date) {
  if (!save.daily || save.daily.date !== todayKey(date)) save.daily = freshDaily(date);
  return save.daily;
}

function ensureMissions(save, date) {
  if (!save.missions || save.missions.date !== todayKey(date)) save.missions = freshMissions(date);
  return save.missions;
}

function sanitize(saved, base) {
  const out = { ...base, ...(saved && typeof saved === 'object' ? saved : {}) };
  out.version = SAVE_VERSION;
  out.best = Number.isFinite(+out.best) && +out.best > 0 ? Math.floor(+out.best) : 0;
  out.coins = Number.isFinite(+out.coins) && +out.coins > 0 ? Math.floor(+out.coins) : 0;
  out.unlocked = Array.isArray(out.unlocked) ? out.unlocked.filter((id) => typeof id === 'string') : base.unlocked.slice();
  out.worn = { ...base.worn, ...(out.worn && typeof out.worn === 'object' ? out.worn : {}) };
  out.settings = { ...base.settings, ...(out.settings && typeof out.settings === 'object' ? out.settings : {}) };
  out.daily = out.daily && typeof out.daily === 'object' ? { ...freshDaily(new Date()), ...out.daily } : freshDaily(new Date());
  out.missions = out.missions && Array.isArray(out.missions.items) ? out.missions : freshMissions(new Date());
  out.stats = { ...base.stats, ...(out.stats && typeof out.stats === 'object' ? out.stats : {}) };
  out.runs = Array.isArray(out.runs) ? out.runs.slice(0, 10) : [];
  out.unlocked = [...new Set([...base.unlocked, ...out.unlocked])];
  if (!out.unlocked.includes(out.worn.char)) out.worn.char = 'char.default';
  if (!out.unlocked.includes(out.worn.trail)) out.worn.trail = 'trail.none';
  if (!['auto', 'high', 'mid', 'low'].includes(out.settings.quality)) out.settings.quality = 'auto';
  if (!['zh-CN', 'en'].includes(out.settings.locale)) out.settings.locale = 'zh-CN';
  return out;
}

export function loadSave(storage) {
  const base = defaultSave(new Date());
  try {
    storage = storage || globalThis.localStorage;
    const raw = storage && storage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    const save = sanitize(parsed, base);
    ensureDaily(save, new Date());
    ensureMissions(save, new Date());
    return save;
  } catch {
    return base;
  }
}

export function persist(save, storage) {
  try {
    storage = storage || globalThis.localStorage;
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function addCoins(save, n) {
  save.coins = Math.max(0, Math.floor(save.coins + n));
  return save.coins;
}

export function nextUnlock(save) {
  const items = [...CHARACTERS, ...TRAILS]
    .filter((item) => !save.unlocked.includes(item.id) && item.cost > 0)
    .sort((a, b) => a.cost - b.cost);
  if (!items.length) return null;
  return { item: items[0], missing: Math.max(0, items[0].cost - save.coins) };
}

function findItem(id) {
  return CHARACTERS.find((x) => x.id === id) || TRAILS.find((x) => x.id === id) || null;
}

export function unlock(save, id) {
  const item = findItem(id);
  if (!item || save.unlocked.includes(id)) return false;
  if (item.cost > save.coins) return false;
  save.coins -= item.cost;
  save.unlocked.push(id);
  if (id.startsWith('char.')) save.worn.char = id;
  if (id.startsWith('trail.')) save.worn.trail = id;
  return true;
}

export function wear(save, kind, id) {
  if (!save.unlocked.includes(id)) return false;
  if (kind === 'char' && id.startsWith('char.')) { save.worn.char = id; return true; }
  if (kind === 'trail' && id.startsWith('trail.')) { save.worn.trail = id; return true; }
  return false;
}

function applyMissions(save, run, date) {
  const missions = ensureMissions(save, date);
  const completed = [];
  for (const item of missions.items) {
    const def = MISSIONS.find((m) => m.id === item.id);
    if (!def || item.done) continue;
    let value = item.progress;
    if (def.type === 'coins') value += run.coins || 0;
    else if (def.type === 'stomps') value += run.stomps || 0;
    else if (def.type === 'edge') value += run.edges || 0;
    else if (def.type === 'runs') value += 1;
    else if (def.type === 'distance') value = Math.max(value, run.distance || 0);
    else if (def.type === 'combo') value = Math.max(value, run.maxCombo || 0);
    item.progress = Math.min(def.target, value);
    if (item.progress >= def.target) {
      item.done = true;
      completed.push(def.id);
      save.coins += def.reward;
    }
  }
  return completed;
}

export function applyRun(save, run, opts = {}) {
  const date = opts.date || new Date();
  const reward = opts.reward !== false;
  const previousBest = save.best;
  const isBest = (run.score || 0) > previousBest;
  if (isBest) save.best = Math.floor(run.score);

  const entry = {
    score: Math.floor(run.score || 0),
    distance: Math.floor(run.distance || 0),
    coins: Math.floor(run.coins || 0),
    maxCombo: Math.floor(run.maxCombo || 0),
    duration: +(run.duration || 0).toFixed(1),
    cause: run.cause || 'fall',
    stomps: Math.floor(run.stomps || 0),
    edges: Math.floor(run.edges || 0),
    at: Date.now(),
  };
  save.runs = [entry, ...(save.runs || [])].slice(0, 10);
  save.stats.runs += 1;
  save.stats.totalDistance += entry.distance;
  save.stats.maxCombo = Math.max(save.stats.maxCombo || 0, entry.maxCombo);

  if (reward) save.coins += entry.coins;
  if (run.daily) {
    const daily = ensureDaily(save, date);
    daily.best = Math.max(daily.best || 0, entry.score);
  }

  const completed = reward ? applyMissions(save, entry, date) : [];
  return { isBest, previousBest, delta: entry.score - previousBest, newBest: isBest, completed, entry };
}

export function beginDailyAttempt(save, date = new Date()) {
  const daily = ensureDaily(save, date);
  if (daily.attempts === 0) {
    daily.attempts = 1;
    daily.rewarded = true;
    return true;
  }
  daily.attempts += 1;
  return false;
}

export function dailyRewardAvailable(save, date = new Date()) {
  const daily = ensureDaily(save, date);
  return daily.attempts === 0;
}
