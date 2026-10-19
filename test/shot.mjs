// Capture in-game screenshots through CDP at chosen camera angles.
const PORT = Number(process.env.CDP_PORT || 9335);
const OUT = process.env.OUT_DIR || '.';
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

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${BASE}/?shot=${Date.now()}` });
await sleep(3000);

await evaluate(`document.getElementById('play').click()`);
await sleep(200);

const shots = [
  { name: 'start',  tp: [0, 1.15, 0],    cam: [Math.PI, 0.30] },
  { name: 'mid',    tp: [0, 7.45, 44],   cam: [2.9, 0.26] },
  { name: 'finish', tp: [0, 11.05, 61],  cam: [Math.PI + 0.5, 0.22] },
];

for (const s of shots) {
  await evaluate(`__skyrunner.teleport(${s.tp[0]}, ${s.tp[1]}, ${s.tp[2]}); __skyrunner.setCam(${s.cam[0]}, ${s.cam[1]});`);
  await sleep(2600);
  const res = await send('Page.captureScreenshot', { format: 'png' });
  const b64 = res.result.data;
  const fs = await import('node:fs/promises');
  const path = `${OUT}/shot-${s.name}.png`;
  await fs.writeFile(path, Buffer.from(b64, 'base64'));
  console.log('wrote', path);
}

ws.close();
process.exit(0);

