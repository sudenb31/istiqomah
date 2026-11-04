// Mengambil jadwal Kemenag untuk semua kota di daftar aplikasi, lalu menyimpannya sebagai data tes.
// Permintaan diberi jeda karena API publik ini membatasi laju. Dijalankan manual, butuh beberapa menit.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CITIES } from '../js/prayer.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dates = ['2026/01/15', '2026/06/21'];

// Nama di daftar Kemenag yang berbeda dengan nama kota di aplikasi.
const ALIAS = {
  Solo: 'KOTA SURAKARTA',
  Tanjungpinang: 'KOTA TANJUNG PINANG',
  Pangkalpinang: 'KOTA PANGKAL PINANG',
  'Palangka Raya': 'KOTA PALANGKARAYA',
  'Tanjung Selor': 'KAB. BULUNGAN',
  Mamuju: 'KAB. MAMUJU',
  Manokwari: 'KAB. MANOKWARI',
  Merauke: 'KAB. MERAUKE',
};

async function getJson(url) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await sleep(4000);
    const res = await fetch(url);
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after')) || 30;
      console.log(`Dibatasi server, menunggu ${wait} detik`);
      await sleep(wait * 1000);
      continue;
    }
    return res.json();
  }
  throw new Error(`Masih dibatasi server: ${url}`);
}

const list = (await getJson('https://api.myquran.com/v2/sholat/kota/semua')).data;
const byName = new Map(list.map((k) => [k.lokasi.toUpperCase(), k.id]));

const rows = [];
const missing = [];
for (const city of CITIES) {
  const wanted = ALIAS[city.name] ?? `KOTA ${city.name.toUpperCase()}`;
  const id = byName.get(wanted);
  if (!id) {
    missing.push(`${city.name} (${wanted})`);
    continue;
  }
  for (const date of dates) {
    const body = await getJson(`https://api.myquran.com/v2/sholat/jadwal/${id}/${date}`);
    if (!body.status) {
      missing.push(`${city.name} ${date}`);
      continue;
    }
    const { imsak, subuh, terbit, dhuha, dzuhur, ashar, maghrib, isya } = body.data.jadwal;
    rows.push({ city: city.name, kemenag: wanted, date: date.replaceAll('/', '-'), imsak, subuh, terbit, dhuha, dzuhur, ashar, maghrib, isya });
  }
  console.log('ok', city.name);
}

const out = join(root, 'tests', 'fixtures', 'kemenag-cities.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ source: 'api.myquran.com/v2/sholat/jadwal', rows }, null, 1));
console.log(`Tersimpan ${rows.length} baris. Tidak ketemu: ${missing.join(', ') || 'tidak ada'}`);
