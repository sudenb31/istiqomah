// Bagian bersama fungsi server. Tidak memakai pustaka luar dan tidak bergantung pada Deno,
// sehingga bisa dites dengan fetch tiruan di Node.

export type Env = Record<string, string | undefined>;
export type FetchFn = typeof fetch;

export const SCOPES = [
  'https://www.googleapis.com/auth/calendar.app.created',
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
];

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_API = 'https://www.googleapis.com/calendar/v3';

export function secretKey(env: Env): string {
  if (env.SUPABASE_SECRET_KEYS) {
    const key = JSON.parse(env.SUPABASE_SECRET_KEYS).default;
    if (key) return key;
  }
  return env.SUPABASE_SERVICE_ROLE_KEY ?? '';
}

function publicKey(env: Env): string {
  if (env.SUPABASE_PUBLISHABLE_KEYS) {
    const key = JSON.parse(env.SUPABASE_PUBLISHABLE_KEYS).default;
    if (key) return key;
  }
  return env.SUPABASE_ANON_KEY ?? '';
}

function allowedOrigins(env: Env): string[] {
  const list = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (env.APP_URL) list.push(new URL(env.APP_URL).origin);
  return list;
}

export function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (origin && allowedOrigins(env).includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

// Mengembalikan pengguna pemilik token, atau null kalau token tidak sah.
export async function getUser(req: Request, env: Env, fetchFn: FetchFn): Promise<{ id: string; email?: string } | null> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const res = await fetchFn(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: publicKey(env), Authorization: auth },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id ? { id: user.id, email: user.email } : null;
}

// Akses database dengan secret key. Selalu sebutkan user_id di pemanggil.
export async function rest(env: Env, fetchFn: FetchFn, path: string, init: RequestInit = {}): Promise<Response> {
  const key = secretKey(env);
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) };
  // Secret key baru (sb_secret_) bukan JWT, jadi tidak boleh dikirim sebagai Bearer.
  if (!key.startsWith('sb_')) headers.Authorization = `Bearer ${key}`;
  return fetchFn(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
}

// Enkripsi refresh token dengan AES-GCM. TOKEN_KEY berupa 32 byte dalam base64.
function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

function toB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function aesKey(env: Env): Promise<CryptoKey> {
  const raw = fromB64(env.TOKEN_KEY ?? '');
  if (raw.length !== 32) throw new Error('TOKEN_KEY harus 32 byte dalam base64');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptToken(plain: string, env: Env): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), new TextEncoder().encode(plain));
  return `${toB64(iv)}.${toB64(new Uint8Array(data))}`;
}

export async function decryptToken(stored: string, env: Env): Promise<string> {
  const [iv, data] = stored.split('.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, await aesKey(env), fromB64(data));
  return new TextDecoder().decode(plain);
}

export function redirectUri(env: Env): string {
  return `${env.SUPABASE_URL}/functions/v1/google-callback`;
}

export async function exchangeCode(code: string, env: Env, fetchFn: FetchFn) {
  const res = await fetchFn(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID ?? '',
      client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: redirectUri(env),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Penukaran kode Google gagal: ${res.status}`);
  return res.json() as Promise<{ access_token: string; refresh_token?: string; scope?: string }>;
}

export class ReconnectNeeded extends Error {}

export async function refreshAccessToken(refreshToken: string, env: Env, fetchFn: FetchFn): Promise<string> {
  const res = await fetchFn(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID ?? '',
      client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
      grant_type: 'refresh_token',
    }),
  });
  if (res.ok) return (await res.json()).access_token;
  const body = await res.json().catch(() => ({}));
  if (body.error === 'invalid_grant') throw new ReconnectNeeded();
  throw new Error(`Token Google gagal diperbarui: ${res.status}`);
}

export function gfetch(fetchFn: FetchFn, token: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetchFn(`${GOOGLE_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) },
  });
}
