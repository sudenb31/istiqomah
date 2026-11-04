// Halaman utama: kartu besar sholat berikutnya, lalu garis waktu hari ini.
import { h } from './dom.js';
import { icon } from './icons.js';
import { taskRow, taskBody, taskCheck, prayerButton, emptyNote } from './rows.js';
import { openGaya } from './gaya.js';
import { store } from '../store.js';
import { dayAgenda, overdueTasks, prayerStreak, timesFor } from '../agenda.js';
import { skyStops, skyAt, heroColors, toCss } from '../sky.js';
import { addDays, clock, durationLabel, hijriLabel, longDate, nowMinutes, ymd } from '../date.js';
import { nextPrayer, PRAYERS, PRAYER_NAMES } from '../prayer.js';
import { themeById } from '../themes.js';

const STICKER = { subuh: '🌅', dzuhur: '☀️', ashar: '🌤️', maghrib: '🌇', isya: '🌙' };

let revealed = false;

function heroStyle(theme, minute, stops) {
  if (theme.sky && stops) {
    const c = heroColors(minute, stops);
    return { '--from': toCss(c.from), '--to': toCss(c.to), '--on': toCss(c.text) };
  }
  return { '--from': theme.hero.from, '--to': theme.hero.to, '--on': theme.hero.on };
}

function nextUp(today, minute, times) {
  if (!times) return null;
  const key = nextPrayer(times, minute);
  if (key) return { key, name: PRAYER_NAMES[key], at: times[key], left: times[key] - minute };
  const tomorrow = timesFor(store.state, addDays(today, 1));
  if (!tomorrow) return null;
  return { key: 'subuh', name: 'Subuh besok', at: tomorrow.subuh, left: 1440 - minute + tomorrow.subuh };
}

function progressRow(today, entries) {
  const state = store.state;
  const log = state.prayerLog[today] ?? {};
  const total = entries.length + PRAYERS.length;
  const done = entries.filter((e) => e.done).length + PRAYERS.filter((p) => log[p]).length;
  const streak = prayerStreak(state, today);
  const label = done === total ? 'Semua beres hari ini 🎉' : `${done} dari ${total} beres hari ini`;
  return h('div', { class: 'hero-progress' },
    h('div', { class: 'progress-head' },
      h('span', null, label),
      streak ? h('span', { class: 'streak-chip' }, `🔥 ${streak} hari`) : null,
    ),
    h('div', {
      class: 'progress',
      role: 'progressbar',
      'aria-valuemin': 0,
      'aria-valuemax': total,
      'aria-valuenow': done,
      'aria-label': label,
    }, h('i', { style: { width: `${Math.round((done / total) * 100)}%` } })),
  );
}

function hero(today, minute, times, stops, entries) {
  const s = store.state.settings;
  const theme = themeById(s.look);
  const next = nextUp(today, minute, times);
  const hello = s.nickname ? `Assalamualaikum, ${s.nickname} 👋` : 'Assalamualaikum 👋';

  return h('header', { class: 'hero', style: heroStyle(theme, minute, stops) },
    h('div', { class: 'hero-top' },
      h('p', { class: 'hero-hello' }, hello),
      h('div', { class: 'hero-actions' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Ganti tema dan background', onClick: openGaya }, icon('kuas')),
        h('a', { class: 'icon-btn', href: '#atur', 'aria-label': 'Buka pengaturan' }, icon('atur')),
      ),
    ),
    h('p', { class: 'hero-date' }, longDate(today), h('br'), hijriLabel(today, s.hijriAdjust)),
    next
      ? [
          h('h1', { class: 'hero-next' },
            h('span', { class: 'hero-name' }, next.name),
            h('span', { class: 'hero-time' }, clock(next.at)),
          ),
          h('p', { class: 'hero-left' }, `${durationLabel(next.left)} lagi`),
          h('span', { class: 'hero-sticker', 'aria-hidden': 'true' }, STICKER[next.key]),
        ]
      : h('h1', { class: 'hero-next' }, h('span', { class: 'hero-name' }, 'Jadwal sholat belum tersedia di lokasi ini')),
    progressRow(today, entries),
    !s.locationConfirmed
      ? h('a', { class: 'hero-location', href: '#atur' }, icon('lokasi', 16), `Jadwal pakai ${s.location.name}. Ganti lokasi`)
      : null,
  );
}

function timelineRow(entry, i, ctx) {
  const { stops, nextMinute, today } = ctx;
  const style = stops
    ? { '--a': toCss(skyAt(entry.minute, stops)), '--b': toCss(skyAt(nextMinute, stops)), '--i': i }
    : { '--i': i };

  if (entry.type === 'now') {
    return h('li', { class: 'tl-row tl-now', style },
      h('span', { class: 'tl-time' }, clock(entry.minute)),
      h('span', { class: 'tl-rib' }, h('span', { class: 'tl-dot' })),
      h('span', { class: 'tl-body' }, h('span', { class: 'now-pill' }, 'Sekarang')),
    );
  }
  if (entry.type === 'prayer') {
    const friday = new Date().getDay() === 5 && entry.key === 'dzuhur';
    return h('li', { class: 'tl-row tl-prayer', style },
      h('span', { class: 'tl-time' }, clock(entry.minute)),
      h('span', { class: 'tl-rib' }),
      h('div', { class: 'tl-body' },
        h('h2', { class: 'prayer-name' }, h('span', { 'aria-hidden': 'true' }, `${STICKER[entry.key]} `), friday ? 'Dzuhur / Jumat' : entry.name),
        prayerButton(today, entry.key),
      ),
    );
  }
  if (entry.type === 'marker') {
    return h('li', { class: 'tl-row tl-marker', style },
      h('span', { class: 'tl-time' }, clock(entry.minute)),
      h('span', { class: 'tl-rib' }),
      h('span', { class: 'tl-body' }, entry.name),
    );
  }
  return h('li', { class: `tl-row tl-task${entry.done ? ' is-done' : ''}`, style },
    h('span', { class: 'tl-time' }, clock(entry.minute)),
    h('span', { class: 'tl-rib' }),
    h('div', { class: 'tl-body' }, taskCheck(entry.task, entry.date, entry.done), taskBody(entry)),
  );
}

export function renderToday(root) {
  const now = new Date();
  const today = ymd(now);
  const minute = nowMinutes(now);
  const state = store.state;
  const { times, untimed, timeline } = dayAgenda(state, today);
  const stops = times ? skyStops(times) : null;
  const overdue = overdueTasks(state, today);
  const entries = [...untimed, ...timeline.filter((e) => e.type === 'task')];

  const rows = [...timeline];
  const at = rows.findIndex((e) => e.minute > minute);
  rows.splice(at < 0 ? rows.length : at, 0, { type: 'now', minute });

  const items = rows.map((entry, i) => {
    const next = rows[i + 1]?.minute ?? Math.min(1439, entry.minute + 60);
    return timelineRow(entry, i, { stops, nextMinute: next, today });
  });

  const shouldReveal = !revealed && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  revealed = true;

  root.replaceChildren(
    h('div', { class: 'page page-top' },
      hero(today, minute, times, stops, entries),
      overdue.length
        ? h('section', { class: 'panel' },
            h('h2', { class: 'block-title late' }, '⏰ Terlambat', h('span', { class: 'count' }, overdue.length)),
            h('ul', { class: 'task-list' },
              overdue.map((task) => taskRow({ task, date: task.date, minute: null, done: false }, { showDate: true, today })),
            ),
          )
        : null,
      untimed.length
        ? h('section', { class: 'panel' },
            h('h2', { class: 'block-title' }, '✨ Kapan aja hari ini'),
            h('ul', { class: 'task-list' }, untimed.map((e) => taskRow(e, { today }))),
          )
        : null,
      h('section', { class: 'panel', 'aria-label': 'Garis waktu hari ini' },
        h('ol', { class: `timeline${shouldReveal ? ' reveal' : ''}` }, items),
        !entries.length && !overdue.length
          ? emptyNote('Hari ini masih kosong. Ketuk + buat mulai isi.')
          : null,
      ),
    ),
  );
}
