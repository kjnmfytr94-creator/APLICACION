// Conexión con Google Calendar (solo lectura).
//
// Usamos el flujo OAuth de Google por redirección: la app te lleva a Google, eliges tu cuenta,
// das permiso de solo lectura y Google te devuelve a la app con un permiso temporal (1 hora).
// Con ese permiso leemos tus eventos y marcamos como ocupadas las franjas que coinciden.
// Cada persona decide qué comparte: por calendario («con detalles» o «solo ocupada») y por
// evento («ver», «solo ocupada» o «no compartir»). Solo se comparten el título y la hora de
// los eventos que la persona deja en «ver»; del resto, como mucho, que esa franja está ocupada.
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
      fields: 'nextPageToken,items(id,summary,start,end,transparency,status)',
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

const pad = (n) => String(n).padStart(2, '0');
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * Lee los eventos de los calendarios elegidos (próximos meses) y los deja en un formato sencillo:
 * [{ key, cal, title, allDay, start: ISO, end: ISO }]
 */
export async function fetchGoogleEvents(token, calendarIds) {
  const timeMin = todayDate().toISOString();
  const timeMax = addDays(todayDate(), CAL_HORIZON_DAYS).toISOString();
  const out = [];
  for (const cal of calendarIds) {
    for (const ev of await listEvents(token, cal, timeMin, timeMax)) {
      if (ev.status === 'cancelled' || ev.transparency === 'transparent') continue;
      let start;
      let end;
      let allDay = false;
      if (ev.start?.dateTime) {
        start = new Date(ev.start.dateTime);
        end = new Date(ev.end?.dateTime || ev.start.dateTime);
      } else if (ev.start?.date) {
        allDay = true;
        start = parseDay(ev.start.date);
        end = ev.end?.date ? parseDay(ev.end.date) : addDays(start, 1);
      } else continue;
      out.push({ key: `${cal}|${ev.id}`, cal, title: (ev.summary || 'Ocupada').slice(0, 80), allDay, start: start.toISOString(), end: end.toISOString() });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/** Cómo se comparte un evento: 'details' (título y hora), 'busy' (solo ocupada) o 'ignore' (nada). */
export function shareModeOf(ev, { gModes = {}, gPrefs = {} } = {}) {
  return gPrefs[ev.key] || gModes[ev.cal] || 'details';
}

export function isIgnoredByWords(ev, ignoreText = DEFAULT_IGNORE) {
  const ignore = String(ignoreText || '').split(',').map((w) => normalize(w.trim())).filter(Boolean);
  const title = normalize(ev.title);
  return ignore.some((w) => title.includes(w));
}

/**
 * A partir de los eventos y de lo que la persona ha decidido compartir, calcula:
 *  - busy:   { 'AAAA-MM-DD_t': 'n' | 'm' }  franjas ocupadas (todo menos lo «no compartir»)
 *  - shared: [{ d, t, s, e, ad }]           eventos visibles con su título y hora («ver»)
 */
export function computeGoogle(events, { ignoreText = DEFAULT_IGNORE, gModes = {}, gPrefs = {} } = {}) {
  const acc = {};
  const shared = [];
  const today = dayKey(new Date());
  for (const ev of events || []) {
    if (isIgnoredByWords(ev, ignoreText)) continue;
    const mode = shareModeOf(ev, { gModes, gPrefs });
    if (mode === 'ignore') continue;
    const start = new Date(ev.start);
    const end = new Date(ev.end);
    markRange(acc, start, end, 'Google Calendar');
    if (mode !== 'details') continue;
    // Un evento de varios días aparece en cada día que ocupa.
    const d = new Date(start);
    d.setHours(0, 0, 0, 0);
    while (d < end && shared.length < 800) {
      const k = dayKey(d);
      if (k >= today) {
        const dayEnd = addDays(d, 1);
        shared.push({
          d: k,
          t: ev.title,
          ad: ev.allDay || (start <= d && end >= dayEnd) ? 1 : 0,
          s: start > d ? hm(start) : '',
          e: end < dayEnd ? hm(end) : '',
        });
      }
      d.setDate(d.getDate() + 1);
    }
  }
  const busy = {};
  for (const [k, v] of Object.entries(acc)) if (k >= today) busy[k] = v.s;
  return { busy, shared };
}
