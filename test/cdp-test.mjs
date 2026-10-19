// Functional smoke test for SKYRUNNER (endless edition) via Chrome DevTools Protocol.
// Start Chrome with --remote-debugging-port=9333 and serve the folder on :8123.
const PORT = Number(process.env.CDP_PORT || 9333);
const BASE = process.env.BASE || 'http://127.0.0.1:8123';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('devtools target not found');
}

const ws = new WebSocket(await wsUrl());
await new Promise((res) => ws.addEventListener('open', res));

let seq = 0;
const pending = new Map();
const events = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  else if (msg.method) events.push(msg);
});
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res) => pending.set(id, res));
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
}

await send('Runtime.enable');
await send('Page.enable');

/* ---------- desktop pass ---------- */
await send('Page.navigate', { url: `${BASE}/?desktop=${Date.now()}` });
for (let i = 0; i < 40; i++) {
  if (await evaluate(`!!window.__skyrunner || !!window.__fatal`)) break;
  await sleep(500);
}
await sleep(600);

const boot = await evaluate(`(() => ({
  ready: document.body.dataset.ready || null,
  fatal: window.__fatal || null,
  hasGame: !!window.__skyrunner,
  platforms: __skyrunner.platforms.length,
  touchClass: document.body.classList.contains('touch')
}))()`);

await evaluate(`document.getElementById('play').click()`);
await sleep(300);

const before = await evaluate(`({ z: +__skyrunner.player.pos.z.toFixed(2), score: __skyrunner.state.score, mode: __skyrunner.state.mode })`);
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))`);
await sleep(700);
await evaluate(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))`);
await sleep(80);
const afterMove = await evaluate(`({
  z: +__skyrunner.player.pos.z.toFixed(2),
  y: +__skyrunner.player.pos.y.toFixed(2),
  grounded: __skyrunner.player.grounded,
  score: __skyrunner.state.score
})`);

await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))`);
await sleep(220);
const jump = await evaluate(`({ y: +__skyrunner.player.pos.y.toFixed(2), vy: +__skyrunner.player.vel.y.toFixed(2) })`);
await evaluate(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }))`);
await sleep(900);

/* coin pickup */
const coinsBefore = await evaluate(`__skyrunner.state.coins`);
await evaluate(`(() => {
  const g = __skyrunner;
  const c = g.coins[0];
  if (c) g.teleport(c.mesh.position.x, c.mesh.position.y - 0.3, c.mesh.position.z);
})()`);
await sleep(500);
const coinsAfter = await evaluate(`__skyrunner.state.coins`);

/* world keeps generating */
const gen = await evaluate(`({ platforms: __skyrunner.platforms.length, newestZ: Math.max.apply(null, __skyrunner.platforms.map(p => p.z)) })`);

/* fall => game over */
await evaluate(`__skyrunner.teleport(0, -25, 10)`);
await sleep(400);
const over = await evaluate(`({
  mode: __skyrunner.state.mode,
  overlay: !document.getElementById('over').classList.contains('hidden'),
  score: __skyrunner.state.score,
  best: __skyrunner.state.best
})`);

/* restart */
await evaluate(`document.getElementById('again').click()`);
await sleep(400);
const restarted = await evaluate(`({ mode: __skyrunner.state.mode, score: __skyrunner.state.score, z: +__skyrunner.player.pos.z.toFixed(2) })`);

const music = await evaluate(`__skyrunner.musicRunning()`);

/* ---------- mobile pass ---------- */
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: `${BASE}/?mobile=${Date.now()}` });
for (let i = 0; i < 40; i++) {
  if (await evaluate(`!!window.__skyrunner || !!window.__fatal`)) break;
  await sleep(500);
}
await sleep(600);

const mobileBoot = await evaluate(`({
  touchClass: document.body.classList.contains('touch'),
  stickVisible: getComputedStyle(document.getElementById('stick')).display !== 'none',
  jumpVisible: getComputedStyle(document.getElementById('jump')).display !== 'none',
  fatal: window.__fatal || null
})`);

await evaluate(`document.getElementById('play').click()`);
await sleep(300);

/* joystick drag */
await evaluate(`(() => {
  const s = document.getElementById('stick');
  const r = s.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  s.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 11, clientX: cx, clientY: cy - 40, bubbles: true }));
  s.dispatchEvent(new PointerEvent('pointermove', { pointerId: 11, clientX: cx, clientY: cy - 40, bubbles: true }));
})()`);
await sleep(800);
const stickMove = await evaluate(`({ z: +__skyrunner.player.pos.z.toFixed(2) })`);
await evaluate(`document.getElementById('stick').dispatchEvent(new PointerEvent('pointerup', { pointerId: 11, bubbles: true }))`);

/* jump button */
const yBefore = await evaluate(`+__skyrunner.player.pos.y.toFixed(2)`);
await evaluate(`document.getElementById('jump').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 12, bubbles: true }))`);
await sleep(220);
const yAfter = await evaluate(`+__skyrunner.player.pos.y.toFixed(2)`);
await evaluate(`document.getElementById('jump').dispatchEvent(new PointerEvent('pointerup', { pointerId: 12, bubbles: true }))`);

const exceptions = events.filter((e) => e.method === 'Runtime.exceptionThrown')
  .map((e) => e.params.exceptionDetails.text + ' :: ' + (e.params.exceptionDetails.exception?.description || ''));
const consoleErrors = events.filter((e) => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
  .map((e) => e.params.args.map((a) => a.value || a.description).join(' '));

console.log(JSON.stringify({
  boot, before, afterMove, jump, coinsBefore, coinsAfter, gen, over, restarted, music,
  mobile: { mobileBoot, stickMove, jumpButton: { yBefore, yAfter } },
  exceptions, consoleErrors,
}, null, 2));

ws.close();
process.exit(0);
