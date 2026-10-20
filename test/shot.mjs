import fs from 'node:fs/promises';
import { connect, navigate, waitFor } from './lib/cdp.mjs';

const base = process.env.BASE || 'http://127.0.0.1:8123';
const port = Number(process.env.CDP_PORT || 9333);
const out = process.env.OUT_DIR || 'docs/shots';
const client = await connect(port);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(name) {
  const res = await client.send('Page.captureScreenshot', { format: 'png' });
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(`${out}/${name}.png`, Buffer.from(res.result.data, 'base64'));
  console.log('wrote', `${out}/${name}.png`);
}

await client.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await client.evaluate(`localStorage.clear()`);
await navigate(client, `${base}/?shots=${Date.now()}`);
await waitFor(async () => client.evaluate(`document.body.dataset.ready === '1'`), 20000);
await sleep(700);
await shot('menu');

await client.evaluate(`document.getElementById('playBtn').click()`);
await sleep(800);
await client.evaluate(`__skyrunner.debug.freeze(true)`);
await sleep(400);
await client.evaluate(`__skyrunner.debug.setBiome(0)`);
await sleep(400);
await shot('play-dawn');
await client.evaluate(`__skyrunner.debug.setBiome(2)`);
await sleep(500);
await shot('play-dusk');
await client.evaluate(`__skyrunner.debug.setBiome(3)`);
await sleep(500);
await shot('play-night');

await client.evaluate(`__skyrunner.debug.freeze(false)`);
await client.evaluate(`__skyrunner.debug.kill()`);
await sleep(1700);
await shot('over');

await client.evaluate(`document.getElementById('menuBtn2').click()`);
await sleep(500);
await client.evaluate(`document.getElementById('settingsBtn').click()`);
await sleep(400);
await shot('settings');
await client.evaluate(`document.getElementById('closeSettings').click()`);
await sleep(250);

await client.evaluate(`__skyrunner.debug.grantCoins(300)`);
await client.evaluate(`document.getElementById('lockerBtn').click()`);
await sleep(400);
await shot('locker');
await client.evaluate(`document.getElementById('closeLocker').click()`);

await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await navigate(client, `${base}/?mobile=${Date.now()}`);
await waitFor(async () => client.evaluate(`document.body.dataset.ready === '1'`), 20000);
await sleep(600);
await shot('mobile-menu');
await client.evaluate(`document.getElementById('playBtn').click()`);
await sleep(800);
await client.evaluate(`__skyrunner.debug.freeze(true)`);
await sleep(400);
await shot('mobile-play');

client.close();
