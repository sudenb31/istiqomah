// Akun, sinkron data, dan sambungan Google. Memakai fetch langsung supaya tetap tanpa pustaka luar.
import { SUPABASE_KEY, SUPABASE_URL } from './config.js';
import { commit, defaultState, kvGet, kvSet, store, replaceState } from './store.js';
import { mergeStates, sameDoc } from './merge.js';
import { buildGoogleEvents, syncRange, SYNC_DAYS } from './gcal.js';
import { addDays, atMinutes, ymd } from './date.js';

const SESSION_KEY = 'session';
const EVENTS_KEY = 'gcal-events';
const PUSH_DELAY_MS = 3000;
const GOOGLE_DELAY_MS = 12000;
const EVENTS_MAX_AGE_MS = 10 * 60 * 1000;
const STATE_MAX_AGE_MS = 2 * 60 * 1000;

// Di localhost alamat server bisa diganti untuk menguji dengan server tiruan.
function devOverride() {
  try {
    if (!['localhost', '127.0.0.1'].includes(location.hostname)) return null;
    return JSON.parse(localStorage.getItem('istiqomah-dev-cloud') ?? 'null');
  } catch {
    return null;
  }
}

const dev = devOverride();
const BASE = dev?.url ?? SUPABASE_URL;
const KEY = dev?.key ?? SUPABASE_KEY;

export const cloudEnabled = () => Boolean(BASE && KEY);

export const cloud = {
  session: null,
  status: 'idle', // idle, syncing, offline, error
  lastSyncAt: null,
  google: { known: false, connected: false, needsReconnect: false, email: null },
  link: null,
  events: [],
  eventsAt: 0,
  googleSyncing: false,
};

const listeners = new Set();
export const onCloudChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn());

class CloudError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, token, headers } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        apikey: KEY,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new CloudError('offline', 0);
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) throw new CloudError(data?.error_code ?? data?.code ?? data?.error ?? 'server', res.status);
  return data;
}

// Login dengan kode lewat email
const AUTH_MESSAGES = {
  over_email_send_rate_limit: 'Kuota kirim email lagi habis. Coba lagi sekitar satu jam lagi.',
  over_request_rate_limit: 'Terlalu sering minta kode. Tunggu sebentar lalu coba lagi.',
  email_address_not_authorized: 'Email ini belum diizinkan. Pakai email pemilik server Supabase.',
  signup_disabled: 'Pendaftaran akun baru sedang ditutup.',
  email_address_invalid: 'Alamat email-nya belum benar.',
  validation_failed: 'Alamat email-nya belum benar.',
  otp_expired: 'Kodenya salah atau sudah kedaluwarsa. Minta kode baru.',
  invalid_credentials: 'Kodenya salah atau sudah kedaluwarsa. Minta kode baru.',
  offline: 'Gak ada koneksi internet.',
};

export const authMessage = (err) => AUTH_MESSAGES[err.code] ?? 'Ada gangguan di server. Coba lagi sebentar lagi.';

export async function requestCode(email) {
  await request('/auth/v1/otp', { method: 'POST', body: { email, create_user: true } });
}

async function saveSession(data) {
  cloud.session = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at ? data.expires_at * 1000 : Date.now() + (data.expires_in ?? 3600) * 1000,
    userId: data.user?.id ?? cloud.session?.userId,
    email: data.user?.email ?? cloud.session?.email,
  };
  await kvSet(SESSION_KEY, cloud.session);
}

// Data dua akun berbeda tidak boleh tercampur di satu perangkat.
function guardOwner(userId) {
  const owner = store.state.ownerId;
  if (owner && owner !== userId) replaceState({ ...defaultState(), ownerId: userId });
  else if (!owner) commit((s) => { s.ownerId = userId; }, { silent: true });
}

export async function verifyCode(email, code) {
  const data = await request('/auth/v1/verify', { method: 'POST', body: { type: 'email', email, token: code } });
  await saveSession(data);
  guardOwner(cloud.session.userId);
  emit();
  syncNow({ force: true });
}

let refreshing = null;

async function accessToken() {
  if (!cloud.session) throw new CloudError('signed_out', 401);
  if (cloud.session.expiresAt - Date.now() > 60000) return cloud.session.accessToken;
  refreshing ??= request('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: { refresh_token: cloud.session.refreshToken },
  })
    .then(saveSession)
    .catch(async (err) => {
      // Sesi hanya dihapus kalau server benar-benar menolaknya, bukan saat sinyal jelek.
      if (err.status === 400 || err.status === 401) await clearSession();
      throw err;
    })
    .finally(() => { refreshing = null; });
  await refreshing;
  return cloud.session.accessToken;
}

async function clearSession() {
  cloud.session = null;
  cloud.link = null;
  cloud.google = { known: false, connected: false, needsReconnect: false, email: null };
  cloud.events = [];
  await kvSet(SESSION_KEY, null);
  await kvSet(EVENTS_KEY, null);
  emit();
}

export async function signOut() {
  const token = cloud.session?.accessToken;
  await clearSession();
  if (token) request('/auth/v1/logout', { method: 'POST', token }).catch(() => {});
}

// Sinkron data
async function syncState() {
  const token = await accessToken();
  const userId = cloud.session.userId;
  for (let attempt = 0; attempt < 3; attempt++) {
    const rows = await request(`/rest/v1/app_state?user_id=eq.${userId}&select=doc,rev`, { token });
    const remote = rows?.[0] ?? null;
    const merged = remote ? mergeStates(store.state, remote.doc) : store.state;
    merged.ownerId = userId;
    if (!sameDoc(merged, store.state)) replaceState(merged);
    if (remote && sameDoc(merged, remote.doc)) return;

    const { lastReminderCheck, ...settings } = merged.settings;
    const saved = await request('/rest/v1/rpc/save_state', {
      method: 'POST',
      token,
      body: { new_doc: { ...merged, settings }, expected_rev: remote?.rev ?? 0 },
    });
    if (saved !== null) return; // null berarti perangkat lain menulis lebih dulu, jadi digabung ulang
  }
  throw new CloudError('conflict', 409);
}

// Sambungan Google
const google = async (action, payload = {}) =>
  request('/functions/v1/google-api', { method: 'POST', token: await accessToken(), body: { action, ...payload } });

// Dipanggil dari tampilan, jadi permintaan yang sama tidak boleh menumpuk.
const inflight = new Map();
function once(key, task) {
  if (!inflight.has(key)) inflight.set(key, task().finally(() => inflight.delete(key)));
  return inflight.get(key);
}

export function refreshGoogleStatus() {
  return once('status', async () => {
    if (!cloud.session) return;
    const status = await google('status');
    cloud.google = { known: true, connected: status.connected, needsReconnect: status.needsReconnect, email: status.email };
    emit();
  });
}

// Tautan disiapkan sebelum diketuk, karena iPhone hanya membuka tab baru dari ketukan langsung.
export function prepareGoogleLink() {
  return once('link', async () => {
    if (!cloud.session) return;
    if (cloud.link && Date.parse(cloud.link.expiresAt) - Date.now() > 120000) return;
    cloud.link = await google('link');
    emit();
  });
}

export async function disconnectGoogle() {
  await google('disconnect');
  cloud.link = null;
  cloud.events = [];
  cloud.eventsAt = 0;
  await kvSet(EVENTS_KEY, null);
  await refreshGoogleStatus();
}

function eventsRange(today) {
  return {
    timeMin: atMinutes(addDays(today, -31), 0).toISOString(),
    timeMax: atMinutes(addDays(today, 93), 0).toISOString(),
  };
}

async function pullGoogleEvents({ force = false } = {}) {
  if (!force && Date.now() - cloud.eventsAt < EVENTS_MAX_AGE_MS) return;
  const { events } = await google('events', eventsRange(ymd(new Date())));
  cloud.events = events ?? [];
  cloud.eventsAt = Date.now();
  await kvSet(EVENTS_KEY, { events: cloud.events, at: cloud.eventsAt });
  emit();
}

let lastPushedHash = null;

async function pushToGoogle({ force = false } = {}) {
  const today = ymd(new Date());
  const desired = buildGoogleEvents(store.state, today, SYNC_DAYS);
  const hash = desired.map((e) => e.id + e.h).join();
  if (!force && hash === lastPushedHash) return;
  cloud.googleSyncing = true;
  emit();
  try {
    const range = syncRange(today, SYNC_DAYS);
    // Fungsi server menulis bertahap supaya tidak melewati batas waktu.
    let failed = 0;
    for (let round = 0; round < 40; round++) {
      const result = await google('sync', { ...range, events: desired });
      failed = result.failed ?? 0;
      if (!result.remaining || !result.written) break;
      if (result.throttled) await new Promise((r) => setTimeout(r, 2000));
    }
    // Kalau ada yang gagal, hash tidak dicatat supaya dicoba lagi di sinkron berikutnya.
    if (!failed) lastPushedHash = hash;
  } finally {
    cloud.googleSyncing = false;
    emit();
  }
}

// Izin yang dicabut dicatat di sini, supaya sinkron latar belakang pun langsung memunculkan pesan sambung ulang.
async function syncGoogle(options) {
  try {
    if (!cloud.google.known) await refreshGoogleStatus();
    if (!cloud.google.connected) return;
    await pushToGoogle(options);
    await pullGoogleEvents(options);
  } catch (err) {
    if (err.code !== 'reconnect' && err.code !== 'not_connected') throw err;
    cloud.google = { ...cloud.google, known: true, connected: false, needsReconnect: err.code === 'reconnect' };
    lastPushedHash = null;
    emit();
  }
}

// Pengatur jadwal sinkron
let running = false;
let queued = false;
let stateTimer = null;
let googleTimer = null;

function afterRun() {
  running = false;
  if (queued) {
    queued = false;
    syncNow();
  }
}

export async function syncNow({ force = false } = {}) {
  if (!cloudEnabled() || !cloud.session) return;
  if (running) {
    queued = true;
    return;
  }
  running = true;
  cloud.status = 'syncing';
  emit();
  try {
    await syncState();
    cloud.lastSyncAt = Date.now();
    cloud.status = 'idle';
    emit();
    await syncGoogle({ force });
  } catch (err) {
    if (err.code === 'offline') {
      cloud.status = 'offline';
    } else if (err.code !== 'signed_out') {
      console.warn('Sinkron gagal', err.code);
      cloud.status = 'error';
    }
    emit();
  } finally {
    afterRun();
  }
}

function scheduleSync() {
  if (!cloud.session) return;
  clearTimeout(stateTimer);
  clearTimeout(googleTimer);
  stateTimer = setTimeout(async () => {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      await syncState();
      cloud.lastSyncAt = Date.now();
      cloud.status = 'idle';
    } catch (err) {
      cloud.status = err.code === 'offline' ? 'offline' : 'error';
    } finally {
      emit();
      afterRun();
    }
  }, PUSH_DELAY_MS);
  googleTimer = setTimeout(() => {
    if (cloud.google.connected) syncGoogle({}).catch(() => {});
  }, GOOGLE_DELAY_MS);
}

export async function initCloud() {
  if (!cloudEnabled()) return;
  cloud.session = (await kvGet(SESSION_KEY)) ?? null;
  const cached = await kvGet(EVENTS_KEY);
  if (cached) {
    cloud.events = cached.events ?? [];
    cloud.eventsAt = cached.at ?? 0;
  }
  store.subscribe((_state, meta) => { if (!meta?.remote) scheduleSync(); });

  const onReturn = () => {
    if (document.hidden || !cloud.session) return;
    // Bisa jadi baru balik dari halaman izin Google di Safari, jadi statusnya diperiksa lagi.
    const wasConnected = cloud.google.connected;
    if (!wasConnected) cloud.google.known = false;
    if (!cloud.lastSyncAt || Date.now() - cloud.lastSyncAt > STATE_MAX_AGE_MS) {
      syncNow();
    } else if (!wasConnected) {
      syncGoogle({ force: true }).catch(() => {});
    }
  };
  document.addEventListener('visibilitychange', onReturn);
  addEventListener('online', () => syncNow());
  if (cloud.session) syncNow();
}
