// Kalender bulanan dengan tanggal Hijriah kecil dan agenda hari yang dipilih.
import { h } from './dom.js';
import { icon } from './icons.js';
import { taskRow, emptyNote } from './rows.js';
import { openNewTask } from './sheet.js';
import { store } from '../store.js';
import { dayTasks, timesFor } from '../agenda.js';
import { addDays, clock, daysInMonth, hijri, hijriLabel, longDate, monthLabel, weekdayOf, ymd } from '../date.js';
import { PRAYERS, PRAYER_NAMES } from '../prayer.js';

const WEEK = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

const view = { y: null, m: null, selected: null };

function shiftMonth(root, delta) {
  const d = new Date(view.y, view.m + delta, 1);
  view.y = d.getFullYear();
  view.m = d.getMonth();
  renderCalendar(root);
}

function hijriRange(y, m) {
  const adj = store.state.settings.hijriAdjust;
  const a = hijri(ymd(new Date(y, m, 1, 12)), adj);
  const b = hijri(ymd(new Date(y, m, daysInMonth(y, m), 12)), adj);
  if (a.month === b.month) return `${a.month} ${a.year} H`;
  return a.year === b.year ? `${a.month} sampai ${b.month} ${b.year} H` : `${a.month} ${a.year} sampai ${b.month} ${b.year} H`;
}

function dayCell(root, date, today, inMonth) {
  const state = store.state;
  const entries = dayTasks(state, date);
  const open = entries.filter((e) => !e.done);
  const adj = state.settings.hijriAdjust;
  const dayNum = Number(date.slice(8));
  const shown = open.slice().sort((a, b) => (b.task.priority ?? 0) - (a.task.priority ?? 0)).slice(0, 3);
  const label = `${longDate(date)}, ${open.length ? `${open.length} tugas` : 'tidak ada tugas'}`;
  return h('button', {
    type: 'button',
    class: `day${inMonth ? '' : ' out'}${date === today ? ' is-today' : ''}${date === view.selected ? ' is-selected' : ''}`,
    'aria-label': label,
    'aria-pressed': date === view.selected ? 'true' : 'false',
    onClick: () => {
      view.selected = date;
      renderCalendar(root);
    },
  },
    h('span', { class: 'day-num' }, dayNum),
    h('span', { class: 'day-hijri' }, hijri(date, adj).day),
    h('span', { class: 'day-dots' },
      shown.map((e) => h('i', { 'data-priority': e.task.priority ?? 0 })),
    ),
  );
}

function prayerStrip(date) {
  const times = timesFor(store.state, date);
  if (!times) return null;
  return h('dl', { class: 'prayer-strip' },
    PRAYERS.map((key) => h('div', null, h('dt', null, PRAYER_NAMES[key]), h('dd', null, clock(times[key])))),
  );
}

export function renderCalendar(root) {
  const today = ymd(new Date());
  if (view.y == null) {
    const d = new Date();
    view.y = d.getFullYear();
    view.m = d.getMonth();
    view.selected = today;
  }
  const first = ymd(new Date(view.y, view.m, 1, 12));
  const start = addDays(first, -((weekdayOf(first) + 6) % 7));
  const total = daysInMonth(view.y, view.m);
  const cellCount = Math.ceil((((weekdayOf(first) + 6) % 7) + total) / 7) * 7;

  const cells = [];
  for (let i = 0; i < cellCount; i++) {
    const date = addDays(start, i);
    cells.push(dayCell(root, date, today, date.slice(0, 7) === first.slice(0, 7)));
  }

  const entries = dayTasks(store.state, view.selected)
    .sort((a, b) => a.done - b.done || (a.minute ?? 9999) - (b.minute ?? 9999));

  root.replaceChildren(
    h('div', { class: 'page page-top' },
      h('div', { class: 'panel' },
      h('header', { class: 'cal-head' },
        h('h1', { class: 'view-title' }, monthLabel(view.y, view.m)),
        h('div', { class: 'cal-nav' },
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Bulan sebelumnya', onClick: () => shiftMonth(root, -1) }, icon('kiri')),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Bulan berikutnya', onClick: () => shiftMonth(root, 1) }, icon('kanan')),
        ),
        h('p', { class: 'view-sub cal-sub' }, hijriRange(view.y, view.m)),
        first.slice(0, 7) !== today.slice(0, 7) || view.selected !== today
          ? h('button', {
              type: 'button',
              class: 'link-btn cal-today',
              onClick: () => {
                view.y = null;
                renderCalendar(root);
              },
            }, 'Kembali ke hari ini')
          : null,
      ),
      h('div', { class: 'cal-week', 'aria-hidden': 'true' }, WEEK.map((d) => h('span', null, d))),
      h('div', { class: 'cal-grid' }, cells),
      ),
      h('section', { class: 'panel' },
        h('header', { class: 'agenda-head' },
          h('div', null,
            h('h2', { class: 'agenda-title' }, longDate(view.selected)),
            h('p', { class: 'view-sub' }, hijriLabel(view.selected, store.state.settings.hijriAdjust)),
          ),
          h('button', {
            type: 'button',
            class: 'btn ghost compact',
            onClick: () => openNewTask({ date: view.selected }),
          }, icon('plus', 16), 'Tambah'),
        ),
        prayerStrip(view.selected),
        entries.length
          ? h('ul', { class: 'task-list' }, entries.map((e) => taskRow(e, { today, showTime: true, showClock: true })))
          : emptyNote('Kosong. Mau isi sesuatu di tanggal ini?'),
      ),
    ),
  );
}
