// Organisation par Claude (optionnelle — nécessite une clé API dans ⚙︎).
import { S, projects, kids, suppliers, pathLabel } from './store.js';
import { iso, TODAY } from './utils.js';

export const hasAI = () => !!localStorage.getItem('bb-key');

export async function aiParse(text) {
  const key = localStorage.getItem('bb-key');
  const model = localStorage.getItem('bb-model') || 'claude-sonnet-5-5';
  const ctx = {
    projets: projects().map(p => ({ nom: p.title, sous_projets: kids(p.id).filter(k => k.kind === 'sub').map(s => s.title) })),
    fournisseurs: suppliers().map(s => ({ id: s.id, nom: s.title, statut: s.status })),
    elements: S.nodes.filter(n => n.kind === 'item' && n.type !== 'fournisseur').slice(-250)
      .map(n => ({ id: n.id, titre: n.title, type: n.type, chemin: pathLabel(n), statut: n.status })),
  };
  const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const system = `Tu es l'assistant d'organisation d'un tableau de gestion de projet visuel. L'utilisateur fait un "brain dump", souvent DICTÉ À LA VOIX : texte peu ponctué, hésitations, répétitions. Il peut aussi donner des COMMANDES (lier des tâches, marquer comme fait, changer une priorité, reporter, déplacer).

Réponds UNIQUEMENT avec du JSON valide : {"items":[...], "actions":[...]}

ITEMS = nouveaux éléments à créer :
{"ref": "new1", "project": string, "sub": string|null, "title": string, "type": "tache"|"rdv"|"livrable"|"achat"|"probleme"|"idee"|"question"|"note"|"fournisseur", "status": string|null, "due": "YYYY-MM-DD"|null, "prio": 0|1|2, "effort": ""|"s"|"m"|"l", "supplier": string|null, "supplierStatus": string|null}
- title : court et actionnable (verbe à l'infinitif, ~10 mots max). prio : 2 = critique/urgent, 1 = important. effort : s = <15 min, m = ~1 h, l = long.
- Statuts tâche : a_faire|en_cours|bloque|fait. Statuts fournisseur : a_contacter|contacte|devis_recu|commande|livre|probleme.
- type "fournisseur" = info sur un fournisseur lui-même (title = son nom).
- Tâche liée à un fournisseur : son nom dans "supplier" (+ "supplierStatus" si l'info est donnée).
- Réutilise EXACTEMENT les noms de projets / sous-projets / fournisseurs existants. Crée un sous-projet seulement s'il regroupe ≥ 2 éléments. Sinon projet "Inbox".

ACTIONS = opérations sur des éléments existants OU nouveaux (référencés par leur "id" existant ou leur "ref") :
{"action": "link", "a": id|ref, "b": id|ref, "rel": "lien"|"depend"}   (depend = a dépend de b / b bloque a)
{"action": "unlink", "a": id|ref, "b": id|ref}
{"action": "done", "a": id}
{"action": "set", "a": id, "value": "critique"|"important"|"normal"|"en cours"|"bloqué"}
{"action": "due", "a": id, "due": "YYYY-MM-DD"}
{"action": "move", "a": id, "b": "nom du projet ou sous-projet"}
- Quand l'utilisateur dit « lie X à Y », « X dépend de Y », « X c'est fait »… retrouve les éléments dans la liste fournie.
- Crée aussi des liens "lien" quand deux éléments dictés sont manifestement liés (même livrable, même fournisseur, suite logique).
- Ignore le bruit oral. Aujourd'hui : ${iso(TODAY())} (${days[TODAY().getDay()]}).`;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model, max_tokens: 8000, system, messages: [{ role: 'user', content: 'Contexte existant :\n' + JSON.stringify(ctx) + '\n\nBrain dump :\n' + text }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || r.status);
  const t = j.content.map(c => c.text || '').join('');
  const out = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
  return [
    ...(out.items || []).map(it => ({ kind: 'item', ...it })),
    ...(out.actions || []).map(a => ({ kind: 'cmd', ...a })),
  ];
}
