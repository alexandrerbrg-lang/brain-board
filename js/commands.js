// Exécute les entrées produites par le parseur local ou par l'IA.
import { TYPES, TASK_ST, SUP_ST } from './config.js';
import { iso, TODAY, fmtDate, norm } from './utils.js';
import { byId, mk, getProject, getSub, getSupplier, addEdge, removeEdge, removeNode, findBest, setDone } from './store.js';
import { parseDate } from './parser.js';

export function ingestItem(it) {
  const p = getProject(it.project || 'Inbox');
  const parent = it.sub ? getSub(p, it.sub) : p;
  const type = TYPES[it.type] ? it.type : 'tache';
  if (type === 'fournisseur') {
    const s = getSupplier(it.supplier || it.title, parent);
    const st = SUP_ST[it.status] ? it.status : SUP_ST[it.supplierStatus] ? it.supplierStatus : null;
    if (st) { s.status = st; if (st !== 'a_contacter') s.lastContact = iso(TODAY()); }
    if (it.due) s.due = it.due;
    for (const f of ['contact', 'email', 'phone', 'amount', 'notes']) if (it[f]) s[f] = it[f];
    return s;
  }
  const n = mk({
    kind: 'item', type, title: it.title, parent: parent.id,
    status: TASK_ST[it.status] ? it.status : 'a_faire', due: it.due || null,
    prio: +it.prio || 0, effort: it.effort || '', notes: it.notes || '',
  });
  if (n.status === 'fait') n.doneAt = iso(TODAY());
  if (it.supplier) {
    const s = getSupplier(it.supplier, parent);
    addEdge(n.id, s.id, 'fournisseur');
    if (SUP_ST[it.supplierStatus]) { s.status = it.supplierStatus; s.lastContact = iso(TODAY()); }
  }
  return n;
}

function applySet(n, value, res) {
  const v = norm(value);
  if (/critique|urgent/.test(v)) n.prio = 2;
  else if (/important|haute/.test(v)) n.prio = 1;
  else if (/normal|basse/.test(v)) n.prio = 0;
  else if (/cours/.test(v)) n.status = 'en_cours';
  else if (/bloqu/.test(v)) n.status = 'bloque';
  res.done.push(`⚙︎ ${n.title} → ${value}`);
}

// entries : [{kind:'item',…} | {kind:'cmd', action, a, b, rel, …}]
// a / b peuvent être : un id, une ref IA ("new1"), "@last", ou un texte à retrouver.
export function run(entries) {
  const res = { added: [], done: [], errors: [] };
  const refs = {}; let last = null;
  const resolve = x => {
    if (!x) return null;
    if (x === '@last') return last;
    return (refs[x] && byId(refs[x])) || byId(x) || findBest(x);
  };
  for (const e of entries) {
    if (e.kind === 'item') {
      const n = ingestItem(e);
      if (n) { last = n; if (e.ref) refs[e.ref] = n.id; if (!res.added.includes(n)) res.added.push(n); }
      if (n && e.linkTo) { const t = resolve(e.linkTo); if (t) addEdge(n.id, t.id, 'lien'); }
      continue;
    }
    const a = resolve(e.a);
    const b = e.b != null ? (e.action === 'move' ? (byId(e.b) || findBest(e.b, n => n.kind !== 'item')) : resolve(e.b)) : null;
    const needsB = e.action === 'link' || e.action === 'unlink';
    if (e.strict && (!a || (needsB && (!b || a === b)))) {
      if (e.fallback) { const n = ingestItem(e.fallback); last = n; res.added.push(n); }
      continue;
    }
    if (!a) { res.errors.push(`Introuvable : « ${e.a === '@last' ? 'élément précédent' : e.a} »`); continue; }
    switch (e.action) {
      case 'link':
        if (!b || a === b) { res.errors.push(`Introuvable : « ${e.b} »`); break; }
        addEdge(a.id, b.id, e.rel || 'lien');
        res.done.push(e.rel === 'depend' ? `⏳ « ${a.title} » dépend de « ${b.title} »` : `🔗 « ${a.title} » ↔ « ${b.title} »`);
        break;
      case 'unlink':
        if (b && removeEdge(a.id, b.id)) res.done.push(`✂️ Lien retiré : ${a.title} / ${b.title}`);
        else res.errors.push(`Aucun lien trouvé entre « ${e.a} » et « ${e.b} »`);
        break;
      case 'done': setDone(a, true); res.done.push(`✅ ${a.title}`); break;
      case 'set': applySet(a, e.value, res); break;
      case 'due': {
        const d = e.due ? { date: e.due } : parseDate(e.when || '');
        if (!d) { res.errors.push(`Date non comprise : « ${e.when} »`); break; }
        a.due = d.date; res.done.push(`📅 ${a.title} → ${fmtDate(d.date)}`); break;
      }
      case 'move': {
        if (a.kind === 'project') { res.errors.push('Un projet ne se déplace pas'); break; }
        const dest = b || getProject(e.b);
        a.parent = dest.id; res.done.push(`📁 ${a.title} → ${dest.title}`); break;
      }
      case 'delete': removeNode(a.id); res.done.push(`🗑 ${a.title}`); break;
      default: res.errors.push(`Commande inconnue : ${e.action}`);
    }
    if (e.action !== 'delete') last = a;
  }
  return res;
}
