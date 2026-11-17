// État de l'app + requêtes + mutations. Tout est persisté dans localStorage.
import { PALETTE } from './config.js';
import { uid, iso, TODAY, norm, cap, words } from './utils.js';

const KEY = 'bb-state';
export const S = { version: 2, nodes: [], edges: [] };

const listeners = new Set();
export const onChange = fn => listeners.add(fn);
export function save() { localStorage.setItem(KEY, JSON.stringify(S)); }
export function commit() { save(); listeners.forEach(f => f()); }

export function load() {
  const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (!raw) return false;
  replace(raw); return true;
}
export function replace(data) {
  S.nodes = data.nodes || [];
  S.edges = data.edges || [];
  migrate();
}
function migrate() {
  // v1 → v2 : node.links[] devient S.edges[]
  for (const n of S.nodes) {
    if (n.links) {
      for (const l of n.links) {
        const t = S.nodes.find(x => x.id === l);
        if (t && !S.edges.some(e => e.from === n.id && e.to === l))
          S.edges.push({ id: uid(), from: n.id, to: l, kind: t.type === 'fournisseur' ? 'fournisseur' : 'lien' });
      }
      delete n.links;
    }
  }
  S.edges = S.edges.filter(e => byId(e.from) && byId(e.to));
  S.version = 2;
}

// ── Annuler ──
const undoStack = [];
export function snapshot() {
  undoStack.push(JSON.stringify({ nodes: S.nodes, edges: S.edges }));
  if (undoStack.length > 40) undoStack.shift();
}
export function undo() {
  const s = undoStack.pop(); if (!s) return false;
  replace(JSON.parse(s)); commit(); return true;
}

// ── Requêtes ──
export const byId = id => S.nodes.find(n => n.id === id);
export const kids = id => S.nodes.filter(n => n.parent === id);
export const desc = id => kids(id).flatMap(k => [k, ...desc(k.id)]);
export const projectOf = n => { while (n && n.parent) n = byId(n.parent); return n; };
export const projects = () => S.nodes.filter(n => n.kind === 'project');
export const suppliers = () => S.nodes.filter(n => n.type === 'fournisseur');
export const tasks = () => S.nodes.filter(n => n.kind === 'item' && n.type !== 'fournisseur');
export const edgesOf = id => S.edges.filter(e => e.from === id || e.to === id);
export const otherEnd = (e, id) => byId(e.from === id ? e.to : e.from);
export const suppliersOf = n => S.edges.filter(e => e.from === n.id && e.kind === 'fournisseur').map(e => byId(e.to)).filter(Boolean);
export const tasksOfSupplier = s => S.edges.filter(e => e.to === s.id && e.kind === 'fournisseur').map(e => byId(e.from)).filter(Boolean);
export const depsOf = n => S.edges.filter(e => e.from === n.id && e.kind === 'depend').map(e => byId(e.to)).filter(Boolean);
export const dependentsOf = n => S.edges.filter(e => e.to === n.id && e.kind === 'depend').map(e => byId(e.from)).filter(Boolean);
export function pathLabel(n) {
  const p = []; let x = n.parent ? byId(n.parent) : null;
  while (x) { p.unshift(x.title); x = x.parent ? byId(x.parent) : null; }
  return p.join(' › ');
}

// ── Mutations ──
export function mk(o) {
  const n = { id: uid(), notes: '', x: null, y: null, created: iso(TODAY()), ...o };
  S.nodes.push(n); return n;
}
export function getProject(name) {
  name = cap(String(name).trim());
  return projects().find(p => norm(p.title) === norm(name))
    || mk({ kind: 'project', title: name, parent: null, hue: PALETTE[projects().length % PALETTE.length] });
}
export function getSub(p, name) {
  name = cap(String(name).trim());
  return kids(p.id).find(s => s.kind === 'sub' && norm(s.title) === norm(name))
    || mk({ kind: 'sub', title: name, parent: p.id });
}
export function findSupplier(name) {
  const k = norm(name); if (!k) return null;
  return suppliers().find(s => { const a = norm(s.title); return a === k || (k.length > 3 && (a.includes(k) || k.includes(a))); }) || null;
}
export function getSupplier(name, parent) {
  name = cap(String(name).trim());
  return findSupplier(name) || mk({ kind: 'item', type: 'fournisseur', title: name, parent: parent.id, status: 'a_contacter', contact: '', phone: '', email: '', amount: '', lastContact: null, prio: 0 });
}
export function setDone(n, v = true) {
  if (n.type === 'fournisseur') n.status = v ? 'livre' : 'commande';
  else n.status = v ? 'fait' : 'a_faire';
  n.doneAt = v ? iso(TODAY()) : null;
}
export function addEdge(from, to, kind = 'lien') {
  if (!from || !to || from === to) return null;
  if (kind === 'lien' && byId(to)?.type === 'fournisseur') kind = 'fournisseur';
  if (kind === 'lien' && byId(from)?.type === 'fournisseur') { [from, to] = [to, from]; kind = 'fournisseur'; }
  const ex = S.edges.find(e => (e.from === from && e.to === to) || (e.from === to && e.to === from));
  if (ex) { ex.kind = kind; if (kind === 'depend') { ex.from = from; ex.to = to; } return ex; }
  const e = { id: uid(), from, to, kind }; S.edges.push(e); return e;
}
export function removeEdge(a, b) {
  const n = S.edges.length;
  S.edges = S.edges.filter(e => !((e.from === a && e.to === b) || (e.from === b && e.to === a)));
  return n !== S.edges.length;
}
export const removeEdgeById = id => { S.edges = S.edges.filter(e => e.id !== id); };
export function removeNode(id) {
  const ids = new Set([id, ...desc(id).map(x => x.id)]);
  S.nodes = S.nodes.filter(x => !ids.has(x.id));
  S.edges = S.edges.filter(e => !ids.has(e.from) && !ids.has(e.to));
  return ids.size;
}

// Recherche floue d'un élément par son titre (pour les commandes vocales)
export function findBest(q, pred = () => true) {
  const qn = norm(q), qw = words(q);
  if (!qn) return null;
  let best = null, bs = 0;
  for (const n of S.nodes) {
    if (!pred(n)) continue;
    const tn = norm(n.title); let s = 0;
    if (tn === qn) s = 2;
    else if (tn.includes(qn) || (tn.length > 3 && qn.includes(tn))) s = 1.2;
    else {
      const nw = words(n.title);
      if (!nw.length || !qw.length) continue;
      const hit = qw.filter(w => nw.some(x => x === w || (w.length > 3 && x.length > 3 && (x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5)))))).length;
      s = hit / qw.length * 0.6 + hit / nw.length * 0.4;
    }
    if (n.status === 'fait') s -= 0.05;
    if (s > bs) { bs = s; best = n; }
  }
  return bs >= 0.5 ? best : null;
}
