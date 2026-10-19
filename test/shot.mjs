// Capture in-game screenshots (desktop + mobile) through CDP.
const PORT = Number(process.env.CDP_PORT || 9335);
const OUT = process.env.OUT_DIR || '.';
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
  throw new Error('no target');
}

const ws = new WebSocket(await wsUrl());
await new Promise((r) => ws.addEventListener('open', r));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((r) => pending.set(id, r));
};
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};
const fs = await import('node:fs/promises');
async function shot(name) {
  const res = await send('Page.captureScreenshot', { format: 'png' });
  const path = `${OUT}/${name}.png`;
  await fs.writeFile(path, Buffer.from(res.result.data, 'base64'));
  console.log('wrote', path);
}

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${BASE}/?shot=${Date.now()}` });
for (let i = 0; i < 40; i++) {
  if (await evaluate(`!!window.__skyrunner`)) break;
  await sleep(500);
}
await sleep(600);

await evaluate(`document.getElementById('play').click()`);
await sleep(1200);
await evaluate(`__skyrunner.setCam(Math.PI, 0.28)`);
await sleep(1500);
await shot('desktop-start');

/* move the camera and player ahead onto a real platform */
await evaluate(`(() => {
  const g = __skyrunner;
  const p = g.platforms[5];
  if (p) g.teleport(p.group.position.x, p.group.position.y + 0.56, p.group.position.z - 1);
  g.setCam(2.75, 0.26);
})()`);
await sleep(2200);
await shot('desktop-mid');

/* mobile viewport */
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: `${BASE}/?mobile=${Date.now()}` });
for (let i = 0; i < 40; i++) {
  if (await evaluate(`!!window.__skyrunner`)) break;
  await sleep(500);
}
await sleep(500);
await shot('mobile-start');
await evaluate(`document.getElementById('play').click()`);
await sleep(2500);
await shot('mobile-play');

ws.close();
process.exit(0);
