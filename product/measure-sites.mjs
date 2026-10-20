// Measure real-world load cost + runtime fps for SKYRUNNER and three references.
const PORT = Number(process.env.CDP_PORT || 9380);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SITES = [
  { name: 'SKYRUNNER（本产品）', url: 'https://13shisan53.github.io/skyrunner-3d/' },
  { name: 'bruno-simon.com（3D 交互网站）', url: 'https://bruno-simon.com/' },
  { name: 'chromedino.com（2D 网页游戏）', url: 'https://chromedino.com/' },
  { name: 'three.js 官方示例', url: 'https://threejs.org/examples/webgl_animation_keyframes.html' },
];

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
let net = { bytes: 0, count: 0, byType: {} };

ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
    return;
  }
  if (m.method === 'Network.loadingFinished') {
    const size = m.params.encodedDataLength || 0;
    net.bytes += size;
    net.count += 1;
  }
  if (m.method === 'Network.responseReceived') {
    const t = m.params.type;
    net.byType[t] = (net.byType[t] || 0) + 1;
  }
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
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

const results = [];

for (const site of SITES) {
  net = { bytes: 0, count: 0, byType: {} };
  const started = Date.now();

  try {
    await send('Page.navigate', { url: site.url });
  } catch (e) {
    results.push({ name: site.name, error: String(e.message || e) });
    continue;
  }

  // wait for load event or 30s
  let loaded = false;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    try {
      const ready = await evaluate(`document.readyState === 'complete'`);
      if (ready) { loaded = true; break; }
    } catch {}
  }

  await sleep(4000); // settle: late assets, animations

  let perf = null;
  try {
    perf = await evaluate(`(() => {
      const t = performance.timing;
      const nav = t.navigationStart;
      return {
        dcl: t.domContentLoadedEventEnd ? t.domContentLoadedEventEnd - nav : null,
        load: t.loadEventEnd ? t.loadEventEnd - nav : null,
        heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
        canvas: document.querySelectorAll('canvas').length
      };
    })()`);
  } catch {}

  let fps = null;
  try {
    fps = await evaluate(`new Promise((res) => {
      let n = 0; const t0 = performance.now();
      function f() {
        n++;
        if (performance.now() - t0 < 2000) requestAnimationFrame(f);
        else res(Math.round(n / ((performance.now() - t0) / 1000)));
      }
      requestAnimationFrame(f);
    })`);
  } catch {}

  results.push({
    name: site.name,
    loaded,
    wallMs: Date.now() - started,
    totalKB: +(net.bytes / 1024).toFixed(0),
    requests: net.count,
    byType: net.byType,
    dclMs: perf?.dcl ?? null,
    loadMs: perf?.load ?? null,
    heapMB: perf?.heapMB ?? null,
    canvas: perf?.canvas ?? null,
    fps,
  });
}

console.log(JSON.stringify(results, null, 2));
process.exit(0);
