// ─────────────────────────────────────────────────────────────
// SYNCHRONISATION ordinateur ↔ téléphone via un gist privé GitHub.
// Chaque appareil garde ses données (hors-ligne OK) ; à chaque synchro on
// FUSIONNE : pour chaque élément, la version la plus récente gagne (mt),
// les suppressions sont propagées (tomb).
// ─────────────────────────────────────────────────────────────
import { S, applyRemote, onChange } from './store.js';
import { $, esc, toast } from './utils.js';

const API = 'https://api.github.com';
const FILE = 'brain-board.json';
const DESC = 'Brain Board — synchronisation (ne pas supprimer)';
const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=Brain%20Board%20sync';

export const sync = {
  token: localStorage.getItem('bb-sync-token') || '',
  gist: localStorage.getItem('bb-sync-gist') || '',
  status: 'off', // off | run | ok | error | offline
  last: +localStorage.getItem('bb-sync-last') || 0,
  err: '',
};
export const syncEnabled = () => !!(sync.token && sync.gist);

// ── Fusion ──
const transient = (k, v) => (k === '_w' || k === '_h' ? undefined : v);
const plain = s => JSON.parse(JSON.stringify({ version: 2, nodes: s.nodes || [], edges: s.edges || [], tomb: s.tomb || {} }, transient));
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
export const canon = s => JSON.stringify({
  n: [...(s.nodes || [])].sort(byId), e: [...(s.edges || [])].sort(byId),
  t: Object.keys(s.tomb || {}).sort().map(k => [k, s.tomb[k]]),
}, transient);

export function merge(a, b) {
  const tomb = { ...(a.tomb || {}) };
  for (const [k, v] of Object.entries(b.tomb || {})) tomb[k] = Math.max(tomb[k] || 0, v);
  const pick = (la = [], lb = [], pre) => {
    const m = new Map();
    for (const x of la) m.set(x.id, x);
    for (const x of lb) { const y = m.get(x.id); if (!y || (x.mt || 0) > (y.mt || 0)) m.set(x.id, x); }
    return [...m.values()].filter(x => !(tomb[pre + x.id] && tomb[pre + x.id] >= (x.mt || 0)));
  };
  const nodes = pick(a.nodes, b.nodes, '').map(n => ({ ...n }));
  const ids = new Set(nodes.map(n => n.id));
  // Élément dont le parent a été supprimé ailleurs → rangé dans « Inbox »
  let inbox = null;
  for (const n of nodes) {
    if (!n.parent || ids.has(n.parent)) continue;
    inbox = inbox || nodes.find(x => x.kind === 'project' && x.title === 'Inbox');
    if (!inbox) {
      inbox = { id: 'inbox' + Date.now().toString(36), kind: 'project', title: 'Inbox', parent: null, hue: '#64748b', notes: '', x: null, y: null, mt: Date.now() };
      nodes.push(inbox); ids.add(inbox.id);
    }
    n.parent = inbox.id; n.mt = Date.now();
  }
  const edges = pick(a.edges, b.edges, 'e:').filter(e => ids.has(e.from) && ids.has(e.to));
  const cutoff = Date.now() - 90 * 864e5;
  for (const k in tomb) if (tomb[k] < cutoff) delete tomb[k];
  return { version: 2, nodes, edges, tomb };
}

// ── API GitHub ──
async function api(path, opt = {}) {
  const r = await fetch(API + path, {
    ...opt, cache: 'no-store',
    headers: { Authorization: 'Bearer ' + sync.token, Accept: 'application/vnd.github+json', ...(opt.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (r.status === 401) throw new Error('jeton refusé (expiré ou révoqué)');
  if (r.status === 403) throw new Error('accès refusé — le jeton doit avoir la permission « gist »');
  if (r.status === 404) throw new Error('gist de synchro introuvable');
  if (!r.ok) throw new Error('GitHub ' + r.status);
  return r.json();
}
async function findGist() {
  for (let p = 1; p <= 5; p++) {
    const list = await api(`/gists?per_page=100&page=${p}`);
    const g = list.find(g => g.files && g.files[FILE]);
    if (g) return g.id;
    if (list.length < 100) break;
  }
  return null;
}
async function readGist() {
  const g = await api('/gists/' + sync.gist);
  const f = g.files[FILE]; if (!f) return null;
  const txt = f.truncated ? await (await fetch(f.raw_url, { cache: 'no-store' })).text() : f.content;
  try { return JSON.parse(txt); } catch (_) { return null; }
}
const body = state => JSON.stringify({ app: 'brain-board', savedAt: new Date().toISOString(), ...plain(state) });
const writeGist = state => api('/gists/' + sync.gist, { method: 'PATCH', body: JSON.stringify({ files: { [FILE]: { content: body(state) } } }) });

// ── Statut ──
function setStatus(s, err = '') {
  sync.status = s; sync.err = err;
  const b = $('#syncBtn');
  if (b) {
    b.hidden = !syncEnabled() && s !== 'run';
    b.className = 'btn icon sync-' + s;
    b.title = { run: 'Synchronisation…', ok: 'Synchronisé ' + ago(sync.last), error: 'Erreur de synchro : ' + err, offline: 'Hors-ligne — synchro au retour du réseau', off: '' }[s] || '';
  }
  if ($('#settings')?.open) renderSyncBox();
}
function ago(t) {
  if (!t) return 'jamais';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

// ── Synchroniser ──
let busy = false, again = false, timer = null;
export async function syncNow() {
  if (!syncEnabled()) return;
  if (busy) { again = true; return; }
  busy = true; clearTimeout(timer); timer = null;
  setStatus('run');
  try {
    const before = canon(S);
    const remote = await readGist();
    if (canon(S) !== before) again = true; // modifié pendant le téléchargement → on recommence
    else {
      const merged = merge(plain(S), remote || {});
      if (canon(merged) !== before) applyRemote(merged);
      if (!remote || canon(merged) !== canon(plain(remote))) await writeGist(merged);
      sync.last = Date.now(); localStorage.setItem('bb-sync-last', sync.last);
    }
    setStatus('ok');
  } catch (e) {
    setStatus(navigator.onLine ? 'error' : 'offline', e.message);
  }
  busy = false;
  if (again) { again = false; schedule(300); }
}
export function schedule(ms = 1500) {
  if (!syncEnabled()) return;
  clearTimeout(timer); timer = setTimeout(syncNow, ms);
}

export async function connect(token) {
  token = String(token || '').trim();
  if (!token) return;
  const old = { ...sync };
  sync.token = token; setStatus('run');
  try {
    const u = await api('/user');
    let id = await findGist();
    if (id) {
      sync.gist = id;
      const remote = await readGist();
      const hasRemote = remote?.nodes?.length, hasLocal = S.nodes.length;
      if (hasRemote && hasLocal && !confirm('Ta synchro contient déjà des données.\n\nOK → fusionner avec les données de cet appareil\nAnnuler → remplacer cet appareil par les données synchronisées (conseillé pour un nouvel appareil)')) {
        applyRemote(merge({ nodes: [], edges: [], tomb: {} }, remote));
      }
    } else {
      const g = await api('/gists', { method: 'POST', body: JSON.stringify({ description: DESC, public: false, files: { [FILE]: { content: body(S) } } }) });
      sync.gist = g.id;
    }
    localStorage.setItem('bb-sync-token', sync.token);
    localStorage.setItem('bb-sync-gist', sync.gist);
    await syncNow();
    toast(`☁️ Synchro activée (compte ${u.login})`);
  } catch (e) {
    Object.assign(sync, old);
    setStatus(syncEnabled() ? 'error' : 'off', e.message);
    toast('Synchro impossible : ' + e.message);
  }
}
export function disconnect() {
  localStorage.removeItem('bb-sync-token'); localStorage.removeItem('bb-sync-gist'); localStorage.removeItem('bb-sync-last');
  sync.token = ''; sync.gist = ''; sync.last = 0;
  setStatus('off'); toast('Synchro désactivée sur cet appareil (les données restent ici)');
}
const shareLink = () => `${location.origin}${location.pathname}#sync=${encodeURIComponent(sync.token)}`;

// ── Interface (réglages) ──
export function renderSyncBox() {
  const box = $('#syncBox'); if (!box) return;
  if (!syncEnabled()) {
    box.innerHTML = `<p class="mut sm">Tes données passent par un <b>gist privé</b> sur ton compte GitHub. Il faut un jeton qui n'a accès qu'aux gists (rien d'autre).</p>
      <ol class="steps"><li><a href="${TOKEN_URL}" target="_blank" rel="noopener">Créer un jeton GitHub ↗</a> — laisse seulement <b>gist</b> coché, choisis une expiration, puis « Generate token ».</li>
      <li>Copie le jeton et colle-le ici :</li></ol>
      <div class="row"><input id="syncTok" type="password" placeholder="ghp_…" autocomplete="off"><button class="btn pri" id="syncGo" style="flex:0 0 auto">Connecter</button></div>
      <p class="mut sm">Sur ton téléphone : colle le même jeton, ou ouvre le lien de connexion que tu t'envoies depuis l'ordinateur une fois connecté.</p>
      ${sync.status === 'run' ? '<p class="sm">⏳ Connexion…</p>' : ''}${sync.err ? `<p class="sm late">⚠ ${esc(sync.err)}</p>` : ''}`;
    $('#syncGo').onclick = () => connect($('#syncTok').value);
    $('#syncTok').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); connect($('#syncTok').value); } });
    return;
  }
  const label = { run: '⏳ Synchronisation…', ok: '✅ À jour', error: '⚠ Erreur', offline: '📴 Hors-ligne', off: '' }[sync.status] || '';
  box.innerHTML = `<p class="sm"><b>${label}</b> · dernière synchro ${ago(sync.last)}</p>
    ${sync.err ? `<p class="sm late">⚠ ${esc(sync.err)}</p>` : ''}
    <div class="row"><button class="btn" id="syncNowB">⟳ Synchroniser</button><button class="btn" id="syncShare">📲 Lien pour mon téléphone</button></div>
    <p class="mut sm">Le lien contient ton jeton : envoie-le seulement à toi-même (AirDrop, Notes, message à toi-même).</p>
    <button class="btn danger sm" id="syncOff">Déconnecter cet appareil</button>`;
  $('#syncNowB').onclick = syncNow;
  $('#syncOff').onclick = () => { if (confirm('Désactiver la synchro sur cet appareil ?')) disconnect(); };
  $('#syncShare').onclick = async () => {
    const url = shareLink();
    try {
      if (navigator.share) await navigator.share({ title: 'Brain Board — connexion', url });
      else { await navigator.clipboard.writeText(url); toast('🔗 Lien copié — ouvre-le sur ton téléphone'); }
    } catch (_) { /* partage annulé */ }
  };
}

export function initSync() {
  // Lien de connexion : …/#sync=JETON
  const m = location.hash.match(/sync=([^&]+)/);
  if (m) { history.replaceState(null, '', location.pathname + location.search); connect(decodeURIComponent(m[1])); }
  onChange(src => { if (src !== 'remote') schedule(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(200);
    else if (timer) syncNow(); // on part : on envoie ce qui reste
  });
  window.addEventListener('online', () => schedule(200));
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 45000);
  $('#syncBtn').onclick = async () => { await syncNow(); toast(sync.status === 'ok' ? '☁️ Synchronisé' : '⚠ ' + (sync.err || 'Synchro impossible')); };
  setStatus(syncEnabled() ? 'ok' : 'off');
  if (syncEnabled()) schedule(300);
}
