// Analyse locale (sans IA) d'un brain dump tapé ou dicté.
// Produit une liste d'« entrées » : { kind:'item', … } ou { kind:'cmd', action, … }
import { TODAY, addDays, iso, reEsc, cap, norm } from './utils.js';
import { projects } from './store.js';

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export function parseDate(t) {
  let m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m) {
    const d = TODAY(); let y = m[3] ? +m[3] : d.getFullYear(); if (y < 100) y += 2000;
    const r = new Date(y, +m[2] - 1, +m[1]); if (!m[3] && r < d) r.setFullYear(y + 1);
    return { date: iso(r), raw: m[0] };
  }
  m = t.match(new RegExp('\\b(\\d{1,2}|1er)\\s+(' + MONTHS.join('|') + ')\\b', 'i'));
  if (m) {
    const d = TODAY(); const r = new Date(d.getFullYear(), MONTHS.indexOf(m[2].toLowerCase()), parseInt(m[1]) || 1);
    if (r < d) r.setFullYear(r.getFullYear() + 1);
    return { date: iso(r), raw: m[0] };
  }
  m = t.match(/\bdans\s+(\d+|un|une|deux|trois)\s+(jours?|semaines?)\b/i);
  if (m) {
    const n = { un: 1, une: 1, deux: 2, trois: 3 }[m[1].toLowerCase()] || +m[1];
    return { date: iso(addDays(n * (/semaine/i.test(m[2]) ? 7 : 1))), raw: m[0] };
  }
  const simple = [
    [/aujourd'?hui|ce soir|ce matin|cet après-midi/i, 0], [/apr[èe]s[- ]demain/i, 2], [/\bdemain\b/i, 1],
    [/(la )?semaine prochaine/i, 7], [/(le )?mois prochain/i, 30], [/(en )?fin de (la )?semaine/i, ((5 - TODAY().getDay() + 7) % 7) || 7],
  ];
  for (const [re, n] of simple) { m = t.match(re); if (m) return { date: iso(addDays(n)), raw: m[0] }; }
  for (let i = 0; i < 7; i++) {
    m = t.match(new RegExp('\\b' + DAYS[i] + '( prochain)?\\b', 'i'));
    if (m) return { date: iso(addDays(((i - TODAY().getDay() + 7) % 7) || 7)), raw: m[0] };
  }
  return null;
}

const TYPE_RULES = [
  ['probleme', /\b(bug|probl[eè]mes?|bloqu|cass[ée]|erreur|souci|panne|fuite|marche pas|fonctionne pas)/i],
  ['rdv', /\b(appeler|rappeler|appel|rdv|r[ée]union|meeting|call|rencontrer|visio|rendez-vous|voir avec|caler)/i],
  ['achat', /\b(acheter|commander|achat|payer|facture|budget|r[ée]gler)\b/i],
  ['livrable', /\b(livrer|livrable|rendu|maquette|envoyer|pr[ée]sentation|proposition|deck|r[ée]diger|finaliser|dossier)/i],
  ['idee', /\b(id[ée]es?|peut-[êe]tre|et si|envisager|brainstorm|pourquoi pas|ce serait bien|[çc]a pourrait)/i],
  ['question', /(\?\s*$|^(est-ce qu|comment|pourquoi|faut-il)\b)/i],
];
const PFX = {
  idee: /^id[ée]es?$/i, probleme: /^(probl[eè]me|bug|souci)$/i, note: /^(note|info|nb|rappel)$/i, question: /^question$/i,
  achat: /^achats?$/i, rdv: /^(rdv|appel|r[ée]union)$/i, livrable: /^livrable$/i, tache: /^(t[âa]che|todo)$/i, fournisseur: /^fournisseurs?$/i,
};
const SUPKW = [
  ['probleme', /litige|pas re[çc]u|livraison en retard/i], ['livre', /\blivr[ée]e?s?\b|bien re[çc]u/i],
  ['commande', /\bcommand[ée]e?s?\b/i], ['devis_recu', /devis re[çc]us?|re[çc]u (le |son |leur )?devis|envoy[ée] (son|leur|le) devis|a envoy[ée] .*devis/i],
  ['contacte', /contact[ée]|appel[ée]|relanc[ée]|devis demand|demand[ée] (un|le) devis|mail envoy/i],
];
const NAME_RE = "([A-ZÀ-Ý0-9][\\wÀ-ÿ&'.-]*(?:\\s+(?:[A-ZÀ-Ý&0-9][\\wÀ-ÿ&'.-]*))*)";
const SUP_INTRO = "(?:chez|au fournisseur|le fournisseur|du fournisseur|fournisseur|aupr[eè]s de)\\s+(?:l'|le |la |les )?";

export function parseLine(line) {
  let t = line, type = null, status = null, prio = 0, supplier = null, supplierStatus = null, due = null, effort = '', m;
  if ((m = t.match(/^([\wÀ-ÿ]+)\s*[:\-–]\s+/))) for (const k in PFX) if (PFX[k].test(m[1])) { type = k; t = t.slice(m[0].length); break; }
  t = t.replace(/#([\wÀ-ÿ]+)/g, (a, w) => { for (const k in PFX) if (PFX[k].test(w)) { type = k; return ''; } return a; });
  if (/!!|\burgent|asap|au plus vite|critique/i.test(t)) prio = 2; else if (/(^|\s)!(\s|$)|\bimportant|prioritaire/i.test(t)) prio = 1;
  t = t.replace(/!!+|(^|\s)!(?=\s|$)/g, ' ').replace(/,?\s*(c'est )?(urgent|important|prioritaire|critique|asap|au plus vite)\b/ig, '');
  if (/\b(rapide|vite fait|5 minutes|deux minutes|2 minutes)\b/i.test(t)) { effort = 's'; t = t.replace(/,?\s*(c'est )?(rapide|vite fait)\b/i, ''); }
  const d = parseDate(t);
  if (d) { due = d.date; t = t.replace(new RegExp("\\s*(?:pour|avant|d'ici|au plus tard|jusqu'à)?\\s*(?:le\\s+)?" + reEsc(d.raw), 'i'), ' '); }
  if ((m = t.match(/@([\wÀ-ÿ&'.-]+)/))) { supplier = m[1]; t = t.replace(m[0], ''); }
  else if ((m = t.match(new RegExp('\\b' + SUP_INTRO + NAME_RE)))) {
    supplier = m[1];
    if (!/^\s*fournisseur/i.test(t)) t = t.replace(new RegExp('\\s*\\b' + SUP_INTRO + reEsc(m[1])), ' ');
  }
  for (const [k, re] of SUPKW) if (re.test(line)) { supplierStatus = k; break; }
  if (/\b(fait|termin[ée]e?|done|c'est bon|r[ée]gl[ée])\b|✓|✅/i.test(t)) status = 'fait';
  else if (/\ben cours\b/i.test(t)) status = 'en_cours';
  else if (/\bbloqu/i.test(t)) status = 'bloque';
  if (!type && /^\s*fournisseur\b/i.test(t)) type = 'fournisseur';
  if (!type) for (const [k, re] of TYPE_RULES) if (re.test(t)) { type = k; break; }
  if (!type) type = 'tache';
  if (type === 'fournisseur') {
    const name = supplier || t.replace(/^\s*fournisseur\s*/i, '').split(/\s[—–-]\s|,|:|\s(?:a |nous a |m'a |on a )/)[0]
      .replace(/\b(devis re[çc]u|command[ée]|livr[ée]|contact[ée])\b.*/i, '').trim();
    return { title: cap(name), type, status: supplierStatus, supplier: null, due, prio };
  }
  t = t.replace(/^\s*(il faut que|il faudrait|faut que|faut|je dois|on doit|penser à|ne pas oublier de|pas oublier de|j'ai besoin de|je voudrais|je veux)\s+(je |j'|qu'on |on )?/i, '')
    .replace(/^(une |l')?id[ée]e\s*(de |d'|:)?\s*/i, '')
    .replace(/\s+([.,;:])/g, '$1').replace(/\s{2,}/g, ' ').replace(/^[\s,.;:–-]+|[\s,.;:–-]+$/g, '').trim();
  return { title: cap(t), type, status, due, prio, effort, supplier, supplierStatus };
}

// ── Commandes vocales / textuelles ──
// rel : type de lien ('lien' | 'depend'). strict : si les éléments ne sont pas trouvés,
// la phrase est traitée comme une nouvelle tâche (fallback).
const LINK_VERB = "(?:lie|lier|relie|relier|connecte|connecter|associe|associer|rattache|rattacher|link|fais un lien entre|faire un lien entre|cr[ée]e un lien entre|lien entre)";
const SEP = "\\s+(?:à|a|avec|et|au|aux)\\s+";
const CMDS = [
  { re: new RegExp("^" + LINK_VERB + "[- ]?(?:le|la|les|ça|ca)" + SEP + "(.+)$", 'i'), f: m => ({ action: 'link', a: '@last', b: m[1], rel: 'lien' }) },
  { re: /^(?:ça|ca|il|elle)\s+d[ée]pend\s+de\s+(.+)$/i, f: m => ({ action: 'link', a: '@last', b: m[1], rel: 'depend' }) },
  { re: new RegExp("^" + LINK_VERB + "\\s+(.+?)" + SEP + "(.+)$", 'i'), f: m => ({ action: 'link', a: m[1], b: m[2], rel: 'lien' }) },
  { re: /^(?:d[ée]lie|d[ée]lier|supprime le lien entre|enl[èe]ve le lien entre|retire le lien entre|coupe le lien entre)\s+(.+?)\s+(?:et|de|avec|à)\s+(.+)$/i, f: m => ({ action: 'unlink', a: m[1], b: m[2] }) },
  { re: /^(.+?)\s+(?:d[ée]pend(?:ent)? de|doi(?:t|vent) attendre|attend(?:ent)?)\s+(.+)$/i, f: m => ({ action: 'link', a: m[1], b: m[2], rel: 'depend', strict: true }) },
  { re: /^(.+?)\s+bloque(?:nt)?\s+(.+)$/i, f: m => ({ action: 'link', a: m[2], b: m[1], rel: 'depend', strict: true }) },
  { re: /^(?:marque|marquer|coche|cocher)\s+(.+?)(?:\s+comme\s+(?:fait|faite|termin[ée]e?|finie?|ok))?$/i, f: m => ({ action: 'done', a: m[1] }) },
  { re: /^(?:j'ai fini|j'ai termin[ée]|c'est fait pour|fini)\s+(.+)$/i, f: m => ({ action: 'done', a: m[1], strict: true }) },
  { re: /^(.+?)\s+(?:c'est|est|sont)\s+(?:fait|faite|faits|termin[ée]e?s?|finie?s?|r[ée]gl[ée]e?s?|ok)$/i, f: m => ({ action: 'done', a: m[1], strict: true }) },
  { re: /^(?:mets?|mettre|passe|passer)\s+(.+?)\s+en\s+(critique|urgent|urgente|priorit[ée] haute|important|importante|normal|normale|priorit[ée] basse|cours|bloqu[ée]e?)$/i, f: m => ({ action: 'set', a: m[1], value: m[2], strict: true }) },
  { re: /^(?:reporte|reporter|d[ée]cale|d[ée]caler|repousse|repousser)\s+(.+?)\s+(?:à|au|a|pour|de)\s+(.+)$/i, f: m => ({ action: 'due', a: m[1], when: m[2], strict: true }) },
  { re: /^(?:d[ée]place|d[ée]placer|range|ranger|bouge|bouger)\s+(.+?)\s+(?:dans|vers|sous)\s+(?:le projet\s+|le sous-projet\s+|la partie\s+)?(.+)$/i, f: m => ({ action: 'move', a: m[1], b: m[2], strict: true }) },
  { re: /^(?:supprime|supprimer|efface|effacer)\s+(?:la tâche\s+|la tache\s+)?(.+)$/i, f: m => ({ action: 'delete', a: m[1], strict: true }) },
];
const FILLER = /^(?:alors|bon|ok|okay|ensuite|puis|et|aussi|euh|du coup)[\s,]+/i;
const cleanRef = s => s.replace(/^(?:(?:la tâche|la tache|le truc|celle de|celui de|les|le|la|un|une)\s+|l')/i, '').replace(/[\s,.!?]+$/, '').trim();

export function parseCommand(line) {
  const t = line.replace(FILLER, '').replace(FILLER, '').replace(/[.!?;]+$/, '').trim();
  for (const c of CMDS) {
    const m = t.match(c.re);
    if (m) {
      const r = { kind: 'cmd', ...c.f(m) };
      if (r.a && r.a !== '@last') r.a = cleanRef(r.a);
      if (r.b) r.b = cleanRef(r.b);
      return r;
    }
  }
  return null;
}

export function splitSpeech(text) {
  return text
    .replace(/\s+(ensuite|et puis|après ça|apr[eè]s ca|sinon|autre chose|par ailleurs|deuxi[èe]me chose|troisi[èe]me chose|et enfin|et aussi|d'autre part)[, ]+/gi, '\n')
    .replace(/\s+et\s+(?=(?:lie|relie|associe|connecte|rattache)[- ])/gi, '\n')
    .replace(/([.!?;])\s+/g, '$1\n')
    .split('\n').map(s => s.trim()).filter(Boolean);
}

export function parseDump(text) {
  const out = []; let proj = null, sub = null, headerMode = false;
  const lines = text.split('\n').flatMap(raw => (/^\s*(#|[-*•–]|\d+[.)])/.test(raw) ? [raw] : splitSpeech(raw)));
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const indent = raw.match(/^\s*/)[0].length;
    let line = raw.trim(), m;
    if ((m = line.match(/^#{2,}\s*(.+)/))) { sub = m[1].trim(); continue; }
    if ((m = line.match(/^#\s*(.+)/))) { proj = m[1].trim(); sub = null; headerMode = true; continue; }
    if ((m = line.match(/^projet\s*:\s*(.+)/i))) { proj = m[1].trim(); sub = null; headerMode = true; continue; }
    if ((m = line.match(/^sous[- ]?projet\s*:\s*(.+)/i))) { sub = m[1].trim(); continue; }
    line = line.replace(/^([-*•–]|\d+[.)])\s*/, '');
    if ((m = line.match(/^([^:]{2,50}):\s*$/))) { if (indent > 0 || headerMode) sub = m[1].trim(); else { proj = m[1].trim(); sub = null; headerMode = true; } continue; }
    // Repères vocaux : « pour le projet X », « côté Y »
    if ((m = line.match(/^(?:alors |bon |ok |donc |et )?(?:pour |sur |dans |concernant )?(?:le |la |l')?projet\s+(?:de |du |des |d')?([\wÀ-ÿ'-]+(?:\s+[\wÀ-ÿ'-]+){0,3}?)(?=\s*[,:.]|\s+(?:il|faut|je|on|j'|y a|côté|cote)\b|$)\s*[,:.]?\s*/i))) {
      proj = m[1].trim(); sub = null; line = line.slice(m[0].length); if (!line.trim()) continue;
    }
    if ((m = line.match(/^(?:et |alors |pour )?(?:côté|cote|partie|pour la partie|niveau|au niveau (?:de la |du |des |de l')?)\s+([\wÀ-ÿ'-]+(?:\s+[\wÀ-ÿ'-]+)?)\s*[,:]\s*/i))) {
      sub = m[1].trim(); line = line.slice(m[0].length); if (!line.trim()) continue;
    }
    let p = proj, s = sub;
    if ((m = line.match(/^(.+?)\s*>\s*(.+?)\s*:\s*(.+)$/))) { p = m[1]; s = m[2]; line = m[3]; }
    else if ((m = line.match(/^\[(.+?)\]\s*(.+)$/))) { p = m[1]; s = null; line = m[2]; }
    if (!p) { const hit = projects().find(n => norm(line).includes(norm(n.title))); p = hit ? hit.title : 'Inbox'; }

    const cmd = parseCommand(line);
    if (cmd) {
      if (cmd.strict) { const it = parseLine(line); if (it.title?.length > 1) cmd.fallback = { kind: 'item', project: p, sub: s, ...it }; }
      out.push(cmd); continue;
    }
    const it = parseLine(line);
    if (!it.title || it.title.length < 2) continue;
    out.push({ kind: 'item', project: p, sub: s, ...it });
  }
  return out;
}
