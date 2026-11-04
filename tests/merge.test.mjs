// Penggabungan data antar perangkat dan penyusunan acara Google.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalDoc, mergeStates, restoreAsNewest, sameDoc } from '../js/merge.js';
import { buildGoogleEvents, eventId, eventsOnDate, syncRange } from '../js/gcal.js';

const NOW = 1_800_000_000_000;
const base = (over = {}) => ({
  app: 'istiqomah',
  version: 1,
  tasks: [],
  lists: [],
  prayerLog: {},
  prayerStamp: {},
  deleted: {},
  settingsAt: 0,
  settings: { look: 'langit', lastReminderCheck: null },
  ...over,
});

test('tugas yang terakhir diubah menang, tugas baru dari dua sisi tetap ada', () => {
  const local = base({ tasks: [{ id: 'a', title: 'lama', updatedAt: 10 }, { id: 'b', title: 'cuma di sini', updatedAt: 5 }] });
  const remote = base({ tasks: [{ id: 'a', title: 'baru', updatedAt: 20 }, { id: 'c', title: 'cuma di server', updatedAt: 7 }] });
  const merged = mergeStates(local, remote, NOW);
  const byId = Object.fromEntries(merged.tasks.map((t) => [t.id, t.title]));
  assert.deepEqual(byId, { a: 'baru', b: 'cuma di sini', c: 'cuma di server' });
});

test('hapus di satu perangkat tidak bangkit lagi, tapi perubahan yang lebih baru mengalahkan hapus', () => {
  const remote = base({ tasks: [{ id: 'a', title: 'x', updatedAt: 10 }, { id: 'b', title: 'y', updatedAt: 100 }] });
  const local = base({ deleted: { a: NOW - 1000, b: 50 } });
  const merged = mergeStates(local, { ...remote, deleted: {} }, NOW);
  assert.deepEqual(merged.tasks.map((t) => t.id), ['b']);
});

test('tanda hapus yang sangat lama dibersihkan', () => {
  const old = NOW - 200 * 864e5;
  const merged = mergeStates(base({ deleted: { lama: old, baru: NOW - 1000 } }), base(), NOW);
  assert.deepEqual(Object.keys(merged.deleted), ['baru']);
});

test('catatan sholat digabung per waktu, termasuk status yang dihapus', () => {
  const d = '2026-11-04';
  const local = base({
    prayerLog: { [d]: { subuh: 'done', dzuhur: 'done' } },
    prayerStamp: { [`${d}|subuh`]: 10, [`${d}|dzuhur`]: 10 },
  });
  const remote = base({
    prayerLog: { [d]: { subuh: 'qadha', ashar: 'done' } },
    prayerStamp: { [`${d}|subuh`]: 20, [`${d}|ashar`]: 15, [`${d}|dzuhur`]: 30 },
  });
  const merged = mergeStates(local, remote, NOW);
  assert.deepEqual(merged.prayerLog[d], { subuh: 'qadha', ashar: 'done' }, 'dzuhur dihapus lebih baru di server');
});

test('pengaturan terbaru menang, tapi waktu cek pengingat tetap milik perangkat ini', () => {
  const local = base({ settingsAt: 10, settings: { look: 'neon', lastReminderCheck: 123 } });
  const remote = base({ settingsAt: 20, settings: { look: 'matcha' } });
  const merged = mergeStates(local, remote, NOW);
  assert.equal(merged.settings.look, 'matcha');
  assert.equal(merged.settings.lastReminderCheck, 123);
  assert.equal(merged.settingsAt, 20);
});

test('perangkat baru mengambil semua dari server', () => {
  const fresh = base({ lists: [{ id: 'kerja', name: 'Kerja' }] });
  const remote = base({ settingsAt: 5, settings: { look: 'bali' }, tasks: [{ id: 't', title: 'x', updatedAt: 1 }], lists: [{ id: 'kerja', name: 'Kerja' }] });
  const merged = mergeStates(fresh, remote, NOW);
  assert.equal(merged.tasks.length, 1);
  assert.equal(merged.settings.look, 'bali');
  assert.equal(merged.lists.length, 1);
});

test('penggabungan dua arah menghasilkan isi yang sama', () => {
  const a = base({ tasks: [{ id: '1', updatedAt: 5 }], settingsAt: 3, settings: { look: 'a' } });
  const b = base({ tasks: [{ id: '2', updatedAt: 6 }], settingsAt: 4, settings: { look: 'b' } });
  assert.ok(sameDoc(mergeStates(a, b, NOW), mergeStates(b, a, NOW)));
});

test('perbandingan dokumen mengabaikan urutan dan kolom khusus perangkat', () => {
  const a = base({ tasks: [{ id: '1' }, { id: '2' }], settings: { look: 'x', lastReminderCheck: 1 } });
  const b = base({ tasks: [{ id: '2' }, { id: '1' }], settings: { lastReminderCheck: 9, look: 'x' } });
  assert.equal(canonicalDoc(a), canonicalDoc(b));
});

test('urungkan hapus membuat tugas kembali dan menang atas tanda hapus di server', () => {
  const before = base({ tasks: [{ id: 'a', title: 'x', updatedAt: 5 }] });
  const current = base({ deleted: { a: NOW - 10 } });
  const restored = restoreAsNewest(before, current, NOW);
  assert.equal(restored.tasks[0].updatedAt, NOW);
  assert.equal(restored.deleted.a, undefined);
  const merged = mergeStates(restored, base({ deleted: { a: NOW - 10 } }), NOW);
  assert.deepEqual(merged.tasks.map((t) => t.id), ['a']);
});

test('urungkan tugas yang baru dibuat menandainya terhapus', () => {
  const before = base();
  const current = base({ tasks: [{ id: 'baru', updatedAt: NOW - 5 }] });
  const restored = restoreAsNewest(before, current, NOW);
  assert.equal(restored.deleted.baru, NOW);
  assert.deepEqual(mergeStates(restored, current, NOW).tasks, []);
});

const gState = () => ({
  tasks: [],
  lists: [],
  prayerLog: {},
  settings: {
    location: { name: 'Jakarta', lat: -6.21, lng: 106.85, tz: 7 },
    method: 'kemenag',
    madhab: 'shafi',
    adjust: {},
    prayerAlerts: { subuh: true, dzuhur: true, ashar: true, maghrib: true, isya: true },
    prayerLead: 0,
    allDayReminderAt: '07:00',
    googlePrayers: true,
  },
});
const TODAY = '2026-11-04';

test('id acara selalu memenuhi aturan Google dan stabil', () => {
  const id = eventId('t:6f1c-Abz:2026-11-04');
  assert.match(id, /^[a-v0-9]{5,1024}$/);
  assert.equal(id, eventId('t:6f1c-Abz:2026-11-04'));
  assert.notEqual(id, eventId('t:6f1c-Abz:2026-11-05'));
});

test('acara Google: jadwal sholat dan tugas berjam', () => {
  const s = gState();
  s.tasks = [{ id: 'r', title: 'Rapat', notes: 'Bawa laptop', date: TODAY, time: '10:00', reminders: [15, 0] }];
  const events = buildGoogleEvents(s, TODAY, 1);
  assert.equal(events.length, 6);
  const rapat = events.find((e) => e.summary === 'Rapat');
  assert.equal(rapat.start, new Date(2026, 10, 4, 10, 0).toISOString());
  assert.equal(rapat.end, new Date(2026, 10, 4, 10, 30).toISOString());
  assert.deepEqual(rapat.reminders, [15, 0]);
  assert.equal(rapat.description, 'Bawa laptop');
  const subuh = events.find((e) => e.summary === 'Subuh');
  assert.equal(subuh.transparent, true);
  assert.equal(subuh.start, new Date(2026, 10, 4, 4, 8).toISOString());
});

test('acara Google: jadwal sholat bisa dimatikan, tugas selesai tidak dikirim', () => {
  const s = gState();
  s.settings.googlePrayers = false;
  s.tasks = [
    { id: 'a', title: 'Selesai', date: TODAY, time: '10:00', reminders: [], doneAt: 1 },
    { id: 'b', title: 'Belum', date: TODAY, time: '11:00', reminders: [] },
  ];
  assert.deepEqual(buildGoogleEvents(s, TODAY, 1).map((e) => e.summary), ['Belum']);
});

test('acara Google: tugas tanpa jam jadi acara seharian, atau dipasang di jam pengingat', () => {
  const s = gState();
  s.settings.googlePrayers = false;
  s.tasks = [
    { id: 'a', title: 'Tanpa ingat', date: TODAY, reminders: [] },
    { id: 'b', title: 'Mau diingatkan', date: TODAY, reminders: [0] },
  ];
  const [a, b] = buildGoogleEvents(s, TODAY, 1);
  assert.equal(a.date, TODAY);
  assert.equal(a.endDate, '2026-11-05');
  assert.equal(b.start, new Date(2026, 10, 4, 7, 0).toISOString());
});

test('acara Google: tugas ikut sholat mengikuti jadwal tiap hari', () => {
  const s = gState();
  s.settings.googlePrayers = false;
  s.tasks = [{ id: 't', title: 'Tilawah', date: TODAY, anchor: { prayer: 'subuh', offset: 15 }, repeat: { freq: 'daily', interval: 1 }, reminders: [0] }];
  const events = buildGoogleEvents(s, TODAY, 30);
  assert.equal(events.length, 30);
  assert.equal(new Set(events.map((e) => e.id)).size, 30);
  assert.equal(events[0].start, new Date(2026, 10, 4, 4, 23).toISOString());
});

test('hash acara berubah hanya kalau isinya berubah', () => {
  const s = gState();
  s.settings.googlePrayers = false;
  s.tasks = [{ id: 'a', title: 'Satu', date: TODAY, time: '10:00', reminders: [] }];
  const first = buildGoogleEvents(s, TODAY, 1)[0];
  assert.equal(buildGoogleEvents(s, TODAY, 1)[0].h, first.h);
  s.tasks[0].title = 'Dua';
  assert.notEqual(buildGoogleEvents(s, TODAY, 1)[0].h, first.h);
});

test('rentang sinkron dari awal hari', () => {
  const r = syncRange(TODAY, 2);
  assert.equal(r.timeMin, new Date(2026, 10, 4).toISOString());
  assert.equal(r.timeMax, new Date(2026, 10, 6).toISOString());
});

test('acara Google per tanggal: berjam, seharian, dan beberapa hari', () => {
  const events = [
    { title: 'Rapat', allDay: false, start: new Date(2026, 10, 4, 9, 30).toISOString(), end: new Date(2026, 10, 4, 10, 30).toISOString() },
    { title: 'Libur', allDay: true, start: '2026-11-04', end: '2026-11-06' },
    { title: 'Konferensi', allDay: false, start: new Date(2026, 10, 3, 22, 0).toISOString(), end: new Date(2026, 10, 4, 2, 0).toISOString() },
    { title: 'Besok', allDay: false, start: new Date(2026, 10, 5, 9, 0).toISOString(), end: new Date(2026, 10, 5, 10, 0).toISOString() },
  ];
  const today = eventsOnDate(events, TODAY);
  assert.deepEqual(today.map((e) => [e.event.title, e.minute]), [['Rapat', 570], ['Libur', null], ['Konferensi', null]]);
  assert.deepEqual(eventsOnDate(events, '2026-11-05').map((e) => e.event.title), ['Libur', 'Besok']);
  assert.deepEqual(eventsOnDate(events, '2026-11-06'), [], 'tanggal akhir acara seharian tidak termasuk');
});
