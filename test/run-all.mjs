import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8123';
const args = new Set(process.argv.slice(2));
const e2eOnly = args.has('--e2e');
const withPerf = args.has('--perf');
const started = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function up(url, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 404) return true;
    } catch {}
    await sleep(250);
  }
  return false;
}

async function ensureServer() {
  if (await up(`${BASE}/`)) return;
  const child = spawn('python', ['-m', 'http.server', '8123', '--bind', '127.0.0.1'], {
    cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true,
  });
  child.unref();
  started.push(child);
  if (!(await up(`${BASE}/`, 20000))) throw new Error('static server did not start');
}

async function ensureChrome(port, gpu) {
  if (await up(`http://127.0.0.1:${port}/json/version`)) return;
  const profile = path.join(ROOT, gpu ? '.chrome-gpu-test' : '.chrome-test');
  fs.mkdirSync(profile, { recursive: true });
  const flags = [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--window-size=1280,800',
    '--no-first-run',
    '--no-default-browser-check',
    '--no-sandbox',
    '--disable-breakpad',
    '--disable-crash-reporter',
    '--mute-audio',
  ];
  if (gpu) flags.push('--enable-gpu', '--use-angle=d3d11', '--disable-gpu-sandbox');
  const child = spawn(CHROME, flags, { cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  started.push(child);
  if (!(await up(`http://127.0.0.1:${port}/json/version`, 25000))) throw new Error('Chrome did not start on ' + port);
}

function stopAll() {
  for (const child of started) {
    try {
      if (child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {}
  }
  started.length = 0;
}

const results = [];

function run(label, argsArr, env) {
  console.log(`\n=== ${label} ===`);
  const r = spawnSync(process.execPath, argsArr, {
    cwd: ROOT, stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  results.push({ label, ok: r.status === 0 });
  return r.status === 0;
}

try {
  await ensureServer();
  await ensureChrome(9333, false);

  let ok = true;
  if (!e2eOnly) ok = run('unit', ['test/run-unit.mjs']) && ok;
  ok = run('size', ['test/size.mjs']) && ok;

  for (const name of ['boot', 'play', 'world', 'visual', 'ui', 'feel']) {
    ok = run(`e2e:${name}`, [`test/e2e/${name}.mjs`], { BASE, CDP_PORT: '9333' }) && ok;
  }

  if (withPerf) {
    await ensureChrome(9335, true);
    ok = run('perf', ['test/perf.mjs'], { BASE, CDP_PORT: '9335' }) && ok;
  }

  console.log('\n=== summary ===');
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}`);
  process.exitCode = ok ? 0 : 1;
} catch (err) {
  console.error('runner error:', err.message || err);
  process.exitCode = 1;
} finally {
  stopAll();
}
