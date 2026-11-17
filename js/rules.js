// ─────────────────────────────────────────────────────────────
// AUTOMATISATIONS VISUELLES + PRIORISATION
// Ajouter une règle = ajouter un objet dans RULES :
//   when(n)  → la règle s'applique ?
//   cls      → classe CSS ajoutée sur la carte (overdue, soon, waiting…)
//   badge(n) → [couleur, texte]  (couleurs : red org blu grn pur)
// ─────────────────────────────────────────────────────────────
import { CFG } from './config.js';
import { diffDays } from './utils.js';
import { depsOf, dependentsOf, suppliersOf, tasksOfSupplier, desc } from './store.js';

export const isDone = n => (n.type === 'fournisseur' ? n.status === 'livre' : n.status === 'fait');
const open = n => n.kind === 'item' && !isDone(n);
const openDeps = n => depsOf(n).filter(d => !isDone(d));
const openDependents = n => dependentsOf(n).filter(d => !isDone(d));

export const RULES = [
  { id: 'retard', when: n => open(n) && n.due && diffDays(n.due) < 0, cls: 'overdue', badge: n => ['red', `⏰ En retard ${-diffDays(n.due)} j`] },
  { id: 'aujourdhui', when: n => open(n) && n.due && diffDays(n.due) === 0, cls: 'soon', badge: () => ['org', "⏰ Aujourd'hui"] },
  { id: 'bientot', when: n => open(n) && n.due && diffDays(n.due) > 0 && diffDays(n.due) <= 2, cls: 'soon', badge: n => ['org', `⏰ J-${diffDays(n.due)}`] },
  { id: 'critique', when: n => open(n) && n.prio === 2, badge: () => ['red', '🔥 Critique'] },
  { id: 'attend', when: n => open(n) && openDeps(n).length > 0, cls: 'waiting', badge: n => ['pur', `⏳ Attend : ${openDeps(n)[0].title.slice(0, 26)}`] },
  { id: 'debloque', when: n => open(n) && openDependents(n).length > 0, badge: n => ['blu', `🔓 Débloque ${openDependents(n).length}`] },
  { id: 'rapide', when: n => open(n) && n.effort === 's', badge: () => ['grn', '⚡ Rapide'] },
  { id: 'relance', when: n => n.type === 'fournisseur' && n.status === 'contacte' && n.lastContact && diffDays(n.lastContact) <= -CFG.relanceDays, badge: n => ['org', `🔔 À relancer (${-diffDays(n.lastContact)} j)`] },
  { id: 'devis', when: n => n.type === 'fournisseur' && n.status === 'devis_recu', badge: () => ['blu', '📄 Devis à valider'] },
  { id: 'litige', when: n => n.type === 'fournisseur' && n.status === 'probleme', badge: () => ['red', '⚖️ Litige'] },
  { id: 'contacterVite', when: n => n.type === 'fournisseur' && n.status === 'a_contacter' && tasksOfSupplier(n).some(t => !isDone(t) && t.due && diffDays(t.due) <= 3), badge: () => ['red', '📣 Contacter vite'] },
  { id: 'fournLitige', when: n => open(n) && n.type !== 'fournisseur' && suppliersOf(n).some(s => s.status === 'probleme'), badge: () => ['red', '🏭 Fournisseur en litige'] },
  { id: 'aCloturer', when: n => open(n) && n.type === 'achat' && suppliersOf(n).some(s => s.status === 'livre'), badge: () => ['grn', '✅ Livré — à clôturer'] },
];

export function auto(n) {
  const cls = [], b = [];
  if (n.kind !== 'item') return { cls, b };
  for (const r of RULES) if (r.when(n)) { if (r.cls) cls.push(r.cls); if (r.badge) b.push(r.badge(n)); }
  return { cls, b };
}

// ── Priorisation (matrice d'Eisenhower + score) ──
export const urgent = n => n.prio === 2 || (!!n.due && diffDays(n.due) <= 2);
export const important = n => n.prio >= 1 || n.type === 'probleme' || openDependents(n).length > 0;
export function quadrant(n) { const u = urgent(n), i = important(n); return u && i ? 'do' : i ? 'plan' : u ? 'quick' : 'later'; }
export const QUADS = {
  do:    { label: '🔥 À faire maintenant', hint: 'Urgent & important', color: '#ef4444' },
  plan:  { label: '📅 À planifier',       hint: 'Important, pas urgent', color: '#3b82f6' },
  quick: { label: '⚡ À expédier / déléguer', hint: 'Urgent, peu important', color: '#f59e0b' },
  later: { label: '🧊 Plus tard',          hint: 'Ni urgent ni important', color: '#94a3b8' },
};
export function score(n) {
  let s = (n.prio || 0) * 30;
  if (n.due) { const d = diffDays(n.due); s += d < 0 ? 60 + Math.min(-d, 10) * 3 : Math.max(0, 40 - d * 5); }
  if (n.type === 'probleme') s += 10;
  s += openDependents(n).length * 8;
  if (openDeps(n).length) s -= 40;
  if (n.status === 'bloque') s -= 30;
  if (n.status === 'en_cours') s += 8;
  if (n.effort === 's') s += 4;
  return s;
}
export function bucket(n) {
  if (!n.due) return 'nodate';
  const d = diffDays(n.due);
  return d < 0 ? 'late' : d === 0 ? 'today' : d <= 7 ? 'week' : 'later';
}
export const BUCKETS = { late: '⏰ En retard', today: "☀️ Aujourd'hui", week: '📆 Cette semaine', later: '🗓 Plus tard', nodate: '📥 Sans date' };

export function counts(id) {
  const all = desc(id).filter(n => n.kind === 'item');
  const items = all.filter(n => !['fournisseur', 'note', 'idee'].includes(n.type));
  return {
    total: items.length,
    done: items.filter(isDone).length,
    late: all.filter(n => auto(n).cls.includes('overdue')).length,
  };
}
