// Menyusun tugas dan jadwal sholat menjadi acara Google Calendar. Murni tanpa DOM supaya bisa dites.
// Tiap kejadian ditulis satu per satu dengan id tetap, karena jam sholat berbeda setiap hari
// dan tugas yang ikut sholat ikut bergeser.
import { addDays, atMinutes, hmToMin, ymd } from './date.js';
import { dayTasks, timesFor } from './agenda.js';
import { PRAYERS, PRAYER_NAMES } from './prayer.js';

export const SYNC_DAYS = 45;
const TASK_MINUTES = 30;
const PRAYER_MINUTES = 15;
const ALL_DAY_REMINDER_MINUTES = 15;

// Google hanya menerima huruf a sampai v dan angka. Karakter heksa selalu aman.
export function eventId(key) {
  const hex = [...new TextEncoder().encode(key)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `i${hex}`;
}

// Hash ringan untuk tahu apakah isi acara berubah, sehingga yang sama tidak ditulis ulang.
function hashOf(value) {
  let h = 0x811c9dc5;
  for (const ch of JSON.stringify(value)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const withHash = (id, body) => ({ id, h: hashOf(body), ...body });

function taskEvent(state, task, date, minute) {
  const id = eventId(`t:${task.id}:${date}`);
  const base = { summary: task.title, description: task.notes || undefined };
  const reminders = task.reminders ?? [];

  if (minute != null) {
    return withHash(id, {
      ...base,
      start: atMinutes(date, minute).toISOString(),
      end: atMinutes(date, minute + TASK_MINUTES).toISOString(),
      reminders,
    });
  }
  // Pengingat Google di acara seharian hanya bisa berbunyi sebelum hari itu.
  // Tugas tanpa jam yang minta diingatkan dipasang sebentar di jam pengingat harian.
  if (reminders.length) {
    const at = hmToMin(state.settings.allDayReminderAt ?? '07:00');
    return withHash(id, {
      ...base,
      start: atMinutes(date, at).toISOString(),
      end: atMinutes(date, at + ALL_DAY_REMINDER_MINUTES).toISOString(),
      reminders,
    });
  }
  return withHash(id, { ...base, date, endDate: addDays(date, 1), reminders: [] });
}

export function buildGoogleEvents(state, from, days = SYNC_DAYS) {
  const out = [];
  const includePrayers = state.settings.googlePrayers !== false;
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    for (const { task, minute, done } of dayTasks(state, date)) {
      if (!done) out.push(taskEvent(state, task, date, minute));
    }
    const times = includePrayers ? timesFor(state, date) : null;
    if (!times) continue;
    const lead = state.settings.prayerLead ?? 0;
    for (const key of PRAYERS) {
      if (!state.settings.prayerAlerts?.[key]) continue;
      out.push(withHash(eventId(`p:${key}:${date}`), {
        summary: PRAYER_NAMES[key],
        start: atMinutes(date, times[key]).toISOString(),
        end: atMinutes(date, times[key] + PRAYER_MINUTES).toISOString(),
        transparent: true,
        reminders: [lead],
      }));
    }
  }
  return out;
}

export function syncRange(from, days = SYNC_DAYS) {
  return {
    timeMin: atMinutes(from, 0).toISOString(),
    timeMax: atMinutes(addDays(from, days), 0).toISOString(),
  };
}

// Acara Google yang jatuh di satu tanggal, sudah dalam jam lokal perangkat.
export function eventsOnDate(events, date) {
  const out = [];
  for (const e of events ?? []) {
    if (e.allDay) {
      if (e.start <= date && date < (e.end ?? addDays(e.start, 1))) out.push({ event: e, minute: null });
      continue;
    }
    const start = new Date(e.start);
    const end = new Date(e.end ?? e.start);
    const startDay = ymd(start);
    const endDay = ymd(new Date(end.getTime() - 1));
    if (date < startDay || date > endDay) continue;
    if (date === startDay) out.push({ event: e, minute: start.getHours() * 60 + start.getMinutes() });
    else out.push({ event: e, minute: null }); // hari lanjutan dari acara panjang
  }
  return out;
}

export function eventTimeLabel(entry, clockFn) {
  const e = entry.event;
  if (entry.minute == null) return 'Seharian';
  const end = new Date(e.end ?? e.start);
  const endMin = end.getHours() * 60 + end.getMinutes();
  return `${clockFn(entry.minute)} sampai ${clockFn(endMin)}`;
}
