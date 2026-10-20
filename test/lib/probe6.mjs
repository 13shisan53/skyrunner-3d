import { connect, navigate, waitFor } from './cdp.mjs';
import fs from 'node:fs/promises';
const c = await connect(9333);
await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await navigate(c, `http://127.0.0.1:8123/?dbg=${Date.now()}`);
await waitFor(async () => c.evaluate(`document.body.dataset.ready === '1'`), 20000);
await c.evaluate(`document.getElementById('playBtn').click()`);
await new Promise((r) => setTimeout(r, 1200));
console.log('post', await c.evaluate(`__skyrunner.debug.post()`));
async function shot(name) {
  const res = await c.send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(`docs/shots/${name}.png`, Buffer.from(res.result.data, 'base64'));
  console.log('wrote', name);
}
await c.evaluate(`__skyrunner.debug.bloom(false)`);
await new Promise((r) => setTimeout(r, 400));
await shot('debug-composer-nobloom');
await c.evaluate(`__skyrunner.debug.composer(false)`);
await new Promise((r) => setTimeout(r, 300));
await shot('debug-nocomposer');
c.close();
