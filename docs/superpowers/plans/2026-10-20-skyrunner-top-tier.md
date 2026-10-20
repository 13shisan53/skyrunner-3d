# SKYRUNNER 顶级版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 v1.0 的技术验证版重做成"画面有纵深、帧率稳定、动作连贯、每局都有差一点钩子"的完成品，并用单元 + E2E + 性能 + 截图证明。

**Architecture:** 原生 ES modules + three.js r160（vendored），固定 120Hz 模拟 + 渲染插值；DOM UI 覆盖在实时 3D 场景上；纯逻辑拆成可在 Node 里单测的模块；localStorage 存档；无构建步骤。

**Tech Stack:** JavaScript (ES2022)、three.js r160、WebAudio、CSS、Node 24 `node:test`、Chrome DevTools Protocol。

**Spec:** `docs/superpowers/specs/2026-10-20-skyrunner-top-tier-design.md`

## Global Constraints

- 无构建步骤：浏览器直接加载原生 ES modules；`index.html` 的 import map 只映射 `three` 与 `three/addons/`。
- three.js 固定 r160，继续使用 `vendor/three.module.js`，不升级、不换 CDN。
- 运行时不发任何网络请求；无账号、排行榜、后端、广告。存档只在 `localStorage`。
- 首屏传输（gzip）≤ 350KB；应用 JS（不含 three）≤ 70KB。
- 720p、真 GPU、非 headless Chrome 下 p99 帧 ≤ 25ms；预热后 0 个 > 50ms 长帧；draw calls ≤ 140。
- 模拟固定 120Hz（`1/120`），渲染用插值；帧间隔上限 0.1s，不截断输入。
- 赛道固定沿世界 +Z；自动前进 +Z；A/D 横移 ±X；相机拖拽只改观看角度，跑动中限 ±20° 并自动回正。
- 所有用户可见文案走 `src/strings.js`；默认 `zh-CN`，`en` 必须完整。
- 所有美术、音效、音乐原创或用代码生成；不引入外部模型、贴图、音频文件。
- 页面无未捕获异常、无 console error；失败显示可读错误层，不白屏。
- 键盘与触屏功能对等；尊重 `env(safe-area-inset-*)` 与 `prefers-reduced-motion`。
- 存档键 `skyrunner.save.v2`；损坏/旧版/写入失败都必须安全回退，不抛异常。

## Review Focus

1. **切后台/失焦发生在跳跃或拖拽中**：必须自动暂停、清空按键与指针状态；回来后不能自己掉下去。Pinned in Task 5.
2. **键盘 + 指针 + 多点触控同时输入**：一次按下只能触发一次跳；横移不能卡在某个方向；摇杆与 A/D 不能互相抵消成 NaN。Pinned in Task 5.
3. **localStorage 损坏、被禁用或写满**：游戏必须用默认存档启动，设置仍可操作，不抛异常。Pinned in Task 3 + Task 8.
4. **跑动中改变窗口尺寸/手机横竖屏**：相机 aspect、HUD、触控位置都要适配，不能出现 NaN 或按钮跑出屏幕。Pinned in Task 4 + Task 8.
5. **标签页恢复后出现巨大帧间隔**：物理不能穿平台、不能瞬移；累加器要丢弃多余时间而不是一次跑几百步。Pinned in Task 2 + Task 5.

---

### Task 0: Repository baseline

**Files:**
- Create: `.gitignore`
- Modify: none
- Test: existing `test/cdp-test.mjs` (baseline only)

**Interfaces:**
- Consumes: nothing.
- Produces: a git repo with a commits-on-green baseline; later tasks commit against it.

- [ ] **Step 1: Initialize git and local identity**

```bash
git init
git config user.name "Skyrunner Dev"
git config user.email "dev@skyrunner.local"
```

If `git` is not on PATH in this environment, use `C:\Program Files\Git\cmd\git.exe` for every git command.

- [ ] **Step 2: Write `.gitignore`**

```gitignore
node_modules/
.chrome-*/
.chrome-profile/
test/.artifacts/
*.log
.DS_Store
Thumbs.db
```

- [ ] **Step 3: Commit the v1.0 baseline**

```bash
git add -A
git commit -m "chore: baseline v1.0 before top-tier rebuild"
git log --oneline -1
```

Expected: one commit containing the current game, PRD, docs, tests.

- [ ] **Step 4: Confirm the baseline test still passes**

Run: `node test/cdp-test.mjs` with the static server on `:8123` and Chrome on `:9333`.
Expected: JSON with `exceptions: []` and `consoleErrors: []`.

---

### Task 1: Pure foundation — config, strings, course generator

**Files:**
- Create: `src/config.js`
- Create: `src/strings.js`
- Create: `src/gen.js`
- Test: `test/unit/gen.test.mjs`
- Test: `test/unit/strings.test.mjs`

**Interfaces:**
- Consumes: nothing (no DOM, no three.js).
- Produces:
  - `CFG`: frozen numeric constants (`step`, `gravity`, `fallGravity`, `jumpSpeed`, `maxFall`, `coyote`, `buffer`, `jumpCut`, `radius`, `halfH`, `deathY`, `platformH`, `speedStart`, `speedMax`, `speedRampMetres`, `launchRamp`, `steerMax`, `steerAccelGround`, `steerAccelAir`, `edgeForgiveness`, `edgeWindow`, `edgeMinAirtime`, `edgeMinDepth`, `grazeRadius`, `comboStep`, `comboMax`, `comboTimeout`, `comboDecayStep`, `coinValue`, `scorePerMetre`, `edgeBonus`, `grazeBonus`, `shieldEveryMin`, `shieldEveryMax`).
  - `SEG`: `{ firstWidth: 14, firstDepth: 22, widthFrom: 9, widthTo: 4.4, gapFrom: 2.0, gapTo: 4.3, gapJitter: 0.8, heightJitter: 1.1, lateralFrom: 2.6, lateralTo: 3.8, cap: 45, biomeEvery: 18, ahead: 80, behind: 34, droneFrom: 4, droneChance: 0.32 }`.
  - `speedAt(distance: number): number` — 6.8 at 0, 10.8 at 520m, linear, clamped.
  - `difficultyAt(index: number): number` — `min(1, max(0, index / SEG.cap))`.
  - `BIOMES`: 4 entries, each `{ id, skyTop, skyMid, skyBottom, fog, fogDensity, sun, sunIntensity, hemiSky, hemiGround, palette: number[], particles: 'petal'|'dust'|'firefly'|'star' }` with ids `dawn|day|dusk|night`.
  - `CHARACTERS`: 4 entries `{ id, nameKey, color, suit, scarf, accessory: 'antenna'|'goggles'|'halo'|'crown', cost }`; costs 0/60/150/300.
  - `TRAILS`: 4 entries `{ id, nameKey, color, cost }`; ids `trail.none|trail.stardust|trail.rainbow|trail.flame`, costs 0/40/120/240.
  - `MISSIONS`: 6 entries `{ id, type: 'coins'|'stomps'|'distance'|'edge'|'combo'|'runs', target, reward }`: `coins40/40/40`, `stomps3/3/60`, `distance600/600/80`, `edge5/5/60`, `combo8/8/60`, `runs3/3/40`.
  - `QUALITY_TIERS`: `{ high:{dprCap:2,shadow:1024,bloom:true,clouds:54,particles:240}, mid:{dprCap:1.25,shadow:512,bloom:true,clouds:36,particles:140}, low:{dprCap:1,shadow:0,bloom:false,clouds:20,particles:80} }`.
  - `STORAGE_KEY = 'skyrunner.save.v2'`, `SAVE_VERSION = 2`.
  - `STRINGS`: `{ 'zh-CN': Record<string,string>, en: Record<string,string> }`.
  - `LOCALES = ['zh-CN','en']`, `setLocale(locale)`, `getLocale()`, `t(key, vars?)`.
  - `Course` class: `new Course(seed: number)`, `.next(): Segment`, `.ahead(untilZ: number): Segment[]`.
  - `Segment`: `{ index, type, x, y, z, w, d, gap, biome, coins: {x,y,z}[], drones: {x,y,z,axis:'x',range,speed}[], shield: {x,y,z}|null }` plus getter-free `frontEdge`/`backEdge`? Use explicit `frontEdge: z + d/2`, `backEdge: z - d/2`.

- [ ] **Step 1: Write the failing generator tests**

```js
// test/unit/gen.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Course } from '../../src/gen.js';
import { SEG, speedAt, difficultyAt } from '../../src/config.js';

const take = (seed, n) => {
  const c = new Course(seed);
  return Array.from({ length: n }, () => c.next());
};

test('same seed, same 30 segments', () => {
  assert.deepEqual(take(1234, 30), take(1234, 30));
});

test('first platform is the onboarding runway', () => {
  const [s0, s1] = take(7, 2);
  assert.equal(s0.index, 0);
  assert.equal(s0.gap, 0);
  assert.equal(s0.w, SEG.firstWidth);
  assert.equal(s0.d, SEG.firstDepth);
  assert.ok(s1.gap >= SEG.gapFrom - 0.01);
});

test('gaps, lateral steps, height steps stay reachable', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const segs = take(seed, 60);
    for (let i = 1; i < segs.length; i++) {
      const prev = segs[i - 1], cur = segs[i];
      const actualGap = (cur.z - cur.d / 2) - (prev.z + prev.d / 2);
      assert.ok(actualGap >= 1.9 && actualGap <= 5.35, `gap ${actualGap}`);
      assert.ok(Math.abs(cur.y - prev.y) <= 1.11);
      assert.ok(Math.abs(cur.x - prev.x) <= 3.81);
      assert.ok(cur.w >= 4.0 && cur.w <= 9.8);
    }
  }
});

test('drones never sit on the landing edge', () => {
  for (const seg of take(99, 80)) {
    for (const d of seg.drones) {
      assert.ok(seg.frontEdge - d.z >= 1.5 || d.z - seg.backEdge >= 1.5);
    }
  }
});

test('shields respect the 12–16 segment cooldown', () => {
  const segs = take(2026, 120);
  const at = segs.map((s, i) => (s.shield ? i : -1)).filter((i) => i >= 0);
  for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= 12);
  assert.ok(at.length >= 4);
});

test('biome changes every 18 segments and caps out', () => {
  const segs = take(5, 60);
  for (const s of segs) assert.equal(s.biome, Math.floor(s.index / SEG.biomeEvery) % 4);
  assert.equal(difficultyAt(45), 1);
  assert.equal(difficultyAt(60), 1);
  assert.equal(speedAt(0), 6.8);
  assert.equal(speedAt(520), 10.8);
  assert.equal(speedAt(9999), 10.8);
});
```

- [ ] **Step 2: Write the failing strings tests**

```js
// test/unit/strings.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS, LOCALES, setLocale, t } from '../../src/strings.js';

test('zh and en expose identical keys', () => {
  assert.deepEqual(Object.keys(STRINGS['zh-CN']).sort(), Object.keys(STRINGS.en).sort());
  assert.ok(Object.keys(STRINGS['zh-CN']).length >= 70);
});

test('every locale has non-empty copy', () => {
  for (const locale of LOCALES) {
    for (const [key, value] of Object.entries(STRINGS[locale])) {
      assert.ok(value.trim().length > 0, `${locale}:${key}`);
    }
  }
});

test('interpolation and switching', () => {
  setLocale('zh-CN');
  assert.equal(t('hud.score'), '得分');
  assert.equal(t('over.delta', { n: 118 }), '差 118 分');
  setLocale('en');
  assert.equal(t('hud.score'), 'SCORE');
  assert.equal(t('over.delta', { n: 118 }), '118 points short');
  setLocale('zh-CN');
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `node --test test/unit/gen.test.mjs test/unit/strings.test.mjs`
Expected: FAIL with module-not-found or missing export.

- [ ] **Step 4: Implement `src/config.js`, `src/strings.js`, `src/gen.js`**

`gen.js` rules:
- Use `mulberry32(seed)`; `next()` must never call `Math.random`.
- First segment: `{index:0,type:'wide',x:0,y:0,z:0,w:14,d:22,gap:0}`, 3 coins at z 4/8/12.
- Subsequent segments: width `lerp(9,4.4,diff) * rng.float(0.92,1.08)`, gap `lerp(2.0,4.3,diff) + rng.float(0,0.8)`, `z = prev.z + prev.d/2 + gap + d/2`, `x` clamped to `prev.x + rng.float(-lat, lat)` then `[-9,9]`, `y = clamp(prev.y + rng.float(-1.1,1.1), -2.5, 5.5)`.
- `diff = difficultyAt(index)`.
- Types cycle/weight by index: 0 wide, 1 bridge, 2 wide, 3 stepping, then weighted `wide|bridge|stepping|patrol|stairs|island` with weights `[3,3,2,2,1,2]`.
- Coins: 85% chance; 1–4 along the platform's safe area; `island` adds a 3-coin arc over the gap; `patrol` puts coins behind the drone.
- Drones: from index 4, 32% chance; `z` at platform center; `range = min(2.2, w*0.25)`; `speed = rng.float(0.9,1.5)`.
- Shield: countdown starts 12–16; when 0 and index>=8, add a shield at platform center +1.2y and reset 12–16.
- Biome `Math.floor(index/18)%4`.
- `ahead(untilZ)` loops `next()` until `frontEdge >= untilZ`, returns the new segments, and caps at 300 segments to avoid infinite loops.

`strings.js` must contain at least these keys, both locales:
`app.title, app.kicker, app.tagline, app.cta, app.sub, app.best, app.version, menu.daily, menu.dailyBest, menu.locker, menu.settings, menu.controls, menu.footer, menu.best, menu.runs, menu.total, menu.maxCombo, menu.recent, hud.score, hud.coins, hud.metres, hud.bestGap, hud.combo, hud.daily, over.kicker, over.delta, over.newBest, over.near, over.score, over.distance, over.coins, over.combo, over.retry, over.menu, over.best, over.unlock, over.missions, over.dailyBest, pause.title, pause.resume, pause.restart, pause.menu, settings.title, settings.quality, settings.auto, settings.high, settings.mid, settings.low, settings.lowStim, settings.reduceMotion, settings.sound, settings.music, settings.stats, settings.language, settings.reset, settings.resetConfirm, settings.close, settings.on, settings.off, locker.title, locker.characters, locker.trails, locker.equipped, locker.unlock, locker.need, locker.close, locker.coins, missions.title, mission.coins40, mission.stomps3, mission.distance600, mission.edge5, mission.combo8, mission.runs3, mission.done, toast.milestone, toast.biome, toast.record, toast.unlock, toast.mission, toast.shield, toast.edge, toast.graze, toast.near, char.default, char.sunset, char.night, char.gold, trail.none, trail.stardust, trail.rainbow, trail.flame, daily.title, daily.best, daily.firstOnly, daily.start, daily.chip, a11y.jump, a11y.pause, a11y.mute, a11y.settings, a11y.canvas, errors.webgl, errors.boot, errors.contextLost, common.back, common.close, common.play, biome.dawn, biome.day, biome.dusk, biome.night`.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `node --test test/unit/gen.test.mjs test/unit/strings.test.mjs`
Expected: PASS, 8+ tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/config.js src/strings.js src/gen.js test/unit/gen.test.mjs test/unit/strings.test.mjs
git commit -m "feat: add pure config, i18n catalog and course generator"
```

---

### Task 2: Pure systems — scoring, combo, quality judge, kinematic physics

**Files:**
- Create: `src/score.js`
- Create: `src/quality.js`
- Create: `src/physics.js`
- Test: `test/unit/score.test.mjs`
- Test: `test/unit/quality.test.mjs`
- Test: `test/unit/physics.test.mjs`

**Interfaces:**
- Consumes: `CFG` from Task 1.
- Produces:
  - `scoreOf(distance: number, coinPoints: number, trickPoints: number): number` = `floor(max(0,distance))*10 + coinPoints + trickPoints`.
  - `class Combo { streak; mult; idle; add(n=1): void; update(dt): void; break(): void; reset(): void }`. `mult` getter = `min(5, 1 + floor(streak/8))`.
  - `class QualityJudge { tier: 'high'|'mid'|'low'; push(frameMs, dt): 'down'|'up'|null; reset(tier): void }`.
  - `stepBody(body, colliders, dt, opts): { landed, impact, blockedX, blockedZ, ceiling }` where `body = { pos:{x,y,z}, vel:{x,y,z}, grounded:boolean }`, `colliders = {min:{x,y,z},max:{x,y,z}}[]`, `opts = {radius, halfH, forgiving}`.
  - `aabbOf(pos, radius, halfH): {min,max}` and `overlaps(a,b): boolean` for tests and world.

- [ ] **Step 1: Write the failing tests**

```js
// score.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreOf, Combo } from '../../src/score.js';

test('score combines distance, coins and tricks', () => {
  assert.equal(scoreOf(123.9, 400, 150), 1230 + 400 + 150);
  assert.equal(scoreOf(-10, 0, 0), 0);
});

test('combo caps at 5x and decays one step at a time', () => {
  const c = new Combo();
  for (let i = 0; i < 8; i++) c.add();
  assert.equal(c.streak, 8);
  assert.equal(c.mult, 2);
  const cap = new Combo();
  for (let i = 0; i < 40; i++) cap.add();
  assert.equal(cap.mult, 5);
  c.update(6.1);
  assert.equal(c.streak, 8);
  c.update(0.7);
  assert.equal(c.streak, 7);
  c.break();
  assert.equal(c.streak, 0);
  assert.equal(c.mult, 1);
});
```

```js
// quality.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { QualityJudge } from '../../src/quality.js';

test('20ms+ frames for 2s drop a tier, 14ms- frames for 8s raise it', () => {
  const q = new QualityJudge('high');
  for (let i = 0; i < 200; i++) q.push(30, 1 / 60);
  assert.equal(q.tier, 'mid');
  for (let i = 0; i < 600; i++) q.push(10, 1 / 60);
  assert.equal(q.tier, 'high');
});

test('never drops below low or above high', () => {
  const q = new QualityJudge('low');
  for (let i = 0; i < 400; i++) q.push(40, 1 / 60);
  assert.equal(q.tier, 'low');
});
```

```js
// physics.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { stepBody } from '../../src/physics.js';

const platform = { min: { x: -2, y: -1, z: -2 }, max: { x: 2, y: 0, z: 2 } };
const body = (x, y, z, vx, vy, vz) => ({
  pos: { x, y, z }, vel: { x: vx, y: vy, z: vz }, grounded: false,
});

test('falls, lands and comes to rest on top', () => {
  const b = body(0, 3, 0, 0, -5, 0);
  const ev = stepBody(b, [platform], 1 / 30, { radius: 0.36, halfH: 0.55, forgiving: 0.12 });
  assert.equal(ev.landed, true);
  assert.equal(b.pos.y, 0.55);
  assert.equal(b.vel.y, 0);
});

test('edge forgiveness lets a toe land, but not a full miss', () => {
  const toe = body(2.4, 3, 0, 0, -5, 0);
  const miss = body(2.6, 3, 0, 0, -5, 0);
  assert.equal(stepBody(toe, [platform], 1 / 30, { radius: .36, halfH: .55, forgiving: .12 }).landed, true);
  assert.equal(stepBody(miss, [platform], 1 / 30, { radius: .36, halfH: .55, forgiving: .12 }).landed, false);
});

test('a 0.1s frame still cannot tunnel through a 1m platform', () => {
  const b = body(0, 5, 0, 0, -30, 0);
  stepBody(b, [platform], 0.1, { radius: .36, halfH: .55, forgiving: .12 });
  assert.equal(b.pos.y, 0.55);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test test/unit/score.test.mjs test/unit/quality.test.mjs test/unit/physics.test.mjs`
Expected: FAIL missing modules/exports.

- [ ] **Step 3: Implement the three modules**

Physics: substep `dt` into at most `1/120` chunks; resolve Y first, then X, then Z; expand only the landing XZ test by `forgiving`. On landing set `pos.y = c.max.y + halfH + 0.001`, `vel.y = 0`, `grounded = true`, `impact = -vy` before zeroing.

Quality: keep last 120 frame times; ignore samples > 50ms; compute p95; `badTime` accumulates while p95 > 22; `goodTime` while p95 < 14; after 60 samples and `badTime >= 2` drop one tier; after `goodTime >= 8` raise one tier; reset timers and samples on transition.

- [ ] **Step 4: Run and confirm pass**

Run: same command.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/score.js src/quality.js src/physics.js test/unit/score.test.mjs test/unit/quality.test.mjs test/unit/physics.test.mjs
git commit -m "feat: add scoring, combo, quality judge and kinematic physics"
```

---

### Task 3: Save data, unlocks, missions, daily seed

**Files:**
- Create: `src/meta.js`
- Test: `test/unit/meta.test.mjs`

**Interfaces:**
- Consumes: `CHARACTERS`, `TRAILS`, `MISSIONS`, `STORAGE_KEY`, `SAVE_VERSION` from Task 1; `mulberry32` from Task 1.
- Produces:
  - `defaultSave(now = Date.now()): Save`.
  - `loadSave(storage = globalThis.localStorage): Save`.
  - `persist(save, storage = globalThis.localStorage): void` — never throws.
  - `todayKey(date = new Date()): string` — local `YYYY-MM-DD`.
  - `dailySeed(date = new Date()): number` — `YYYYMMDD` as integer.
  - `rollMissions(date = new Date()): Mission[]` — 3 distinct, deterministic.
  - `applyRun(save, run, { date = new Date(), reward = true } = {}): { isBest, previousBest, delta, newBest, completed: string[] }`.
  - `beginDailyAttempt(save, date = new Date()): boolean` — true only for the first attempt of that local day; increments attempts.
  - `dailyRewardAvailable(save, date = new Date()): boolean`.
  - `unlock(save, id): boolean`; `wear(save, kind: 'char'|'trail', id): boolean`.
  - `Save` shape: `{ version, best, coins, unlocked: string[], worn:{char,trail}, settings:{quality,lowStim,reduceMotion,sound,music,locale,localStats}, daily:{date,best,attempts,rewarded}, missions:{date,items:[{id,progress,done}]}, stats:{runs,totalDistance,maxCombo}, runs: Run[] }`.
  - `Run`: `{ score, distance, coins, maxCombo, duration, cause, stomps, edges, at }`.

- [ ] **Step 1: Write the failing meta tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultSave, loadSave, persist, applyRun, rollMissions, dailySeed,
  beginDailyAttempt, dailyRewardAvailable, unlock, wear, todayKey,
} from '../../src/meta.js';

class Mem {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

const run = (over = {}) => ({
  score: 500, distance: 400, coins: 12, maxCombo: 6, duration: 50,
  cause: 'fall', stomps: 2, edges: 1, ...over,
});

test('corrupt or blocked storage falls back to defaults', () => {
  const m = new Mem();
  m.setItem('skyrunner.save.v2', '{not json');
  const s = loadSave(m);
  assert.equal(s.best, 0);
  assert.equal(s.version, 2);
  const throwing = { getItem() { return null; }, setItem() { throw new Error('quota'); } };
  assert.doesNotThrow(() => persist(defaultSave(), throwing));
});

test('new best reports the gap to the old record', () => {
  const s = defaultSave();
  s.best = 620;
  const r = applyRun(s, run({ score: 500 }));
  assert.equal(r.isBest, false);
  assert.equal(r.delta, -120);
  const r2 = applyRun(s, run({ score: 700 }));
  assert.equal(r2.isBest, true);
  assert.equal(r2.delta, 80);
  assert.equal(s.best, 700);
});

test('unlocks spend coins and wear only owned items', () => {
  const s = defaultSave();
  s.coins = 60;
  assert.equal(unlock(s, 'char.sunset'), true);
  assert.equal(s.coins, 0);
  assert.equal(s.worn.char, 'char.sunset');
  assert.equal(wear(s, 'char', 'char.gold'), false);
});

test('missions are deterministic per local date and progress once', () => {
  const d = new Date(2026, 9, 20);
  assert.deepEqual(rollMissions(d).map((m) => m.id), rollMissions(d).map((m) => m.id));
  assert.notDeepEqual(rollMissions(d).map((m) => m.id), rollMissions(new Date(2026, 9, 21)).map((m) => m.id));
  const s = defaultSave();
  s.missions = { date: todayKey(d), items: rollMissions(d).map((m) => ({ id: m.id, progress: 0, done: false })) };
  s.coins = 0;
  applyRun(s, run({ coins: 999, stomps: 999, distance: 9999, maxCombo: 99, edges: 99 }));
  assert.ok(s.missions.items.every((m) => m.done));
  assert.ok(s.coins > 0);
});

test('daily seed is stable per day and first attempt is the only rewarded one', () => {
  const d = new Date(2026, 9, 20);
  assert.equal(dailySeed(d), 20261020);
  assert.notEqual(dailySeed(d), dailySeed(new Date(2026, 9, 21)));
  const s = defaultSave();
  assert.equal(dailyRewardAvailable(s, d), true);
  assert.equal(beginDailyAttempt(s, d), true);
  assert.equal(beginDailyAttempt(s, d), false);
  assert.equal(dailyRewardAvailable(s, d), false);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test test/unit/meta.test.mjs`
Expected: FAIL missing module.

- [ ] **Step 3: Implement `src/meta.js`**

Rules:
- `loadSave`: parse, validate object, merge missing top-level keys from defaults, force `version = 2`; on any error return `defaultSave()`.
- `persist`: try/catch.
- `applyRun`: update best/runs/stats; add coins only if `reward`; update daily best when `run.daily`; apply missions only if reward; completed missions add their reward to `save.coins`; return `previousBest`, `delta = score - previousBest`, `isBest`, `newBest`.
- Daily state resets when `date !== save.daily.date`.
- Missions reset when `date !== save.missions.date`; roll fresh and persist.
- `rollMissions`: seed `dailySeed(date) ^ 0x5f3759df`, shuffle a copy of `MISSIONS` with mulberry32, take 3.
- `beginDailyAttempt`: reset daily if date differs; if `attempts === 0` set `attempts=1,rewarded=true` and return true; else increment attempts and return false.
- `dailyRewardAvailable` = attempts === 0.

- [ ] **Step 4: Run and confirm pass**

Run: `node --test test/unit/meta.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/meta.js test/unit/meta.test.mjs
git commit -m "feat: add local save, unlocks, missions and daily seed"
```

---

### Task 4: Shell, boot, live menu, quality manager, error layer

**Files:**
- Create: `src/ui.js` (menu-only skeleton)
- Create: `styles.css`
- Create: `src/main.js` (boot + placeholder scene)
- Modify: `index.html` (full rewrite)
- Create: `test/lib/cdp.mjs`
- Test: `test/e2e/boot.mjs`

**Interfaces:**
- Consumes: `CFG`, `BIOMES`, `t`, `setLocale`, `loadSave`, `QualityJudge`.
- Produces:
  - `window.__skyrunner` with `{ state, renderer, scene, camera, ui, quality, meta, version, ready }`; `meta.save` is the loaded Save.
  - `state = { mode: 'menu' }` for now.
  - `class QualityManager { tier; mode: 'auto'|'high'|'mid'|'low'; setMode(mode); applyTier(tier); sample(frameMs, dt) }` — owns DPR, shadow map size, bloom flag; calls `onChange(tier)`.
  - `class UI { constructor(handlers); showMenu(save); hideMenu(); setLocale(locale); toast(key, vars); setLowStim(bool); setQuality(tier) }` — minimal markup only in this task.
  - `showFatal(message)` global, sets `#err.show`, `window.__fatal`.

- [ ] **Step 1: Write the failing boot E2E**

```js
// test/e2e/boot.mjs
import { connect, waitFor } from '../lib/cdp.mjs';

const { evaluate, close } = await connect(Number(process.env.CDP_PORT || 9333));
await evaluate(`location.href = 'http://127.0.0.1:8123/?boot=' + Date.now()`);
await waitFor(async () => evaluate(`!!window.__skyrunner`), 20000);
const boot = await evaluate(`({
  ready: document.body.dataset.ready,
  fatal: window.__fatal,
  menu: !document.getElementById('menu').classList.contains('hidden'),
  calls: __skyrunner.renderer.info.render.calls,
  tier: __skyrunner.quality.tier,
  title: document.title
})`);
if (boot.fatal) throw new Error(boot.fatal);
if (boot.ready !== '1') throw new Error('not ready');
if (!boot.menu) throw new Error('menu hidden');
if (boot.calls < 1) throw new Error('nothing rendered');
if (!['high', 'mid', 'low'].includes(boot.tier)) throw new Error('bad tier');
await evaluate(`__skyrunner.debug.resize(390, 844)`);
await new Promise((r) => setTimeout(r, 250));
const aspect = await evaluate(`+__skyrunner.camera.aspect.toFixed(3)`);
if (Math.abs(aspect - 390 / 844) > 0.01) throw new Error('aspect not updated');
console.log(JSON.stringify({ boot, aspect }, null, 2));
close();
```

`test/lib/cdp.mjs` contract:
```js
export async function connect(port = 9333): Promise<{send, evaluate, events, close}>
export async function waitFor(fn, timeoutMs = 10000, intervalMs = 100): Promise<void>
```
`connect` connects to the first page target; `evaluate(expression)` returns by value and throws on exception details; `events` collects `Runtime.exceptionThrown`.

- [ ] **Step 2: Run and confirm failure**

Run: `node test/e2e/boot.mjs`
Expected: FAIL (`__skyrunner` undefined).

- [ ] **Step 3: Rewrite `index.html` and add `styles.css`**

Markup requirements:
- `#game` canvas, `#loading`, `#err`, `#menu`, `#hud`, `#over`, `#pause`, `#settings`, `#locker`, `#toasts`, `#touch` (`#stick`, `#knob`, `#jump`).
- Menu: top bar (logo `SR`, best chip, settings gear), hero (kicker, `h1` SKYRUNNER, tagline, primary `#playBtn`, daily `#dailyBtn`), stats strip (`#menuBest`, `#menuRuns`, `#menuTotal`, `#menuCombo`), controls hint, footer.
- HUD: `#score`, `#coins`, `#dist`, `#combo`, `#comboFill`, `#bestGap`, `#bestGapText`, `#dailyChip`, `#pauseBtn`, `#muteBtn`.
- Overlay containers exist but hidden; their content is wired in Task 8.
- CSS: dark navy base, mint/gold/coral accents, glass panels, fluid clamp typography, `prefers-reduced-motion`, safe-area padding, responsive breakpoint at 820px.

- [ ] **Step 4: Implement `src/main.js` boot + placeholder**

Create renderer (antialias, ACES, sRGB, PCFSoft), scene with fog + gradient background via a large sphere shader (simple 3-stop), hemisphere + directional light, a few floating rounded boxes as a placeholder scene, camera at (0, 5, -10) looking at origin. Set `renderer.info.autoReset = false` and call `renderer.info.reset()` at the top of each frame, so `calls/tris` cover the whole frame including post passes. Compile the scene and render one frame before revealing the menu. Set `body.dataset.ready = '1'` after 3 rendered frames.

`QualityManager`: start at `high`; `sample` delegates to `QualityJudge`; `applyTier` sets DPR `min(devicePixelRatio, tier.dprCap)`, shadow map size, `renderer.shadowMap.enabled`, and calls `onChange`. In this task bloom is a no-op flag until Task 7.

`window.__skyrunner.debug.resize(w,h)` updates camera aspect + renderer size for tests.

`showFatal` catches `error` and `unhandledrejection`, hides the loading veil, shows `#err`, sets `window.__fatal`.

- [ ] **Step 5: Run boot E2E and confirm pass**

Run: `node test/e2e/boot.mjs`
Expected: JSON with `ready: '1'`, `menu: true`, `fatal: null`, and updated aspect.

- [ ] **Step 6: Commit**

```bash
git add index.html styles.css src/main.js src/ui.js test/lib/cdp.mjs test/e2e/boot.mjs
git commit -m "feat: boot shell with live menu and quality manager"
```

---

### Task 5: Input, player, camera and the fixed-step loop

**Files:**
- Create: `src/input.js`
- Create: `src/player.js`
- Create: `src/camera.js`
- Modify: `src/main.js`
- Test: `test/e2e/play.mjs`

**Interfaces:**
- Consumes: `CFG`, `stepBody`, `Combo`, `scoreOf`, `BIOMES`.
- Produces:
  - `class Input { state:{steer,jumpPressed,jumpHeld,lookX,lookY}; attach(); detach(); consumeJump(): boolean; setEnabled(bool); clear(); }`
  - `class Player { pos; prev; vel; grounded; shield; invuln; speed; reset({x,y,z}); update(dt, input, world, events); setVisual(alpha, time, speed); setCharacter(def); grantShield(); hit(); }`
  - `class CameraRig { constructor(camera); look(dx,dy); reset(player); update(dt, player, opts); shake(amount); setMenuOrbit(t); }`
  - `window.__skyrunner.startRun(seed?)`, `.state`, `.player`, `.input`, `.cameraRig`, `.combo`, `.world` (temporary arena in this task), `.debug.teleport(x,y,z)`, `.debug.kill()`.
  - `state` exposes `{ mode, score, coins, distance, best, trick, maxCombo }`; `.combo` is a `Combo`.

- [ ] **Step 1: Write the failing play E2E**

```js
// test/e2e/play.mjs
import { connect, waitFor } from '../lib/cdp.mjs';
const { evaluate, close } = await connect(Number(process.env.CDP_PORT || 9333));
await evaluate(`location.href = 'http://127.0.0.1:8123/?play=' + Date.now()`);
await waitFor(async () => evaluate(`!!window.__skyrunner`), 20000);
await evaluate(`document.getElementById('playBtn').click()`);
await new Promise((r) => setTimeout(r, 900));
const start = await evaluate(`({ mode: __skyrunner.state.mode, z: +__skyrunner.player.pos.z.toFixed(2), grounded: __skyrunner.player.grounded })`);
if (start.mode !== 'play') throw new Error('mode not play');
if (start.z <= 0.5) throw new Error('not auto-running');

await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }))`);
await new Promise((r) => setTimeout(r, 500));
await evaluate(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }))`);
const steer = await evaluate(`+__skyrunner.player.pos.x.toFixed(2)`);
if (steer <= 0.1) throw new Error('no lateral movement');

const y0 = await evaluate(`+__skyrunner.player.pos.y.toFixed(2)`);
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))`);
await new Promise((r) => setTimeout(r, 180));
const y1 = await evaluate(`+__skyrunner.player.pos.y.toFixed(2)`);
await evaluate(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }))`);
if (y1 <= y0 + 0.3) throw new Error('jump did not rise');

await evaluate(`window.dispatchEvent(new Event('blur'))`);
const cleared = await evaluate(`({ steer: __skyrunner.input.state.steer, held: __skyrunner.input.state.jumpHeld })`);
if (cleared.steer !== 0 || cleared.held !== false) throw new Error('input not cleared on blur');

await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))`);
await new Promise((r) => setTimeout(r, 150));
const paused = await evaluate(`__skyrunner.state.mode`);
if (paused !== 'paused') throw new Error('pause failed');

console.log(JSON.stringify({ start, steer, y0, y1, cleared, paused }, null, 2));
close();
```

- [ ] **Step 2: Run and confirm failure**

Run: `node test/e2e/play.mjs`
Expected: FAIL at `playBtn` or mode.

- [ ] **Step 3: Implement `src/input.js`**

- Keyboard: `KeyA/ArrowLeft` → steer -1, `KeyD/ArrowRight` → +1; `Space` sets `jumpPressed` only on `keydown` and not `repeat`, `jumpHeld` true; keyup clears. `Escape` calls `onPause`, `KeyR` calls `onRestart`, `KeyM` calls `onMute`.
- Touch: pointerdown/move on `#stick` sets `steer` from X only (deadzone 0.12, clamp ±1); pointerup resets. Pointerdown on `#jump` sets jumpPressed/jumpHeld; up clears. Drag on canvas accumulates `lookX/lookY`.
- `blur` and `visibilitychange` call `clear()` and `onPause`.
- `consumeJump()` returns `jumpPressed` and resets it.
- `clear()` zeroes all and releases captures.

- [ ] **Step 4: Implement `src/player.js`**

Build the rig from primitives: torso, belly, head, eyes, cheeks, antenna, arms, legs; store limb pivots. `setCharacter` applies colors and accessory.
`update`:
- `speed` from main (`player.speed`).
- Forward: `approach(vel.z, speed, accel*dt)`; steering `approach(vel.x, steer*CFG.steerMax, accel*dt)`; no forward input needed.
- Jump buffer/coyote; jump cut when `!jumpHeld && vel.y > 0`.
- Gravity, fall gravity, maxFall.
- `stepBody` with temporary arena colliders; on `landed` emit `{type:'land', impact}`; if `impact > 7` trigger squash.
- `pos.y < CFG.deathY` → emit `{type:'fall'}` and call `onDeath()`.
- `prev.copy(pos)` at the start for interpolation.
- Edge detection: after landing, find the platform under the player; if `frontEdge - pos.z < 0.35` and airtime > 0.25 and depth > 4 → emit `{type:'edge'}` once per platform.
- `setVisual(alpha, time, speed)` interpolates `prev→pos`, rotates toward `atan2(vel.x, vel.z)`, applies squash decay, limb swing by speed, scarf wave, blink.

- [ ] **Step 5: Implement `src/camera.js`**

Spring arm: distance 7.6 (9.6 portrait), pitch 0.30 (0.38 portrait), target = player + (0, 0.95/0.55), look ahead 4m in +Z. `look(dx,dy)` adjusts yaw within ±0.35 and pitch 0.15–0.55; yaw auto-recenters to 0 after 1.2s. `update` uses `damp` per axis; FOV 58→66 by speed; `shake` decays.

- [ ] **Step 6: Implement fixed loop in `main.js`**

Temporary arena: 3 platforms at z 0 (22 deep), 30, 48 with gaps 2 and 3, colliders in a `world` shim. Start: reset player at (0, 0.55, 0), mode `play`, camera snap, UI hides menu. Bind `#playBtn` click to `startRun()`. `Input` pause callback sets mode `paused` and freezes physics; `Escape` toggles back.

Loop:
```js
const dt = Math.min((now - last) / 1000, 0.1);
if (mode === 'play') {
  acc += dt;
  let steps = 0;
  while (acc >= CFG.step && steps++ < 8) { fixed(CFG.step); acc -= CFG.step; }
  if (steps >= 8) acc = 0; // drop time instead of spiralling
}
render(dt, acc / CFG.step);
```
`fixed` updates input/player/combo/score. `render` interpolates player and camera, renders, samples quality.

`window.__skyrunner.startRun` and `debug.teleport`.

- [ ] **Step 7: Run play E2E and confirm pass**

Run: `node test/e2e/play.mjs`
Expected: JSON with `mode: 'play'`, positive `steer`, `y1 > y0`, cleared input, `paused`.

- [ ] **Step 8: Commit**

```bash
git add src/input.js src/player.js src/camera.js src/main.js test/e2e/play.mjs
git commit -m "feat: auto-run player, touch/keyboard input, spring camera and fixed loop"
```

---

### Task 6: World — course rendering, pickups, drones, shields, recycling

**Files:**
- Create: `src/world.js`
- Modify: `src/main.js` (replace arena with World)
- Test: `test/e2e/world.mjs`

**Interfaces:**
- Consumes: `Course`, `CFG`, `SEG`, `BIOMES`, `CHARACTERS`, `aabbOf`, `Particles` (Task 7 stub may be omitted).
- Produces:
  - `class World { colliders; platforms; coins; drones; shields; course; biome; reset(seed); fixedUpdate(dt, player, events); render(dt, time, alpha, player); ensureAhead(z); setQuality(tier); setSeed(seed); }`
  - `World.fixedUpdate` emits `{type:'coin', value}`, `{type:'stomp', pos}`, `{type:'shield', pos}`, `{type:'hit', shielded}`, `{type:'graze', pos}`, `{type:'biome', index}`.
  - `World.course` exposes `segments` for tests.
  - `window.__skyrunner.world`, `window.__skyrunner.dailySeed = () => dailySeed()`, `.debug.teleport(x,y,z)`, `.debug.kill()`.

- [ ] **Step 1: Write the failing world E2E**

```js
// test/e2e/world.mjs
import { connect, waitFor } from '../lib/cdp.mjs';
const { evaluate, close } = await connect(Number(process.env.CDP_PORT || 9333));
await evaluate(`location.href = 'http://127.0.0.1:8123/?world=' + Date.now()`);
await waitFor(async () => evaluate(`!!window.__skyrunner`), 20000);
await evaluate(`__skyrunner.startRun(42)`);
await new Promise((r) => setTimeout(r, 800));

const gen = await evaluate(`({
  platforms: __skyrunner.world.platforms.length,
  coins: __skyrunner.world.coins.length,
  ahead: Math.max(...__skyrunner.world.platforms.map(p => p.z)),
  colliders: __skyrunner.world.colliders.length
})`);
if (gen.platforms < 5 || gen.coins < 2 || gen.ahead < 40) throw new Error('world not generated');

const coin = await evaluate(`(() => { const c = __skyrunner.world.coins[0]; return c ? {x:c.mesh.position.x,y:c.mesh.position.y,z:c.mesh.position.z} : null; })()`);
if (!coin) throw new Error('no coin');
const before = await evaluate(`__skyrunner.state.coins`);
await evaluate(`__skyrunner.debug.teleport(${coin.x}, ${coin.y - 0.2}, ${coin.z})`);
await new Promise((r) => setTimeout(r, 400));
const after = await evaluate(`__skyrunner.state.coins`);
if (after <= before) throw new Error('coin not collected');

const drone = await evaluate(`(() => { const d = __skyrunner.world.drones[0]; return d ? {x:d.group.position.x,y:d.group.position.y,z:d.group.position.z} : null; })()`);
if (drone) {
  await evaluate(`__skyrunner.debug.teleport(${drone.x}, ${drone.y + 1.2}, ${drone.z})`);
  await evaluate(`__skyrunner.player.vel.y = -8`);
  await new Promise((r) => setTimeout(r, 600));
}
const stomped = await evaluate(`__skyrunner.state.coins`);
if (drone && stomped <= after) throw new Error('stomp did not pay out');

const dailyA = await evaluate(`(() => { __skyrunner.startRun(__skyrunner.dailySeed()); return __skyrunner.world.platforms.slice(0,5).map(p => +p.z.toFixed(2)); })()`);
await new Promise((r) => setTimeout(r, 300));
const dailyB = await evaluate(`(() => { __skyrunner.startRun(__skyrunner.dailySeed()); return __skyrunner.world.platforms.slice(0,5).map(p => +p.z.toFixed(2)); })()`);
if (JSON.stringify(dailyA) !== JSON.stringify(dailyB)) throw new Error('daily seed unstable');

console.log(JSON.stringify({ gen, before, after, stomped, dailyA }, null, 2));
close();
```

- [ ] **Step 2: Run and confirm failure**

Run: `node test/e2e/world.mjs`
Expected: FAIL (no `world` or no coins).

- [ ] **Step 3: Implement `src/world.js`**

- `reset(seed)`: clear meshes/materials safely, `new Course(seed)`, generate until 80m, set biome 0.
- `spawn(seg)`: platform group with rounded box body + lighter top + emissive edge trim; collider AABB at `y-1..y`; emblem shape on top (ring/triangle/box) for colorblind; optional rock cone under every third platform.
- Coins: shared torus geometry, gold emissive material; store `{mesh, baseY, phase, alive}`.
- Drones: group body + eye + ring + two rotor planes; store `{group, base, axis, range, speed, t, alive, grazed}`.
- Shields: bubble sphere (transparent, additive), store `{mesh, alive}`.
- `fixedUpdate`: move drones by `sin`; coin magnet within 2.2m then pickup within 1.05m → emit coin (value `CFG.coinValue * mult` supplied by main? Emit `{type:'coin'}` and main computes); drone collision: stomp if `player.vel.y < -2 && player.pos.y > drone.y + 0.25` → emit stomp, bounce; else if shield → emit hit shielded; else hit; graze if distance < 1.2 and not hit and not grazed → emit graze.
- `render`: coin spin/bob, drone hover, ring spin, shield pulse, platform bob ±0.02 visual only.
- Recycle behind 34m, ensure ahead 80m, dispose geometries (shared geometry cache: only dispose unique).
- Biome transition: lerp `scene.fog.color`, sky uniforms, sun/hemi colors over 2.5s; expose `biome` for tests.

- [ ] **Step 4: Wire World in `main.js`**

Replace arena; start seed: `seed ?? (Math.random()*1e9|0)`. Set `player.speed = speedAt(state.distance)` each fixed step. Pass event queue to world; handle events (score coins later).

`window.__skyrunner.dailySeed = () => dailySeed()`.

- [ ] **Step 5: Run world E2E and confirm pass**

Run: `node test/e2e/world.mjs`
Expected: PASS with generated platforms, coin pickup, stomp payout, stable daily seed.

- [ ] **Step 6: Commit**

```bash
git add src/world.js src/main.js test/e2e/world.mjs
git commit -m "feat: endless course, pickups, drones and shields"
```

---

### Task 7: Visual pass — sky, clouds, islands, biomes, character, particles

**Files:**
- Create: `src/fx.js`
- Modify: `src/world.js` (scenery + biome visuals)
- Modify: `src/player.js` (character polish)
- Modify: `styles.css` (scene vignette / HUD polish)
- Test: `test/shot.mjs` (rewrite)
- Test: `test/e2e/visual.mjs`

**Interfaces:**
- Consumes: `BIOMES`, `QUALITY_TIERS`, `THREE`.
- Produces:
  - `class FX { constructor(scene, camera); setQuality(tier); setTrail(id); dust(pos, n); burst(pos, color, n, speed); ring(pos, color); confetti(); trail(pos, speed); update(dt, time, cameraPos); }`
  - `World.applyBiome(index, immediate=false)`; `World.setQuality(tier)`; `World.sky` uniforms.
  - `Player.setCharacter(def)` supports accessories; scarf and blink.
  - `window.__skyrunner.debug.setBiome(index)` for screenshots.
  - `window.__skyrunner.fx`.

- [ ] **Step 1: Write the failing visual E2E**

```js
// test/e2e/visual.mjs
import { connect, waitFor } from '../lib/cdp.mjs';
const { evaluate, close } = await connect(Number(process.env.CDP_PORT || 9333));
await evaluate(`location.href = 'http://127.0.0.1:8123/?visual=' + Date.now()`);
await waitFor(async () => evaluate(`!!window.__skyrunner`), 20000);
await evaluate(`__skyrunner.startRun(7)`);
await new Promise((r) => setTimeout(r, 800));
const info = await evaluate(`({
  calls: __skyrunner.renderer.info.render.calls,
  tris: __skyrunner.renderer.info.render.triangles,
  clouds: __skyrunner.world.cloudCount ?? 0,
  sky: __skyrunner.world.sky ? 'yes' : 'no',
  fx: !!__skyrunner.fx
})`);
if (info.calls < 20) throw new Error('scene too empty');
if (info.calls > 140) throw new Error('draw calls over budget: ' + info.calls);
if (info.tris > 130000) throw new Error('triangles over budget: ' + info.tris);
if (info.clouds < 20) throw new Error('no cloud layers');
for (const biome of [1, 2, 3]) {
  await evaluate(`__skyrunner.debug.setBiome(${biome})`);
  await new Promise((r) => setTimeout(r, 300));
  const fog = await evaluate(`__skyrunner.world.biome`);
  if (fog !== biome) throw new Error('biome did not switch to ' + biome);
}
console.log(JSON.stringify(info, null, 2));
close();
```

- [ ] **Step 2: Run and confirm failure**

Run: `node test/e2e/visual.mjs`
Expected: FAIL on missing `fx`/`cloudCount`/draw calls.

- [ ] **Step 3: Build the scene layers in `world.js`**

- Sky: sphere shader with uniforms `top/mid/bottom/sunDir/sunColor/starAmt`; sun disc sprite; 300-point star field visible only at night.
- Clouds: 3 layers of billboards (canvas radial texture), counts by quality tier (54/36/20); slow parallax and drift.
- Islands: 10 low-poly islands merged into one geometry with vertex colors, distance 60–150, slow bob, fog-faded.
- Cloud sea: a large plane at y=-26 with a soft canvas texture and fog.
- Platform art: rounded box with bevel, top plate, rim light, emblem shape, optional hanging rock.
- `setQuality` rebuilds/dims clouds and toggles shadows.
- `applyBiome` lerps uniforms/fog/lights over 2.5s.

- [ ] **Step 4: Build `src/fx.js`**

One `THREE.Points` pool (max 240/140/80) with custom shader: per-particle color/size/life; soft circle; additive. Methods allocate from a ring buffer. Add:
- `dust(pos)` 6 gray points outward;
- `burst(pos,color,n,speed)`;
- `ring(pos,color)` 12 points expanding horizontally;
- `confetti()` 80 gold/coral points with gravity;
- `trail(pos,speed)` ribbon mesh (16 segments) for owned trail;
- speed lines: 40 line segments in a cylinder around camera, opacity by speed.

- [ ] **Step 5: Character polish in `player.js`**

- Scarf ribbon (10 segments) waving with speed.
- Blink every 3–6s; pupils look toward steer.
- Antenna bulb pulse; accessories: goggles, halo, crown.
- Air pose (tuck legs), lean into steer, landing squash and recovery.
- `setCharacter` swaps colors/accessory without rebuilding the rig.

- [ ] **Step 6: Screenshot harness**

Rewrite `test/shot.mjs` to capture, at 1280×720 and 390×844: `menu`, `play-dawn`, `play-dusk`, `play-night`, `over`, `settings` into `docs/shots/`. Use `__skyrunner.debug.setBiome()` and `startRun(seed)` for deterministic frames.

- [ ] **Step 7: Run visual E2E + take screenshots**

Run: `node test/e2e/visual.mjs` then `node test/shot.mjs`.
Expected: draw calls 20–140, triangles ≤ 130k, 4 biomes switch; screenshots written.

- [ ] **Step 8: Commit**

```bash
git add src/fx.js src/world.js src/player.js styles.css test/shot.mjs test/e2e/visual.mjs docs/shots
git commit -m "feat: cloud archipelago art pass and particle effects"
```

---

### Task 8: UI and meta loop — HUD, over, settings, locker, daily, missions

**Files:**
- Modify: `src/ui.js` (full)
- Modify: `index.html` (over/pause/settings/locker markup)
- Modify: `styles.css`
- Modify: `src/main.js` (wire actions)
- Create: `src/analytics.js`
- Test: `test/e2e/ui.mjs`
- Test: `test/unit/analytics.test.mjs`

**Interfaces:**
- Consumes: full `strings`, `CHARACTERS`, `TRAILS`, `MISSIONS`, meta functions.
- Produces:
  - `class Analytics { constructor({ enabled, storage, key = 'skyrunner.analytics.v1', now = () => Date.now() }); log(name, data); setEnabled(bool); prune(); events; }` — local only, max 200, drops entries older than 30 days, never throws.
  - `class UI { constructor(handlers); showMenu(save); showPlay(save,{daily}); showOver(result,save); showPause(); hideScreens(); updateHud(snapshot); toast(key,vars); openSettings(save); closeSettings(); openLocker(save); closeLocker(); setQuality(tier); setLowStim(bool); flash(kind); }`
  - `snapshot = { score, coins, distance, mult, streak, best, delta, daily }`.
  - `result = { score, distance, coins, maxCombo, duration, isBest, previousBest, delta, daily, dailyBest, unlockHint, missions }`.
  - Main handlers: `onStart`, `onDaily`, `onRetry`, `onMenu`, `onResume`, `onRestart`, `onSettingsChange`, `onUnlock`, `onWear`, `onReset`, `onPause`.
  - `window.__skyrunner.meta.save` (live Save), `.debug.grantCoins(n)`, `.state.daily`. `debug.grantCoins` adds to save and persists; tests use it to reach unlock prices.

- [ ] **Step 1: Write the failing UI E2E**

```js
// test/e2e/ui.mjs
import { connect, waitFor } from '../lib/cdp.mjs';
const { evaluate, close } = await connect(Number(process.env.CDP_PORT || 9333));
await evaluate(`localStorage.clear(); location.href = 'http://127.0.0.1:8123/?ui=' + Date.now()`);
await waitFor(async () => evaluate(`!!window.__skyrunner`), 20000);

await evaluate(`document.getElementById('playBtn').click()`);
await new Promise((r) => setTimeout(r, 600));
const hud = await evaluate(`({
  visible: getComputedStyle(document.getElementById('hud')).display !== 'none',
  score: document.getElementById('score').textContent,
  menuHidden: document.getElementById('menu').classList.contains('hidden')
})`);
if (!hud.visible || !hud.menuHidden) throw new Error('HUD/menu state wrong');
if (!/^\\d+$/.test(hud.score)) throw new Error('score not numeric');

await evaluate(`__skyrunner.debug.kill()`);
await new Promise((r) => setTimeout(r, 1600));
const over = await evaluate(`({
  shown: !document.getElementById('over').classList.contains('hidden'),
  delta: document.getElementById('overDelta').textContent,
  missions: document.querySelectorAll('#overMissions .mission-row').length
})`);
if (!over.shown) throw new Error('over not shown');
if (!over.delta.trim()) throw new Error('delta empty');
if (over.missions !== 3) throw new Error('missions not rendered');

await evaluate(`document.getElementById('retryBtn').click()`);
await new Promise((r) => setTimeout(r, 400));
const retried = await evaluate(`({ mode: __skyrunner.state.mode, score: __skyrunner.state.score })`);
if (retried.mode !== 'play' || retried.score !== 0) throw new Error('retry failed');

await evaluate(`document.getElementById('settingsBtn').click()`);
await new Promise((r) => setTimeout(r, 150));
await evaluate(`document.getElementById('lowStim').click()`);
const low = await evaluate(`__skyrunner.meta.save.settings.lowStim`);
if (low !== true) throw new Error('low stim not saved');
await evaluate(`location.reload()`);
await waitFor(async () => evaluate(`!!window.__skyrunner`), 20000);
const persisted = await evaluate(`({ low: __skyrunner.meta.save.settings.lowStim, cls: document.body.classList.contains('low-stim') })`);
if (!persisted.low || !persisted.cls) throw new Error('setting not persisted');

await evaluate(`__skyrunner.debug.grantCoins(300)`);
await evaluate(`document.getElementById('lockerBtn').click()`);
await new Promise((r) => setTimeout(r, 150));
const locked = await evaluate(`(() => {
  const b = document.querySelector('[data-buy="char.sunset"]');
  if (!b) return false;
  b.click(); return true;
})()`);
if (!locked) throw new Error('locker item missing');
const bought = await evaluate(`__skyrunner.meta.save.unlocked.includes('char.sunset')`);
if (!bought) throw new Error('unlock failed');

console.log(JSON.stringify({ hud, over, retried, persisted, bought }, null, 2));
close();
```

```js
// test/unit/analytics.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Analytics } from '../../src/analytics.js';

class Mem {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.get(k) ?? null; }
  setItem(k, v) { this.map.set(k, String(v)); }
}

test('disabled analytics writes nothing', () => {
  const a = new Analytics({ enabled: false, storage: new Mem() });
  a.log('run_start', {});
  assert.equal(a.events.length, 0);
});

test('events cap at 200 and prune after 30 days', () => {
  let now = 1_000_000_000_000;
  const a = new Analytics({ enabled: true, storage: new Mem(), now: () => now });
  for (let i = 0; i < 260; i++) a.log('run_start', { i });
  assert.equal(a.events.length, 200);
  now += 31 * 24 * 3600 * 1000;
  a.prune();
  assert.equal(a.events.length, 0);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test test/unit/analytics.test.mjs && node test/e2e/ui.mjs`
Expected: FAIL (missing elements/methods).

- [ ] **Step 3: Build the UI behavior**

- `showMenu`: fill best/runs/total/maxCombo, daily best, recent sparkline (inline SVG polyline), locker button, daily card; hide HUD/over.
- `showPlay`: hide menu/over/pause; show HUD; set daily chip text; reset HUD.
- `updateHud`: throttle DOM writes to 10Hz; score count-up by `Math.round`; combo ring `strokeDashoffset`; best gap: if `best > 0 && score < best` show `t('hud.bestGap',{n:best-score})` and width `%`; hide when 0.
- `showOver`: fill delta copy (`t('over.delta')`, `t('over.newBest')`, `t('over.near')` when `0 < -delta <= best*0.05`), stats, best, unlock hint, 3 mission rows; show confetti via `fx.confetti()` when new best.
- `openSettings`: reflect current values; quality segmented buttons; toggles; language; reset with two-step confirm.
- `openLocker`: render 4 character cards + 4 trail cards; price/owned/equipped; `data-buy`/`data-wear`; coins header.
- Toasts: stack up to 3; 2.2s.
- Low stim: `body.low-stim`, disable bloom/shake/confetti brightness, reduce particles; `reduce-motion` maps CSS.
- Keyboard focus: all controls are `<button>` with visible `:focus-visible`; `aria-label` on icon buttons.

- [ ] **Step 4: Wire main actions and meta**

- Start normal: `startRun(randomSeed)`, state.daily=false.
- Daily: `beginDailyAttempt`; `state.daily=true`, `state.dailyReward`; seed `dailySeed()`.
- `finishRun`: `applyRun(save, run, {reward: state.dailyReward})`; persist; `showOver(result, save)`; update best.
- Settings change: mutate save, persist, apply quality/lowStim/locale.
- Unlock/wear: call meta, persist, re-render locker.
- Reset: clear storage, reload.
- Analytics: construct with `save.settings.localStats`; log `session_start`, `run_start`, `run_end`, `restart_click`, `leave`; flip enabled on the settings toggle; prune on boot. No network calls.

- [ ] **Step 5: Run UI E2E and confirm pass**

Run: `node --test test/unit/analytics.test.mjs && node test/e2e/ui.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui.js src/analytics.js index.html styles.css src/main.js test/e2e/ui.mjs test/unit/analytics.test.mjs
git commit -m "feat: complete HUD, results, settings, locker and meta loop"
```

---

### Task 9: Near-miss feel, death sequence and audio

**Files:**
- Create: `src/audio.js`
- Modify: `src/main.js` (events, timeScale, death)
- Modify: `src/player.js` (shield/invuln)
- Modify: `src/world.js` (graze, shield)
- Modify: `src/fx.js` (hit feedback)
- Test: `test/e2e/feel.mjs`

**Interfaces:**
- Consumes: meta/save, FX, UI, strings.
- Produces:
  - `class AudioEngine { init(); play(name, opts); startMusic(); stopMusic(); setIntensity(v); duck(seconds); setMuted(bool); get running(); }`
  - Main `timeScale` for slow-mo; `state.mode === 'dying'`.
  - `Player.shield`, `Player.invuln` (seconds); `player.hit()` and `player.grantShield()`.
  - `window.__skyrunner.audio` (getters `running`, `muted`), `.combo`, `.timeScale`, `.state.trick`, `__skyrunner.debug.triggerEdge()`, `.shield()`, `.hit()`, `.kill()`.

- [ ] **Step 1: Write the failing feel E2E**

```js
// test/e2e/feel.mjs
import { connect, waitFor } from '../lib/cdp.mjs';
const { evaluate, close } = await connect(Number(process.env.CDP_PORT || 9333));
await evaluate(`location.href = 'http://127.0.0.1:8123/?feel=' + Date.now()`);
await waitFor(async () => evaluate(`!!window.__skyrunner`), 20000);
await evaluate(`__skyrunner.startRun(11)`);
await new Promise((r) => setTimeout(r, 700));

await evaluate(`__skyrunner.debug.triggerEdge()`);
await new Promise((r) => setTimeout(r, 250));
const edge = await evaluate(`({ trick: __skyrunner.state.trick, streak: __skyrunner.combo.streak, toast: document.querySelectorAll('#toasts .toast').length })`);
if (edge.trick < 150 || edge.streak < 1) throw new Error('edge not scored');

await evaluate(`__skyrunner.debug.shield()`);
const shield = await evaluate(`__skyrunner.player.shield`);
if (!shield) throw new Error('shield not granted');
await evaluate(`__skyrunner.debug.hit()`);
await new Promise((r) => setTimeout(r, 200));
const afterHit = await evaluate(`({ shield: __skyrunner.player.shield, mode: __skyrunner.state.mode })`);
if (afterHit.shield || afterHit.mode !== 'play') throw new Error('shield did not absorb hit');

await evaluate(`__skyrunner.debug.kill()`);
await new Promise((r) => setTimeout(r, 400));
const dying = await evaluate(`({ mode: __skyrunner.state.mode, scale: __skyrunner.timeScale, shown: !document.getElementById('over').classList.contains('hidden') })`);
if (dying.mode !== 'dying') throw new Error('no death sequence');
if (dying.shown) throw new Error('panel shown too early');
await new Promise((r) => setTimeout(r, 1200));
const over = await evaluate(`({ mode: __skyrunner.state.mode, shown: !document.getElementById('over').classList.contains('hidden') })`);
if (over.mode !== 'over' || !over.shown) throw new Error('death panel missing');

const audio = await evaluate(`({ running: __skyrunner.audio.running, muted: __skyrunner.audio.muted })`);
if (!audio.running) throw new Error('music not running');

console.log(JSON.stringify({ edge, afterHit, dying, over, audio }, null, 2));
close();
```

- [ ] **Step 2: Run and confirm failure**

Run: `node test/e2e/feel.mjs`
Expected: FAIL missing `debug.triggerEdge`/audio.

- [ ] **Step 3: Implement the feel events**

- Edge: `player` emits `{type:'edge', distance}` once per platform; main adds `CFG.edgeBonus` to `trick`, combo +1, FX ring, toast `t('toast.edge')` (add key if missing), audio `edge`, timeScale 0.35 for 0.12s real.
- Graze: world emits when within 1.2m and not hit; main adds `CFG.grazeBonus`, combo+1, toast/audio.
- Shield: spawn every 12–16 segments; HUD badge; `player.grantShield()`; on hit with shield: consume, invuln 0.6s, combo preserved, FX, audio, toast.
- Hit without shield: combo.break(), knockback (`vel.x *= -0.5; vel.z -= 3; vel.y = max(vel.y,7)`), invuln 0.9s, audio.
- Death: mode `dying`, timeScale 0.25, camera follows down, UI hides HUD, after 1.1s real → `finishRun`, mode `over`, panel; jump/Enter after 0.4s skips to panel.
- Best tick: when `score > best && best > 0` first time → toast + FX confetti + audio record; `state.newBest`.
- Milestones every 100m and biome change toast.

- [ ] **Step 4: Implement `src/audio.js`**

- `init` on first user gesture; master gain 0.5; music bus with delay send.
- SFX: jump (triangle up), land (3 impact tiers), coin (pentatonic step by streak), stomp, shield, edge, record, fall, over, ui, mission, unlock.
- Music: 92 BPM, 16th scheduler, Dmaj9–Bm9–Gmaj9–A9, layers pad/arp/bass/hat, each with its own gain; `setIntensity(0..1)` ramps arp/hat/bass; `duck()` lowers music bus for 1.2s; `setMuted` persists via meta.
- `stopMusic` clears scheduler.

- [ ] **Step 5: Run feel E2E and confirm pass**

Run: `node test/e2e/feel.mjs`
Expected: PASS; `edge.trick >= 150`, shield absorbs, `dying` then `over`, music running.

- [ ] **Step 6: Commit**

```bash
git add src/audio.js src/main.js src/player.js src/world.js src/fx.js test/e2e/feel.mjs
git commit -m "feat: near-miss feedback, death sequence and procedural audio"
```

---

### Task 10: Performance, adaptive quality, full suite and handoff

**Files:**
- Create: `test/perf.mjs`
- Create: `test/run-all.mjs`
- Create: `package.json`
- Create: `privacy.html`
- Modify: `src/quality.js` / `src/main.js` (manager integration)
- Modify: `README.md`
- Test: full suite

**Interfaces:**
- Consumes: everything.
- Produces:
  - `QualityManager` applies DPR/shadow/bloom/cloud/particle tiers and exposes `tier`, `mode`.
  - `window.__skyrunner.perf` with `{ samples: number[], reset(), snapshot() }` for tests.
  - `test/perf.mjs` outputs `{ p50,p95,p99,max,longFrames,drawCalls,tris,heapMB,fps }`.
  - `test/run-all.mjs` starts server + headless Chrome, runs unit + E2E, prints summary, exits 0/1.
  - `package.json` scripts: `test`, `test:unit`, `test:e2e`, `test:perf`, `shots`.

- [ ] **Step 1: Write the failing performance test**

```js
// test/perf.mjs
import { connect, waitFor } from './lib/cdp.mjs';
const PORT = Number(process.env.CDP_PORT || 9334);
const { evaluate, close } = await connect(PORT);
await evaluate(`location.href = 'http://127.0.0.1:8123/?perf=' + Date.now()`);
await waitFor(async () => evaluate(`!!window.__skyrunner`), 30000);
await evaluate(`__skyrunner.startRun(2026)`);
await new Promise((r) => setTimeout(r, 2000));
await evaluate(`__skyrunner.perf.reset()`);
await new Promise((r) => setTimeout(r, 6000));
const perf = await evaluate(`__skyrunner.perf.snapshot()`);
console.log(JSON.stringify(perf, null, 2));
if (perf.p99 > 25) throw new Error('p99 over 25ms: ' + perf.p99);
if (perf.longFrames > 0) throw new Error('long frames after warmup: ' + perf.longFrames);
if (perf.drawCalls > 140) throw new Error('draw calls over 140');
close();
```

- [ ] **Step 2: Run and confirm failure**

Run: `node test/perf.mjs` with headful Chrome on 9334.
Expected: FAIL missing `perf` or over budget.

- [ ] **Step 3: Integrate `QualityManager` and perf sampling**

- `main.js` records frame times after warmup into a ring buffer; `perf.snapshot()` computes p50/p95/p99, max, longFrames (>50ms), `renderer.info.render.calls`, triangles, heap.
- `QualityManager` reads settings `quality` (`auto|high|mid|low`); auto uses `QualityJudge`; applies tier on change:
  - DPR `min(devicePixelRatio, tier.dprCap)`
  - shadow map size; disable shadow map at low
  - bloom pass enabled/disabled (composer)
  - clouds visible count, particle cap
  - antialias cannot change at runtime; choose initial based on tier; document.
- On CPU 6× throttle (`Emulation.setCPUThrottlingRate`), auto must reach `low` within 10s.

- [ ] **Step 3b: Implement `test/run-all.mjs`**

Spawn `python -m http.server 8123` and headless Chrome (`--remote-debugging-port=9333 --user-data-dir=.chrome-test --headless=new --no-sandbox --disable-breakpad`) with `stdio:'ignore'`; poll `http://127.0.0.1:8123/` and `http://127.0.0.1:9333/json/version` for up to 20s. Run `node --test test/unit/` then `test/e2e/boot|play|world|visual|ui|feel.mjs` sequentially with `CDP_PORT=9333`; print a pass/fail table; in `finally` kill both processes; exit 1 if any failed. `--e2e` skips unit; `--perf` also runs `test/perf.mjs` against headful `:9334`.

- [ ] **Step 4: Optimize to budget**

- Cap DPR, shadow 1024, bloom at half-res.
- Cache geometries/materials; pool coins? At least shared geometry.
- Merge islands; single Points system; no per-frame allocations in hot loop.
- `renderer.info.autoReset = false` and reset once per frame so calls/tris are accurate after composer.
- Prewarm materials with `renderer.compile` and 2 hidden frames.
- Target: p99 ≤ 25ms at 1280×720 on AMD 610M.

- [ ] **Step 5: Add `package.json`, `privacy.html`, README**

- `package.json`: `{ "name":"skyrunner", "private":true, "type":"module", "scripts": { "test":"node test/run-all.mjs", "test:unit":"node --test test/unit/", "test:e2e":"node test/run-all.mjs --e2e", "test:perf":"node test/perf.mjs", "shots":"node test/shot.mjs" } }`.
- `privacy.html`: static page matching PRD §9.3, explains local-only events, 30-day retention, opt-out.
- README: new controls (auto-run), features, test commands, performance numbers, browser support, credits.

- [ ] **Step 6: Run the full suite**

Run:
```bash
node --test test/unit/
node test/e2e/boot.mjs
node test/e2e/play.mjs
node test/e2e/world.mjs
node test/e2e/visual.mjs
node test/e2e/ui.mjs
node test/e2e/feel.mjs
node test/perf.mjs
node test/shot.mjs
```
Expected: all PASS; screenshots in `docs/shots/`.

- [ ] **Step 7: Check transfer budget**

Run a CDP Network measurement (cache disabled) for `/`; record `encodedDataLength` sum.
Expected: gzip-equivalent ≤ 350KB. If over, remove unused vendor addons or defer bloom import.

- [ ] **Step 8: Commit and tag**

```bash
git add -A
git commit -m "feat: v1.1 top-tier rebuild with tests and performance report"
git tag v1.1.0
```

---

## Self-Review

- **Spec coverage:** §1 success metrics → Tasks 4/7/10; §3 control/feel → Task 5; §4 world → Tasks 1/6; §5 scoring/combo/edge/shield/death → Tasks 2/9; §6 meta → Tasks 3/8; §7 visual → Tasks 6/7; §8 audio → Task 9; §9 tech/quality/storage/privacy → Tasks 2/3/4/10; §10 tests → Tasks 1-10; §11 scope → all tasks; §12 decisions → enforced in Global Constraints.
- **Step scan:** Each step has a command, a file, or a precise signature. No "handle edge cases" placeholders.
- **Type consistency:** `Course.next()`/`ahead()`, `stepBody`, `applyRun`, `beginDailyAttempt`, `World.fixedUpdate/render`, `UI.showOver(result,save)`, `QualityJudge.push(frameMs,dt)` reused consistently.
- **Review Focus:** blur/pause (Task 5), multi-input (Task 5), storage failure (Task 3/8), resize (Task 4/8), huge frame gap (Task 2/5).
- **Proportion:** tasks carry signatures and assertions; bodies only where the algorithm is not determined (course rules, physics order, quality thresholds).
