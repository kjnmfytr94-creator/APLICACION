// Guía de bienvenida: tarjetas que explican cómo funciona la app.
// Se pasa con «Siguiente», con las flechas del teclado o deslizando el dedo.

const SEEN_KEY = 'nosvemos.tour.v1';

export const tourSeen = () => { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; } };
const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* da igual */ } };

const ua = navigator.userAgent;
const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/.test(ua);
export const isStandalone = () => window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

// Icono de «Compartir» del iPhone (cuadrado con flecha hacia arriba)
const SHARE_ICON = `<svg class="share-svg" viewBox="0 0 24 24" aria-label="Compartir" role="img"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 17.5 10H16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

function installHtml() {
  const ios = `
    <ol class="tour-steps">
      <li>Abre esta página en <strong>Safari</strong> 🧭. Si la abriste desde WhatsApp o Instagram, toca <strong>«Abrir en Safari»</strong> (o los <strong>···</strong> → «Abrir en el navegador»).</li>
      <li>Toca el botón <strong>Compartir</strong> <span class="share-chip">${SHARE_ICON}</span>, en la barra de abajo (en algunos iPhone, arriba a la derecha o dentro de <strong>···</strong>).</li>
      <li>Baja y toca <strong>«Añadir a pantalla de inicio»</strong> ➕. Si no aparece, toca <strong>«Ver más»</strong> o <strong>«Editar acciones»</strong>.</li>
      <li>Si sale <strong>«Abrir como app web»</strong>, déjalo <strong>activado</strong>. Toca <strong>«Añadir»</strong>.</li>
      <li>¡Listo! Abre siempre la app desde el icono <strong>Nos vemos</strong> 📅💛.</li>
    </ol>`;
  const android = `
    <ol class="tour-steps">
      <li>Abre esta página en <strong>Chrome</strong>.</li>
      <li>Toca los <strong>⋮</strong> de arriba a la derecha.</li>
      <li>Toca <strong>«Añadir a pantalla de inicio»</strong> o <strong>«Instalar aplicación»</strong> y confirma.</li>
      <li>¡Listo! Abre siempre la app desde el icono <strong>Nos vemos</strong> 📅💛.</li>
    </ol>`;
  const tip = `<p class="tour-tip">💡 Hazlo cuando ya estés dentro de tu grupo: así el icono lo recordará y entrarás directa.</p>`;
  if (isAndroid) return android + tip;
  if (isIOS) return ios + tip;
  return `<p><strong>En iPhone:</strong></p>${ios}<p><strong>En Android:</strong></p>${android}${tip}`;
}

function steps() {
  const list = [
    {
      id: 'welcome',
      art: `<img src="icons/icon-192.png" alt="" class="tour-icon">`,
      title: '¡Bienvenida a Nos vemos! 💛',
      html: `<p>Aquí cada una marca cuándo puede y la app os dice <strong>cuándo coincidís para quedar</strong>.</p>
             <p>Te enseño en un minuto cómo funciona todo 👇</p>`,
    },
    {
      id: 'install',
      skipIf: isStandalone,
      art: `<div class="mock-phone"><div class="mock-bar">${SHARE_ICON}</div>
              <div class="mock-menu"><span>Copiar</span><span class="hl">➕ Añadir a pantalla de inicio</span><span>Añadir a favoritos</span></div></div>`,
      title: '📲 Ponla en tu pantalla de inicio',
      html: `<p>Así la tendrás como una app más, a un toque:</p>${installHtml()}`,
    },
    {
      id: 'calendar',
      art: `<div class="mock-col">
              <div class="mock-label">☀️ Mañana</div>
              <div class="seg mock-seg"><span class="seg-btn yes on">✅ Libre</span><span class="seg-btn maybe">🤔 Quizás</span><span class="seg-btn no">🙅 No puedo</span></div>
              <div class="mock-label">🌙 Noche</div>
              <div class="seg mock-seg"><span class="seg-btn yes">✅ Libre</span><span class="seg-btn maybe on">🤔 Quizás</span><span class="seg-btn no">🙅 No puedo</span></div>
            </div>`,
      title: '📅 Marca cuándo puedes',
      html: `<p>En la pestaña <strong>📅 Calendario</strong>, <strong>toca un día</strong>.</p>
             <p>Para la <strong>mañana ☀️</strong>, la <strong>tarde 🌤️</strong> y la <strong>noche 🌙</strong> elige:</p>
             <p class="tour-chips"><span>✅ Libre</span><span>🤔 Quizás</span><span>🙅 No puedo</span></p>
             <p>¿Te has equivocado? Toca otra vez para quitarlo. Con <strong>«✅ Todo el día»</strong> marcas las tres de golpe.</p>`,
    },
    {
      id: 'shift',
      art: `<div class="mock-col">
              <div class="shift-box mock-shift"><div class="shift-head"><strong>💼 Turno de trabajo</strong></div>
                <div class="shift-chips"><span class="shift-chip on">✓ Mañana</span><span class="shift-chip">🌤️ Tarde</span><span class="shift-chip">🌙 Noche</span></div></div>
              <div class="mock-input">📝 Solo hasta las 19h</div>
            </div>`,
      title: '💼 Turnos y notas',
      html: `<p>En ese mismo día puedes marcar tu <strong>turno de trabajo</strong>: mañana, tarde y/o noche (puedes elegir varios). Esas franjas se ponen solas en <strong>«No puedo»</strong>.</p>
             <p>En <strong>📝 Nota</strong> puedes escribir algo como <em>«solo hasta las 19h»</em> o <em>«estoy fuera»</em>. Lo verán todas.</p>`,
    },
    {
      id: 'all',
      art: `<div class="mock-col">
              <div class="segmented mock-segmented"><span class="on">👭 Todas</span><span>👤 Solo yo</span></div>
              <div class="mock-cells">
                <div class="mock-cell"><b>12</b>${[['#c0583f', 'yes', 'yes', 'no'], ['#8a6fb0', 'shift', 'shift', 'yes'], ['#2f7f7a', 'maybe', 'yes', 'yes']].map(([c, ...b]) => `<span class="prow"><i class="pdot" style="--c:${c}"></i>${b.map((x) => `<i class="pbar ${x}"></i>`).join('')}</span>`).join('')}</div>
                <div class="mock-cell all-sure"><b>13</b>${[['#c0583f', 'yes', 'yes', 'yes'], ['#8a6fb0', 'no', 'yes', 'yes'], ['#2f7f7a', '', 'yes', 'maybe']].map(([c, ...b]) => `<span class="prow"><i class="pdot" style="--c:${c}"></i>${b.map((x) => `<i class="pbar ${x}"></i>`).join('')}</span>`).join('')}</div>
              </div>
            </div>`,
      title: '👭 Mira cómo lo tiene cada una',
      html: `<p>Arriba del calendario elige <strong>👭 Todas</strong> o <strong>👤 Solo yo</strong>.</p>
             <p>En <strong>«Todas»</strong> cada día tiene <strong>una fila por persona</strong> (con su color) y tres rayitas: mañana, tarde y noche.</p>
             <p class="tour-legend"><span><i class="dot yes"></i> libre</span><span><i class="dot maybe"></i> quizás</span><span><i class="dot no"></i> no puede</span><span><i class="dot shift"></i> turno</span><span><i class="dot unset"></i> sin marcar</span></p>
             <p>Los días con <strong>borde verde ✨</strong> podéis todas. Toca un día para ver el cuadro <strong>«Cómo lo tenéis»</strong> con el detalle y las notas.</p>`,
    },
    {
      id: 'calendars',
      art: `<div class="mock-col mock-list"><span>➕ Añadir un evento</span><span>🗓️ Conectar Google Calendar</span><span>🔄 Conectar Shifter</span></div>`,
      title: '📆 Trae tus calendarios',
      html: `<p>Toca <strong>«📆 Mis calendarios»</strong>, arriba del calendario:</p>
             <ul class="tour-list">
               <li><strong>➕ Añadir un evento</strong>: médico, clases, un viaje… También los que se repiten cada semana.</li>
               <li><strong>🗓️ Conectar Google Calendar</strong>: tus eventos marcan solos cuándo estás ocupada, y puedes enseñar qué son.</li>
               <li><strong>🔄 Shifter</strong>: exporta tus turnos a Google Calendar desde Shifter y conecta Google aquí.</li>
             </ul>
             <p>Si tu calendario cambia, pulsa <strong>«Sincronizar»</strong>. ¿Usas el calendario de Apple? Pásalo a Google Calendar (en «Mis calendarios» te explicamos cómo).</p>`,
    },
    {
      id: 'privacy',
      art: `<div class="mock-col">
              <div class="day-items mock-items"><div class="di-title">📋 Lo que tiene cada una</div>
                <div class="di-item"><span class="di-icon">📆</span><span class="di-text"><span class="di-time">18:00–20:00</span> Clase de inglés</span><span class="mode-chips"><span class="mode-chip on">👁️</span><span class="mode-chip">🔒</span><span class="mode-chip">🚫</span></span></div>
                <div class="di-item private"><span class="di-icon">📆</span><span class="di-text"><span class="di-time">10:00–11:00</span> Médico</span><span class="mode-chips"><span class="mode-chip">👁️</span><span class="mode-chip on">🔒</span><span class="mode-chip">🚫</span></span></div>
              </div></div>`,
      title: '👁️ Tú decides qué se ve',
      html: `<p>Al tocar un día, en <strong>«📋 Lo que tiene cada una»</strong> verás los eventos que tus amigas han querido compartir, tal cual: <em>«📆 18:00–20:00 Clase de inglés»</em>.</p>
             <p>De cada cosa tuya eliges qué ven las demás:</p>
             <ul class="tour-list">
               <li><strong>👁️ Ver</strong>: ven qué es y la hora.</li>
               <li><strong>🔒 Solo ocupada</strong>: solo ven que esa franja no puedes.</li>
               <li><strong>🚫 No compartir</strong>: ni siquiera cuenta como ocupada (solo en eventos de Google).</li>
             </ul>
             <p>Puedes elegirlo <strong>por calendario</strong> al conectar Google, <strong>evento a evento</strong> en «Mis calendarios → Google → 👁️ Elegir qué se ve», o desde el propio día. En los eventos que añades a mano, marca o desmarca <strong>«👁️ Que mis amigas vean qué es»</strong>.</p>`,
    },
    {
      id: 'quedar',
      art: `<div class="mock-col"><div class="match sure mock-match"><div class="match-when"><span class="match-day">Sáb, 12 dic</span><span class="match-slot">🌙 Noche</span></div><span class="btn small primary">Proponer plan</span>
              <div class="match-who"><span class="muted small">¡Podéis todas seguro! 🎉</span></div></div></div>`,
      title: '✨ Encuentra cuándo quedar',
      html: `<p>En la pestaña <strong>✨ Quedar</strong> salen los <strong>mejores momentos</strong>:</p>
             <ul class="tour-list">
               <li>✨ primero, cuando <strong>podéis todas seguro</strong>;</li>
               <li>🤔 luego, cuando podéis todas con algún «quizás»;</li>
               <li>👀 y después, los que casi (y quién falta).</li>
             </ul>
             <p>Toca <strong>«Proponer plan»</strong>, o <strong>«🗳️ Votar entre las mejores fechas»</strong> para que decidáis entre todas.</p>`,
    },
    {
      id: 'planes',
      art: `<div class="mock-col mock-list"><span>✅ Me apunto · 🙅 No puedo</span><span>🗳️ Votar la fecha</span><span>💬 Chat · 📸 Fotos</span><span>📅 Añadir a mi calendario</span></div>`,
      title: '🎉 Planes, chat y fotos',
      html: `<p>En la pestaña <strong>🎉 Planes</strong> están todos los planes. Entra en uno para:</p>
             <ul class="tour-list">
               <li><strong>✅ Me apunto</strong> o <strong>🙅 No puedo</strong>;</li>
               <li><strong>🗳️ votar</strong> las fechas que te vienen bien (si es una votación);</li>
               <li><strong>💬 chatear</strong> («¿a qué hora?», «¡reservo yo!»);</li>
               <li><strong>📸 subir fotos</strong> y <strong>📅 añadirlo al calendario</strong> de tu móvil.</li>
             </ul>
             <p>Cuando pasa un plan, sus fotos quedan guardadas en <strong>«Recuerdos 📸»</strong>.</p>`,
    },
    {
      id: 'group',
      art: `<div class="mock-col mock-top"><span class="mock-bell">🔔<i>2</i></span><span class="mock-q">?</span><span class="avatar" style="--c:#8e3b5c">A</span></div>`,
      title: '🔔 Novedades y tu grupo',
      html: `<p>La <strong>🔔</strong> de arriba te avisa de <strong>planes nuevos</strong>, <strong>votaciones</strong>, <strong>recordatorios</strong> de tus planes y <strong>cumpleaños 🎂</strong>. Mírala de vez en cuando: los avisos se ven al abrir la app.</p>
             <p>En la pestaña <strong>👭 Grupo</strong> puedes <strong>invitar</strong> a más amigas y cambiar tu nombre, color o cumpleaños. Si tocas el <strong>nombre del grupo</strong> (arriba), cambias entre tus grupos.</p>`,
    },
    {
      id: 'done',
      art: `<div class="tour-big">🥳</div>`,
      title: '¡Ya lo sabes todo!',
      html: `<p>Empieza marcando cuándo puedes estas próximas semanas, y que lo hagan también tus amigas 💛</p>
             <p>Si alguna vez tienes dudas, toca el botón <strong class="q-inline">?</strong> de arriba y verás esta guía otra vez.</p>`,
    },
  ];
  return list.filter((s) => !s.skipIf?.());
}

let dlg;
let current = 0;
let list = [];
let onDone = null;

function render() {
  const s = list[current];
  const last = current === list.length - 1;
  dlg.innerHTML = `
    <div class="tour-card" role="document">
      <div class="tour-top">
        <span class="tour-count">${current + 1} / ${list.length}</span>
        ${last ? '' : '<button class="tour-skip" data-tour="close">Saltar</button>'}
      </div>
      <div class="tour-art" aria-hidden="true">${s.art}</div>
      <div class="tour-body">
        <h2>${s.title}</h2>
        <div class="tour-text">${s.html}</div>
      </div>
      <div class="tour-dots">${list.map((_, i) => `<button class="tour-dot ${i === current ? 'on' : ''}" data-tour="go" data-i="${i}" aria-label="Paso ${i + 1}"></button>`).join('')}</div>
      <div class="tour-actions">
        ${current > 0 ? '<button class="btn ghost" data-tour="prev">‹ Atrás</button>' : ''}
        <button class="btn primary" data-tour="${last ? 'close' : 'next'}">${last ? '¡Empezar! 🎉' : 'Siguiente ›'}</button>
      </div>
    </div>`;
  dlg.querySelector('.tour-body').scrollTop = 0;
}

function go(i) {
  current = Math.max(0, Math.min(list.length - 1, i));
  render();
}

function close() {
  markSeen();
  if (dlg?.open) dlg.close();
}

function ensureDialog() {
  if (dlg) return;
  dlg = document.createElement('dialog');
  dlg.className = 'tour';
  dlg.setAttribute('aria-label', 'Cómo funciona Nos vemos');
  document.body.append(dlg);
  dlg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tour]');
    if (!b) return;
    const a = b.dataset.tour;
    if (a === 'next') go(current + 1);
    else if (a === 'prev') go(current - 1);
    else if (a === 'go') go(Number(b.dataset.i));
    else if (a === 'close') close();
  });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') go(current + 1);
    if (e.key === 'ArrowLeft') go(current - 1);
  });
  let x0 = null;
  let y0 = null;
  dlg.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  dlg.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(current + (dx < 0 ? 1 : -1));
    x0 = null;
  });
  dlg.addEventListener('close', () => {
    markSeen();
    const fn = onDone;
    onDone = null;
    if (fn) fn();
  });
}

/** Abre la guía. `startId` empieza en un paso concreto (p. ej. 'install'); `then` se llama al cerrarla. */
export function openTour({ startId = null, then = null } = {}) {
  ensureDialog();
  list = steps();
  onDone = then;
  const idx = startId ? list.findIndex((s) => s.id === startId) : 0;
  current = idx >= 0 ? idx : 0;
  render();
  if (!dlg.open) dlg.showModal();
}
