import { createStore, isDemo } from './store.js';

// ───────────────────────── Ajustes ─────────────────────────

const SLOTS = [
  { id: 'm', label: 'Mañana', emoji: '☀️', hours: '9–14 h' },
  { id: 't', label: 'Tarde', emoji: '🌤️', hours: '14–20 h' },
  { id: 'n', label: 'Noche', emoji: '🌙', hours: 'desde 20 h' },
];
const DAYS_AHEAD = 42; // seis semanas
const COLORS = ['#e8457a', '#7c5cff', '#1fb5a8', '#ff9f1c', '#3a86ff', '#c04fe0', '#2a9d5b', '#d9480f'];
const TABS = [
  { id: 'disp', label: 'Mis huecos', icon: '🗓️' },
  { id: 'quedar', label: 'Quedar', icon: '✨' },
  { id: 'planes', label: 'Planes', icon: '🎉' },
  { id: 'grupo', label: 'Grupo', icon: '👭' },
];

const app = document.getElementById('app');
const sheet = document.getElementById('sheet');
const state = { store: null, groupId: null, memberId: null, data: null, unsub: null, tab: 'disp' };

// ───────────────────────── Utilidades ─────────────────────────

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignorar */ } },
};
const getMemberships = () => LS.get('quedamos.groups', []);
const setMemberships = (v) => LS.set('quedamos.groups', v);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const normCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#999999');
const initial = (name) => ([...String(name || '').trim()][0] || '?').toUpperCase();

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const todayDate = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
const todayKey = () => dayKey(new Date());

const fmtWd = new Intl.DateTimeFormat('es-ES', { weekday: 'short' });
const fmtMon = new Intl.DateTimeFormat('es-ES', { month: 'short' });
const fmtShort = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtDayMonth = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' });
const clean = (s) => s.replace(/\./g, '');

function upcomingDays() {
  const t = todayDate();
  return Array.from({ length: DAYS_AHEAD }, (_, i) => { const d = new Date(t); d.setDate(t.getDate() + i); return d; });
}
function weekStart(d) {
  const w = new Date(d); w.setHours(0, 0, 0, 0);
  w.setDate(w.getDate() - ((w.getDay() + 6) % 7)); // lunes
  return w;
}
function weekTitle(d) {
  const diff = Math.round((weekStart(d) - weekStart(todayDate())) / (7 * 864e5));
  if (diff === 0) return 'Esta semana';
  if (diff === 1) return 'La semana que viene';
  return `Semana del ${fmtDayMonth.format(weekStart(d))}`;
}
function whenLabel(key) {
  const [day, s] = key.split('_');
  const slot = SLOTS.find((x) => x.id === s);
  const label = day === todayKey() ? 'Hoy' : cap(clean(fmtShort.format(parseDay(day))));
  return { day: label, slot: `${slot?.emoji ?? ''} ${slot?.label ?? ''}` };
}
const isStandalone = () => window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const inviteLink = (code) => `${location.origin}${location.pathname}?g=${code}`;

function avatar(m, cls = '') {
  return `<span class="avatar ${cls}" style="--c:${safeColor(m.color)}" title="${esc(m.name)}">${esc(initial(m.name))}</span>`;
}
function avatars(list, max = 6) {
  const shown = list.slice(0, max).map((m) => avatar(m)).join('');
  const more = list.length > max ? `<span class="avatar more">+${list.length - max}</span>` : '';
  return `<span class="avatars">${shown}${more}</span>`;
}
const names = (list) => list.map((m) => esc(m.name)).join(', ');

function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2600);
}

async function busy(btn, fn) {
  if (btn) btn.disabled = true;
  try { await fn(); } catch (e) { console.error(e); toast('Algo ha fallado. Revisa tu conexión e inténtalo otra vez.'); } finally { if (btn) btn.disabled = false; }
}

// ───────────────────────── Arranque ─────────────────────────

async function boot() {
  app.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    state.store = await createStore();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="home"><div class="card"><h2>No se ha podido conectar</h2>
      <p class="muted">Comprueba tu conexión a internet y la configuración de Firebase en <code>config.js</code>.</p>
      <button class="btn primary" onclick="location.reload()">Reintentar</button></div></div>`;
    return;
  }

  const params = new URLSearchParams(location.search);
  const invite = normCode(params.get('g'));
  if (invite) history.replaceState(null, '', location.pathname);

  const memberships = getMemberships();
  if (invite) {
    const mine = memberships.find((x) => x.groupId === invite);
    return mine ? openGroup(mine) : renderHome({ code: invite });
  }
  const current = LS.get('quedamos.current', null);
  const m = memberships.find((x) => x.groupId === current) || memberships[0];
  if (m) openGroup(m); else renderHome();
}

// ───────────────────────── Pantalla de inicio ─────────────────────────

function renderHome({ code = '', message = '' } = {}) {
  closeGroup();
  const mine = getMemberships();
  const join = `
    <form class="card" id="join-form">
      <h2>Unirme a un grupo</h2>
      <label>Código del grupo<input name="code" value="${esc(code)}" placeholder="Ej. K7PQ2MXA" autocapitalize="characters" autocomplete="off" required></label>
      <label>Tu nombre<input name="name" placeholder="¿Cómo te llamas?" maxlength="30" autocomplete="given-name" required></label>
      <button class="btn primary" type="submit">Unirme</button>
    </form>`;
  const create = `
    <form class="card" id="create-form">
      <h2>Crear un grupo nuevo</h2>
      <label>Nombre del grupo<input name="group" placeholder="Las de siempre" maxlength="40" required></label>
      <label>Tu nombre<input name="name" placeholder="¿Cómo te llamas?" maxlength="30" autocomplete="given-name" required></label>
      <button class="btn primary" type="submit">Crear grupo</button>
    </form>`;

  app.innerHTML = `
    <div class="home">
      <div class="hero">
        <img src="icons/icon-192.png" alt="" class="hero-icon">
        <h1>Quedamos</h1>
        <p>Marcad cuándo estáis libres y la app os dice cuándo coincidís para quedar.</p>
      </div>
      ${message ? `<div class="notice">${esc(message)}</div>` : ''}
      ${isDemo ? `<div class="notice"><strong>Modo prueba.</strong> Los datos se guardan solo en este dispositivo y verás dos amigas de ejemplo. Para compartirlo de verdad hay que conectar Firebase (mira el README).</div>` : ''}
      ${code ? join + create : create + join}
      ${mine.length ? `<div class="card"><h2>Mis grupos</h2>${mine.map((g) => `
        <button class="list-btn" data-action="open-group" data-group="${esc(g.groupId)}">
          <span>${esc(g.groupName)}</span><span class="chev">›</span></button>`).join('')}</div>` : ''}
    </div>`;
}

async function handleCreate(form) {
  const fd = new FormData(form);
  const groupName = fd.get('group').trim();
  const name = fd.get('name').trim();
  if (!groupName || !name) return;
  const id = await state.store.createGroup(groupName);
  const memberId = await state.store.addMember(id, { name, color: COLORS[0] });
  addMembership({ groupId: id, memberId, groupName });
  state.tab = 'grupo'; // para que vea enseguida cómo invitar
  openGroup({ groupId: id, memberId, groupName });
  toast('¡Grupo creado! Ahora invita a tus amigas.');
}

async function handleJoin(form) {
  const fd = new FormData(form);
  const code = normCode(fd.get('code'));
  const name = fd.get('name').trim();
  if (!code || !name) return;
  const group = await state.store.getGroup(code);
  if (!group) return toast('No encuentro ningún grupo con ese código.');

  const members = await state.store.getMembers(code);
  const same = members.find((m) => m.name.trim().toLowerCase() === name.toLowerCase());
  let memberId;
  if (same && confirm(`Ya hay alguien llamado "${same.name}" en este grupo. ¿Eres tú desde otro móvil?`)) {
    memberId = same.id;
  } else {
    const used = new Set(members.map((m) => m.color));
    const color = COLORS.find((c) => !used.has(c)) || COLORS[members.length % COLORS.length];
    memberId = await state.store.addMember(code, { name, color });
  }
  addMembership({ groupId: code, memberId, groupName: group.name });
  state.tab = 'disp';
  openGroup({ groupId: code, memberId, groupName: group.name });
  toast(`¡Bienvenida a ${group.name}! Marca cuándo estás libre.`);
}

function addMembership(m) {
  setMemberships([m, ...getMemberships().filter((x) => x.groupId !== m.groupId)]);
}
function removeMembership(groupId) {
  setMemberships(getMemberships().filter((x) => x.groupId !== groupId));
  if (LS.get('quedamos.current') === groupId) LS.set('quedamos.current', null);
}

// ───────────────────────── Grupo ─────────────────────────

function closeGroup() {
  if (state.unsub) state.unsub();
  state.unsub = null;
  state.groupId = state.memberId = state.data = null;
}

function openGroup({ groupId, memberId }) {
  closeGroup();
  state.groupId = groupId;
  state.memberId = memberId;
  LS.set('quedamos.current', groupId);
  app.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  state.unsub = state.store.subscribe(groupId, (data) => {
    if (state.groupId !== groupId) return;
    if (!data.group) {
      removeMembership(groupId);
      return renderHome({ message: 'Ese grupo ya no existe.' });
    }
    if (!data.members.some((m) => m.id === memberId)) {
      removeMembership(groupId);
      return renderHome({ code: groupId, message: `Ya no estás en "${data.group.name}". Puedes volver a unirte.` });
    }
    state.data = data;
    const ms = getMemberships();
    const mine = ms.find((x) => x.groupId === groupId);
    if (mine && mine.groupName !== data.group.name) { mine.groupName = data.group.name; setMemberships(ms); }
    renderGroup();
  }, (err) => {
    console.error(err);
    toast('Se ha perdido la conexión. Reintentando…');
  });
}

const me = () => state.data.members.find((m) => m.id === state.memberId);

function renderGroup() {
  let shell = app.querySelector('.shell');
  if (!shell || shell.dataset.group !== state.groupId) {
    app.innerHTML = `
      <div class="shell" data-group="${esc(state.groupId)}">
        <header class="top"><div class="top-text"><h1></h1><p></p></div><button class="top-me" data-action="tab" data-tab="grupo" aria-label="Grupo"></button></header>
        <main class="view"></main>
        <nav class="tabs">${TABS.map((t) => `
          <button data-action="tab" data-tab="${t.id}"><span class="tab-icon">${t.icon}</span><span>${t.label}</span></button>`).join('')}
        </nav>
      </div>`;
    shell = app.querySelector('.shell');
  }
  const { group, members } = state.data;
  shell.querySelector('.top h1').textContent = group.name;
  shell.querySelector('.top p').textContent = `${members.length} ${members.length === 1 ? 'persona' : 'personas'}${isDemo ? ' · modo prueba' : ''}`;
  shell.querySelector('.top-me').innerHTML = avatar(me());
  shell.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));

  const views = { disp: viewDisp, quedar: viewQuedar, planes: viewPlanes, grupo: viewGrupo };
  shell.querySelector('.view').innerHTML = views[state.tab]();
}

// ── Mis huecos ──

function viewDisp() {
  const mine = me();
  const others = state.data.members.filter((m) => m.id !== state.memberId);
  const marked = Object.keys(mine.free || {}).filter((k) => k >= todayKey()).length;
  let html = `<p class="hint">Toca los momentos en los que <strong>estás libre</strong>. El número verde indica cuántas amigas más lo están.</p>`;
  if (!marked) html += `<div class="notice">Aún no has marcado ningún hueco. ¡Empieza por este finde!</div>`;

  let currentWeek = null;
  for (const d of upcomingDays()) {
    const wk = dayKey(weekStart(d));
    if (wk !== currentWeek) {
      if (currentWeek) html += '</section>';
      currentWeek = wk;
      html += `<section class="week"><h2 class="section-title">${weekTitle(d)}</h2>`;
    }
    const k = dayKey(d);
    const wd = d.getDay();
    const weekend = wd === 0 || wd === 5 || wd === 6;
    html += `
      <div class="day ${weekend ? 'weekend' : ''}">
        <div class="date"><span class="wd">${k === todayKey() ? 'hoy' : clean(fmtWd.format(d))}</span><span class="num">${d.getDate()}</span><span class="mon">${clean(fmtMon.format(d))}</span></div>
        <div class="slots">${SLOTS.map((s) => {
          const key = `${k}_${s.id}`;
          const on = !!mine.free?.[key];
          const free = others.filter((o) => o.free?.[key]);
          return `<button class="slot ${on ? 'on' : ''}" data-action="toggle" data-key="${key}" aria-pressed="${on}" aria-label="${s.label} ${d.getDate()}">
            <span class="slot-emoji">${s.emoji}</span><span class="slot-label">${s.label}</span>
            ${free.length ? `<span class="others" title="También libres: ${names(free)}">${free.length}</span>` : ''}
          </button>`;
        }).join('')}</div>
      </div>`;
  }
  return html + '</section>';
}

// ── Quedar ──

function computeMatches() {
  const { members } = state.data;
  const res = [];
  for (const d of upcomingDays()) {
    for (const s of SLOTS) {
      const key = `${dayKey(d)}_${s.id}`;
      const free = members.filter((m) => m.free?.[key]);
      if (free.length >= 2) res.push({ key, free, missing: members.filter((m) => !m.free?.[key]) });
    }
  }
  return res;
}

function matchCard(m, all) {
  const w = whenLabel(m.key);
  return `
    <article class="match ${all ? 'all' : ''}">
      <div class="match-when"><span class="match-day">${esc(w.day)}</span><span class="match-slot">${w.slot}</span></div>
      <div class="match-who">${avatars(m.free)}
        <span class="muted small">${all ? '¡Todas libres!' : `${m.free.length} de ${state.data.members.length} · falta ${names(m.missing)}`}</span></div>
      <button class="btn small ${all ? 'primary' : 'ghost'}" data-action="new-plan" data-key="${m.key}">Proponer plan</button>
    </article>`;
}

function viewQuedar() {
  const { members } = state.data;
  if (members.length < 2) {
    return `<div class="empty"><div class="empty-icon">👭</div><h2>Invita a tus amigas</h2>
      <p class="muted">Cuando se unan y marquen sus huecos, aquí verás cuándo coincidís.</p>
      <button class="btn primary" data-action="share">Compartir invitación</button></div>`;
  }
  const matches = computeMatches();
  const all = matches.filter((m) => m.missing.length === 0);
  const almost = matches.filter((m) => m.missing.length > 0)
    .sort((a, b) => b.free.length - a.free.length || a.key.localeCompare(b.key)).slice(0, 12);

  if (!matches.length) {
    return `<div class="empty"><div class="empty-icon">🔍</div><h2>Todavía no coincidís</h2>
      <p class="muted">Pide a tus amigas que marquen sus huecos libres en "Mis huecos".</p></div>`;
  }
  let html = '';
  if (all.length) html += `<h2 class="section-title">Estáis todas libres</h2>${all.slice(0, 15).map((m) => matchCard(m, true)).join('')}`;
  else html += `<div class="notice">Aún no hay ningún momento en el que estéis <strong>todas</strong>. Estos son los que más se acercan:</div>`;
  if (almost.length) html += `<h2 class="section-title">${all.length ? 'Casi todas' : 'Los mejores momentos'}</h2>${almost.map((m) => matchCard(m, false)).join('')}`;
  return html;
}

// ── Planes ──

function viewPlanes() {
  const { plans, members } = state.data;
  const byId = Object.fromEntries(members.map((m) => [m.id, m]));
  const order = (p) => `${p.day}_${SLOTS.findIndex((s) => s.id === p.slot)}`;
  const upcoming = plans.filter((p) => p.day >= todayKey()).sort((a, b) => order(a).localeCompare(order(b)));

  let html = `<button class="btn primary block" data-action="new-plan">＋ Nuevo plan</button>`;
  if (!upcoming.length) {
    return html + `<div class="empty"><div class="empty-icon">🎉</div><h2>No hay planes todavía</h2>
      <p class="muted">Mira en "Quedar" cuándo coincidís y propón algo.</p></div>`;
  }
  for (const p of upcoming) {
    const w = whenLabel(`${p.day}_${p.slot}`);
    const going = Object.entries(p.going || {});
    const yes = going.filter(([, v]) => v === true).map(([id]) => byId[id]).filter(Boolean);
    const no = going.filter(([, v]) => v === false).map(([id]) => byId[id]).filter(Boolean);
    const pending = members.filter((m) => !(m.id in (p.going || {})));
    const mineV = p.going?.[state.memberId];
    const freeThen = members.filter((m) => m.free?.[`${p.day}_${p.slot}`]);
    const creator = byId[p.createdBy];
    html += `
      <article class="plan">
        <div class="plan-head">
          <h3>${esc(p.title)}</h3>
          <span class="plan-when">${esc(w.day)} · ${w.slot}</span>
        </div>
        ${p.place ? `<p class="plan-place">📍 ${esc(p.place)}</p>` : ''}
        <div class="plan-people">
          ${yes.length ? `<div><span class="tag ok">Van ${yes.length}</span>${avatars(yes)}</div>` : ''}
          ${no.length ? `<div><span class="tag no">No pueden ${no.length}</span>${avatars(no)}</div>` : ''}
          ${pending.length ? `<div class="muted small">Sin responder: ${names(pending)}</div>` : ''}
          ${freeThen.length ? `<div class="muted small">Libres según su calendario: ${names(freeThen)}</div>` : ''}
        </div>
        <div class="plan-actions">
          <button class="btn small ${mineV === true ? 'primary' : 'ghost'}" data-action="going" data-plan="${esc(p.id)}" data-v="yes">✓ Me apunto</button>
          <button class="btn small ${mineV === false ? 'danger' : 'ghost'}" data-action="going" data-plan="${esc(p.id)}" data-v="no">No puedo</button>
          ${p.createdBy === state.memberId ? `<button class="btn small link" data-action="delete-plan" data-plan="${esc(p.id)}">Borrar</button>` : ''}
        </div>
        ${creator ? `<p class="muted tiny">Propuesto por ${esc(creator.name)}</p>` : ''}
      </article>`;
  }
  return html;
}

// ── Grupo ──

function viewGrupo() {
  const { members, group } = state.data;
  const tk = todayKey();
  const code = state.groupId;
  const mine = getMemberships();
  return `
    <section class="card invite">
      <h2>Invita a tus amigas</h2>
      <p class="muted">Envíales el enlace o diles este código:</p>
      <div class="code">${esc(code.slice(0, 4))} ${esc(code.slice(4))}</div>
      <div class="row">
        <button class="btn primary" data-action="share">Compartir invitación</button>
        <button class="btn ghost" data-action="copy">Copiar enlace</button>
      </div>
    </section>

    ${!isStandalone() ? `
    <section class="card">
      <h2>Instálala en tu iPhone</h2>
      <ol class="steps">
        <li>Abre esta página en <strong>Safari</strong>.</li>
        <li>Pulsa el botón <strong>Compartir</strong> <span class="ios-share">⬆︎</span>.</li>
        <li>Elige <strong>"Añadir a pantalla de inicio"</strong>.</li>
      </ol>
      <p class="muted small">Al abrirla desde el icono por primera vez, únete con el mismo código y el mismo nombre y te reconocerá.</p>
    </section>` : ''}

    <section class="card">
      <h2>En el grupo (${members.length})</h2>
      ${members.map((m) => {
        const n = Object.keys(m.free || {}).filter((k) => k >= tk).length;
        return `<div class="member">${avatar(m, 'lg')}<div><strong>${esc(m.name)}</strong>${m.id === state.memberId ? ' <span class="muted">(tú)</span>' : ''}
          <div class="muted small">${n ? `${n} ${n === 1 ? 'hueco marcado' : 'huecos marcados'}` : 'Aún no ha marcado huecos'}</div></div></div>`;
      }).join('')}
    </section>

    <section class="card">
      <h2>Opciones</h2>
      <button class="list-btn" data-action="rename"><span>Cambiar mi nombre</span><span class="chev">›</span></button>
      <button class="list-btn" data-action="clear-mine"><span>Borrar todos mis huecos</span><span class="chev">›</span></button>
      ${mine.filter((g) => g.groupId !== state.groupId).map((g) => `
        <button class="list-btn" data-action="open-group" data-group="${esc(g.groupId)}"><span>Ir a "${esc(g.groupName)}"</span><span class="chev">›</span></button>`).join('')}
      <button class="list-btn" data-action="home"><span>Unirme o crear otro grupo</span><span class="chev">›</span></button>
      <button class="list-btn danger" data-action="leave"><span>Salir de "${esc(group.name)}"</span><span class="chev">›</span></button>
    </section>
    ${isDemo ? `<p class="muted small center">Modo prueba: los datos solo están en este dispositivo.</p>` : ''}`;
}

// ───────────────────────── Hojas (diálogos) ─────────────────────────

function openSheet(html) {
  sheet.innerHTML = html;
  sheet.showModal();
  sheet.querySelector('input:not([type=hidden])')?.focus();
}
function closeSheet() { sheet.close(); }

function slotOptions(selected) {
  return SLOTS.map((s) => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${s.emoji} ${s.label} (${s.hours})</option>`).join('');
}

function openPlanSheet(key) {
  const [day, slot] = key ? key.split('_') : [todayKey(), 't'];
  openSheet(`
    <form id="plan-form">
      <h2>Nuevo plan</h2>
      <label>¿Qué hacemos?<input name="title" required maxlength="60" placeholder="Cena, cine, café, paseo…"></label>
      <div class="row">
        <label>Día<input type="date" name="day" required min="${todayKey()}" value="${day}"></label>
        <label>Momento<select name="slot">${slotOptions(slot)}</select></label>
      </div>
      <label>¿Dónde? (opcional)<input name="place" maxlength="80" placeholder="Bar de siempre"></label>
      <p class="muted small" id="free-hint"></p>
      <div class="sheet-actions">
        <button type="button" class="btn ghost" data-close>Cancelar</button>
        <button type="submit" class="btn primary">Crear plan</button>
      </div>
    </form>`);
  updateFreeHint();
}

function updateFreeHint() {
  const form = sheet.querySelector('#plan-form');
  const hint = sheet.querySelector('#free-hint');
  if (!form || !hint || !state.data) return;
  const key = `${form.day.value}_${form.slot.value}`;
  const free = state.data.members.filter((m) => m.free?.[key]);
  const total = state.data.members.length;
  hint.textContent = !form.day.value ? '' :
    free.length === total ? '¡Ese momento os viene bien a todas!' :
    free.length ? `Libres ese momento: ${free.map((m) => m.name).join(', ')} (${free.length} de ${total})` :
    'Nadie ha marcado ese momento como libre todavía.';
}

function openRenameSheet() {
  openSheet(`
    <form id="rename-form">
      <h2>Cambiar mi nombre</h2>
      <label>Tu nombre<input name="name" required maxlength="30" value="${esc(me().name)}"></label>
      <div class="sheet-actions">
        <button type="button" class="btn ghost" data-close>Cancelar</button>
        <button type="submit" class="btn primary">Guardar</button>
      </div>
    </form>`);
}

// ───────────────────────── Acciones ─────────────────────────

async function share() {
  const link = inviteLink(state.groupId);
  const text = `¡Únete a "${state.data.group.name}" en Quedamos para organizarnos! Código: ${state.groupId}`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Quedamos', text, url: link }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  copy(link);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Enlace copiado. ¡Pégalo en vuestro chat!'); } catch { prompt('Copia este enlace:', text); }
}

app.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const s = state.store;
  const g = state.groupId;
  switch (b.dataset.action) {
    case 'tab':
      state.tab = b.dataset.tab;
      renderGroup();
      window.scrollTo({ top: 0 });
      break;
    case 'toggle': {
      const key = b.dataset.key;
      const on = !b.classList.contains('on');
      b.classList.toggle('on', on); // respuesta inmediata
      if (navigator.vibrate) navigator.vibrate(8);
      busy(null, () => s.setFree(g, state.memberId, key, on));
      break;
    }
    case 'new-plan': openPlanSheet(b.dataset.key); break;
    case 'going': {
      const plan = state.data.plans.find((p) => p.id === b.dataset.plan);
      const want = b.dataset.v === 'yes';
      const current = plan?.going?.[state.memberId];
      busy(b, () => s.setGoing(g, b.dataset.plan, state.memberId, current === want ? null : want));
      break;
    }
    case 'delete-plan':
      if (confirm('¿Borrar este plan para todas?')) busy(b, () => s.deletePlan(g, b.dataset.plan));
      break;
    case 'share': share(); break;
    case 'copy': copy(inviteLink(g)); break;
    case 'rename': openRenameSheet(); break;
    case 'clear-mine':
      if (confirm('¿Borrar todos tus huecos marcados?')) busy(b, () => s.updateMember(g, state.memberId, { free: {} }));
      break;
    case 'open-group': {
      const m = getMemberships().find((x) => x.groupId === b.dataset.group);
      if (m) { state.tab = 'disp'; openGroup(m); }
      break;
    }
    case 'home': renderHome(); break;
    case 'leave':
      if (confirm(`¿Seguro que quieres salir de "${state.data.group.name}"? Se borrarán tus huecos.`)) {
        busy(b, async () => {
          const leaving = g;
          const memberId = state.memberId;
          closeGroup();
          removeMembership(leaving);
          await s.removeMember(leaving, memberId);
          const next = getMemberships()[0];
          if (next) openGroup(next); else renderHome();
        });
      }
      break;
  }
});

app.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('[type=submit]');
  if (form.id === 'create-form') busy(btn, () => handleCreate(form));
  if (form.id === 'join-form') busy(btn, () => handleJoin(form));
});

sheet.addEventListener('click', (e) => {
  if (e.target === sheet || e.target.closest('[data-close]')) closeSheet();
});
sheet.addEventListener('change', updateFreeHint);
sheet.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('[type=submit]');
  if (form.id === 'plan-form') {
    const fd = new FormData(form);
    const plan = {
      title: fd.get('title').trim(),
      day: fd.get('day'),
      slot: fd.get('slot'),
      place: fd.get('place').trim(),
      createdBy: state.memberId,
      going: { [state.memberId]: true },
    };
    if (!plan.title || !plan.day) return;
    if (plan.day < todayKey()) return toast('Elige un día a partir de hoy.');
    busy(btn, async () => {
      await state.store.addPlan(state.groupId, plan);
      closeSheet();
      state.tab = 'planes';
      renderGroup();
      toast('¡Plan propuesto! Tus amigas ya pueden apuntarse.');
    });
  }
  if (form.id === 'rename-form') {
    const name = new FormData(form).get('name').trim();
    if (!name) return;
    busy(btn, async () => { await state.store.updateMember(state.groupId, state.memberId, { name }); closeSheet(); });
  }
});

// Al volver a la app (por ejemplo al día siguiente) se recalcula "hoy".
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.data) renderGroup();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

boot();
