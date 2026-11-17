// ─────────────────────────────────────────────────────────────
// CONFIGURATION — le point d'entrée pour faire évoluer l'app.
// Ajouter un type de tâche = ajouter une entrée dans TYPES
// (shape = forme visuelle sur la carte, cf. css/app.css .shape-*)
// ─────────────────────────────────────────────────────────────
export const TYPES = {
  tache:       { label: 'Tâche',       icon: '✓',  color: '#3b82f6', shape: 'rect'   },
  rdv:         { label: 'Appel / RDV', icon: '📞', color: '#8b5cf6', shape: 'pill'   },
  livrable:    { label: 'Livrable',    icon: '📦', color: '#10b981', shape: 'doc'    },
  achat:       { label: 'Achat',       icon: '🛒', color: '#f97316', shape: 'ticket' },
  probleme:    { label: 'Problème',    icon: '⚠️', color: '#ef4444', shape: 'alert'  },
  idee:        { label: 'Idée',        icon: '💡', color: '#eab308', shape: 'sticky' },
  question:    { label: 'Question',    icon: '❓', color: '#06b6d4', shape: 'pill'   },
  note:        { label: 'Note',        icon: '📝', color: '#94a3b8', shape: 'sticky' },
  fournisseur: { label: 'Fournisseur', icon: '🏭', color: '#d946ef', shape: 'card'   },
};
export const TYPE_ORDER = Object.keys(TYPES);

export const TASK_ST = { a_faire: 'À faire', en_cours: 'En cours', bloque: 'Bloqué', fait: 'Fait' };
export const SUP_ST = { a_contacter: 'À contacter', contacte: 'Contacté', devis_recu: 'Devis reçu', commande: 'Commandé', livre: 'Livré', probleme: 'Litige' };
export const SUP_COL = { a_contacter: '#94a3b8', contacte: '#3b82f6', devis_recu: '#f59e0b', commande: '#8b5cf6', livre: '#10b981', probleme: '#ef4444' };

export const PRIO = { 0: 'Normale', 1: '⬆︎ Importante', 2: '🔥 Critique' };
export const EFFORT = { '': '—', s: '⚡ Rapide (< 15 min)', m: '⏱ Moyen (~1 h)', l: '🧱 Long (½ journée +)' };

// Types de liens entre éléments
export const LINK_KINDS = {
  lien:        { label: 'Lié à',       color: '#64748b', dash: '3 6' },
  depend:      { label: 'Dépend de',   color: '#f59e0b', dash: ''    },
  fournisseur: { label: 'Fournisseur', color: '#d946ef', dash: '7 5' },
};

export const PALETTE = ['#4f46e5', '#0891b2', '#c2410c', '#15803d', '#be185d', '#7c3aed', '#0f766e', '#b45309'];

// Réglages modifiables (⚙︎)
export const CFG = Object.assign({ relanceDays: 5, autoProcess: true }, JSON.parse(localStorage.getItem('bb-cfg') || '{}'));
export const saveCfg = () => localStorage.setItem('bb-cfg', JSON.stringify(CFG));
