import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuick } from '../js/quickadd.js';
import { occursOn, isDoneOn, nextOccurrence } from '../js/repeat.js';
import { skyStops, heroColors, contrast } from '../js/sky.js';
import { prayerTimes, CITIES } from '../js/prayer.js';
import { dayAgenda, remindersBetween, prayerStreak } from '../js/agenda.js';
import { buildIcs, foldLine, escapeText } from '../js/ics.js';
import { ymd, addDays, hijri } from '../js/date.js';

// Rabu, 4 November 2026 pukul 09.00
const NOW = new Date(2026, 10, 4, 9, 0);
const TODAY = '2026-11-04';
const q = (text) => parseQuick(text, NOW);

const baseState = () => ({
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
  },
});

test('tanggal relatif', () => {
  assert.equal(q('bayar listrik besok').date, '2026-11-05');
  assert.equal(q('bayar listrik besok').title, 'bayar listrik');
  assert.equal(q('servis motor lusa').date, '2026-11-06');
  assert.equal(q('kirim laporan hari ini').date, TODAY);
  assert.equal(q('cek stok 3 hari lagi').date, '2026-11-07');
  assert.equal(q('evaluasi minggu depan').date, '2026-11-11');
});

test('nama hari', () => {
  assert.equal(q('rapat senin').date, '2026-11-09');
  assert.equal(q('rapat rabu').date, '2026-11-11', 'hari yang sama berarti pekan depan');
  assert.equal(q('rapat jumat').date, '2026-11-06');
  assert.equal(q('rapat kamis depan').date, '2026-11-12');
  assert.equal(q('main bola hari minggu').date, '2026-11-08');
  assert.equal(q('kajian ahad').date, '2026-11-08');
});

test('kata minggu dalam judul tidak dianggap tanggal', () => {
  const p = q('susun laporan minggu ini');
  assert.equal(p.date, null);
  assert.equal(p.title, 'susun laporan minggu ini');
});

test('tanggal eksplisit', () => {
  assert.equal(q('ultah ibu 12 desember').date, '2026-12-12');
  assert.equal(q('bayar pajak tgl 20').date, '2026-11-20');
  assert.equal(q('bayar pajak tanggal 2').date, '2026-12-02', 'tanggal lewat pindah ke bulan depan');
  assert.equal(q('perpanjang sim 3 januari').date, '2027-01-03', 'bulan lewat pindah ke tahun depan');
  assert.equal(q('rapat 25/12').date, '2026-12-25');
  assert.equal(q('seminar 1 agustus 2027').date, '2027-08-01');
});

test('jam dan bagian hari', () => {
  assert.equal(q('rapat besok jam 10').time, '10:00');
  assert.equal(q('rapat besok jam 2 siang').time, '14:00');
  assert.equal(q('rapat besok jam 2').time, '14:00', 'tanpa keterangan dianggap siang');
  assert.equal(q('olahraga besok jam 5 pagi').time, '05:00');
  assert.equal(q('makan besok jam 7 malam').time, '19:00');
  assert.equal(q('rapat besok pukul 14.30').time, '14:30');
  assert.equal(q('telepon besok 09:15').time, '09:15');
  assert.equal(q('rapat besok jam 12 siang').time, '12:00');
});

test('jam yang sudah lewat pindah ke besok', () => {
  assert.equal(q('standup jam 8').date, '2026-11-05');
  assert.equal(q('standup jam 10').date, TODAY);
});

test('terkait waktu sholat', () => {
  const a = q('tilawah setelah subuh');
  assert.deepEqual(a.anchor, { prayer: 'subuh', offset: 15 });
  assert.equal(a.title, 'tilawah');
  assert.equal(a.date, TODAY);
  assert.deepEqual(q('siapkan takjil sebelum maghrib').anchor, { prayer: 'maghrib', offset: -15 });
  assert.deepEqual(q('baca buku 30 menit setelah isya').anchor, { prayer: 'isya', offset: 30 });
  assert.deepEqual(q('dzikir ba\'da ashar').anchor, { prayer: 'ashar', offset: 15 });
  assert.deepEqual(q('murojaah sesudah sholat magrib').anchor, { prayer: 'maghrib', offset: 15 });
  assert.deepEqual(q('jalan pagi 1 jam sebelum dzuhur').anchor, { prayer: 'dzuhur', offset: -60 });
});

test('pengulangan', () => {
  assert.deepEqual(q('olahraga setiap hari').repeat, { freq: 'daily', interval: 1 });
  assert.deepEqual(q('standup setiap hari kerja').repeat, { freq: 'weekly', interval: 1, days: [1, 2, 3, 4, 5] });
  assert.deepEqual(q('puasa tiap senin dan kamis').repeat, { freq: 'weekly', interval: 1, days: [1, 4] });
  assert.deepEqual(q('kajian tiap ahad').repeat, { freq: 'weekly', interval: 1, days: [0] });
  assert.deepEqual(q('belanja setiap minggu').repeat, { freq: 'weekly', interval: 1 });
  assert.deepEqual(q('bayar sewa setiap bulan').repeat, { freq: 'monthly', interval: 1 });
  assert.deepEqual(q('siram taman setiap 3 hari').repeat, { freq: 'daily', interval: 3 });
  assert.equal(q('puasa tiap senin dan kamis').date, '2026-11-05', 'mulai dari hari pertama yang cocok');
});

test('gabungan lengkap dan pembersihan judul', () => {
  const p = q('tilawah setiap hari setelah subuh #ibadah !1');
  assert.equal(p.title, 'tilawah');
  assert.equal(p.listName, 'ibadah');
  assert.equal(p.priority, 3);
  assert.deepEqual(p.reminders, [0]);
  assert.equal(q('rapat vendor besok jam 10 ingatkan 30 menit').reminders[0], 30);
  assert.deepEqual(q('beli sabun').reminders, []);
  assert.equal(q('beli sabun').date, null);
  assert.equal(q('besok').title, 'besok', 'judul tidak boleh kosong');
});

test('pengulangan: kejadian dan batas', () => {
  const daily = { date: TODAY, repeat: { freq: 'daily', interval: 2 } };
  assert.equal(occursOn(daily, TODAY), true);
  assert.equal(occursOn(daily, '2026-11-05'), false);
  assert.equal(occursOn(daily, '2026-11-06'), true);
  assert.equal(occursOn(daily, '2026-11-03'), false, 'tidak muncul sebelum tanggal mulai');

  const weekly = { date: '2026-11-05', repeat: { freq: 'weekly', interval: 1, days: [1, 4] } };
  assert.equal(occursOn(weekly, '2026-11-09'), true);
  assert.equal(occursOn(weekly, '2026-11-10'), false);

  const biweekly = { date: TODAY, repeat: { freq: 'weekly', interval: 2 } };
  assert.equal(occursOn(biweekly, '2026-11-11'), false);
  assert.equal(occursOn(biweekly, '2026-11-18'), true);

  const until = { date: TODAY, repeat: { freq: 'daily', until: '2026-11-05' } };
  assert.equal(occursOn(until, '2026-11-05'), true);
  assert.equal(occursOn(until, '2026-11-06'), false);

  const skip = { date: TODAY, repeat: { freq: 'daily' }, skips: { '2026-11-05': true } };
  assert.equal(occursOn(skip, '2026-11-05'), false);
});

test('tanggal 31 jatuh ke akhir bulan yang pendek', () => {
  const t = { date: '2026-01-31', repeat: { freq: 'monthly', interval: 1 } };
  assert.equal(occursOn(t, '2026-02-28'), true);
  assert.equal(occursOn(t, '2026-03-31'), true);
  assert.equal(occursOn(t, '2026-04-30'), true);
  assert.equal(occursOn(t, '2026-04-29'), false);
});

test('status selesai per kejadian dan kejadian berikutnya', () => {
  const t = { date: TODAY, repeat: { freq: 'daily' }, completions: { [TODAY]: 1 } };
  assert.equal(isDoneOn(t, TODAY), true);
  assert.equal(isDoneOn(t, '2026-11-05'), false);
  assert.equal(nextOccurrence(t, TODAY), '2026-11-05');
  assert.equal(nextOccurrence({ date: '2026-12-01' }, TODAY), '2026-12-01');
});

test('warna kepala halaman selalu terbaca sepanjang hari', () => {
  const t = prayerTimes(TODAY, CITIES.find((c) => c.name === 'Jakarta'), { method: 'kemenag' });
  const stops = skyStops(t);
  for (let m = 0; m < 1440; m += 5) {
    const { from, to, text } = heroColors(m, stops);
    assert.ok(contrast(from, text) >= 4.5, `menit ${m} awal ${contrast(from, text)}`);
    assert.ok(contrast(to, text) >= 4.5, `menit ${m} akhir ${contrast(to, text)}`);
  }
});

test('agenda: tugas ikut sholat bergeser mengikuti jadwal dan urutan kronologis', () => {
  const s = baseState();
  s.tasks = [
    { id: 'a', title: 'Tilawah', date: TODAY, anchor: { prayer: 'subuh', offset: 15 }, repeat: { freq: 'daily' }, reminders: [0] },
    { id: 'b', title: 'Rapat', date: TODAY, time: '10:00', reminders: [10] },
    { id: 'c', title: 'Beli sabun', date: TODAY, reminders: [] },
  ];
  const { timeline, untimed, times } = dayAgenda(s, TODAY);
  assert.equal(untimed[0].task.id, 'c');
  const order = timeline.map((e) => e.key ?? e.task.id);
  assert.deepEqual(order, ['subuh', 'a', 'terbit', 'b', 'dzuhur', 'ashar', 'maghrib', 'isya']);
  assert.equal(timeline[1].minute, times.subuh + 15);
});

test('pengingat: tugas, sholat, dan yang sudah selesai dilewati', () => {
  const s = baseState();
  s.settings.prayerAlerts = {};
  s.tasks = [
    { id: 'b', title: 'Rapat', date: TODAY, time: '10:00', reminders: [10, 0] },
    { id: 'd', title: 'Sudah', date: TODAY, time: '10:00', reminders: [0], doneAt: 1 },
  ];
  const from = new Date(2026, 10, 4, 9, 0).getTime();
  const to = new Date(2026, 10, 4, 11, 0).getTime();
  const r = remindersBetween(s, from, to);
  assert.deepEqual(r.map((x) => x.id), ['t:b:2026-11-04:10', 't:b:2026-11-04:0']);

  s.tasks = [];
  s.settings.prayerAlerts = { dzuhur: true };
  const p = remindersBetween(s, new Date(2026, 10, 4, 11, 0).getTime(), new Date(2026, 10, 4, 12, 30).getTime());
  assert.equal(p.length, 1);
  assert.equal(p[0].title, 'Waktunya Dzuhur');
});

test('hitungan beruntun: uzur tidak memutus', () => {
  const all = (v) => ({ subuh: v, dzuhur: v, ashar: v, maghrib: v, isya: v });
  const s = baseState();
  s.prayerLog = {
    '2026-11-01': all('done'),
    '2026-11-02': all('uzur'),
    '2026-11-03': all('done'),
    [TODAY]: { subuh: 'done' },
  };
  assert.equal(prayerStreak(s, TODAY), 2, 'hari ini belum lengkap, uzur tidak dihitung tapi tidak memutus');
  s.prayerLog[TODAY] = all('qadha');
  assert.equal(prayerStreak(s, TODAY), 3);
});

test('ics: format dasar, jam UTC, dan alarm', () => {
  const s = baseState();
  s.settings.prayerAlerts = { subuh: true };
  s.tasks = [{ id: 'x', title: 'Rapat, penting; ok', date: TODAY, time: '10:00', reminders: [15] }];
  const { text, count } = buildIcs(s, { from: TODAY, days: 1, now: NOW });
  assert.equal(count, 2);
  assert.ok(text.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(text.endsWith('END:VCALENDAR\r\n'));
  assert.ok(text.includes('SUMMARY:Rapat\\, penting\\; ok'));
  assert.ok(text.includes('TRIGGER:-PT15M'));
  assert.ok(text.includes('UID:sholat-subuh-2026-11-04@istiqomah.local'));
  assert.equal((text.match(/BEGIN:VEVENT/g) ?? []).length, (text.match(/END:VEVENT/g) ?? []).length);
});

test('ics: pengingat tugas tanpa jam mengikuti jam pengingat harian', () => {
  const s = baseState();
  s.settings.prayerAlerts = {};
  s.settings.allDayReminderAt = '07:00';
  s.tasks = [{ id: 'y', title: 'Bayar listrik', date: TODAY, reminders: [0, 1440] }];
  const { text } = buildIcs(s, { from: TODAY, days: 1, now: NOW });
  assert.ok(text.includes('DTSTART;VALUE=DATE:20261104'));
  assert.ok(text.includes('TRIGGER:PT420M'), 'pukul 07.00 pada hari itu');
  assert.ok(text.includes('TRIGGER:-PT1020M'), 'pukul 07.00 sehari sebelumnya');
});

test('pengingat: isi pesan mudah dibaca', () => {
  const s = baseState();
  s.settings.prayerAlerts = {};
  s.tasks = [{ id: 'b', title: 'Rapat', date: TODAY, time: '10:00', reminders: [90, 1440] }];
  const r = remindersBetween(s, new Date(2026, 10, 3, 0, 0).getTime(), new Date(2026, 10, 4, 9, 0).getTime());
  assert.deepEqual(r.map((x) => x.body), ['Besok pukul 10.00', 'Pukul 10.00, 1 jam 30 menit lagi']);
});

test('ics: lipat baris menjaga batas 75 oktet tanpa memotong huruf', () => {
  const folded = foldLine(`SUMMARY:${'é'.repeat(100)}`);
  for (const line of folded.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75);
  assert.equal(folded.replaceAll('\r\n ', ''), `SUMMARY:${'é'.repeat(100)}`);
  assert.equal(escapeText('a\nb'), 'a\\nb');
});

test('tanggal Hijriah menghasilkan bulan dan tahun', () => {
  const h = hijri(TODAY);
  assert.ok(h.day >= 1 && h.day <= 30);
  assert.ok(h.month.length > 2);
  assert.ok(Number(h.year) > 1440);
  assert.equal(ymd(new Date(2026, 10, 4, 12)), TODAY);
  assert.equal(addDays(TODAY, 30), '2026-12-04');
});
