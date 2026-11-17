// Point d'entrée : câblage de l'interface.
import { TYPES, PRIO, EFFORT, CFG, saveCfg } from './config.js';
import { $, $$, esc, toast, isMobile, cap, iso, addDays } from './utils.js';
import { S, load, replace, commit, onChange, snapshot, undo, byId, projects, kids, suppliers, getProject, getSub, getSupplier, addEdge, projectOf, mk } from './store.js';
import { parseDump } from './parser.js';
import { run, ingestItem } from './commands.js';
import { aiParse, hasAI } from './ai.js';
import { cv, initCanvas, renderCanvas, layout, fit, centerOn, placeNew } from './canvas.js';
import { initPanel, openEditor, closeEditor, currentId, nodeLabel, resolveLabel } from './panel.js';
import { initViews, renderFocus, renderProjects, renderSuppliers } from './views.js';
import { createVoice } from './voice.js';
import { auto } from './rules.js';

// ───────── Vues ─────────
let view = localStorage.getItem('bb-viewname') || (isMobile() ? 'focus' : 'canvas');
const renderers = { focus: renderFocus, projects: renderProjects, suppliers: renderSuppliers, canvas: () => {} };
function setView(v) {
  view = v; localStorage.setItem('bb-viewname', v);
  $$('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
  $$('[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  renderers[v]();
  if (v === 'canvas' && cv.firstVisit) { cv.firstVisit = false; setTimeout(fit, 30); }
}
function renderAll() {
  renderCanvas();
  renderers[view]();
  renderStats();
  refreshDatalists();
}
onChange(renderAll);

function renderStats() {
  const items = S.nodes.filter(n => n.kind === 'item');
  const late = items.filter(n => auto(n).cls.includes('overdue')).length;
  const today = items.filter(n => auto(n).b.some(b => b[1].includes("Aujourd'hui"))).length;
  const rel = suppliers().filter(n => auto(n).b.some(b => /relancer|Contacter vite/.test(b[1]))).length;
  let h = '';
  if (late) h += `<span class="stat red" data-go="focus">⏰ ${late}<span class="desk-i"> en retard</span></span>`;
  if (today) h += `<span class="stat org" data-go="focus">☀️ ${today}<span class="desk-i"> aujourd'hui</span></span>`;
  if (rel) h += `<span class="stat org" data-go="suppliers">🔔 ${rel}<span class="desk-i"> à relancer</span></span>`;
  $('#stats').innerHTML = h;
}
$('#stats').onclick = e => { const g = e.target.closest('[data-go]'); if (g) setView(g.dataset.go); };

const dlMap = new Map();
function refreshDatalists() {
  $('#dl-projects').innerHTML = projects().map(p => `<option value="${esc(p.title)}">`).join('');
  const pj = projects().find(p => p.title === $('#fProject')?.value);
  $('#dl-subs').innerHTML = (pj ? kids(pj.id) : S.nodes).filter(n => n.kind === 'sub').map(s => `<option value="${esc(s.title)}">`).join('');
  $('#dl-suppliers').innerHTML = suppliers().map(s => `<option value="${esc(s.title)}">`).join('');
  $('#dl-nodes').innerHTML = S.nodes.map(n => `<option value="${esc(nodeLabel(n))}">`).join('');
}

// ───────── Feuilles (tiroirs / bottom sheets) ─────────
function syncScrim() {
  const any = $('#capture').classList.contains('open') || $('#panel').classList.contains('open');
  $('#scrim').classList.toggle('on', any && isMobile());
}
function openCapture(tab = 'voice') {
  closeEditor();
  $('#capture').classList.add('open'); setTab(tab); syncScrim();
}
function closeCapture() { voice.stop(); $('#capture').classList.remove('open'); syncScrim(); }
function setTab(t) {
  $$('#capTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $('#tab-voice').hidden = t !== 'voice'; $('#tab-form').hidden = t !== 'form';
  if (t === 'form') setTimeout(() => $('#tab-form [name=title]').focus(), 250);
}
$$('#capTabs button').forEach(b => b.onclick = () => setTab(b.dataset.tab));
$('#scrim').onclick = () => { closeCapture(); closeEditor(); };
$$('[data-close]').forEach(b => b.onclick = () => (b.closest('#capture') ? closeCapture() : closeEditor()));

// ───────── Voix ─────────
let stoppedByUser = false;
const voice = createVoice({
  onFinal: t => {
    const ta = $('#dumpText'); t = cap(t.trim()); if (!t) return;
    if (!/[.!?]$/.test(t)) t += '.';
    ta.value += (ta.value && !/\s$/.test(ta.value) ? ' ' : '') + t; ta.scrollTop = ta.scrollHeight;
  },
  onInterim: t => { $('#interim').textContent = t; },
  onState: (s, info) => {
    const b = $('#micBtn'), on = s === 'on';
    b.classList.toggle('on', on); $('#fab').classList.toggle('on', on);
    b.querySelector('.ml').textContent = on ? 'J’écoute… appuie pour terminer' : 'Appuyer pour parler';
    if (s === 'off') {
      $('#interim').textContent = '';
      if (stoppedByUser && CFG.autoProcess && $('#dumpText').value.trim()) process();
      stoppedByUser = false;
    }
    if (s === 'unsupported') toast('Dictée non disponible ici : utilise le micro du clavier dans la zone de texte.');
    if (s === 'denied') toast('Autorise le micro pour dicter (réglages du navigateur).');
    if (s === 'error') toast('Micro : ' + info);
  },
});
function toggleMic() { if (voice.on) { stoppedByUser = true; voice.stop(); } else voice.start(); }
$('#micBtn').onclick = toggleMic;
$('#fab').onclick = () => {
  if ($('#capture').classList.contains('open') && voice.on) { toggleMic(); return; }
  openCapture('voice'); if (!voice.on) voice.start();
};
$('#autoProc').checked = CFG.autoProcess;
$('#autoProc').onchange = e => { CFG.autoProcess = e.target.checked; saveCfg(); };

// ───────── Traitement du brain dump ─────────
async function process() {
  const txt = $('#dumpText').value.trim();
  if (!txt) return toast('Rien à organiser 🙂');
  const b = $('#bParse'); b.disabled = true; b.textContent = '⏳ Organisation…';
  let entries, how = 'local';
  try {
    if (hasAI()) { entries = await aiParse(txt); how = 'IA'; }
    else entries = parseDump(txt);
  } catch (err) { toast('IA indisponible (' + err.message + ') — tri local'); entries = parseDump(txt); }
  snapshot();
  const res = run(entries);
  renderCanvas(); // mesure les nouvelles cartes
  if ($('#autoLayout').checked) layout(); else res.added.forEach(n => n.x == null && placeNew(n));
  commit();
  $('#dumpText').value = ''; b.disabled = false; b.textContent = '✨ Organiser';
  showResult(res, how);
  const parts = [];
  if (res.added.length) parts.push(`${res.added.length} ajouté${res.added.length > 1 ? 's' : ''}`);
  if (res.done.length) parts.push(`${res.done.length} action${res.done.length > 1 ? 's' : ''}`);
  toast('✨ ' + (parts.join(' · ') || 'Rien compris 🤔') + ` (${how})`, { label: 'Annuler', fn: doUndo });
}
function showResult(res, how) {
  let h = `<div class="res"><div class="res-h">✨ Résultat <span class="mode">${how}</span></div>`;
  h += res.added.map(n => `<div class="res-i" data-open="${n.id}">${n.kind === 'item' ? TYPES[n.type].icon : '📁'} <b>${esc(n.title)}</b> <span class="mut">· ${esc(projectOf(n)?.title || '')}</span></div>`).join('');
  h += res.done.map(t => `<div class="res-a">${esc(t)}</div>`).join('');
  h += res.errors.map(t => `<div class="res-e">⚠ ${esc(t)}</div>`).join('');
  h += `<button class="btn sm" id="resUndo">↩︎ Annuler tout</button></div>`;
  $('#result').innerHTML = h;
  $$('#result [data-open]').forEach(e => e.onclick = () => openEditor(byId(e.dataset.open)));
  $('#resUndo').onclick = () => { doUndo(); $('#result').innerHTML = ''; };
}
$('#bParse').onclick = () => { if (voice.on) { voice.stop(); } process(); };
$('#dumpText').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) process(); });
function doUndo() { if (undo()) toast('↩︎ Annulé'); else toast('Rien à annuler'); }

// ───────── Formulaire (travail de bureau) ─────────
$('#fType').innerHTML = Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('');
$('#fPrio').innerHTML = Object.entries(PRIO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
$('#fEffort').innerHTML = Object.entries(EFFORT).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
$('#fProject').addEventListener('input', refreshDatalists);
$('#tab-form').addEventListener('submit', e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  if (!f.title.trim()) return;
  snapshot();
  const n = ingestItem({ title: cap(f.title.trim()), type: f.type, project: f.project || 'Inbox', sub: f.sub || null, due: f.due || null, prio: +f.prio, effort: f.effort, supplier: f.supplier || null, notes: f.notes });
  if (f.linkTo) { const t = resolveLabel(f.linkTo); if (t && t !== n) addEdge(n.id, t.id, f.linkKind === 'depend' ? 'depend' : 'lien'); }
  renderCanvas();
  if ($('#autoLayout').checked) layout(); else placeNew(n);
  commit();
  toast(`✅ « ${n.title} » ajouté`, { label: 'Annuler', fn: doUndo });
  const keep = e.submitter?.value === 'more';
  const proj = f.project, sub = f.sub;
  e.target.reset();
  if (keep) { e.target.project.value = proj; e.target.sub.value = sub; e.target.title.focus(); }
  else closeCapture();
});
function addTo(parent) {
  openCapture('form');
  const p = projectOf(parent);
  $('#fProject').value = p.title; $('#tab-form').sub.value = parent.kind === 'sub' ? parent.title : '';
}
function addSupplier() {
  const name = prompt('Nom du fournisseur ?'); if (!name) return;
  snapshot(); const s = getSupplier(name, getProject('Fournisseurs')); renderCanvas(); placeNew(s); commit(); openEditor(s);
}

// ───────── Réglages / export ─────────
$('#bSettings').onclick = () => {
  $('#sKey').value = localStorage.getItem('bb-key') || '';
  $('#sModel').value = localStorage.getItem('bb-model') || '';
  $('#sRelance').value = CFG.relanceDays;
  $('#settings').showModal();
};
$('#sSave').onclick = () => {
  const k = $('#sKey').value.trim(), m = $('#sModel').value.trim();
  k ? localStorage.setItem('bb-key', k) : localStorage.removeItem('bb-key');
  m ? localStorage.setItem('bb-model', m) : localStorage.removeItem('bb-model');
  CFG.relanceDays = Math.max(1, +$('#sRelance').value || 5); saveCfg();
  $('#settings').close(); updMode(); commit(); toast(k ? 'Mode IA activé' : 'Réglages enregistrés');
};
$('#sClose').onclick = () => $('#settings').close();
$('#sExport').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
  a.download = `brain-board-${iso(new Date())}.json`; a.click();
};
$('#sImport').onclick = () => $('#fileIn').click();
$('#fileIn').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const d = JSON.parse(await f.text()); if (!Array.isArray(d.nodes)) throw 0; snapshot(); replace(d); renderCanvas(); commit(); fit(); toast('Import réussi'); $('#settings').close(); }
  catch (_) { toast('Fichier invalide'); }
  e.target.value = '';
};
$('#sReset').onclick = () => { if (confirm('Vider complètement le tableau ? (pense à exporter avant)')) { snapshot(); replace({ nodes: [], edges: [] }); commit(); $('#settings').close(); toast('Tableau vidé', { label: 'Annuler', fn: doUndo }); } };
function updMode() { const ai = hasAI(); const m = $('#modeLbl'); m.textContent = ai ? 'IA Claude' : 'Local'; m.className = 'mode' + (ai ? ' ai' : ''); }

// ───────── Boutons globaux & raccourcis ─────────
$$('[data-view]').forEach(b => b.onclick = () => setView(b.dataset.view));
$('#bAdd').onclick = () => openCapture('voice');
$('#bLayout').onclick = () => { renderCanvas(); layout(); commit(); fit(); toast('Carte réorganisée ✨'); };
document.addEventListener('keydown', e => {
  const typing = e.target.closest('input,textarea,select');
  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !typing) { e.preventDefault(); doUndo(); return; }
  if (e.key === 'Escape') { closeCapture(); closeEditor(); return; }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'n') { e.preventDefault(); openCapture('form'); }
  if (e.key === 'd') { e.preventDefault(); openCapture('voice'); voice.start(); }
  if (e.key === ' ' && $('#capture').classList.contains('open')) { e.preventDefault(); toggleMic(); }
  const vmap = { 1: 'canvas', 2: 'focus', 3: 'projects', 4: 'suppliers' };
  if (vmap[e.key]) setView(vmap[e.key]);
  if ((e.key === 'Delete' || e.key === 'Backspace') && currentId()) $('#pDel')?.click();
});
matchMedia('(max-width: 760px)').addEventListener('change', () => { syncScrim(); renderAll(); });
setInterval(renderAll, 30 * 60 * 1000);

// ───────── Démarrage ─────────
const hooks = {
  open: n => { if (!n) return; cv.selected = n.id; openEditor(n); },
  close: closeEditor,
  undo: doUndo,
  sheets: syncScrim,
  addTo, addSupplier,
  showOnMap: n => { if (isMobile()) closeEditor(); setView('canvas'); centerOn(n); },
};
initCanvas(hooks); initPanel(hooks); initViews(hooks);

if (!load()) {
  run(parseDump(`# Rénovation boutique
## Aménagement
- Appeler l'électricien pour le devis éclairage demain
- Commander les étagères chez MeubleDirect vendredi !!
- Idée : coin café près de la vitrine
- Problème : fuite sous l'évier, bloqué
- Fournisseur : Peintures Leroy - devis reçu
- Repeindre la boutique
## Communication
- Maquette affiche inauguration pour la semaine prochaine, important
- Envoyer le communiqué de presse
- Est-ce qu'on invite la mairie ?
# Site web
- Fournisseur : StudioPixel - contacté
- Valider la maquette home @StudioPixel demain
- Bug formulaire de contact, urgent
- Note : hébergement renouvelé jusqu'en 2027
- Rédiger les textes de la page À propos, fait
- Mettre à jour les horaires, rapide
Repeindre la boutique dépend de Peintures Leroy.
Le communiqué de presse dépend de la maquette affiche.
Lie l'affiche inauguration à la maquette home.`));
  const sp = S.nodes.find(s => s.title === 'StudioPixel'); if (sp) sp.lastContact = iso(addDays(-7));
  const ov = S.nodes.find(n => n.title?.startsWith('Envoyer le communiqué')); if (ov) ov.due = iso(addDays(-2));
  renderCanvas(); layout(); commit();
}
updMode();
renderAll();
setView(view);
if (new URLSearchParams(location.search).has('dicter')) openCapture('voice');

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
