import { connect, navigate, waitFor } from '../lib/cdp.mjs';

const base = process.env.BASE || 'http://127.0.0.1:8123';
const client = await connect(Number(process.env.CDP_PORT || 9333));
await navigate(client, `${base}/?visual=${Date.now()}`);
await waitFor(async () => client.evaluate(`!!window.__skyrunner`), 20000);
await waitFor(async () => client.evaluate(`document.body.dataset.ready === '1'`), 20000);

await client.evaluate(`__skyrunner.startRun(7)`);
await new Promise((r) => setTimeout(r, 900));

const info = await client.evaluate(`({
  calls: __skyrunner.renderer.info.render.calls,
  tris: __skyrunner.renderer.info.render.triangles,
  clouds: __skyrunner.world.cloudCount,
  sky: __skyrunner.world.skyUniforms ? 'yes' : 'no',
  fx: !!__skyrunner.fx,
  scenery: __skyrunner.world.scenery.children.length
})`);
if (info.calls < 20) throw new Error('scene too empty: ' + info.calls);
if (info.calls > 140) throw new Error('draw calls over budget: ' + info.calls);
if (info.tris > 140000) throw new Error('triangles over budget: ' + info.tris);
if (info.clouds < 20) throw new Error('no cloud layers: ' + info.clouds);
if (info.sky !== 'yes') throw new Error('sky uniforms missing');
if (!info.fx) throw new Error('fx missing');

for (const biome of [1, 2, 3]) {
  await client.evaluate(`__skyrunner.debug.setBiome(${biome})`);
  await new Promise((r) => setTimeout(r, 250));
  const current = await client.evaluate(`__skyrunner.world.biome`);
  if (current !== biome) throw new Error(`biome did not switch to ${biome}: ${current}`);
}

const errors = client.events
  .filter((e) => e.method === 'Runtime.exceptionThrown')
  .map((e) => e.params.exceptionDetails.text);
if (errors.length) throw new Error('exceptions: ' + errors.join(' | '));

console.log(JSON.stringify({ info, biome: 3 }, null, 2));
client.close();
