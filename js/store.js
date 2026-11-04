// Satu dokumen state disimpan utuh di IndexedDB. Penulisannya atomik, jadi data tidak bisa setengah tersimpan.
import { CITIES, PRAYERS } from './prayer.js';

const DB_NAME = 'istiqomah';
const STORE = 'kv';
const KEY = 'state';
const PHOTO_KEY = 'photo'; // disimpan terpisah supaya state tetap ringan dan foto tidak ikut cadangan

const LIST_EMOJI = ['📌', '🎯', '🧠', '🛒', '🎒', '🏋️', '🎨', '🧾'];

export const LIST_COLORS = ['#3F66C9', '#C2571A', '#9E2A5B', '#2C7A7B', '#7B4FBF', '#7A6A12'];

export const PRAYER_STATUS = {
  done: 'Sudah',
  qadha: 'Qadha',
  uzur: 'Uzur',
};
const STATUS_ORDER = [undefined, 'done', 'qadha', 'uzur'];

export function defaultState() {
  return {
    app: 'istiqomah',
    version: 1,
    tasks: [],
    lists: [
      { id: 'pribadi', name: 'Pribadi', emoji: '🧍', color: LIST_COLORS[0] },
      { id: 'kerja', name: 'Kerja', emoji: '💼', color: LIST_COLORS[1] },
      { id: 'ibadah', name: 'Ibadah', emoji: '🌙', color: LIST_COLORS[2] },
    ],
    prayerLog: {},
    settings: {
      location: { ...CITIES.find((c) => c.name === 'Jakarta') },
      locationConfirmed: false,
      method: 'kemenag',
      madhab: 'shafi',
      adjust: {},
      hijriAdjust: 0,
      prayerAlerts: Object.fromEntries(PRAYERS.map((p) => [p, true])),
      prayerLead: 0,
      allDayReminderAt: '07:00',
      look: 'langit',
      bg: 'langit',
      nickname: '',
      lastReminderCheck: null,
    },
  };
}

function normalize(raw) {
  const d = defaultState();
  return {
    ...d,
    ...raw,
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
    lists: Array.isArray(raw.lists) && raw.lists.length ? raw.lists : d.lists,
    prayerLog: raw.prayerLog && typeof raw.prayerLog === 'object' ? raw.prayerLog : {},
    settings: {
      ...d.settings,
      ...raw.settings,
      adjust: { ...raw.settings?.adjust },
      prayerAlerts: { ...d.settings.prayerAlerts, ...raw.settings?.prayerAlerts },
    },
  };
}

let db = null;
const listeners = new Set();
let lastUndo = null;

export const store = {
  state: defaultState(),
  photo: null,
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadStore() {
  try {
    db = await openDb();
    const saved = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (saved) store.state = normalize(saved);
    store.photo = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(PHOTO_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Penyimpanan tidak tersedia', err);
    store.storageFailed = true;
  }
  // Meminta browser tidak menghapus data saat ruang penyimpanan menipis.
  navigator.storage?.persist?.().catch(() => {});
  return store.state;
}

function persist() {
  if (!db) return;
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).put(store.state, KEY);
  } catch (err) {
    // Sambungan bisa tertutup saat aplikasi lama di latar belakang. Buka lagi lalu tulis ulang.
    openDb()
      .then((fresh) => {
        db = fresh;
        db.transaction(STORE, 'readwrite').objectStore(STORE).put(store.state, KEY);
      })
      .catch((e) => console.error('Gagal menyimpan', e));
  }
}

const emit = () => listeners.forEach((fn) => fn(store.state));

export function commit(mutate, { undoable = false, silent = false } = {}) {
  const before = undoable ? structuredClone(store.state) : null;
  mutate(store.state);
  if (undoable) lastUndo = before;
  persist();
  if (!silent) emit();
}

export function undo() {
  if (!lastUndo) return;
  store.state = lastUndo;
  lastUndo = null;
  persist();
  emit();
}

function writePhoto(run) {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve();
      return;
    }
    const tx = db.transaction(STORE, 'readwrite');
    run(tx.objectStore(STORE));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function savePhoto(dataUrl) {
  await writePhoto((os) => os.put(dataUrl, PHOTO_KEY));
  store.photo = dataUrl;
}

export async function deletePhoto() {
  await writePhoto((os) => os.delete(PHOTO_KEY));
  store.photo = null;
}

export const uid = () =>
  crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function saveTask(draft) {
  commit((s) => {
    const now = Date.now();
    const i = s.tasks.findIndex((t) => t.id === draft.id);
    if (i >= 0) s.tasks[i] = { ...s.tasks[i], ...draft, updatedAt: now };
    else s.tasks.push({ completions: {}, skips: {}, ...draft, id: draft.id ?? uid(), createdAt: now, updatedAt: now });
  });
}

export function toggleTask(taskId, date) {
  commit(
    (s) => {
      const t = s.tasks.find((x) => x.id === taskId);
      if (!t) return;
      if (t.repeat) {
        t.completions ??= {};
        if (t.completions[date]) delete t.completions[date];
        else t.completions[date] = Date.now();
      } else {
        t.doneAt = t.doneAt ? null : Date.now();
      }
    },
    { undoable: true },
  );
}

export function skipOccurrence(taskId, date) {
  commit(
    (s) => {
      const t = s.tasks.find((x) => x.id === taskId);
      if (!t) return;
      t.skips ??= {};
      t.skips[date] = true;
    },
    { undoable: true },
  );
}

export function removeTask(taskId) {
  commit((s) => { s.tasks = s.tasks.filter((t) => t.id !== taskId); }, { undoable: true });
}

export function clearCompleted() {
  commit((s) => { s.tasks = s.tasks.filter((t) => t.repeat || !t.doneAt); }, { undoable: true });
}

export function ensureList(name) {
  const clean = name.trim();
  const found = store.state.lists.find((l) => l.name.toLowerCase() === clean.toLowerCase());
  if (found) return found.id;
  const id = uid();
  commit((s) => {
    s.lists.push({
      id,
      name: clean,
      emoji: LIST_EMOJI[s.lists.length % LIST_EMOJI.length],
      color: LIST_COLORS[s.lists.length % LIST_COLORS.length],
    });
  }, { silent: true });
  return id;
}

export function removeList(listId) {
  commit(
    (s) => {
      s.lists = s.lists.filter((l) => l.id !== listId);
      for (const t of s.tasks) if (t.listId === listId) t.listId = null;
    },
    { undoable: true },
  );
}

export const listById = (id) => store.state.lists.find((l) => l.id === id) ?? null;

export function cyclePrayer(date, key) {
  commit((s) => {
    const day = (s.prayerLog[date] ??= {});
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(day[key]) + 1) % STATUS_ORDER.length];
    if (next) day[key] = next;
    else delete day[key];
  });
}

export function updateSettings(patch) {
  commit((s) => { Object.assign(s.settings, patch); });
}

// Pencadangan
export function backupText() {
  return JSON.stringify({ ...store.state, exportedAt: new Date().toISOString() }, null, 1);
}

export function restoreBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Berkas ini bukan cadangan yang bisa dibaca.');
  }
  if (data?.app !== 'istiqomah' || !Array.isArray(data.tasks)) {
    throw new Error('Berkas ini bukan cadangan Istiqomah.');
  }
  const { exportedAt, ...rest } = data;
  commit(() => { store.state = normalize(rest); }, { undoable: true });
  return store.state.tasks.length;
}

export function resetAll() {
  commit(() => { store.state = defaultState(); }, { undoable: true });
}
