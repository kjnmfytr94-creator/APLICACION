// Capa de datos. Hay dos versiones con la misma interfaz:
//  - Firebase (Firestore): los datos se comparten entre todas las amigas.
//  - Local (modo prueba): los datos se quedan en este dispositivo.
//
// Estructura:
//  groups/{grupo}                      { name }
//  groups/{grupo}/members/{persona}    { name, color, birthday 'MM-DD', free { 'AAAA-MM-DD_t': 'y'|'m'|'n' }, notes { 'AAAA-MM-DD': texto } }
//  groups/{grupo}/plans/{plan}         { title, kind 'fixed'|'poll', day, slot, time, place, options[], votes{}, going{}, createdBy, at, msgCount, photoCount, cover }
//  groups/{grupo}/plans/{plan}/messages/{id}   { by, text, at }
//  groups/{grupo}/plans/{plan}/photos/{id}     { by, at, thumb }
//  groups/{grupo}/plans/{plan}/photoFull/{id}  { data }

import { firebaseConfig } from './config.js';
import { dayKey, todayDate, addDays } from './util.js';

export const isDemo = !firebaseConfig || !firebaseConfig.apiKey;

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Código de grupo de 8 caracteres, fácil de dictar (sin 0/O ni 1/I/L). */
export function newCode(len = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
export const newId = () => newCode(16).toLowerCase();

export async function createStore() {
  return isDemo ? createLocalStore() : createFirebaseStore();
}

const byAt = (a, b) => (a.at || 0) - (b.at || 0);

// ───────────────────────── Firebase ─────────────────────────

const FIREBASE_VERSION = '10.12.2';

async function createFirebaseStore() {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const [{ initializeApp }, authMod, fs] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`),
  ]);

  const app = initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app);
  await auth.authStateReady();
  if (!auth.currentUser) await authMod.signInAnonymously(auth);

  const db = fs.getFirestore(app);
  const groupRef = (g) => fs.doc(db, 'groups', g);
  const memberRef = (g, m) => fs.doc(db, 'groups', g, 'members', m);
  const planRef = (g, p) => fs.doc(db, 'groups', g, 'plans', p);
  const sub = (g, p, name) => fs.collection(db, 'groups', g, 'plans', p, name);
  const list = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const del = (v) => (v === null || v === undefined || v === '' ? fs.deleteField() : v);

  return {
    async createGroup(name) {
      const id = newCode();
      await fs.setDoc(groupRef(id), { name, at: Date.now() });
      return id;
    },
    async getGroup(id) {
      const snap = await fs.getDoc(groupRef(id));
      return snap.exists() ? { id, ...snap.data() } : null;
    },
    async getMembers(g) {
      return list(await fs.getDocs(fs.collection(db, 'groups', g, 'members')));
    },
    async addMember(g, { name, color, birthday }) {
      const id = newId();
      const data = { name, color, free: {}, notes: {}, at: Date.now() };
      if (birthday) data.birthday = birthday;
      await fs.setDoc(memberRef(g, id), data);
      return id;
    },
    async updateMember(g, m, patch) {
      const p = { ...patch };
      if ('birthday' in p) p.birthday = del(p.birthday);
      await fs.updateDoc(memberRef(g, m), p);
    },
    async removeMember(g, m) {
      await fs.deleteDoc(memberRef(g, m));
    },
    async setStatus(g, m, key, status) {
      await fs.updateDoc(memberRef(g, m), new fs.FieldPath('free', key), del(status));
    },
    async setNote(g, m, day, text) {
      await fs.updateDoc(memberRef(g, m), new fs.FieldPath('notes', day), del(text));
    },

    async addPlan(g, plan) {
      const id = newId();
      await fs.setDoc(planRef(g, id), { ...plan, at: Date.now(), msgCount: 0, photoCount: 0 });
      return id;
    },
    async updatePlan(g, p, patch) {
      await fs.updateDoc(planRef(g, p), patch);
    },
    async setGoing(g, p, m, value) {
      await fs.updateDoc(planRef(g, p), new fs.FieldPath('going', m), del(value));
    },
    async setVotes(g, p, m, optionIds) {
      await fs.updateDoc(planRef(g, p), new fs.FieldPath('votes', m), optionIds.length ? optionIds : fs.deleteField());
    },
    async deletePlan(g, p) {
      await fs.deleteDoc(planRef(g, p));
    },

    async addMessage(g, p, msg) {
      await fs.addDoc(sub(g, p, 'messages'), { ...msg, at: Date.now() });
      await fs.updateDoc(planRef(g, p), { msgCount: fs.increment(1), lastMsgAt: Date.now() });
    },
    async addPhoto(g, p, { by, thumb, full }) {
      const id = newId();
      await fs.setDoc(fs.doc(sub(g, p, 'photoFull'), id), { data: full });
      await fs.setDoc(fs.doc(sub(g, p, 'photos'), id), { by, thumb, at: Date.now() });
      await fs.updateDoc(planRef(g, p), { photoCount: fs.increment(1), cover: thumb });
    },
    async getPhotoFull(g, p, id) {
      const snap = await fs.getDoc(fs.doc(sub(g, p, 'photoFull'), id));
      return snap.exists() ? snap.data().data : null;
    },
    async deletePhoto(g, p, id, newCover) {
      await fs.deleteDoc(fs.doc(sub(g, p, 'photos'), id));
      await fs.deleteDoc(fs.doc(sub(g, p, 'photoFull'), id));
      await fs.updateDoc(planRef(g, p), { photoCount: fs.increment(-1), cover: newCover || fs.deleteField() });
    },

    subscribe(g, onData, onError) {
      let group, members, plans;
      const emit = () => { if (group !== undefined && members && plans) onData({ group, members, plans }); };
      const unsubs = [
        fs.onSnapshot(groupRef(g), (s) => { group = s.exists() ? { id: g, ...s.data() } : null; emit(); }, onError),
        fs.onSnapshot(fs.collection(db, 'groups', g, 'members'), (s) => { members = list(s); emit(); }, onError),
        fs.onSnapshot(fs.collection(db, 'groups', g, 'plans'), (s) => { plans = list(s); emit(); }, onError),
      ];
      return () => unsubs.forEach((u) => u());
    },
    subscribePlan(g, p, onData, onError) {
      let messages, photos;
      const emit = () => { if (messages && photos) onData({ messages, photos }); };
      const unsubs = [
        fs.onSnapshot(sub(g, p, 'messages'), (s) => { messages = list(s).sort(byAt); emit(); }, onError),
        fs.onSnapshot(sub(g, p, 'photos'), (s) => { photos = list(s).sort(byAt); emit(); }, onError),
      ];
      return () => unsubs.forEach((u) => u());
    },
  };
}

// ─────────────────────── Local (modo prueba) ───────────────────────

const LOCAL_KEY = 'nosvemos.demo.db';

function createLocalStore() {
  const read = () => {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || { groups: {} }; } catch { return { groups: {} }; }
  };
  let mem = read();
  const listeners = new Set();

  const commit = () => {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(mem));
    } catch (e) {
      mem = read(); // deshacer
      throw new Error('En modo prueba no cabe más en este dispositivo.');
    } finally {
      listeners.forEach((fn) => fn());
    }
  };
  window.addEventListener('storage', (e) => {
    if (e.key === LOCAL_KEY) { mem = read(); listeners.forEach((fn) => fn()); }
  });

  const group = (id) => {
    const g = mem.groups[id];
    if (!g) throw new Error('Grupo no encontrado');
    g.extras = g.extras || {};
    return g;
  };
  const extras = (g, p) => {
    const gr = group(g);
    gr.extras[p] = gr.extras[p] || { messages: {}, photos: {}, full: {} };
    return gr.extras[p];
  };
  const setOrDelete = (obj, k, v) => { if (v === null || v === undefined || v === '') delete obj[k]; else obj[k] = v; };
  const entries = (obj) => Object.entries(obj || {}).map(([id, v]) => ({ id, ...v }));

  return {
    async createGroup(name) {
      const id = newCode();
      mem.groups[id] = { name, at: Date.now(), members: {}, plans: {}, extras: {} };
      seedDemo(mem.groups[id]);
      commit();
      return id;
    },
    async getGroup(id) {
      const g = mem.groups[id];
      return g ? { id, name: g.name } : null;
    },
    async getMembers(g) {
      return structuredClone(entries(group(g).members));
    },
    async addMember(g, { name, color, birthday }) {
      const id = newId();
      group(g).members[id] = { name, color, free: {}, notes: {}, at: Date.now(), ...(birthday ? { birthday } : {}) };
      commit();
      return id;
    },
    async updateMember(g, m, patch) {
      const mem_ = group(g).members[m];
      for (const [k, v] of Object.entries(patch)) setOrDelete(mem_, k, v);
      commit();
    },
    async removeMember(g, m) {
      delete group(g).members[m];
      commit();
    },
    async setStatus(g, m, key, status) {
      const mm = group(g).members[m];
      mm.free = mm.free || {};
      setOrDelete(mm.free, key, status);
      commit();
    },
    async setNote(g, m, day, text) {
      const mm = group(g).members[m];
      mm.notes = mm.notes || {};
      setOrDelete(mm.notes, day, text);
      commit();
    },

    async addPlan(g, plan) {
      const id = newId();
      group(g).plans[id] = { ...structuredClone(plan), at: Date.now(), msgCount: 0, photoCount: 0 };
      commit();
      return id;
    },
    async updatePlan(g, p, patch) {
      Object.assign(group(g).plans[p], structuredClone(patch));
      commit();
    },
    async setGoing(g, p, m, value) {
      const plan = group(g).plans[p];
      plan.going = plan.going || {};
      setOrDelete(plan.going, m, value);
      commit();
    },
    async setVotes(g, p, m, optionIds) {
      const plan = group(g).plans[p];
      plan.votes = plan.votes || {};
      setOrDelete(plan.votes, m, optionIds.length ? optionIds : null);
      commit();
    },
    async deletePlan(g, p) {
      delete group(g).plans[p];
      delete group(g).extras[p];
      commit();
    },

    async addMessage(g, p, msg) {
      extras(g, p).messages[newId()] = { ...msg, at: Date.now() };
      const plan = group(g).plans[p];
      plan.msgCount = (plan.msgCount || 0) + 1;
      plan.lastMsgAt = Date.now();
      commit();
    },
    async addPhoto(g, p, { by, thumb, full }) {
      const id = newId();
      const ex = extras(g, p);
      ex.photos[id] = { by, thumb, at: Date.now() };
      ex.full[id] = full;
      const plan = group(g).plans[p];
      plan.photoCount = (plan.photoCount || 0) + 1;
      plan.cover = thumb;
      commit();
    },
    async getPhotoFull(g, p, id) {
      return extras(g, p).full[id] || null;
    },
    async deletePhoto(g, p, id, newCover) {
      const ex = extras(g, p);
      delete ex.photos[id];
      delete ex.full[id];
      const plan = group(g).plans[p];
      plan.photoCount = Math.max(0, (plan.photoCount || 1) - 1);
      setOrDelete(plan, 'cover', newCover);
      commit();
    },

    subscribe(g, onData) {
      const fire = () => {
        const gr = mem.groups[g];
        if (!gr) return onData({ group: null, members: [], plans: [] });
        onData(structuredClone({ group: { id: g, name: gr.name }, members: entries(gr.members), plans: entries(gr.plans) }));
      };
      listeners.add(fire);
      queueMicrotask(fire);
      return () => listeners.delete(fire);
    },
    subscribePlan(g, p, onData) {
      const fire = () => {
        const ex = mem.groups[g]?.extras?.[p] || { messages: {}, photos: {} };
        onData(structuredClone({ messages: entries(ex.messages).sort(byAt), photos: entries(ex.photos).sort(byAt) }));
      };
      listeners.add(fire);
      queueMicrotask(fire);
      return () => listeners.delete(fire);
    },
  };
}

/** En modo prueba añadimos dos amigas inventadas, con huecos, cumples y un plan. */
function seedDemo(g) {
  const t = todayDate();
  const friends = [
    { name: 'Lucía', color: '#8a6fb0', birthday: dayKey(addDays(t, 3)).slice(5) },
    { name: 'Marta', color: '#2f7f7a', birthday: '07-14' },
  ];
  const ids = [];
  for (const f of friends) {
    const free = {};
    const notes = {};
    for (let i = 0; i < 60; i++) {
      const d = addDays(t, i);
      const wd = d.getDay();
      const weekend = wd === 0 || wd === 5 || wd === 6;
      const k = dayKey(d);
      for (const s of ['m', 't', 'n']) {
        const r = Math.random();
        if (r < (weekend ? 0.5 : 0.25)) free[`${k}_${s}`] = 'y';
        else if (r < (weekend ? 0.7 : 0.4)) free[`${k}_${s}`] = 'm';
        else if (r < 0.6) free[`${k}_${s}`] = 'n';
      }
    }
    notes[dayKey(addDays(t, 2))] = f.name === 'Lucía' ? 'Solo hasta las 19h' : 'Estoy en Valencia';
    const id = newId();
    ids.push(id);
    g.members[id] = { ...f, free, notes, at: Date.now(), demo: true };
  }
  const o = (n, s) => ({ id: newId().slice(0, 6), day: dayKey(addDays(t, n)), slot: s });
  const options = [o(5, 'n'), o(6, 't'), o(9, 'n')];
  g.plans[newId()] = {
    title: 'Cena de Navidad 🎄', kind: 'poll', options, day: options[0].day, slot: options[0].slot,
    place: 'Por decidir', createdBy: ids[0], votes: { [ids[0]]: [options[0].id, options[1].id], [ids[1]]: [options[0].id] },
    going: {}, at: Date.now() - 3600e3, msgCount: 0, photoCount: 0,
  };
}
