// Functional smoke test for SKYRUNNER via Chrome DevTools Protocol.
// Requires Chrome started with --remote-debugging-port=9333 and the local server on :8123.
const PORT = 9333;
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
await send('Page.navigate', { url: `${BASE}/?nocache=${Date.now()}` });

// wait for the module to boot (a cold load of three.js can take a couple of seconds)
for (let i = 0; i < 40; i++) {
  const up = await evaluate(`!!window.__skyrunner || !!window.__fatal`);
  if (up) break;
  await sleep(500);
}
await sleep(600);

const boot = await evaluate(`(() => ({
  ready: document.body.dataset.ready || null,
  fatal: window.__fatal || null,
  hasGame: !!window.__skyrunner,
  coinsTotal: document.getElementById('coinsTotal').textContent,
  canvasW: document.getElementById('game').width
}))()`);

await evaluate(`document.getElementById('play').click()`);
await sleep(300);

const before = await evaluate(`({ z: +__skyrunner.player.pos.z.toFixed(2), y: +__skyrunner.player.pos.y.toFixed(2) })`);
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))`);
await sleep(600);
await evaluate(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))`);
await sleep(60);
const afterMove = await evaluate(`({
  z: +__skyrunner.player.pos.z.toFixed(2),
  y: +__skyrunner.player.pos.y.toFixed(2),
  grounded: __skyrunner.player.grounded
})`);

await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))`);
await sleep(200);
const jump = await evaluate(`({ y: +__skyrunner.player.pos.y.toFixed(2), vy: +__skyrunner.player.vel.y.toFixed(2) })`);
await evaluate(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }))`);
await sleep(900);

const coinsBefore = await evaluate(`__skyrunner.state.coins`);
await evaluate(`(() => {
  const g = window.__skyrunner, c = g.coins[0];
  g.player.pos.set(c.mesh.position.x, c.mesh.position.y - 0.3, c.mesh.position.z);
})()`);
await sleep(400);
const coinsAfter = await evaluate(`__skyrunner.state.coins`);

await evaluate(`__skyrunner.player.pos.set(0, 11.05, 63.5)`);
await sleep(500);
const winState = await evaluate(`({
  mode: __skyrunner.state.mode,
  overlay: !document.getElementById('win').classList.contains('hidden')
})`);

const exceptions = events
  .filter((e) => e.method === 'Runtime.exceptionThrown')
  .map((e) => e.params.exceptionDetails.text + ' :: ' + (e.params.exceptionDetails.exception?.description || ''));
const consoleErrors = events
  .filter((e) => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
  .map((e) => e.params.args.map((a) => a.value || a.description).join(' '));

console.log(JSON.stringify({ boot, before, afterMove, jump, coinsBefore, coinsAfter, winState, exceptions, consoleErrors }, null, 2));
ws.close();
process.exit(0);
