// Pengingat yang berjalan di dalam aplikasi. Browser hanya bisa menjadwalkannya selama aplikasi terbuka.
// Pengingat yang lewat saat aplikasi tertutup dirangkum waktu aplikasi dibuka lagi.
import { commit, store } from './store.js';
import { dayTasks, overdueTasks, remindersBetween } from './agenda.js';
import { ymd } from './date.js';
import { toast } from './ui/toast.js';

const FRESH_MS = 3 * 60 * 1000;
const MAX_LOOKBACK_MS = 3 * 864e5;

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function notificationState() {
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function enableNotifications() {
  if (!('Notification' in window)) return 'unsupported';
  const result = await Notification.requestPermission();
  if (result === 'granted') toast('Notifikasi aktif');
  else if (result === 'denied') toast('Izin notifikasi ditolak');
  return result;
}

async function systemNotify(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const options = { body, tag, icon: './icons/icon-192.png', badge: './icons/icon-192.png' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, options);
    else new Notification(title, options);
  } catch (err) {
    console.warn('Notifikasi gagal', err);
  }
}

export const sendTest = () => systemNotify('Contoh pengingat', 'Notifikasi sudah berjalan.', 'contoh');

export function checkReminders() {
  const now = Date.now();
  const saved = store.state.settings.lastReminderCheck;
  const from = Math.max(saved ?? now, now - MAX_LOOKBACK_MS);
  if (now <= from && saved != null) return;

  const due = remindersBetween(store.state, from, now);
  const fresh = due.filter((r) => now - r.fireAt <= FRESH_MS);
  const missed = due.filter((r) => now - r.fireAt > FRESH_MS && r.kind === 'task');
  for (const r of fresh) systemNotify(r.title, r.body, r.id);

  // Pesan di dalam aplikasi digabung supaya pengingat yang bersamaan tidak saling menimpa.
  const lines = fresh.map((r) => `${r.title}, ${r.body}`);
  if (missed.length) lines.push(`${missed.length} pengingat tugas terlewat saat aplikasi tertutup`);
  if (lines.length) toast(lines.join('. '), { label: 'Tutup', run: () => {} }, 30000);

  commit((s) => { s.settings.lastReminderCheck = now; }, { silent: true });
  updateBadge();
}

export function updateBadge() {
  if (!navigator.setAppBadge) return;
  const today = ymd(new Date());
  const open = dayTasks(store.state, today).filter((e) => !e.done).length + overdueTasks(store.state, today).length;
  (open ? navigator.setAppBadge(open) : navigator.clearAppBadge()).catch(() => {});
}
