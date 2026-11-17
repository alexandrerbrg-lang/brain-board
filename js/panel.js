// Panneau d'édition (tiroir à droite sur ordinateur, feuille du bas sur mobile).
import { TYPES, TASK_ST, SUP_ST, PRIO, EFFORT } from './config.js';
import { $, esc, iso, TODAY, toast } from './utils.js';
import { S, byId, kids, projectOf, suppliers, edgesOf, otherEnd, pathLabel, addEdge, removeEdgeById, removeNode, getSupplier, snapshot, commit, findBest } from './store.js';
import { auto } from './rules.js';

let hooks, current = null;
export const currentId = () => current;
const opts = (obj, val) => Object.entries(obj).map(([k, v]) => `<option value="${k}"${String(k) === String(val ?? '') ? ' selected' : ''}>${v}</option>`).join('');

// Libellés uniques pour la liste de suggestions « Lier à… »
export const nodeLabel = n => `${n.title}${n.kind === 'item' ? ' — ' + (pathLabel(n) || '') : n.kind === 'sub' ? ' — ' + pathLabel(n) : ' (projet)'}`;
export const resolveLabel = v => S.nodes.find(n => nodeLabel(n) === v) || findBest(v.split(' — ')[0]);

export function initPanel(h) { hooks = h; }
export function closeEditor() { current = null; $('#panel').classList.remove('open'); hooks.sheets(); }

export function openEditor(n, { focusTitle } = {}) {
  current = n.id;
  const P = $('#panel'), B = $('#pBody');
  P.classList.add('open'); hooks.sheets();
  const isSup = n.type === 'fournisseur';
  $('#pTitle').innerHTML = n.kind === 'project' ? '📁 Projet' : n.kind === 'sub' ? '📂 Sous-projet' : `${TYPES[n.type].icon} ${TYPES[n.type].label}`;
  let h = `<label>Titre<textarea data-f="title" rows="2">${esc(n.title)}</textarea></label>`;
  if (n.kind === 'item') {
    h += `<div class="row"><label>Type<select data-f="type">${opts(Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [k, v.icon + ' ' + v.label])), n.type)}</select></label>
      <label>Statut<select data-f="status">${opts(isSup ? SUP_ST : TASK_ST, n.status)}</select></label></div>
      <div class="row"><label>Priorité<select data-f="prio">${opts(PRIO, n.prio || 0)}</select></label>
      <label>${isSup ? 'Livraison prévue' : 'Échéance'}<input type="date" data-f="due" value="${n.due || ''}"></label></div>`;
    if (!isSup) h += `<label>Effort estimé<select data-f="effort">${opts(EFFORT, n.effort || '')}</select></label>`;
    if (isSup) {
      h += `<div class="row"><label>Contact<input data-f="contact" value="${esc(n.contact || '')}" placeholder="Nom"></label>
          <label>Montant devis<input data-f="amount" value="${esc(n.amount || '')}" placeholder="ex : 1 200 €"></label></div>
        <div class="row"><label>Téléphone<input type="tel" data-f="phone" value="${esc(n.phone || '')}"></label>
          <label>Email<input type="email" data-f="email" value="${esc(n.email || '')}"></label></div>
        <label>Dernier contact<input type="date" data-f="lastContact" value="${n.lastContact || ''}"></label>
        <div class="row quick">${n.phone ? `<a class="btn" href="tel:${esc(n.phone)}">📞 Appeler</a>` : ''}${n.email ? `<a class="btn" href="mailto:${esc(n.email)}">✉️ Email</a>` : ''}<button class="btn" id="pContacted">✓ Contacté aujourd'hui</button></div>`;
    }
  }
  if (n.kind !== 'project') {
    const parents = S.nodes.filter(x => x.kind === 'project' || (n.kind === 'item' && x.kind === 'sub'));
    h += `<label>Rattaché à<select data-f="parent">${parents.map(x => `<option value="${x.id}"${x.id === n.parent ? ' selected' : ''}>${x.kind === 'sub' ? '   ↳ ' + esc(projectOf(x).title) + ' › ' : '📁 '}${esc(x.title)}</option>`).join('')}</select></label>`;
  }
  // Liens
  const ed = edgesOf(n.id);
  h += `<label>Liens (${ed.length})</label><div class="links">`;
  for (const e of ed) {
    const o = otherEnd(e, n.id); if (!o) continue;
    const lab = e.kind === 'depend' ? (e.from === n.id ? '⏳ Dépend de' : '🔓 Bloque') : e.kind === 'fournisseur' ? '🏭 Fournisseur' : '🔗 Lié à';
    h += `<div class="lk"><span class="lk-k">${lab}</span><a data-goto="${o.id}">${o.kind === 'item' ? TYPES[o.type].icon + ' ' : '📁 '}${esc(o.title)}</a><button data-unlink="${e.id}" title="Retirer le lien">✕</button></div>`;
  }
  if (!ed.length) h += `<div class="mut">Aucun lien. Ajoute-en ci-dessous, à la voix (« lie X à Y ») ou en glissant 🔗 sur la carte.</div>`;
  h += `</div><div class="row lk-add"><input list="dl-nodes" id="lkIn" placeholder="Lier à… (tape pour chercher)"><select id="lkKind"><option value="lien">🔗 Lié à</option><option value="depend">⏳ Dépend de</option><option value="bloque">🔓 Bloque</option></select><button class="btn" id="lkGo">＋</button></div>`;
  h += `<label>Notes<textarea data-f="notes" rows="4" placeholder="Détails, liens, infos…">${esc(n.notes || '')}</textarea></label>`;
  const a = auto(n);
  if (a.b.length) h += `<label>Automatisations actives</label><div class="autobox">${a.b.map(([c, t]) => `<span class="bd bd-${c}">${esc(t)}</span>`).join(' ')}</div>`;
  h += `<div class="row"><button class="btn" id="pMap">🕸 Voir sur la carte</button><button class="btn danger" id="pDel">🗑 Supprimer${n.kind !== 'item' && kids(n.id).length ? ' (+ contenu)' : ''}</button></div>`;
  B.innerHTML = h;

  B.querySelectorAll('[data-goto]').forEach(e => e.onclick = () => openEditor(byId(e.dataset.goto)));
  B.querySelectorAll('[data-unlink]').forEach(b => b.onclick = () => { snapshot(); removeEdgeById(b.dataset.unlink); commit(); openEditor(n); });
  const addLink = () => {
    const v = $('#lkIn').value.trim(); if (!v) return;
    const t = resolveLabel(v);
    if (!t || t === n) { toast('Élément introuvable'); return; }
    const k = $('#lkKind').value; snapshot();
    if (k === 'bloque') addEdge(t.id, n.id, 'depend'); else addEdge(n.id, t.id, k);
    commit(); openEditor(n);
  };
  $('#lkGo').onclick = addLink;
  $('#lkIn').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } });
  $('#pContacted') && ($('#pContacted').onclick = () => { n.lastContact = iso(TODAY()); if (n.status === 'a_contacter') n.status = 'contacte'; commit(); openEditor(n); toast('📞 Contact noté'); });
  $('#pMap').onclick = () => hooks.showOnMap(n);
  $('#pDel').onclick = () => {
    const nb = kids(n.id).length;
    if (nb && !confirm(`Supprimer « ${n.title} » et son contenu ?`)) return;
    snapshot(); removeNode(n.id); closeEditor(); commit();
    toast('🗑 Supprimé', { label: 'Annuler', fn: hooks.undo });
  };
  let snapTaken = false;
  B.querySelectorAll('[data-f]').forEach(inp => {
    const ev = inp.tagName === 'SELECT' || inp.type === 'date' ? 'change' : 'input';
    inp.addEventListener(ev, () => {
      if (!snapTaken) { snapshot(); snapTaken = true; }
      const f = inp.dataset.f, v = inp.value;
      if (f === 'prio') n.prio = +v;
      else if (f === 'type') {
        const was = n.type === 'fournisseur'; n.type = v;
        if (v === 'fournisseur' && !was) n.status = 'a_contacter';
        if (v !== 'fournisseur' && was) n.status = 'a_faire';
      } else if (f === 'status') {
        n.status = v;
        if (n.type === 'fournisseur' && v !== 'a_contacter') n.lastContact = iso(TODAY());
        n.doneAt = (v === 'fait' || v === 'livre') ? iso(TODAY()) : null;
      } else n[f] = v || (f === 'title' ? '' : null);
      commit();
      if (['type', 'status', 'parent', 'due', 'prio', 'lastContact', 'effort', 'phone', 'email'].includes(f) && ev === 'change') openEditor(n);
    });
  });
  if (focusTitle) { const t = B.querySelector('[data-f=title]'); t.focus(); t.select(); }
}

// Fournisseur depuis un champ texte (formulaire)
export const supplierFromInput = (name, parent) => (name ? getSupplier(name, parent) : null);
export { suppliers };
