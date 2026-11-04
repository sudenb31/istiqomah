// Isi fungsi google-api. Dipisah dari index.ts supaya bisa dites tanpa Deno.
import {
  corsHeaders, decryptToken, getUser, gfetch, json, ReconnectNeeded, redirectUri, refreshAccessToken, rest, SCOPES,
} from './core.ts';
import type { Env, FetchFn } from './core.ts';
import { cleanDesired, diffEvents, toClientEvent, toGoogleEvent } from './events.ts';
import type { Desired } from './events.ts';

const MAX_WRITES_PER_CALL = 80;
const WRITE_CONCURRENCY = 5;
const MAX_CALENDARS = 10;

type Account = { refresh_token_enc: string; calendar_id: string | null; google_email: string | null; needs_reconnect: boolean };

async function readAccount(env: Env, f: FetchFn, userId: string): Promise<Account | null> {
  const res = await rest(env, f, `google_accounts?user_id=eq.${userId}&select=refresh_token_enc,calendar_id,google_email,needs_reconnect`);
  if (!res.ok) throw new Error(`Gagal membaca akun: ${res.status}`);
  const rows = await res.json();
  return rows[0] ?? null;
}

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function createLink(env: Env, f: FetchFn, user: { id: string; email?: string }) {
  const state = randomState();
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await rest(env, f, `oauth_states?user_id=eq.${user.id}&expires_at=lt.${encodeURIComponent(new Date().toISOString())}`, { method: 'DELETE' });
  const saved = await rest(env, f, 'oauth_states', {
    method: 'POST',
    body: JSON.stringify({ state, user_id: user.id, expires_at: expires }),
  });
  if (!saved.ok) throw new Error(`Gagal menyimpan tiket: ${saved.status}`);
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: redirectUri(env),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  if (user.email) params.set('login_hint', user.email);
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, expiresAt: expires };
}

async function listAllEvents(f: FetchFn, token: string, calendarId: string, timeMin: string, timeMax: string) {
  const items: Record<string, any>[] = [];
  let pageToken = '';
  for (let page = 0; page < 10; page++) {
    const q = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', maxResults: '2500' });
    if (pageToken) q.set('pageToken', pageToken);
    const res = await gfetch(f, token, `/calendars/${encodeURIComponent(calendarId)}/events?${q}`);
    if (!res.ok) throw new Error(`Gagal membaca acara: ${res.status}`);
    const body = await res.json();
    items.push(...(body.items ?? []));
    pageToken = body.nextPageToken ?? '';
    if (!pageToken) break;
  }
  return items;
}

async function readEvents(f: FetchFn, token: string, account: Account, timeMin: string, timeMax: string) {
  const listRes = await gfetch(f, token, '/users/me/calendarList?minAccessRole=reader&maxResults=50');
  if (!listRes.ok) throw new Error(`Gagal membaca daftar kalender: ${listRes.status}`);
  const calendars = ((await listRes.json()).items ?? [])
    .filter((c: Record<string, any>) => c.selected && c.id !== account.calendar_id)
    .slice(0, MAX_CALENDARS);

  const results = await Promise.all(
    calendars.map(async (c: Record<string, any>) => {
      try {
        const items = await listAllEvents(f, token, c.id, timeMin, timeMax);
        return items
          .filter((i) => i.status !== 'cancelled')
          .map((i) => toClientEvent(i, { id: c.id, name: c.summaryOverride ?? c.summary, color: c.backgroundColor }));
      } catch {
        return []; // satu kalender gagal tidak boleh menjatuhkan yang lain
      }
    }),
  );
  return results.flat();
}

// Menulis perubahan bertahap. Klien mengulang sampai remaining bernilai 0.
async function writeEvents(f: FetchFn, token: string, calendarId: string, timeMin: string, timeMax: string, desired: Desired[]) {
  const existing = await listAllEvents(f, token, calendarId, timeMin, timeMax);
  const { create, update, remove } = diffEvents(existing.filter((e) => e.status !== 'cancelled') as never[], desired);

  type Job = () => Promise<Response>;
  const base = `/calendars/${encodeURIComponent(calendarId)}/events`;
  const put = (e: Desired) => gfetch(f, token, `${base}/${e.id}`, { method: 'PUT', body: JSON.stringify(toGoogleEvent(e)) });
  const jobs: Job[] = [
    ...create.map((e) => async () => {
      const res = await gfetch(f, token, base, { method: 'POST', body: JSON.stringify(toGoogleEvent(e)) });
      // 409 berarti id ini pernah ada lalu dihapus. Google menyimpannya sebagai cancelled, jadi dihidupkan lagi.
      return res.status === 409 ? put(e) : res;
    }),
    ...update.map((e) => () => put(e)),
    ...remove.map((id) => () => gfetch(f, token, `${base}/${id}`, { method: 'DELETE' })),
  ];

  const batch = jobs.slice(0, MAX_WRITES_PER_CALL);
  let failed = 0;
  for (let i = 0; i < batch.length; i += WRITE_CONCURRENCY) {
    const results = await Promise.all(batch.slice(i, i + WRITE_CONCURRENCY).map((job) => job()));
    for (const res of results) {
      if (!res.ok && res.status !== 404 && res.status !== 410) failed += 1;
    }
    // Berhenti lebih awal kalau Google meminta pelan-pelan. Sisanya dicoba di panggilan berikutnya.
    if (results.some((r) => r.status === 403 || r.status === 429)) {
      const done = Math.min(i + WRITE_CONCURRENCY, batch.length);
      return { written: done - failed, failed, remaining: Math.max(0, jobs.length - done), throttled: true };
    }
  }
  return { written: batch.length - failed, failed, remaining: Math.max(0, jobs.length - batch.length), throttled: false };
}

async function withToken(env: Env, f: FetchFn, userId: string, account: Account) {
  try {
    return await refreshAccessToken(await decryptToken(account.refresh_token_enc, env), env, f);
  } catch (err) {
    if (err instanceof ReconnectNeeded) {
      await rest(env, f, `google_accounts?user_id=eq.${userId}`, { method: 'PATCH', body: JSON.stringify({ needs_reconnect: true }) });
    }
    throw err;
  }
}

const isStamp = (s: unknown) => typeof s === 'string' && !Number.isNaN(Date.parse(s));

export function createApi(env: Env, f: FetchFn = fetch) {
  return async (req: Request): Promise<Response> => {
    const cors = corsHeaders(req.headers.get('origin'), env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return json({ error: 'method' }, 405, cors);

    const user = await getUser(req, env, f);
    if (!user) return json({ error: 'unauthorized' }, 401, cors);

    let body: Record<string, any>;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'bad_json' }, 400, cors);
    }

    try {
      const account = await readAccount(env, f, user.id);

      if (body.action === 'status') {
        return json({
          connected: Boolean(account) && !account?.needs_reconnect,
          needsReconnect: Boolean(account?.needs_reconnect),
          email: account?.google_email ?? null,
        }, 200, cors);
      }
      if (body.action === 'link') return json(await createLink(env, f, user), 200, cors);

      if (!account) return json({ error: 'not_connected' }, 409, cors);
      if (account.needs_reconnect) return json({ error: 'reconnect' }, 409, cors);

      if (body.action === 'disconnect') {
        const refresh = await decryptToken(account.refresh_token_enc, env);
        await f(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, { method: 'POST' }).catch(() => null);
        await rest(env, f, `google_accounts?user_id=eq.${user.id}`, { method: 'DELETE' });
        return json({ connected: false }, 200, cors);
      }

      if (!isStamp(body.timeMin) || !isStamp(body.timeMax)) return json({ error: 'bad_range' }, 400, cors);
      const token = await withToken(env, f, user.id, account);

      if (body.action === 'events') {
        return json({ events: await readEvents(f, token, account, body.timeMin, body.timeMax) }, 200, cors);
      }

      if (body.action === 'sync') {
        if (!Array.isArray(body.events) || body.events.length > 3000) return json({ error: 'bad_events' }, 400, cors);
        if (!account.calendar_id) return json({ error: 'no_calendar' }, 409, cors);
        const desired = body.events.map(cleanDesired);
        if (desired.some((e: Desired | null) => e === null)) return json({ error: 'bad_events' }, 400, cors);
        return json(await writeEvents(f, token, account.calendar_id, body.timeMin, body.timeMax, desired), 200, cors);
      }

      return json({ error: 'unknown_action' }, 400, cors);
    } catch (err) {
      if (err instanceof ReconnectNeeded) return json({ error: 'reconnect' }, 409, cors);
      console.error('google-api', (err as Error).message);
      return json({ error: 'server' }, 502, cors);
    }
  };
}
