// Mengisi daftar berkas dan versi di sw.js dari isi folder aplikasi.
// Versi berasal dari hash isi berkas, jadi perubahan apa pun membuat service worker baru terpasang.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['index.html', 'manifest.webmanifest'];
const DIRS = ['css', 'js', 'icons'];

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

export function computeStamp() {
  const paths = [...FILES.map((f) => join(root, f)), ...DIRS.flatMap((d) => walk(join(root, d)))]
    .map((p) => relative(root, p).split(sep).join('/'))
    .sort();
  const hash = createHash('sha256');
  for (const p of paths) {
    hash.update(p);
    hash.update(readFileSync(join(root, p)));
  }
  return { version: hash.digest('hex').slice(0, 12), assets: ['./', ...paths.map((p) => `./${p}`)] };
}

export function stampBlock({ version, assets }) {
  const list = assets.map((a) => `  '${a}',`).join('\n');
  return `// @stamp-start\nconst VERSION = '${version}';\nconst ASSETS = [\n${list}\n];\n// @stamp-end`;
}

export const SW_PATH = join(root, 'sw.js');

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const source = readFileSync(SW_PATH, 'utf8');
  const stamp = computeStamp();
  writeFileSync(SW_PATH, source.replace(/\/\/ @stamp-start[\s\S]*\/\/ @stamp-end/, stampBlock(stamp)));
  console.log(`sw.js versi ${stamp.version}, ${stamp.assets.length} berkas`);
}
