import { connect, navigate, waitFor } from '../lib/cdp.mjs';

const base = process.env.BASE || 'http://127.0.0.1:8123';
const client = await connect(Number(process.env.CDP_PORT || 9333));
await navigate(client, `${base}/?play=${Date.now()}`);
await waitFor(async () => client.evaluate(`!!window.__skyrunner`), 20000);
await waitFor(async () => client.evaluate(`document.body.dataset.ready === '1'`), 20000);

await client.evaluate(`document.getElementById('playBtn').click()`);
await new Promise((r) => setTimeout(r, 900));
const start = await client.evaluate(`({ mode: __skyrunner.state.mode, z: +__skyrunner.player.pos.z.toFixed(2), grounded: __skyrunner.player.grounded })`);
if (start.mode !== 'play') throw new Error('mode not play');
if (start.z <= 0.5) throw new Error('not auto-running: z=' + start.z);

await client.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }))`);
await new Promise((r) => setTimeout(r, 500));
await client.evaluate(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }))`);
const steer = await client.evaluate(`+__skyrunner.player.pos.x.toFixed(2)`);
if (steer <= 0.1) throw new Error('no lateral movement: x=' + steer);

const y0 = await client.evaluate(`+__skyrunner.player.pos.y.toFixed(2)`);
await client.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))`);
await new Promise((r) => setTimeout(r, 200));
const y1 = await client.evaluate(`+__skyrunner.player.pos.y.toFixed(2)`);
await client.evaluate(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }))`);
if (y1 <= y0 + 0.3) throw new Error(`jump did not rise: ${y0} -> ${y1}`);

await client.evaluate(`window.dispatchEvent(new Event('blur'))`);
await new Promise((r) => setTimeout(r, 120));
const blurred = await client.evaluate(`({
  steer: __skyrunner.input.state.steer,
  held: __skyrunner.input.state.jumpHeld,
  mode: __skyrunner.state.mode
})`);
if (blurred.steer !== 0 || blurred.held !== false) throw new Error('input not cleared on blur');
if (blurred.mode !== 'paused') throw new Error('blur did not pause');

await client.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))`);
await new Promise((r) => setTimeout(r, 150));
const resumed = await client.evaluate(`__skyrunner.state.mode`);
if (resumed !== 'play') throw new Error('escape did not resume: ' + resumed);

await client.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))`);
await new Promise((r) => setTimeout(r, 150));
const paused = await client.evaluate(`__skyrunner.state.mode`);
if (paused !== 'paused') throw new Error('escape did not pause: ' + paused);

const errors = client.events
  .filter((e) => e.method === 'Runtime.exceptionThrown')
  .map((e) => e.params.exceptionDetails.text);
if (errors.length) throw new Error('exceptions: ' + errors.join(' | '));

console.log(JSON.stringify({ start, steer, y0, y1, blurred, resumed, paused }, null, 2));
client.close();
