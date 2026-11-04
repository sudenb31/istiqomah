// Membuat berkas kalender .ics. Pengingat di dalamnya dijalankan oleh aplikasi kalender perangkat,
// sehingga tetap berbunyi walau aplikasi ini tertutup. Waktu sholat berbeda tiap hari,
// jadi tiap kejadian ditulis satu per satu, bukan memakai aturan RRULE.
import { addDays, atMinutes, hmToMin } from './date.js';
import { dayTasks, timesFor } from './agenda.js';
import { PRAYERS, PRAYER_NAMES } from './prayer.js';

const CRLF = '\r\n';
const pad = (n) => String(n).padStart(2, '0');

const utcStamp = (d) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

const dateValue = (s) => s.replaceAll('-', '');

export const escapeText = (s) =>
  String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// RFC 5545: baris maksimal 75 oktet, lanjutan diawali spasi. Karakter tidak boleh terpotong.
export function foldLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts = [];
  let cur = '';
  let size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = '';
      size = 0;
    }
    cur += ch;
    size += n;
  }
  parts.push(cur);
  return parts.join(`${CRLF} `);
}

// minutes = jarak dari awal acara. Negatif berarti sebelum acara dimulai.
const alarm = (minutes, text) => [
  'BEGIN:VALARM',
  'ACTION:DISPLAY',
  `DESCRIPTION:${escapeText(text)}`,
  `TRIGGER:${minutes < 0 ? `-PT${-minutes}M` : `PT${minutes}M`}`,
  'END:VALARM',
];

export function buildIcs(state, { from, days = 30, includePrayers = true, includeTasks = true, now = new Date() }) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Istiqomah//ID', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Istiqomah'];
  const stamp = utcStamp(now);
  let count = 0;

  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);

    if (includeTasks) {
      for (const { task, minute, done } of dayTasks(state, date)) {
        if (done) continue;
        count += 1;
        lines.push('BEGIN:VEVENT', `UID:${task.id}-${date}@istiqomah.local`, `DTSTAMP:${stamp}`, `SUMMARY:${escapeText(task.title)}`);
        if (minute == null) {
          lines.push(`DTSTART;VALUE=DATE:${dateValue(date)}`, `DTEND;VALUE=DATE:${dateValue(addDays(date, 1))}`);
        } else {
          lines.push(`DTSTART:${utcStamp(atMinutes(date, minute))}`, `DTEND:${utcStamp(atMinutes(date, minute + 30))}`);
        }
        if (task.notes) lines.push(`DESCRIPTION:${escapeText(task.notes)}`);
        // Acara seharian dimulai tengah malam, jadi pengingatnya dihitung dari jam pengingat harian.
        const base = minute == null ? hmToMin(state.settings.allDayReminderAt ?? '07:00') : 0;
        for (const m of task.reminders ?? []) lines.push(...alarm(base - m, task.title));
        lines.push('END:VEVENT');
      }
    }

    const times = includePrayers ? timesFor(state, date) : null;
    if (times) {
      for (const key of PRAYERS) {
        if (!state.settings.prayerAlerts?.[key]) continue;
        count += 1;
        lines.push(
          'BEGIN:VEVENT',
          `UID:sholat-${key}-${date}@istiqomah.local`,
          `DTSTAMP:${stamp}`,
          `SUMMARY:${PRAYER_NAMES[key]}`,
          `DTSTART:${utcStamp(atMinutes(date, times[key]))}`,
          `DTEND:${utcStamp(atMinutes(date, times[key] + 15))}`,
          'TRANSP:TRANSPARENT',
          ...alarm(-(state.settings.prayerLead ?? 0), `Waktunya ${PRAYER_NAMES[key]}`),
          'END:VEVENT',
        );
      }
    }
  }
  lines.push('END:VCALENDAR');
  return { text: lines.map(foldLine).join(CRLF) + CRLF, count };
}
