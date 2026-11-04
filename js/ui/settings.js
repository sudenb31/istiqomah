// Pengaturan lokasi, perhitungan, pengingat, ekspor, dan cadangan.
import { h } from './dom.js';
import { icon } from './icons.js';
import { toast } from './toast.js';
import { openGaya } from './gaya.js';
import { store, updateSettings, backupText, restoreBackup, resetAll, undo, deletePhoto } from '../store.js';
import { CITIES, METHODS, PRAYERS, PRAYER_NAMES } from '../prayer.js';
import { buildIcs } from '../ics.js';
import { ymd } from '../date.js';
import { enableNotifications, notificationState, sendTest } from '../reminders.js';

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(x));
}

function useGps(rerender) {
  if (!navigator.geolocation) {
    toast('Perangkat ini tidak mendukung lokasi otomatis. Pilih kota dari daftar.');
    return;
  }
  toast('Mencari lokasi');
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const here = { lat: Number(coords.latitude.toFixed(4)), lng: Number(coords.longitude.toFixed(4)) };
      const near = CITIES.map((c) => ({ c, km: distanceKm(here, c) })).sort((a, b) => a.km - b.km)[0];
      const close = near.km <= 40;
      updateSettings({
        locationConfirmed: true,
        location: {
          ...here,
          name: close ? `Sekitar ${near.c.name}` : 'Lokasi saat ini',
          tz: -new Date().getTimezoneOffset() / 60,
          dip: close ? near.c.dip ?? 0 : 0,
        },
      });
      toast('Lokasi diperbarui, jadwal sudah disesuaikan');
      rerender();
    },
    (err) => {
      const msg = err.code === err.PERMISSION_DENIED
        ? 'Izin lokasi ditolak. Pilih kota dari daftar, atau izinkan lokasi di pengaturan perangkat.'
        : 'Lokasi tidak ditemukan. Pilih kota dari daftar.';
      toast(msg);
    },
    { timeout: 15000, maximumAge: 600000 },
  );
}

async function shareOrDownload(filename, type, text) {
  const file = new File([text], filename, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const section = (title, ...kids) => h('section', { class: 'panel setting' }, h('h2', { class: 'block-title' }, title), kids);

function locationSection(s, rerender) {
  const cityName = CITIES.find((c) => c.name === s.location.name)?.name ?? '';
  return section('Lokasi',
    h('p', { class: 'setting-now' }, icon('lokasi', 16), s.location.name),
    h('button', { type: 'button', class: 'btn ghost', onClick: () => useGps(rerender) }, 'Pakai lokasi saya'),
    h('label', { class: 'field' },
      h('span', { class: 'field-label' }, 'Atau pilih kota'),
      h('select', {
        value: cityName,
        onChange: (e) => {
          const city = CITIES.find((c) => c.name === e.target.value);
          if (city) updateSettings({ location: { ...city }, locationConfirmed: true });
        },
      },
        h('option', { value: '' }, 'Pilih kota'),
        CITIES.map((c) => h('option', { value: c.name }, c.name)),
      ),
    ),
  );
}

function methodSection(s) {
  const adjustInput = (key) =>
    h('label', { class: 'adjust' },
      h('span', null, PRAYER_NAMES[key]),
      h('input', {
        type: 'number',
        inputmode: 'numeric',
        min: -30,
        max: 30,
        value: s.adjust[key] ?? 0,
        onChange: (e) => {
          const v = Math.min(30, Math.max(-30, Math.round(Number(e.target.value) || 0)));
          updateSettings({ adjust: { ...s.adjust, [key]: v } });
        },
      }),
    );
  return section('Perhitungan jadwal',
    h('label', { class: 'field' },
      h('span', { class: 'field-label' }, 'Metode'),
      h('select', { value: s.method, onChange: (e) => updateSettings({ method: e.target.value }) },
        Object.entries(METHODS).map(([id, m]) => h('option', { value: id }, m.label)),
      ),
    ),
    h('label', { class: 'field' },
      h('span', { class: 'field-label' }, 'Waktu Ashar'),
      h('select', { value: s.madhab, onChange: (e) => updateSettings({ madhab: e.target.value }) },
        h('option', { value: 'shafi' }, 'Syafii, Maliki, Hanbali'),
        h('option', { value: 'hanafi' }, 'Hanafi'),
      ),
    ),
    h('details', { class: 'more' },
      h('summary', null, 'Koreksi menit per waktu sholat'),
      h('p', { class: 'hint' }, 'Pakai ini kalau jadwal masjid setempat berbeda. Angka positif berarti lebih lambat.'),
      h('div', { class: 'adjust-grid' }, ['subuh', 'terbit', 'dzuhur', 'ashar', 'maghrib', 'isya'].map(adjustInput)),
    ),
    h('label', { class: 'field' },
      h('span', { class: 'field-label' }, 'Koreksi tanggal Hijriah'),
      h('select', {
        value: String(s.hijriAdjust),
        onChange: (e) => updateSettings({ hijriAdjust: Number(e.target.value) }),
      },
        h('option', { value: '-1' }, 'Mundur 1 hari'),
        h('option', { value: '0' }, 'Tanpa koreksi'),
        h('option', { value: '1' }, 'Maju 1 hari'),
      ),
    ),
    h('p', { class: 'hint' }, 'Hasil dihitung di perangkat ini. Untuk ibadah yang waktunya krusial, cocokkan dengan jadwal resmi Kemenag atau masjid setempat.'),
  );
}

function notifyStatus(rerender) {
  const state = notificationState();
  if (state === 'needs-install') {
    return h('p', { class: 'notice' }, 'Di iPhone, notifikasi baru bisa aktif setelah aplikasi dipasang ke Layar Utama.');
  }
  if (state === 'unsupported') return h('p', { class: 'notice' }, 'Browser ini tidak mendukung notifikasi.');
  if (state === 'denied') return h('p', { class: 'notice' }, 'Izin notifikasi ditolak. Aktifkan lagi dari pengaturan perangkat, lalu buka ulang aplikasi.');
  if (state === 'granted') {
    return h('div', { class: 'row-actions' },
      h('p', { class: 'setting-now' }, icon('lonceng', 16), 'Notifikasi aktif'),
      h('button', { type: 'button', class: 'btn ghost compact', onClick: sendTest }, 'Kirim contoh'),
    );
  }
  return h('button', {
    type: 'button',
    class: 'btn primary',
    onClick: async () => {
      await enableNotifications();
      rerender();
    },
  }, 'Aktifkan notifikasi');
}

function reminderSection(s, rerender) {
  return section('Pengingat',
    notifyStatus(rerender),
    h('p', { class: 'notice' }, 'Saat ini pengingat hanya berbunyi ketika aplikasi sedang terbuka. Supaya tetap berbunyi saat aplikasi tertutup, kirim jadwal ke kalender perangkat di bagian bawah.'),
    h('fieldset', { class: 'group' },
      h('legend', null, 'Ingatkan waktu sholat'),
      h('div', { class: 'chips' },
        PRAYERS.map((key) =>
          h('button', {
            type: 'button',
            class: 'chip',
            'aria-pressed': s.prayerAlerts[key] ? 'true' : 'false',
            onClick: () => updateSettings({ prayerAlerts: { ...s.prayerAlerts, [key]: !s.prayerAlerts[key] } }),
          }, PRAYER_NAMES[key]),
        ),
      ),
    ),
    h('label', { class: 'field' },
      h('span', { class: 'field-label' }, 'Ingatkan sebelum masuk waktu'),
      h('select', {
        value: String(s.prayerLead),
        onChange: (e) => updateSettings({ prayerLead: Number(e.target.value) }),
      }, [0, 5, 10, 15, 30].map((v) => h('option', { value: String(v) }, v ? `${v} menit sebelumnya` : 'Tepat saat masuk waktu'))),
    ),
    h('label', { class: 'field' },
      h('span', { class: 'field-label' }, 'Jam pengingat untuk tugas tanpa jam'),
      h('input', {
        type: 'time',
        value: s.allDayReminderAt,
        onChange: (e) => { if (e.target.value) updateSettings({ allDayReminderAt: e.target.value }); },
      }),
    ),
  );
}

function calendarSection() {
  const days = { value: 30 };
  return section('Kirim ke kalender perangkat',
    h('p', { class: 'hint' }, 'Membuat berkas kalender berisi tugas dan waktu sholat beserta pengingatnya. Kalender perangkat yang akan membunyikannya. Kirim ulang kalau jadwal berubah.'),
    h('label', { class: 'field' },
      h('span', { class: 'field-label' }, 'Rentang'),
      h('select', { value: '30', onChange: (e) => { days.value = Number(e.target.value); } },
        h('option', { value: '7' }, '7 hari'),
        h('option', { value: '30' }, '30 hari'),
        h('option', { value: '90' }, '90 hari'),
      ),
    ),
    h('button', {
      type: 'button',
      class: 'btn ghost',
      onClick: async () => {
        const { text, count } = buildIcs(store.state, { from: ymd(new Date()), days: days.value });
        await shareOrDownload('istiqomah.ics', 'text/calendar', text);
        toast(`Berkas kalender dibuat, ${count} jadwal`);
      },
    }, 'Buat berkas kalender'),
  );
}

function dataSection(rerender) {
  const fileInput = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    class: 'sr',
    'aria-label': 'Pilih berkas cadangan',
    onChange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const n = restoreBackup(await file.text());
        toast(`Cadangan dipulihkan, ${n} tugas`, { label: 'Urungkan', run: undo });
        rerender();
      } catch (err) {
        toast(err.message);
      }
    },
  });
  return section('Data',
    h('p', { class: 'hint' }, 'Semua data hanya tersimpan di perangkat ini dan tidak dikirim ke mana pun. Simpan cadangan secara berkala supaya tidak hilang kalau ganti HP.'),
    h('div', { class: 'row-actions' },
      h('button', {
        type: 'button',
        class: 'btn ghost',
        onClick: () => shareOrDownload(`istiqomah-cadangan-${ymd(new Date())}.json`, 'application/json', backupText()),
      }, 'Simpan cadangan'),
      h('button', { type: 'button', class: 'btn ghost', onClick: () => fileInput.click() }, 'Pulihkan cadangan'),
      fileInput,
    ),
    h('button', {
      type: 'button',
      class: 'link-btn danger',
      onClick: () => {
        if (!confirm('Hapus semua tugas, catatan sholat, dan pengaturan di perangkat ini?')) return;
        resetAll();
        deletePhoto();
        toast('Semua data dihapus', { label: 'Urungkan', run: undo });
      },
    }, 'Hapus semua data'),
  );
}

function appearanceSection(s) {
  return section('Tampilan 🎨',
    h('button', { type: 'button', class: 'btn primary', onClick: openGaya }, 'Ganti tema dan background'),
    h('label', { class: 'field' },
      h('span', { class: 'field-label' }, 'Nama panggilan'),
      h('input', {
        type: 'text',
        maxlength: 24,
        autocomplete: 'off',
        placeholder: 'Muncul di sapaan halaman utama',
        value: s.nickname ?? '',
        onChange: (e) => updateSettings({ nickname: e.target.value.trim() }),
      }),
    ),
  );
}

function installSection() {
  if (isStandalone() || !isIos()) return null;
  return section('Pasang ke Layar Utama',
    h('ol', { class: 'steps' },
      h('li', null, 'Buka alamat aplikasi ini di Safari.'),
      h('li', null, 'Ketuk tombol Bagikan di bawah layar.'),
      h('li', null, 'Pilih Tambah ke Layar Utama.'),
    ),
  );
}

export function renderSettings(root) {
  const s = store.state.settings;
  const rerender = () => renderSettings(root);
  root.replaceChildren(
    h('div', { class: 'page page-top' },
      h('div', { class: 'panel' }, h('h1', { class: 'view-title' }, 'Pengaturan ⚙️')),
      store.storageFailed ? h('p', { class: 'notice' }, 'Penyimpanan browser tidak tersedia, jadi perubahan hilang saat aplikasi ditutup. Keluar dari mode privat lalu buka lagi.') : null,
      installSection(),
      appearanceSection(s),
      locationSection(s, rerender),
      methodSection(s),
      reminderSection(s, rerender),
      calendarSection(),
      dataSection(rerender),
    ),
  );
}
