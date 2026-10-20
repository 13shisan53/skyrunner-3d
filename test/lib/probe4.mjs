import { connect, navigate, waitFor } from './cdp.mjs';
import fs from 'node:fs/promises';
const c = await connect(9333);
await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await navigate(c, `http://127.0.0.1:8123/?dbg=${Date.now()}`);
await waitFor(async () => c.evaluate(`document.body.dataset.ready === '1'`), 20000);
await c.evaluate(`document.getElementById('playBtn').click()`);
await new Promise((r) => setTimeout(r, 1500));
console.log(await c.evaluate(`({
  fatal: window.__fatal,
  tier: __skyrunner.quality.tier,
  camera: { x: +__skyrunner.camera.position.x.toFixed(2), y: +__skyrunner.camera.position.y.toFixed(2), z: +__skyrunner.camera.position.z.toFixed(2) },
  player: { x: +__skyrunner.player.pos.x.toFixed(2), y: +__skyrunner.player.pos.y.toFixed(2), z: +__skyrunner.player.pos.z.toFixed(2) },
  calls: __skyrunner.renderer.info.render.calls,
  tris: __skyrunner.renderer.info.render.triangles,
  children: __skyrunner.scene.children.length
})`));
let res = await c.send('Page.captureScreenshot', { format: 'png' });
await fs.writeFile('docs/shots/debug-bloom.png', Buffer.from(res.result.data, 'base64'));
await c.evaluate(`__skyrunner.quality.setMode('low')`);
await new Promise((r) => setTimeout(r, 500));
res = await c.send('Page.captureScreenshot', { format: 'png' });
await fs.writeFile('docs/shots/debug-low.png', Buffer.from(res.result.data, 'base64'));
console.log('quality after', await c.evaluate(`({ tier: __skyrunner.quality.tier, fatal: window.__fatal })`));
c.close();
