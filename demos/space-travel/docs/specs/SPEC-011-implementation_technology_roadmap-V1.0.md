# Space Travel & Transport — Feuille de route technologique d'implémentation

**Proposition** — choix de la pile technique pour la suite du développement : rester sur le Web en le modernisant, ou
migrer vers un moteur natif. Source : demande du 04/10/2026 (crainte d'atteindre la limite de performance du navigateur).

| | |
|---|---|
| Base | v2.17 (Three.js r128, scripts classiques concaténés, build Python) |
| Statut | **proposition** — aucune décision prise ; la première étape (mesure) conditionne le choix |
| Recommandation | **Option A** (Web moderne), **option C** (Godot 4) en plan B |

---

## 1. Constat sur l'existant

Constat établi par lecture du code et des builds ; **rien n'a encore été mesuré**, les goulots ci-dessous sont des hypothèses.

- Moteur : Three.js r128 (2021), scripts classiques concaténés dans un scope global (l'ordre de `ORDER.txt` fait partie du
  programme). Environ 11 000 lignes de JS de jeu, plus 11 modules partagés (`shared/`).
- Aucun `Worker` dans le code du jeu : tout s'exécute sur le thread principal.
- Seulement 4 occurrences d'`InstancedMesh` : beaucoup de draw calls probables (astéroïdes, vaisseaux modulaires, ports).
- HTML généré d'environ 6 Mo (Three, GLB des modules, images embarqués).
- Charges lourdes par nature : échelle réelle (`20c-echelle-reelle.js`), univers procédural, post-processing, vaisseaux
  modulaires issus de Blender.
- Pipeline solide à conserver : build Python, tests Playwright, publication GitHub Pages (fichiers HTML suivis).

**Conclusion :** les limites perçues viennent surtout du code actuel, pas du navigateur. WebGPU, workers, OffscreenCanvas
et WASM sont disponibles dans les navigateurs récents.

## 2. Options

| Option | Gain perf | Coût | Risque |
|---|---|---|---|
| **A. Web moderne** : Three récent, WebGPU, workers, WASM | élevé | moyen, incrémental | faible |
| **B. Enveloppe desktop** (Tauri) | nul en soi | faible | faible |
| **C. Godot 4** (GDScript ou C#) | élevé | réécriture complète | moyen |
| **D. Unity / Unreal / Bevy** | très élevé | très élevé | élevé |

- **B** n'améliore pas les performances ; elle sert à distribuer (sauvegardes sur disque, installateur) et se combine avec A.
- **C** s'accorde bien au pipeline Blender (import natif des `.glb`). L'export Web est possible mais plus lourd (plusieurs
  dizaines de Mo) et moins fluide qu'un Three.js bien écrit ; le modèle « un fichier HTML » et les 11 000 lignes de JS
  seraient perdus.
- **D** est déconseillée : Unity et Unreal sont surdimensionnés pour un projet solo orienté web (licences, chaîne de build) ;
  Bevy (Rust) est très performant mais l'écosystème est jeune et le coût de réécriture le plus élevé.

## 3. Recommandation : option A, en étapes

Chaque étape est livrable et vérifiable avec les tests Playwright existants ; le jeu reste jouable pendant la migration.

| # | Étape | Contenu | Durée indicative |
|---|---|---|---|
| 1 | **Mesurer** | Draw calls, temps CPU par frame (profil Chrome), temps GPU, ramasse-miettes, sur 3 scènes : orbite planétaire, champ d'astéroïdes dense, flotte avec port | 1 à 2 jours |
| 2 | **Moderniser le build** | ES modules + TypeScript + Vite à la place de la concaténation par `ORDER.txt` ; Three vers une version récente (r17x ou plus) ; build « fichier unique » conservé pour GitHub Pages (`vite-plugin-singlefile`) | à estimer après l'étape 1 |
| 3 | **Réduire draw calls et charge GPU** | `InstancedMesh` / `BatchedMesh` partout ; fusion des modules de vaisseaux ; LOD ; textures KTX2 | à estimer |
| 4 | **Libérer le thread principal** | Web Workers pour la génération procédurale (univers, planètes, textures de coque), la physique et l'évitement d'obstacles ; OffscreenCanvas si le rendu doit être isolé ; noyau WASM (Rust ou AssemblyScript) pour les boucles chaudes (n-corps, collisions, terrain) | à estimer |
| 5 | **Passer à WebGPU** | `WebGPURenderer` de Three avec repli WebGL2 ; compute shaders pour particules, astéroïdes et post-processing | à estimer |
| 6 | **Corriger la précision** | *Floating origin* (recentrage du monde sur le joueur) ; simulation en float64, conversion en float32 uniquement pour le rendu | à estimer |

### 3.1 Critères de passage d'une étape à la suivante

- Étape 1 : un rapport chiffré identifie le goulot dominant (CPU, GPU ou GC). Les étapes 3 à 5 sont ordonnées selon ce résultat.
- Chaque étape : les tests Playwright passent, et le gain mesuré sur les 3 scènes de référence est consigné.
- Les modules de `shared/` restent single-source ; tout changement impose de reconstruire le jeu **et** la démo
  *Observation des étoiles* (voir `demos/space-travel/CLAUDE.md`).

## 4. Quand basculer sur Godot (option C)

Uniquement si l'un de ces objectifs devient prioritaire :

- distribution Steam ou consoles ;
- scènes très lourdes que l'étape 5 ne tient pas ;
- physique ou réseau sérieux (multijoueur).

Dans ce cas, commencer par un **prototype parallèle** (port d'une seule scène) avant toute décision de réécriture.

## 5. Risques et points ouverts

| Risque | Mitigation |
|---|---|
| Migration TypeScript/ES modules longue sur 11 000 lignes en scope global | migrer module par module, en commençant par un module de `shared/` (par ex. `asteroids.js`) |
| Support WebGPU inégal selon navigateurs et machines | repli WebGL2 maintenu, détection au démarrage |
| Taille du fichier unique en hausse (WASM, Three récent) | mesurer à chaque étape ; budget à fixer après l'étape 1 |
| Machine de référence modeste (APU AMD Lucienne, 12 threads, 11 Go) | utiliser cette machine comme plancher de performance |
| Démo *Observation des étoiles* figée sur le moteur v2.15 | décider séparément si elle suit la migration |

## 6. Prochaine action proposée

Étape 1 : instrumenter le jeu actuel (compteur de frames, `renderer.info`, profil par système) et produire le rapport
chiffré qui départage A et C. En parallèle, POC Vite + TypeScript sur un module partagé.
