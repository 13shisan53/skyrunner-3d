import { connect, navigate, waitFor } from './lib/cdp.mjs';

const PORT = Number(process.env.CDP_PORT || 9334);
const base = process.env.BASE || 'http://127.0.0.1:8123';
const client = await connect(PORT);
await client.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await navigate(client, `${base}/?perf=${Date.now()}`);
await waitFor(async () => client.evaluate(`!!window.__skyrunner`), 30000);
await waitFor(async () => client.evaluate(`document.body.dataset.ready === '1'`), 30000);

await client.evaluate(`__skyrunner.startRun(2026)`);
await new Promise((r) => setTimeout(r, 1200));
await client.evaluate(`__skyrunner.debug.freeze(true)`);
await client.evaluate(`__skyrunner.quality.setMode('high')`);
await new Promise((r) => setTimeout(r, 500));
const gpu = await client.evaluate(`(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
})()`);
console.log('gpu:', gpu);

await client.evaluate(`__skyrunner.perf.reset()`);
await new Promise((r) => setTimeout(r, 6000));
const perf = await client.evaluate(`__skyrunner.perf.snapshot()`);
console.log(JSON.stringify(perf, null, 2));

await client.send('Emulation.setCPUThrottlingRate', { rate: 6 });
await client.evaluate(`__skyrunner.quality.setMode('auto')`);
await new Promise((r) => setTimeout(r, 10000));
const throttled = await client.evaluate(`({ tier: __skyrunner.quality.tier, mode: __skyrunner.quality.mode })`);
await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
console.log('throttled:', JSON.stringify(throttled));

const errors = client.events
  .filter((e) => e.method === 'Runtime.exceptionThrown')
  .map((e) => e.params.exceptionDetails.text);
if (errors.length) throw new Error('exceptions: ' + errors.join(' | '));
if (perf.p95 > 25) throw new Error('p95 over 25ms: ' + perf.p95);
if (perf.p99 > 32) throw new Error('p99 over 32ms: ' + perf.p99);
if (perf.fps < 60) throw new Error('average fps below 60: ' + perf.fps);
if (perf.longFrames > 0) throw new Error('long frames after warmup: ' + perf.longFrames);
if (perf.drawCalls > 140) throw new Error('draw calls over budget: ' + perf.drawCalls);
if (perf.tris > 140000) throw new Error('triangles over budget: ' + perf.tris);
if (throttled.tier !== 'low') throw new Error('auto quality did not reach low under 6x CPU throttle: ' + JSON.stringify(throttled));

client.close();
