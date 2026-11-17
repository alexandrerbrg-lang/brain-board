# Brain Board — notes pour les sessions Claude

App de gestion de projet « brain dump » vocal → carte Miro. HTML/CSS/JS natif en modules ES, sans build ni dépendance. Interface et textes en **français**.

## Conventions
- L'app évolue selon les recommandations de l'utilisateur : noter chaque nouvelle demande dans `ROADMAP.md` (section du jour) et la cocher une fois livrée.
- Garder les points d'extension déclaratifs : types dans `js/config.js` (`TYPES`), automatisations dans `js/rules.js` (`RULES`), commandes vocales dans `js/parser.js` (`CMDS`) + `js/commands.js` (`run`).
- Toute mutation de données : `snapshot()` (pour Annuler) → modifier `S` → `commit()` (sauvegarde + re-rendu de toutes les vues).
- Liens entre éléments : `S.edges` `{from,to,kind}`, kind ∈ `lien | depend | fournisseur` (`depend` : from dépend de to).
- Mobile (≤ 760 px) : la capture vocale passe avant tout (bouton micro central), vues Focus / Projets / Carte / Fournisseurs en onglets du bas.
- La vue carte reste rendue quand elle est masquée (`visibility:hidden`), pour que la mise en page puisse mesurer les cartes.

## Lancer / tester
`python3 -m http.server 3457` puis http://localhost:3457. Données dans `localStorage` (`bb-state`). Le micro est bloqué dans le navigateur intégré de Claude : tester la dictée dans Chrome / Safari.
