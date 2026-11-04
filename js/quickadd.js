// Mengurai kalimat bahasa Indonesia menjadi tugas, contoh:
// "tilawah setiap hari setelah subuh #ibadah"  atau  "rapat vendor besok jam 2 siang !1"
import { addDays, addMonthsClamped, weekdayOf, ymd, nowMinutes, shortDate, minToHm, clock } from './date.js';
import { repeatLabel } from './repeat.js';
import { PRAYER_NAMES } from './prayer.js';

const DAYS = { minggu: 0, ahad: 0, senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, "jum'at": 5, sabtu: 6 };
const DAY_RE = "senin|selasa|rabu|kamis|jum'?at|sabtu|ahad";
const DAY_ANY_RE = `${DAY_RE}|minggu`;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'mei', 'jun', 'jul', 'agu', 'sep', 'okt', 'nov', 'des'];
const MONTH_RE = '(jan|feb|mar|apr|mei|jun|jul|agu|agt|ags|sep|okt|nov|des)[a-z]*';

const PRAYER_ALIAS = {
  subuh: 'subuh', shubuh: 'subuh', fajr: 'subuh',
  terbit: 'terbit', dhuha: 'dhuha', duha: 'dhuha',
  dzuhur: 'dzuhur', zuhur: 'dzuhur', dhuhur: 'dzuhur', duhur: 'dzuhur', lohor: 'dzuhur',
  ashar: 'ashar', asar: 'ashar',
  maghrib: 'maghrib', magrib: 'maghrib',
  isya: 'isya', isha: 'isya',
};
const PRAYER_RE = Object.keys(PRAYER_ALIAS).join('|');

const B = '(?<![\\p{L}\\p{N}])'; // awal kata
const E = '(?![\\p{L}\\p{N}])'; // akhir kata
const re = (body) => new RegExp(B + body + E, 'iu');

const dayNum = (w) => DAYS[w.toLowerCase().replace(/’/g, "'")];

function applyDaypart(hour, part, literal) {
  if (part === 'pagi') return hour === 12 ? 0 : hour;
  if (part === 'siang') return hour >= 1 && hour <= 4 ? hour + 12 : hour;
  if (part === 'sore') return hour >= 1 && hour <= 7 ? hour + 12 : hour;
  if (part === 'malam') {
    if (hour === 12) return 0;
    return hour >= 5 && hour <= 11 ? hour + 12 : hour;
  }
  // Tanpa keterangan: "jam 2" hampir selalu berarti siang. Hasilnya terlihat di pratinjau.
  if (!literal && hour >= 1 && hour <= 5) return hour + 12;
  return hour;
}

function nextWeekday(today, target, nextWeek) {
  const cur = weekdayOf(today);
  if (nextWeek) {
    const toMonday = ((8 - cur) % 7) || 7;
    return addDays(today, toMonday + ((target + 6) % 7));
  }
  const ahead = (target - cur + 7) % 7 || 7;
  return addDays(today, ahead);
}

export function parseQuick(text, now = new Date()) {
  const today = ymd(now);
  const out = { title: '', date: null, time: null, anchor: null, repeat: null, priority: 0, listName: null, reminders: null };
  let s = ` ${text.trim()} `;

  const take = (regex, fn) => {
    const m = s.match(regex);
    if (!m) return false;
    if (fn(m) === false) return false;
    s = `${s.slice(0, m.index)} ${s.slice(m.index + m[0].length)}`;
    return true;
  };

  take(/(?:^|\s)!([1-3])(?=\s|$)/u, (m) => { out.priority = 4 - Number(m[1]); });
  take(/(?:^|\s)#([\p{L}\p{N}_-]+)/u, (m) => { out.listName = m[1]; });

  take(re('ingatkan\\s+(\\d{1,3})\\s*(menit|mnt|jam|hari)(\\s+sebelum(nya)?)?'), (m) => {
    const unit = m[2].toLowerCase();
    const mult = unit === 'jam' ? 60 : unit === 'hari' ? 1440 : 1;
    out.reminders = [Number(m[1]) * mult];
  });

  // Pengulangan
  const every = '(?:setiap|tiap)\\s+';
  take(re(`${every}hari\\s+kerja`), () => { out.repeat = { freq: 'weekly', interval: 1, days: [1, 2, 3, 4, 5] }; }) ||
    take(re(`${every}(\\d{1,2})\\s+(hari|minggu|pekan|bulan|tahun)`), (m) => {
      const unit = { hari: 'daily', minggu: 'weekly', pekan: 'weekly', bulan: 'monthly', tahun: 'yearly' }[m[2].toLowerCase()];
      out.repeat = { freq: unit, interval: Number(m[1]) };
    }) ||
    take(re(`${every}(?:hari\\s+)?((?:${DAY_RE})(?:\\s*(?:,|dan|&)?\\s*(?:${DAY_ANY_RE}))*)`), (m) => {
      const days = m[1].toLowerCase().match(new RegExp(DAY_ANY_RE, 'g')).map(dayNum);
      out.repeat = { freq: 'weekly', interval: 1, days: [...new Set(days)] };
    }) ||
    take(re(`${every}hari\\s+minggu`), () => { out.repeat = { freq: 'weekly', interval: 1, days: [0] }; }) ||
    take(re(`${every}hari`), () => { out.repeat = { freq: 'daily', interval: 1 }; }) ||
    take(re(`${every}(minggu|pekan)`), () => { out.repeat = { freq: 'weekly', interval: 1 }; }) ||
    take(re(`${every}bulan`), () => { out.repeat = { freq: 'monthly', interval: 1 }; }) ||
    take(re(`${every}tahun`), () => { out.repeat = { freq: 'yearly', interval: 1 }; });

  // Terkait waktu sholat
  const prayerWord = `(?:(?:waktu|sholat|shalat|salat)\\s+)?(${PRAYER_RE})`;
  const before = 'sebelum';
  const after = "setelah|sesudah|habis|ba'?da";
  take(re(`(\\d{1,3})\\s*(menit|mnt|jam)\\s+(${before}|${after})\\s+${prayerWord}`), (m) => {
    const mins = Number(m[1]) * (m[2].toLowerCase() === 'jam' ? 60 : 1);
    const sign = m[3].toLowerCase() === before ? -1 : 1;
    out.anchor = { prayer: PRAYER_ALIAS[m[4].toLowerCase()], offset: sign * mins };
  }) ||
    take(re(`(${before}|${after})\\s+${prayerWord}`), (m) => {
      out.anchor = { prayer: PRAYER_ALIAS[m[2].toLowerCase()], offset: m[1].toLowerCase() === before ? -15 : 15 };
    });

  // Jam
  if (!out.anchor) {
    take(re('(?:jam|pukul)\\s+(\\d{1,2})(?:[.:](\\d{2}))?(?:\\s+(pagi|siang|sore|malam))?'), (m) => {
      const h = applyDaypart(Number(m[1]), m[3]?.toLowerCase(), m[1].length === 2 && m[1][0] === '0');
      const mm = Number(m[2] ?? 0);
      if (h > 23 || mm > 59) return false;
      out.time = minToHm(h * 60 + mm);
    }) ||
      take(re('(\\d{1,2})[.:](\\d{2})(?:\\s+(pagi|siang|sore|malam))?'), (m) => {
        const h = applyDaypart(Number(m[1]), m[3]?.toLowerCase(), m[1].length === 2);
        const mm = Number(m[2]);
        if (h > 23 || mm > 59) return false;
        out.time = minToHm(h * 60 + mm);
      });
  }

  // Tanggal
  take(re('hari\\s+ini'), () => { out.date = today; }) ||
    take(re('besok(?:\\s+(pagi|siang|sore|malam))?'), () => { out.date = addDays(today, 1); }) ||
    take(re('lusa'), () => { out.date = addDays(today, 2); }) ||
    take(re('(\\d{1,3})\\s+hari\\s+lagi'), (m) => { out.date = addDays(today, Number(m[1])); }) ||
    take(re('(?:minggu|pekan)\\s+depan'), () => { out.date = addDays(today, 7); }) ||
    take(re('bulan\\s+depan'), () => { out.date = addMonthsClamped(today, 1); }) ||
    take(re(`(?:tgl\\.?|tanggal)?\\s*(\\d{1,2})\\s+${MONTH_RE}(?:\\s+(\\d{4}))?`), (m) => {
      const mon = MONTHS.indexOf(m[2].toLowerCase().slice(0, 3).replace('agt', 'agu').replace('ags', 'agu'));
      const day = Number(m[1]);
      if (mon < 0 || day < 1 || day > 31) return false;
      let d = ymd(new Date(m[3] ? Number(m[3]) : now.getFullYear(), mon, day, 12));
      if (!m[3] && d < today) d = ymd(new Date(now.getFullYear() + 1, mon, day, 12));
      out.date = d;
    }) ||
    take(re('(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?'), (m) => {
      const day = Number(m[1]);
      const mon = Number(m[2]) - 1;
      if (mon < 0 || mon > 11 || day < 1 || day > 31) return false;
      const year = m[3] ? Number(m[3].padStart(4, '20')) : now.getFullYear();
      let d = ymd(new Date(year, mon, day, 12));
      if (!m[3] && d < today) d = ymd(new Date(year + 1, mon, day, 12));
      out.date = d;
    }) ||
    take(re('(?:tgl\\.?|tanggal)\\s*(\\d{1,2})'), (m) => {
      const day = Number(m[1]);
      if (day < 1 || day > 31) return false;
      let d = ymd(new Date(now.getFullYear(), now.getMonth(), day, 12));
      if (d < today) d = ymd(new Date(now.getFullYear(), now.getMonth() + 1, day, 12));
      out.date = d;
    }) ||
    take(re(`(?:hari\\s+)?(${DAY_RE})(\\s+depan)?`), (m) => { out.date = nextWeekday(today, dayNum(m[1]), Boolean(m[2])); }) ||
    take(re('hari\\s+minggu(\\s+depan)?'), (m) => { out.date = nextWeekday(today, 0, Boolean(m[1])); });

  // Tanggal bawaan bila kalimatnya hanya menyebut jam, sholat, atau pengulangan.
  if (!out.date && (out.time || out.anchor || out.repeat)) {
    const passed = out.time && !out.repeat && minutesOf(out.time) <= nowMinutes(now);
    out.date = passed ? addDays(today, 1) : today;
  }
  if (out.repeat?.freq === 'weekly' && out.repeat.days?.length && !text.match(/besok|lusa|depan/i)) {
    // Mulai dari hari pertama yang cocok supaya tampilan "berikutnya" benar.
    let d = out.date;
    for (let i = 0; i < 7 && !out.repeat.days.includes(weekdayOf(d)); i++) d = addDays(d, 1);
    out.date = d;
  }
  if (!out.reminders) out.reminders = out.time || out.anchor ? [0] : [];

  out.title = s.replace(/\s+/g, ' ').trim().replace(/^[,;:.\-\s]+|[,;:\-\s]+$/g, '');
  if (!out.title) out.title = text.trim();
  return out;
}

const minutesOf = (hm) => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};

export function anchorLabel(anchor) {
  const name = PRAYER_NAMES[anchor.prayer] ?? anchor.prayer;
  if (!anchor.offset) return `Saat ${name}`;
  const mins = Math.abs(anchor.offset);
  return `${mins} menit ${anchor.offset < 0 ? 'sebelum' : 'setelah'} ${name}`;
}

// Hasil uraian ditampilkan sebagai pratinjau agar salah tafsir langsung terlihat.
export function describeParsed(p, today) {
  const chips = [];
  if (p.date) {
    const label = p.date === today ? 'Hari ini' : p.date === addDays(today, 1) ? 'Besok' : shortDate(p.date);
    chips.push({ kind: 'date', label });
  }
  if (p.time) chips.push({ kind: 'time', label: clock(minutesOf(p.time)) });
  if (p.anchor) chips.push({ kind: 'prayer', label: anchorLabel(p.anchor) });
  if (p.repeat) chips.push({ kind: 'repeat', label: repeatLabel(p.repeat) });
  if (p.priority) chips.push({ kind: 'priority', label: ['', 'Prioritas rendah', 'Prioritas sedang', 'Prioritas tinggi'][p.priority] });
  if (p.listName) chips.push({ kind: 'list', label: p.listName });
  return chips;
}
