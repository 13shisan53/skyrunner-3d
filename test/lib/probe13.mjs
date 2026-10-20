import { connect, navigate, waitFor } from './cdp.mjs';
import fs from 'node:fs/promises';
const c = await connect(9333);
await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await navigate(c, `http://127.0.0.1:8123/?dbg=${Date.now()}`);
await waitFor(async () => c.evaluate(`document.body.dataset.ready === '1'`), 20000);
async function shot(name) {
  const res = await c.send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(`docs/shots/${name}.png`, Buffer.from(res.result.data, 'base64'));
  console.log('wrote', name);
}
await new Promise((r) => setTimeout(r, 900));
await shot('menu-v11b');
await c.evaluate(`document.getElementById('playBtn').click()`);
await new Promise((r) => setTimeout(r, 650));
await shot('play-v11c');
console.log(await c.evaluate(`({ mode: __skyrunner.state.mode, z: __skyrunner.player.pos.z, fatal: window.__fatal })`));
c.close();
