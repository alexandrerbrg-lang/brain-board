# 🧠 Brain Board

**▶︎ App en ligne : https://alexandrerbrg-lang.github.io/brain-board/**

Vide ta tête **à la voix** (ou au clavier) : l'app range tout automatiquement en **projets → sous-projets → tâches**, relie les éléments entre eux, suit tes **fournisseurs** et te dit **quoi faire en premier**.

- 🕸 **Carte façon Miro** : arborescence avec branches, liens entre tâches (lien, dépendance, fournisseur), glisser-déposer, zoom.
- 🎙️ **Dictée vocale dans l'app** (français) + **commandes vocales** : « lie A à B », « A dépend de B », « marque A comme fait », « reporte A à lundi »…
- ⌨️ **Formulaire de saisie** pour le travail de bureau (projet, sous-projet, échéance, priorité, effort, fournisseur, lien).
- 🎯 **Focus** : top 3 du jour, tâches classées par échéance, **matrice d'Eisenhower**, filtres par type et par projet. Glisser → pour terminer, ← pour reporter à demain.
- 🏭 **Suivi fournisseurs** en kanban (À contacter → Contacté → Devis reçu → Commandé → Livré / Litige), relances automatiques.
- 🎨 **Un style visuel par type** de tâche et **rendus automatiques** (retard, échéance proche, bloqué, en attente, débloque N tâches, à relancer…).
- 📱 **Mobile d'abord pour la capture** : gros bouton micro au centre, barre d'onglets, feuilles du bas. Installable sur l'écran d'accueil (PWA), fonctionne hors-ligne.
- ✨ **IA optionnelle** : avec une clé API Anthropic (⚙︎), Claude comprend la parole libre, reformule les tâches et crée les liens évidents.

## Lancer en local

```bash
python3 -m http.server 3457
```

Puis ouvrir http://localhost:3457 (la dictée vocale nécessite `localhost` ou HTTPS).

## Publier sur GitHub Pages

1. Créer un repo sur GitHub et pousser ce dossier.
2. *Settings → Pages → Deploy from a branch → `main` / root*.
3. Ouvrir l'URL `https://<utilisateur>.github.io/<repo>/` sur le téléphone → *Partager → Sur l'écran d'accueil*.

## Synchroniser ordinateur ↔ téléphone

Les données sont stockées dans chaque appareil (ça marche hors-ligne) et fusionnées via un **gist privé** sur ton compte GitHub :

1. ⚙︎ → *Synchronisation* → **Créer un jeton GitHub** (permission `gist` uniquement) → coller → **Connecter**.
2. Sur le téléphone : ⚙︎ → coller le même jeton, **ou** depuis l'ordinateur « 📲 Lien pour mon téléphone » (AirDrop / message à soi-même) et l'ouvrir sur le téléphone.

La synchro se fait à chaque modification, au retour sur l'app et toutes les 45 s. En cas de modifications sur les deux appareils, chaque élément garde sa version la plus récente ; les suppressions sont propagées. Le point ☁️ en haut indique l'état (vert = à jour).

## Dictée : compatibilité

| Navigateur | Dictée dans l'app |
|---|---|
| Chrome / Edge (ordinateur, Android) | ✅ |
| Safari macOS / iOS | ✅ |
| Firefox | ❌ → utiliser la dictée du clavier dans la zone de texte |

## Commandes vocales

| Dire | Effet |
|---|---|
| « pour le projet *X*, … » / « côté *Y*, … » | range dans le projet / sous-projet |
| « chez *Dupont* », « le fournisseur *Dupont* » | lie au fournisseur (créé si besoin) |
| « lie *A* à *B* », « relie *A* avec *B* » | lien simple |
| « lie-le à *B* » | lie le dernier élément dicté |
| « *A* dépend de *B* » / « *B* bloque *A* » | dépendance (flèche orange) |
| « délie *A* et *B* » | supprime le lien |
| « marque *A* comme fait », « *A* c'est fait » | termine |
| « mets *A* en urgent / important / en cours » | priorité / statut |
| « reporte *A* à lundi » | nouvelle échéance |
| « déplace *A* dans *Projet* » | change de projet |

## Structure (pour faire évoluer l'app)

```
index.html            interface
css/app.css           styles (desktop + @media mobile)
js/config.js          ⭐ types de tâches, statuts, couleurs, formes, réglages
js/rules.js           ⭐ automatisations visuelles + priorisation (score, Eisenhower)
js/parser.js          ⭐ compréhension du texte / de la voix + commandes
js/commands.js        exécution des éléments et commandes
js/ai.js              organisation par Claude (optionnelle)
js/store.js           données, liens, annuler, horodatage des modifs
js/sync.js            synchro via gist GitHub + fusion
js/canvas.js          carte Miro
js/views.js           Focus, Matrice, Projets, Fournisseurs
js/panel.js           panneau d'édition
js/voice.js           dictée (Web Speech API)
js/main.js            câblage
sw.js, manifest.webmanifest   PWA
```

- **Nouveau type de tâche** → une ligne dans `TYPES` (`config.js`).
- **Nouvelle automatisation** → un objet dans `RULES` (`rules.js`).
- **Nouvelle commande vocale** → une entrée dans `CMDS` (`parser.js`) + un `case` dans `commands.js`.

Aucune dépendance, aucun build : HTML/CSS/JS natif.
