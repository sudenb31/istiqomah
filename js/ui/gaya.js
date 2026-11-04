// Lembar pilih tema dan background. Pilihan langsung terpasang supaya hasilnya terlihat saat itu juga.
import { h } from './dom.js';
import { icon } from './icons.js';
import { toast } from './toast.js';
import { store, updateSettings, savePhoto, deletePhoto } from '../store.js';
import { BACKGROUNDS, THEMES, resolveTheme, themeTokens } from '../themes.js';
import { activeBackground } from './look.js';

const MAX_SIDE = 1440;
let dlg;

async function shrinkPhoto(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.8);
}

function chooseTheme(theme) {
  // Foto sendiri tetap dipakai walau temanya diganti.
  const keepPhoto = activeBackground() === 'foto';
  updateSettings({ look: theme.id, bg: keepPhoto ? 'foto' : theme.bg });
  render();
}

function themeTile(theme) {
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const { colors } = resolveTheme(theme.id, dark);
  const selected = store.state.settings.look === theme.id;
  return h('button', {
    type: 'button',
    class: 'look-tile',
    'data-fid': `tema-${theme.id}`,
    'aria-pressed': selected ? 'true' : 'false',
    onClick: () => chooseTheme(theme),
  },
    h('span', { class: 'look-mini', style: { background: colors.bg, '--mini-font': themeTokens(theme.id, dark).tokens['--display-font'] } },
      h('span', { class: 'look-mini-hero', style: { background: `linear-gradient(160deg, ${theme.hero.from}, ${theme.hero.to})`, color: theme.hero.on } }, '11.40'),
      h('span', { class: 'look-mini-row', style: { background: colors.surface } },
        h('i', { style: { background: colors.accent } }),
        h('b', { style: { background: colors.muted } }),
      ),
      h('span', { class: 'look-mini-row', style: { background: colors.surface } },
        h('i', { style: { background: colors.line } }),
        h('b', { style: { background: colors.muted } }),
      ),
      h('span', { class: 'look-emoji', 'aria-hidden': 'true' }, theme.emoji),
    ),
    h('span', { class: 'look-name' }, theme.name),
  );
}

function bgTile(bg) {
  const selected = activeBackground() === bg.id;
  return h('button', {
    type: 'button',
    class: 'look-tile',
    'data-fid': `bg-${bg.id}`,
    'aria-pressed': selected ? 'true' : 'false',
    onClick: () => {
      updateSettings({ bg: bg.id });
      render();
    },
  },
    h('span', { class: 'look-mini bg-preview', 'data-preview': bg.id }),
    h('span', { class: 'look-name' }, bg.name),
  );
}

function photoTiles() {
  const hasPhoto = Boolean(store.photo);
  const input = h('input', {
    type: 'file',
    accept: 'image/*',
    class: 'sr',
    'aria-label': 'Pilih foto dari galeri',
    onChange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        await savePhoto(await shrinkPhoto(file));
        updateSettings({ bg: 'foto' });
        toast('Foto terpasang 📸');
        render();
      } catch (err) {
        console.warn(err);
        toast('Foto ini tidak bisa dibuka. Coba foto lain.');
      }
    },
  });

  return h('div', { class: 'photo-row' },
    h('label', { class: 'btn primary photo-pick' }, input, '📸 ', hasPhoto ? 'Ganti foto' : 'Pakai foto sendiri'),
    hasPhoto
      ? h('button', {
          type: 'button',
          class: 'btn ghost',
          onClick: async () => {
            await deletePhoto();
            if (store.state.settings.bg === 'foto') updateSettings({ bg: 'polos' });
            toast('Foto dihapus');
            render();
          },
        }, 'Hapus foto')
      : null,
  );
}

function render() {
  const active = document.activeElement?.dataset?.fid;
  const scroll = dlg.querySelector('.sheet-body')?.scrollTop ?? 0;
  const photoActive = activeBackground() === 'foto';
  dlg.replaceChildren(
    h('div', { class: 'sheet' },
      h('header', { class: 'sheet-head' },
        h('h2', null, 'Ganti gaya 🎨'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tutup', onClick: () => dlg.close() }, icon('tutup')),
      ),
      h('div', { class: 'sheet-body' },
        h('h3', { class: 'gaya-title' }, 'Tema'),
        h('div', { class: 'look-grid' }, THEMES.map(themeTile)),
        h('h3', { class: 'gaya-title' }, 'Background'),
        h('div', { class: 'look-grid' }, BACKGROUNDS.map(bgTile)),
        photoTiles(),
        photoActive || store.photo ? h('p', { class: 'hint' }, 'Foto cuma tersimpan di HP ini dan tidak ikut file cadangan.') : null,
      ),
    ),
  );
  const body = dlg.querySelector('.sheet-body');
  if (body) body.scrollTop = scroll;
  if (active) dlg.querySelector(`[data-fid="${active}"]`)?.focus();
}

export function openGaya() {
  render();
  if (!dlg.open) dlg.showModal();
}

export function initGaya() {
  dlg = document.getElementById('gaya');
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
}
