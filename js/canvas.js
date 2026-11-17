// Carte façon Miro : arborescence projet → sous-projet → éléments, liens entre éléments.
import { TYPES, TYPE_ORDER, TASK_ST, SUP_ST, SUP_COL, LINK_KINDS } from './config.js';
import { $, esc, fmtDate, toast } from './utils.js';
import { S, byId, kids, desc, projectOf, projects, mk, getProject, addEdge, commit, save, suppliersOf, tasksOfSupplier, edgesOf, snapshot } from './store.js';
import { auto, counts, isDone } from './rules.js';

export const cv = {
  view: JSON.parse(localStorage.getItem('bb-view') || 'null') || { x: 80, y: 40, k: 0.9 },
  firstVisit: !localStorage.getItem('bb-view'),
  hidden: new Set(JSON.parse(localStorage.getItem('bb-hidden') || '[]')),
  selected: null,
};
let hooks, vp, world, nodesEl, edgesEl, els = {};
const COLW = 300;

export function isVisible(n) {
  if (n.kind === 'item' && cv.hidden.has(n.type)) return false;
  let p = n.parent ? byId(n.parent) : null;
  while (p) { if (p.collapsed) return false; p = p.parent ? byId(p.parent) : null; }
  return true;
}

function nodeHTML(n) {
  if (n.kind === 'project') {
    const c = counts(n.id), pct = c.total ? Math.round(c.done / c.total * 100) : 0;
    return `<div class="ptitle">${esc(n.title)}</div><div class="prog"><i style="width:${pct}%"></i></div>
      <div class="pstats">${c.done}/${c.total} terminées · ${pct}%${c.late ? ` · <b>⚠ ${c.late} en retard</b>` : ''}</div>`;
  }
  if (n.kind === 'sub') {
    const c = counts(n.id);
    return `<div>${esc(n.title)}</div><div class="sstats">${c.done}/${c.total} terminées${c.late ? ` · <span style="color:#dc2626">⚠ ${c.late} en retard</span>` : ''}</div>`;
  }
  const T = TYPES[n.type], a = auto(n), chips = [];
  if (n.type === 'fournisseur') {
    chips.push(`<span class="chip" style="background:${SUP_COL[n.status]};color:#fff">${SUP_ST[n.status]}</span>`);
    const nb = tasksOfSupplier(n).length; if (nb) chips.push(`<span class="chip">🔗 ${nb} tâche${nb > 1 ? 's' : ''}</span>`);
    if (n.contact) chips.push(`<span class="chip">👤 ${esc(n.contact)}</span>`);
    if (n.amount) chips.push(`<span class="chip">💶 ${esc(n.amount)}</span>`);
  } else if (n.status !== 'a_faire') chips.push(`<span class="chip">${TASK_ST[n.status]}</span>`);
  if (n.due) chips.push(`<span class="chip">📅 ${fmtDate(n.due)}</span>`);
  suppliersOf(n).forEach(s => chips.push(`<span class="chip sup">🏭 ${esc(s.title)}</span>`));
  const lk = edgesOf(n.id).filter(e => e.kind === 'lien').length;
  if (lk) chips.push(`<span class="chip">🔗 ${lk}</span>`);
  a.b.forEach(([c, t]) => chips.push(`<span class="bd bd-${c}">${esc(t)}</span>`));
  return `<div class="hd"><span>${T.icon}</span><span>${T.label}</span>${n.prio ? `<span class="pr">${n.prio === 2 ? '🔥' : '⬆︎'}</span>` : ''}</div>
    <div class="title">${esc(n.title)}</div>${chips.length ? `<div class="meta">${chips.join('')}</div>` : ''}`;
}

export function renderCanvas() {
  nodesEl.innerHTML = ''; els = {};
  for (const n of S.nodes) {
    if (!isVisible(n)) continue;
    const el = document.createElement('div');
    const a = auto(n);
    el.className = ['node', n.kind, n.kind === 'item' ? `item shape-${TYPES[n.type].shape} st-${n.status} prio-${n.prio || 0}` : '', ...a.cls, cv.selected === n.id ? 'sel' : ''].join(' ');
    el.style.setProperty('--h', projectOf(n)?.hue || '#4f46e5');
    if (n.kind === 'item') el.style.setProperty('--c', TYPES[n.type].color);
    el.style.left = (n.x ?? 0) + 'px'; el.style.top = (n.y ?? 0) + 'px';
    el.dataset.id = n.id;
    let html = nodeHTML(n);
    if (n.kind !== 'item') {
      html += `<button class="addc" data-add="${n.id}" title="Ajouter un élément">+</button>`;
      if (kids(n.id).length) html += `<button class="tog" data-tog="${n.id}" title="Replier / déplier">${n.collapsed ? '▸ ' + desc(n.id).length : '▾'}</button>`;
    }
    html += `<span class="lnk" title="Glisser vers un autre élément pour créer un lien">🔗</span>`;
    el.innerHTML = html;
    nodesEl.appendChild(el); els[n.id] = el;
  }
  for (const id in els) { const n = byId(id); n._w = els[id].offsetWidth; n._h = els[id].offsetHeight; }
  drawEdges(); renderLegend();
}

function path(a, b) {
  let x1 = a.x + a._w, y1 = a.y + a._h / 2, x2 = b.x, y2 = b.y + b._h / 2;
  if (b.x + b._w / 2 < a.x + a._w / 2) { x1 = a.x; x2 = b.x + b._w; }
  const dx = Math.max(40, Math.abs(x2 - x1) / 2) * (x2 >= x1 ? 1 : -1);
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}
const placed = id => els[id] && byId(id).x != null;

function drawEdges() {
  let s = `<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${LINK_KINDS.depend.color}"/></marker></defs>`;
  for (const id in els) {
    const n = byId(id);
    if (!placed(id) || !n.parent || !placed(n.parent)) continue;
    const col = n.kind === 'item' ? TYPES[n.type].color : projectOf(n).hue;
    s += `<path d="${path(byId(n.parent), n)}" stroke="${col}" stroke-width="${n.kind === 'sub' ? 3.5 : 2}" opacity="${isDone(n) ? 0.3 : 0.75}"/>`;
  }
  for (const e of S.edges) {
    if (!placed(e.from) || !placed(e.to)) continue;
    const K = LINK_KINDS[e.kind] || LINK_KINDS.lien;
    const hot = cv.selected && (e.from === cv.selected || e.to === cv.selected);
    const d = e.kind === 'depend' ? path(byId(e.to), byId(e.from)) : path(byId(e.from), byId(e.to));
    s += `<path d="${d}" stroke="${K.color}" stroke-width="${hot ? 3.5 : 2.2}" ${K.dash ? `stroke-dasharray="${K.dash}"` : ''} opacity="${hot ? 1 : 0.7}" ${e.kind === 'depend' ? 'marker-end="url(#arr)"' : ''}/>`;
  }
  s += '<path id="tmpLink" d="" stroke="#2563eb" stroke-width="2.5" stroke-dasharray="5 5"/>';
  edgesEl.innerHTML = s;
}

function renderLegend() {
  const lg = $('#legend'); lg.innerHTML = '';
  for (const k of TYPE_ORDER) {
    const T = TYPES[k], n = S.nodes.filter(x => x.type === k).length;
    const e = document.createElement('span');
    e.className = 'lg' + (cv.hidden.has(k) ? ' off' : '');
    e.style.setProperty('--c', T.color);
    e.innerHTML = `${T.icon} ${T.label} <b>${n}</b>`; e.title = 'Afficher / masquer';
    e.onclick = () => { cv.hidden.has(k) ? cv.hidden.delete(k) : cv.hidden.add(k); localStorage.setItem('bb-hidden', JSON.stringify([...cv.hidden])); renderCanvas(); };
    lg.appendChild(e);
  }
  const k = document.createElement('span'); k.className = 'lg lk-legend';
  k.innerHTML = `<i style="border-top:2px dashed ${LINK_KINDS.lien.color}"></i>Lien <i style="border-top:2px solid ${LINK_KINDS.depend.color}"></i>Dépend de <i style="border-top:2px dashed ${LINK_KINDS.fournisseur.color}"></i>Fournisseur`;
  lg.appendChild(k);
}

// ── Mise en page automatique (arbre gauche → droite) ──
export function layout() {
  const GAP = 16; let y = 0;
  const order = (a, b) => (a.kind !== 'item') - (b.kind !== 'item') || (a.type === 'fournisseur') - (b.type === 'fournisseur')
    || TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || isDone(a) - isDone(b);
  function place(n, depth, top) {
    const h0 = (n._h || 70) + GAP;
    const c = n.collapsed ? [] : kids(n.id).filter(isVisible).sort(order);
    let h = h0;
    if (c.length) { let t = top; for (const k of c) t += place(k, depth + 1, t); h = Math.max(t - top, h0); }
    n.x = depth * COLW; n.y = top + h / 2 - h0 / 2;
    return h;
  }
  for (const p of projects()) y += place(p, 0, y) + 60;
  S.nodes.filter(n => n.x == null).forEach((n, i) => { n.x = 0; n.y = y + i * 90; });
}
export function placeNew(n) {
  const p = n.parent ? byId(n.parent) : null;
  if (!p || p.x == null) { n.x = 0; n.y = Math.max(0, ...S.nodes.filter(x => x.y != null).map(x => x.y + (x._h || 70))) + 80; return; }
  const sib = kids(p.id).filter(k => k !== n && k.x != null);
  n.x = p.x + COLW; n.y = sib.length ? Math.max(...sib.map(s => s.y + (s._h || 70))) + 16 : p.y;
}

// ── Vue : pan / zoom / pinch ──
export function applyView() {
  const v = cv.view;
  world.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.k})`;
  vp.style.backgroundSize = `${22 * v.k}px ${22 * v.k}px`;
  vp.style.backgroundPosition = `${v.x}px ${v.y}px`;
}
const saveView = () => localStorage.setItem('bb-view', JSON.stringify(cv.view));
export function zoomAt(cx, cy, f) {
  const r = vp.getBoundingClientRect(), v = cv.view, nk = Math.min(2.5, Math.max(0.15, v.k * f));
  const px = cx - r.left, py = cy - r.top;
  v.x = px - (px - v.x) * nk / v.k; v.y = py - (py - v.y) * nk / v.k; v.k = nk;
  applyView(); saveView();
}
export function fit() {
  const vis = S.nodes.filter(n => els[n.id] && n.x != null); if (!vis.length) return;
  const x0 = Math.min(...vis.map(n => n.x)), y0 = Math.min(...vis.map(n => n.y));
  const x1 = Math.max(...vis.map(n => n.x + n._w)), y1 = Math.max(...vis.map(n => n.y + n._h));
  const W = vp.clientWidth, H = vp.clientHeight - 70, v = cv.view;
  v.k = Math.min(1.2, Math.max(0.15, Math.min(W / (x1 - x0 + 120), H / (y1 - y0 + 120))));
  v.x = (W - (x1 - x0) * v.k) / 2 - x0 * v.k; v.y = (H - (y1 - y0) * v.k) / 2 - y0 * v.k + 10;
  applyView(); saveView();
}
export function centerOn(n) {
  let p = n.parent ? byId(n.parent) : null;
  while (p) { p.collapsed = false; p = p.parent ? byId(p.parent) : null; }
  cv.hidden.delete(n.type); cv.selected = n.id;
  renderCanvas();
  if (n.x == null) return;
  const v = cv.view; v.k = Math.max(v.k, 0.9);
  v.x = vp.clientWidth / 2 - (n.x + n._w / 2) * v.k; v.y = vp.clientHeight / 2 - (n.y + n._h / 2) * v.k;
  applyView(); saveView();
}
export const select = id => { cv.selected = id; renderCanvas(); };

export function initCanvas(h) {
  hooks = h;
  vp = $('#vp'); world = $('#world'); nodesEl = $('#nodes'); edgesEl = $('#edges');
  applyView();
  vp.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
    else { cv.view.x -= e.deltaX; cv.view.y -= e.deltaY; applyView(); saveView(); }
  }, { passive: false });
  $('#zIn').onclick = () => { const r = vp.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.2); };
  $('#zOut').onclick = () => { const r = vp.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.2); };
  $('#zFit').onclick = fit;

  const ptrs = new Map(); let drag = null, pinch = null;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const toWorld = (cx, cy) => { const r = vp.getBoundingClientRect(); return { x: (cx - r.left - cv.view.x) / cv.view.k, y: (cy - r.top - cv.view.y) / cv.view.k }; };

  vp.addEventListener('pointerdown', e => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: dist(a, b), k: cv.view.k }; drag = null; return; }
    if (e.button !== 0) return;
    const add = e.target.closest('[data-add]');
    if (add) {
      const p = byId(add.dataset.add); snapshot();
      const n = mk({ kind: 'item', type: 'tache', title: 'Nouvelle tâche', parent: p.id, status: 'a_faire', prio: 0, due: null, effort: '' });
      p.collapsed = false; placeNew(n); cv.selected = n.id; commit(); hooks.open(n, { focusTitle: true }); return;
    }
    const tog = e.target.closest('[data-tog]');
    if (tog) { const p = byId(tog.dataset.tog); p.collapsed = !p.collapsed; commit(); return; }
    const lnk = e.target.closest('.lnk');
    const el = e.target.closest('.node');
    if (lnk && el) { drag = { t: 'link', n: byId(el.dataset.id), moved: false }; try { vp.setPointerCapture(e.pointerId); } catch (_) {} return; }
    if (el) {
      const n = byId(el.dataset.id);
      if (e.shiftKey && cv.selected && cv.selected !== n.id) {
        snapshot(); addEdge(cv.selected, n.id, 'lien'); commit(); toast('🔗 Lien créé', { label: 'Annuler', fn: hooks.undo }); return;
      }
      const group = [n, ...(n.kind !== 'item' && !e.altKey ? desc(n.id) : [])];
      drag = { t: 'node', n, g: group.map(g => ({ g, x: g.x, y: g.y })), sx: e.clientX, sy: e.clientY, moved: false };
    } else drag = { t: 'pan', sx: e.clientX, sy: e.clientY, vx: cv.view.x, vy: cv.view.y, moved: false };
    try { vp.setPointerCapture(e.pointerId); } catch (_) {}
  });
  vp.addEventListener('pointermove', e => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const target = pinch.k * dist(a, b) / pinch.d;
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, target / cv.view.k); return;
    }
    if (!drag) return;
    if (drag.t === 'link') {
      drag.moved = true;
      const n = drag.n, w = toWorld(e.clientX, e.clientY);
      const x1 = n.x + n._w, y1 = n.y + n._h / 2;
      $('#tmpLink').setAttribute('d', `M${x1},${y1} C${x1 + 60},${y1} ${w.x - 60},${w.y} ${w.x},${w.y}`);
      return;
    }
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    if (drag.t === 'pan') { cv.view.x = drag.vx + dx; cv.view.y = drag.vy + dy; applyView(); vp.classList.add('panning'); }
    else {
      for (const { g, x, y } of drag.g) {
        g.x = x + dx / cv.view.k; g.y = y + dy / cv.view.k;
        const el = els[g.id]; if (el) { el.style.left = g.x + 'px'; el.style.top = g.y + 'px'; }
      }
      drawEdges();
    }
  });
  const end = e => {
    ptrs.delete(e.pointerId);
    if (pinch) { if (ptrs.size < 2) { pinch = null; saveView(); } drag = null; return; }
    if (!drag) return;
    vp.classList.remove('panning');
    const d = drag; drag = null;
    if (e.type === 'pointercancel') return;
    if (d.t === 'link') {
      $('#tmpLink')?.setAttribute('d', '');
      const t = document.elementFromPoint(e.clientX, e.clientY)?.closest('.node');
      if (t && t.dataset.id !== d.n.id) {
        snapshot(); const ed = addEdge(d.n.id, t.dataset.id, 'lien'); commit();
        toast(ed.kind === 'fournisseur' ? '🏭 Fournisseur lié' : '🔗 Lien créé — modifiable dans le panneau', { label: 'Annuler', fn: hooks.undo });
      } else if (!d.moved) { cv.selected = d.n.id; renderCanvas(); hooks.open(d.n); }
      return;
    }
    if (d.t === 'node' && !d.moved) { cv.selected = d.n.id; renderCanvas(); hooks.open(d.n); }
    else if (d.t === 'pan' && !d.moved) { if (cv.selected) { cv.selected = null; renderCanvas(); } hooks.close(); }
    else if (d.t === 'node') save();
    saveView();
  };
  vp.addEventListener('pointerup', end);
  vp.addEventListener('pointercancel', end);
  vp.addEventListener('dblclick', e => {
    if (e.target.closest('.node')) return;
    const w = toWorld(e.clientX, e.clientY); snapshot();
    const n = mk({ kind: 'item', type: 'note', title: 'Nouvelle note', parent: getProject('Inbox').id, status: 'a_faire', prio: 0, due: null, effort: '' });
    n.x = w.x; n.y = w.y; cv.selected = n.id; commit(); hooks.open(n, { focusTitle: true });
  });
}
