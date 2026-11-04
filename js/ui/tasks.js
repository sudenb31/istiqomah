// Semua tugas: cari, saring per daftar, dan kelompokkan menurut waktu.
import { h } from './dom.js';
import { icon } from './icons.js';
import { taskRow, emptyNote } from './rows.js';
import { listLabel } from './rows.js';
import { toast } from './toast.js';
import { store, clearCompleted, removeList, undo } from '../store.js';
import { taskMinute, timesFor } from '../agenda.js';
import { nextOccurrence, isDoneOn } from '../repeat.js';
import { addDays, ymd } from '../date.js';

const filter = { q: '', mode: 'aktif', list: null };

const MODES = [
  ['aktif', 'Aktif'],
  ['rutin', 'Rutin'],
  ['selesai', 'Selesai'],
];

function matches(task) {
  if (filter.list && task.listId !== filter.list) return false;
  const q = filter.q.trim().toLowerCase();
  if (!q) return true;
  return task.title.toLowerCase().includes(q) || (task.notes ?? '').toLowerCase().includes(q);
}

function toEntry(state, task, date) {
  const minute = date ? taskMinute(task, timesFor(state, date)) : null;
  return { task, date, minute, done: date ? isDoneOn(task, date) : Boolean(task.doneAt) };
}

const sortEntries = (a, b) =>
  (a.date ?? '9').localeCompare(b.date ?? '9') ||
  (a.minute ?? 9999) - (b.minute ?? 9999) ||
  (b.task.priority ?? 0) - (a.task.priority ?? 0);

function groupsActive(state, today) {
  const buckets = [
    { title: '⏰ Terlambat', late: true, items: [] },
    { title: '✨ Hari ini', today: true, items: [] },
    { title: '🌱 Besok', items: [] },
    { title: '📆 7 hari ke depan', items: [] },
    { title: '🔭 Nanti', items: [] },
    { title: '💭 Tanpa tanggal', items: [] },
  ];
  const tomorrow = addDays(today, 1);
  const week = addDays(today, 7);
  for (const task of state.tasks) {
    if (task.repeat || task.doneAt || !matches(task)) continue;
    const e = toEntry(state, task, task.date);
    const d = task.date;
    if (!d) buckets[5].items.push(e);
    else if (d < today) buckets[0].items.push(e);
    else if (d === today) buckets[1].items.push(e);
    else if (d === tomorrow) buckets[2].items.push(e);
    else if (d <= week) buckets[3].items.push(e);
    else buckets[4].items.push(e);
  }
  buckets.forEach((b) => b.items.sort(sortEntries));
  return buckets;
}

function groupsRoutine(state, today) {
  const items = state.tasks
    .filter((t) => t.repeat && matches(t))
    .map((task) => toEntry(state, task, nextOccurrence(task, today)))
    .sort(sortEntries);
  return [{ title: null, items }];
}

function groupsDone(state) {
  const items = state.tasks
    .filter((t) => !t.repeat && t.doneAt && matches(t))
    .sort((a, b) => b.doneAt - a.doneAt)
    .map((task) => toEntry(state, task, task.date));
  return [{ title: null, items }];
}

function results() {
  const state = store.state;
  const today = ymd(new Date());
  const groups =
    filter.mode === 'aktif' ? groupsActive(state, today) : filter.mode === 'rutin' ? groupsRoutine(state, today) : groupsDone(state);
  const visible = groups.filter((g) => g.items.length);

  if (!visible.length) {
    const text = filter.q.trim()
      ? 'Gak ketemu. Coba kata lain.'
      : { aktif: 'Bersih! Gak ada tugas aktif. Ketuk + kalau ada yang mau dikerjain.', rutin: 'Belum ada rutinitas. Coba tulis: olahraga setiap hari setelah subuh.', selesai: 'Tugas yang kelar bakal muncul di sini.' }[filter.mode];
    return [emptyNote(text)];
  }
  const out = visible.map((g) =>
    h('section', { class: 'panel' },
      g.title ? h('h2', { class: `block-title${g.late ? ' late' : ''}` }, g.title, h('span', { class: 'count' }, g.items.length)) : null,
      h('ul', { class: 'task-list' }, g.items.map((e) => taskRow(e, { showDate: Boolean(e.date) && !g.today, today }))),
    ),
  );
  if (filter.mode === 'selesai') {
    out.push(h('button', {
      type: 'button',
      class: 'btn ghost danger',
      onClick: () => {
        clearCompleted();
        toast('Tugas selesai dihapus', { label: 'Urungkan', run: undo });
      },
    }, 'Hapus semua yang selesai'));
  }
  return out;
}

export function renderTasks(root) {
  const lists = store.state.lists;
  if (filter.list && !lists.some((l) => l.id === filter.list)) filter.list = null;
  const holder = h('div', { id: 'hasil-tugas', 'aria-live': 'polite' }, results());
  const rerender = () => renderTasks(root);

  root.replaceChildren(
    h('div', { class: 'page page-top' },
      h('div', { class: 'panel' },
      h('h1', { class: 'view-title' }, 'Tugas ✅'),
      h('label', { class: 'search' },
        icon('cari', 18),
        h('span', { class: 'sr' }, 'Cari tugas'),
        h('input', {
          type: 'search',
          placeholder: 'Cari tugas atau catatan',
          value: filter.q,
          onInput: (e) => {
            filter.q = e.target.value;
            holder.replaceChildren(...results());
          },
        }),
      ),
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Jenis tugas' },
        MODES.map(([id, label]) =>
          h('button', {
            type: 'button',
            class: 'chip',
            'aria-pressed': filter.mode === id ? 'true' : 'false',
            onClick: () => {
              filter.mode = id;
              rerender();
            },
          }, label),
        ),
      ),
      h('div', { class: 'chips list-chips', role: 'group', 'aria-label': 'Saring per daftar' },
        h('button', {
          type: 'button',
          class: 'chip',
          'aria-pressed': !filter.list ? 'true' : 'false',
          onClick: () => {
            filter.list = null;
            rerender();
          },
        }, 'Semua daftar'),
        lists.map((l) =>
          h('button', {
            type: 'button',
            class: 'chip',
            'aria-pressed': filter.list === l.id ? 'true' : 'false',
            onClick: () => {
              filter.list = filter.list === l.id ? null : l.id;
              rerender();
            },
          }, listLabel(l)),
        ),
      ),
      filter.list
        ? h('button', {
            type: 'button',
            class: 'link-btn danger',
            onClick: () => {
              const name = lists.find((l) => l.id === filter.list)?.name;
              removeList(filter.list);
              toast(`Daftar ${name} dihapus, tugasnya tetap ada`, { label: 'Urungkan', run: undo });
            },
          }, 'Hapus daftar ini')
        : null,
      ),
      holder,
    ),
  );
}
