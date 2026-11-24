// Player profiles: Admin, named users (name + password, no email) and Guest.
//
// Online accounts (when src/firebase-config.js is filled in): every user account lives in Firebase, so it works on any
// device anywhere. Sign-in uses Firebase Authentication (the name is turned into a hidden e-mail address, so players only
// ever see a name and a password), and the player's whole progress (Perfect Points and shop ranks, unlocks and goal
// counters, records, skins, last loadout) is stored in Cloud Firestore at users/<uid>/data/main (names are reserved at usernames/<name>),
// saved a few seconds after a change and again when the page is hidden or closed. Firestore rules let each account read
// and write only its own data.
//
// Device accounts (no Firebase config): progress is kept under 'perfectrun.u.<id>.*' in this browser. When Firebase is
// switched on later, signing in to an old device account moves it (and its progress) online.
//
// Admin needs no password and keeps its progress on the device. Guest progress lives in memory only.
// Passwords are never stored by the game: Firebase keeps them, and device accounts keep only a salted PBKDF2 hash.
import { FIREBASE } from './firebase-config.js';

const ACC = 'perfectrun.accounts', SES = 'perfectrun.session', RECENT = 'perfectrun.recent';
const LEGACY = ['meta', 'unlocks', 'records', 'skins', 'loadout', 'p2.skins', 'p2.loadout']; // progress saved before profiles existed
const mem = new Map();
let cur = null;

const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch {} };

function accounts() {
  let a = null;
  try { a = JSON.parse(lsGet(ACC) || 'null'); } catch {}
  if (!a || typeof a !== 'object') a = {};
  a.users = Array.isArray(a.users) ? a.users : [];
  return a;
}
const saveAccounts = (a) => lsSet(ACC, JSON.stringify(a));

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const newSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)));
async function hashPw(pw, salt) {
  if (!crypto.subtle) throw new Error('This browser blocks secure sign-in here. Open the game over https.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 120000, hash: 'SHA-256' }, key, 256);
  return hex(bits);
}
const cleanName = (n) => String(n || '').replace(/[\/\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
function checkNew(name, pw) {
  if (name.length < 2) throw new Error('Pick a name with at least 2 letters.');
  if (/^admin$/i.test(name) || /^guest$/i.test(name)) throw new Error('That name is reserved. Pick another one.');
  if (String(pw).length < 4) throw new Error('Use a password with at least 4 characters.');
}

// ---------------- Firebase (REST, no SDK): Authentication + Cloud Firestore ----------------
// users/{uid}/data/main  { name, p: { meta, unlocks, records, skins, loadout, ... } }  (each progress value is the game's JSON string)
// usernames/{lowercase}  { uid }  reserves each name for one account
const CLOUD = !!(FIREBASE && FIREBASE.apiKey && FIREBASE.projectId);
const KEY = CLOUD ? encodeURIComponent(FIREBASE.apiKey) : '';
const FS = CLOUD ? `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE.projectId)}/databases/(default)/documents` : '';
const fbEmail = (name) => 'p' + hex(new TextEncoder().encode(name.toLowerCase())) + '@players.theperfectrun.game'; // one account per name, any letters
const fbPw = (pw) => 'PerfectRun:' + pw; // Firebase wants 6+ characters; players may use 4
const enc = (k) => k.replace(/^perfectrun\./, '').replace(/\./g, '_'); // plain field names: meta, p2_skins, ...
const dec = (k) => 'perfectrun.' + k.replace(/_/g, '.');
const nameId = (name) => encodeURIComponent(name.toLowerCase());
let tok = null; // { id, rt, exp, uid }
const cloudData = new Map();
let dirty = {}, saveT = null, saveFails = 0;

function fbErr(j, fallback) {
  const e = j && j.error, m = (e && (e.message || e.status || (typeof e === 'string' ? e : ''))) || '';
  if (/EMAIL_EXISTS/.test(m)) return new Error('That name is taken. Pick another one.');
  if (/INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND|INVALID_EMAIL/.test(m)) return new Error('Wrong name or password.');
  if (/TOO_MANY_ATTEMPTS/.test(m)) return new Error('Too many tries. Wait a minute and try again.');
  if (/OPERATION_NOT_ALLOWED|CONFIGURATION_NOT_FOUND/.test(m)) return new Error('Online accounts are not switched on yet (Email/Password sign-in is off in Firebase).');
  if (/USER_DISABLED/.test(m)) return new Error('This account was turned off.');
  if (/TOKEN_EXPIRED|INVALID_REFRESH_TOKEN|USER_NOT_FOUND/.test(m)) return new Error('Please sign in again.');
  if (/PERMISSION_DENIED|Missing or insufficient permissions/i.test(m)) return new Error('The save server refused this account (check the Firestore rules).');
  return new Error(fallback || 'Could not reach the account server' + (m ? ' (' + m + ')' : '') + '. Check your internet and try again.');
}
async function req(url, opt) {
  let r;
  try { r = await fetch(url, opt); } catch { throw fbErr(null); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const err = fbErr(j); err.status = r.status; throw err; }
  return j;
}
const auth = (path, body) => req(`https://identitytoolkit.googleapis.com/v1/${path}?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, returnSecureToken: true }) });
async function token() {
  if (tok.id && Date.now() < tok.exp - 60000) return tok.id;
  const j = await req(`https://securetoken.googleapis.com/v1/token?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(tok.rt) });
  tok = { id: j.id_token, rt: j.refresh_token, exp: Date.now() + (+j.expires_in || 3600) * 1000, uid: j.user_id };
  return tok.id;
}
// Firestore REST call on a document path (relative to /documents).
async function fs(method, path, body, keepalive) {
  const t = await token();
  return req(`${FS}/${path}`, { method, headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), keepalive: !!keepalive });
}
const strMap = (o) => ({ mapValue: { fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { stringValue: v }])) } });
function startTok(j) { tok = { id: j.idToken, rt: j.refreshToken, exp: Date.now() + (+j.expiresIn || 3600) * 1000, uid: j.localId }; }
// Load this account's document; returns its saved name (or null when the document is new).
async function pull() {
  let d = null;
  try { d = await fs('GET', `users/${tok.uid}/data/main`); } catch (e) { if (e.status !== 404) throw e; }
  cloudData.clear();
  const f = (d && d.fields) || {}, p = (f.p && f.p.mapValue && f.p.mapValue.fields) || {};
  for (const [k, v] of Object.entries(p)) if (v && typeof v.stringValue === 'string') cloudData.set(dec(k), v.stringValue);
  return f.name && f.name.stringValue ? f.name.stringValue : null;
}
// Write some progress fields (and optionally the name) without touching the rest of the document.
function write(fields, name, keepalive) {
  const mask = Object.keys(fields).map((k) => 'updateMask.fieldPaths=' + encodeURIComponent('p.' + k));
  if (name) mask.push('updateMask.fieldPaths=name');
  const doc = { fields: { p: strMap(fields) } };
  if (name) doc.fields.name = { stringValue: name };
  return fs('PATCH', `users/${tok.uid}/data/main?${mask.join('&')}`, doc, keepalive);
}
function flush(keepalive) {
  clearTimeout(saveT); saveT = null;
  if (!tok || !Object.keys(dirty).length) return Promise.resolve();
  const body = dirty; dirty = {};
  return write(body, null, keepalive).then(() => { saveFails = 0; }, () => {
    dirty = { ...body, ...dirty }; // try again shortly; nothing is dropped
    saveFails++; schedule(Math.min(60000, 5000 * saveFails));
  });
}
// Progress changes often in a fight, so saves are batched (the free Firebase plan allows 20,000 writes a day).
function schedule(ms = 8000) { if (!saveT) saveT = setTimeout(() => flush(), ms); }
if (typeof addEventListener === 'function') {
  addEventListener('pagehide', () => flush(true));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });
}
// A new online account: reserve the name, then create the account's document.
async function claimName(name) {
  try { await fs('PATCH', `usernames/${nameId(name)}?currentDocument.exists=false`, { fields: { uid: { stringValue: tok.uid } } }); } catch (e) { if (e.status !== 400 && e.status !== 409 && e.status !== 412) throw e; }
  await write({}, name);
}
function remember(name) {
  let r = [];
  try { r = JSON.parse(lsGet(RECENT) || '[]'); } catch {}
  if (!Array.isArray(r)) r = [];
  r = [{ name, at: Date.now() }, ...r.filter((x) => x && x.name && x.name.toLowerCase() !== name.toLowerCase())].slice(0, 12);
  lsSet(RECENT, JSON.stringify(r));
}
function recent() { try { const r = JSON.parse(lsGet(RECENT) || '[]'); return Array.isArray(r) ? r.filter((x) => x && x.name) : []; } catch { return []; } }

async function cloudBegin(name) {
  const saved = await pull();
  if (saved) name = saved;
  cur = { kind: 'user', id: tok.uid, name, cloud: true };
  remember(name);
  lsSet(SES, JSON.stringify({ kind: 'user', id: tok.uid, name, cloud: 1, rt: tok.rt }));
  try { sessionStorage.removeItem(SES); } catch {}
}
// Copy progress saved in this browser (an old device account, or play from before profiles) into the online account.
async function upload(prefix) {
  const out = {};
  for (const k of LEGACY) { const v = lsGet(prefix + k); if (v != null && !cloudData.has('perfectrun.' + k)) { out[enc('perfectrun.' + k)] = v; cloudData.set('perfectrun.' + k, v); } }
  if (Object.keys(out).length) await write(out);
}

export const Profile = {
  cloud: CLOUD,
  get cur() { return cur || { kind: 'guest', id: 'guest', name: 'Guest' }; },
  isAdmin() { return !!cur && cur.kind === 'admin'; },
  isGuest() { return !cur || cur.kind === 'guest'; },
  // The name this profile plays under (null for Guest, who picks their own).
  playName() { return cur && cur.kind === 'user' ? cur.name : null; }, // Admin (everyone now) types their own name

  // Storage for a progress key such as 'perfectrun.meta'.
  scoped(k) {
    const c = this.cur;
    return c.kind === 'admin' ? k.replace(/^perfectrun\./, 'perfectrun.admin.') : c.kind === 'user' ? k.replace(/^perfectrun\./, 'perfectrun.u.' + c.id + '.') : null;
  },
  get(k) {
    if (cur && cur.cloud) return cloudData.has(k) ? cloudData.get(k) : null;
    const s = this.scoped(k); return s ? lsGet(s) : (mem.has(k) ? mem.get(k) : null);
  },
  set(k, v) {
    if (cur && cur.cloud) { if (cloudData.get(k) === v) return; cloudData.set(k, v); dirty[enc(k)] = v; schedule(); return; }
    const s = this.scoped(k); if (s) lsSet(s, v); else mem.set(k, v);
  },
  // Push any unsaved progress now (online accounts).
  save() { return flush(); },

  // The accounts shown on the "Who's playing?" screen: online accounts used on this device, then device-only accounts.
  users() {
    const dev = accounts().users.map((u) => ({ id: u.id, name: u.name, created: u.created, local: true }));
    if (!CLOUD) return dev;
    const on = recent().map((r) => ({ id: 'n:' + r.name, name: r.name, created: r.at, local: false }));
    return [...on, ...dev.filter((d) => !on.some((o) => o.name.toLowerCase() === d.name.toLowerCase()))];
  },
  hasAdmin() { return !!accounts().admin; },

  // Sign back in to the profile used last on this device (Guest only lasts while the tab is open).
  // Returns true/false, or a promise of it for an online account (it has to fetch the progress first).
  restore() {
    let s = null;
    try { s = JSON.parse(lsGet(SES) || 'null'); } catch {}
    if (!s) { try { if (sessionStorage.getItem(SES) === 'guest') s = { kind: 'guest' }; } catch {} }
    if (!s) return false;
    if (s.kind === 'admin') { cur = { kind: 'admin', id: 'admin', name: 'Admin' }; return true; }
    if (s.kind === 'user' && s.cloud) {
      if (!CLOUD || !s.rt) return false;
      tok = { id: null, rt: s.rt, exp: 0, uid: s.id };
      return token().then(() => cloudBegin(s.name)).then(() => true, () => { tok = null; return false; });
    }
    if (s.kind === 'user') { const u = accounts().users.find((x) => x.id === s.id); if (u && !CLOUD) { cur = { kind: 'user', id: u.id, name: u.name }; return true; } }
    if (s.kind === 'guest') { cur = { kind: 'guest', id: 'guest', name: 'Guest' }; return true; }
    return false;
  },
  begin(p) {
    cur = p;
    if (p.kind === 'guest') { lsDel(SES); try { sessionStorage.setItem(SES, 'guest'); } catch {} }
    else { lsSet(SES, JSON.stringify({ kind: p.kind, id: p.id })); try { sessionStorage.removeItem(SES); } catch {} }
  },
  guest() { this.begin({ kind: 'guest', id: 'guest', name: 'Guest' }); },
  signOut() { flush(true); cur = null; tok = null; cloudData.clear(); lsDel(SES); try { sessionStorage.removeItem(SES); } catch {} },

  async createUser(name, pw) {
    name = cleanName(name);
    checkNew(name, pw);
    const a = accounts();
    if (CLOUD) {
      startTok(await auth('accounts:signUp', { email: fbEmail(name), password: fbPw(pw) }));
      await claimName(name);
      await cloudBegin(name);
      // The first account made on a device keeps the progress that was saved before profiles existed.
      if (!a.migrated) { a.migrated = 1; saveAccounts(a); await upload('perfectrun.'); }
      return;
    }
    if (a.users.some((u) => u.name.toLowerCase() === name.toLowerCase())) throw new Error('That name is taken on this device.');
    const salt = newSalt();
    const u = { id: hex(crypto.getRandomValues(new Uint8Array(6))), name, salt, hash: await hashPw(pw, salt), created: Date.now() };
    if (!a.migrated) {
      a.migrated = 1;
      for (const k of LEGACY) { const v = lsGet('perfectrun.' + k); if (v != null) lsSet('perfectrun.u.' + u.id + '.' + k, v); }
    }
    a.users.push(u);
    saveAccounts(a);
    this.begin({ kind: 'user', id: u.id, name: u.name });
  },
  // Sign in by name (online) or by device account id.
  async signIn(idOrName, pw) {
    const a = accounts();
    const local = a.users.find((x) => x.id === idOrName) || (CLOUD ? null : a.users.find((x) => x.name.toLowerCase() === cleanName(idOrName).toLowerCase()));
    if (!CLOUD) {
      if (!local) throw new Error('That account no longer exists.');
      if ((await hashPw(pw, local.salt)) !== local.hash) throw new Error('Wrong password.');
      this.begin({ kind: 'user', id: local.id, name: local.name });
      return;
    }
    const name = local ? local.name : cleanName(String(idOrName).replace(/^n:/, ''));
    if (local) {
      // An old device account: check its password here, then move it online (or join the online account of the same name).
      if ((await hashPw(pw, local.salt)) !== local.hash) throw new Error('Wrong password.');
      try { startTok(await auth('accounts:signUp', { email: fbEmail(name), password: fbPw(pw) })); await claimName(name); }
      catch (e) { if (!/taken/.test(e.message)) throw e; startTok(await auth('accounts:signInWithPassword', { email: fbEmail(name), password: fbPw(pw) })); }
      await cloudBegin(name);
      await upload('perfectrun.u.' + local.id + '.');
      a.users = a.users.filter((u) => u.id !== local.id); saveAccounts(a);
      return;
    }
    startTok(await auth('accounts:signInWithPassword', { email: fbEmail(name), password: fbPw(pw) }));
    await cloudBegin(name);
  },
  async setupAdmin(pw) {
    const a = accounts();
    if (a.admin) throw new Error('The admin password is already set on this device.');
    if (String(pw).length < 4) throw new Error('Use a password with at least 4 characters.');
    const salt = newSalt();
    a.admin = { name: 'Admin', salt, hash: await hashPw(pw, salt) };
    saveAccounts(a);
    this.begin({ kind: 'admin', id: 'admin', name: 'Admin' });
  },
  async signInAdmin(pw) {
    const a = accounts();
    if (!a.admin) throw new Error('No admin password is set on this device yet.');
    if ((await hashPw(pw, a.admin.salt)) !== a.admin.hash) throw new Error('Wrong password.');
    this.begin({ kind: 'admin', id: 'admin', name: a.admin.name || 'Admin' });
  },
  // Admin needs no password (Nutty 2026-11-06): anyone can open it.
  enterAdmin() { this.begin({ kind: 'admin', id: 'admin', name: 'Admin' }); },
  // Admin only. Device accounts are deleted with everything they saved. Online accounts are taken off this device's list
  // (deleting one for good is done in the Firebase console, since Admin has no password).
  deleteUser(id) {
    if (!this.isAdmin()) return false;
    if (String(id).startsWith('n:')) {
      const n = id.slice(2).toLowerCase();
      lsSet(RECENT, JSON.stringify(recent().filter((r) => r.name.toLowerCase() !== n)));
      return true;
    }
    const a = accounts();
    const before = a.users.length;
    a.users = a.users.filter((u) => u.id !== id);
    if (a.users.length === before) return false;
    saveAccounts(a);
    const pre = 'perfectrun.u.' + id + '.';
    try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith(pre)) localStorage.removeItem(k); } } catch {}
    return true;
  },
};
