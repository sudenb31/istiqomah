// Setiap tema harus tetap terbaca. Kontras dihitung dengan rumus WCAG.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BACKGROUNDS, THEMES, resolveTheme, themeById, themeTokens } from '../js/themes.js';
import { contrast } from '../js/sky.js';

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const ratio = (a, b) => contrast(rgb(a), rgb(b));

const variants = THEMES.flatMap((t) => [
  [t.name, t.colors, t],
  ...(t.dark ? [[`${t.name} gelap`, t.dark, t]] : []),
]);

test('id tema unik dan background bawaannya tersedia', () => {
  assert.equal(new Set(THEMES.map((t) => t.id)).size, THEMES.length);
  const bgIds = new Set(BACKGROUNDS.map((b) => b.id));
  for (const t of THEMES) assert.ok(bgIds.has(t.bg), `${t.id}: ${t.bg}`);
  assert.ok(THEMES.length >= 8);
});

test('teks terbaca di panel pada semua tema', () => {
  const bad = [];
  for (const [name, c] of variants) {
    const checks = {
      'ink di surface': ratio(c.ink, c.surface),
      'muted di surface': ratio(c.muted, c.surface),
      'accentText di surface': ratio(c.accentText, c.surface),
      'accentOn di accent': ratio(c.accentOn, c.accent),
      'high di surface': ratio(c.high, c.surface),
      'ink di accentSoft': ratio(c.ink, c.accentSoft),
      'surface di ink (toast)': ratio(c.surface, c.ink),
      'teks qadha': ratio('#1a1100', c.qadha),
    };
    for (const [what, value] of Object.entries(checks)) {
      if (value < 4.5) bad.push(`${name}: ${what} ${value.toFixed(2)}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('penanda prioritas kelihatan di panel pada semua tema', () => {
  const bad = [];
  for (const [name, c] of variants) {
    for (const key of ['accent', 'mid', 'low', 'high']) {
      const value = ratio(c[key], c.surface);
      if (value < 2.9) bad.push(`${name}: ${key} ${value.toFixed(2)}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('teks kartu utama terbaca pada semua tema', () => {
  const bad = [];
  for (const t of THEMES) {
    for (const color of [t.hero.from, t.hero.to]) {
      const value = ratio(t.hero.on, color);
      if (value < 4.5) bad.push(`${t.name}: ${color} ${value.toFixed(2)}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('tema Langit mengikuti mode gelap perangkat', () => {
  assert.equal(resolveTheme('langit', false).scheme, 'light');
  assert.equal(resolveTheme('langit', true).scheme, 'dark');
  assert.equal(themeTokens('langit', true).tokens['--surface'], themeById('langit').dark.surface);
  assert.equal(resolveTheme('neon', false).scheme, 'dark');
  assert.equal(resolveTheme('stroberi', true).scheme, 'light');
});

test('id tema yang tidak dikenal jatuh ke tema bawaan', () => {
  assert.equal(themeById('tidak-ada').id, 'langit');
});

test('semua variabel CSS terisi', () => {
  for (const t of THEMES) {
    for (const dark of [false, true]) {
      const { tokens } = themeTokens(t.id, dark);
      for (const [name, value] of Object.entries(tokens)) assert.ok(value != null && value !== '', `${t.id} ${name}`);
    }
  }
});
