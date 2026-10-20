import { connect, navigate, waitFor } from '../lib/cdp.mjs';

const base = process.env.BASE || 'http://127.0.0.1:8123';
const client = await connect(Number(process.env.CDP_PORT || 9333));
await navigate(client, `${base}/?world=${Date.now()}`);
await waitFor(async () => client.evaluate(`!!window.__skyrunner`), 20000);
await waitFor(async () => client.evaluate(`document.body.dataset.ready === '1'`), 20000);

await client.evaluate(`__skyrunner.startRun(42)`);
await new Promise((r) => setTimeout(r, 800));

const gen = await client.evaluate(`({
  platforms: __skyrunner.world.platforms.length,
  coins: __skyrunner.world.coins.length,
  ahead: Math.max(...__skyrunner.world.platforms.map(p => p.z)),
  colliders: __skyrunner.world.colliders.length
})`);
if (gen.platforms < 5 || gen.coins < 2 || gen.ahead < 40) throw new Error('world not generated: ' + JSON.stringify(gen));

const coin = await client.evaluate(`(() => {
  const c = __skyrunner.world.coins[0];
  return c ? { x: c.mesh.position.x, y: c.mesh.position.y, z: c.mesh.position.z } : null;
})()`);
if (!coin) throw new Error('no coin');
const before = await client.evaluate(`__skyrunner.state.coins`);
await client.evaluate(`__skyrunner.debug.teleport(${coin.x}, ${coin.y - 0.2}, ${coin.z})`);
await new Promise((r) => setTimeout(r, 500));
const after = await client.evaluate(`__skyrunner.state.coins`);
if (after <= before) throw new Error(`coin not collected: ${before} -> ${after}`);

const drone = await client.evaluate(`(() => {
  const d = __skyrunner.world.drones[0];
  return d ? { x: d.group.position.x, y: d.group.position.y, z: d.group.position.z } : null;
})()`);
if (!drone) throw new Error('no drone in first 80m');
await client.evaluate(`__skyrunner.debug.teleport(${drone.x}, ${drone.y + 0.8}, ${drone.z})`);
await client.evaluate(`__skyrunner.player.vel.y = -8`);
await new Promise((r) => setTimeout(r, 600));
const stomped = await client.evaluate(`({ coins: __skyrunner.state.coins, stomps: __skyrunner.state.stomps, vy: __skyrunner.player.vel.y })`);
if (stomped.stomps < 1) throw new Error('stomp not counted: ' + JSON.stringify(stomped));
if (stomped.coins < after + 2) throw new Error('stomp did not pay out');

const dailyA = await client.evaluate(`(() => {
  __skyrunner.startRun(__skyrunner.dailySeed());
  return __skyrunner.world.platforms.slice(0, 6).map(p => +p.z.toFixed(2));
})()`);
await new Promise((r) => setTimeout(r, 300));
const dailyB = await client.evaluate(`(() => {
  __skyrunner.startRun(__skyrunner.dailySeed());
  return __skyrunner.world.platforms.slice(0, 6).map(p => +p.z.toFixed(2));
})()`);
if (JSON.stringify(dailyA) !== JSON.stringify(dailyB)) throw new Error('daily seed unstable');

const errors = client.events
  .filter((e) => e.method === 'Runtime.exceptionThrown')
  .map((e) => e.params.exceptionDetails.text);
if (errors.length) throw new Error('exceptions: ' + errors.join(' | '));

console.log(JSON.stringify({ gen, before, after, stomped, dailyA }, null, 2));
client.close();
