// Vues liste : Focus (liste priorisée + matrice), Projets, Fournisseurs.
import { TYPES, SUP_ST, SUP_COL } from './config.js';
import { $, esc, fmtDate, iso, addDays, diffDays, toast, isMobile } from './utils.js';
import { S, byId, kids, projectOf, projects, suppliers, tasks, pathLabel, suppliersOf, tasksOfSupplier, setDone, snapshot, commit, getProject } from './store.js';
import { auto, isDone, score, bucket, BUCKETS, quadrant, QUADS, counts } from './rules.js';

export const vs = {
  mode: localStorage.getItem('bb-fmode') || 'list',
  seg: null, project: null, showDone: false,
  expanded: new Set(JSON.parse(localStorage.getItem('bb-exp') || '[]')),
};
let hooks;

const SEGMENTS = [
  [null, 'Tout'], ['rapide', '⚡ Rapides'], ['rdv', '📞 Appels'], ['achat', '🛒 Achats'],
  ['probleme', '⚠️ Problèmes'], ['livrable', '📦 Livrables'], ['question', '❓ Questions'], ['idee', '💡 Idées'],
];

// ── Ligne de tâche (balayable) ──
function row(n) {
  const T = TYPES[n.type], a = auto(n), done = isDone(n), pr = projectOf(n);
  const meta = [];
  if (pr) meta.push(`<span><i class="dot" style="background:${pr.hue}"></i>${esc(pathLabel(n))}</span>`);
  if (n.due) meta.push(`<span class="${!done && diffDays(n.due) < 0 ? 'late' : ''}">📅 ${fmtDate(n.due)}</span>`);
  suppliersOf(n).forEach(s => meta.push(`<span>🏭 ${esc(s.title)}</span>`));
  if (!done) a.b.filter(([, t]) => !t.startsWith('⏰')).slice(0, 2).forEach(([c, t]) => meta.push(`<span class="bd bd-${c}">${esc(t)}</span>`));
  const flag = n.prio === 2 ? '🔥' : n.prio === 1 ? '⬆︎' : '';
  return `<div class="trow${done ? ' done' : ''}${a.cls.includes('waiting') ? ' waiting' : ''}" data-id="${n.id}" style="--c:${T.color}">
    <div class="trow-in"><button class="chk" aria-label="Terminer">✓</button>
      <div class="rt-main"><div class="rt-title">${T.icon} ${esc(n.title)}</div><div class="rt-meta">${meta.join('')}</div></div>
      ${flag ? `<span class="flag">${flag}</span>` : ''}</div></div>`;
}

function pool() {
  let L = tasks().filter(n => n.type !== 'note');
  L = vs.seg === 'idee' ? L.filter(n => n.type === 'idee') : L.filter(n => n.type !== 'idee');
  if (vs.seg === 'rapide') L = L.filter(n => n.effort === 's');
  else if (vs.seg && vs.seg !== 'idee') L = L.filter(n => n.type === vs.seg);
  if (vs.project) L = L.filter(n => projectOf(n)?.id === vs.project);
  return L;
}

function chipsHTML() {
  const segs = SEGMENTS.map(([k, l]) => `<button class="chip-f${vs.seg === k ? ' on' : ''}" data-seg="${k ?? ''}">${l}</button>`).join('');
  const prs = projects().map(p => `<button class="chip-f pj${vs.project === p.id ? ' on' : ''}" data-proj="${p.id}" style="--h:${p.hue}"><i class="dot" style="background:${p.hue}"></i>${esc(p.title)}</button>`).join('');
  return `<div class="chips">${segs}</div><div class="chips">${prs}</div>`;
}

export function renderFocus() {
  const c = $('#v-focus');
  const L = pool();
  const open = L.filter(n => !isDone(n)).sort((a, b) => score(b) - score(a));
  const doneToday = L.filter(n => isDone(n) && n.doneAt === iso(new Date()));
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  let h = `<div class="wrap"><div class="vhead"><div><h2>🎯 Focus</h2><div class="mut">${today} · ${open.length} à faire</div></div>
    <div class="seg"><button data-fmode="list" class="${vs.mode === 'list' ? 'on' : ''}">Liste</button><button data-fmode="matrix" class="${vs.mode === 'matrix' ? 'on' : ''}">Matrice</button></div></div>
    ${chipsHTML()}`;
  if (!open.length) {
    h += `<div class="emptyst">🎉<br><b>Rien à faire ici.</b><br>Appuie sur 🎙️ pour vider ta tête.</div>`;
  } else if (vs.mode === 'matrix') {
    h += '<div class="matrix">';
    for (const [k, Q] of Object.entries(QUADS)) {
      const q = open.filter(n => quadrant(n) === k);
      h += `<div class="quad" style="--q:${Q.color}"><h4>${Q.label} <span>${q.length}</span></h4><small>${Q.hint}</small>${q.map(row).join('') || '<div class="mut">—</div>'}</div>`;
    }
    h += '</div>';
  } else {
    const top = open.filter(n => !auto(n).cls.includes('waiting')).slice(0, 3);
    const topIds = new Set(top.map(n => n.id));
    h += `<div class="hero"><h3>⭐ Ton top 3</h3><div class="mut sm">Classé selon échéance, priorité, blocages et ce que ça débloque.</div>${top.map(row).join('')}</div>`;
    for (const [k, label] of Object.entries(BUCKETS)) {
      const g = open.filter(n => !topIds.has(n.id) && bucket(n) === k);
      if (g.length) h += `<section class="sec"><h4>${label} <span>${g.length}</span></h4>${g.map(row).join('')}</section>`;
    }
  }
  if (doneToday.length) {
    h += `<section class="sec"><h4 data-toggle-done style="cursor:pointer">✅ Terminées aujourd'hui <span>${doneToday.length}</span> ${vs.showDone ? '▾' : '▸'}</h4>${vs.showDone ? doneToday.map(row).join('') : ''}</section>`;
  }
  h += `<p class="mut sm swipehint">${isMobile() ? 'Glisse une tâche → pour la terminer, ← pour la reporter à demain.' : 'Astuce : glisse une ligne vers la droite pour terminer, vers la gauche pour reporter à demain.'}</p></div>`;
  c.innerHTML = h;
}

export function renderProjects() {
  const c = $('#v-projects');
  let h = `<div class="wrap"><div class="vhead"><div><h2>📁 Projets</h2><div class="mut">${projects().length} projets</div></div><button class="btn" data-newproj>＋ Projet</button></div>`;
  const sortItems = arr => arr.sort((a, b) => isDone(a) - isDone(b) || score(b) - score(a));
  for (const p of projects()) {
    const k = counts(p.id), pct = k.total ? Math.round(k.done / k.total * 100) : 0, ex = vs.expanded.has(p.id);
    h += `<div class="pcard" style="--h:${p.hue}"><div class="pc-hd" data-pexp="${p.id}">
      <div class="pc-t"><b>${esc(p.title)}</b><div class="mut sm">${k.done}/${k.total} terminées${k.late ? ` · <span class="late">⚠ ${k.late} en retard</span>` : ''}</div>
      <div class="pbar"><i style="width:${pct}%"></i></div></div>
      <button class="btn sm" data-addto="${p.id}">＋</button><span class="caret">${ex ? '▾' : '▸'}</span></div>`;
    if (ex) {
      h += '<div class="pc-bd">';
      const direct = sortItems(kids(p.id).filter(n => n.kind === 'item' && n.type !== 'fournisseur'));
      h += direct.map(row).join('');
      for (const s of kids(p.id).filter(n => n.kind === 'sub')) {
        const items = sortItems(kids(s.id).filter(n => n.kind === 'item' && n.type !== 'fournisseur'));
        h += `<div class="sub-h">📂 ${esc(s.title)} <button class="btn sm" data-addto="${s.id}">＋</button></div>${items.map(row).join('') || '<div class="mut sm">Vide</div>'}`;
      }
      const sups = [...new Set([...suppliers().filter(s => projectOf(s)?.id === p.id)])];
      if (sups.length) h += `<div class="sub-h">🏭 Fournisseurs</div><div class="supchips">${sups.map(s => `<button class="chip-f" data-open="${s.id}"><i class="dot" style="background:${SUP_COL[s.status]}"></i>${esc(s.title)} · ${SUP_ST[s.status]}</button>`).join('')}</div>`;
      h += '</div>';
    }
    h += '</div>';
  }
  if (!projects().length) h += `<div class="emptyst">Aucun projet pour l'instant.<br>Dicte « pour le projet X, … » 🎙️</div>`;
  c.innerHTML = h + '</div>';
}

export function renderSuppliers() {
  const c = $('#v-suppliers'), keys = Object.keys(SUP_ST);
  let h = `<div class="wrap wide"><div class="vhead"><div><h2>🏭 Fournisseurs</h2><div class="mut">${suppliers().length} fournisseurs · suivi du contact à la livraison</div></div><button class="btn" data-newsup>＋ Fournisseur</button></div><div class="kb">`;
  for (const st of keys) {
    const list = suppliers().filter(s => s.status === st);
    h += `<div class="kcol"><h4><span style="color:${SUP_COL[st]}">● ${SUP_ST[st]}</span><span>${list.length}</span></h4>`;
    for (const s of list) {
      const linked = tasksOfSupplier(s), open = linked.filter(x => !isDone(x)).length;
      const projs = [...new Set([projectOf(s), ...linked.map(projectOf)].filter(Boolean).map(p => p.title))];
      const i = keys.indexOf(st);
      h += `<div class="kcard" style="--sc:${SUP_COL[st]}" data-open="${s.id}"><b>${esc(s.title)}</b>
        <div class="km">${projs.map(esc).join(', ')}</div>
        <div class="km">${open} tâche${open > 1 ? 's' : ''} ouverte${open > 1 ? 's' : ''}${s.lastContact ? ' · contact ' + fmtDate(s.lastContact) : ''}${s.amount ? ' · 💶 ' + esc(s.amount) : ''}</div>
        <div>${auto(s).b.map(([k, t]) => `<span class="bd bd-${k}">${esc(t)}</span>`).join(' ')}</div>
        <div class="ka">${s.phone ? `<a href="tel:${esc(s.phone)}" class="ic">📞</a>` : ''}${s.email ? `<a href="mailto:${esc(s.email)}" class="ic">✉️</a>` : ''}<span class="sp"></span>
          <button data-mv="${s.id}" data-d="-1"${i === 0 ? ' disabled' : ''}>◀</button><button data-mv="${s.id}" data-d="1"${i === keys.length - 1 ? ' disabled' : ''}>▶</button></div></div>`;
    }
    h += '</div>';
  }
  c.innerHTML = h + '</div></div>';
}

// ── Interactions (délégation) ──
function toggleDone(n, rowEl) {
  const v = !isDone(n);
  const go = () => { snapshot(); setDone(n, v); commit(); toast(v ? `✅ ${n.title}` : '↩︎ Réouverte', { label: 'Annuler', fn: hooks.undo }); if (v && navigator.vibrate) navigator.vibrate(15); };
  if (rowEl && v) { rowEl.classList.add('gone'); setTimeout(go, 220); } else go();
}
function postpone(n) {
  snapshot(); n.due = iso(addDays(1)); commit();
  toast('📅 Reporté à demain', { label: 'Annuler', fn: hooks.undo });
}

function bind(c) {
  c.addEventListener('click', e => {
    const t = e.target;
    const chk = t.closest('.chk');
    if (chk) { const r = chk.closest('.trow'); toggleDone(byId(r.dataset.id), r); return; }
    const seg = t.closest('[data-seg]'); if (seg) { vs.seg = seg.dataset.seg || null; renderFocus(); return; }
    const pj = t.closest('[data-proj]'); if (pj) { vs.project = vs.project === pj.dataset.proj ? null : pj.dataset.proj; renderFocus(); return; }
    const fm = t.closest('[data-fmode]'); if (fm) { vs.mode = fm.dataset.fmode; localStorage.setItem('bb-fmode', vs.mode); renderFocus(); return; }
    if (t.closest('[data-toggle-done]')) { vs.showDone = !vs.showDone; renderFocus(); return; }
    const add = t.closest('[data-addto]'); if (add) { e.stopPropagation(); hooks.addTo(byId(add.dataset.addto)); return; }
    const px = t.closest('[data-pexp]');
    if (px) { const id = px.dataset.pexp; vs.expanded.has(id) ? vs.expanded.delete(id) : vs.expanded.add(id); localStorage.setItem('bb-exp', JSON.stringify([...vs.expanded])); renderProjects(); return; }
    const mv = t.closest('[data-mv]');
    if (mv) { const s = byId(mv.dataset.mv), keys = Object.keys(SUP_ST); snapshot(); s.status = keys[keys.indexOf(s.status) + +mv.dataset.d]; s.lastContact = iso(new Date()); commit(); return; }
    if (t.closest('a')) return;
    const op = t.closest('[data-open]'); if (op) { hooks.open(byId(op.dataset.open)); return; }
    if (t.closest('[data-newproj]')) { const name = prompt('Nom du projet ?'); if (name) { snapshot(); const p = getProject(name); vs.expanded.add(p.id); commit(); } return; }
    if (t.closest('[data-newsup]')) { hooks.addSupplier(); return; }
  });
  // Balayage des lignes
  let sw = null;
  c.addEventListener('pointerdown', e => {
    const r = e.target.closest('.trow');
    if (!r || e.target.closest('.chk') || e.button > 0) return;
    sw = { r, inner: r.querySelector('.trow-in'), x: e.clientX, y: e.clientY, dx: 0, active: false, id: e.pointerId };
  });
  c.addEventListener('pointermove', e => {
    if (!sw || e.pointerId !== sw.id) return;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    if (!sw.active) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) { sw.active = true; try { sw.inner.setPointerCapture(e.pointerId); } catch (_) {} }
      else if (Math.abs(dy) > 10) { sw = null; return; }
      else return;
    }
    sw.dx = dx; sw.inner.style.transform = `translateX(${dx}px)`;
    sw.r.classList.toggle('sw-r', dx > 0); sw.r.classList.toggle('sw-l', dx < 0);
  });
  const end = e => {
    if (!sw || e.pointerId !== sw.id) return;
    const { r, inner, dx, active } = sw; sw = null;
    if (e.type === 'pointercancel') { inner.style.transform = ''; return; }
    if (!active) { hooks.open(byId(r.dataset.id)); return; }
    inner.style.transition = 'transform .2s';
    const n = byId(r.dataset.id);
    if (dx > 90) { inner.style.transform = 'translateX(110%)'; setTimeout(() => toggleDone(n), 180); }
    else if (dx < -90) { inner.style.transform = 'translateX(-110%)'; setTimeout(() => postpone(n), 180); }
    else { inner.style.transform = ''; setTimeout(() => r.classList.remove('sw-r', 'sw-l'), 200); }
  };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
}

export function initViews(h) {
  hooks = h;
  ['#v-focus', '#v-projects', '#v-suppliers'].forEach(s => bind($(s)));
}
