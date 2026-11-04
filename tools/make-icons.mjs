// Menggambar ikon aplikasi jadi PNG tanpa pustaka: langit senja dengan bulan sabit.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
mkdirSync(out, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB tanpa transparansi, iOS menolak latar transparan
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const STOPS = [
  [0, [20, 25, 56]],
  [0.45, [47, 42, 107]],
  [0.78, [190, 55, 104]],
  [1, [238, 138, 77]],
];

function skyAt(t) {
  for (let i = 1; i < STOPS.length; i++) {
    const [b, cb] = STOPS[i];
    if (t <= b) {
      const [a, ca] = STOPS[i - 1];
      const f = (t - a) / (b - a);
      return ca.map((v, c) => v + (cb[c] - v) * f);
    }
  }
  return STOPS[STOPS.length - 1][1];
}

// scale mengecilkan bulan untuk ikon maskable agar tetap di area aman.
function draw(size, scale) {
  const SS = 4;
  const cx = 0.5;
  const cy = 0.46;
  const R = 0.27 * scale;
  const bite = { x: cx + 0.115 * scale, y: cy - 0.05 * scale, r: 0.225 * scale };
  const inside = (u, v) =>
    Math.hypot(u - cx, v - cy) <= R && Math.hypot(u - bite.x, v - bite.y) > bite.r;

  return png(size, (x, y) => {
    let cover = 0;
    for (let i = 0; i < SS; i++) {
      for (let j = 0; j < SS; j++) {
        if (inside((x + (i + 0.5) / SS) / size, (y + (j + 0.5) / SS) / size)) cover += 1;
      }
    }
    const a = cover / (SS * SS);
    const bg = skyAt((y + 0.5) / size);
    return bg.map((v) => Math.round(v + (255 - v) * a));
  });
}

for (const [name, size, scale] of [
  ['icon-32.png', 32, 1.25],
  ['icon-180.png', 180, 1],
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.78],
]) {
  writeFileSync(join(out, name), draw(size, scale));
  console.log('dibuat', name);
}
