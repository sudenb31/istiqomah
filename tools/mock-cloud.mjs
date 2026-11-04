// Server tiruan Supabase dan Google, khusus untuk menguji alur aplikasi di browser tanpa akun asli.
// Kode masuk selalu 123456. Tidak menyimpan apa pun ke disk.
import { createServer } from 'node:http';

const port = Number(process.env.MOCK_PORT ?? 5191);
const APP = process.env.APP_ORIGIN ?? 'http://localhost:5190';
const USER = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: null };

const db = { state: null, rev: 0, connected: false, needsReconnect: false, synced: new Map(), otpRequests: 0, syncCalls: 0 };

function sampleEvents() {
  const at = (days, h, m = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const dateOf = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  return [
    { id: 'g1', calendar: 'Kantor', color: '#0B8043', title: 'Rapat mingguan', allDay: false, start: at(0, 13, 30), end: at(0, 14, 30), link: 'https://calendar.google.com/' },
    { id: 'g2', calendar: 'Keluarga', color: '#D50000', title: 'Ulang tahun ibu', allDay: true, start: dateOf(0), end: dateOf(1), link: 'https://calendar.google.com/' },
    { id: 'g3', calendar: 'Kantor', color: '#0B8043', title: 'Presentasi klien', allDay: false, start: at(2, 10), end: at(2, 11), link: 'https://calendar.google.com/' },
  ];
}

const session = (email) => ({
  access_token: 'akses-tiruan',
  refresh_token: 'segar-tiruan',
  expires_in: 3600,
  user: { id: USER.id, email: email ?? USER.email },
});

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const send = (status, body, headers = {}) => {
    res.writeHead(status, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': '*',
      'Content-Type': 'application/json',
      ...headers,
    });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  if (req.method === 'OPTIONS') return send(204);

  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  const authed = req.headers.authorization === 'Bearer akses-tiruan';
  const path = url.pathname;

  // Alat bantu uji
  if (path === '/mock/state') return send(200, { state: db.state, rev: db.rev, connected: db.connected, synced: db.synced.size, syncCalls: db.syncCalls, otpRequests: db.otpRequests, syncedTitles: [...db.synced.values()].map((e) => e.summary) });
  if (path === '/mock/edit') {
    db.state = body.state;
    db.rev += 1;
    return send(200, { rev: db.rev });
  }
  if (path === '/mock/revoke') {
    db.connected = false;
    db.needsReconnect = true;
    return send(200, {});
  }
  if (path === '/mock/consent') {
    db.connected = true;
    db.needsReconnect = false;
    res.writeHead(302, { Location: `${APP}/tersambung.html?hasil=ok` });
    return res.end();
  }

  if (path === '/auth/v1/otp') {
    db.otpRequests += 1;
    if (body.email === 'batas@contoh.com') return send(429, { error_code: 'over_email_send_rate_limit' });
    if (body.email === 'asing@contoh.com') return send(400, { error_code: 'email_address_not_authorized' });
    return send(200, {});
  }
  if (path === '/auth/v1/verify') {
    if (body.token !== '123456') return send(403, { error_code: 'otp_expired' });
    USER.email = body.email;
    return send(200, session(body.email));
  }
  if (path === '/auth/v1/token') return send(200, session());
  if (path === '/auth/v1/logout') return send(204);

  if (!authed) return send(401, { error: 'unauthorized' });

  if (path === '/rest/v1/app_state') {
    return send(200, db.state ? [{ doc: db.state, rev: db.rev }] : []);
  }
  if (path === '/rest/v1/rpc/save_state') {
    if (body.expected_rev !== db.rev) return send(200, null);
    db.state = body.new_doc;
    db.rev += 1;
    return send(200, db.rev);
  }

  if (path === '/functions/v1/google-api') {
    if (body.action === 'status') return send(200, { connected: db.connected, needsReconnect: db.needsReconnect, email: db.connected ? USER.email : null });
    if (body.action === 'link') return send(200, { url: `http://localhost:${port}/mock/consent`, expiresAt: new Date(Date.now() + 600000).toISOString() });
    if (!db.connected) return send(409, { error: db.needsReconnect ? 'reconnect' : 'not_connected' });
    if (body.action === 'disconnect') {
      db.connected = false;
      return send(200, { connected: false });
    }
    if (body.action === 'events') return send(200, { events: sampleEvents() });
    if (body.action === 'sync') {
      db.syncCalls += 1;
      const wanted = new Map(body.events.map((e) => [e.id, e]));
      const jobs = [];
      for (const [id, e] of wanted) if (db.synced.get(id)?.h !== e.h) jobs.push(() => db.synced.set(id, e));
      for (const id of db.synced.keys()) if (!wanted.has(id)) jobs.push(() => db.synced.delete(id));
      const batch = jobs.slice(0, 80);
      batch.forEach((job) => job());
      return send(200, { written: batch.length, failed: 0, remaining: jobs.length - batch.length, throttled: false });
    }
  }
  return send(404, { error: 'not_found' });
}).listen(port, '127.0.0.1', () => console.log(`Server tiruan jalan di http://localhost:${port}`));
