// Menggabungkan data dari dua perangkat. Murni tanpa DOM supaya bisa dites.
// Aturannya: yang terakhir diubah menang, per tugas, per daftar, dan per waktu sholat.

const TOMBSTONE_DAYS = 120;

function mergeMax(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? 0, v);
  return out;
}

function mergeById(localItems = [], remoteItems = [], deleted) {
  const out = new Map();
  for (const item of localItems) out.set(item.id, item);
  for (const item of remoteItems) {
    const mine = out.get(item.id);
    if (!mine || (item.updatedAt ?? 0) > (mine.updatedAt ?? 0)) out.set(item.id, item);
  }
  return [...out.values()].filter((item) => (deleted[item.id] ?? -1) < (item.updatedAt ?? 0));
}

function mergePrayers(local, remote) {
  const stamps = mergeMax(local.prayerStamp, remote.prayerStamp);
  const log = {};
  const dates = new Set([...Object.keys(local.prayerLog ?? {}), ...Object.keys(remote.prayerLog ?? {})]);
  for (const date of dates) {
    const keys = new Set([...Object.keys(local.prayerLog?.[date] ?? {}), ...Object.keys(remote.prayerLog?.[date] ?? {})]);
    for (const key of keys) {
      const stampKey = `${date}|${key}`;
      const mine = local.prayerStamp?.[stampKey] ?? 0;
      const theirs = remote.prayerStamp?.[stampKey] ?? 0;
      const value = theirs > mine ? remote.prayerLog?.[date]?.[key] : local.prayerLog?.[date]?.[key];
      if (value) (log[date] ??= {})[key] = value;
    }
  }
  // Status yang dihapus di perangkat lain punya cap waktu lebih baru tapi tidak punya nilai.
  for (const [stampKey, at] of Object.entries(stamps)) {
    const [date, key] = stampKey.split('|');
    const source = (remote.prayerStamp?.[stampKey] ?? 0) === at ? remote : local;
    if (!source.prayerLog?.[date]?.[key] && log[date]?.[key]) {
      delete log[date][key];
      if (!Object.keys(log[date]).length) delete log[date];
    }
  }
  return { prayerLog: log, prayerStamp: stamps };
}

function pruneTombstones(deleted, now) {
  const limit = now - TOMBSTONE_DAYS * 864e5;
  return Object.fromEntries(Object.entries(deleted).filter(([, at]) => at >= limit));
}

export function mergeStates(local, remote, now = Date.now()) {
  const deleted = mergeMax(local.deleted, remote.deleted);
  const remoteSettingsNewer = (remote.settingsAt ?? 0) > (local.settingsAt ?? 0);
  return {
    ...local,
    tasks: mergeById(local.tasks, remote.tasks, deleted),
    lists: mergeById(local.lists, remote.lists, deleted),
    ...mergePrayers(local, remote),
    deleted: pruneTombstones(deleted, now),
    settings: {
      ...(remoteSettingsNewer ? remote.settings : local.settings),
      lastReminderCheck: local.settings?.lastReminderCheck ?? null, // khusus perangkat ini
    },
    settingsAt: Math.max(local.settingsAt ?? 0, remote.settingsAt ?? 0),
  };
}

// Membuat bentuk baku supaya dua dokumen bisa dibandingkan, tanpa bagian yang khusus perangkat.
export function canonicalDoc(doc) {
  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const sorted = (value) => {
    if (Array.isArray(value)) return value.map(sorted);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sorted(value[k])]));
    }
    return value;
  };
  const { lastReminderCheck, ...settings } = doc.settings ?? {};
  return JSON.stringify(sorted({
    ...doc,
    settings,
    tasks: [...(doc.tasks ?? [])].sort(byId),
    lists: [...(doc.lists ?? [])].sort(byId),
  }));
}

export const sameDoc = (a, b) => canonicalDoc(a) === canonicalDoc(b);

// Dipakai saat Urungkan dan pulihkan cadangan: isi lama dikembalikan tapi dicap sebagai perubahan terbaru,
// supaya tidak langsung kalah oleh versi di server saat sinkron berikutnya.
export function restoreAsNewest(target, current, now = Date.now()) {
  const out = structuredClone(target);
  const prior = new Map((current.tasks ?? []).map((t) => [t.id, t]));
  const priorLists = new Map((current.lists ?? []).map((l) => [l.id, l]));
  out.deleted = { ...current.deleted, ...target.deleted };

  const touch = (items, previous) => {
    for (const item of items) {
      const before = previous.get(item.id);
      if (!before || JSON.stringify(before) !== JSON.stringify(item)) {
        item.updatedAt = now;
        delete out.deleted[item.id];
      }
    }
    for (const id of previous.keys()) {
      if (!items.some((item) => item.id === id)) out.deleted[id] = now;
    }
  };
  touch(out.tasks ?? [], prior);
  touch(out.lists ?? [], priorLists);

  if (JSON.stringify(out.settings) !== JSON.stringify(current.settings)) out.settingsAt = now;
  else out.settingsAt = current.settingsAt ?? 0;

  out.prayerStamp = { ...current.prayerStamp, ...target.prayerStamp };
  const dates = new Set([...Object.keys(current.prayerLog ?? {}), ...Object.keys(out.prayerLog ?? {})]);
  for (const date of dates) {
    const keys = new Set([...Object.keys(current.prayerLog?.[date] ?? {}), ...Object.keys(out.prayerLog?.[date] ?? {})]);
    for (const key of keys) {
      if (current.prayerLog?.[date]?.[key] !== out.prayerLog?.[date]?.[key]) out.prayerStamp[`${date}|${key}`] = now;
    }
  }
  return out;
}
