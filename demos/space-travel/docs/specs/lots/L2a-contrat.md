# L2a — Noyau d'assemblage `sttcomp` et données géométriques : contrat technique (ARCHI)

Branche propre depuis `main` après fusion de L1, cible `stt_v2.20` (avec L2). Références : SPEC-010 § 2.2 (option B), 2.4, 2.6, 2.10, 2.12, 3.3–3.4 ; `STT_INTEGRATION.md` § 4, 11, 13. Chemins relatifs à `demos/space-travel/`. Éditeur = `STT_modules/sources/index.html` (4 611 l, three r169, un seul `<script type="module">` `890-4611`).

**Décisions retenues le 06/10/2026** (le mainteneur a demandé de passer à L2a sans trancher les quatre points : le CP applique les recommandations de l'ARCHI ; elles restent rectifiables, voir décisions 17 à 20 du Kanban) :
1. La copie de l'éditeur et de `build_game_pack.py` qui fait foi est celle du **dépôt** (`STT_modules/`), pas celle du projet Blender.
2. `build_viewer_standalone.py` (hors dépôt) n'est **pas** modifié en L2a : son intégration de `sttcomp.js` est reportée à un lot ultérieur ; l'éditeur autonome produit à partir de lui reste inchangé jusque-là.
3. L'éditeur du dépôt est **servi depuis `demos/space-travel/`** (il charge `../../shared/sttcomp.js`).
4. L'alignement des règles de `MODSHIP` sur l'éditeur (masse des conteneurs `CONT_T` contre 6,5 t) se fait en **L2**, pas en L2a.
Les chemins ci-dessous sont ceux de l'organisation actuelle : l'ADR-001 (proposé) pourra les déplacer plus tard (phase M3), sans incidence sur le contenu de L2a.
Invariants : `shared/sttcomp.js` sans `THREE`, sans DOM, sans `Math.random`/`Date.now` (aléa et identifiants injectés) ; une seule globale `STTCOMP` ; l'éditeur se comporte à l'identique ; aucune clé `I18N` (le noyau rend des **codes**, les textes restent chez l'appelant) ; logique de vol et `MODSHIP` inchangés en L2a.

## 1. Inventaire réel des règles dans l'éditeur

| Bloc | Fonctions (ligne) | Dépendances à couper |
|---|---|---|
| Repères | `C`/`Ci` 965-966, `RX` 967, `relMatrix` 998, `socketLocal` 1039, `mate` 1046 | `THREE.Matrix4`, `protos[key].getObjectByName` → matrices de `modules-geom.json` |
| Ports | `PORT_PREF` 1467, `portsOf` 1470 (traverse `protos`), `portKind` 1477, `massOf` 1478 (`userData.stt_mass_t`), `lenOf` 1479 (`fleet.modules[k].length`) | `protos` → `geom.modules[k].ports/mass_t/length_m` ; `fleet` → `env` |
| Conteneurs | `containerMatrix` 1188 (`V3`, `makeBasis`), `containerMats` 1201 (sockets `SOCKET_(CRG6_)?CONTAINER_*` triés par nom) | `V3`/`M4` → mini-lib ; sockets bruts dans le JSON |
| Graphe | `blankComp` 1491, `P`/`kids`/`subtree`/`ordered` 1494-1502, `nextId` 1503, `usedPorts` 1507, `freePortsList` 1519, `compatible` 1527, `childPorts`/`defaultChildPort` 1531-1539, `computeWorld` 1540, `normalize` 1552 | **variable globale `comp`** (paramètre par défaut, et `normalize` qui la permute) → composition passée explicitement ; `uid()` 1482 (`Date.now`, `Math.random`) → `env.uid` |
| Mutations | `addPart` 1792, `movePart` 1805, `deletePart` 1812, `replacePart` 1818 | `toast`, `commit`, `sel`, `frameBox` → restent dans l'éditeur ; `randomBrand` 1481 (`Math.random`) → `env.rand` |
| Contrôles | `hullBox` 1567 / `fullBox` 1575 (`optimized()` + `Box3`), `obbFrom` 1580, `obbCorners` 1587, `obbOverlap` 1596 (SAT), `rayOBB` 1614, `anyOverlap` 1625, `partOBBs` 1626, `analyze` 1631-1694 | `Box3`/`V3` → tableaux ; `edWorld` et `comp` globaux → arguments ; `protos.PROP.getObjectByName('VFX_PROP_MAIN_EXHAUST')` → `geom.modules.PROP.exhaust` ; messages français → `{sev, code, args, ids}` |
| Fiche | `FAMILIES`/`ARCH_AUTO`/`CREW` 2106-2108, `autoGame` 2109, `cleanGame` 2114, `resolvedGame` 2128 (lit `analysis` global), `gameExportObj` 2170 | `analysis` → `stats` en argument ; libellés `FAMILIES`/`ARCH_AUTO` = données (codes + texte fr par défaut) |
| Import / export | `toExport` 2191, `fromGraph` 2214, `fromShip` 2263, `fromStation` 2274, `importObject` 2275 | `customCos`, `fleet.companies/container_brands/zones`, `protos[key]`, `mergeCompanies` → `env.known*` ; `coDef`/`companyOf` restent éditeur |

Hors noyau (restent dans l'éditeur) : rendu, VFX, marqueurs, glisser-déposer (`beginDrag` 2487…`endDrag` 2546), historique, UI. Doublons côté jeu : `MODSHIP` (`09c`) recopie `mate` 154, `portsOf` 157, `worldOf` 330, `statsOf` 395, `autoGame` 401 avec **divergences** (masse conteneur `CONT_T` vs 6,5 t, pas de longueur) : rebranchement en L2, pas en L2a.

## 2. Fichiers et `ORDER.txt`

- `shared/sttcomp.js` (nouveau, ~500 l, ≤ 30 Ko visés ; **relevé à ≤ 35 Ko le 07/10/2026** : 32 Ko mesurés après L2a.5, code lisible non compacté, le build obfusqué le réduit ; le critère du lot reste ≤ 60 Ko ajoutés au HTML) : `/* @provides STTCOMP */`, aucun `@requires`. `ORDER.txt` : ligne `shared/sttcomp.js` **juste après `sim/03-save.js`** (ligne 7), seule modification d'`ORDER.txt` du lot. Fin de fichier : `if (typeof module !== 'undefined') module.exports = STTCOMP;` (aucun effet dans le build concaténé ni dans le navigateur).
- `sources/src/data/modules-geom.json` (nouveau, produit, ≤ 25 Ko compact) : embarqué **sans modifier `build.py`** (la fonction `data()` reprend tout `src/data/*.json` hors `compositions/`) ; lu en L2 par `DATA.get('modules-geom')`.
- `STT_modules/build_modules_geom.py` (nouveau, Python 3 stdlib) ; `STT_modules/build_game_pack.py` : option `--geom <fichier>` qui l'appelle sur la même entrée `--glb`.
- Tests : `sources/src/test/unit/_sttcomp.mjs` (chargeur vm : `shared/sttcomp.js` + `modules-geom.json` + `src/assets/stt_fleet.json`), `sttcomp-mat4.test.mjs`, `sttcomp-graph.test.mjs`, `sttcomp-checks.test.mjs`, `sttcomp-io.test.mjs`, `modules-geom.test.mjs`, `sttcomp-golden.test.mjs` + `fixtures/sttcomp-golden.json`. `_load.mjs` **non modifié**.
- Éditeur : `STT_modules/sources/index.html` ; sonde `STT_modules/tests/editor_probe.py` (Playwright Python).
- Docs : `CLAUDE.md` (§ Shared modules : douze modules, `sttcomp` consommé par le jeu et l'éditeur, **pas** par la démo), `STT_INTEGRATION.md` § 11 et § 13, `CODEMAP.md` régénéré.

## 3. API `STTCOMP`

Matrices : `Float64Array(16)` ou tableau de 16 nombres, **colonne-major** (même ordre que `THREE.Matrix4.elements` et glTF : l'éditeur convertit par `new M4().fromArray(a)` / `m.elements`).
- `STTCOMP.m4` (~80 l) : `identity()`, `mul(a,b,out?)`, `invert(a,out?)` (affine générale), `rotX(rad)`, `rotY(rad)`, `translation(x,y,z)`, `basis(X,Y,Z,p)`, `fromTRS(t,q,s)`, `point(m,v)`, `dir(m,v)`, `col(m,i)`, `pos(m)`, `C`, `Ci`, `RX`. Vecteurs = `[x,y,z]` ; aides `v3.dot/cross/sub/add/scale/len/norm`.
- `STTCOMP.create(env)` → noyau lié à `env = { geom, fleet: {modules, container_brands, zones, companies}, knownCompany(k)→bool, rand()→[0,1[, uid()→string }` (défauts : `rand` LCG fixe, `uid` compteur — jamais `Math.random`). Toutes les fonctions suivantes prennent la composition `c` **en premier argument** et ne lisent aucun état caché :
- Géométrie : `portsOf(key)` (ordre `PORT_PREF`), `portKind(key,port)` → `'ring'|'pad'`, `socketLocal(key,port)`, `mate(Ps,key,port,rollDeg)`, `containerMats(key)` → `[{slot, M, dir}]`, `massOf(key)`, `lenOf(key)`.
- Composition interne (forme actuelle de l'éditeur, conservée) : `{ id, name, type:'ship'|'station', company, registry, parts:[{id,key,parent,pport,port,roll,zone,door,company,containers}], extra_links:[[a,b,roll]], docking_ports:['id.PORT'], game:{} }`. `blank(type)`.
- Graphe : `part(c,id)`, `kids(c,id)`, `subtree(c,id)`, `ordered(c)`, `nextId(c,key)`, `usedPorts(c,excl?)`, `freePorts(c,excl?)` → `[{id,key,port,kind}]`, `compatible(c,key,free)`, `childPorts(key,kind)`, `defaultChildPort(key,parentKey,pport)`, `world(c)` → `Map(id → M)`, `normalize(c)`.
- Mutations (modifient `c`, aucun effet de bord UI) : `addPart(c,key,cand,port,roll=0)` → `{ok, part}` | `{ok:false, code:'station_prop'|'need_port'}` ; `movePart(c,pid,cand,port,roll)` → `{ok}` ; `deletePart(c,pid)` → `{ok, removed}` ; `replacePart(c,pid,key)` → `{ok, removed}` | `{ok:false, code:'port_incompatible'}`.
- Contrôles : `obb(M, box6, shrink)`, `obbOverlap(A,B)`, `rayOBB(o,d,b)`, `partOBBs(c,p,M)`, `analyze(c, W=world(c))` → `{ issues:[{sev:'ok'|'info'|'warn'|'err', code, args, ids}], obbs, colliding, pairs, aabb:[6], stats, com }`. Codes : `empty`, `station_prop`, `no_prop`, `multi_prop`, `no_cmd`, `jet_hit`, `thrust_offset`, `no_pwr`, `overlap`, `overlap_more`, `no_dock`, `valid_ship`, `valid_station`.
- Fiche : `stats` = `{parts, mass, containers, passengers, tank_m3, length_m, size_m}` (formules de `analyze` 1636-1650, inchangées) ; `autoGame(stats)`, `cleanGame(g,c)`, `resolvedGame(c,stats)`, `gameExport(c, analysis)` → `{data, warn}` | `{error:code}` ; tables `FAMILIES`, `ARCH_AUTO`, `CREW`.
- Import / export `stt-composition` v1 : `toExport(c, {companies, stats})`, `fromGraph(o)`, `fromShip(s)`, `fromStation(st)`, `importObject(o)` → `[c]`.

## 4. `modules-geom.json` et sa production

```json
{ "format": "stt-modules-geom", "version": 1, "source": "STT_ModuleLibrary.json", "sha1": "<source>", "axes": "gltf", "units": "m",
  "modules": { "PROP": { "mass_t": 0, "length_m": 0, "ports": ["FWD"], "sockets": { "FWD": [16] },
               "containers": [ { "slot": "01", "m": [16] } ], "hull": [6], "full": [6], "exhaust": [16] } },
  "container": { "hull": [6] } }
```
`sockets`/`containers`/`exhaust` = matrice du nœud relative à `STT_<KEY>_ROOT` (= `relMatrix`), 6 décimales ; `hull` = boîte des maillages statiques fusionnés (sous-arbres `DYNAMIC` exclus, regex de `index.html:996`, sommets exacts) ; `full` = statique + pièces animées à la pose du fichier (boîtes de géométrie transformées, comme `Box3.setFromObject` non précis) ; `container.hull` depuis `STT_CARGO_Container*`. Clés triées, sortie déterministe.
**Sans Blender ? Oui pour l'essentiel.** Sonde du pack : `stt_modules.glb` garde les 13 racines, 42 `SOCKET_*`, `VFX_PROP_MAIN_EXHAUST` et les `extras` (gltfpack `-kn -ke`) → sockets, masses, longueurs et hublot d'éjection lisibles en Python pur (TRS des nœuds composés). **Ce qui manque** pour des boîtes exactes depuis le pack : les sommets sont compressés `EXT_meshopt_compression` + quantifiés (uint16) ; seuls les `min`/`max` d'accesseur (présents sur les 364 primitives) sont lisibles → boîtes **majorées** si un maillage est tourné dans son module. Décision : le script lit par défaut la bibliothèque **non compressée** déjà dans le dépôt, `STT_modules/sources/STT_ModuleLibrary.json` (tampon `data:` en flottants, même entrée que l'éditeur → parité exacte), réutilise `read_library()` de `build_game_pack.py` (GLB ou glTF JSON) et ne retombe sur `min`/`max` (avec avertissement) que si l'entrée est compressée. Parité vérifiée : sockets du JSON produit = sockets du pack `stt_modules.glb` (≤ 1e-4 m).

## 5. Impacts

- **Éditeur autonome (r169)** : charge `<script src="../../shared/sttcomp.js"></script>` avant le module ; construit `geom` **depuis ses prototypes three** par un adaptateur `geomFromProtos()` (~40 l, réutilise `relMatrix`/`hullBox`/`fullBox` existants) → aucune dépendance au JSON, comportement identique hors ligne ; les fonctions du § 1 deviennent des enveloppes (`toast`, `commit`, `sel`) autour de `STTCOMP`. Il doit être servi depuis `demos/space-travel/` (`/STT_modules/sources/`), plus depuis `sources/` seul. L'autonome `chantier_naval_stt_autonome.html` est produit par `~/Documents/Blender/space-travel/scripts/build_viewer_standalone.py` (hors dépôt), qui retire l'importmap et n'intègre que le `<script type="module">` : il **doit apprendre à intégrer `sttcomp.js`** (voir points à trancher).
- **Démo « Observation des étoiles »** : `build/build.py` et `build_min.js` listent leurs modules en dur ; `sttcomp` n'y est pas → **aucun rebuild, aucune version `ode_`**. Seule la doc (`CLAUDE.md`, en-tête de `CODEMAP.md` « shared = aussi utilisé par la démo ») précise l'exception.
- **Jeu** : +`sttcomp.js` (≤ 35 Ko, voir § 2) et +`modules-geom.json` (≤ 25 Ko) → ≤ 60 Ko ; code non appelé avant L2.

## 6. Tâches

| Tâche | Contenu | Dépend de | Modèle | Taille | Parallèle | Sérialisé |
|---|---|---|---|---|---|---|
| L2a.1 | `build_modules_geom.py` + `--geom` dans `build_game_pack.py` ; génère `src/data/modules-geom.json` ; `modules-geom.test.mjs` (schéma, 13 modules, parité sockets avec le pack) | — | Sonnet | S (40 k) | vague A | — |
| L2a.2 | `shared/sttcomp.js` : `m4`/`v3`, `create(env)`, géométrie, graphe, mutations ; `_sttcomp.mjs`, `sttcomp-mat4.test.mjs`, `sttcomp-graph.test.mjs` (géom de test écrite à la main) | — | Sonnet | M (80 k) | vague A | — |
| L2a.3 | Sonde éditeur **avant** rebranchement : `?probe` expose `window.__sttProbe` (import, `toExport`, `analyze`, `freePortsList`, `computeWorld`, `geomFromProtos`) ; `editor_probe.py` produit `fixtures/sttcomp-golden.json` sur les 9 compositions + flotte de `fleet.json` | — | Sonnet | S (40 k) | vague A | — |
| L2a.4 | `sttcomp.js` : contrôles (OBB, SAT, jet), `analyze`, fiche (`stats`, `autoGame`, `cleanGame`, `resolvedGame`, `gameExport`) ; `sttcomp-checks.test.mjs` | L2a.1, L2a.2 | Sonnet | S (40 k) | non (même fichier) | — |
| L2a.5 | `sttcomp.js` : import / export ; `sttcomp-io.test.mjs` (aller-retour des 9 compositions) ; `sttcomp-golden.test.mjs` (noyau + `modules-geom.json` = éditeur) | L2a.3, L2a.4 | Haiku | S (40 k) | non | — |
| L2a.6 | Rebranchement de l'éditeur (`geomFromProtos`, enveloppes, suppression des doublons) ; `editor_probe.py --check` = golden ; `STT_INTEGRATION.md` § 11 | L2a.5 | Sonnet | M (80 k) | vague C avec L2a.7 | — |
| L2a.7 | `ORDER.txt` (+1 ligne), `CLAUDE.md`, `CODEMAP.md` régénéré ; mesure du poids ; `build.py` complet | L2a.5 | Haiku | XS (20 k) | vague C avec L2a.6 | **ORDER** |

Total ≈ 340 k (budget 350 k). Jusqu'à 3 DEV en vague A (fichiers disjoints : `STT_modules/*.py` + `src/data/` · `shared/sttcomp.js` + `unit/` · `index.html` + `STT_modules/tests/`). Aucune tâche ne touche `index.template.html` ni `I18N`.
Vérifications :
- L2a.1 : deux exécutions → octets identiques ; `node --test src/test/unit/modules-geom.test.mjs` ; taille ≤ 25 Ko.
- L2a.2, L2a.4, L2a.5 : `node --test` sur les fichiers du lot ; `grep -nE "THREE|document|window|Math\.random|Date\.now" shared/sttcomp.js` vide ; chargement par `require` **et** par vm.
- L2a.3 : `python3 -m http.server` dans `demos/space-travel/`, `editor_probe.py` (réseau requis : three r169 par CDN) ; golden versionné, ids aléatoires (`c.id`) exclus.
- L2a.6 : `editor_probe.py --check` (égalité exacte des exports et codes ; matrices et stats à 1e-6 près) ; capture de l'onglet Éditeur avant/après sur `stt-nexus` ; console sans erreur ; glisser-déposer, `R`, `P`, `Suppr`, `Ctrl+Z` à la main.
- L2a.7 : `python3 build.py` vert (compile, contrôle `@requires`, package, tests Playwright et Node) ; écart de taille de `target/space-travel.html` ≤ 60 Ko.

## 7. Risques et cas limites

- Régression de l'éditeur : mesurée par la sonde golden (L2a.3 avant toute modification, L2a.6 après) ; la sonde reste comme test de non-régression.
- `fullBox` dépend de la pose des pièces animées au premier appel (portes, panneaux) : le script prend la pose du fichier ; écart toléré de 0,1 m sur `length_m`/`size_m` (arrondis à 0,1), documenté si constaté.
- Copies divergentes : `viewer/index.html` (Blender, 302 Ko) ≠ `STT_modules/sources/index.html`, et `scripts/build_game_pack.py` ≠ `STT_modules/build_game_pack.py` (md5 différents) : une recopie depuis Blender effacerait le rebranchement.
- `normalize` permute la globale `comp` (1561) : à réécrire avec `c` explicite, piège de parité.
- Messages : passage texte → codes ; l'éditeur garde une table `ISSUE_FR` reproduisant mot pour mot les textes actuels (vérifié par la sonde).
- `addPart`/`replacePart` tirent des marques au hasard : injecté par `env.rand` ; la sonde compare hors marques tirées.
- Budget : si L2a.6 dépasse 100 k, couper en deux (graphe/mutations puis contrôles/import).

## 8. Alternatives écartées

- Boîtes depuis `stt_modules.glb` avec décodeur meshopt en Python : coûteux, la bibliothèque non compressée est déjà dans le dépôt.
- Produire `modules-geom.json` dans le navigateur (three) : non reproductible en ligne de commande.
- Faire lire `modules-geom.json` à l'éditeur : double source, risque d'écart ; il dérive `geom` de ses prototypes.
- Module ES (`export`) : incompatible avec le build par concaténation du jeu.
- Rebrancher `MODSHIP` dès L2a : hors périmètre (logique de vol), prévu en L2.
- `sttcomp` dans la démo : inutile, imposerait rebuild et version `ode_`.

## 9. Critères d'acceptation (fiche L2a)

1. `sttcomp.js` s'exécute sous Node seul (aucun `THREE`, `document`, globale hors `STTCOMP`) ; API du § 3.
2. Tests Node verts : construction, déplacement, remplacement, suppression, ports libres, collisions (OBB, SAT, jet), fiche (masse, palier, famille, équipage), aller-retour `stt-composition` sur les 9 compositions du dépôt.
3. L'éditeur charge et utilise `sttcomp.js` ; résultats identiques à la sonde golden.
4. `modules-geom.json` présent, produit par script reproductible, embarqué dans `sttData` ; parité des sockets avec le pack.
5. ≤ 60 Ko ajoutés au HTML du jeu ; `python3 build.py compile` et la suite existante verts.
