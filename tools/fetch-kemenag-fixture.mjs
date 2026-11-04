// Mengambil contoh jadwal resmi Kemenag lewat API publik MyQuran sebagai data pembanding tes.
// Dijalankan manual sekali saja. Hasilnya disimpan di tests/fixtures/kemenag.json.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cities = { Jakarta: '1301', Surabaya: '1638', Medan: '0228', Jayapura: '3329', Makassar: '2622', Bandung: '1219' };
const dates = ['2026/01/15', '2026/06/21', '2026/09/23', '2026/11/04'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// API publik ini membatasi laju permintaan, jadi tiap permintaan diberi jeda
// dan menunggu lebih lama kalau server membalas 429.
async function getJson(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
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

const rows = [];
for (const [city, id] of Object.entries(cities)) {
  for (const date of dates) {
    const body = await getJson(`https://api.myquran.com/v2/sholat/jadwal/${id}/${date}`);
    if (!body.status) throw new Error(`Gagal: ${city} ${date}`);
    const { imsak, subuh, terbit, dhuha, dzuhur, ashar, maghrib, isya } = body.data.jadwal;
    rows.push({ city, date: date.replaceAll('/', '-'), imsak, subuh, terbit, dhuha, dzuhur, ashar, maghrib, isya });
  }
}
const out = join(root, 'tests', 'fixtures', 'kemenag.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ source: 'api.myquran.com/v2/sholat/jadwal', rows }, null, 1));
console.log(`Tersimpan ${rows.length} baris ke ${out}`);
