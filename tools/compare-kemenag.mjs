// Membandingkan hasil hitung lokal dengan data Kemenag.
// --kota menampilkan selisih rata-rata per kota, dipakai untuk mengisi nilai dip di daftar kota.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prayerTimes, CITIES } from '../js/prayer.js';
import { hmToMin } from '../js/date.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => JSON.parse(readFileSync(join(root, 'tests', 'fixtures', name), 'utf8')).rows;
const rows = [...read('kemenag.json'), ...read('kemenag-cities.json')];
const keys = ['imsak', 'subuh', 'terbit', 'dhuha', 'dzuhur', 'ashar', 'maghrib', 'isya'];
const stats = Object.fromEntries(keys.map((k) => [k, { sum: 0, abs: 0, max: 0, n: 0, over1: 0 }]));
const perCity = {};

for (const row of rows) {
  const loc = CITIES.find((c) => c.name === row.city);
  const t = prayerTimes(row.date, loc, { method: 'kemenag' });
  const c = (perCity[row.city] ??= Object.fromEntries(keys.map((k) => [k, []])));
  for (const k of keys) {
    const d = t[k] - hmToMin(row[k]);
    const s = stats[k];
    s.sum += d;
    s.abs += Math.abs(d);
    s.max = Math.max(s.max, Math.abs(d));
    s.n += 1;
    if (Math.abs(d) > 1) s.over1 += 1;
    c[k].push(d);
  }
}

for (const k of keys) {
  const s = stats[k];
  console.log(k.padEnd(8), 'rata2', (s.sum / s.n).toFixed(2).padStart(6), ' abs', (s.abs / s.n).toFixed(2).padStart(5), ' maks', s.max, ' >1mnt', s.over1, 'dari', s.n);
}

if (process.argv.includes('--kota')) {
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  for (const [city, c] of Object.entries(perCity)) {
    const line = keys.filter((k) => k !== 'imsak').map((k) => `${k}:${mean(c[k]).toFixed(1)}`).join(' ');
    console.log(city.padEnd(16), line);
  }
}
