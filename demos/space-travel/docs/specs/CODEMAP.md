<!-- GÉNÉRÉ par sources/tools/codemap.py — NE PAS ÉDITER : cd demos/space-travel/sources && python3 tools/codemap.py -->
# CODEMAP — carte du code (Space Travel & Transport)

**Généré, ne pas éditer.** Régénérer : `cd demos/space-travel/sources && python3 tools/codemap.py`. Les sections suivent l'ordre de `ORDER.txt` = ordre de chargement (scripts classiques, portée globale partagée).
Usage : repérer `nom:ligne`, puis lire par plage (`sed -n 'a,bp' fichier`) plutôt que le fichier entier.
**Liste noire** (ne jamais lire en entier) : fichiers de plus de 300 Ko (dont `src/JS/vendor/*.min.js`), `*.min.html`, `sources/target/*`, `docs/spec-*-P1.md`, `docs/specs/*-autonome.md`, `STT_ModuleLibrary.json`, `*.glb`, `archives/` ; voir aussi `CLAUDE.md`.
Chemins : sans préfixe = `sources/src/JS/game/` ; `sim/`, `ui/` = `sources/src/JS/sim/`, `ui/` ; `shared/` = `demos/space-travel/shared/` (source unique, aussi utilisée par la démo « Observation des étoiles »).
Légende : `fn` = function de niveau 0 · `var` = const/let/var de niveau 0 · `ns X` = `const X = (function(){…})()` et clés de son `return {…}` final (ligne de la déclaration locale, sinon de la clé) · `win` = `window.__X =` (×n = nombre d'affectations) · `[IIFE]` = module entièrement enveloppé : les déclarations listées sont locales, seuls les `win` sont globaux · `@provides` / `@requires` = balises de dépendances.
Source de l'ordre : `src/JS/game/ORDER.txt` (69 entrées). 69 fichiers lus (0 absents ou ignorés) · 14930 lignes · 262 fn · 402 var · 21 ns · 26 window.__.

## Modules
### 00-prologue.js · 1 l
### 01-internationalisation-francais-existant-anglais.js · 316 l — 0. INTERNATIONALISATION — français (existant), anglais, allemand,
- fn: t:133, applyLanguage:284
- var: LANG:6, I18N:7, RADIO_TEMPLATES:142
### 02-prng-seede-tout-l.js · 30 l — 1. PRNG SEEDÉ — tout l'univers découle d'une seule graine
- fn: xmur3:4, mulberry32:17, rngFor:25
- var: SEED:28
### sim/00-game-state.js · 112 l — CAMPAGNE 1. ÉTAT DE PARTIE — GAME : état SPEC-010 § 2.5, événements, commandes, horloge
- ns GAME:6: state:108, newCampaign:38, load:63, reset:70, mode:71, on:15, emit:28, cmd:89, tick:98
- @provides GAME
### sim/01-rng-game.js · 13 l — CAMPAGNE 2. ALÉA DE LA SIMULATION — RNG.game(tag) : suites déterministes dérivées de la graine de la partie
- ns RNG:6: game:8
- @provides RNG · @requires GAME · @requires-engine xmur3, mulberry32, SEED
### sim/02-data.js · 37 l — CAMPAGNE 3. DONNÉES — DATA : tables embarquées au build dans <script type="application/json" id="sttData">
- ns DATA:6: get:25, all:31, _set:34
- @provides DATA
### sim/03-save.js · 100 l — CAMPAGNE 4. SAUVEGARDE — SAVE : sérialisation versionnée, stockage local, export / import de fichier
- ns SAVE:7: VERSION:94, KEYS:8, MIGRATIONS:9, serialize:17, parse:23, write:42, read:54, has:63, setStorage:71, exportFile:74, importText:89
- @provides SAVE · @requires GAME
### 03-generateur-de-noms-melange.js · 34 l — 2. GÉNÉRATEUR DE NOMS — mélange de racines grecques, latines, hindi,
- fn: cap:17, toRoman:21, generateName:22
- var: LANG_BANKS:5, LANG_KEYS:16, ROMAN_NUMERALS:20
### 04-modele-astrophysique.js · 160 l — 2bis. MODÈLE ASTROPHYSIQUE
- fn: pickWeighted:34, blackbodyRGB:45, luminosityFromMass:75, radiusFromLT:83, apparentMagnitude:89, generateStar:96
- var: SPECTRAL_CLASSES:10, LUMINOSITY_CLASSES:23, T_SUN:31, MBOL_SUN:32, NEBULA_TYPES:150
### 05-scene-three-js.js · 161 l — 3. SCÈNE THREE.JS
- fn: updateStarLighting:45, makeGlowTexture:83, makeNoiseTexture:102
- var: canvas:4, renderer:5, scene:12, camera:15, starLight:33, lightState:37, _lightTmpDir:42, _lightTmpCol:43, glowTex:93, noiseTex:161
### 05b-couches-de-rendu.js · 79 l — 3ter. RENDU EN DEUX COUCHES (lot L2.1 — fusion de la démo v7.2.2)
- ns LAYERS:20: sysScene:21, sysWorld:23, shipWorld:24, rcam:28, cfg:33, stats:34, render:38, detach:36
### 06-shader-de-surface-stellaire.js · 225 l — 3bis. SHADER DE SURFACE STELLAIRE
- fn: createStarLabel:80, createPoolLabel:102, projectShipLabel:122, updateShipLabels:159, projectLabel:173, updateCelestialLabels:196
- var: STAR_VERT:6, STAR_FRAG:22, labelContainer:79, PLANET_LABEL_POOL:112, MOON_LABEL_POOL:113, SHIP_LABEL_POOL:119, SHIP_LABEL_MIN_DIST:121, PLANET_LABEL_RANGE:168, PORT_LABEL_RANGE:169,
  MOON_LABEL_RANGE:170, _lblNdc:171, _pfForward:194
### 07-fond-d-etoiles-decoratives.js · 128 l — 4. FOND D'ÉTOILES DÉCORATIVES — plusieurs couches, recentrées sur le
- fn: buildStarLayer:32
- var: backdrop:5
- ns STAR_SAMPLE:21: (retourne une valeur, pas un objet littéral)
- win: __backdrop:7
### 08-le-vaisseau-support-commun.js · 24 l — 5. LE VAISSEAU — support commun : le rig (position et orientation pilotées
- var: shipRig:7, shipMesh:10, SHIP_LABEL_RADIUS:23, SHUTTLE_LABEL_RADIUS:24
- ns SHIP_REGISTRY:14: (retourne une valeur, pas un objet littéral)
### 09-les-vaisseaux-generateur-v2.js · 1178 l — 5. LES VAISSEAUX — GÉNÉRATEUR (v2.13)
- fn: buildDockModule:976, mountHull:1108, gameLen40:1145, installShip:1149, refitJumpCore:1175
- var: SHIP_CAN_JUMP:1098, SHIP_GAME_LEN:1098, SHIP_BUILD:1098, SHIP_WARP:1098, WARP_FACTOR:1098, SHIP_DEFAULT_ID:1099, shipBody:1100, RCS_TRAIL_LEN:1102, rcsTrailGeo:1103, SHIP_HULL:1105,
  SHIP_K:1105, SHIP_ID:1105, SHIP_WEAR:1148
- ns SHIPGEN:11: MODELS:865, build:946, tick:964, setDrive:306, DRIVE_U:161, FTL_U:321, JUMP_U:389, NAV:14, dispose:919, CARGO_COLORS:481, fx:970
- win: __dockGlow:1015, __dockHalos:1037, __dockLight:1044, __engineGlows:1110, __rcs:1110, __beacons:1111×2, __navLights:1135, __engineCones:1153
### shared/shipdrive.js · 237 l [IIFE] — MOTEURS PRINCIPAUX RÉALISTES — tuyères de torche de fusion (option du générateur, sans modifier le moteur)
- fn: contour:23, rAt:35, revolve:37, DRIVE_OBC:81, driveMat:90, capMat:99, plainMat:110, mergeParts:150, isBell:165
- var: D:18, V3:19, smooth:20, PARS_V:47, PARS_F:50, TUBES:58, TINT:69, GLOW:74, DRIVE_KEY:89, TORCH_FRAG:116, _e:221, _q:221, build0:231
- win: __SHIPDRIVE:18
### shared/shipglass.js · 754 l [IIFE] — HUBLOTS, BAIES ET HANGARS RÉALISTES — option du générateur (sans modifier le moteur)
- fn: maskMaterial:503, survey:515, cabinsOf:556, portShape:588, seedOf:606, glassGeometry:607, buildBays:718
- var: GL:20, V3:21, U:22, TYPE:23, BELLY:26, SHAPE:36, VERT:52, FRAG:73, key:536, CAB_N:544, cabList:545, CABINS:546, OLD:585, FAM:586, bridgeShape:594, panoShape:595, bayShape:596,
  STYLE:600, styleOf:602, SIDE:641, build0:745
- win: __SHIPGLASS:20
### 09b-baies-ventrales.js · 9 l — ajout du jeu (lot N2) — porte-conteneurs : baie ventrale de la navette-cargo (17,5 × 5,6 × 6,8 m) au point d'…
### shared/smallcraft.js · 307 l [IIFE] — PETITS ENGINS — générateur procédural (remplace les navettes du jeu dans la démo)
- fn: canvasTex:24, bayOBC:44, mats:56, T:78, part:85, box:86, prism:88, cyl:96, rod:97, bell:98, rcsPod:101, plume:117, glowMat:123, navLight:124, lampCone:127, merge:137, buildMaint:155,
  buildCrew:182, buildDrone:212, buildLighter:241, greeble:265
- var: CR:17, V3:18, ORDER:19, TEX_K:23, rs:26, rnd:26, PANEL:27, HAZARD:37, CARGO:39, BAY_PARS_V:42, BAY_PARS_F:43, PLUME_V:106, PLUME_F:111, PAINT:153, BUILDERS:269
- win: __CRAFT:17
### shared/warpring.js · 85 l [IIFE] — ANNEAUX DE DISTORSION (v7.2) — window.__WARPRING
- fn: survey:32
- var: WR:16, HALO_V:17, HALO_F:18, build0:79
- win: __WARPRING:16
### shared/shipwear.js · 305 l [IIFE] — VIEILLISSEMENT DES VAISSEAUX — option du générateur : SHIPGEN.build(modèle, { age, ageSeed })
- fn: WEAR_OBC:178, kindOf:188, hashSeed:212, recolor:227, placeSpots:236
- var: W:15, clamp:16, PARS_V:18, HOLD_F:23, PARS_F:37, FLOOD:122, AFTER_MAP:149, AFTER_METAL:157, AFTER_NORMAL:161, LIGHTS_HOLD:169, WEAR_KEY:187, PAL:200, DARKS:209, P_DARK:210, LIV:223,
  lin:224, HULL_L:225, MID_L:225, near:226, build0:291
- win: __SHIPWEAR:15
### shared/hitex.js · 64 l [IIFE] — TEXTURES HAUTE RÉSOLUTION (v7.1) — window.__HITEX
- fn: prng:15, canvas:16, hull:18, hazard:37, ribs:39, fins:40, upgrade:47
- var: HX:12, Q:13, K:13, RECIPES:41, done:46, byImage:46, build0:61
- win: __HITEX:12
### shared/postfx.js · 113 l [IIFE] — PROFONDEUR DE CHAMP (lot 3, v6.9) — window.__POSTFX
- fn: makeTarget:80, pass:97
- var: P:15, ok:16, rtScene:16, rtA:16, rtB:16, rtOut:16, qCam:17, qScene:17, quad:17, VERT:19, COMMON:20, U:26, matDown:28, matBlur:38, matComp:56
- win: __POSTFX:15
### 09c-vaisseaux-modulaires.js · 574 l — 5 ter. VAISSEAUX ET STATIONS MODULAIRES — compositions du « Chantier naval STT »
- ns MODSHIP:15: ready:568, settled:568, failed:568, whenReady:64, keeps:569, importText:507, update:548, stationPort:521, statsOf:395, portsOf:157, hasStations:570, stations:571, ships:571,
  onChange:572, _st:19
### 10-panneau-de-jauges-moteur.js · 75 l — 5bis. PANNEAU DE JAUGES MOTEUR — construit dynamiquement à partir des
- fn: buildEnginePanel:13
- var: RCS_AXIS_LABELS:6
- win: __gaugeEls:11×2
### 11-nebuleuses-champs-de-bouffees.js · 219 l — 6. NÉBULEUSES — CHAMPS DE BOUFFÉES DE GAZ INSTANCIÉES
- fn: buildNebulaCluster:106
- var: NEBULA_VERT:16, NEBULA_FRAG:68, PUFF_CORNERS:98
### 12-champs-proceduraux-etoiles-et.js · 136 l — 7. CHAMPS PROCÉDURAUX — étoiles et nébuleuses en cellules déterministes
- fn: starDataForCell:18, buildStarCell:42, buildNebulaCell:88, refreshField:113
- var: STAR_CELL:5, STAR_RADIUS:5, NEBULA_CELL:6, NEBULA_RADIUS:6, STAR_PROXIMITY_RANGE:7, starField:9, nebulaField:10, _starDataCache:17
### 13-plan-de-vol-route.js · 19 l — 7bis. PLAN DE VOL — route jalonnée d'étoiles, calculée en amont
- var: ROUTE:9
### 14-systemes-planetaires-2-a.js · 335 l — 7ter. SYSTÈMES PLANÉTAIRES — 2 à 3 planètes par étoile de la route
- fn: renderNearestIcon:37, generateSystemData:84
- var: PLANET_KINDS:13, HABITABLE_KIND_COUNT:21, PLANET_KIND_COLORS:29, PLANET_VERT:212, PLANET_FRAG:221, ATMO_VERT:308, ATMO_FRAG:318
### 15-asteroides-quelques-gabarits-de.js · 91 l — ASTÉROÏDES — quelques gabarits de forme générés une seule fois au
- fn: buildAsteroidBelt:43, buildRingGeometry:68
- var: ASTEROID_MAT:36
- ns ASTEROID_TEMPLATES:9: (retourne une valeur, pas un objet littéral)
### 16-textures-de-coque-panneaux.js · 534 l — TEXTURES DE COQUE — panneaux, joints, greebles et bandes de danger,
- fn: shadeHex:9, buildHullPanelTexture:15, buildRingTexture:86, buildPlanetSystemMeshes:119, disposePlanetGroup:230, ensureSystemsBuilt:245, findNextWaypoint:253, planRoute:286,
  buildRouteCurve:337, buildRouteGates:350, refreshRoutePanel:504
- var: HOP_MIN:249, HOP_MAX:249, GATE_SPACING:334, GATE_HALF:335
### 17-itineraire-point-de-lagrange.js · 88 l — ITINÉRAIRE + POINT DE LAGRANGE (§ amélioration v2.4)
- fn: refreshItineraryDots:10, updateItineraryShip:33, computeLagrangePoint:56, updateLagrangePanel:65
- var: ITIN_WINDOW:9, LAGRANGE_FRACTION:55, _lagTmp:64
### shared/planets.js · 538 l [IIFE] — PLANÈTES DÉTAILLÉES — surface procédurale à détail adaptatif,
- fn: auroraGeometry:420, prng:442, randDir:443
- var: PL:8, PIX:9, NOISE:13, CLOUDS:91, SURF_VERT:131, SURF_FRAG:139, CLOUD_FRAG:322, ATM_VERT:350, ATM_FRAG:351, AUR_VERT:384, AUR_FRAG:399, AUR_GEO:428, AURORA_ALL:429, H:431, KIND_ID:433,
  COVER:434, ATMO:435, _q:509, _v:509, _sun:510, _white:510
- win: __PLANETS:8
### shared/asteroids.js · 241 l [IIFE] — ASTÉROÏDES TEXTURÉS — générés au démarrage
- fn: hash3:14, vnoise3:15, fbm3:22, tnoise:24, tfbm:30, prng:31, icosphere:34, rockGeometry:48, makeTextures:82, makeMaterial:159
- var: AST:11, FAMILIES:76, TRI_VERT_PARS:126, TRI_VERT:127, TRI_FRAG_PARS:134
- win: __AST:11
### shared/stars.js · 368 l [IIFE] — ÉTOILES DE SYSTÈME — rendu « cinéma »
- fn: activity:17, stripGeometry:215, prng:222, randDir:223, circleOverlap:293
- var: ST:11, V3:12, RSUN:15, HASH:29, PH_VERT:50, PH_FRAG:53, CH_FRAG:103, CO_VERT:116, CO_FRAG:117, PR_VERT:139, PR_FRAG:168, CME_VERT:187, CME_FRAG:198
- win: __STARS:11
### 20c-echelle-reelle.js · 868 l — 7sexies. ÉCHELLE RÉELLE — cœur (lot L2.2, fusion de la démo v7.2.2)
- fn: galPosition:868
- ns REAL:20: active:24, parked:24, started:84, galPos:85, galCam:85, leg:86, hideCell:86, debugView:86, T:86, cloudT:86, corridor:86, hops:86, UNITS:87
### 20n-ports-orbitaux.js · 184 l — PORTS ORBITAUX — lot P1 : génération et rendu (SPEC-008-ports_orbitaux_et_navette-V1.0.md, Partie B)
- ns PORTS:15: build:165, archetypeFor:174, orbitRadius:180, orient:182, CLASS_MAX:17, PONTOON_LEN:18, mats:32
### 20d-commerce-local.js · 181 l — L3 — COMMERCE LOCAL (lot 3, fusion de la démo v7.2.2)
- fn: buildStations:181
- ns LOCAL:29: buildStations:45, updateStations:64, disposeStations:69, refreshShipyardRow:139, openContractBoard:101
### 20e-carte-2d.js · 91 l — L4 — CARTE 2D DE LA DÉMO + CIBLAGE DE SAUT DU JEU (échelle réelle)
- ns MAP2D:17: C:18
- win: __CINE:18, __DEMO:79
### 20f-greffons-vaisseau.js · 255 l — L5 + L6 — GREFFONS VAISSEAU DE LA DÉMO v7.2.2, PILOTÉS PAR LE JEU
- ns SHIPFX:27: update:202, onEscale:252, warpDepartStart:140, hideDep:253, WEAR:34, state:107
### 20g-survol-systeme.js · 172 l — SURVOL DU SYSTÈME — plan cinématique (suite du lot L5)
- ns SURVOL:18: start:85, stop:101, skip:106, update:114, isActive:171, state:24, total:171
### 20h-gros-plans.js · 170 l — L10 — GROS PLANS ET PROFONDEUR DE CHAMP
- ns GP:21: update:151, dof:27, state:28, SHOTS:45, pickShot:63
### 20p-navette.js · 326 l — NAVETTE-CARGO ET CONTENEUR ISO 20' (lot N — refonte de la navette, choix P2)
- ns CARGO:15: ISO:17, DOCK_SCALE:18, buildIsoContainer:49, buildCargoShuttle:67, armPoints:88, shipPoint:95, isContainerShip:104, startBay:196, updateBay:242, updateEnter:308,
  returnPose:284, departPose:300, restoreStack:134, hasBay:324, deliverDirect:191, VP:105
### 20q-missions.js · 222 l — MISSIONS — lot M1 (SPEC-009-missions_risques_et_competences-V1.0.md) : système de missions AUTONOME
- ns MISSIONS:14: start:215, update:201, afterEscale:179, setupEscale:190, enabled:221, boardOpen:155, toggleBoard:158, closeBoard:154, setEnabled:221, state:40, NATURES:16, cargoSpec:45,
  paintStack:105, openBoard:139, accept:166, generate:79
### 20i-sequence-titre.js · 238 l — SÉQUENCE DE TITRE — plans-séquences dans des systèmes réels
- ns TITLE:16: tick:219, stop:232, state:22, pickSystems:52, scoreSystem:43
### 20e2-carte-hote.js · 36 l — Réglages du jeu pour la carte de l'univers (module commun shared/starmap.js, chargé juste après) :
- win: __STARMAP_HOST:6
### shared/starmap.js · 570 l [IIFE] — CARTE DE L'UNIVERS (lot 2, v6.8) — touche M
- fn: mkStar:111, loadSome:112, starOf:116, nebAt:118, nebSprite:123, glow:131, sysMap:135, beltSpecks:138, liveShips:141, liveMoons:142, planetPos:143, nearestPlanet:144, limits:148,
  resize:149, toUnit:154, pan:155, zoomBy:156, startTrans:162, goSector:163, goSystem:164, goPlanet:165, enterSystem:166, enterPlanet:167, riseToSystem:168, riseToSector:170, tryDive:171,
  tryRise:178, home:180, crumb:183, riseToSectorFrom:189, label:192, brackets:206, chevron:208, disc:209, ringArc:217, hit:218, drawSector:220, nebLabels:305, drawSystem:310, drawPlanet:371,
  draw:411, okey:430, panel:432, voyage:475, toTarget:483, act:486, hitAt:510, tap:528, open:537, close:547, frame:548, key:555
- var: C:12, TAU:13, CELL:13, NCELL:13, LY:13, clamp:14, ease:15, esc:16, reduced:17, KIND_EN:18, HOST:26, CAM:27, ARRIVAL:27, trm:28, KIND_T:29, MSG:30, NEB_EN:31, KCOL:32, F:33, lyOf:34,
  num:35, fmtLy:36, fmtAU:37, fmtKm:38, dist3:39, dot:40, rgb:41, hexRgb:42, css:45, root:88, cv:100, ctx:100, view:100, $:101, S:105, snap:107, stars:110, queue:110, nebs:117, glowCache:130,
  base:147, ln:431, PH:474, ptrs:508, drag:508, pinch:508, lastTap:508, pos:509, pinchState:514, endPtr:523
- win: __STARMAP:566
### 21-effets-de-saut-et.js · 119 l — 7quinquies. EFFETS DE SAUT ET DE SUPRALUMINIQUE (v2.16)
- fn: buildWellGrid:12, buildWarpStreaks:65, setJumpGrid:96, hideJumpGrid:105, updateWarpStreaks:107
- var: JUMP_GRID:93, WARP_STREAKS:93, WARP_STREAK_OFF:93, _jgUp:94, _wsFwd:94, _wsU:94, _wsY:94
### 22-commandes-de-vol-derive.js · 5 l — 8. COMMANDES DE VOL — dérive automatique par défaut, prise de contrôle
- var: AXIS_X:5, AXIS_Y:5, AXIS_Z:5
### 23-planification-relance-d-itineraire.js · 390 l — PLANIFICATION / RELANCE D'ITINÉRAIRE
- fn: computeRoute:9, toggleRadioPanel:358, nextCameraMode:363, toggleVoiceMute:367, toggleAudioPanel:373
- var: keys:232
### 24-mode-pause-11-de.js · 234 l — MODE PAUSE — §11 de la spec v2.1.
- fn: pickCinematicTarget:27, updateTitleCinematic:58, enterPause:94, resumeGame:107, quitToTitle:117, pickDistantShot:153, flashCameraModeLabel:183
- var: gamePaused:12, gameStarted:13, worldReadyForCinematic:18, titleCineTimer:19, titleCinePos:19, titleCineLook:19, TITLE_CINE_SHOT_MIN:20, TITLE_CINE_SHOT_MAX:20, dragging:130,
  lastPX:130, lastPY:130, dragYaw:130, dragPitch:130, touchLookHeld:135, camOrbitYaw:145, camOrbitPitch:145, ctrlDownAt:146, ctrlDragged:146, CAMERA_MODES:147, cameraMode:148,
  distantShotState:152, cameraModeFlashTimer:182
### 25-controle-tactile-15-de.js · 7 l — CONTRÔLE TACTILE — §15 de la spec v2.1. Détection par capacité de
### 26-barre-d-icones-du.js · 403 l — BARRE D'ICÔNES DU HUD — §12 de la spec v2.1. Un mécanisme UNIQUE pour le
- fn: isNearPortService:89, activateHudBarItem:102, refreshHudIconBar:129, buildHelpGrid:178, effectiveCruiseSpeed:398, speedUpgradeCost:401
- var: HUD_ICONS:10, HUD_BAR_ITEMS:47, manual:378, lastInputTime:379, rcsDemand:381, rcsLevel:383, IDLE_MS:384, CRUISE_SPEED_BASE:385, BOOST_MULT:385, currentSpeed:389, speedUpgradeLevel:395,
  SPEED_UPGRADE_STEP:396, SPEED_UPGRADE_MAX:397
### 27-carburant-22-jauge-consommation.js · 35 l — CARBURANT (§22) — jauge, consommation liée au régime moteur,
- fn: fuelRefuelCost:33
- var: FUEL_CAPACITY:10, fuel:11, FUEL_CONSUMPTION_EXPONENT:19, FUEL_EMPTY_SPEED_SCALE:27, FUEL_PRICE_PER_UNIT:30, FUEL_WARN_RATIO:32, FUEL_CRIT_RATIO:32
### 28-propulsion-quantique-et-carte.js · 186 l — PROPULSION QUANTIQUE ET CARTE STELLAIRE (§23)
- fn: quantumJumpFuelCost:19, isStarMapOpen:41, openStarMap:42, closeStarMap:43, renderMain:87, warpSmooth:112, endWarpJump:113, updateJumpSequence:120
- var: QUANTUM_JUMP_PRICE:6, hasQuantumJump:7, STAR_MAP_RADIUS:14, jumpState:18, STAR_MAP_MAX_CANDIDATES:37, WARP_THR:55, WARP_SPIN:55, WARP_LEVEL:55, WARP_T:56, WARP_LENS_FS:57, WARP:80,
  CAM_OFFSET:162, camPos:163, camLook:164, flightPhase:171, pauseTimer:172, ARRIVAL_PAUSE_DURATION:176, ARRIVAL_FF_SCALE:179, arrivalSkip:180, arrivalTimeScale:181, CUTAWAY_DURATION:182,
  ORBIT_CAPTURE_TIME:183
### 29-economie-credits.js · 47 l — ÉCONOMIE — crédits
- fn: formatCredits:12, refreshCreditsDisplay:16, addCredits:26
- var: credits:10, creditsFlashTimer:11, orbitState:32
### 30-canal-radio-echanges-equipage.js · 315 l — CANAL RADIO — échanges équipage / contrôle du port pendant l'approche
- fn: showWelcomeMessage:12, buildRadioScript:25, repositionRadioPanel:59, repositionPortPanel:74, repositionRoutePanel:99, repositionAllPanels:109, repositionCornerBottomPanels:137,
  refreshPortPanel:201, refreshFuelPortRow:225, refreshJumpPortRow:244, buySpeedUpgrade:260, buyFuel:268, buyQuantumJump:276, appendRadioLine:299
- var: RADIO_AVATARS:292
### 31-son-et-voix-du.js · 12 l — SON ET VOIX DU CANAL RADIO
- var: radioMuted:12
### 32-musique-de-fond-et.js · 118 l — MUSIQUE DE FOND ET RÉGLAGE DES VOLUMES (demande utilisateur)
- fn: setMusicVolume:20, setVoiceVolume:24, getAudioCtx:29, playRadioBlip:36, refreshVoices:56, pickVoice:61, speakRadioLine:79
- var: MUSIC_PATH:9, musicVolume:10, voiceVolume:10, musicAudio:11, radioSpeaking:27, audioCtx:28, ttsVoices:55
### 33-dialogues-radio-par-ia.js · 206 l — DIALOGUES RADIO PAR IA EMBARQUÉE (Gemini Nano) — §14 de la spec v2.1.
- fn: checkLLMAvailability:13, updateLLMIndicator:32, getLLMSession:60, llmPromptFor:68, enhanceRadioScriptWithLLM:77, startOrbitDelivery:99, buildContainerMesh:200
- var: llmAvailability:12, LLM_PERSONAS:45, llmSessions:59, SHUTTLE_HULL_TEX:192, SHUTTLE_CONT_TEX:194, CONTAINER_PALETTE:196
### 34-navette-silhouette-pousseur-tug.js · 198 l — NAVETTE — silhouette « pousseur » (tug orbital) : une nacelle arrière
- fn: buildShuttle:10, lerpArmPose:125, applyArmPose:133, startShuttleLoading:151
- var: SHUTTLE_TRAIL_LEN:9, SHUTTLE_CAMERA_SEQUENCES:112, SHUTTLE_CLOSEUP_DURATION:113, _shuttleIdCounter:114, ARM_POSE_REST:122, ARM_POSE_REACH:123, ARM_POSE_PLACE:124, LOAD_T_REACH:142,
  LOAD_T_GRAB:143, LOAD_T_PLACE:144, LOAD_T_RELEASE:145
### 35-evitement-d-obstacles-pour.js · 395 l — ÉVITEMENT D'OBSTACLES POUR LA CAMÉRA (bug remonté en jeu)
- fn: clearCameraObstacles:16, updateShuttleLoading:52, launchLoadedShuttle:116, shuttleAttitude:147, updateShuttles:152, updateOrbitDelivery:348
- var: SHIP_HULL_RADIUS:50, OUTBOUND_DROP_FRAC:135, OUTBOUND_CLEAR_FRAC:136, OUTBOUND_DROP_DIST:137, OUTBOUND_CLEAR_DIST:138, _shipDown:139, _dockPosNow:140, _clearPos:141,
  _shuttleTarget:143, _shM:146, _shZero:146
### 36-inertie-de-rotation.js · 512 l — INERTIE DE ROTATION
- fn: applyAngular:27, updateFlight:37
- var: angVel:11, TORQUE:12, ANG_MAX:13, ANG_DAMP:14, _qDelta:15, _eTmp:16, _routeTmpA:19, _routeTmpB:20, _routeTmpC:21, _routeTmpD:22, _routeTmpE:23, _routeTmpF:24, _qInv:25
### 37-hud-objet-le-plus.js · 4 l — 9. HUD — objet le plus proche, secteur, vitesse (rafraîchi périodiquement)
- var: lastHudUpdate:4
### 38-dialogue-de-telemetrie-commandes.js · 37 l — DIALOGUE DE TÉLÉMÉTRIE — commandes d'allumage/puissance envoyées aux
- fn: updateTelemetryPanel:8
- var: lastTmUpdate:7
### 39-temperature-moteur-simulation-simple.js · 126 l — TEMPÉRATURE MOTEUR — simulation simple : chaque réacteur chauffe avec sa
- fn: updateEngineTemps:8, updateHud:30
- var: engineTemps:6, lastTempUpdate:7
### 40-boucle-principale.js · 5 l — 10. BOUCLE PRINCIPALE
- var: clock:4, chunkAccum:5
### 41-animation-des-systemes-planetaires.js · 224 l — ANIMATION DES SYSTÈMES PLANÉTAIRES CONSTRUITS
- fn: adaptResolution:19, animate:29
- ns DYNRES:13: fixed:16, max:15, pr:15, ema:16, last:16, prev:16
### 42-ecran-de-demarrage-sequence.js · 349 l — 11. ÉCRAN DE DÉMARRAGE — séquence terminal façon McGivrer
- fn: shipSpecs:183, shipCatalogInfo:197, buildShipCatalog:202, openShipSelect:207
- var: SS_ARCH:174, SS_CREW:180, SHIP_CATALOG:181, SHIP_SELECT_OPEN:181
- win: __sttQuickStart:43, __sttMissions:47
