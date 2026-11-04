// Lembar tambah dan ubah tugas. Saat menambah, kolom judul mengurai kalimat dan menampilkan pratinjau.
import { h } from './dom.js';
import { icon } from './icons.js';
import { toast } from './toast.js';
import { store, saveTask, removeTask, skipOccurrence, undo, ensureList, uid } from '../store.js';
import { parseQuick, describeParsed } from '../quickadd.js';
import { DAY_SHORT } from '../repeat.js';
import { addDays, ymd, relativeDay, weekdayOf, clock, hmToMin } from '../date.js';
import { PRAYER_NAMES } from '../prayer.js';
import { timesFor } from '../agenda.js';

const REMINDER_CHOICES = [
  [0, 'Tepat waktu'],
  [5, '5 menit'],
  [10, '10 menit'],
  [15, '15 menit'],
  [30, '30 menit'],
  [60, '1 jam'],
  [1440, '1 hari'],
];
const PRIORITIES = [[0, 'Tanpa'], [1, 'Rendah'], [2, 'Sedang'], [3, 'Tinggi']];
const CHIP_EMOJI = { date: '📅', time: '⏰', prayer: '🕌', repeat: '🔁', priority: '🔥', list: '🏷️' };
const ANCHORS = ['subuh', 'terbit', 'dhuha', 'dzuhur', 'ashar', 'maghrib', 'isya'];

let dlg;
let draft;
let ui;

const emptyDraft = (date) => ({
  title: '',
  notes: '',
  date: date ?? null,
  time: null,
  anchor: null,
  repeat: null,
  reminders: [],
  priority: 0,
  listId: null,
  subtasks: [],
});

const repeatMode = (r) => {
  if (!r) return 'none';
  if (r.freq === 'weekly' && r.days?.join() === '1,2,3,4,5') return 'workdays';
  return r.freq;
};

export function openNewTask({ date = null } = {}) {
  draft = emptyDraft(date);
  ui = { mode: 'new', detailed: false, prefillDate: date, timing: 'none', error: null };
  show();
}

export function openEditTask(task, occurrence) {
  draft = structuredClone(task);
  draft.subtasks ??= [];
  ui = {
    mode: 'edit',
    detailed: true,
    occurrence,
    timing: task.anchor ? 'prayer' : task.time ? 'time' : 'none',
    error: null,
  };
  show();
}

function show() {
  dlg ??= document.getElementById('sheet');
  render();
  if (!dlg.open) dlg.showModal();
  // Dipanggil langsung di dalam ketukan supaya keyboard iPhone ikut terbuka.
  if (ui.mode === 'new') dlg.querySelector('#judul')?.focus();
}

const close = () => dlg.close();

function render() {
  const active = document.activeElement?.dataset?.fid;
  const body = dlg.querySelector('.sheet-body');
  const scroll = body?.scrollTop ?? 0;
  dlg.replaceChildren(
    h('form', {
      class: 'sheet',
      novalidate: true,
      onSubmit: (e) => { e.preventDefault(); submit(); },
    },
      h('header', { class: 'sheet-head' },
        h('h2', null, ui.mode === 'new' ? 'Mau ngapain? ✍️' : 'Ubah tugas'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tutup', onClick: close }, icon('tutup')),
      ),
      h('div', { class: 'sheet-body' },
        titleField(),
        ui.error ? h('p', { class: 'field-error', role: 'alert' }, ui.error) : null,
        ui.detailed ? detailFields() : quickPreview(),
      ),
      footer(),
    ),
  );
  const nextBody = dlg.querySelector('.sheet-body');
  if (nextBody) nextBody.scrollTop = scroll;
  if (active) dlg.querySelector(`[data-fid="${active}"]`)?.focus();
}

function titleField() {
  return h('label', { class: 'field' },
    h('span', { class: 'sr' }, 'Judul tugas'),
    h('input', {
      id: 'judul',
      'data-fid': 'judul',
      class: 'title-input',
      type: 'text',
      autocomplete: 'off',
      enterkeyhint: 'done',
      placeholder: ui.detailed ? 'Judul tugas' : 'Rapat besok jam 10 #kerja',
      value: draft.title,
      onInput: (e) => {
        draft.title = e.target.value;
        if (!ui.detailed) refreshPreview();
      },
    }),
  );
}

function refreshPreview() {
  const holder = dlg.querySelector('#pratinjau');
  if (holder) holder.replaceChildren(...previewChips());
}

function previewChips() {
  const today = ymd(new Date());
  if (!draft.title.trim()) {
    return [h('p', { class: 'hint' }, 'Tulis kayak ngetik biasa: besok, jam 2 siang, setelah subuh, setiap senin, #daftar, !1 buat prioritas tinggi.')];
  }
  const parsed = parseQuick(draft.title);
  if (!parsed.date && ui.prefillDate) parsed.date = ui.prefillDate;
  const chips = describeParsed(parsed, today);
  if (!chips.length) return [h('p', { class: 'hint' }, 'Belum ada tanggal, masuk ke daftar Tugas dulu.')];
  return chips.map((c) => h('span', { class: 'parsed-chip', 'data-kind': c.kind }, `${CHIP_EMOJI[c.kind] ?? ''} ${c.label}`));
}

function quickPreview() {
  return [
    h('div', { id: 'pratinjau', class: 'parsed', 'aria-live': 'polite' }, previewChips()),
    h('button', {
      type: 'button',
      class: 'link-btn',
      onClick: () => {
        applyParsed();
        ui.detailed = true;
        render();
      },
    }, 'Atur tanggal, pengingat, dan lainnya'),
  ];
}

function applyParsed() {
  const raw = draft.title.trim();
  if (!raw) {
    if (ui.prefillDate) draft.date = ui.prefillDate;
    return;
  }
  const p = parseQuick(raw);
  draft.title = p.title;
  draft.date = p.date ?? ui.prefillDate ?? null;
  draft.time = p.time;
  draft.anchor = p.anchor;
  draft.repeat = p.repeat;
  draft.priority = p.priority;
  draft.reminders = p.reminders;
  if (p.listName) draft.listId = ensureList(p.listName);
  ui.timing = p.anchor ? 'prayer' : p.time ? 'time' : 'none';
}

const set = (patch) => {
  Object.assign(draft, patch);
  render();
};

function chip(label, pressed, onClick, fid) {
  return h('button', {
    type: 'button',
    class: 'chip',
    'data-fid': fid,
    'aria-pressed': pressed ? 'true' : 'false',
    onClick,
  }, label);
}

function fieldset(legend, ...kids) {
  return h('fieldset', { class: 'group' }, h('legend', null, legend), kids);
}

function detailFields() {
  return [
    h('label', { class: 'field' },
      h('span', { class: 'sr' }, 'Catatan'),
      h('textarea', {
        'data-fid': 'catatan',
        rows: 2,
        placeholder: 'Catatan',
        value: draft.notes ?? '',
        onInput: (e) => { draft.notes = e.target.value; },
      }),
    ),
    dateGroup(),
    timingGroup(),
    repeatGroup(),
    reminderGroup(),
    fieldset('Prioritas', h('div', { class: 'chips' },
      PRIORITIES.map(([v, label]) => chip(label, (draft.priority ?? 0) === v, () => set({ priority: v }), `prio-${v}`)),
    )),
    listGroup(),
    subtaskGroup(),
  ];
}

function dateGroup() {
  const today = ymd(new Date());
  const quick = [
    ['Hari ini', today],
    ['Besok', addDays(today, 1)],
    ['Pekan depan', addDays(today, 7)],
    ['Tanpa tanggal', null],
  ];
  return fieldset(draft.repeat ? 'Mulai' : 'Tanggal',
    h('div', { class: 'chips' },
      quick.map(([label, value]) => chip(label, draft.date === value, () => set({ date: value }), `tgl-${label}`)),
    ),
    h('input', {
      type: 'date',
      'data-fid': 'tanggal',
      'aria-label': 'Pilih tanggal',
      value: draft.date ?? '',
      onChange: (e) => set({ date: e.target.value || null }),
    }),
  );
}

function timingGroup() {
  const setTiming = (timing) => {
    ui.timing = timing;
    if (timing === 'none') draft = { ...draft, time: null, anchor: null };
    if (timing === 'time') draft = { ...draft, anchor: null, time: draft.time ?? '09:00', date: draft.date ?? ymd(new Date()) };
    if (timing === 'prayer') draft = { ...draft, time: null, anchor: draft.anchor ?? { prayer: 'subuh', offset: 15 }, date: draft.date ?? ymd(new Date()) };
    if (timing !== 'none' && !draft.reminders?.length) draft.reminders = [0];
    render();
  };
  return fieldset('Waktu',
    h('div', { class: 'chips' },
      chip('Tanpa jam', ui.timing === 'none', () => setTiming('none'), 'wkt-none'),
      chip('Pilih jam', ui.timing === 'time', () => setTiming('time'), 'wkt-time'),
      chip('Ikut waktu sholat', ui.timing === 'prayer', () => setTiming('prayer'), 'wkt-prayer'),
    ),
    ui.timing === 'time'
      ? h('input', {
          type: 'time',
          'data-fid': 'jam',
          'aria-label': 'Jam',
          value: draft.time ?? '',
          onChange: (e) => { draft.time = e.target.value || null; },
        })
      : null,
    ui.timing === 'prayer' ? anchorFields() : null,
  );
}

function anchorFields() {
  const a = draft.anchor;
  const direction = a.offset === 0 ? 'tepat' : a.offset < 0 ? 'sebelum' : 'setelah';
  const update = (patch) => {
    draft.anchor = { ...draft.anchor, ...patch };
    render();
  };
  const times = draft.date ? timesFor(store.state, draft.date) : null;
  const resolved = times?.[a.prayer] != null ? clock(times[a.prayer] + a.offset) : null;
  return h('div', { class: 'anchor-fields' },
    h('input', {
      type: 'number',
      inputmode: 'numeric',
      min: 0,
      max: 240,
      'data-fid': 'anchor-menit',
      'aria-label': 'Menit',
      disabled: direction === 'tepat',
      value: Math.abs(a.offset),
      onChange: (e) => {
        const mins = Math.min(240, Math.max(0, Number(e.target.value) || 0));
        update({ offset: direction === 'sebelum' ? -mins : mins });
      },
    }),
    h('span', null, 'menit'),
    h('select', {
      'data-fid': 'anchor-arah',
      'aria-label': 'Sebelum atau setelah',
      value: direction,
      onChange: (e) => {
        const mins = Math.abs(a.offset) || 15;
        const v = e.target.value;
        update({ offset: v === 'tepat' ? 0 : v === 'sebelum' ? -mins : mins });
      },
    },
      h('option', { value: 'sebelum' }, 'sebelum'),
      h('option', { value: 'setelah' }, 'setelah'),
      h('option', { value: 'tepat' }, 'tepat saat'),
    ),
    h('select', {
      'data-fid': 'anchor-sholat',
      'aria-label': 'Waktu sholat',
      value: a.prayer,
      onChange: (e) => update({ prayer: e.target.value }),
    }, ANCHORS.map((key) => h('option', { value: key }, PRAYER_NAMES[key]))),
    resolved
      ? h('p', { class: 'hint anchor-hint' },
          `${relativeDay(draft.date, ymd(new Date()))} jatuh pukul ${resolved}${draft.repeat ? ', lalu ikut bergeser mengikuti jadwal sholat.' : '.'}`)
      : null,
  );
}

function repeatGroup() {
  const mode = repeatMode(draft.repeat);
  const setMode = (value) => {
    const start = draft.date ?? ymd(new Date());
    const until = draft.repeat?.until ?? null;
    const interval = draft.repeat?.interval ?? 1;
    const map = {
      none: null,
      daily: { freq: 'daily', interval, until },
      workdays: { freq: 'weekly', interval: 1, days: [1, 2, 3, 4, 5], until },
      weekly: { freq: 'weekly', interval, days: [weekdayOf(start)], until },
      monthly: { freq: 'monthly', interval, until },
      yearly: { freq: 'yearly', interval, until },
    };
    set({ repeat: map[value], date: value === 'none' ? draft.date : start });
  };
  const r = draft.repeat;
  const unit = { daily: 'hari', weekly: 'minggu', monthly: 'bulan', yearly: 'tahun' }[r?.freq];
  return fieldset('Ulangi',
    h('select', {
      'data-fid': 'ulang',
      'aria-label': 'Pola pengulangan',
      value: mode,
      onChange: (e) => setMode(e.target.value),
    },
      h('option', { value: 'none' }, 'Tidak berulang'),
      h('option', { value: 'daily' }, 'Harian'),
      h('option', { value: 'workdays' }, 'Hari kerja, Senin sampai Jumat'),
      h('option', { value: 'weekly' }, 'Mingguan'),
      h('option', { value: 'monthly' }, 'Bulanan'),
      h('option', { value: 'yearly' }, 'Tahunan'),
    ),
    mode === 'weekly'
      ? h('div', { class: 'chips days' },
          [1, 2, 3, 4, 5, 6, 0].map((d) =>
            chip(DAY_SHORT[d], r.days?.includes(d), () => {
              const days = r.days?.includes(d) ? r.days.filter((x) => x !== d) : [...(r.days ?? []), d];
              if (days.length) set({ repeat: { ...r, days } });
            }, `hari-${d}`),
          ),
        )
      : null,
    r && mode !== 'workdays'
      ? h('label', { class: 'inline-field' },
          h('span', null, 'Setiap'),
          h('input', {
            type: 'number',
            inputmode: 'numeric',
            min: 1,
            max: 99,
            'data-fid': 'interval',
            value: r.interval ?? 1,
            onChange: (e) => set({ repeat: { ...r, interval: Math.min(99, Math.max(1, Number(e.target.value) || 1)) } }),
          }),
          h('span', null, unit),
        )
      : null,
    r
      ? h('label', { class: 'inline-field' },
          h('span', null, 'Sampai'),
          h('input', {
            type: 'date',
            'data-fid': 'sampai',
            value: r.until ?? '',
            onChange: (e) => set({ repeat: { ...r, until: e.target.value || null } }),
          }),
        )
      : null,
  );
}

function reminderGroup() {
  const toggle = (v) => {
    const cur = draft.reminders ?? [];
    set({ reminders: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] });
  };
  const timed = ui.timing !== 'none';
  return fieldset('Ingatkan',
    h('div', { class: 'chips' },
      REMINDER_CHOICES.map(([v, label]) => chip(label, draft.reminders?.includes(v), () => toggle(v), `ingat-${v}`)),
    ),
    !timed && draft.reminders?.length
      ? h('p', { class: 'hint' }, `Tugas tanpa jam diingatkan pukul ${clock(hmToMin(store.state.settings.allDayReminderAt ?? '07:00'))}.`)
      : null,
  );
}

function listGroup() {
  const lists = store.state.lists;
  return fieldset('Daftar',
    h('div', { class: 'chips' },
      chip('Tanpa daftar', !draft.listId, () => set({ listId: null }), 'daftar-none'),
      lists.map((l) => chip(`${l.emoji ?? '📌'} ${l.name}`, draft.listId === l.id, () => set({ listId: l.id }), `daftar-${l.id}`)),
    ),
    h('input', {
      type: 'text',
      'data-fid': 'daftar-baru',
      placeholder: 'Buat daftar baru, lalu tekan Enter',
      enterkeyhint: 'done',
      onKeydown: (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const name = e.target.value.trim();
        if (name) set({ listId: ensureList(name) });
      },
    }),
  );
}

function subtaskGroup() {
  const key = draft.repeat ? (ui.occurrence ?? draft.date) : 'x';
  return fieldset('Langkah',
    h('ul', { class: 'subtasks' },
      draft.subtasks.map((st) =>
        h('li', null,
          h('label', { class: 'subtask' },
            h('input', {
              type: 'checkbox',
              checked: Boolean(st.done?.[key]),
              onChange: (e) => {
                st.done ??= {};
                if (e.target.checked) st.done[key] = true;
                else delete st.done[key];
              },
            }),
            h('span', null, st.title),
          ),
          h('button', {
            type: 'button',
            class: 'icon-btn small',
            'aria-label': `Hapus langkah: ${st.title}`,
            onClick: () => set({ subtasks: draft.subtasks.filter((x) => x.id !== st.id) }),
          }, icon('tutup', 16)),
        ),
      ),
    ),
    h('input', {
      type: 'text',
      'data-fid': 'langkah-baru',
      placeholder: 'Tambah langkah, lalu tekan Enter',
      enterkeyhint: 'done',
      onKeydown: (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const title = e.target.value.trim();
        if (title) set({ subtasks: [...draft.subtasks, { id: uid(), title, done: {} }] });
      },
    }),
  );
}

function footer() {
  const today = ymd(new Date());
  const occ = ui.occurrence;
  return h('footer', { class: 'sheet-foot' },
    ui.mode === 'edit'
      ? h('button', {
          type: 'button',
          class: 'btn ghost danger',
          onClick: () => {
            removeTask(draft.id);
            close();
            toast('Tugas dihapus 🗑️', { label: 'Urungkan', run: undo });
          },
        }, 'Hapus')
      : null,
    ui.mode === 'edit' && draft.repeat && occ
      ? h('button', {
          type: 'button',
          class: 'btn ghost',
          onClick: () => {
            skipOccurrence(draft.id, occ);
            close();
            toast(`Dilewati untuk ${relativeDay(occ, today).toLowerCase()}`, { label: 'Urungkan', run: undo });
          },
        }, `Lewati ${relativeDay(occ, today).toLowerCase()}`)
      : null,
    h('button', { type: 'submit', class: 'btn primary' }, 'Simpan'),
  );
}

function submit() {
  if (!ui.detailed) applyParsed();
  draft.title = draft.title.trim();
  if (!draft.title) {
    ui.error = 'Tulis judul tugas dulu.';
    render();
    dlg.querySelector('#judul')?.focus();
    return;
  }
  if (ui.timing === 'time' && !draft.time) {
    ui.error = 'Pilih jamnya, atau ganti ke Tanpa jam.';
    render();
    return;
  }
  const isNew = ui.mode === 'new';
  saveTask(draft.id ? draft : { ...draft, id: uid() });
  close();
  const today = ymd(new Date());
  const where = draft.date ? ` untuk ${relativeDay(draft.date, today).toLowerCase()}` : '';
  toast(isNew ? `Tersimpan${where} ✨` : 'Perubahan tersimpan ✨');
}

export function initSheet() {
  dlg = document.getElementById('sheet');
  // Ketukan di luar lembar menutupnya.
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
}
