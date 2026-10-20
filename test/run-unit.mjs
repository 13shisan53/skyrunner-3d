import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), 'test', 'unit');
const files = readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).map((f) => path.join(dir, f));
const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
