import { h } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { toast } from './ui/toast.js';
import { initSheet, openNewTask } from './ui/sheet.js';
import { initGaya } from './ui/gaya.js';
import { applyLook, onSchemeChange } from './ui/look.js';
import { renderToday } from './ui/today.js';
import { renderCalendar } from './ui/calendar.js';
import { renderTasks } from './ui/tasks.js';
import { renderIbadah } from './ui/ibadah.js';
import { renderSettings } from './ui/settings.js';
import { loadStore, store } from './store.js';
import { checkReminders, updateBadge } from './reminders.js';
import { initCloud, onCloudChange } from './cloud.js';
import { ymd } from './date.js';

const VIEWS = {
  'hari-ini': { label: 'Hari ini', icon: 'hari', render: renderToday, title: 'Hari ini', live: true },
  kalender: { label: 'Kalender', icon: 'kalender', render: renderCalendar, title: 'Kalender' },
  tugas: { label: 'Tugas', icon: 'tugas', render: renderTasks, title: 'Tugas' },
  ibadah: { label: 'Ibadah', icon: 'ibadah', render: renderIbadah, title: 'Ibadah', live: true },
  atur: { render: renderSettings, title: 'Pengaturan' },
};

const main = document.getElementById('main');
let current = null;

const viewFromHash = () => {
  const id = location.hash.slice(1);
  return VIEWS[id] ? id : 'hari-ini';
};

function buildNav() {
  const link = (id) =>
    h('a', { href: `#${id}`, class: 'nav-item', 'data-view': id }, icon(VIEWS[id].icon), h('span', null, VIEWS[id].label));
  document.getElementById('nav').replaceChildren(
    link('hari-ini'),
    link('kalender'),
    h('button', {
      type: 'button',
      class: 'nav-add',
      'aria-label': 'Tambah tugas',
      onClick: () => openNewTask(),
    }, icon('plus', 26)),
    link('tugas'),
    link('ibadah'),
  );
}

function syncNav() {
  for (const el of document.querySelectorAll('.nav-item')) {
    if (el.dataset.view === current) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  }
}

function render() {
  applyLook();
  const view = VIEWS[current];
  document.title = `${view.title}, Istiqomah`;
  view.render(main);
  updateBadge();
}

function route() {
  const next = viewFromHash();
  if (next !== current) {
    current = next;
    syncNav();
    render();
    scrollTo(0, 0);
  }
}

// Kolom tertulis di Kalender dan Tugas tidak boleh tergambar ulang tiap menit.
let lastMinute = null;
let lastDay = null;
function tick() {
  const now = new Date();
  const minute = now.getHours() * 60 + now.getMinutes();
  const day = ymd(now);
  if (minute !== lastMinute || day !== lastDay) {
    const dayChanged = lastDay !== null && day !== lastDay;
    lastMinute = minute;
    lastDay = day;
    const editing = document.getElementById('sheet').open;
    if (dayChanged || (VIEWS[current].live && !editing)) render();
    else applyLook(); // warna langit tetap mengikuti jam
    checkReminders();
  }
}

// Keyboard iPhone menutupi elemen fixed, jadi lembar digeser mengikuti area yang terlihat.
function trackViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const sync = () => {
    const root = document.documentElement.style;
    root.setProperty('--kb', `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`);
    root.setProperty('--vvh', `${vv.height}px`);
  };
  vv.addEventListener('resize', sync);
  vv.addEventListener('scroll', sync);
  sync();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Saat pengembangan di localhost, service worker dimatikan kecuali diminta dengan ?sw
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (local && !location.search.includes('sw')) return;

  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const offer = (worker) => {
      toast('Versi baru tersedia', { label: 'Muat ulang', run: () => worker.postMessage('skipWaiting') });
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker);
      });
    });
    // Kunjungan pertama juga memicu controllerchange, tapi tidak perlu memuat ulang.
    let refreshing = !navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
  }).catch((err) => console.warn('Service worker gagal', err));
}

async function boot() {
  await loadStore();
  buildNav();
  initSheet();
  initGaya();
  trackViewport();
  current = viewFromHash();
  syncNav();
  render();

  store.subscribe(render);
  onSchemeChange(render);
  addEventListener('hashchange', route);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  setInterval(tick, 15000);
  tick();
  registerServiceWorker();

  await initCloud();
  // Status akun berubah di latar belakang. Halaman yang sedang diketik tidak digambar ulang.
  onCloudChange(() => {
    const typing = document.activeElement?.matches?.('input, textarea, select');
    if (!typing && !document.getElementById('sheet').open) render();
  });
  render();
}

boot();
