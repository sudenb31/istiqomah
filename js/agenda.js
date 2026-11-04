// Menyusun isi hari dan daftar pengingat dari state. Murni tanpa DOM supaya bisa dites.
import { prayerTimes, PRAYERS, PRAYER_NAMES } from './prayer.js';
import { occursOn, isDoneOn } from './repeat.js';
import { addDays, hmToMin, ymd, atMinutes, clock, durationLabel } from './date.js';

const cache = new Map();

export function timesFor(state, date) {
  const s = state.settings;
  const key = `${date}|${s.location.lat}|${s.location.lng}|${s.location.tz}|${s.location.dip ?? 0}|${s.method}|${s.madhab}|${JSON.stringify(s.adjust)}`;
  if (!cache.has(key)) {
    if (cache.size > 800) cache.clear();
    cache.set(key, prayerTimes(date, s.location, { method: s.method, madhab: s.madhab, adjust: s.adjust }));
  }
  return cache.get(key);
}

// Menit pelaksanaan tugas pada tanggal itu, atau null kalau tanpa jam.
export function taskMinute(task, times) {
  if (task.anchor) {
    const base = times?.[task.anchor.prayer];
    return base == null ? null : base + (task.anchor.offset ?? 0);
  }
  return task.time ? hmToMin(task.time) : null;
}

export function dayTasks(state, date) {
  const times = timesFor(state, date);
  return state.tasks
    .filter((t) => occursOn(t, date))
    .map((task) => ({ task, date, minute: taskMinute(task, times), done: isDoneOn(task, date) }));
}

export function overdueTasks(state, today) {
  return state.tasks
    .filter((t) => !t.repeat && t.date && t.date < today && !t.doneAt)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

const byPriority = (a, b) => (b.task.priority ?? 0) - (a.task.priority ?? 0);

// Isi garis waktu: sholat dan tugas berjam, urut kronologis. Tugas tanpa jam dipisah.
export function dayAgenda(state, date) {
  const times = timesFor(state, date);
  const entries = dayTasks(state, date);
  const untimed = entries.filter((e) => e.minute == null).sort((a, b) => a.done - b.done || byPriority(a, b));
  const timed = entries.filter((e) => e.minute != null).map((e) => ({ type: 'task', minute: e.minute, ...e }));
  const prayers = times
    ? [...PRAYERS, 'terbit'].map((key) => ({ type: key === 'terbit' ? 'marker' : 'prayer', key, minute: times[key], name: PRAYER_NAMES[key] }))
    : [];
  // Sholat tampil lebih dulu kalau jamnya sama dengan tugas.
  const rank = { prayer: 0, marker: 1, task: 2 };
  const timeline = [...prayers, ...timed].sort((a, b) => a.minute - b.minute || rank[a.type] - rank[b.type]);
  return { times, untimed, timeline };
}

// Semua pengingat yang berbunyi di antara dua waktu (milidetik).
export function remindersBetween(state, fromMs, toMs) {
  const out = [];
  const startDay = ymd(new Date(fromMs - 2 * 864e5)); // pengingat "1 hari sebelum" bisa dari hari sesudahnya
  const endDay = ymd(new Date(toMs + 8 * 864e5));
  const allDayMinute = hmToMin(state.settings.allDayReminderAt ?? '07:00');

  for (let d = startDay; d <= endDay; d = addDays(d, 1)) {
    const times = timesFor(state, d);
    for (const { task, minute, done } of dayTasks(state, d)) {
      if (done || !task.reminders?.length) continue;
      const base = minute ?? allDayMinute;
      for (const offset of task.reminders) {
        const fireAt = atMinutes(d, base - offset).getTime();
        if (fireAt > fromMs && fireAt <= toMs) {
          let body = offset >= 1440 ? 'Besok' : 'Hari ini';
          if (minute != null) {
            body = offset >= 1440
              ? `Besok pukul ${clock(minute)}`
              : offset
                ? `Pukul ${clock(minute)}, ${durationLabel(offset)} lagi`
                : `Pukul ${clock(minute)}`;
          }
          out.push({ id: `t:${task.id}:${d}:${offset}`, kind: 'task', taskId: task.id, date: d, fireAt, title: task.title, body });
        }
      }
    }
    if (!times) continue;
    const alerts = state.settings.prayerAlerts ?? {};
    const lead = state.settings.prayerLead ?? 0;
    for (const key of PRAYERS) {
      if (!alerts[key]) continue;
      const fireAt = atMinutes(d, times[key] - lead).getTime();
      if (fireAt > fromMs && fireAt <= toMs) {
        const title = lead ? `${PRAYER_NAMES[key]} ${lead} menit lagi` : `Waktunya ${PRAYER_NAMES[key]}`;
        out.push({ id: `p:${key}:${d}`, kind: 'prayer', prayer: key, date: d, fireAt, title, body: `Pukul ${clock(times[key])}` });
      }
    }
  }
  return out.sort((a, b) => a.fireAt - b.fireAt);
}

// Sholat beruntun: hari lengkap berturut-turut. Hari ini baru dihitung kalau sudah lengkap,
// dan uzur tidak memutus hitungan.
export function prayerStreak(state, today) {
  const log = state.prayerLog ?? {};
  const complete = (d) => PRAYERS.every((p) => log[d]?.[p]);
  const allExcused = (d) => PRAYERS.every((p) => log[d]?.[p] === 'uzur');
  let streak = complete(today) && !allExcused(today) ? 1 : 0;
  for (let d = addDays(today, -1), i = 0; i < 3650; i++, d = addDays(d, -1)) {
    if (!complete(d)) break;
    if (!allExcused(d)) streak += 1;
  }
  return streak;
}
