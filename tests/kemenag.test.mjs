// Jadwal hitungan lokal dibandingkan dengan data Kemenag yang tersimpan di tests/fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prayerTimes, CITIES } from '../js/prayer.js';
import { hmToMin } from '../js/date.js';

const read = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')).rows;
const rows = [...read('kemenag.json'), ...read('kemenag-cities.json')];
const KEYS = ['imsak', 'subuh', 'terbit', 'dhuha', 'dzuhur', 'ashar', 'maghrib', 'isya'];

test('semua kota di data pembanding ada di daftar aplikasi', () => {
  const names = new Set(CITIES.map((c) => c.name));
  assert.ok(rows.length >= 100);
  for (const row of rows) assert.ok(names.has(row.city), row.city);
  assert.equal(new Set(rows.map((r) => r.city)).size, CITIES.length);
});

test('selisih dengan Kemenag paling banyak 1 menit di semua kota', () => {
  const misses = [];
  for (const row of rows) {
    const t = prayerTimes(row.date, CITIES.find((c) => c.name === row.city), { method: 'kemenag' });
    for (const k of KEYS) {
      const d = t[k] - hmToMin(row[k]);
      if (Math.abs(d) > 1) misses.push(`${row.city} ${row.date} ${k} ${d}`);
    }
  }
  assert.deepEqual(misses, []);
});

test('metode lain dan mazhab Hanafi mengubah hasil ke arah yang benar', () => {
  const jakarta = CITIES.find((c) => c.name === 'Jakarta');
  const date = '2026-11-04';
  const kemenag = prayerTimes(date, jakarta, { method: 'kemenag' });
  const hanafi = prayerTimes(date, jakarta, { method: 'kemenag', madhab: 'hanafi' });
  const mwl = prayerTimes(date, jakarta, { method: 'mwl' });
  const makkah = prayerTimes(date, jakarta, { method: 'makkah' });
  assert.ok(hanafi.ashar > kemenag.ashar + 30);
  assert.ok(mwl.subuh > kemenag.subuh, 'sudut Subuh 18 derajat lebih lambat dari 20 derajat');
  assert.equal(makkah.isya, makkah.maghrib + 90);
});

test('koreksi manual menggeser jadwal', () => {
  const jakarta = CITIES.find((c) => c.name === 'Jakarta');
  const base = prayerTimes('2026-11-04', jakarta, {});
  const moved = prayerTimes('2026-11-04', jakarta, { adjust: { subuh: 2, maghrib: -1 } });
  assert.equal(moved.subuh, base.subuh + 2);
  assert.equal(moved.imsak, base.imsak + 2);
  assert.equal(moved.maghrib, base.maghrib - 1);
});

test('lintang tinggi tanpa waktu Isya menghasilkan null, bukan angka rusak', () => {
  assert.equal(prayerTimes('2026-06-21', { lat: 69.65, lng: 18.96, tz: 2 }, { method: 'kemenag' }), null);
});
