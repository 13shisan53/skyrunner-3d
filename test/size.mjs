import fs from 'node:fs';
import zlib from 'node:zlib';

const files = [
  'index.html', 'styles.css',
  'src/main.js', 'src/config.js', 'src/strings.js', 'src/gen.js', 'src/score.js',
  'src/quality.js', 'src/physics.js', 'src/meta.js', 'src/analytics.js', 'src/input.js',
  'src/player.js', 'src/world.js', 'src/camera.js', 'src/fx.js', 'src/audio.js', 'src/ui.js',
  'vendor/three.module.js', 'vendor/addons/geometries/RoundedBoxGeometry.js',
];

let raw = 0;
let gz = 0;
const rows = [];
for (const file of files) {
  const buf = fs.readFileSync(file);
  const z = zlib.gzipSync(buf, { level: 9 });
  raw += buf.length;
  gz += z.length;
  rows.push({ file, raw: buf.length, gzip: z.length });
}
rows.sort((a, b) => b.gzip - a.gzip);
console.log(rows.map((r) => `${(r.gzip / 1024).toFixed(1).padStart(7)} KB gzip  ${r.file}`).join('\n'));
console.log(`\ntotal raw:  ${(raw / 1024).toFixed(1)} KB`);
console.log(`total gzip: ${(gz / 1024).toFixed(1)} KB`);
if (gz > 350 * 1024) {
  console.error('over 350KB gzip budget');
  process.exit(1);
}
