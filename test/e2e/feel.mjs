import { connect, navigate, waitFor } from '../lib/cdp.mjs';

const base = process.env.BASE || 'http://127.0.0.1:8123';
const client = await connect(Number(process.env.CDP_PORT || 9333));
await client.evaluate(`localStorage.clear()`);
await navigate(client, `${base}/?feel=${Date.now()}`);
await waitFor(async () => client.evaluate(`!!window.__skyrunner`), 20000);
await waitFor(async () => client.evaluate(`document.body.dataset.ready === '1'`), 20000);

await client.evaluate(`__skyrunner.startRun(11)`);
await new Promise((r) => setTimeout(r, 700));
const audio = await client.evaluate(`({ running: __skyrunner.audio.running, muted: __skyrunner.audio.muted })`);
if (!audio.running) throw new Error('music not running at start');

await client.evaluate(`__skyrunner.debug.triggerEdge()`);
await new Promise((r) => setTimeout(r, 250));
const edge = await client.evaluate(`({
  trick: __skyrunner.state.trick,
  streak: __skyrunner.combo.streak,
  toasts: document.querySelectorAll('#toasts .toast').length
})`);
if (edge.trick < 150 || edge.streak < 1) throw new Error('edge not scored: ' + JSON.stringify(edge));

await client.evaluate(`__skyrunner.debug.shield()`);
const shield = await client.evaluate(`__skyrunner.player.shield`);
if (!shield) throw new Error('shield not granted');
await client.evaluate(`__skyrunner.debug.hit()`);
await new Promise((r) => setTimeout(r, 250));
const afterHit = await client.evaluate(`({ shield: __skyrunner.player.shield, mode: __skyrunner.state.mode, streak: __skyrunner.combo.streak })`);
if (afterHit.shield) throw new Error('shield did not absorb hit');
if (afterHit.mode !== 'play') throw new Error('shield hit ended run');

await client.evaluate(`__skyrunner.debug.kill()`);
await new Promise((r) => setTimeout(r, 450));
const dying = await client.evaluate(`({
  mode: __skyrunner.state.mode,
  scale: __skyrunner.timeScale,
  shown: !document.getElementById('over').classList.contains('hidden')
})`);
if (dying.mode !== 'dying') throw new Error('no death sequence: ' + JSON.stringify(dying));
if (dying.shown) throw new Error('panel shown too early');

await new Promise((r) => setTimeout(r, 900));
const over = await client.evaluate(`({
  mode: __skyrunner.state.mode,
  shown: !document.getElementById('over').classList.contains('hidden')
})`);
if (over.mode !== 'over' || !over.shown) throw new Error('death panel missing: ' + JSON.stringify(over));

const errors = client.events
  .filter((e) => e.method === 'Runtime.exceptionThrown')
  .map((e) => e.params.exceptionDetails.text);
if (errors.length) throw new Error('exceptions: ' + errors.join(' | '));

console.log(JSON.stringify({ audio, edge, afterHit, dying, over }, null, 2));
client.close();
