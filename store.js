// Capa de datos. Hay dos versiones con la misma interfaz:
//  - Firebase (Firestore): los datos se comparten entre todas las amigas.
//  - Local (modo prueba): los datos se quedan en este dispositivo.

import { firebaseConfig } from './config.js';

export const isDemo = !firebaseConfig || !firebaseConfig.apiKey;

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Código de grupo de 8 caracteres, fácil de dictar (sin 0/O ni 1/I/L). */
export function newCode(len = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

function newId() {
  return newCode(16).toLowerCase();
}

export async function createStore() {
  return isDemo ? createLocalStore() : createFirebaseStore();
}

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
  const list = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return {
    async createGroup(name) {
      const id = newCode();
      await fs.setDoc(groupRef(id), { name, createdAt: fs.serverTimestamp() });
      return id;
    },
    async getGroup(id) {
      const snap = await fs.getDoc(groupRef(id));
      return snap.exists() ? { id, ...snap.data() } : null;
    },
    async getMembers(groupId) {
      return list(await fs.getDocs(fs.collection(db, 'groups', groupId, 'members')));
    },
    async addMember(groupId, { name, color }) {
      const id = newId();
      await fs.setDoc(memberRef(groupId, id), { name, color, free: {}, joinedAt: fs.serverTimestamp() });
      return id;
    },
    async updateMember(groupId, memberId, patch) {
      await fs.updateDoc(memberRef(groupId, memberId), patch);
    },
    async removeMember(groupId, memberId) {
      await fs.deleteDoc(memberRef(groupId, memberId));
    },
    async setFree(groupId, memberId, key, free) {
      await fs.updateDoc(memberRef(groupId, memberId), new fs.FieldPath('free', key), free ? true : fs.deleteField());
    },
    async addPlan(groupId, plan) {
      const id = newId();
      await fs.setDoc(planRef(groupId, id), { ...plan, createdAt: fs.serverTimestamp() });
      return id;
    },
    async setGoing(groupId, planId, memberId, value) {
      await fs.updateDoc(planRef(groupId, planId), new fs.FieldPath('going', memberId), value === null ? fs.deleteField() : value);
    },
    async deletePlan(groupId, planId) {
      await fs.deleteDoc(planRef(groupId, planId));
    },
    subscribe(groupId, onData, onError) {
      let group, members, plans;
      const emit = () => {
        if (group !== undefined && members && plans) onData({ group, members, plans });
      };
      const unsubs = [
        fs.onSnapshot(groupRef(groupId), (s) => { group = s.exists() ? { id: groupId, ...s.data() } : null; emit(); }, onError),
        fs.onSnapshot(fs.collection(db, 'groups', groupId, 'members'), (s) => { members = list(s); emit(); }, onError),
        fs.onSnapshot(fs.collection(db, 'groups', groupId, 'plans'), (s) => { plans = list(s); emit(); }, onError),
      ];
      return () => unsubs.forEach((u) => u());
    },
  };
}

// ─────────────────────── Local (modo prueba) ───────────────────────

const LOCAL_KEY = 'quedamos.demo.db';

function createLocalStore() {
  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY)) || { groups: {} };
    } catch {
      return { groups: {} };
    }
  };
  let mem = read();
  const listeners = new Set();

  const commit = () => {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(mem)); } catch { /* sin almacenamiento: solo en memoria */ }
    listeners.forEach((fn) => fn());
  };
  window.addEventListener('storage', (e) => {
    if (e.key === LOCAL_KEY) { mem = read(); listeners.forEach((fn) => fn()); }
  });

  const group = (id) => {
    const g = mem.groups[id];
    if (!g) throw new Error('Grupo no encontrado');
    return g;
  };

  return {
    async createGroup(name) {
      const id = newCode();
      mem.groups[id] = { name, createdAt: Date.now(), members: {}, plans: {} };
      seedDemoFriends(mem.groups[id]);
      commit();
      return id;
    },
    async getGroup(id) {
      const g = mem.groups[id];
      return g ? { id, name: g.name } : null;
    },
    async getMembers(groupId) {
      return Object.entries(group(groupId).members).map(([id, m]) => ({ id, ...structuredClone(m) }));
    },
    async addMember(groupId, { name, color }) {
      const id = newId();
      group(groupId).members[id] = { name, color, free: {}, joinedAt: Date.now() };
      commit();
      return id;
    },
    async updateMember(groupId, memberId, patch) {
      Object.assign(group(groupId).members[memberId], patch);
      commit();
    },
    async removeMember(groupId, memberId) {
      delete group(groupId).members[memberId];
      commit();
    },
    async setFree(groupId, memberId, key, free) {
      const m = group(groupId).members[memberId];
      if (free) m.free[key] = true; else delete m.free[key];
      commit();
    },
    async addPlan(groupId, plan) {
      const id = newId();
      group(groupId).plans[id] = { ...structuredClone(plan), createdAt: Date.now() };
      commit();
      return id;
    },
    async setGoing(groupId, planId, memberId, value) {
      const p = group(groupId).plans[planId];
      p.going = p.going || {};
      if (value === null) delete p.going[memberId]; else p.going[memberId] = value;
      commit();
    },
    async deletePlan(groupId, planId) {
      delete group(groupId).plans[planId];
      commit();
    },
    subscribe(groupId, onData) {
      const fire = () => {
        const g = mem.groups[groupId];
        if (!g) return onData({ group: null, members: [], plans: [] });
        onData(structuredClone({
          group: { id: groupId, name: g.name },
          members: Object.entries(g.members).map(([id, m]) => ({ id, ...m })),
          plans: Object.entries(g.plans).map(([id, p]) => ({ id, ...p })),
        }));
      };
      listeners.add(fire);
      queueMicrotask(fire);
      return () => listeners.delete(fire);
    },
  };
}

/** En modo prueba añadimos dos amigas inventadas con huecos al azar. */
function seedDemoFriends(g) {
  const friends = [
    { name: 'Lucía (ejemplo)', color: '#7c5cff' },
    { name: 'Marta (ejemplo)', color: '#1fb5a8' },
  ];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const f of friends) {
    const free = {};
    for (let i = 0; i < 21; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const weekend = d.getDay() === 0 || d.getDay() === 5 || d.getDay() === 6;
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      for (const s of ['m', 't', 'n']) {
        if (Math.random() < (weekend ? 0.6 : 0.3)) free[`${k}_${s}`] = true;
      }
    }
    g.members[newId()] = { ...f, free, joinedAt: Date.now(), demo: true };
  }
}
