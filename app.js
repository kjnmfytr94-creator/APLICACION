import { createStore, isDemo, newId } from './store.js';
import {
  APP_NAME, SLOTS, STATUS, COLORS, MONTHS,
  esc, cap, normCode, safeColor, initial, listNames,
  dayKey, parseDay, todayDate, todayKey, addDays, addMonths,
  shortDay, longDay, weekdayName, slotById, whenText, msgTime,
  statusOf, daysToBirthday, birthdayText, buildIcs, googleCalendarUrl, compressImage,
} from './util.js';

// ───────────────────────── Estado ─────────────────────────

const MONTHS_AHEAD = 6;       // meses que se pueden ver en el calendario
const MATCH_DAYS = 56;        // días en los que se buscan coincidencias
const TABS = [
  { id: 'cal', label: 'Calendario', icon: '📅' },
  { id: 'quedar', label: 'Quedar', icon: '✨' },
  { id: 'planes', label: 'Planes', icon: '🎉' },
  { id: 'grupo', label: 'Grupo', icon: '👭' },
];

const app = document.getElementById('app');
const sheet = document.getElementById('sheet');
const state = {
  store: null,
  groupId: null, memberId: null, data: null, unsub: null,
  tab: 'cal',
  month: addMonths(todayDate(), 0),
  plansSeg: 'next',
  planId: null, planUnsub: null, planExtras: null,
  sheetKind: null, sheetDay: null,
  greeted: new Set(),
};

// ───────────────────────── Utilidades de la interfaz ─────────────────────────

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignorar */ } },
};
const getMemberships = () => LS.get('nosvemos.groups', []);
const setMemberships = (v) => LS.set('nosvemos.groups', v);

const isStandalone = () => window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const inviteLink = (code) => `${location.origin}${location.pathname}?g=${code}`;

const me = () => state.data?.members.find((m) => m.id === state.memberId);
const memberById = (id) => state.data?.members.find((m) => m.id === id);

function avatar(m, cls = '') {
  if (!m) return '';
  return `<span class="avatar ${cls}" style="--c:${safeColor(m.color)}" title="${esc(m.name)}">${esc(initial(m.name))}</span>`;
}
function avatars(list, { max = 6, maybe = [] } = {}) {
  const maybeSet = new Set(maybe.map((m) => m.id));
  const all = [...list, ...maybe.filter((m) => !list.some((x) => x.id === m.id))];
  const shown = all.slice(0, max).map((m) => avatar(m, maybeSet.has(m.id) ? 'maybe' : '')).join('');
  const more = all.length > max ? `<span class="avatar more">+${all.length - max}</span>` : '';
  return `<span class="avatars">${shown}${more}</span>`;
}

function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2800);
}

async function busy(btn, fn) {
  if (btn) btn.disabled = true;
  try { await fn(); } catch (e) {
    console.error(e);
    toast(e?.message?.includes('modo prueba') ? e.message : 'Uy, algo ha fallado 😕 Revisa tu conexión e inténtalo otra vez.');
  } finally { if (btn) btn.disabled = false; }
}

function colorPicker(name, taken = new Set(), selected) {
  const first = COLORS.find((c) => !taken.has(c.hex))?.hex;
  const sel = selected && !taken.has(selected) ? selected : first;
  return `<div class="colors" role="radiogroup">${COLORS.map((c) => {
    const dis = taken.has(c.hex);
    return `<label class="color ${dis ? 'taken' : ''}" title="${c.name}${dis ? ' (ya la tiene otra persona)' : ''}">
      <input type="radio" name="${name}" value="${c.hex}" ${dis ? 'disabled' : ''} ${c.hex === sel ? 'checked' : ''} required aria-label="${c.name}">
      <span style="--c:${c.hex}"></span></label>`;
  }).join('')}</div>
  <p class="muted tiny">Los colores tachados ya los ha elegido otra persona del grupo.</p>`;
}

function birthdayInputs(value) {
  const [mm, dd] = value ? value.split('-') : ['', ''];
  const days = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
  return `<div class="row">
    <label>Día<select name="bday-d"><option value="">—</option>${days.map((d) => `<option ${d === dd ? 'selected' : ''} value="${d}">${Number(d)}</option>`).join('')}</select></label>
    <label>Mes<select name="bday-m"><option value="">—</option>${MONTHS.map((m, i) => { const v = String(i + 1).padStart(2, '0'); return `<option ${v === mm ? 'selected' : ''} value="${v}">${cap(m)}</option>`; }).join('')}</select></label>
  </div>`;
}
const readBirthday = (fd) => (fd.get('bday-d') && fd.get('bday-m') ? `${fd.get('bday-m')}-${fd.get('bday-d')}` : null);

// ───────────────────────── Arranque ─────────────────────────

async function boot() {
  app.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    state.store = await createStore();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="home"><div class="card"><h2>No se ha podido conectar 😕</h2>
      <p class="muted">Comprueba tu conexión a internet y la configuración de Firebase en <code>config.js</code>.</p>
      <button class="btn primary block" onclick="location.reload()">Reintentar</button></div></div>`;
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
  const current = LS.get('nosvemos.current', null);
  const m = memberships.find((x) => x.groupId === current) || memberships[0];
  if (m) openGroup(m); else renderHome();
}

// ───────────────────────── Inicio: crear o unirse ─────────────────────────

function renderHome({ code = '', message = '' } = {}) {
  closeGroup();
  const mine = getMemberships();
  const join = `
    <form class="card" id="join-form">
      <h2>Unirme a un grupo 💌</h2>
      <label>Código del grupo<input name="code" value="${esc(code)}" placeholder="Ej. K7PQ2MXA" autocapitalize="characters" autocomplete="off" required></label>
      <button class="btn primary block" type="submit">Siguiente</button>
    </form>`;
  const create = `
    <form class="card" id="create-form">
      <h2>Crear un grupo nuevo ✨</h2>
      <label>Nombre del grupo<input name="group" placeholder="Las de siempre" maxlength="40" required></label>
      <label>Tu nombre<input name="name" placeholder="¿Cómo te llamas?" maxlength="30" autocomplete="given-name" required></label>
      <fieldset><legend>Elige tu color</legend>${colorPicker('color')}</fieldset>
      <fieldset><legend>Tu cumpleaños 🎂 <span class="muted">(opcional)</span></legend>${birthdayInputs('')}</fieldset>
      <button class="btn primary block" type="submit">Crear grupo</button>
    </form>`;

  app.innerHTML = `
    <div class="home">
      <div class="hero">
        <img src="icons/icon-192.png" alt="" class="hero-icon">
        <h1>${APP_NAME}</h1>
        <p>Marcad cuándo podéis y os decimos cuándo coincidís para veros 💛</p>
      </div>
      ${message ? `<div class="notice">${esc(message)}</div>` : ''}
      ${isDemo ? `<div class="notice"><strong>Modo prueba 🧪</strong> Los datos se guardan solo en este dispositivo y verás dos amigas de ejemplo. Para compartirlo de verdad hay que conectar Firebase (mira el README).</div>` : ''}
      ${code ? join + create : create + join}
      ${mine.length ? `<div class="card"><h2>Mis grupos</h2>${mine.map((g) => `
        <button class="list-btn" data-action="open-group" data-group="${esc(g.groupId)}"><span>${esc(g.groupName)}</span><span class="chev">›</span></button>`).join('')}</div>` : ''}
    </div>`;
  if (code) handleJoinCode(code, { silent: true });
}

async function handleCreate(form) {
  const fd = new FormData(form);
  const groupName = fd.get('group').trim();
  const name = fd.get('name').trim();
  if (!groupName || !name) return;
  const id = await state.store.createGroup(groupName);
  const memberId = await state.store.addMember(id, { name, color: fd.get('color'), birthday: readBirthday(fd) });
  addMembership({ groupId: id, memberId, groupName });
  state.tab = 'grupo';
  openGroup({ groupId: id, memberId });
  toast('¡Grupo creado! 🎉 Ahora invita a tus amigas');
}

async function handleJoinCode(raw, { silent = false } = {}) {
  const code = normCode(raw);
  if (!code) return;
  const group = await state.store.getGroup(code);
  if (!group) { if (!silent) toast('No encuentro ningún grupo con ese código 🤔'); return; }
  const members = await state.store.getMembers(code);
  renderJoinStep(group, members);
}

function renderJoinStep(group, members) {
  const taken = new Set(members.map((m) => m.color));
  app.innerHTML = `
    <div class="home">
      <div class="hero small">
        <h1>¡Te unes a<br>«${esc(group.name)}»! 🥳</h1>
        ${members.length ? `<p>${avatars(members, { max: 8 })}</p>` : ''}
      </div>
      ${members.length ? `
      <div class="card">
        <h2>¿Ya estabas en el grupo?</h2>
        <p class="muted small">Si te uniste desde otro móvil o desde Safari, toca tu nombre y recuperarás tus cosas.</p>
        ${members.map((m) => `<button class="list-btn" data-action="claim" data-group="${esc(group.id)}" data-member="${esc(m.id)}">
          <span class="member-inline">${avatar(m)} ${esc(m.name)}</span><span class="chev">›</span></button>`).join('')}
      </div>` : ''}
      <form class="card" id="join-new-form" data-group="${esc(group.id)}" data-group-name="${esc(group.name)}">
        <h2>${members.length ? 'Soy nueva en el grupo' : 'Tus datos'}</h2>
        <label>Tu nombre<input name="name" placeholder="¿Cómo te llamas?" maxlength="30" autocomplete="given-name" required></label>
        <fieldset><legend>Elige tu color</legend>${colorPicker('color', taken)}</fieldset>
        <fieldset><legend>Tu cumpleaños 🎂 <span class="muted">(opcional)</span></legend>${birthdayInputs('')}</fieldset>
        <button class="btn primary block" type="submit">Unirme</button>
      </form>
      <button class="btn link block" data-action="home">‹ Volver</button>
    </div>`;
}

async function handleJoinNew(form) {
  const fd = new FormData(form);
  const groupId = form.dataset.group;
  const name = fd.get('name').trim();
  if (!name) return;
  const members = await state.store.getMembers(groupId);
  if (members.some((m) => m.color === fd.get('color'))) {
    toast('¡Vaya! Alguien acaba de coger ese color. Elige otro 🎨');
    return renderJoinStep({ id: groupId, name: form.dataset.groupName }, members);
  }
  const memberId = await state.store.addMember(groupId, { name, color: fd.get('color'), birthday: readBirthday(fd) });
  addMembership({ groupId, memberId, groupName: form.dataset.groupName });
  state.tab = 'cal';
  openGroup({ groupId, memberId });
  toast(`¡Bienvenida a ${form.dataset.groupName}! 💛 Toca un día para marcar si puedes`);
}

function addMembership(m) {
  setMemberships([m, ...getMemberships().filter((x) => x.groupId !== m.groupId)]);
}
function removeMembership(groupId) {
  setMemberships(getMemberships().filter((x) => x.groupId !== groupId));
  if (LS.get('nosvemos.current') === groupId) LS.set('nosvemos.current', null);
}

// ───────────────────────── Grupo abierto ─────────────────────────

function closePlan() {
  if (state.planUnsub) state.planUnsub();
  state.planUnsub = null;
  state.planId = null;
  state.planExtras = null;
}

function closeGroup() {
  closePlan();
  if (state.unsub) state.unsub();
  state.unsub = null;
  state.groupId = state.memberId = state.data = null;
  if (sheet.open) sheet.close();
}

function openGroup({ groupId, memberId }) {
  closeGroup();
  state.groupId = groupId;
  state.memberId = memberId;
  state.month = addMonths(todayDate(), 0);
  LS.set('nosvemos.current', groupId);
  app.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  state.unsub = state.store.subscribe(groupId, (data) => {
    if (state.groupId !== groupId) return;
    if (!data.group) {
      removeMembership(groupId);
      return renderHome({ message: 'Ese grupo ya no existe.' });
    }
    if (!data.members.some((m) => m.id === memberId)) {
      removeMembership(groupId);
      return renderHome({ code: groupId, message: `Ya no estás en «${data.group.name}». Puedes volver a unirte.` });
    }
    state.data = data;
    const ms = getMemberships();
    const mine = ms.find((x) => x.groupId === groupId);
    if (mine && mine.groupName !== data.group.name) { mine.groupName = data.group.name; setMemberships(ms); }
    renderGroup();
    refreshSheet();
    if (!state.greeted.has(groupId)) {
      state.greeted.add(groupId);
      const n = unreadAvisos().length;
      if (n) setTimeout(() => toast(`🔔 Tienes ${n} ${n === 1 ? 'novedad' : 'novedades'}`), 400);
    }
  }, (err) => {
    console.error(err);
    toast('Se ha perdido la conexión. Reintentando… 📶');
  });
}

function renderGroup() {
  if (!state.data) return;
  let shell = app.querySelector('.shell');
  if (!shell || shell.dataset.group !== state.groupId) {
    app.innerHTML = `
      <div class="shell" data-group="${esc(state.groupId)}">
        <header class="top">
          <button class="top-title" data-action="switch-group"><h1></h1><p></p></button>
          <div class="top-actions">
            <button class="icon-btn bell" data-action="avisos" aria-label="Novedades">🔔<span class="badge" hidden></span></button>
            <button class="top-me" data-action="profile" aria-label="Mi perfil"></button>
          </div>
        </header>
        <main class="view"></main>
        <nav class="tabs">${TABS.map((t) => `
          <button data-action="tab" data-tab="${t.id}"><span class="tab-icon">${t.icon}</span><span>${t.label}</span></button>`).join('')}
        </nav>
      </div>`;
    shell = app.querySelector('.shell');
  }
  const { group, members } = state.data;
  shell.querySelector('.top h1').innerHTML = `${esc(group.name)} <span class="caret">▾</span>`;
  shell.querySelector('.top p').textContent = `${members.length} ${members.length === 1 ? 'persona' : 'personas'}${isDemo ? ' · modo prueba' : ''}`;
  shell.querySelector('.top-me').innerHTML = avatar(me());
  const unread = unreadAvisos().length;
  const badge = shell.querySelector('.bell .badge');
  badge.hidden = !unread;
  badge.textContent = unread;
  shell.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));

  // Guardamos lo que se esté escribiendo para no perderlo al redibujar.
  const view = shell.querySelector('.view');
  const kept = {};
  view.querySelectorAll('[data-keep]').forEach((el) => {
    kept[el.dataset.keep] = { v: el.value, f: document.activeElement === el };
  });

  const views = { cal: viewCal, quedar: viewQuedar, planes: viewPlanes, grupo: viewGrupo };
  view.innerHTML = views[state.tab]();

  view.querySelectorAll('[data-keep]').forEach((el) => {
    const k = kept[el.dataset.keep];
    if (k) { el.value = k.v; if (k.f) el.focus({ preventScroll: true }); }
  });
}

// ───────────────────────── Calendario ─────────────────────────

function dayInfo(k) {
  const { members, plans } = state.data;
  const n = members.length;
  let allSure = false;
  let allPossible = false;
  for (const s of SLOTS) {
    const st = members.map((m) => statusOf(m, `${k}_${s.id}`));
    if (n > 1 && st.every((x) => x === 'y')) allSure = true;
    if (n > 1 && st.every((x) => x === 'y' || x === 'm')) allPossible = true;
  }
  const md = k.slice(5);
  return {
    allSure, allPossible,
    bdays: members.filter((m) => m.birthday === md),
    plans: plans.filter((p) => p.kind !== 'poll' && p.day === k),
  };
}

function viewCal() {
  const mine = me();
  const first = state.month;
  const minMonth = addMonths(todayDate(), 0);
  const maxMonth = addMonths(minMonth, MONTHS_AHEAD - 1);
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const tk = todayKey();

  let cells = '<span class="cell blank"></span>'.repeat(lead);
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(first.getFullYear(), first.getMonth(), i);
    const k = dayKey(d);
    const past = k < tk;
    const info = past ? null : dayInfo(k);
    const marks = past ? '' : `${info.bdays.length ? '🎂' : ''}${info.plans.length ? '🎉' : ''}${info.allSure ? '✨' : ''}`;
    const wd = d.getDay();
    cells += `
      <button class="cell ${past ? 'past' : ''} ${k === tk ? 'today' : ''} ${wd === 0 || wd === 6 ? 'weekend' : ''} ${info?.allSure ? 'match' : info?.allPossible ? 'match-maybe' : ''}"
        data-action="day" data-day="${k}" ${past ? 'disabled' : ''} aria-label="${longDay(k)}">
        <span class="cell-num">${i}</span>
        <span class="cell-marks">${marks}</span>
        <span class="bars">${SLOTS.map((s) => `<i class="bar ${STATUS[statusOf(mine, `${k}_${s.id}`)]?.cls || ''}"></i>`).join('')}</span>
      </button>`;
  }

  const marked = Object.keys(mine.free || {}).filter((k) => k >= tk).length;
  return `
    ${!marked ? `<div class="notice">👋 ¡Hola, ${esc(mine.name)}! Toca un día para decir si puedes por la mañana, por la tarde o por la noche.</div>` : ''}
    <div class="cal card">
      <div class="cal-head">
        <button class="icon-btn" data-action="month" data-d="-1" ${first <= minMonth ? 'disabled' : ''} aria-label="Mes anterior">‹</button>
        <h2>${cap(MONTHS[first.getMonth()])} <span class="muted">${first.getFullYear()}</span></h2>
        <button class="icon-btn" data-action="month" data-d="1" ${first >= maxMonth ? 'disabled' : ''} aria-label="Mes siguiente">›</button>
      </div>
      <div class="cal-grid">
        ${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((x) => `<span class="cal-wd">${x}</span>`).join('')}
        ${cells}
      </div>
    </div>
    <div class="legend card">
      <div><span class="bars demo"><i class="bar yes"></i><i class="bar maybe"></i><i class="bar no"></i></span> Tu mañana, tarde y noche:
        <span class="dot yes"></span> libre <span class="dot maybe"></span> quizás <span class="dot no"></span> no puedo</div>
      <div><span class="legend-box match"></span> Podéis todas ✨ <span class="legend-box match-maybe"></span> Podríais todas (con algún quizás)</div>
      <div>🎉 Hay plan · 🎂 Cumpleaños</div>
    </div>`;
}

function openDaySheet(k) {
  state.sheetKind = 'day';
  state.sheetDay = k;
  const note = me().notes?.[k] || '';
  sheet.innerHTML = `
    <div class="sheet-body">
      <div class="sheet-grab"></div>
      <h2>${esc(longDay(k))}</h2>
      <div id="day-extra"></div>
      <div id="day-slots"></div>
      <label>📝 Nota para este día <span class="muted">(opcional)</span>
        <input id="day-note" maxlength="80" placeholder="Solo hasta las 19h, estoy fuera…" value="${esc(note)}"></label>
      <div class="sheet-actions">
        <button type="button" class="btn ghost" data-action="day-all">✅ Todo el día</button>
        <button type="button" class="btn primary" data-close>Listo</button>
      </div>
    </div>`;
  renderDaySheetParts();
  sheet.showModal();
}

function renderDaySheetParts() {
  const k = state.sheetDay;
  const box = sheet.querySelector('#day-slots');
  if (!box || !state.data) return;
  const mine = me();
  const others = state.data.members.filter((m) => m.id !== state.memberId);
  box.innerHTML = SLOTS.map((s) => {
    const key = `${k}_${s.id}`;
    const st = statusOf(mine, key);
    const yes = others.filter((o) => statusOf(o, key) === 'y');
    const maybe = others.filter((o) => statusOf(o, key) === 'm');
    return `
      <div class="slot-row">
        <div class="slot-row-head">
          <span><strong>${s.emoji} ${s.label}</strong> <span class="muted small">${s.hours}</span></span>
          ${yes.length || maybe.length ? avatars(yes, { max: 5, maybe }) : '<span class="muted tiny">Nadie más aún</span>'}
        </div>
        <div class="seg" role="group" aria-label="${s.label}">
          ${Object.entries(STATUS).map(([id, x]) => `
            <button type="button" class="seg-btn ${x.cls} ${st === id ? 'on' : ''}" data-action="set-status" data-key="${key}" data-s="${id}" aria-pressed="${st === id}">${x.emoji} ${x.label}</button>`).join('')}
        </div>
      </div>`;
  }).join('');

  const info = dayInfo(k);
  const notes = others.filter((o) => o.notes?.[k]).map((o) => `<div class="note-line">${avatar(o)} <span><strong>${esc(o.name)}:</strong> ${esc(o.notes[k])}</span></div>`);
  sheet.querySelector('#day-extra').innerHTML = [
    ...info.bdays.map((m) => `<div class="pill">🎂 ¡Es el cumple de ${esc(m.id === state.memberId ? 'ti' : m.name)}!</div>`),
    ...info.plans.map((p) => `<button class="pill pill-btn" data-action="open-plan" data-plan="${esc(p.id)}">🎉 ${esc(p.title)} · ${slotById(p.slot).label.toLowerCase()} ›</button>`),
    notes.length ? `<div class="notes">${notes.join('')}</div>` : '',
  ].join('');
}

function saveDayNote() {
  const input = sheet.querySelector('#day-note');
  if (!input || !state.sheetDay || !state.data) return;
  const text = input.value.trim();
  const prev = me().notes?.[state.sheetDay] || '';
  if (text !== prev) busy(null, () => state.store.setNote(state.groupId, state.memberId, state.sheetDay, text || null));
}

// ───────────────────────── Quedar ─────────────────────────

function computeMatches() {
  const { members } = state.data;
  const n = members.length;
  const res = [];
  const t = todayDate();
  for (let i = 0; i < MATCH_DAYS; i++) {
    const k = dayKey(addDays(t, i));
    for (const s of SLOTS) {
      const key = `${k}_${s.id}`;
      const yes = members.filter((m) => statusOf(m, key) === 'y');
      const maybe = members.filter((m) => statusOf(m, key) === 'm');
      if (yes.length + maybe.length < 2) continue;
      const missing = members.filter((m) => !['y', 'm'].includes(statusOf(m, key)));
      const level = yes.length === n ? 'sure' : missing.length === 0 ? 'maybe' : 'almost';
      res.push({ key, day: k, slot: s.id, yes, maybe, missing, level, score: yes.length + maybe.length * 0.5 });
    }
  }
  return res;
}

function matchCard(m) {
  const { members } = state.data;
  const text = m.level === 'sure' ? '¡Podéis todas seguro! 🎉'
    : m.level === 'maybe' ? `Todas, con ${m.maybe.length} quizás 🤔`
    : `${m.yes.length + m.maybe.length} de ${members.length} · falta ${esc(listNames(m.missing))}`;
  const notes = [...m.yes, ...m.maybe].filter((x) => x.notes?.[m.day]).map((x) => `${esc(x.name)}: ${esc(x.notes[m.day])}`);
  return `
    <article class="match ${m.level}">
      <div class="match-when"><span class="match-day">${esc(shortDay(m.day))}</span><span class="match-slot">${slotById(m.slot).emoji} ${slotById(m.slot).label}</span></div>
      <button class="btn small ${m.level === 'sure' ? 'primary' : 'ghost'}" data-action="new-plan" data-key="${m.key}">Proponer plan</button>
      <div class="match-who">${avatars(m.yes, { maybe: m.maybe })}<span class="muted small">${text}</span></div>
      ${notes.length ? `<p class="muted tiny match-notes">📝 ${notes.join(' · ')}</p>` : ''}
    </article>`;
}

function viewQuedar() {
  const { members } = state.data;
  if (members.length < 2) {
    return `<div class="empty"><div class="empty-icon">👭</div><h2>Invita a tus amigas</h2>
      <p class="muted">Cuando se unan y marquen cuándo pueden, aquí verás cuándo coincidís ✨</p>
      <button class="btn primary" data-action="share">Compartir invitación</button></div>`;
  }
  const matches = computeMatches();
  if (!matches.length) {
    return `<div class="empty"><div class="empty-icon">🔍</div><h2>Todavía no coincidís</h2>
      <p class="muted">Pedid a todas que marquen en el calendario cuándo pueden 📅</p></div>`;
  }
  const sure = matches.filter((m) => m.level === 'sure');
  const maybe = matches.filter((m) => m.level === 'maybe');
  const almost = matches.filter((m) => m.level === 'almost').sort((a, b) => b.score - a.score || a.key.localeCompare(b.key)).slice(0, 10);
  const best = [...sure, ...maybe, ...almost].slice(0, 4).map((m) => m.key);

  let html = '';
  if (best.length >= 2) {
    html += `<button class="btn ghost block" data-action="new-poll" data-keys="${best.join(',')}">🗳️ Votar entre las mejores fechas</button>`;
  }
  if (sure.length) html += `<h2 class="section-title">✨ Podéis todas seguro</h2>${sure.slice(0, 12).map(matchCard).join('')}`;
  if (maybe.length) html += `<h2 class="section-title">🤔 Todas, con algún quizás</h2>${maybe.slice(0, 10).map(matchCard).join('')}`;
  if (!sure.length && !maybe.length) html += `<div class="notice">Aún no hay ningún momento en el que podáis <strong>todas</strong>. Estos son los que más se acercan 👇</div>`;
  if (almost.length) html += `<h2 class="section-title">👀 Casi todas</h2>${almost.map(matchCard).join('')}`;
  return html;
}

// ───────────────────────── Planes ─────────────────────────

const isPoll = (p) => p.kind === 'poll';
const planIsUpcoming = (p) => (isPoll(p) ? (p.options || []).some((o) => o.day >= todayKey()) : p.day >= todayKey());
const planSortKey = (p) => `${p.day}_${SLOTS.findIndex((s) => s.id === p.slot)}`;

function myPlanChip(p) {
  if (isPoll(p)) return p.votes?.[state.memberId] ? '<span class="tag ok">Has votado</span>' : '<span class="tag warn">¡Vota! 🗳️</span>';
  const v = p.going?.[state.memberId];
  return v === true ? '<span class="tag ok">Vas ✅</span>' : v === false ? '<span class="tag no">No puedes</span>' : '<span class="tag warn">Sin responder</span>';
}

function planCard(p) {
  const going = state.data.members.filter((m) => p.going?.[m.id] === true);
  const when = isPoll(p) ? `🗳️ Votación · ${(p.options || []).length} fechas` : whenText(p.day, p.slot, p.time);
  return `
    <button class="plan-card" data-action="open-plan" data-plan="${esc(p.id)}">
      ${p.cover ? `<img class="plan-cover" src="${esc(p.cover)}" alt="">` : ''}
      <div class="plan-card-body">
        <div class="plan-card-top"><h3>${esc(p.title)}</h3>${myPlanChip(p)}</div>
        <span class="plan-when">${esc(when)}</span>
        ${p.place ? `<span class="muted small">📍 ${esc(p.place)}</span>` : ''}
        <div class="plan-card-foot">
          ${going.length ? avatars(going) : '<span></span>'}
          <span class="muted small">${p.msgCount ? `💬 ${p.msgCount}` : ''} ${p.photoCount ? `📸 ${p.photoCount}` : ''}</span>
        </div>
      </div>
    </button>`;
}

function viewPlanes() {
  if (state.planId) return viewPlanDetail();
  const { plans } = state.data;
  const seg = `
    <div class="segmented">
      <button class="${state.plansSeg === 'next' ? 'on' : ''}" data-action="plans-seg" data-seg="next">Próximos</button>
      <button class="${state.plansSeg === 'past' ? 'on' : ''}" data-action="plans-seg" data-seg="past">Recuerdos 📸</button>
    </div>`;
  if (state.plansSeg === 'past') {
    const past = plans.filter((p) => !isPoll(p) && p.day < todayKey()).sort((a, b) => planSortKey(b).localeCompare(planSortKey(a)));
    if (!past.length) return seg + `<div class="empty"><div class="empty-icon">📸</div><h2>Aún no hay recuerdos</h2><p class="muted">Cuando pase un plan, aparecerá aquí para que subáis las fotos.</p></div>`;
    return seg + `<div class="memories">${past.map((p) => `
      <button class="memory" data-action="open-plan" data-plan="${esc(p.id)}">
        ${p.cover ? `<img src="${esc(p.cover)}" alt="">` : '<span class="memory-empty">📷</span>'}
        <span class="memory-text"><strong>${esc(p.title)}</strong><span>${esc(shortDay(p.day))}${p.photoCount ? ` · ${p.photoCount} 📸` : ''}</span></span>
      </button>`).join('')}</div>`;
  }
  const upcoming = plans.filter(planIsUpcoming).sort((a, b) => planSortKey(a).localeCompare(planSortKey(b)));
  let html = seg + `<button class="btn primary block" data-action="new-plan">＋ Nuevo plan</button>`;
  if (!upcoming.length) {
    return html + `<div class="empty"><div class="empty-icon">🎉</div><h2>No hay planes todavía</h2>
      <p class="muted">Mira en «Quedar» cuándo coincidís y proponed algo 💃</p></div>`;
  }
  return html + upcoming.map(planCard).join('');
}

function viewPlanDetail() {
  const p = state.data.plans.find((x) => x.id === state.planId);
  if (!p) { closePlan(); return viewPlanes(); }
  const { members } = state.data;
  const creator = memberById(p.createdBy);
  const mine = p.createdBy === state.memberId;
  const ex = state.planExtras;
  const past = !isPoll(p) && p.day < todayKey();

  let body = '';
  if (isPoll(p)) {
    const myVotes = new Set(p.votes?.[state.memberId] || []);
    const voters = (oid) => members.filter((m) => (p.votes?.[m.id] || []).includes(oid));
    const maxVotes = Math.max(1, ...(p.options || []).map((o) => voters(o.id).length));
    const notVoted = members.filter((m) => !p.votes?.[m.id]);
    body += `
      <section class="card">
        <h2>🗳️ ¿Qué fecha os va mejor?</h2>
        <p class="muted small">Puedes votar varias. ${mine ? 'Cuando lo tengáis claro, elige la ganadora.' : `${esc(creator?.name || 'Quien lo propuso')} elegirá la ganadora.`}</p>
        ${(p.options || []).map((o) => {
          const v = voters(o.id);
          const yes = members.filter((m) => statusOf(m, `${o.day}_${o.slot}`) === 'y');
          return `
          <div class="option ${myVotes.has(o.id) ? 'voted' : ''}">
            <button class="option-main" data-action="vote" data-option="${esc(o.id)}" aria-pressed="${myVotes.has(o.id)}">
              <span class="check">${myVotes.has(o.id) ? '✓' : ''}</span>
              <span class="option-text"><strong>${esc(whenText(o.day, o.slot))}</strong>
                <span class="muted tiny">${yes.length} de ${members.length} lo tienen libre en el calendario</span></span>
              <span class="option-count">${v.length}</span>
            </button>
            <div class="option-bar"><i style="width:${(v.length / maxVotes) * 100}%"></i></div>
            <div class="option-foot">${v.length ? avatars(v) : '<span class="muted tiny">Sin votos</span>'}
              ${mine ? `<button class="btn tiny-btn" data-action="choose-option" data-option="${esc(o.id)}">Elegir esta ✅</button>` : ''}</div>
          </div>`;
        }).join('')}
        ${notVoted.length ? `<p class="muted small">Falta por votar: ${esc(listNames(notVoted))}</p>` : '<p class="muted small">¡Ya habéis votado todas! 🙌</p>'}
      </section>`;
  } else {
    const yes = members.filter((m) => p.going?.[m.id] === true);
    const no = members.filter((m) => p.going?.[m.id] === false);
    const pending = members.filter((m) => !(m.id in (p.going || {})));
    const v = p.going?.[state.memberId];
    body += `
      <section class="card">
        ${!past ? `<div class="plan-actions">
          <button class="btn ${v === true ? 'primary' : 'ghost'}" data-action="going" data-v="yes">✅ Me apunto</button>
          <button class="btn ${v === false ? 'danger' : 'ghost'}" data-action="going" data-v="no">🙅 No puedo</button>
        </div>` : ''}
        <div class="plan-people">
          ${yes.length ? `<div><span class="tag ok">Van ${yes.length}</span>${avatars(yes, { max: 10 })}</div>` : ''}
          ${no.length ? `<div><span class="tag no">No pueden ${no.length}</span>${avatars(no, { max: 10 })}</div>` : ''}
          ${pending.length && !past ? `<div class="muted small">Sin responder: ${esc(listNames(pending))}</div>` : ''}
        </div>
        ${!past && v === true ? `<div class="cal-add">
          <button class="btn ghost block" data-action="ics">📅 Añadir a mi calendario</button>
          <a class="muted tiny" href="${esc(googleCalendarUrl(p, state.data.group.name))}" target="_blank" rel="noopener">o añadirlo a Google Calendar</a>
        </div>` : ''}
      </section>`;
  }

  // Fotos
  const photos = ex?.photos || [];
  body += `
    <section class="card">
      <div class="card-head"><h2>📸 Fotos</h2>
        <label class="btn small ghost file-btn">＋ Añadir<input type="file" accept="image/*" multiple data-action-change="upload-photos" hidden></label></div>
      ${!ex ? '<div class="spinner small"></div>' : photos.length ? `<div class="photos">${photos.map((ph) => `
        <button class="photo" data-action="open-photo" data-photo="${esc(ph.id)}"><img src="${esc(ph.thumb)}" alt="" loading="lazy"></button>`).join('')}</div>`
        : `<p class="muted small">${past ? '¿Qué tal fue? ¡Subid las fotos del día! 🥰' : 'Después del plan podréis subir aquí las fotos.'}</p>`}
    </section>`;

  // Chat
  const msgs = (ex?.messages || []).slice(-150);
  body += `
    <section class="card chat">
      <h2>💬 Chat</h2>
      <div class="messages">${!ex ? '<div class="spinner small"></div>' : msgs.length ? msgs.map((m) => {
        const who = memberById(m.by);
        const own = m.by === state.memberId;
        return `<div class="msg ${own ? 'own' : ''}">${own ? '' : avatar(who || { name: '?', color: '#999999' })}
          <div class="bubble">${own ? '' : `<span class="msg-name" style="color:${safeColor(who?.color)}">${esc(who?.name || 'Alguien')}</span>`}
          <span class="msg-text">${esc(m.text)}</span><span class="msg-time">${esc(msgTime(m.at))}</span></div></div>`;
      }).join('') : '<p class="muted small">Todavía no hay mensajes. ¡Rompe el hielo! 👋</p>'}</div>
      <form id="chat-form" class="chat-form">
        <input data-keep="chat-${esc(p.id)}" name="text" maxlength="500" placeholder="Escribe un mensaje…" autocomplete="off">
        <button class="btn primary" type="submit" aria-label="Enviar">➤</button>
      </form>
    </section>`;

  return `
    <button class="back" data-action="close-plan">‹ Planes</button>
    <header class="plan-hero">
      <h2>${esc(p.title)}</h2>
      <p class="plan-when big">${isPoll(p) ? '🗳️ Fecha por decidir' : esc(longDay(p.day)) + ' · ' + slotById(p.slot).emoji + ' ' + (p.time ? esc(p.time) : slotById(p.slot).label.toLowerCase())}</p>
      ${p.place ? `<p>📍 ${esc(p.place)}</p>` : ''}
      ${creator ? `<p class="muted small">Lo propuso ${esc(creator.name)}</p>` : ''}
    </header>
    ${body}
    ${mine ? `<button class="btn link block danger-text" data-action="delete-plan">Borrar este plan</button>` : ''}`;
}

function openPlan(id) {
  closePlan();
  if (sheet.open) closeSheet();
  state.tab = 'planes';
  state.planId = id;
  const g = state.groupId;
  state.planUnsub = state.store.subscribePlan(g, id, (extras) => {
    if (state.planId !== id) return;
    const prevCount = state.planExtras?.messages.length ?? -1;
    state.planExtras = extras;
    renderGroup();
    if (prevCount !== -1 && extras.messages.length > prevCount) {
      app.querySelector('.messages .msg:last-child')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, (e) => console.error(e));
  renderGroup();
  window.scrollTo({ top: 0 });
}

// ── Crear plan ──

function slotOptions(selected) {
  return SLOTS.map((s) => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${s.emoji} ${s.label}</option>`).join('');
}
function optionRow(day, slot) {
  return `<div class="row option-row">
    <label>Día<input type="date" name="opt-day" required min="${todayKey()}" value="${day}"></label>
    <label>Momento<select name="opt-slot">${slotOptions(slot)}</select></label>
    <button type="button" class="icon-btn remove" data-action="remove-option" aria-label="Quitar">✕</button>
  </div>`;
}

function openPlanSheet({ key, keys, poll = false } = {}) {
  state.sheetKind = 'plan';
  const [day, slot] = key ? key.split('_') : [todayKey(), 't'];
  const pollKeys = keys?.length ? keys : [`${day}_${slot}`, `${dayKey(addDays(parseDay(day), 1))}_${slot}`];
  sheet.innerHTML = `
    <form id="plan-form" class="sheet-body">
      <div class="sheet-grab"></div>
      <h2>Nuevo plan 🎉</h2>
      <label>¿Qué hacemos?<input name="title" required maxlength="60" placeholder="Cena, cine, café, paseo…"></label>
      <div class="segmented">
        <button type="button" class="${poll ? '' : 'on'}" data-action="plan-mode" data-mode="fixed">📌 Fecha fija</button>
        <button type="button" class="${poll ? 'on' : ''}" data-action="plan-mode" data-mode="poll">🗳️ Votar fecha</button>
      </div>
      <input type="hidden" name="mode" value="${poll ? 'poll' : 'fixed'}">
      <div class="mode-fixed" ${poll ? 'hidden' : ''}>
        <div class="row">
          <label>Día<input type="date" name="day" min="${todayKey()}" value="${day}"></label>
          <label>Momento<select name="slot">${slotOptions(slot)}</select></label>
        </div>
        <label>Hora <span class="muted">(opcional)</span><input type="time" name="time"></label>
        <p class="muted small free-hint" id="free-hint"></p>
      </div>
      <div class="mode-poll" ${poll ? '' : 'hidden'}>
        <p class="muted small">Añade las fechas posibles y cada una votará las que le vengan bien.</p>
        <div id="options">${pollKeys.map((k) => optionRow(...k.split('_'))).join('')}</div>
        <button type="button" class="btn link" data-action="add-option">＋ Añadir otra fecha</button>
      </div>
      <label>¿Dónde? <span class="muted">(opcional)</span><input name="place" maxlength="80" placeholder="El bar de siempre"></label>
      <div class="sheet-actions">
        <button type="button" class="btn ghost" data-close>Cancelar</button>
        <button type="submit" class="btn primary">Crear plan</button>
      </div>
    </form>`;
  sheet.showModal();
  updateFreeHint();
}

function updateFreeHint() {
  const form = sheet.querySelector('#plan-form');
  const hint = sheet.querySelector('#free-hint');
  if (!form || !hint || !state.data || !form.day.value) { if (hint) hint.textContent = ''; return; }
  const key = `${form.day.value}_${form.slot.value}`;
  const { members } = state.data;
  const yes = members.filter((m) => statusOf(m, key) === 'y');
  const maybe = members.filter((m) => statusOf(m, key) === 'm');
  hint.textContent = yes.length === members.length ? '✨ ¡Ese momento os viene bien a todas!'
    : yes.length || maybe.length ? `Pueden: ${listNames(yes) || 'nadie seguro'}${maybe.length ? ` · Quizás: ${listNames(maybe)}` : ''}`
    : 'Nadie ha marcado ese momento como libre todavía.';
}

async function submitPlan(form) {
  const fd = new FormData(form);
  const title = fd.get('title').trim();
  if (!title) return;
  const base = { title, place: fd.get('place').trim(), createdBy: state.memberId, going: {}, votes: {} };
  let plan;
  if (fd.get('mode') === 'poll') {
    const days = fd.getAll('opt-day');
    const slots = fd.getAll('opt-slot');
    const seen = new Set();
    const options = days.map((d, i) => ({ id: newId().slice(0, 6), day: d, slot: slots[i] }))
      .filter((o) => o.day && o.day >= todayKey() && !seen.has(`${o.day}_${o.slot}`) && seen.add(`${o.day}_${o.slot}`))
      .sort((a, b) => `${a.day}${a.slot}`.localeCompare(`${b.day}${b.slot}`));
    if (options.length < 2) return toast('Añade al menos dos fechas distintas para votar 🗳️');
    plan = { ...base, kind: 'poll', options, day: options[0].day, slot: options[0].slot };
  } else {
    const day = fd.get('day');
    if (!day || day < todayKey()) return toast('Elige un día a partir de hoy 📅');
    plan = { ...base, kind: 'fixed', day, slot: fd.get('slot'), going: { [state.memberId]: true } };
    if (fd.get('time')) plan.time = fd.get('time');
  }
  const id = await state.store.addPlan(state.groupId, plan);
  closeSheet();
  openPlan(id);
  toast(plan.kind === 'poll' ? '¡Votación creada! 🗳️ Que voten tus amigas' : '¡Plan propuesto! 🎉 Tus amigas ya pueden apuntarse');
}

// ── Fotos ──

async function uploadPhotos(files) {
  const list = [...files].filter((f) => f.type.startsWith('image/')).slice(0, 10);
  if (!list.length) return;
  toast(`Subiendo ${list.length} ${list.length === 1 ? 'foto' : 'fotos'}… 📤`);
  for (const f of list) {
    let full = await compressImage(f, 1280, 0.72);
    if (full.length > 900000) full = await compressImage(f, 1000, 0.6);
    const thumb = await compressImage(f, 360, 0.6);
    await state.store.addPhoto(state.groupId, state.planId, { by: state.memberId, thumb, full });
  }
  toast('¡Fotos subidas! 🥰');
}

async function openPhoto(photoId) {
  const ph = state.planExtras?.photos.find((x) => x.id === photoId);
  if (!ph) return;
  state.sheetKind = 'photo';
  const who = memberById(ph.by);
  sheet.innerHTML = `
    <div class="sheet-body photo-view">
      <div class="sheet-grab"></div>
      <img id="photo-full" src="${esc(ph.thumb)}" alt="">
      <p class="muted small">Subida por ${esc(who?.name || 'alguien')} · ${esc(msgTime(ph.at))}<br>Mantén pulsada la foto para guardarla en tu carrete.</p>
      <div class="sheet-actions">
        ${ph.by === state.memberId ? `<button class="btn danger" data-action="delete-photo" data-photo="${esc(ph.id)}">Borrar</button>` : ''}
        <button class="btn primary" data-close>Cerrar</button>
      </div>
    </div>`;
  sheet.showModal();
  const full = await state.store.getPhotoFull(state.groupId, state.planId, photoId).catch(() => null);
  const img = sheet.querySelector('#photo-full');
  if (full && img) img.src = full;
}

function downloadIcs(plan) {
  const blob = new Blob([buildIcs(plan, state.data.group.name)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${plan.title.replace(/[^\p{L}\p{N} ]/gu, '').trim() || 'plan'}.ics`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ───────────────────────── Grupo ─────────────────────────

function viewGrupo() {
  const { members } = state.data;
  const tk = todayKey();
  const code = state.groupId;
  return `
    <section class="card invite">
      <h2>Invita a tus amigas 💌</h2>
      <p class="muted">Mándales el enlace o diles este código:</p>
      <div class="code">${esc(code.slice(0, 4))} ${esc(code.slice(4))}</div>
      <div class="row">
        <button class="btn primary" data-action="share">Compartir</button>
        <button class="btn ghost" data-action="copy">Copiar enlace</button>
      </div>
    </section>

    ${!isStandalone() ? `
    <section class="card">
      <h2>📲 Instálala en tu iPhone</h2>
      <ol class="steps">
        <li>Abre esta página en <strong>Safari</strong>.</li>
        <li>Pulsa el botón <strong>Compartir</strong> <span class="ios-share">⬆︎</span>.</li>
        <li>Elige <strong>«Añadir a pantalla de inicio»</strong>.</li>
      </ol>
      <p class="muted small">La primera vez que la abras desde el icono, vuelve a entrar con el código y toca tu nombre para recuperar tus cosas.</p>
    </section>` : ''}

    <section class="card">
      <h2>En el grupo (${members.length})</h2>
      ${[...members].sort((a, b) => (a.id === state.memberId ? -1 : b.id === state.memberId ? 1 : a.name.localeCompare(b.name))).map((m) => {
        const n = Object.keys(m.free || {}).filter((k) => k >= tk).length;
        const dtb = daysToBirthday(m.birthday);
        return `<div class="member">${avatar(m, 'lg')}<div class="member-info"><strong>${esc(m.name)}</strong>${m.id === state.memberId ? ' <span class="muted">(tú)</span>' : ''}
          <div class="muted small">${n ? `📅 ${n} ${n === 1 ? 'franja marcada' : 'franjas marcadas'}` : 'Aún no ha marcado nada'}${m.birthday ? ` · 🎂 ${birthdayText(m.birthday)}${dtb === 0 ? ' ¡hoy!' : ''}` : ''}</div></div></div>`;
      }).join('')}
    </section>

    <section class="card">
      <h2>Opciones</h2>
      <button class="list-btn" data-action="profile"><span>👤 Mi perfil (nombre, color, cumple)</span><span class="chev">›</span></button>
      <button class="list-btn" data-action="switch-group"><span>👭 Mis grupos</span><span class="chev">›</span></button>
      <button class="list-btn" data-action="clear-mine"><span>🧹 Borrar todo lo que he marcado</span><span class="chev">›</span></button>
      <button class="list-btn danger" data-action="leave"><span>🚪 Salir de «${esc(state.data.group.name)}»</span><span class="chev">›</span></button>
    </section>
    ${isDemo ? `<p class="muted small center">Modo prueba 🧪: los datos solo están en este dispositivo.</p>` : ''}`;
}

function openProfileSheet() {
  state.sheetKind = 'profile';
  const m = me();
  const taken = new Set(state.data.members.filter((x) => x.id !== m.id).map((x) => x.color));
  sheet.innerHTML = `
    <form id="profile-form" class="sheet-body">
      <div class="sheet-grab"></div>
      <h2>Mi perfil ${avatar(m)}</h2>
      <label>Tu nombre<input name="name" required maxlength="30" value="${esc(m.name)}"></label>
      <fieldset><legend>Tu color</legend>${colorPicker('color', taken, m.color)}</fieldset>
      <fieldset><legend>Tu cumpleaños 🎂</legend>${birthdayInputs(m.birthday || '')}</fieldset>
      <div class="sheet-actions">
        <button type="button" class="btn ghost" data-close>Cancelar</button>
        <button type="submit" class="btn primary">Guardar</button>
      </div>
    </form>`;
  sheet.showModal();
}

function openGroupsSheet() {
  state.sheetKind = 'groups';
  const mine = getMemberships();
  sheet.innerHTML = `
    <div class="sheet-body">
      <div class="sheet-grab"></div>
      <h2>Mis grupos 👭</h2>
      ${mine.map((g) => `
        <button class="list-btn ${g.groupId === state.groupId ? 'current' : ''}" data-action="open-group" data-group="${esc(g.groupId)}">
          <span>${esc(g.groupName)}</span><span class="chev">${g.groupId === state.groupId ? '✓' : '›'}</span></button>`).join('')}
      <div class="sheet-actions">
        <button class="btn ghost" data-action="home">＋ Crear o unirme a otro</button>
        <button class="btn primary" data-close>Cerrar</button>
      </div>
    </div>`;
  sheet.showModal();
}

// ───────────────────────── Novedades (avisos dentro de la app) ─────────────────────────

function computeAvisos() {
  if (!state.data) return [];
  const { plans, members } = state.data;
  const items = [];
  const tk = todayKey();
  const tomorrow = dayKey(addDays(todayDate(), 1));
  const year = todayDate().getFullYear();

  for (const p of plans) {
    if (!planIsUpcoming(p)) continue;
    const who = memberById(p.createdBy);
    if (p.createdBy !== state.memberId) {
      items.push({
        id: `plan:${p.id}:${isPoll(p) ? 'poll' : 'fixed'}`, at: p.at || 0, icon: isPoll(p) ? '🗳️' : '🎉', plan: p.id,
        text: isPoll(p) ? `${who?.name || 'Alguien'} quiere que votéis la fecha de «${p.title}»` : `${who?.name || 'Alguien'} propone «${p.title}»`,
        sub: isPoll(p) ? 'Entra y vota las fechas que te vengan bien' : whenText(p.day, p.slot, p.time),
      });
    }
    if (!isPoll(p) && p.going?.[state.memberId] === true && (p.day === tk || p.day === tomorrow)) {
      items.push({
        id: `rem:${p.id}:${p.day}:${p.day === tk ? 0 : 1}`, at: Date.now(), icon: '⏰', plan: p.id, top: true,
        text: `${p.day === tk ? '¡Hoy' : 'Mañana'} tienes «${p.title}»${p.day === tk ? '!' : ''}`,
        sub: `${slotById(p.slot).emoji} ${p.time || slotById(p.slot).label}${p.place ? ` · 📍 ${p.place}` : ''}`,
      });
    }
  }
  for (const m of members) {
    const d = daysToBirthday(m.birthday);
    if (d === null || d > 7) continue;
    const self = m.id === state.memberId;
    if (d === 0) {
      items.push({ id: `bday:${m.id}:${year}:0`, at: Date.now(), icon: '🎂', top: true,
        text: self ? `¡Feliz cumpleaños, ${m.name}! 🥳` : `¡Hoy es el cumple de ${m.name}! 🥳`,
        sub: self ? 'Que lo celebres a lo grande 💛' : '¡No te olvides de felicitarle!' });
    } else if (!self) {
      const k = dayKey(addDays(todayDate(), d));
      items.push({ id: `bday:${m.id}:${year}:soon`, at: Date.now() - d * 1000, icon: '🎈',
        text: `El cumple de ${m.name} es ${d === 1 ? 'mañana' : `el ${weekdayName(k)}`}`,
        sub: `${birthdayText(m.birthday)} · ¿Le preparáis algo?` });
    }
  }
  return items.sort((a, b) => (b.top ? 1 : 0) - (a.top ? 1 : 0) || b.at - a.at);
}

const seenKey = () => `nosvemos.seen.${state.groupId}`;
const getSeen = () => new Set(LS.get(seenKey(), []));
const unreadAvisos = () => { const seen = getSeen(); return computeAvisos().filter((a) => !seen.has(a.id)); };

function openAvisosSheet() {
  state.sheetKind = 'avisos';
  const items = computeAvisos();
  const seen = getSeen();
  sheet.innerHTML = `
    <div class="sheet-body">
      <div class="sheet-grab"></div>
      <h2>Novedades 🔔</h2>
      ${items.length ? items.map((a) => `
        <button class="aviso ${seen.has(a.id) ? '' : 'unread'}" ${a.plan ? `data-action="open-plan" data-plan="${esc(a.plan)}"` : 'disabled'}>
          <span class="aviso-icon">${a.icon}</span>
          <span><strong>${esc(a.text)}</strong><span class="muted small">${esc(a.sub)}</span></span>
        </button>`).join('') : '<p class="muted">No hay nada nuevo por ahora 😌</p>'}
      <div class="sheet-actions"><button class="btn primary" data-close>Cerrar</button></div>
    </div>`;
  sheet.showModal();
  LS.set(seenKey(), [...new Set([...seen, ...items.map((a) => a.id)])].slice(-300));
  renderGroup();
}

// ───────────────────────── Hojas (diálogos) ─────────────────────────

function closeSheet() {
  if (state.sheetKind === 'day') saveDayNote();
  state.sheetKind = null;
  state.sheetDay = null;
  if (sheet.open) sheet.close();
}

function refreshSheet() {
  if (!sheet.open) return;
  if (state.sheetKind === 'day') renderDaySheetParts();
  if (state.sheetKind === 'plan') updateFreeHint();
}

// ───────────────────────── Acciones ─────────────────────────

async function share() {
  const link = inviteLink(state.groupId);
  const text = `¡Únete a «${state.data.group.name}» en ${APP_NAME} para organizarnos! 💛 Código: ${state.groupId}`;
  if (navigator.share) {
    try { await navigator.share({ title: APP_NAME, text, url: link }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  copy(link);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Enlace copiado 📋 ¡Pégalo en vuestro chat!'); } catch { prompt('Copia este enlace:', text); }
}

function onAction(b) {
  const s = state.store;
  const g = state.groupId;
  const plan = state.data?.plans.find((p) => p.id === (b.dataset.plan || state.planId));
  switch (b.dataset.action) {
    // navegación
    case 'tab':
      if (state.tab === b.dataset.tab && state.planId) closePlan();
      if (b.dataset.tab !== 'planes') closePlan();
      state.tab = b.dataset.tab;
      renderGroup();
      window.scrollTo({ top: 0 });
      break;
    case 'month':
      state.month = addMonths(state.month, Number(b.dataset.d));
      renderGroup();
      break;
    case 'plans-seg': state.plansSeg = b.dataset.seg; renderGroup(); break;
    case 'open-plan': openPlan(b.dataset.plan); break;
    case 'close-plan': closePlan(); renderGroup(); window.scrollTo({ top: 0 }); break;
    case 'open-group': {
      const m = getMemberships().find((x) => x.groupId === b.dataset.group);
      if (m) { closeSheet(); state.tab = 'cal'; openGroup(m); }
      break;
    }
    case 'home': closeSheet(); renderHome(); break;
    case 'claim': {
      const groupId = b.dataset.group;
      const memberId = b.dataset.member;
      busy(b, async () => {
        const group = await s.getGroup(groupId);
        addMembership({ groupId, memberId, groupName: group?.name || '' });
        state.tab = 'cal';
        openGroup({ groupId, memberId });
        toast('¡Hola de nuevo! 💛');
      });
      break;
    }

    // calendario
    case 'day': openDaySheet(b.dataset.day); break;
    case 'set-status': {
      const key = b.dataset.key;
      const current = statusOf(me(), key);
      const next = current === b.dataset.s ? null : b.dataset.s;
      if (navigator.vibrate) navigator.vibrate(8);
      busy(null, () => s.setStatus(g, state.memberId, key, next));
      break;
    }
    case 'day-all':
      busy(b, async () => { for (const sl of SLOTS) await s.setStatus(g, state.memberId, `${state.sheetDay}_${sl.id}`, 'y'); });
      break;

    // planes
    case 'new-plan': openPlanSheet({ key: b.dataset.key }); break;
    case 'new-poll': openPlanSheet({ keys: b.dataset.keys.split(','), poll: true }); break;
    case 'plan-mode': {
      const form = sheet.querySelector('#plan-form');
      const poll = b.dataset.mode === 'poll';
      form.mode.value = poll ? 'poll' : 'fixed';
      form.querySelector('.mode-fixed').hidden = poll;
      form.querySelector('.mode-poll').hidden = !poll;
      form.querySelectorAll('[data-action=plan-mode]').forEach((x) => x.classList.toggle('on', x === b));
      break;
    }
    case 'add-option': {
      const box = sheet.querySelector('#options');
      if (box.children.length >= 6) return toast('Máximo 6 fechas 🙂');
      const last = box.lastElementChild?.querySelector('[name=opt-day]')?.value || todayKey();
      box.insertAdjacentHTML('beforeend', optionRow(dayKey(addDays(parseDay(last), 1)), 't'));
      break;
    }
    case 'remove-option': {
      const box = sheet.querySelector('#options');
      if (box.children.length <= 2) return toast('Una votación necesita al menos dos fechas');
      b.closest('.option-row').remove();
      break;
    }
    case 'going': {
      const want = b.dataset.v === 'yes';
      const current = plan?.going?.[state.memberId];
      busy(b, () => s.setGoing(g, plan.id, state.memberId, current === want ? null : want));
      break;
    }
    case 'vote': {
      const mineV = new Set(plan.votes?.[state.memberId] || []);
      if (mineV.has(b.dataset.option)) mineV.delete(b.dataset.option); else mineV.add(b.dataset.option);
      busy(b, () => s.setVotes(g, plan.id, state.memberId, [...mineV]));
      break;
    }
    case 'choose-option': {
      const o = plan.options.find((x) => x.id === b.dataset.option);
      if (!o || !confirm(`¿Elegimos ${whenText(o.day, o.slot)}? Se avisará a todas 🎉`)) return;
      const going = {};
      for (const [mid, ids] of Object.entries(plan.votes || {})) if (ids.includes(o.id)) going[mid] = true;
      going[state.memberId] = true;
      busy(b, () => s.updatePlan(g, plan.id, { kind: 'fixed', day: o.day, slot: o.slot, going, at: Date.now() }));
      break;
    }
    case 'delete-plan':
      if (confirm('¿Borrar este plan para todas? 🗑️')) busy(b, async () => { const id = plan.id; closePlan(); await s.deletePlan(g, id); renderGroup(); });
      break;
    case 'ics': downloadIcs(plan); break;
    case 'open-photo': openPhoto(b.dataset.photo); break;
    case 'delete-photo':
      if (confirm('¿Borrar esta foto?')) {
        busy(b, async () => {
          const rest = state.planExtras.photos.filter((x) => x.id !== b.dataset.photo);
          await s.deletePhoto(g, state.planId, b.dataset.photo, rest[rest.length - 1]?.thumb || null);
          closeSheet();
        });
      }
      break;

    // grupo
    case 'share': share(); break;
    case 'copy': copy(inviteLink(g)); break;
    case 'profile': openProfileSheet(); break;
    case 'switch-group': openGroupsSheet(); break;
    case 'avisos': openAvisosSheet(); break;
    case 'clear-mine':
      if (confirm('¿Borrar todo lo que has marcado en el calendario?')) busy(b, () => s.updateMember(g, state.memberId, { free: {}, notes: {} }));
      break;
    case 'leave':
      if (confirm(`¿Seguro que quieres salir de «${state.data.group.name}»? Se borrará lo que has marcado.`)) {
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
}

function onSubmit(e) {
  const form = e.target;
  e.preventDefault();
  const btn = form.querySelector('[type=submit]');
  switch (form.id) {
    case 'create-form': busy(btn, () => handleCreate(form)); break;
    case 'join-form': busy(btn, () => handleJoinCode(new FormData(form).get('code'))); break;
    case 'join-new-form': busy(btn, () => handleJoinNew(form)); break;
    case 'plan-form': busy(btn, () => submitPlan(form)); break;
    case 'chat-form': {
      const input = form.querySelector('input[name=text]');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      busy(null, () => state.store.addMessage(state.groupId, state.planId, { by: state.memberId, text }));
      break;
    }
    case 'profile-form': {
      const fd = new FormData(form);
      const name = fd.get('name').trim();
      const color = fd.get('color');
      if (!name) return;
      if (state.data.members.some((m) => m.id !== state.memberId && m.color === color)) return toast('Ese color ya lo tiene otra persona 🎨');
      busy(btn, async () => {
        await state.store.updateMember(state.groupId, state.memberId, { name, color, birthday: readBirthday(fd) });
        closeSheet();
        toast('¡Perfil guardado! ✨');
      });
      break;
    }
  }
}

for (const root of [app, sheet]) {
  root.addEventListener('click', (e) => {
    if (root === sheet && (e.target === sheet || e.target.closest('[data-close]'))) return closeSheet();
    const b = e.target.closest('[data-action]');
    if (b && !b.disabled) onAction(b);
  });
  root.addEventListener('submit', onSubmit);
}
app.addEventListener('change', (e) => {
  if (e.target.matches('[data-action-change=upload-photos]')) {
    const files = e.target.files;
    busy(null, () => uploadPhotos(files)).finally(() => { e.target.value = ''; });
  }
});
sheet.addEventListener('change', (e) => {
  if (e.target.id === 'day-note') saveDayNote();
  else updateFreeHint();
});
sheet.addEventListener('close', () => {
  if (state.sheetKind === 'day') saveDayNote();
  state.sheetKind = null;
});

// Al volver a la app (por ejemplo al día siguiente) se recalcula "hoy".
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.data) renderGroup();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

boot();
