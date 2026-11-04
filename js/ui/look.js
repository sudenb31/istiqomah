// Menerapkan tema dan background yang dipilih ke halaman.
import { store } from '../store.js';
import { themeTokens } from '../themes.js';
import { timesFor } from '../agenda.js';
import { skyAt, skyStops, toCss } from '../sky.js';
import { nowMinutes, ymd } from '../date.js';

const darkQuery = matchMedia('(prefers-color-scheme: dark)');

export function activeBackground() {
  const { bg } = store.state.settings;
  return bg === 'foto' && !store.photo ? 'polos' : bg;
}

function paintBackdrop(bg) {
  const el = document.getElementById('backdrop');
  if (bg === 'foto') {
    el.style.background = `center / cover no-repeat url("${store.photo}")`;
    return;
  }
  if (bg === 'langit') {
    const now = new Date();
    const times = timesFor(store.state, ymd(now));
    if (times) {
      const stops = skyStops(times);
      const m = nowMinutes(now);
      el.style.background = `linear-gradient(175deg, ${toCss(skyAt(m, stops))}, ${toCss(skyAt(m + 150, stops))})`;
      return;
    }
  }
  el.style.removeProperty('background');
}

export function applyLook() {
  const root = document.documentElement;
  const { tokens, scheme, bg } = themeTokens(store.state.settings.look, darkQuery.matches);
  for (const [name, value] of Object.entries(tokens)) root.style.setProperty(name, value);
  root.style.colorScheme = scheme;
  const background = activeBackground();
  root.dataset.bg = background;
  root.dataset.look = store.state.settings.look;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  paintBackdrop(background);
  // Dibaca skrip kecil di index.html supaya tema gelap tidak berkedip terang saat aplikasi dibuka.
  try {
    localStorage.setItem('istiqomah-bg', bg);
  } catch {
    // Penyimpanan bisa diblokir di mode privat. Akibatnya cuma kedipan warna saat dibuka.
  }
}

export const onSchemeChange = (fn) => darkQuery.addEventListener('change', fn);
