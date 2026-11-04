// Baris tugas dan tombol status sholat, dipakai bersama oleh semua tampilan.
import { h, srOnly } from './dom.js';
import { icon } from './icons.js';
import { toast } from './toast.js';
import { openEditTask } from './sheet.js';
import { burst, hype, party } from './fun.js';
import { toggleTask, undo, listById, cyclePrayer, PRAYER_STATUS, store } from '../store.js';
import { anchorLabel } from '../quickadd.js';
import { repeatLabel } from '../repeat.js';
import { clock, relativeDay, ymd } from '../date.js';
import { PRAYERS, PRAYER_NAMES } from '../prayer.js';
import { dayTasks } from '../agenda.js';

export const listLabel = (list) => `${list.emoji ?? '📌'} ${list.name}`;

function checkButton(task, date, done) {
  return h('button', {
    type: 'button',
    class: 'check',
    'data-priority': task.priority ?? 0,
    'aria-pressed': done ? 'true' : 'false',
    'aria-label': `${done ? 'Batalkan selesai' : 'Tandai selesai'}: ${task.title}`,
    onClick: (e) => {
      // Posisi diambil dulu karena halaman langsung digambar ulang.
      const rect = e.currentTarget.getBoundingClientRect();
      toggleTask(task.id, date);
      if (done) return;
      burst(rect);
      const today = ymd(new Date());
      const entries = date === today ? dayTasks(store.state, today) : [];
      if (entries.length >= 2 && entries.every((x) => x.done)) {
        party();
        toast('Semua tugas hari ini beres 🎉', { label: 'Urungkan', run: undo });
      } else {
        toast(hype(), { label: 'Urungkan', run: undo });
      }
    },
  }, icon('centang', 16));
}

function metaBits(task, date, { showDate, today, minute }) {
  const bits = [];
  if (showDate && date) {
    const when = relativeDay(date, today);
    bits.push(h('span', { class: date < today ? 'meta-late' : null }, minute == null ? when : `${when} ${clock(minute)}`));
  }
  if (task.anchor) bits.push(h('span', null, `🕌 ${anchorLabel(task.anchor)}`));
  if (task.repeat) bits.push(h('span', { class: 'meta-icon' }, icon('ulang', 13), repeatLabel(task.repeat)));
  if (task.subtasks?.length) {
    const key = task.repeat ? date : 'x';
    const n = task.subtasks.filter((st) => st.done?.[key]).length;
    bits.push(h('span', null, `${n} dari ${task.subtasks.length} langkah`));
  }
  const list = listById(task.listId);
  if (list) bits.push(h('span', null, listLabel(list)));
  if (task.reminders?.length) bits.push(h('span', { class: 'meta-icon' }, icon('lonceng', 13), srOnly('Ada pengingat')));
  return bits;
}

export function taskBody(entry, opts = {}) {
  const { task, date, minute } = entry;
  const bits = metaBits(task, date, { ...opts, minute });
  return [
    h('button', {
      type: 'button',
      class: 'task-open',
      onClick: () => openEditTask(task, date),
    },
      h('span', { class: 'task-title' }, task.title),
      bits.length ? h('span', { class: 'task-meta' }, bits) : null,
    ),
  ];
}

// Baris tugas untuk daftar biasa.
export function taskRow(entry, opts = {}) {
  const { task, date, done } = entry;
  return h('li', { class: `task${done ? ' is-done' : ''}` }, checkButton(task, date, done), taskBody(entry, opts));
}

export const taskCheck = checkButton;

export function prayerButton(date, key) {
  const status = store.state.prayerLog[date]?.[key];
  const label = status ? PRAYER_STATUS[status] : 'Belum';
  return h('button', {
    type: 'button',
    class: 'prayer-status',
    'data-status': status ?? 'none',
    'aria-label': `${PRAYER_NAMES[key]}: ${label}. Ketuk untuk mengganti status.`,
    onClick: (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      cyclePrayer(date, key);
      const log = store.state.prayerLog[date] ?? {};
      if (log[key] !== 'done') return;
      burst(rect);
      if (PRAYERS.every((p) => log[p])) {
        party();
        toast('Alhamdulillah, lima waktu lengkap hari ini 🤍');
      }
    },
  },
    h('span', { class: 'pill' }, status === 'done' ? icon('centang', 14) : null, label),
  );
}

export function emptyNote(text) {
  return h('p', { class: 'empty' }, text);
}
