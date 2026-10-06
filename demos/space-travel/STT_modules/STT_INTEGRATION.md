# STT : note d'intégration pour le jeu (Space Travel & Transport)

Statut au 2026-10-03 : tout est livré. Les 13 modules sont modélisés, texturés, avec AO précalculé, et exportés en GLB. La flotte (5 vaisseaux), les stations (3 exemples) et le viewer Three.js sont faits et publiés. Les compositions de l'éditeur s'intègrent maintenant au jeu : vaisseaux jouables et ports orbitaux (§13).

Source de vérité pour les données : `fleet.json`. Toute l'arborescence est sous `~/Documents/Blender/space-travel/` sur mobilubuntu.

---

## 1. Fichiers

| Chemin | Contenu |
|---|---|
| `stt_freighter.blend` | Fichier maître Blender 5.2 : modules, flotte et stations en aperçu |
| `scripts/` | Pipeline Python paramétrique. L'ordre de lancement est au §10 |
| `export/modules/STT_<KEY>.glb` | 1 GLB par module, entre 0,5 et 1,7 Mo, origine = face d'amarrage avant |
| `export/modules/STT_Container_STT36.glb` | Container seul, instancié dans les slots |
| `export/modules/STT_ModuleLibrary.glb` | Bibliothèque de 8 Mo : tous les modules sous `STT_<KEY>_ROOT` et les 2 animations |
| `textures/` | Textures tuilables, `ao_<KEY>.png`, atlas `decals_<CO>.png`, `containers_<BRAND>.png`, `decals_station.png` |
| `fleet.json` | Modules, compagnies, marques de containers, vaisseaux, zones, stations, règles |
| `viewer/` | Viewer Three.js autonome. `STT_ModuleLibrary.json` est la version glTF JSON de la bibliothèque, avec les images dans `lib/` et `tex/` |
| `scripts/build_game_pack.py` | Pack des modules pour le jeu : gltfpack (meshopt) et textures réduites, écrit dans `sources/src/assets/` du jeu (§13) |

Viewer publié, privé : « Chantier naval STT », https://claude.ai/artifact/M7ZN5iEYiZMQU9kmj98gfm. C'est maintenant un **éditeur** (voir §11).
- Copie locale : `viewer/`.
- Pour l'ouvrir en local, il faut servir le dossier, car les fichiers JSON ne se chargent pas en `file://` : lancer `python3 -m http.server` dans `viewer/`.

Format de texture : WebP par défaut, la question était restée ouverte. La piste KTX2 est au §12.

---

## 2. Conventions

- Unités : mètres. Les UV sont en mètres (1 UV = 1 m) pour les textures tuilables. Le canal UV2 sert à l'AO.
- Axes :
  - Le nez est vers **+Z glTF** (= −Y Blender).
  - Le dos est vers **+Y glTF** (= +Z Blender).
  - Bâbord est +X Blender, avec le feu rouge. Tribord est −X, avec le feu vert.
- Origine d'un module : le centre de sa face d'amarrage avant. Le module s'étend vers l'arrière, soit −Z glTF.
  - La navette fait exception : son origine est le point de pose.
- Anneau d'amarrage STT-6 : Ø 6 m, demi-anneau 0,75 m. Tous les modules sont compatibles entre eux.
- Nommage dans les GLB :

| Préfixe | Rôle |
|---|---|
| `STT_<KEY>_ROOT` | Racine du module |
| `SOCKET_<KEY>_<PORT>` | Points d'accouplement |
| `SOCKET_CONTAINER_A..D` | Slots containers du CARGO |
| `SOCKET_CRG6_CONTAINER_1..6` | Slots containers du CRG6 |
| `RCS_<KEY>_<TR\|TL\|BL\|BR>_<AFT\|FWD\|TAN+\|TAN->` | Tuyères RCS. Le jet sort selon +Y local glTF |
| `VFX_PROP_MAIN_EXHAUST` | Point d'émission du panache. Il n'y a pas de mesh de panache, l'effet est à faire dans le jeu |
| `NAVLIGHT_*` | Feux de navigation |
| `STT_PROP_Nozzle` | Tuyère, avec son pivot sur le cardan |
| `STT_PWR_SolarGimbal_P/S` | Ailes solaires, rotation autour de l'axe X |

- Extras glTF (custom properties) : `stt_module`, `stt_length_m`, `stt_mass_t`, `stt_capacity`…
- Matériaux :
  - Ils sont nommés `STT_<Nom>`.
  - Les copies par module, qui portent l'AO, s'appellent `STT_<Nom>@<KEY>`. **Il faut toujours tester les noms par préfixe** (`startsWith`).
  - Tous les matériaux sont single-sided.

---

## 3. Catalogue des modules

| Clé | L (m) | Sockets (nom de nœud `SOCKET_<KEY>_…`) | Rôle |
|---|---|---|---|
| CMD | 13 | FWD, AFT | Passerelle, port d'amarrage de proue, RCS de proue |
| PAX | 21 | FWD, AFT | 24 cabines / 48 passagers, 5 ponts, 2 ceintures techniques |
| CARGO | 16 | FWD, AFT, et CONTAINER_A..D | 4 containers STT-36 en croix, axe long ‖ axe du vaisseau |
| CRG6 | 6,5 | FWD, AFT, et CRG6_CONTAINER_1..6 | 6 containers STT-36 en étoile, fixés par la face d'extrémité |
| TANK | 19 | FWD, AFT | 4 réservoirs ronds MLI dans une cage, 840 m³ |
| PWR | 11 | FWD, AFT | Ailes solaires en accordéon et radiateurs. Animation `PWR_Deploy` |
| PROP | 28 | FWD | Propulsion à fusion, tuyère Ø 8 m sur cardan, RCS de poupe. **Interdit sur les stations** |
| NODE6 | 10,1 | FWD, AFT, PORT, STBD, TOP, BOT | Nœud de connexion 3 axes |
| NODE4 | 10,1 | FWD, AFT, PORT, STBD | Nœud plan, avec radiateur et antenne |
| ELBOW | 10,1 | FWD, PORT | Coude à 90°, avec dôme d'observation |
| TUNNEL | 6 | FWD, AFT | Tunnel pressurisé d'espacement |
| BAY | 21 | FWD, AFT, SHUTTLE | Baie navette à ouverture latérale +X. Porte mécanique ou porte à champ |
| SHUTTLE | 14 | PAD, DORSAL | Navette utilitaire. PAD est le point de pose, sur sa face −Z Blender |

Container STT-36 : 3,6 × 3,6 × 12,192 m, avec une prise de grappin.

---

## 4. Sockets et règle d'accouplement

Repère d'un socket : **outward** = l'axe qui sort du module, **up** = la référence de roulis.

| Espace | outward | up |
|---|---|---|
| Blender | +Z local | +X local (= +Z monde, ou +Y pour les sockets verticaux) |
| glTF / Three.js | **+Y local** | **+X local** |

Pour placer un enfant contre un parent, la face de l'enfant doit être opposée à celle du parent :

```
glTF   : childRoot = parentSocketWorld · RotX(π) · RotY(roll) · inverse(childSocketLocal)
Blender: childRoot = parentSocketWorld @ RotX(180°) @ RotZ(roll) @ inverse(childSocketLocal)
```

- `childSocketLocal` est la matrice du nœud socket relative à `STT_<KEY>_ROOT`.
- Le roulis est en degrés et vaut 0 par défaut. Les anneaux sont ronds, donc toutes les valeurs sont valides.

Implémentation de référence en Three.js, tirée de `viewer/index.html` :

```js
const RX = new THREE.Matrix4().makeRotationX(Math.PI);
function mate(parentSocketWorld, key, port, rollDeg = 0) {
  return parentSocketWorld.clone().multiply(RX)
    .multiply(new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(rollDeg)))
    .multiply(socketLocal(key, port).clone().invert());   // socketLocal = matrice SOCKET_<KEY>_<PORT> relative à la racine
}
```

- **Vaisseau** : chaîne linéaire. Le FWD du module i s'accouple à l'AFT du module i−1. `module_offsets_m` donne les positions précalculées pour contrôle.
- **Station** : graphe de liens. Le placement part de `parts[0]` à l'origine puis parcourt les `links` en largeur, **dans les deux sens** : un lien peut être résolu depuis l'enfant, en inversant le roulis.

---

## 5. Schéma de `fleet.json`

| Clé | Contenu |
|---|---|
| `units`, `axes` | Mètres, +Z avant, +Y haut (glTF) |
| `modules{KEY}` | `length`, `glb`, `sockets[]`, `role`, et `container_slots[]` pour CARGO et CRG6 |
| `container_glb` | Chemin du GLB du container |
| `companies{CO}` | `name`, `registry`, `livery_linear`, `livery_dark_linear`, `livery_hex`, `decals` |
| `container_brands{BRAND}` | `name`, `code` (BIC fictif), `container_material`, `container_color_linear`, `decals` |
| `ships[]` | Voir ci-dessous |
| `zones{pax\|cont\|liq}` | `name` (Zone A Passagers, Zone B Containers, Zone C Liquides), `livery_linear`, `decal` |
| `stations[]` | Voir ci-dessous |
| `socket_mating_rule(_gltf)`, `runtime_material_rules`, `texture_factor_note`, `station_rule` | Les règles des §4, §6 et §8, en texte |

Champs d'un vaisseau (`ships[]`) :
- `id`, `name`, `class`, `company`, `registry`, `length_m`
- `modules[]` : liste ordonnée de la proue à la poupe
- `module_offsets_m[]` et `module_roll_deg[]`
- `containers{"<KEY>#<n>": [BRAND…]}` : `n` est l'occurrence du module dans le vaisseau. Les marques sont listées dans l'ordre alphabétique des sockets

Champs d'une station (`stations[]`) :
- `id`, `name`, `class`, `company`, `origin`
- `parts[[id, KEY, {zone?, door?}]]`
- `links[["a.PORT","b.PORT", roll?]]`
- `shuttles[["bay.SHUTTLE", CO]]`
- `docking_ports[{port, suggested_ship}]` : ports libres sur lesquels un vaisseau vient s'amarrer

Contenu actuel :
- 5 compagnies :
  - STT : Space Travel & Transport, bleu
  - HLN : Helion Lines, or
  - KVF : Kessler & Vance Freight, rouge
  - SHL : Starhaul Logistics, vert
  - AQB : Aquila Bulk, orange
- 7 marques de containers : VESTA, GANY, NOVA, ORION, LUNA, POLARIS, STTC.
- 5 vaisseaux :

| Vaisseau | Type | Composition | Longueur |
|---|---|---|---|
| STT Meridian | Mixte | CMD-PAX-CARGO-TANK-PWR-PROP | 108 m |
| Helion Aurora | Paquebot | 3 PAX | 134 m |
| K&V Longreach | Porte-containers long | 3 CARGO | 119 m |
| Starhaul Asterism | Porte-containers étoile | 2 CRG6 | 84 m |
| Aquila Wellspring | Citerne | 3 TANK | 109 m |

- 3 stations :
  - Vigil Relay : avant-poste relais.
  - Aquila Depot Theta : dépôt de carburant, zone liquides.
  - Nexus Port : port commercial avec 3 zones dédiées, 2 baies et 4 ports d'amarrage libres.

---

## 6. Matériaux pilotés à l'exécution

Cloner le matériau une seule fois par combinaison (matériau, style), puis réutiliser le clone en cache.

| Matériau (préfixe) | Règle |
|---|---|
| `STT_Livery` (et `STT_Livery_Dark` s'il est présent) | `color = livery_linear / 0.806`, plafonné à 1. Pour une station en zone : `zones[z].livery_linear`, et la variante sombre vaut × 0,35 |
| `STT_Decals_STT` | Remplacer `map` par `decals_<CO>`. Le layout de l'atlas est identique pour toutes les compagnies |
| `STT_Container_*` | `color = container_brands[b].container_color_linear / 0.745`, plafonné à 1 |
| `STT_ContDecals_*` | Remplacer `map` par `containers_<BRAND>` (même layout) |
| `STT_Decals_Station` | Fixe : signalétique des stations |

Points d'attention :
- Les couleurs sont **linéaires**. Les diviseurs 0,806 et 0,745 sont la moyenne de l'albédo des textures tuilables multipliées.
- Quand on remplace une texture, il faut recopier les réglages de l'originale : `flipY=false`, `colorSpace=SRGB`, wrap, et `KHR_texture_transform`. Le viewer le fait via `tex(url, mat.map)`.
- Les décals sont des quads flottants, décalés de 2 à 7 cm, en alpha MASK.
- L'AO est dans le canal occlusion, sur l'UV2 (texCoord 1).

---

## 7. Animations, variantes et containers

- **`PWR_Deploy`** (piste NLA, frames 1 → 100) : ailes repliées → déployées. À jouer une fois, puis bloquer en fin d'animation (`clampWhenFinished`).
- **`BAY_DoorMech_Open`** : ouverture des vantaux de la porte mécanique.
- **Variante de porte de la BAY** : afficher **soit** les nœuds `STT_BAY_DoorMech*`, **soit** les nœuds `STT_BAY_DoorField*`.
  - Le choix vient de `parts[..][2].door`, qui vaut `mech` ou `field`.
  - La porte à champ (`STT_Force_Field`) est un plan transparent d'opacité 0,14. On peut animer son opacité ou son émissif côté jeu.
- **Tuyère** : pivoter `STT_PROP_Nozzle`, dont le pivot est sur le cardan. Le panache est à brancher sur `VFX_PROP_MAIN_EXHAUST`.
- **Containers** :
  - Instancier `STT_Container_STT36.glb` sur chaque socket container. Repère local du container dans Blender : axe long = +Y, dessus = +Z.
  - Dans un CARGO, l'axe long est parallèle à l'axe du vaisseau et le dessus pointe radialement vers l'extérieur.
  - Dans un CRG6, l'axe long est radial et sort vers l'extérieur.
  - Larguer un container = le translater selon cette direction radiale.
  - Implémentation de référence : `containerMatrix()` dans le viewer.

---

## 8. Stations : règles

- **Une station n'a jamais de module PROP.**
- Les vaisseaux s'amarrent sur les `docking_ports` libres. On ne les fusionne pas dans la station.
- Stations de stockage : organisation en zones dédiées.

| Zone | Contenu | Couleur | Modules |
|---|---|---|---|
| A | Passagers | Vert | PAX et nœuds associés |
| B | Containers | Jaune | CARGO / CRG6 |
| C | Liquides | Orange-rouge | TANK |

- La zone s'applique via `parts[..][2].zone`. Elle change la livrée et ajoute la signalétique de zone.
- Navettes : instancier `SHUTTLE` via `mate(SOCKET_BAY_SHUTTLE, 'SHUTTLE', 'PAD')`, avec la livrée de la compagnie indiquée.

---

## 9. Performance (web)

- Volume mid-poly : 6 à 10 k tris par module.
- **Le seul vrai coût est le nombre de draw calls**, pas les triangles. Le viewer fusionne les géométries statiques **par matériau et par prototype de module**, une seule fois, puis clone le résultat.
  - Exemple : Nexus Port fait environ 316 k tris et 944 draw calls après fusion. Le rendu a été vérifié correct en rendu logiciel (SwiftShader). C'est le cas le plus lourd.
- Sous-arbres à **ne pas** fusionner (regex du viewer) : `/SolarGimbal|Radiator_|DoorMech|DoorField|Nozzle|_Int_/`.
- Intérieurs : les nœuds `_Int_` sont dans la collection Passagers_Int. Les masquer en vue extérieure, ou les charger à la demande.
- Les textures tuilables sont partagées entre tous les modules. Seuls l'AO (512 px) et les atlas de décals sont propres à chaque module ou compagnie.

---

## 10. Régénérer les assets

1. **Textures** : lancer `gen_textures.py`, `gen_fleet_decals.py` puis `gen_station_decals.py`, avec Python, numpy et PIL. La sortie va dans `textures/`, et les rectangles des atlas dans les JSON `textures/*.json`.
2. **Blender** : ajouter `scripts/` à `sys.path`, puis lancer chaque module avec `importlib.reload(mod)` :
   1. `scene_setup.setup_scene()`, puis `stt_core.build_all_materials()`
   2. Construire chaque module avec `mod_<x>.build()` : command, passengers, cargo, cargo_star, tanks, energy, propulsion, bay, shuttle. Pour les connecteurs : `mod_connectors.build_all()`
   3. `assembly.assemble()`, qui contrôle aussi les écarts entre sockets
   4. `materials.apply_textures()`
   5. `decals.apply_all()`
   6. `ao.run(KEY)` pour chaque module, puis `ao.run_containers()`. Le bake se fait avec Cycles, 128 échantillons
   7. Facultatif, aperçus dans Blender : `fleet.build_all()` et `stations.build_all()`
   8. `export_glb.run()` : exporte 1 GLB par module, le container et la bibliothèque. Format WebP, extras activés, animations en NLA_TRACKS
3. **Viewer** : convertir la bibliothèque en glTF JSON avec images externes, à lancer depuis le dossier `space-travel/` :
   `python3 scripts/glb_to_gltf_json.py export/modules/STT_ModuleLibrary.glb viewer/`
   - Le script produit `viewer/STT_ModuleLibrary.json`, où le buffer est intégré en base64, et extrait les images dans `viewer/lib/*.webp`.
   - Il n'utilise que la bibliothèque standard de Python.
   - L'option `--check fichier.json` vérifie que le résultat est identique, octet pour octet, à un fichier de référence.
   - Cette étape ne sert qu'à la publication en artifact.
4. **Jeu** : produire le pack des modules, à lancer depuis le dossier `space-travel/` :
   `python3 scripts/build_game_pack.py --out ~/Projects/web/csblog/demos/space-travel/sources/src/assets`
   - Il faut Pillow et Node (gltfpack est lancé par `npx`).
   - Puis, dans le jeu : `python3 build.py` (voir §13).

Via le MCP, un appel s'arrête au bout de 60 s, mais Blender continue à travailler. Pour les bakes et les exports, vérifier ensuite que les fichiers ont bien été produits.

---

## 11. Éditeur et format `stt-composition`

L'éditeur a deux onglets :
- **Galerie** : les vaisseaux et stations de `fleet.json`, en lecture seule.
- **Éditeur** : composition libre.

Fonctions de l'éditeur :
- **Assemblage** :
  - Glisser-déposer depuis la barre de modules : un fantôme holographique s'aimante au port libre le plus proche.
  - Clic sur un module de la barre : il s'ajoute au port arrière de la pièce sélectionnée, ce qui permet d'empiler un vaisseau rapidement.
  - Une pièce sélectionnée peut être glissée vers un autre port : elle emmène toute sa branche.
- **Raccourcis** : `R` roulis ±90°, `P` changer de port, `Suppr` supprimer, `F` recadrer, `Ctrl+Z` / `Ctrl+Y` annuler / rétablir (historique de 120 états).
- **Inspecteur** de la pièce sélectionnée : port utilisé, roulis, zone (stations), porte de baie, compagnie de la navette, marque de chaque container, remplacement de module, suppression de la branche.
- **Port libre sélectionné** : le déclarer comme port d'amarrage (stations uniquement), ou y ajouter un module compatible.
- **Compagnie personnalisée** : nom, sigle, slogan, immatriculation, couleur, emblème (11 au choix).
  - Les stickers sont dessinés en canvas sur le gabarit `decals_STT` : seuls les rectangles `logo_*` et `reg_*` sont redessinés.
  - Une immatriculation propre à la composition redessine seulement `reg_*`.
- **Contrôle** :
  - Station avec PROP → erreur.
  - Vaisseau : 0 ou plusieurs PROP, pas de CMD, pas de PWR → avertissement.
  - Jet du propulseur qui frappe un module → erreur (rayon contre OBB).
  - Poussée décentrée de plus de 2,5 m par rapport au centre de masse → avertissement.
  - Chevauchements : test OBB par séparation d'axes (SAT) sur les coques réduites de 0,35 m, containers compris, couples parent-enfant ignorés.
- **Fichiers** : export et import JSON (fichier, coller, ou glisser-déposer un .json sur la page), bibliothèque personnelle (localStorage du navigateur), brouillon enregistré automatiquement, capture PNG (vue courante ou profil).
- **Onglet Prise de vue** :
  - Sujet : composition en cours, bibliothèque ou flotte.
  - Caméra : angles prédéfinis, focale de 14 à 200 mm, profondeur de champ (mise au point au clic), formats 16:9 / 21:9 / 1:1 / 4:5 / 9:16 avec grille des tiers, plein cadre.
  - Travelling : orbite, passage ou approche, avec enregistrement WebM de 10 s.
  - Tous les réglages de rendu sont dans cet onglet. Les filtres d'image ne s'appliquent qu'en Prise de vue, le bloom partout.
- **Planète d'arrière-plan** :
  - Le générateur vient du moteur STT : les shaders de `observation-des-etoiles/src/planets.js` sont repris tels quels (surface, 3 couches de nuages, atmosphère diffusante, aurores), avec des anneaux ajoutés pour les géantes gazeuses.
  - Réglages : type, graine, océans, nuages, teinte, atmosphère, distance et position. Ils sont gardés dans le navigateur (`stt.planet.v1`).
  - Rendu : scène et caméra séparées à l'échelle planétaire, rendues dans une texture HDR placée en arrière-plan de la scène des vaisseaux, à une résolution de ½, ¾ ou 1 selon la qualité.
- **Correctif écran noir** : une passe nettoie le tampon HDR (suppression des NaN, plafond à 48) avant le bloom. Les sources lumineuses sont tenues à distance des surfaces.
- L'import accepte :
  - un `stt-composition` ;
  - un vaisseau ou une station de `fleet.json` ;
  - `fleet.json` entier : toutes les entrées vont dans la bibliothèque.

Format exporté (exemple : `viewer/exemple_composition.json`) :

```json
{
  "format": "stt-composition", "version": 1, "id": "c…", "name": "…", "type": "ship|station",
  "company": "STT|<clé perso>", "registry": "STT-0107",
  "companies": { "XORBIT": { "name": "…", "mark": "ORBITAL", "tagline": "…", "registry": "ORC-0451", "livery_hex": "#7b3fb3", "emblem": "star4" } },
  "root": "cmd1",
  "parts": [["cmd1","CMD"], ["bay1","BAY",{"door":"field","zone":"pax"}], ["shuttle1","SHUTTLE",{"company":"HLN"}]],
  "links": [["cmd1.AFT","pax1.FWD",0], ["bay1.SHUTTLE","shuttle1.PAD",0]],
  "containers": { "cargo1": ["VESTA","ORION",null,"NOVA"] },
  "docking_ports": [{ "port": "n1.PORT" }],
  "stats": { "parts": 6, "mass": 1191, "containers": 4, "passengers": 48, "tank_m3": 840, "length_m": 108.1, "size_m": [14.4,13.4,108.1] }
}
```

- `parts` et `links` ont la même structure que les stations de `fleet.json` : le placement se fait avec la même règle (§4, parcours en largeur dans les deux sens).
- Les navettes sont des pièces ordinaires (`SHUTTLE`, attachées par `PAD` au port `SHUTTLE` de la baie, ou par `DORSAL` à un anneau). Le champ `shuttles` de `fleet.json` est converti à l'import.
- `companies` n'est présent que si la composition utilise une compagnie personnalisée. Pour la livrée, appliquer les règles du §6 avec `livery_linear` = conversion sRGB→linéaire de `livery_hex`, et la variante sombre × 0,38.
- `stats` est informatif, recalculé à chaque export.

### Noyau d'assemblage `STTCOMP` (lot L2a)

Les règles d'assemblage de l'éditeur (repères, ports, graphe de pièces, ajout / déplacement / remplacement / suppression, contrôles OBB / SAT / jet, fiche de jeu, import / export `stt-composition`) vivent dans `demos/space-travel/shared/sttcomp.js` (une globale `STTCOMP`, sans three, sans DOM, sans `Math.random` : aléa et identifiants sont injectés). L'éditeur n'en garde que des **enveloppes** qui conservent leurs noms (`portsOf`, `P`, `kids`, `subtree`, `ordered`, `usedPorts`, `freePortsList`, `compatible`, `computeWorld`, `normalize`, `addPart`, `movePart`, `deletePart`, `replacePart`, `analyze`, `toExport`, `importObject`…) et convertissent aux frontières les matrices en `THREE.Matrix4` et les boîtes en `Box3` :
- `index.html` charge `<script src="../../shared/sttcomp.js"></script>` avant son module, puis crée au démarrage `K = STTCOMP.create({ geom, fleet, knownCompany, companyOf, mergeCompanies, rand: Math.random, uid })`, une fois les prototypes chargés.
- `geom` est construit **depuis les prototypes three** par `geomFromProtos()` (sockets, masses, boîtes `hull` / `full`, hublot d'éjection) : l'éditeur ne lit pas `modules-geom.json`, il reste autonome et identique hors ligne.
- La composition `comp` est passée explicitement au noyau ; `toast`, `commit`, la sélection, le cadrage, le rendu, l'historique et le glisser-déposer restent dans l'éditeur.
- Le noyau rend des **codes** (`jet_hit`, `overlap`…) ; la table `ISSUE_FR` de l'éditeur les traduit en français (textes inchangés).
- **Précision** : la géométrie du jeu (JSON arrondi à 6 décimales) et celle de l'éditeur (`geomFromProtos`, pleine précision) peuvent différer jusqu'à 1e-5 m.
- **Service** : comme l'éditeur charge `../../shared/sttcomp.js`, il se sert désormais depuis la racine `demos/space-travel/` (`python3 -m http.server` dans ce dossier, page `/STT_modules/sources/index.html`). Ouvert depuis `STT_modules/sources/` seul, le script du noyau est introuvable. L'éditeur autonome produit par `build_viewer_standalone.py` (hors dépôt) n'est pas modifié : son intégration du noyau est reportée.
- **Sonde de non-régression** : `?probe` expose `window.__sttProbe` (enveloppes, `geomFromProtos`) ; `python3 STT_modules/tests/editor_probe.py --check` compare l'éditeur au golden `sources/src/test/unit/fixtures/sttcomp-golden.json` (exports et codes / messages à l'identique, matrices et stats à 1e-6 près) ; sans `?probe`, `__sttProbe` est indéfini.

---

## 12. Pistes suivantes

| Option | Coût / effort | Valeur | Avis |
|---|---|---|---|
| Navette-cargo du jeu tirant les containers des modules CARGO / CRG6 (pile qui se vide à l'escale) | Moyen | Élevée pour les cargos modulaires | Aujourd'hui, ce sont les engins de baie qui livrent |
| Amarrage P2 sur les postes « ring » des stations modulaires (accostage par l'avant sur un anneau STT-6) | Moyen à élevé | Élevée, c'est la séquence d'amarrage de la spec | À faire avec le lot P2 du jeu |
| Fusion des containers en atlas, et des teintes en couleurs de sommet | Moyen | Moyenne : une station passerait d'environ 47 à environ 30 appels de dessin | Si les ports deviennent nombreux |
| `InstancedMesh` pour les containers et les modules répétés | Faible | Élevée : beaucoup moins de draw calls dans les stations et la flotte | **À faire en premier** |
| Compression KTX2 (Basis) et meshopt | Faible à moyen, à faire dans le pipeline d'export | Élevée : moins de VRAM, chargement 2 à 4 fois plus rapide | Recommandé avant la mise en ligne |
| LOD à 2 niveaux (decimate dans le script d'export) | Moyen | Élevée pour les vues lointaines et les stations | Utile quand il y a beaucoup de vaisseaux à l'écran |
| Panache en shader sur `VFX_PROP_MAIN_EXHAUST` | Moyen | Élevée visuellement | Bon rapport qualité / coût |
| Coques de collision simplifiées (1 boîte par module) | Faible | Moyenne : nécessaire pour la physique et l'amarrage | Selon les besoins du gameplay |
| Intérieurs détaillés | Élevé | Faible à moyenne | Plus tard, seulement si le jeu montre l'intérieur |

---

## 13. Intégration dans le jeu (Space Travel & Transport)

Chemin complet, de l'éditeur au jeu :

```
Éditeur « Pour le jeu »  →  fichier stt-composition + bloc game
   ├─ sources/src/data/compositions/*.json  →  python3 build.py  →  jeu publié
   └─ hangar du jeu : « Importer une création… »  →  gardé dans le navigateur
Blender → export_glb.run() → scripts/build_game_pack.py → sources/src/assets/  (pack des modules, embarqué au build)
```

### Pack des modules (`scripts/build_game_pack.py`)

- Le pack est fait avec gltfpack et les options `-kn -km -ke -cc -vtf` :
  - les nœuds nommés (`SOCKET_*`, `RCS_*`, `VFX_*`, `NAVLIGHT_*`, `STT_<KEY>_ROOT`), les matériaux et les extras sont gardés ;
  - la compression est meshopt ;
  - les UV restent en flottants.
  - Le script vérifie qu'aucun nœud nommé n'a été perdu.
- Textures : MLI réduit à 512 px, atlas de décals à 1024 px. L'AO (512 px) et les textures tuilables ne changent pas.
- Mesure :

| Avant | Après |
|---|---|
| 8,4 Mo de bibliothèque | 3,0 Mo de GLB + 0,5 Mo d'images de livrées et de `stt_fleet.json` |
| HTML du jeu : 1,5 Mo | 6,1 Mo (lisible), dont 4,5 Mo de pack en base64 |

- GitHub Pages compresse le HTML en gzip. Sur le réseau, le pack pèse donc environ sa taille binaire.

### Build du jeu (`sources/build.py`)

- Le pack est embarqué dans un bloc `<script type="application/json" id="sttPack">`, inséré au marqueur `<!--@PACK@-->` du gabarit. Ce bloc n'est ni passé à terser ni minifié.
- Le bloc vendor contient maintenant three r128, `GLTFLoader.r128.min.js` et `meshopt_decoder.r128.js`. Ce sont les fichiers non-module de three r128 : le GLTFLoader lit WebP, la quantification et meshopt.
- `src/data/compositions/*.json` : chaque fichier doit être un `stt-composition`, sinon le build s'arrête.
- Le gabarit charge aussi Barlow Condensed, la police des décals dessinés pour une compagnie personnalisée.

### Module de jeu `09c-vaisseaux-modulaires.js` (`MODSHIP`)

- Place dans `ORDER.txt` : après `shared/postfx.js`, donc après toutes les enveloppes de `SHIPGEN.build`.
- **Chargement** :
  - la bibliothèque est décodée une fois, de façon asynchrone, pendant l'écran-titre ;
  - le hangar attend `MODSHIP.whenReady` ;
  - ensuite, tout assemblage est synchrone, comme `SHIPGEN.build` l'exige.
- **Assemblage** :
  - même règle que l'éditeur (§4), avec un parcours des liens dans les deux sens ;
  - mêmes livrées, décals (canvas pour les compagnies personnalisées) et marques de containers ;
  - ailes solaires déployées, portes de baie ouvertes (ou champ de force) ;
  - intérieurs retirés.
- **Axes et échelle** : la coque est tournée de 180° autour de Y (nez en −Z dans le jeu). Les unités sont les mètres, ce qui correspond au mode échelle réelle.
- **Une maille par matériau** :
  - vaisseau : 67 à 130 appels de dessin, AO par module gardée ;
  - station : matériaux de base sans AO, 28 à 47 appels de dessin.
  - Les géométries, matériaux et textures partagés sont protégés de `dispose()` par `MODSHIP.keeps()`.
- **Contrat de `SHIPGEN.build`** :

| Élément du jeu | Source dans la composition |
|---|---|
| Tuyère Epstein (`fx.addEpsteinDrive`) | `VFX_PROP_MAIN_EXHAUST` de chaque PROP |
| Lumière de poupe | Une par vaisseau |
| Pods RCS (jets radiaux) | Groupes de `RCS_<KEY>_<coin>` |
| Feux de position du jeu | `NAVLIGHT_*` (rouge bâbord, vert tribord) |
| Balises clignotantes | Stroboscopes |
| Anneaux de distorsion et générateur de saut | Moitié arrière du module PROP (`userData.reactor`) |
| `b.docks` | Une baie latérale par module BAY (ouverture 18 × 5,2 m). La navette amarrée s'efface pendant la sortie d'un engin |

  - Les greffons procéduraux (`realDrive`, `realGlass`, `hiTex`) sont coupés pour ces coques.
  - L'usure (`shipwear`) s'applique.
- **Fiche** :
  - masses réelles (`stt_mass_t` des modules, 6,5 t par container) ;
  - `shipSpecs()` : masse en charge = containers × 24 t + réservoirs × 0,92 t/m³ + passagers ;
  - équipage de la fiche ;
  - `m.cap` pour les missions à containers.
- **Familles** :

| Famille | Groupe du jeu | Comportement |
|---|---|---|
| fret | « Fret modulaire » | Missions à containers, livrées par les engins de baie |
| passagers | Passagers | Comme les vaisseaux passagers du jeu |
| vrac | Fret en vrac | Comme les vaisseaux de vrac du jeu |
| independant | Indépendants | Comme les indépendants du jeu |
| pousseur | Pousseurs | Comme les pousseurs du jeu |

  - Sans baie, la livraison est directe, comme pour le citernier.
- **Chantier naval** : les long-courriers modulaires (paliers III et IV) y sont en vente.
- **Stations** : 4ᵉ archétype de port, `modular`.
  - Il représente 30 % des ports non gazeux, si au moins une station est disponible.
  - Les postes sont les anneaux déclarés, en mode `ring` (accostage par l'avant), avec la classe S/M/L de la fiche.
  - Il y a toujours au moins un poste L.
  - Une balise est placée au-dessus.
  - Le budget de rendu des ports modulaires est de 60 appels, contre 14 pour les ports procéduraux.

### Bloc `game` des fichiers stt-composition (export « Pour le jeu »)

```json
"game": { "version": 1, "class": "ship", "family": "passagers", "tier": "III", "ftl": true, "crew": 6,
          "arch": "Paquebot modulaire", "description": "…" }
"game": { "version": 1, "class": "station", "description": "", "berths": [{ "port": "n1b.PORT", "cls": "L" }] }
```

Règles automatiques, les mêmes dans l'éditeur et dans le jeu :

| Champ | Règle |
|---|---|
| Palier | I sous 800 t, II sous 1 300 t, III sous 2 000 t, IV au-delà |
| Famille | 4 containers ou plus → fret ; 48 passagers ou plus → passagers ; 1 680 m³ de réservoirs ou plus → vrac ; 4 pièces ou moins → pousseur ; sinon indépendant |
| Long-courrier | Paliers III et IV |
| Équipage | 2 / 4 / 6 / 10 selon le palier |

### Tests

- `src/test/modulaire_test.py` (20 contrôles) :
  - pack décodé, compositions enregistrées ;
  - contrat de chaque coque, construite deux fois (prototypes intacts après `dispose`) ;
  - fiches ;
  - import, et refus d'un fichier invalide ;
  - baie et engin de baie ;
  - hangar ;
  - stations ;
  - vol de 8 s, sans erreur JavaScript.
- Tests adaptés :
  - `ports_test.py` : budget par archétype ;
  - `commerce_test.py` : long-courriers procéduraux + modulaires.
- La flotte de `fleet.json` est fournie dans `src/data/compositions/stt-*.json` : 5 vaisseaux et 3 stations, exportés par l'éditeur.
