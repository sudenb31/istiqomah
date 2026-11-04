// Tanggal disimpan sebagai string 'YYYY-MM-DD' waktu lokal, jam sebagai menit sejak tengah malam.
// Objek Date dibuat pada pukul 12 siang supaya aman dari pergeseran zona waktu.

export const pad = (n) => String(n).padStart(2, '0');

export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

export const weekdayOf = (s) => parseYmd(s).getDay();

export const diffDays = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);

export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

export function addMonthsClamped(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const first = new Date(y, m - 1 + n, 1, 12);
  const day = Math.min(d, daysInMonth(first.getFullYear(), first.getMonth()));
  return ymd(new Date(first.getFullYear(), first.getMonth(), day, 12));
}

export const nowMinutes = (d = new Date()) => d.getHours() * 60 + d.getMinutes();

export function hmToMin(hm) {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

export function minToHm(min) {
  const t = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}

// Format jam Indonesia memakai titik: 15.02
export const clock = (min) => minToHm(min).replace(':', '.');

export function atMinutes(dateStr, min) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 0, Math.round(min));
}

const fmt = (opts) => new Intl.DateTimeFormat('id-ID', opts);
const fmtLong = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const fmtShort = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const fmtMonth = fmt({ month: 'long', year: 'numeric' });

export const longDate = (s) => fmtLong.format(parseYmd(s));
export const shortDate = (s) => fmtShort.format(parseYmd(s));
export const monthLabel = (y, m) => fmtMonth.format(new Date(y, m, 15));

export function relativeDay(s, today) {
  const n = diffDays(today, s);
  if (n === 0) return 'Hari ini';
  if (n === 1) return 'Besok';
  if (n === -1) return 'Kemarin';
  if (n === 2) return 'Lusa';
  return shortDate(s);
}

// Kalender Hijriah dari Intl (Umm al-Qura). Penetapan di Indonesia bisa selisih satu hari,
// jadi pengguna diberi pengaturan koreksi.
const hijriFmt = new Intl.DateTimeFormat('id-u-ca-islamic-umalqura-nu-latn', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function hijri(s, adjust = 0) {
  const parts = hijriFmt.formatToParts(parseYmd(addDays(s, adjust)));
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  const year = parts.find((p) => p.type === 'year' || p.type === 'relatedYear')?.value ?? '';
  return { day: Number(get('day')), month: get('month'), year: year.replace(/\D/g, '') };
}

export function hijriLabel(s, adjust = 0) {
  const h = hijri(s, adjust);
  return `${h.day} ${h.month} ${h.year} H`;
}

export function durationLabel(mins) {
  const m = Math.max(0, Math.round(mins));
  if (m < 1) return 'kurang dari semenit';
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (!h) return `${rest} menit`;
  return rest ? `${h} jam ${rest} menit` : `${h} jam`;
}
