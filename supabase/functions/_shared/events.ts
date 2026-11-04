// Membersihkan data acara dari klien dan menghitung perubahan terhadap Google Calendar.

const ID_RE = /^[a-v0-9]{5,1024}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export type Desired = {
  id: string;
  h: string;
  summary: string;
  description?: string;
  start?: string;
  end?: string;
  date?: string;
  endDate?: string;
  transparent?: boolean;
  reminders?: number[];
};

// Hanya kolom yang dikenal yang diteruskan ke Google. Mengembalikan null kalau datanya tidak sah.
export function cleanDesired(raw: unknown): Desired | null {
  const e = raw as Record<string, unknown>;
  if (!e || typeof e !== 'object') return null;
  if (typeof e.id !== 'string' || !ID_RE.test(e.id)) return null;
  if (typeof e.h !== 'string' || e.h.length > 64) return null;
  if (typeof e.summary !== 'string' || !e.summary.trim()) return null;

  const timed = typeof e.start === 'string' && STAMP_RE.test(e.start) && typeof e.end === 'string' && STAMP_RE.test(e.end);
  const allDay = typeof e.date === 'string' && DATE_RE.test(e.date) && typeof e.endDate === 'string' && DATE_RE.test(e.endDate);
  if (timed === allDay) return null;

  const reminders = Array.isArray(e.reminders)
    ? [...new Set(e.reminders.filter((m) => Number.isInteger(m) && (m as number) >= 0 && (m as number) <= 40320))].slice(0, 5) as number[]
    : [];

  return {
    id: e.id,
    h: e.h,
    summary: e.summary.slice(0, 1024),
    description: typeof e.description === 'string' ? e.description.slice(0, 8000) : undefined,
    start: timed ? (e.start as string) : undefined,
    end: timed ? (e.end as string) : undefined,
    date: allDay ? (e.date as string) : undefined,
    endDate: allDay ? (e.endDate as string) : undefined,
    transparent: e.transparent === true,
    reminders,
  };
}

export function toGoogleEvent(e: Desired) {
  return {
    id: e.id,
    summary: e.summary,
    description: e.description,
    start: e.start ? { dateTime: e.start } : { date: e.date },
    end: e.end ? { dateTime: e.end } : { date: e.endDate },
    transparency: e.transparent ? 'transparent' : 'opaque',
    status: 'confirmed',
    reminders: { useDefault: false, overrides: (e.reminders ?? []).map((minutes) => ({ method: 'popup', minutes })) },
    extendedProperties: { private: { istiqomah: '1', h: e.h } },
  };
}

type Existing = { id: string; extendedProperties?: { private?: Record<string, string> } };

export function diffEvents(existing: Existing[], desired: Desired[]) {
  const current = new Map(existing.map((e) => [e.id, e]));
  const wanted = new Set(desired.map((e) => e.id));
  const create: Desired[] = [];
  const update: Desired[] = [];
  for (const e of desired) {
    const found = current.get(e.id);
    if (!found) create.push(e);
    else if (found.extendedProperties?.private?.h !== e.h) update.push(e);
  }
  // Hanya acara buatan aplikasi ini yang boleh dihapus.
  const remove = existing.filter((e) => !wanted.has(e.id) && e.extendedProperties?.private?.istiqomah === '1').map((e) => e.id);
  return { create, update, remove };
}

// Acara Google yang ditampilkan di aplikasi. Hanya kolom yang perlu yang dikirim ke browser.
export function toClientEvent(item: Record<string, any>, calendar: { id: string; name: string; color?: string }) {
  const allDay = Boolean(item.start?.date);
  return {
    id: item.id,
    calendar: calendar.name,
    color: calendar.color ?? null,
    title: item.summary ?? '(Tanpa judul)',
    allDay,
    start: allDay ? item.start.date : item.start?.dateTime,
    end: allDay ? item.end?.date : item.end?.dateTime,
    link: item.htmlLink ?? null,
  };
}
