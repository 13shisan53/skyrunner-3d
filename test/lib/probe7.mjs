import { connect, navigate, waitFor } from './cdp.mjs';
import fs from 'node:fs/promises';
const c = await connect(9333);
await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await navigate(c, `http://127.0.0.1:8123/?dbg=${Date.now()}`);
await waitFor(async () => c.evaluate(`document.body.dataset.ready === '1'`), 20000);
await c.evaluate(`document.getElementById('playBtn').click()`);
await new Promise((r) => setTimeout(r, 1200));
async function shot(name) {
  const res = await c.send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(`docs/shots/${name}.png`, Buffer.from(res.result.data, 'base64'));
  console.log('wrote', name);
}
console.log('passes', await c.evaluate(`__skyrunner.post.composer.passes.map(p => p.constructor.name)`));
await c.evaluate(`__skyrunner.post.bloom.strength = 0`);
await new Promise((r) => setTimeout(r, 400));
await shot('debug-bloom-strength0');
await c.evaluate(`__skyrunner.post.bloom.strength = 0.48; __skyrunner.post.bloom.threshold = 10`);
await new Promise((r) => setTimeout(r, 400));
await shot('debug-bloom-threshold10');
await c.evaluate(`__skyrunner.post.composer.passes.pop()`);
await new Promise((r) => setTimeout(r, 400));
await shot('debug-nooutput');
console.log('fatal', await c.evaluate(`window.__fatal`));
c.close();
