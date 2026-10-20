import { connect, navigate, waitFor } from '../lib/cdp.mjs';

const base = process.env.BASE || 'http://127.0.0.1:8123';
const client = await connect(Number(process.env.CDP_PORT || 9333));
await client.evaluate(`localStorage.clear()`);
await navigate(client, `${base}/?ui=${Date.now()}`);
await waitFor(async () => client.evaluate(`!!window.__skyrunner`), 20000);
await waitFor(async () => client.evaluate(`document.body.dataset.ready === '1'`), 20000);

await client.evaluate(`document.getElementById('playBtn').click()`);
await new Promise((r) => setTimeout(r, 700));
const hud = await client.evaluate(`({
  visible: getComputedStyle(document.getElementById('hud')).display !== 'none',
  score: document.getElementById('score').textContent,
  menuHidden: document.getElementById('menu').classList.contains('hidden'),
  touchHidden: document.getElementById('touch').classList.contains('hidden')
})`);
if (!hud.visible || !hud.menuHidden) throw new Error('HUD/menu state wrong');
if (!/^\d+$/.test(hud.score)) throw new Error('score not numeric');

await client.evaluate(`__skyrunner.debug.kill()`);
await new Promise((r) => setTimeout(r, 1600));
const over = await client.evaluate(`({
  shown: !document.getElementById('over').classList.contains('hidden'),
  delta: document.getElementById('overDelta').textContent,
  missions: document.querySelectorAll('#overMissions .mission-row').length,
  mode: __skyrunner.state.mode
})`);
if (!over.shown) throw new Error('over not shown');
if (!over.delta.trim()) throw new Error('delta empty');
if (over.missions !== 3) throw new Error('missions not rendered: ' + over.missions);

await client.evaluate(`document.getElementById('retryBtn').click()`);
await new Promise((r) => setTimeout(r, 500));
const retried = await client.evaluate(`({ mode: __skyrunner.state.mode, score: __skyrunner.state.score })`);
if (retried.mode !== 'play' || retried.score > 400) throw new Error('retry failed: ' + JSON.stringify(retried));

await client.evaluate(`document.getElementById('settingsBtn').click()`);
await new Promise((r) => setTimeout(r, 150));
await client.evaluate(`document.getElementById('lowStim').click()`);
const low = await client.evaluate(`({ save: __skyrunner.meta.save.settings.lowStim, body: document.body.classList.contains('low-stim') })`);
if (!low.save || !low.body) throw new Error('low stim not applied');

await client.evaluate(`location.reload()`);
await waitFor(async () => client.evaluate(`!!window.__skyrunner`), 20000);
await waitFor(async () => client.evaluate(`document.body.dataset.ready === '1'`), 20000);
const persisted = await client.evaluate(`({ low: __skyrunner.meta.save.settings.lowStim, cls: document.body.classList.contains('low-stim') })`);
if (!persisted.low || !persisted.cls) throw new Error('setting not persisted');

await client.evaluate(`__skyrunner.debug.grantCoins(300)`);
await client.evaluate(`document.getElementById('lockerBtn').click()`);
await new Promise((r) => setTimeout(r, 150));
const cards = await client.evaluate(`document.querySelectorAll('#lockerChars .locker-card').length`);
if (cards !== 4) throw new Error('locker cards missing: ' + cards);
await client.evaluate(`document.querySelector('[data-buy="char.sunset"]').click()`);
await new Promise((r) => setTimeout(r, 150));
const bought = await client.evaluate(`({
  owned: __skyrunner.meta.save.unlocked.includes('char.sunset'),
  worn: __skyrunner.meta.save.worn.char,
  coins: __skyrunner.meta.save.coins
})`);
if (!bought.owned || bought.worn !== 'char.sunset') throw new Error('unlock failed: ' + JSON.stringify(bought));

await client.evaluate(`document.getElementById('closeLocker').click()`);
await client.evaluate(`document.getElementById('dailyBtn').click()`);
await new Promise((r) => setTimeout(r, 500));
const daily = await client.evaluate(`({
  mode: __skyrunner.state.mode,
  daily: __skyrunner.state.daily,
  chip: !document.getElementById('dailyChip').classList.contains('hidden')
})`);
if (daily.mode !== 'play' || !daily.daily || !daily.chip) throw new Error('daily start failed: ' + JSON.stringify(daily));

const errors = client.events
  .filter((e) => e.method === 'Runtime.exceptionThrown')
  .map((e) => e.params.exceptionDetails.text);
if (errors.length) throw new Error('exceptions: ' + errors.join(' | '));

console.log(JSON.stringify({ hud, over, retried, low, persisted, cards, bought, daily }, null, 2));
client.close();
