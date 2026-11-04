// Memastikan sw.js sudah diperbarui, supaya aplikasi offline tidak kehilangan berkas setelah rilis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { computeStamp, SW_PATH } from '../tools/stamp-sw.mjs';

test('sw.js memakai versi dan daftar berkas terbaru. Kalau gagal, jalankan npm run stamp', () => {
  const source = readFileSync(SW_PATH, 'utf8');
  const { version, assets } = computeStamp();
  assert.ok(source.includes(`const VERSION = '${version}';`));
  for (const asset of assets) assert.ok(source.includes(`'${asset}'`), asset);
});

test('semua berkas yang dirujuk index.html dan manifest ada di daftar service worker', () => {
  const root = new URL('../', import.meta.url);
  const { assets } = computeStamp();
  const html = readFileSync(new URL('index.html', root), 'utf8');
  const manifest = JSON.parse(readFileSync(new URL('manifest.webmanifest', root), 'utf8'));
  const refs = [
    ...[...html.matchAll(/(?:href|src)="(\.\/[^"]+)"/g)].map((m) => m[1]),
    ...manifest.icons.map((i) => i.src),
  ];
  assert.ok(refs.length >= 6);
  for (const ref of refs) {
    assert.ok(assets.includes(ref), `${ref} belum masuk daftar`);
    assert.ok(existsSync(new URL(ref, root)), `${ref} tidak ada`);
  }
});
