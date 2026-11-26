// Conexión con Google Calendar (solo lectura).
//
// Usamos el flujo OAuth de Google por redirección: la app te lleva a Google, eliges tu cuenta,
// das permiso de solo lectura y Google te devuelve a la app con un permiso temporal (1 hora).
// Con ese permiso leemos tus eventos y marcamos como ocupadas las franjas que coinciden.
// Los títulos de tus eventos NO se guardan: solo se guarda qué franjas están ocupadas.
//
// Shifter (Calendario de Turnos) puede exportar los turnos a Google Calendar, así que
// conectando Google Calendar también entran tus turnos.

import { googleClientId } from './config.js';
import { markRange, dayKey, todayDate, addDays, parseDay, CAL_HORIZON_DAYS } from './util.js';

export const googleEnabled = Boolean(googleClientId);

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const TOKEN_KEY = 'nosvemos.gtoken';
const STATE_KEY = 'nosvemos.gstate';
const API = 'https://www.googleapis.com/calendar/v3';

const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignorar */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignorar */ } },
};

const redirectUri = () => `${location.origin}${location.pathname}`;

/** Lleva a la persona a Google para dar permiso. `then` es lo que haremos al volver. */
export function startGoogleAuth(then) {
  const nonce = crypto.getRandomValues(new Uint32Array(2)).join('');
  LS.set(STATE_KEY, { nonce, then });
  const p = new URLSearchParams({
    client_id: googleClientId,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPE,
    include_granted_scopes: 'true',
    state: nonce,
  });
  location.href = `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

/**
 * Al abrir la app comprueba si venimos de Google.
 * Devuelve { ok: true, then } | { ok: false, error } | null (si no venimos de Google).
 */
export function consumeGoogleRedirect() {
  const hash = location.hash.slice(1);
  if (!/access_token=|error=/.test(hash)) return null;
  history.replaceState(null, '', location.pathname + location.search);
  const h = new URLSearchParams(hash);
  const saved = LS.get(STATE_KEY);
  LS.del(STATE_KEY);
  if (!saved || h.get('state') !== saved.nonce) return { ok: false, error: 'state' };
  if (h.get('error')) return { ok: false, error: h.get('error') };
  LS.set(TOKEN_KEY, { token: h.get('access_token'), exp: Date.now() + (Number(h.get('expires_in')) || 3600) * 1000 - 60000 });
  return { ok: true, then: saved.then };
}

export function getToken() {
  const t = LS.get(TOKEN_KEY);
  return t && t.exp > Date.now() ? t.token : null;
}

export async function disconnectGoogle() {
  const t = LS.get(TOKEN_KEY);
  LS.del(TOKEN_KEY);
  if (t?.token) {
    try { await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t.token)}`, { method: 'POST' }); } catch { /* da igual */ }
  }
}

class AuthError extends Error {}
export const isAuthError = (e) => e instanceof AuthError;

async function api(path, token) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401 || res.status === 403) { LS.del(TOKEN_KEY); throw new AuthError('Permiso caducado'); }
  if (!res.ok) throw new Error(`Google Calendar respondió ${res.status}`);
  return res.json();
}

/** Calendarios de la cuenta: [{ id, name, primary, color }] */
export async function listCalendars(token) {
  const data = await api('/users/me/calendarList?minAccessRole=reader&fields=items(id,summary,summaryOverride,primary,backgroundColor)', token);
  return (data.items || [])
    .map((c) => ({ id: c.id, name: c.summaryOverride || c.summary || c.id, primary: !!c.primary, color: c.backgroundColor }))
    .sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0) || a.name.localeCompare(b.name));
}

async function listEvents(token, calendarId, timeMin, timeMax) {
  const items = [];
  let pageToken = '';
  do {
    const p = new URLSearchParams({
      timeMin, timeMax, singleEvents: 'true', maxResults: '2500',
      fields: 'nextPageToken,items(summary,start,end,transparency,status)',
    });
    if (pageToken) p.set('pageToken', pageToken);
    const data = await api(`/calendars/${encodeURIComponent(calendarId)}/events?${p}`, token);
    items.push(...(data.items || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return items;
}

/** Palabras que, si aparecen en el título, hacen que ignoremos el evento (p. ej. "Libre" en Shifter). */
export const DEFAULT_IGNORE = 'Libre, Descanso, Vacaciones, Festivo';
const normalize = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Convierte eventos de Google en franjas ocupadas.
 * Devuelve un mapa { 'AAAA-MM-DD_t': 'n' | 'm' }.
 */
export function googleEventsToBusy(events, ignoreText = DEFAULT_IGNORE) {
  const ignore = ignoreText.split(',').map((w) => normalize(w.trim())).filter(Boolean);
  const acc = {};
  for (const ev of events) {
    if (ev.status === 'cancelled' || ev.transparency === 'transparent') continue;
    const title = normalize(ev.summary);
    if (ignore.some((w) => title.includes(w))) continue;
    let start;
    let end;
    if (ev.start?.dateTime) {
      start = new Date(ev.start.dateTime);
      end = new Date(ev.end?.dateTime || ev.start.dateTime);
    } else if (ev.start?.date) {
      start = parseDay(ev.start.date);
      end = ev.end?.date ? parseDay(ev.end.date) : addDays(start, 1);
    } else continue;
    markRange(acc, start, end, 'Google Calendar');
  }
  const out = {};
  const today = dayKey(new Date());
  for (const [k, v] of Object.entries(acc)) if (k >= today) out[k] = v.s;
  return out;
}

export async function fetchGoogleBusy(token, calendarIds, ignoreText) {
  const timeMin = todayDate().toISOString();
  const timeMax = addDays(todayDate(), CAL_HORIZON_DAYS).toISOString();
  const all = [];
  for (const id of calendarIds) all.push(...await listEvents(token, id, timeMin, timeMax));
  return { busy: googleEventsToBusy(all, ignoreText), count: all.length };
}
