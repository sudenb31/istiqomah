// Aturan pengulangan tugas. Tugas berulang tidak punya salinan per tanggal:
// status selesai disimpan di task.completions[tanggal], dan hari yang dilewati di task.skips[tanggal].
import { diffDays, parseYmd, weekdayOf, addDays, daysInMonth } from './date.js';

export const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export const DAY_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

const startOfWeek = (s) => addDays(s, -((weekdayOf(s) + 6) % 7)); // minggu dihitung mulai Senin

export function occursOn(task, date) {
  if (!task.date) return false;
  const r = task.repeat;
  if (!r) return task.date === date;
  if (date < task.date) return false;
  if (r.until && date > r.until) return false;
  if (task.skips?.[date]) return false;
  const interval = Math.max(1, r.interval ?? 1);

  switch (r.freq) {
    case 'daily':
      return diffDays(task.date, date) % interval === 0;
    case 'weekly': {
      const weeks = Math.round(diffDays(startOfWeek(task.date), startOfWeek(date)) / 7);
      if (weeks % interval !== 0) return false;
      const days = r.days?.length ? r.days : [weekdayOf(task.date)];
      return days.includes(weekdayOf(date));
    }
    case 'monthly': {
      const a = parseYmd(task.date);
      const b = parseYmd(date);
      const months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
      if (months % interval !== 0) return false;
      // Tanggal 31 jatuh ke hari terakhir pada bulan yang lebih pendek.
      return b.getDate() === Math.min(a.getDate(), daysInMonth(b.getFullYear(), b.getMonth()));
    }
    case 'yearly': {
      const a = parseYmd(task.date);
      const b = parseYmd(date);
      if ((b.getFullYear() - a.getFullYear()) % interval !== 0 || a.getMonth() !== b.getMonth()) return false;
      return b.getDate() === Math.min(a.getDate(), daysInMonth(b.getFullYear(), b.getMonth()));
    }
    default:
      return false;
  }
}

export function isDoneOn(task, date) {
  return task.repeat ? Boolean(task.completions?.[date]) : Boolean(task.doneAt);
}

export function nextOccurrence(task, from, horizon = 800) {
  if (!task.date) return null;
  let d = from > task.date ? from : task.date;
  for (let i = 0; i < horizon; i++) {
    if (task.repeat?.until && d > task.repeat.until) return null;
    if (occursOn(task, d) && !isDoneOn(task, d)) return d;
    if (!task.repeat) return null;
    d = addDays(d, 1);
  }
  return null;
}

export function repeatLabel(r) {
  if (!r) return '';
  const n = Math.max(1, r.interval ?? 1);
  const every = (unit) => (n === 1 ? `Setiap ${unit}` : `Setiap ${n} ${unit}`);
  switch (r.freq) {
    case 'daily':
      return every('hari');
    case 'weekly': {
      const days = [...(r.days ?? [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      if (days.join() === '1,2,3,4,5' && n === 1) return 'Setiap hari kerja';
      if (days.length && n === 1) return `Setiap ${days.map((d) => DAY_NAMES[d]).join(', ')}`;
      return every('minggu');
    }
    case 'monthly':
      return every('bulan');
    case 'yearly':
      return every('tahun');
    default:
      return '';
  }
}
