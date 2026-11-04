// Jadwal lengkap hari ini, catatan sholat empat pekan, dan rutinitas ibadah.
import { h } from './dom.js';
import { icon } from './icons.js';
import { prayerButton, taskRow, emptyNote } from './rows.js';
import { toast } from './toast.js';
import { store, saveTask, uid, ensureList, undo, PRAYER_STATUS } from '../store.js';
import { dayTasks, prayerStreak, timesFor } from '../agenda.js';
import { nextOccurrence } from '../repeat.js';
import { addDays, clock, hijriLabel, longDate, weekdayOf, ymd } from '../date.js';
import { METHODS, PRAYERS, PRAYER_NAMES } from '../prayer.js';

const WEEKS = 4;
const DAILY = { freq: 'daily', interval: 1 };

const ROUTINES = [
  { title: 'Dzikir pagi', anchor: { prayer: 'subuh', offset: 15 }, repeat: DAILY },
  { title: 'Sholat Dhuha', anchor: { prayer: 'dhuha', offset: 15 }, repeat: DAILY },
  { title: 'Dzikir petang', anchor: { prayer: 'ashar', offset: 15 }, repeat: DAILY },
  { title: 'Tilawah', anchor: { prayer: 'maghrib', offset: 15 }, repeat: DAILY },
  { title: 'Tahajud', anchor: { prayer: 'subuh', offset: -60 }, repeat: DAILY },
  { title: 'Puasa Senin Kamis', anchor: null, repeat: { freq: 'weekly', interval: 1, days: [1, 4] } },
];

function addRoutine(tpl, today) {
  const listId = ensureList('Ibadah');
  let date = today;
  if (tpl.repeat.days) for (let i = 0; i < 7 && !tpl.repeat.days.includes(weekdayOf(date)); i++) date = addDays(date, 1);
  saveTask({
    id: uid(),
    title: tpl.title,
    notes: '',
    date,
    time: null,
    anchor: tpl.anchor ? { ...tpl.anchor } : null,
    repeat: { ...tpl.repeat },
    reminders: tpl.anchor ? [0] : [],
    priority: 0,
    listId,
    subtasks: [],
  });
  toast(`${tpl.title} ditambahkan ke rutinitas`, { label: 'Urungkan', run: undo });
}

function scheduleTable(today) {
  const times = timesFor(store.state, today);
  if (!times) return emptyNote('Jadwal belum tersedia untuk lokasi ini. Ganti lokasi di Pengaturan.');
  const order = ['imsak', 'subuh', 'terbit', 'dhuha', 'dzuhur', 'ashar', 'maghrib', 'isya'];
  return h('ul', { class: 'schedule' },
    order.map((key) => {
      const wajib = PRAYERS.includes(key);
      return h('li', { class: wajib ? 'wajib' : 'sunnah' },
        h('span', { class: 'schedule-name' }, PRAYER_NAMES[key]),
        h('span', { class: 'schedule-time' }, clock(times[key])),
        wajib ? prayerButton(today, key) : h('span'),
      );
    }),
  );
}

function logGrid(today) {
  const log = store.state.prayerLog;
  const days = WEEKS * 7;
  const dates = Array.from({ length: days }, (_, i) => addDays(today, i - days + 1));
  let recorded = 0;
  for (const d of dates) for (const p of PRAYERS) if (log[d]?.[p]) recorded += 1;
  const total = days * PRAYERS.length;
  const summary = `${recorded} dari ${total} waktu sholat tercatat dalam ${WEEKS} pekan terakhir`;

  return [
    h('div', { class: 'log-grid', role: 'img', 'aria-label': summary, style: { '--days': days } },
      PRAYERS.map((p) => [
        h('span', { class: 'log-label' }, PRAYER_NAMES[p]),
        dates.map((d) => h('i', {
          class: d === today ? 'today' : null,
          'data-status': log[d]?.[p] ?? 'none',
          title: `${longDate(d)}, ${PRAYER_NAMES[p]}: ${PRAYER_STATUS[log[d]?.[p]] ?? 'Belum'}`,
        })),
      ]),
    ),
    h('ul', { class: 'log-legend' },
      Object.entries(PRAYER_STATUS).map(([k, label]) => h('li', null, h('i', { 'data-status': k }), label)),
    ),
    h('p', { class: 'log-summary' }, summary),
  ];
}

export function renderIbadah(root) {
  const state = store.state;
  const today = ymd(new Date());
  const s = state.settings;
  const streak = prayerStreak(state, today);
  const listId = state.lists.find((l) => l.name.toLowerCase() === 'ibadah')?.id;
  const routines = state.tasks
    .filter((t) => t.repeat && t.listId === listId)
    .map((task) => {
      const date = nextOccurrence(task, today) ?? task.date;
      return dayTasks(state, date).find((e) => e.task.id === task.id) ?? { task, date, minute: null, done: false };
    });
  const available = ROUTINES.filter((tpl) => !state.tasks.some((t) => t.title === tpl.title));

  root.replaceChildren(
    h('div', { class: 'page page-top' },
      h('div', { class: 'panel' },
      h('h1', { class: 'view-title' }, 'Ibadah 🌙'),
      h('p', { class: 'view-sub' }, `${longDate(today)}, ${hijriLabel(today, s.hijriAdjust)}`),
      h('a', { class: 'place-link', href: '#atur' },
        icon('lokasi', 16),
        `${s.location.name}, perhitungan ${METHODS[s.method]?.label ?? s.method}`,
      ),
      ),
      streak
        ? h('section', { class: 'panel streak-card' },
            h('span', { class: 'streak-fire', 'aria-hidden': 'true' }, '🔥'),
            h('p', null, h('strong', null, `${streak} hari`), ' lengkap berturut-turut'),
          )
        : null,
      h('section', { class: 'panel' }, scheduleTable(today)),
      h('section', { class: 'panel' },
        h('h2', { class: 'block-title' }, 'Catatan sholat'),
        logGrid(today),
        h('p', { class: 'hint' }, 'Ketuk status untuk menggantinya: Belum, Sudah, Qadha, Uzur. Uzur tidak memutus hitungan.'),
      ),
      h('section', { class: 'panel' },
        h('h2', { class: 'block-title' }, 'Rutinitas ibadah'),
        routines.length
          ? h('ul', { class: 'task-list' }, routines.map((e) => taskRow(e, { showDate: e.date !== today, today })))
          : emptyNote('Pilih rutinitas di bawah. Jamnya mengikuti waktu sholat dan bergeser sendiri setiap hari.'),
        available.length
          ? h('div', { class: 'chips routine-chips' },
              available.map((tpl) =>
                h('button', { type: 'button', class: 'chip', onClick: () => addRoutine(tpl, today) }, icon('plus', 14), tpl.title),
              ),
            )
          : null,
      ),
    ),
  );
}
