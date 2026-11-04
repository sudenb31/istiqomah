// Perhitungan waktu sholat dari posisi matahari, tanpa layanan luar sehingga tetap jalan offline.
// Rumus deklinasi dan equation of time memakai pendekatan almanak astronomi presisi rendah.

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const fix = (a, b) => {
  const r = a - b * Math.floor(a / b);
  return r < 0 ? r + b : r;
};

function julian(y, m, d) {
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524.5;
}

function sunPosition(jd) {
  const D = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * D, 360);
  const q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * Math.sin(rad(g)) + 0.02 * Math.sin(rad(2 * g)), 360);
  const e = 23.439 - 0.00000036 * D;
  const ra = deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(L)), Math.cos(rad(L)))) / 15;
  const eqt = q / 15 - fix(ra, 24);
  const decl = deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(L))));
  return { decl, eqt };
}

export const METHODS = {
  // Ihtiyat Dzuhur dan koreksi ufuk disesuaikan dengan data jadwal resmi Kemenag (tests/fixtures).
  kemenag: { label: 'Kemenag RI', fajr: 20, isha: 18, ihtiyat: 2, ihtiyatDzuhur: 3, baseDip: 0.75, imsak: 10 },
  jakim: { label: 'JAKIM Malaysia', fajr: 20, isha: 18, ihtiyat: 0, imsak: 10 },
  muis: { label: 'MUIS Singapura', fajr: 20, isha: 18, ihtiyat: 0, imsak: 10 },
  mwl: { label: 'Muslim World League', fajr: 18, isha: 17, ihtiyat: 0, imsak: 10 },
  makkah: { label: 'Umm al-Qura, Makkah', fajr: 18.5, ishaAfter: 90, ihtiyat: 0, imsak: 10 },
  egypt: { label: 'Mesir', fajr: 19.5, isha: 17.5, ihtiyat: 0, imsak: 10 },
  isna: { label: 'ISNA Amerika Utara', fajr: 15, isha: 15, ihtiyat: 0, imsak: 10 },
};

export const PRAYERS = ['subuh', 'dzuhur', 'ashar', 'maghrib', 'isya'];

export const PRAYER_NAMES = {
  imsak: 'Imsak',
  subuh: 'Subuh',
  terbit: 'Terbit',
  dhuha: 'Dhuha',
  dzuhur: 'Dzuhur',
  ashar: 'Ashar',
  maghrib: 'Maghrib',
  isya: 'Isya',
};

const DHUHA_ANGLE = 4.5; // tinggi matahari saat waktu Dhuha mulai
const HORIZON = 0.8333; // refraksi dan jari-jari matahari

/**
 * @param {string} date 'YYYY-MM-DD'
 * @param {{lat:number,lng:number,tz:number,dip?:number}} loc
 *   tz = selisih jam dari UTC. dip = menit tambahan untuk terbit dan maghrib akibat ketinggian tempat.
 * @param {{method?:string,madhab?:string,adjust?:Object}} opts
 * @returns {Object|null} menit sejak tengah malam untuk tiap waktu
 */
export function prayerTimes(date, loc, opts = {}) {
  const method = METHODS[opts.method] ?? METHODS.kemenag;
  const asrFactor = opts.madhab === 'hanafi' ? 2 : 1;
  const [y, m, d] = date.split('-').map(Number);
  const jd = julian(y, m, d) - loc.lng / (15 * 24);
  const sinLat = Math.sin(rad(loc.lat));
  const cosLat = Math.cos(rad(loc.lat));

  const noon = (t) => fix(12 - sunPosition(jd + t).eqt, 24);

  const angleTime = (angle, t, before) => {
    const { decl } = sunPosition(jd + t);
    const c =
      (-Math.sin(rad(angle)) - Math.sin(rad(decl)) * sinLat) / (Math.cos(rad(decl)) * cosLat);
    if (c < -1 || c > 1) return NaN; // lintang tinggi, matahari tidak mencapai sudut ini
    const span = deg(Math.acos(c)) / 15;
    return noon(t) + (before ? -span : span);
  };

  const asrTime = (t) => {
    const { decl } = sunPosition(jd + t);
    const angle = -deg(Math.atan(1 / (asrFactor + Math.tan(rad(Math.abs(loc.lat - decl))))));
    return angleTime(angle, t, false);
  };

  // Tiga putaran cukup supaya posisi matahari mengikuti jam hasil hitungan.
  let h = { fajr: 5, sunrise: 6, dhuha: 6.5, dhuhr: 12, asr: 15, sunset: 18, isha: 19 };
  for (let i = 0; i < 3; i++) {
    h = {
      fajr: angleTime(method.fajr, h.fajr / 24, true),
      sunrise: angleTime(HORIZON, h.sunrise / 24, true),
      dhuha: angleTime(-DHUHA_ANGLE, h.dhuha / 24, true),
      dhuhr: noon(h.dhuhr / 24),
      asr: asrTime(h.asr / 24),
      sunset: angleTime(HORIZON, h.sunset / 24, false),
      isha: method.ishaAfter ? h.sunset : angleTime(method.isha, h.isha / 24, false),
    };
  }
  if ([h.fajr, h.sunrise, h.dhuhr, h.asr, h.sunset, h.isha].some(Number.isNaN)) return null;

  const shift = loc.tz - loc.lng / 15;
  const toMin = (hours) => (hours + shift) * 60;
  const iht = method.ihtiyat;
  const dip = (method.baseDip ?? 0) + (loc.dip ?? 0);
  const adj = opts.adjust ?? {};
  // Ihtiyat menambah kehati-hatian: waktu ibadah digeser lebih lambat, waktu terbit lebih awal.
  const up = (hours, key, extra = iht) => Math.ceil(toMin(hours) + extra - 1e-6) + (adj[key] ?? 0);

  const subuh = up(h.fajr, 'subuh');
  const maghrib = up(h.sunset, 'maghrib', iht + dip);
  return {
    imsak: subuh - method.imsak,
    subuh,
    terbit: Math.floor(toMin(h.sunrise) - iht - dip + 1e-6) + (adj.terbit ?? 0),
    dhuha: up(h.dhuha, 'dhuha'),
    dzuhur: up(h.dhuhr, 'dzuhur', method.ihtiyatDzuhur ?? iht),
    ashar: up(h.asr, 'ashar'),
    maghrib,
    isya: method.ishaAfter ? maghrib + method.ishaAfter + (adj.isya ?? 0) : up(h.isha, 'isya'),
  };
}

export function nextPrayer(times, minuteNow) {
  for (const key of PRAYERS) if (times[key] > minuteNow) return key;
  return null;
}

// Kota referensi: nama, lintang, bujur, zona waktu (WIB, WITA, WIT), dan dip bila ada.
// Dip Bandung dan Bogor mengikuti selisih terbit dan maghrib pada jadwal Kemenag.
export const CITIES = [
  ['Banda Aceh', 5.55, 95.32, 7],
  ['Medan', 3.59, 98.67, 7],
  ['Padang', -0.95, 100.35, 7],
  ['Pekanbaru', 0.51, 101.45, 7],
  ['Batam', 1.13, 104.05, 7],
  ['Tanjungpinang', 0.92, 104.45, 7],
  ['Jambi', -1.61, 103.61, 7],
  ['Bengkulu', -3.8, 102.27, 7],
  ['Palembang', -2.98, 104.76, 7],
  ['Pangkalpinang', -2.13, 106.11, 7],
  ['Bandar Lampung', -5.43, 105.26, 7],
  ['Jakarta', -6.21, 106.85, 7],
  ['Bogor', -6.6, 106.8, 7, 4.25],
  ['Depok', -6.4, 106.82, 7],
  ['Tangerang', -6.18, 106.63, 7],
  ['Bekasi', -6.24, 106.99, 7],
  ['Serang', -6.12, 106.15, 7],
  ['Bandung', -6.91, 107.61, 7, 4.25],
  ['Semarang', -6.97, 110.42, 7],
  ['Solo', -7.57, 110.82, 7],
  ['Yogyakarta', -7.8, 110.37, 7],
  ['Surabaya', -7.26, 112.75, 7],
  ['Malang', -7.98, 112.63, 7],
  ['Pontianak', -0.03, 109.33, 7],
  ['Palangka Raya', -2.21, 113.92, 7],
  ['Denpasar', -8.65, 115.22, 8],
  ['Mataram', -8.58, 116.12, 8],
  ['Kupang', -10.18, 123.6, 8],
  ['Banjarmasin', -3.32, 114.59, 8],
  ['Samarinda', -0.5, 117.15, 8],
  ['Balikpapan', -1.27, 116.83, 8],
  ['Tanjung Selor', 2.84, 117.37, 8],
  ['Manado', 1.47, 124.84, 8],
  ['Gorontalo', 0.54, 123.06, 8],
  ['Palu', -0.9, 119.87, 8],
  ['Mamuju', -2.67, 118.89, 8],
  ['Makassar', -5.15, 119.42, 8],
  ['Kendari', -3.97, 122.51, 8],
  ['Ambon', -3.66, 128.19, 9],
  ['Ternate', 0.79, 127.38, 9],
  ['Sorong', -0.88, 131.25, 9],
  ['Manokwari', -0.86, 134.06, 9],
  ['Jayapura', -2.53, 140.72, 9],
  ['Merauke', -8.5, 140.4, 9],
].map(([name, lat, lng, tz, dip = 0]) => ({ name, lat, lng, tz, dip }));
