// Isi fungsi google-callback: menerima kode dari Google lalu menyimpan sambungan.
// Supabase tidak menyajikan HTML dari fungsi, jadi hasilnya dialihkan ke halaman statis.
import { encryptToken, exchangeCode, gfetch, rest, SCOPES } from './core.ts';
import type { Env, FetchFn } from './core.ts';

const redirect = (env: Env, hasil: string) =>
  new Response(null, { status: 302, headers: { Location: `${env.APP_URL}/tersambung.html?hasil=${hasil}` } });

async function ensureCalendar(f: FetchFn, token: string, existing: string | null): Promise<string> {
  if (existing) {
    const check = await gfetch(f, token, `/calendars/${encodeURIComponent(existing)}`);
    if (check.ok) return existing;
  }
  const res = await gfetch(f, token, '/calendars', { method: 'POST', body: JSON.stringify({ summary: 'Istiqomah', timeZone: 'Asia/Jakarta' }) });
  if (!res.ok) throw new Error(`Gagal membuat kalender: ${res.status}`);
  return (await res.json()).id;
}

export function createCallback(env: Env, f: FetchFn = fetch) {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    if (!state || url.searchParams.get('error') || !code) return redirect(env, 'gagal');

    try {
      // Tiket sekali pakai: langsung dihapus begitu dipakai, baik berhasil maupun gagal.
      const taken = await rest(env, f, `oauth_states?state=eq.${encodeURIComponent(state)}&select=user_id,expires_at`, {
        method: 'DELETE',
        headers: { Prefer: 'return=representation' },
      });
      if (!taken.ok) return redirect(env, 'gagal');
      const row = (await taken.json())[0];
      if (!row || Date.parse(row.expires_at) < Date.now()) return redirect(env, 'kedaluwarsa');

      const tokens = await exchangeCode(code, env, f);
      // Google membolehkan pengguna mencentang sebagian izin saja.
      const granted = new Set((tokens.scope ?? '').split(' '));
      if (!SCOPES.every((s) => granted.has(s))) return redirect(env, 'izin');
      if (!tokens.refresh_token) return redirect(env, 'gagal');

      const prior = await rest(env, f, `google_accounts?user_id=eq.${row.user_id}&select=calendar_id`);
      const previous = prior.ok ? (await prior.json())[0]?.calendar_id ?? null : null;
      const calendarId = await ensureCalendar(f, tokens.access_token, previous);

      const primary = await gfetch(f, tokens.access_token, '/users/me/calendarList/primary');
      const email = primary.ok ? (await primary.json()).id ?? null : null;

      const saved = await rest(env, f, 'google_accounts?on_conflict=user_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          user_id: row.user_id,
          refresh_token_enc: await encryptToken(tokens.refresh_token, env),
          calendar_id: calendarId,
          google_email: email,
          needs_reconnect: false,
          connected_at: new Date().toISOString(),
        }),
      });
      if (!saved.ok) throw new Error(`Gagal menyimpan sambungan: ${saved.status}`);
      return redirect(env, 'ok');
    } catch (err) {
      console.error('google-callback', (err as Error).message);
      return redirect(env, 'gagal');
    }
  };
}
