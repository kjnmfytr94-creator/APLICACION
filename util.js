// Constantes y utilidades compartidas.

export const APP_NAME = 'Nos vemos';

export const SLOTS = [
  { id: 'm', label: 'Mañana', emoji: '☀️', hours: '9–14 h', start: '10:00', end: '13:00' },
  { id: 't', label: 'Tarde', emoji: '🌤️', hours: '14–20 h', start: '17:00', end: '20:00' },
  { id: 'n', label: 'Noche', emoji: '🌙', hours: 'desde 20 h', start: '21:00', end: '23:30' },
];

export const STATUS = {
  y: { label: 'Libre', emoji: '✅', cls: 'yes' },
  m: { label: 'Quizás', emoji: '🤔', cls: 'maybe' },
  n: { label: 'No puedo', emoji: '🙅', cls: 'no' },
};

export const COLORS = [
  { hex: '#c0583f', name: 'Terracota' },
  { hex: '#d19a2a', name: 'Mostaza' },
  { hex: '#6f9a5b', name: 'Salvia' },
  { hex: '#2f7f7a', name: 'Petróleo' },
  { hex: '#4f6d8f', name: 'Azul pizarra' },
  { hex: '#8a6fb0', name: 'Lavanda' },
  { hex: '#d07a8f', name: 'Rosa palo' },
  { hex: '#8e3b5c', name: 'Ciruela' },
  { hex: '#e07a5f', name: 'Coral' },
  { hex: '#7d7a2e', name: 'Oliva' },
  { hex: '#6b4226', name: 'Chocolate' },
  { hex: '#5e5a57', name: 'Grafito' },
];

export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// ── Texto ──

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export const normCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#8a7b6e');
export const initial = (name) => ([...String(name || '').trim()][0] || '?').toUpperCase();
export const listNames = (arr) => {
  const n = arr.map((m) => m.name);
  return n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`;
};

// ── Fechas (siempre en hora local) ──

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDay = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const todayDate = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
export const todayKey = () => dayKey(new Date());
export const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
export const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
export const daysBetween = (a, b) => Math.round((b - a) / 864e5);

const fmtShort = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtLong = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtWeekday = new Intl.DateTimeFormat('es-ES', { weekday: 'long' });
const fmtTime = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
const clean = (s) => s.replace(/\./g, '');

export function shortDay(k) {
  const t = todayKey();
  if (k === t) return 'Hoy';
  if (k === dayKey(addDays(todayDate(), 1))) return 'Mañana';
  return cap(clean(fmtShort.format(parseDay(k))));
}
export const longDay = (k) => cap(fmtLong.format(parseDay(k)));
export const weekdayName = (k) => fmtWeekday.format(parseDay(k));
export const slotById = (id) => SLOTS.find((s) => s.id === id) || SLOTS[1];
export function whenText(day, slot, time) {
  const s = slotById(slot);
  return `${shortDay(day)} · ${s.emoji} ${time ? time : s.label.toLowerCase()}`;
}
export function msgTime(ms) {
  const d = new Date(ms);
  return dayKey(d) === todayKey() ? fmtTime.format(d) : `${clean(fmtShort.format(d))}, ${fmtTime.format(d)}`;
}

// ── Disponibilidad: lo que marca cada una + lo que dicen sus calendarios ──

/** Horas que abarca cada franja (la noche llega hasta las 24 h). */
export const SLOT_HOURS = { m: [9, 14], t: [14, 20], n: [20, 24] };
export const CAL_HORIZON_DAYS = 190;

/**
 * Marca en `acc` las franjas que se solapan con [start, end).
 * Si el evento ocupa la mitad de la franja o más → 'n' (no puedo); si es menos → 'm' (quizás).
 */
export function markRange(acc, start, end, label) {
  if (!(end > start)) return;
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  while (d < end) {
    const k = dayKey(d);
    for (const [sid, [h0, h1]] of Object.entries(SLOT_HOURS)) {
      const s0 = new Date(d); s0.setHours(h0, 0, 0, 0);
      const s1 = new Date(d); s1.setHours(h1, 0, 0, 0);
      const overlap = Math.min(end, s1) - Math.max(start, s0);
      if (overlap <= 0) continue;
      const s = overlap / (s1 - s0) >= 0.5 ? 'n' : 'm';
      const key = `${k}_${sid}`;
      if (!acc[key] || (acc[key].s === 'm' && s === 'n')) acc[key] = { s, label };
    }
    d.setDate(d.getDate() + 1);
  }
}

const atTime = (day, hm) => { const d = parseDay(day); const [h, m] = (hm || '00:00').split(':').map(Number); d.setHours(h, m, 0, 0); return d; };

/** Convierte los eventos que una persona añade a mano en franjas ocupadas. */
export function eventsToBusy(events, acc = {}) {
  const horizon = addDays(todayDate(), CAL_HORIZON_DAYS);
  for (const ev of Object.values(events || {})) {
    if (!ev?.day) continue;
    let day = ev.day;
    for (let i = 0; i < (ev.weekly ? 60 : 1); i++) {
      if (parseDay(day) > horizon) break;
      if (ev.allDay) {
        markRange(acc, parseDay(day), addDays(parseDay(day), 1), ev.title);
      } else {
        const start = atTime(day, ev.start);
        let end = atTime(day, ev.end);
        if (end <= start) end = addDays(end, 1); // p. ej. turno de noche 22:00–06:00
        markRange(acc, start, end, ev.title);
      }
      day = dayKey(addDays(parseDay(day), 7));
    }
  }
  return acc;
}

const derivedCache = new WeakMap();
/** Franjas ocupadas según los calendarios de la persona: { clave: { s: 'n'|'m', label, src } } */
export function derivedOf(member) {
  if (!member) return {};
  if (derivedCache.has(member)) return derivedCache.get(member);
  const acc = {};
  for (const [k, v] of Object.entries(member.gcal || {})) {
    if (v === 'n' || v === 'm') acc[k] = { s: v, label: 'Google Calendar', src: 'gcal' };
  }
  const ev = eventsToBusy(member.events);
  for (const [k, v] of Object.entries(ev)) {
    if (!acc[k] || (acc[k].s === 'm' && v.s === 'n')) acc[k] = { ...v, src: 'event' };
  }
  // Turnos de trabajo marcados en cada día: esa franja es «No puedo».
  for (const [day, list] of Object.entries(member.shifts || {})) {
    for (const sid of Array.isArray(list) ? list : []) {
      const slot = SLOTS.find((x) => x.id === sid);
      if (slot) acc[`${day}_${sid}`] = { s: 'n', label: `Turno de ${slot.label.toLowerCase()}`, src: 'shift' };
    }
  }
  derivedCache.set(member, acc);
  return acc;
}

/** Lo que la persona ha marcado a mano: 'y' | 'm' | 'n' | null. */
export function manualStatusOf(member, key) {
  const v = member?.free?.[key];
  if (v === true || v === 'y') return 'y';
  if (v === 'm' || v === 'n') return v;
  return null;
}

/** Estado final de una persona en una franja: manda lo marcado a mano; si no, lo que diga su calendario. */
export function statusOf(member, key) {
  return manualStatusOf(member, key) ?? derivedOf(member)[key]?.s ?? null;
}

/** Días que faltan para el próximo cumpleaños ('MM-DD'), o null. */
export function daysToBirthday(bday) {
  if (!/^\d{2}-\d{2}$/.test(bday || '')) return null;
  const [m, d] = bday.split('-').map(Number);
  const t = todayDate();
  let next = new Date(t.getFullYear(), m - 1, d);
  if (next < t) next = new Date(t.getFullYear() + 1, m - 1, d);
  return daysBetween(t, next);
}
export const birthdayText = (bday) => {
  if (!bday) return '';
  const [m, d] = bday.split('-').map(Number);
  return `${d} de ${MONTHS[m - 1]}`;
};

// ── Calendario del iPhone (.ics) ──

function addHours(hm, h) {
  const [H, M] = hm.split(':').map(Number);
  const total = Math.min(H * 60 + M + h * 60, 23 * 60 + 59);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}
const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

export function planTimes(plan) {
  const s = slotById(plan.slot);
  const start = plan.time || s.start;
  const end = plan.time ? addHours(plan.time, 2) : s.end;
  return { start, end };
}

export function buildIcs(plan, groupName) {
  const { start, end } = planTimes(plan);
  const dt = (hm) => `${plan.day.replace(/-/g, '')}T${hm.replace(':', '')}00`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nos vemos//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${plan.id}@nosvemos`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${dt(start)}`,
    `DTEND:${dt(end)}`,
    `SUMMARY:${icsText(plan.title)}`,
    plan.place ? `LOCATION:${icsText(plan.place)}` : null,
    `DESCRIPTION:${icsText(`Plan con ${groupName} 💛`)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

export function googleCalendarUrl(plan, groupName) {
  const { start, end } = planTimes(plan);
  const dt = (hm) => `${plan.day.replace(/-/g, '')}T${hm.replace(':', '')}00`;
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: plan.title,
    dates: `${dt(start)}/${dt(end)}`,
    details: `Plan con ${groupName}`,
    location: plan.place || '',
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

// ── Fotos: se comprimen en el móvil antes de subirlas ──

export async function compressImage(file, maxSide, quality) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('No se pudo leer la imagen'));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
