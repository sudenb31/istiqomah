// Fungsi server diuji dengan Supabase dan Google tiruan.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../supabase/functions/_shared/api.ts';
import { createCallback } from '../supabase/functions/_shared/callback.ts';
import { cleanDesired, diffEvents, toGoogleEvent } from '../supabase/functions/_shared/events.ts';
import { decryptToken, encryptToken, SCOPES, secretKey } from '../supabase/functions/_shared/core.ts';

const ENV = {
  SUPABASE_URL: 'https://proyek.supabase.co',
  SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'sb_publishable_x' }),
  SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_x' }),
  GOOGLE_CLIENT_ID: 'klien',
  GOOGLE_CLIENT_SECRET: 'rahasia-google',
  TOKEN_KEY: Buffer.alloc(32, 7).toString('base64'),
  APP_URL: 'https://sudenb31.github.io/istiqomah',
};
const USER = { id: '11111111-1111-1111-1111-111111111111', email: 'saya@contoh.com' };
const REFRESH = 'refresh-token-rahasia';

let world;
let calls;

function jsonRes(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// Satu fetch tiruan untuk Supabase dan Google sekaligus.
async function fakeFetch(input, init = {}) {
  const url = new URL(String(input));
  const method = init.method ?? 'GET';
  const headers = Object.fromEntries(new Headers(init.headers).entries());
  const body = init.body;
  calls.push({ url: url.href, method, headers, body: typeof body === 'string' ? body : body?.toString() });

  if (url.pathname === '/auth/v1/user') {
    return headers.authorization === 'Bearer token-sah' ? jsonRes(USER) : jsonRes({ error: 'bad' }, 401);
  }

  if (url.pathname.startsWith('/rest/v1/')) {
    assert.equal(headers.apikey, 'sb_secret_x');
    assert.equal(headers.authorization, undefined, 'secret key baru tidak boleh dikirim sebagai Bearer');
    const table = url.pathname.split('/').pop();
    if (table === 'google_accounts') {
      if (method === 'GET') return jsonRes(world.account ? [world.account] : []);
      if (method === 'PATCH') {
        Object.assign(world.account, JSON.parse(body));
        return new Response(null, { status: 204 });
      }
      if (method === 'DELETE') {
        world.account = null;
        return new Response(null, { status: 204 });
      }
      world.account = JSON.parse(body);
      return new Response(null, { status: 201 });
    }
    if (table === 'oauth_states') {
      if (method === 'POST') {
        world.states.push(JSON.parse(body));
        return new Response(null, { status: 201 });
      }
      if (method === 'DELETE') {
        const state = url.searchParams.get('state')?.replace('eq.', '');
        if (!state) return new Response(null, { status: 204 });
        const row = world.states.find((s) => s.state === state);
        world.states = world.states.filter((s) => s.state !== state);
        return jsonRes(row ? [row] : []);
      }
    }
  }

  if (url.hostname === 'oauth2.googleapis.com') {
    if (url.pathname === '/revoke') {
      world.revoked = url.searchParams.get('token');
      return new Response(null, { status: 200 });
    }
    const form = new URLSearchParams(body);
    if (form.get('grant_type') === 'refresh_token') {
      if (world.refreshInvalid) return jsonRes({ error: 'invalid_grant' }, 400);
      return jsonRes({ access_token: 'akses' });
    }
    return jsonRes({ access_token: 'akses', refresh_token: REFRESH, scope: world.grantedScope });
  }

  if (url.hostname === 'www.googleapis.com') {
    assert.equal(headers.authorization, 'Bearer akses');
    const path = url.pathname.replace('/calendar/v3', '');
    if (path === '/users/me/calendarList') {
      return jsonRes({ items: [
        { id: 'primary@contoh.com', summary: 'Pribadi', selected: true, backgroundColor: '#123456' },
        { id: 'cal-istiqomah', summary: 'Istiqomah', selected: true },
        { id: 'tersembunyi', summary: 'Disembunyikan', selected: false },
      ] });
    }
    if (path === '/users/me/calendarList/primary') return jsonRes({ id: 'primary@contoh.com' });
    if (path === '/calendars' && method === 'POST') return jsonRes({ id: 'cal-baru' });
    if (path.startsWith('/calendars/') && !path.includes('/events')) return jsonRes({}, world.calendarExists ? 200 : 404);
    const m = path.match(/^\/calendars\/([^/]+)\/events(?:\/(.+))?$/);
    if (m) {
      const cal = decodeURIComponent(m[1]);
      if (cal === 'primary@contoh.com' && method === 'GET') {
        return jsonRes({ items: [
          { id: 'g1', summary: 'Rapat tim', status: 'confirmed', start: { dateTime: '2026-11-04T03:00:00Z' }, end: { dateTime: '2026-11-04T04:00:00Z' }, htmlLink: 'https://calendar.google.com/x' },
          { id: 'g2', status: 'cancelled', start: { dateTime: '2026-11-04T03:00:00Z' } },
        ] });
      }
      if (method === 'GET') return jsonRes({ items: world.calendarEvents });
      if (method === 'POST') {
        const e = JSON.parse(body);
        if (world.cancelledIds.includes(e.id)) return jsonRes({}, 409);
        world.calendarEvents.push(e);
        return jsonRes(e);
      }
      if (method === 'PUT') {
        const e = JSON.parse(body);
        world.calendarEvents = world.calendarEvents.filter((x) => x.id !== e.id).concat(e);
        world.puts.push(e.id);
        return jsonRes(e);
      }
      if (method === 'DELETE') {
        world.calendarEvents = world.calendarEvents.filter((x) => x.id !== m[2]);
        world.deletes.push(m[2]);
        return new Response(null, { status: 204 });
      }
    }
  }
  throw new Error(`Permintaan tak terduga: ${method} ${url.href}`);
}

const api = () => createApi(ENV, fakeFetch);
const post = (body, { token = 'token-sah', origin = 'https://sudenb31.github.io' } = {}) =>
  new Request('https://proyek.supabase.co/functions/v1/google-api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

const RANGE = { timeMin: '2026-11-04T00:00:00.000Z', timeMax: '2026-12-19T00:00:00.000Z' };
const desired = (id, h = 'h1', extra = {}) => ({
  id, h, summary: `Acara ${id}`, start: '2026-11-04T03:00:00.000Z', end: '2026-11-04T03:30:00.000Z', reminders: [0], ...extra,
});
const callback = (params) => createCallback(ENV, fakeFetch)(new Request(`https://proyek.supabase.co/functions/v1/google-callback?${new URLSearchParams(params)}`));
const location = (res) => res.headers.get('location');

beforeEach(async () => {
  calls = [];
  world = {
    account: {
      refresh_token_enc: await encryptToken(REFRESH, ENV),
      calendar_id: 'cal-istiqomah',
      google_email: 'primary@contoh.com',
      needs_reconnect: false,
    },
    states: [],
    calendarEvents: [],
    cancelledIds: [],
    puts: [],
    deletes: [],
    grantedScope: SCOPES.join(' '),
    calendarExists: true,
  };
});

test('tanpa token atau token palsu ditolak', async () => {
  assert.equal((await api()(post({ action: 'status' }, { token: null }))).status, 401);
  assert.equal((await api()(post({ action: 'status' }, { token: 'palsu' }))).status, 401);
});

test('CORS hanya untuk alamat aplikasi', async () => {
  const ok = await api()(new Request('https://x/', { method: 'OPTIONS', headers: { origin: 'https://sudenb31.github.io' } }));
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://sudenb31.github.io');
  const bad = await api()(new Request('https://x/', { method: 'OPTIONS', headers: { origin: 'https://jahat.com' } }));
  assert.equal(bad.headers.get('access-control-allow-origin'), null);
});

test('status tidak pernah membocorkan token', async () => {
  const res = await api()(post({ action: 'status' }));
  const text = await res.text();
  assert.deepEqual(JSON.parse(text), { connected: true, needsReconnect: false, email: 'primary@contoh.com' });
  assert.ok(!text.includes(REFRESH));
  assert.ok(!text.includes('refresh_token'));
});

test('tautan izin memuat izin yang diminta dan menyimpan tiket', async () => {
  world.account = null;
  const res = await api()(post({ action: 'link' }));
  const { url } = await res.json();
  const u = new URL(url);
  assert.equal(u.hostname, 'accounts.google.com');
  assert.equal(u.searchParams.get('access_type'), 'offline');
  assert.equal(u.searchParams.get('prompt'), 'consent');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://proyek.supabase.co/functions/v1/google-callback');
  assert.equal(u.searchParams.get('scope'), SCOPES.join(' '));
  assert.equal(u.searchParams.get('state'), world.states[0].state);
  assert.equal(world.states[0].user_id, USER.id);
  assert.ok(!url.includes('rahasia-google'));
});

test('sambungan berhasil: token tersimpan terenkripsi lalu dialihkan ke halaman hasil', async () => {
  world.account = null;
  world.states = [{ state: 'tiket', user_id: USER.id, expires_at: new Date(Date.now() + 60000).toISOString() }];
  const res = await callback({ state: 'tiket', code: 'kode' });
  assert.equal(res.status, 302);
  assert.equal(location(res), 'https://sudenb31.github.io/istiqomah/tersambung.html?hasil=ok');
  assert.equal(world.account.user_id, USER.id);
  assert.equal(world.account.calendar_id, 'cal-baru');
  assert.equal(world.account.google_email, 'primary@contoh.com');
  assert.ok(!world.account.refresh_token_enc.includes(REFRESH));
  assert.equal(await decryptToken(world.account.refresh_token_enc, ENV), REFRESH);
  assert.equal(world.states.length, 0, 'tiket sekali pakai');
});

test('tiket tidak dikenal, kedaluwarsa, atau dipakai dua kali ditolak', async () => {
  world.account = null;
  assert.match(location(await callback({ state: 'ngawur', code: 'k' })), /hasil=kedaluwarsa/);
  world.states = [{ state: 'lama', user_id: USER.id, expires_at: new Date(Date.now() - 1000).toISOString() }];
  assert.match(location(await callback({ state: 'lama', code: 'k' })), /hasil=kedaluwarsa/);
  world.states = [{ state: 'sekali', user_id: USER.id, expires_at: new Date(Date.now() + 60000).toISOString() }];
  assert.match(location(await callback({ state: 'sekali', code: 'k' })), /hasil=ok/);
  assert.match(location(await callback({ state: 'sekali', code: 'k' })), /hasil=kedaluwarsa/);
});

test('izin tidak lengkap dan penolakan dari Google tidak menyimpan apa pun', async () => {
  world.account = null;
  world.grantedScope = SCOPES[0];
  world.states = [{ state: 'tiket', user_id: USER.id, expires_at: new Date(Date.now() + 60000).toISOString() }];
  assert.match(location(await callback({ state: 'tiket', code: 'k' })), /hasil=izin/);
  assert.equal(world.account, null);
  assert.match(location(await callback({ error: 'access_denied', state: 'x' })), /hasil=gagal/);
});

test('sambung ulang memakai kalender yang sudah ada', async () => {
  world.states = [{ state: 't', user_id: USER.id, expires_at: new Date(Date.now() + 60000).toISOString() }];
  await callback({ state: 't', code: 'k' });
  assert.equal(world.account.calendar_id, 'cal-istiqomah');
  assert.ok(!calls.some((c) => c.method === 'POST' && c.url.endsWith('/calendar/v3/calendars')));
});

test('acara dari Google: kalender tersembunyi, kalender Istiqomah, dan yang dibatalkan tidak ikut', async () => {
  const res = await api()(post({ action: 'events', ...RANGE }));
  const { events } = await res.json();
  assert.deepEqual(events, [{
    id: 'g1',
    calendar: 'Pribadi',
    color: '#123456',
    title: 'Rapat tim',
    allDay: false,
    start: '2026-11-04T03:00:00Z',
    end: '2026-11-04T04:00:00Z',
    link: 'https://calendar.google.com/x',
  }]);
});

test('sinkron menulis yang baru, mengubah yang beda, menghapus yang tidak diinginkan', async () => {
  world.calendarEvents = [
    { id: 'sama11', extendedProperties: { private: { istiqomah: '1', h: 'h1' } } },
    { id: 'beda11', extendedProperties: { private: { istiqomah: '1', h: 'lama' } } },
    { id: 'buang1', extendedProperties: { private: { istiqomah: '1', h: 'x' } } },
    { id: 'orang1', extendedProperties: {} },
  ];
  const res = await api()(post({ action: 'sync', ...RANGE, events: [desired('sama11'), desired('beda11', 'baru'), desired('baru11')] }));
  const body = await res.json();
  assert.deepEqual(body, { written: 3, failed: 0, remaining: 0, throttled: false });
  assert.deepEqual(world.puts, ['beda11']);
  assert.deepEqual(world.deletes, ['buang1'], 'acara buatan orang lain tidak boleh terhapus');
  assert.ok(world.calendarEvents.some((e) => e.id === 'baru11'));
  assert.ok(world.calendarEvents.some((e) => e.id === 'orang1'));
});

test('sinkron kedua tanpa perubahan tidak menulis apa pun', async () => {
  const events = [desired('sama11')];
  await api()(post({ action: 'sync', ...RANGE, events }));
  const before = calls.filter((c) => ['POST', 'PUT', 'DELETE'].includes(c.method) && c.url.includes('/events')).length;
  const res = await api()(post({ action: 'sync', ...RANGE, events }));
  assert.equal((await res.json()).written, 0);
  const after = calls.filter((c) => ['POST', 'PUT', 'DELETE'].includes(c.method) && c.url.includes('/events')).length;
  assert.equal(after, before);
});

test('id yang pernah dihapus dihidupkan lagi lewat PUT', async () => {
  world.cancelledIds = ['balik1'];
  const body = await (await api()(post({ action: 'sync', ...RANGE, events: [desired('balik1')] }))).json();
  assert.equal(body.written, 1);
  assert.deepEqual(world.puts, ['balik1']);
  assert.equal(world.calendarEvents[0].status, 'confirmed');
});

test('penulisan dibagi per panggilan sampai habis', async () => {
  const events = Array.from({ length: 200 }, (_, i) => desired(`acara${String(i).padStart(3, '0')}`));
  const first = await (await api()(post({ action: 'sync', ...RANGE, events }))).json();
  assert.equal(first.written, 80);
  assert.equal(first.remaining, 120);
  const second = await (await api()(post({ action: 'sync', ...RANGE, events }))).json();
  assert.equal(second.remaining, 40);
  const third = await (await api()(post({ action: 'sync', ...RANGE, events }))).json();
  assert.equal(third.remaining, 0);
  assert.equal(world.calendarEvents.length, 200);
});

test('data acara tidak sah ditolak sebelum menyentuh Google', async () => {
  const before = calls.length;
  const res = await api()(post({ action: 'sync', ...RANGE, events: [{ id: 'HURUF-BESAR!', h: 'x', summary: 'y', start: RANGE.timeMin, end: RANGE.timeMax }] }));
  assert.equal(res.status, 400);
  assert.ok(!calls.slice(before).some((c) => c.url.includes('/events')));
});

test('izin Google dicabut: akun ditandai perlu sambung ulang', async () => {
  world.refreshInvalid = true;
  const res = await api()(post({ action: 'events', ...RANGE }));
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, 'reconnect');
  assert.equal(world.account.needs_reconnect, true);
  assert.deepEqual(await (await api()(post({ action: 'status' }))).json(), { connected: false, needsReconnect: true, email: 'primary@contoh.com' });
});

test('putuskan sambungan mencabut token dan menghapus data', async () => {
  const res = await api()(post({ action: 'disconnect' }));
  assert.deepEqual(await res.json(), { connected: false });
  assert.equal(world.revoked, REFRESH);
  assert.equal(world.account, null);
});

test('bersihkan data acara: kolom asing dibuang, jumlah pengingat dibatasi', () => {
  const clean = cleanDesired({ ...desired('abcde'), jahat: 'x', attendees: ['a@b.c'], reminders: [0, 5, 5, 10, 15, 30, 60, -1, 99999] });
  assert.equal(clean.jahat, undefined);
  assert.equal(clean.attendees, undefined);
  assert.deepEqual(clean.reminders, [0, 5, 10, 15, 30]);
  const ev = toGoogleEvent(clean);
  assert.equal(ev.attendees, undefined);
  assert.equal(ev.extendedProperties.private.istiqomah, '1');
  assert.equal(cleanDesired({ ...desired('abcde'), date: '2026-11-04', endDate: '2026-11-05' }), null, 'tidak boleh berjam sekaligus seharian');
  assert.equal(cleanDesired({ id: 'abcde', h: 'x', summary: 'y' }), null, 'wajib punya waktu');
  assert.equal(cleanDesired({ ...desired('abcde'), summary: '   ' }), null);
});

test('hitung selisih mengabaikan acara tanpa tanda aplikasi', () => {
  const out = diffEvents([{ id: 'luar1' }], []);
  assert.deepEqual(out, { create: [], update: [], remove: [] });
});

test('enkripsi token: dua kali hasil berbeda, kunci salah gagal', async () => {
  const a = await encryptToken('rahasia', ENV);
  const b = await encryptToken('rahasia', ENV);
  assert.notEqual(a, b);
  assert.equal(await decryptToken(a, ENV), 'rahasia');
  await assert.rejects(decryptToken(a, { TOKEN_KEY: Buffer.alloc(32, 9).toString('base64') }));
  await assert.rejects(encryptToken('x', { TOKEN_KEY: 'pendek' }));
});

test('kunci server: sistem baru diutamakan, sistem lama jadi cadangan', () => {
  assert.equal(secretKey(ENV), 'sb_secret_x');
  assert.equal(secretKey({ SUPABASE_SERVICE_ROLE_KEY: 'eyJlama' }), 'eyJlama');
});
