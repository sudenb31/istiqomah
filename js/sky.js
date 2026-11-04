// Warna langit sepanjang hari, ditambatkan ke waktu sholat hari itu.
// Warna ini dipakai pita garis waktu dan latar kepala halaman.

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

const NIGHT = hex('#141938');
const FAJR = hex('#3A3D86');
const SUNRISE = hex('#F0A58F');
const MORNING = hex('#9CCDEB');
const NOON = hex('#5FAEE3');
const AFTERNOON = hex('#EDBE6E');
const GOLD = hex('#EE8A4D');
const DUSK = hex('#BE3768');
const ISYA = hex('#2F2A6B');

export function skyStops(t) {
  return [
    [0, NIGHT],
    [t.subuh - 45, NIGHT],
    [t.subuh, FAJR],
    [t.terbit, SUNRISE],
    [t.terbit + 60, MORNING],
    [t.dzuhur, NOON],
    [t.ashar, AFTERNOON],
    [t.maghrib - 30, GOLD],
    [t.maghrib, DUSK],
    [t.isya, ISYA],
    [t.isya + 75, NIGHT],
    [1440, NIGHT],
  ];
}

export function skyAt(minute, stops) {
  const m = Math.min(1440, Math.max(0, minute));
  for (let i = 1; i < stops.length; i++) {
    const [b, cb] = stops[i];
    if (m <= b) {
      const [a, ca] = stops[i - 1];
      const f = b === a ? 0 : (m - a) / (b - a);
      return ca.map((v, c) => Math.round(v + (cb[c] - v) * f));
    }
  }
  return stops[stops.length - 1][1];
}

export const toCss = ([r, g, b]) => `rgb(${r} ${g} ${b})`;

function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const WHITE = [255, 255, 255];
const INK = [17, 17, 44];
const MIN_CONTRAST = 4.5;

const mix = (c, target, f) => c.map((v, i) => Math.round(v + (target[i] - v) * f));

// Geser warna perlahan sampai teks terbaca; warna langit tetap dikenali karena pergeserannya kecil.
function settle(color, text) {
  const target = text === WHITE ? [0, 0, 0] : WHITE;
  let c = color;
  for (let i = 0; i < 40 && contrast(c, text) < MIN_CONTRAST; i++) c = mix(c, target, 0.04);
  return c;
}

// Latar kepala halaman dua warna dan warna teks yang terbaca di keduanya.
export function heroColors(minute, stops) {
  const a = skyAt(minute, stops);
  const b = skyAt(minute + 50, stops);
  const score = (text) => Math.min(contrast(a, text), contrast(b, text));
  const text = score(WHITE) >= score(INK) ? WHITE : INK;
  return { from: settle(a, text), to: settle(b, text), text };
}
