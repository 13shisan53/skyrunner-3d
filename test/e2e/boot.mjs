import { connect, waitFor, navigate } from '../lib/cdp.mjs';

const base = process.env.BASE || 'http://127.0.0.1:8123';
const client = await connect(Number(process.env.CDP_PORT || 9333));
await navigate(client, `${base}/?boot=${Date.now()}`);
await waitFor(async () => client.evaluate(`!!window.__skyrunner`), 20000);
await waitFor(async () => client.evaluate(`document.body.dataset.ready === '1'`), 20000);

const boot = await client.evaluate(`({
  ready: document.body.dataset.ready,
  fatal: window.__fatal,
  menu: !document.getElementById('menu').classList.contains('hidden'),
  calls: __skyrunner.renderer.info.render.calls,
  tier: __skyrunner.quality.tier,
  title: document.title,
  loadingGone: document.getElementById('loading').classList.contains('gone')
})`);
if (boot.fatal) throw new Error(boot.fatal);
if (boot.ready !== '1') throw new Error('not ready');
if (!boot.menu) throw new Error('menu hidden');
if (boot.calls < 1) throw new Error('nothing rendered');
if (!['high', 'mid', 'low'].includes(boot.tier)) throw new Error('bad tier');
if (!boot.loadingGone) throw new Error('loading veil not dismissed');

await client.evaluate(`__skyrunner.debug.resize(390, 844)`);
await new Promise((r) => setTimeout(r, 250));
const aspect = await client.evaluate(`+__skyrunner.camera.aspect.toFixed(3)`);
if (Math.abs(aspect - 390 / 844) > 0.01) throw new Error('aspect not updated');

const errors = client.events
  .filter((e) => e.method === 'Runtime.exceptionThrown')
  .map((e) => e.params.exceptionDetails.text);
if (errors.length) throw new Error('exceptions: ' + errors.join(' | '));

console.log(JSON.stringify({ boot, aspect }, null, 2));
client.close();
