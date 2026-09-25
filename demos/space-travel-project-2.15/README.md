# Space Travel & Transport

Simulateur de transport spatial en **page web unique** (Three.js r128), jouable hors ligne.
Auteur : Frédéric Delorme — musique : ScoreStudio (Envato).

## Organisation

```
build.js              build, tests, captures, PDF, packaging (Node.js)
package.json          dépendances de développement et raccourcis npm
src/
  html/index.html     squelette de la page ; /*@inline:css*/ et /*@inline:js*/ y reçoivent le code
  css/style.css       styles
  js/NN-*.js          code du jeu, un fichier par section (concaténés dans l'ordre des numéros)
  assets/musics/      musique de fond
  test/               tests automatisés (*.test.js), harnais (lib/) et script de captures
  docs/
    spec/             spécification FR / EN (Markdown) et ses images
    etude/            étude « Construction générative des vaisseaux cargo »
    demos/            pages de démonstration (maquettes 3D, moteur Epstein)
target/               généré — ne pas modifier
  space-travel.min.html      page unique compacte et obfusquée, tout intégré (three.js, musique)
  space-travel.min.html.gz   la même, compressée
  dev/space-travel.html      version lisible, pour déboguer
  docs/*.pdf                 documents imprimables
  space-travel-<version>.zip livraison
```

Le code JavaScript est un **script classique** : ses fichiers partagent la même portée globale et sont
simplement mis bout à bout. Pour ajouter un fichier, choisir un numéro qui le place au bon endroit
(par exemple `15b-mon-module.js` entre `15-…` et `16-…`).

## Commandes

| Commande | Effet |
|---|---|
| `npm run build` | assemble `src/` → `target/` (≈ 3 s) |
| `npm test` | tests sur la version compacte (`npm run test:dev` : version lisible) |
| `node build.js test --only=saut` | uniquement les tests dont le nom de fichier contient « saut » |
| `npm run captures` | régénère les captures d'écran de la spécification (`--only=img-038` pour une seule) |
| `npm run docs` | PDF de la spécification FR / EN et de l'étude, diagrammes Mermaid rendus |
| `npm run package` | archive de livraison `target/space-travel-<version>.zip` |
| `npm run all` | tout : nettoyage, build, tests, PDF, archive — l'archive n'est produite que si les tests passent |

## Prérequis

- Node.js 18 ou plus récent
- `npm install`
- `npx playwright install chromium` (tests, captures et PDF) — ou `CHROMIUM_PATH=/chemin/vers/chrome`

Les tests utilisent le rendu logiciel (SwiftShader) pour tourner partout, y compris sans carte
graphique : ils sont lents (plusieurs minutes), le jeu, lui, ne l'est pas.

## Tests

| Fichier | Vérifie |
|---|---|
| `01-demarrage` | chargement sans erreur, écran-titre, mention légale, graine imposée par l'URL |
| `02-selection` | dix vaisseaux du plus petit au plus grand, options de propulsion selon le vaisseau, clavier |
| `03-vaisseaux` | installation de chaque modèle : jauges, RCS, dock, bras, balises, caméra, propulsion |
| `04-supraluminique` | croisière ×5 à ×10 loin des étapes, coupure avant l'approche, consommation au km |
| `05-saut-quantique` | séquence complète, téléportation, retour à l'état normal |
| `06-escale` | achat du générateur de saut en escale sans toucher au dock ; refus hors long-courriers |
| `07-traductions` | libellés présents dans les quatre langues |
| `08-mobile` | sélection et embarquement au doigt sur smartphone, commandes tactiles |

Toute erreur JavaScript dans la page fait échouer le test en cours.

## Univers reproductible

`space-travel.html?seed=MA-GRAINE` impose la graine de l'univers : mêmes étoiles, mêmes routes.
Tests et captures s'en servent ; c'est aussi un moyen de partager une partie.
