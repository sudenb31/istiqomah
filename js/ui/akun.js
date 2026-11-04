// Bagian Akun dan Kalender di Pengaturan.
import { h } from './dom.js';
import { icon } from './icons.js';
import { toast } from './toast.js';
import { store, updateSettings } from '../store.js';
import {
  authMessage, cloud, cloudEnabled, disconnectGoogle, prepareGoogleLink, refreshGoogleStatus, requestCode, signOut, syncNow, verifyCode,
} from '../cloud.js';

const form = { step: 'email', email: '', code: '', busy: false, error: null, waitUntil: 0 };

function agoLabel(at) {
  if (!at) return 'Belum pernah';
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return 'Barusan';
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours} jam lalu` : `${Math.round(hours / 24)} hari lalu`;
}

function statusLine() {
  if (cloud.status === 'syncing') return 'Lagi sinkron...';
  if (cloud.status === 'offline') return 'Lagi offline. Perubahan dikirim begitu ada internet.';
  if (cloud.status === 'error') return 'Sinkron terakhir gagal. Bakal dicoba lagi otomatis.';
  return `Tersinkron ${agoLabel(cloud.lastSyncAt).toLowerCase()}`;
}

function loginForm(rerender) {
  const run = async (task) => {
    form.busy = true;
    form.error = null;
    rerender();
    try {
      await task();
    } catch (err) {
      form.error = authMessage(err);
    }
    form.busy = false;
    rerender();
  };

  const sendCode = () => run(async () => {
    const email = form.email.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw Object.assign(new Error(), { code: 'email_address_invalid' });
    await requestCode(email);
    form.step = 'code';
    form.code = '';
    toast('Kode dikirim ke email kamu 📬');
    setTimeout(() => document.querySelector('[data-fid="kode"]')?.focus(), 0);
  });

  const signIn = () => run(async () => {
    const code = form.code.replace(/\s/g, '');
    await verifyCode(form.email.trim(), code);
    form.step = 'email';
    form.code = '';
    toast('Berhasil masuk 🎉');
  });

  if (form.step === 'code') {
    return h('form', {
      class: 'login',
      novalidate: true,
      onSubmit: (e) => { e.preventDefault(); signIn(); },
    },
      h('p', null, 'Masukkan kode yang dikirim ke ', h('strong', null, form.email)),
      h('label', { class: 'field' },
        h('span', { class: 'sr' }, 'Kode dari email'),
        h('input', {
          type: 'text',
          class: 'code-input',
          inputmode: 'numeric',
          autocomplete: 'one-time-code',
          placeholder: 'Kode',
          maxlength: 10,
          'data-fid': 'kode',
          value: form.code,
          onInput: (e) => { form.code = e.target.value; },
        }),
      ),
      form.error ? h('p', { class: 'field-error', role: 'alert' }, form.error) : null,
      h('button', { type: 'submit', class: 'btn primary', disabled: form.busy }, form.busy ? 'Memeriksa...' : 'Masuk'),
      h('div', { class: 'row-actions' },
        h('button', { type: 'button', class: 'link-btn', onClick: () => sendCode() }, 'Kirim ulang kode'),
        h('button', {
          type: 'button',
          class: 'link-btn',
          onClick: () => {
            form.step = 'email';
            form.error = null;
            rerender();
          },
        }, 'Ganti email'),
      ),
    );
  }

  return h('form', {
    class: 'login',
    novalidate: true,
    onSubmit: (e) => { e.preventDefault(); sendCode(); },
  },
    h('p', { class: 'hint' }, 'Masuk supaya data ikut tersimpan di server pribadi kamu, bisa dipakai di HP lain, dan kalender bisa tersambung ke Google.'),
    h('label', { class: 'field' },
      h('span', { class: 'field-label' }, 'Email'),
      h('input', {
        type: 'text',
        inputmode: 'email',
        autocomplete: 'email',
        autocapitalize: 'off',
        spellcheck: 'false',
        placeholder: 'nama@gmail.com',
        'data-fid': 'email',
        value: form.email,
        onInput: (e) => { form.email = e.target.value; },
      }),
    ),
    form.error ? h('p', { class: 'field-error', role: 'alert' }, form.error) : null,
    h('button', { type: 'submit', class: 'btn primary', disabled: form.busy }, form.busy ? 'Mengirim...' : 'Kirim kode ke email'),
  );
}

function googleBlock(rerender) {
  const g = cloud.google;

  if (!g.known) {
    refreshGoogleStatus().catch(() => {});
    return h('p', { class: 'hint' }, 'Memeriksa sambungan Google...');
  }

  if (g.connected) {
    return [
      h('p', { class: 'setting-now' }, icon('kalender', 16), `Tersambung ke ${g.email ?? 'Google Calendar'}`),
      h('p', { class: 'hint' }, cloud.googleSyncing
        ? 'Lagi mengirim tugas ke Google Calendar...'
        : 'Acara Google tampil di Hari ini dan Kalender. Tugas masuk ke kalender bernama Istiqomah di Google, 45 hari ke depan, dan pengingatnya tetap berbunyi walau aplikasi ini tertutup.'),
      h('div', { class: 'chips' },
        h('button', {
          type: 'button',
          class: 'chip',
          'aria-pressed': store.state.settings.googlePrayers !== false ? 'true' : 'false',
          onClick: () => {
            updateSettings({ googlePrayers: store.state.settings.googlePrayers === false });
            rerender();
          },
        }, '🕌 Kirim jadwal sholat ke Google'),
      ),
      h('div', { class: 'row-actions' },
        h('button', {
          type: 'button',
          class: 'btn ghost compact',
          onClick: () => syncNow({ force: true }),
        }, 'Sinkron sekarang'),
        h('button', {
          type: 'button',
          class: 'link-btn danger',
          onClick: async () => {
            if (!confirm('Putuskan Google Calendar? Kalender Istiqomah di akun Google tetap ada sampai kamu hapus sendiri.')) return;
            try {
              await disconnectGoogle();
              toast('Google Calendar diputuskan');
            } catch (err) {
              toast(authMessage(err));
            }
            rerender();
          },
        }, 'Putuskan'),
      ),
    ];
  }

  prepareGoogleLink().catch(() => {});
  return [
    g.needsReconnect ? h('p', { class: 'notice' }, 'Sambungan Google terputus. Hubungkan lagi supaya kalender tetap jalan.') : null,
    h('p', { class: 'hint' }, 'Halaman izin Google bakal kebuka di Safari. Kalau muncul peringatan aplikasi belum diverifikasi, ketuk Advanced lalu lanjutkan, karena aplikasi ini masih dipakai pribadi. Centang semua izin, lalu balik lagi ke sini.'),
    cloud.link
      ? h('a', { class: 'btn primary', href: cloud.link.url, target: '_blank', rel: 'noopener' }, '📅 Hubungkan Google Calendar')
      : h('button', { type: 'button', class: 'btn primary', disabled: true }, 'Menyiapkan tautan...'),
  ];
}

export function accountSection(rerender) {
  if (!cloudEnabled()) return null;
  return h('section', { class: 'panel setting' },
    h('h2', { class: 'block-title' }, 'Akun dan kalender 🔗'),
    !cloud.session
      ? loginForm(rerender)
      : [
          h('p', { class: 'setting-now' }, `✉️ ${cloud.session.email ?? 'Sudah masuk'}`),
          h('p', { class: 'hint' }, statusLine()),
          googleBlock(rerender),
          h('button', {
            type: 'button',
            class: 'link-btn',
            onClick: async () => {
              if (!confirm('Keluar dari akun? Data di perangkat ini tetap ada, tapi berhenti sinkron.')) return;
              await signOut();
              toast('Sudah keluar');
              rerender();
            },
          }, 'Keluar dari akun'),
        ],
  );
}
