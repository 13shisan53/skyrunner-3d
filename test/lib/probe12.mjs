import { connect, navigate, waitFor } from './cdp.mjs';
import fs from 'node:fs/promises';
const c = await connect(9333);
await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await navigate(c, `http://127.0.0.1:8123/?dbg=${Date.now()}`);
await waitFor(async () => c.evaluate(`document.body.dataset.ready === '1'`), 20000);
await c.evaluate(`document.getElementById('playBtn').click()`);
await new Promise((r) => setTimeout(r, 600));
await c.evaluate(`__skyrunner.debug.kill()`);
await new Promise((r) => setTimeout(r, 1800));
console.log(await c.evaluate(`({
  mode: __skyrunner.state.mode,
  overClass: document.getElementById('over').className,
  delta: document.getElementById('overDelta').textContent,
  score: document.getElementById('overScore').textContent,
  panelRect: (() => { const r = document.querySelector('#over .panel').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })(),
  panelBg: getComputedStyle(document.querySelector('#over .panel')).background,
  overlayBg: getComputedStyle(document.getElementById('over')).background
})`));
const res = await c.send('Page.captureScreenshot', { format: 'png' });
await fs.writeFile('docs/shots/debug-over.png', Buffer.from(res.result.data, 'base64'));
console.log('wrote');
c.close();
