# U1 — Finitions de l'interface du jeu : contrat de lot (ARCHI)

Périmètre : console de bord (`#sttConsole`, onglets Navigation, Missions, Port, Chantier naval, Journal, Aide · Réglages), overlays qu'elle héberge, dialogues hors console (Mode de jeu `#modeSelect`, Pause `#pauseOverlay`), HUD et barre d'icônes (touches 1 à 8). Build audité : `sources/target/space-travel.html` du 07/10 (commit 93a9742).
Méthode : Playwright, Chromium **avec ascenseurs visibles** (`ignore_default_args=["--hide-scrollbars"]` : par défaut, Playwright les masque en mode sans tête, ce qui les cache aux tests et aux captures existants). Mesure de 6 onglets, 2 vues supplémentaires (contrats, aide + son), Mode de jeu, Pause et HUD, à 5 tailles (1920×1080, 1366×768, 1280×720, 1024×768, 800×600) en fr, en et de ; redimensionnement 1366×768 → 1024×640 → retour, console ouverte. L'espagnol n'a pas été mesuré.
Scripts et données : `~/.claude/jobs/2f919eee/tmp/u1/` (`probe.py`, `diag.py`, `analyze.py`, `m/mesures-{fr,en,de}.json`, `shots/`).
Notation : « c » = taille client, « s » = taille de défilement (scroll), en px. **M** = mesuré ; **C** = déduit du code.

## 1. Catalogue des défauts

**Cause principale (M, prouvée par `diag.py`).** Les coins ambrés (`::before`/`::after` ou `.ss-c`) sont posés à `top/bottom/right:-1px` dans une boîte en `overflow:auto` ou dans `.con-body`. Ils créent **1 px** de débordement sur les deux axes, et Chromium affiche alors **deux ascenseurs de 15 px**. Une fois les coins masqués, on retrouve s = c (`.board-panel` 558 = 558 ; `.help-panel` 1070 = 1070 ; `.con-body` de Port 1098 = 1098).

| id | Où | Tailles | Mesure | Cause (fichier:ligne) | Correctif minimal |
|---|---|---|---|---|---|
| D1 | Mode de jeu (`.ms-panel`) | toutes, 3 langues | c 543×348 / s 544×349 : ascenseurs H+V | `css/main.css:797-800` (`.ss-c` à -1px) + `:857` (`overflow:auto`) | coins sans débordement (§2.3) |
| D2 | Chantier naval, Contrats (`.board-panel`) | toutes | c 543×424 / s 544×425 : H+V | `main.css:244-253` (coins -1px + `overflow:auto`, `max-height:82vh`) | §2.3 + neutralisation de l'hôte (D5) |
| D3 | Aide (`.help-panel`) | toutes (≥ 1366 : 1055×469 / 1056×470) | H+V **à l'intérieur** de l'onglet | `main.css:184-190` ; `51-console-view.js:36` neutralise `max-height` mais pas `overflow` ni les coins | `.con-hosted .help-panel{overflow:visible}` + §2.3 |
| D4 | Navigation, Port : `.con-body` | toutes | c 1083×631 / s 1084×632 : la carte perd 15 px sur chaque axe | Port : `.panel::after` (`main.css:57-66`) de `#portPanel` passé en `static`, donc placé contre `.con-body` (`position:relative`, `51:28`). Nav : `#stmMap .p::after` (`shared/starmap.js:51`) | masquer les coins des hôtes dans la console ; nav : règle côté jeu dans `53-tab-navigation.js` (ne pas toucher `shared/`) |
| D5 | Missions : la liste n'occupe pas la largeur | toutes | `.board-panel` 760 px sur 1083 (69 % à 1920, 79 % à 1024), décentré par l'ascenseur | `20q-missions.js:131` (`style` en ligne `max-width:760px;width:92vw`) | style en ligne → classe ; dans la console : `width:auto; max-width:none` |
| D6 | Chantier, Contrats : idem | toutes | 560 px sur 1083 (51 %) | `main.css:247` (`width:min(560px,92vw)`) non neutralisé (`51:32-35` ne vise que le nœud hôte) | `.con-hosted .board-panel{width:auto;max-width:none;max-height:none;overflow:visible}` |
| D7 | Réglages (`.audio-panel`) sous l'aide | toutes | 340 px centrés (31 %), non alignés sur l'aide (1070 px) | `main.css:299-303` (`width:340px`) | section pleine largeur, grille libellé / curseur / valeur |
| D8 | Croix de fermeture en double dans la console | toutes | × de 16 px dans Aide, Son, Chantier et Port ; celle du Port est collée en haut à droite de `.con-body`, contre le bord | `main.css:165-170` (`position:absolute`) ; seule `#missionClose` est masquée (`54-tab-missions.js:13`) | `#sttConsole .con-hosted .panel-close-btn{display:none}` |
| D9 | Cadre dans le cadre | toutes | bordure et coins ambrés de `.board-panel`, `.audio-panel` et `#portPanel` dessinés dans le cadre de la console ; ceux du Port tombent sur les coins de `.con-body` | `51:32-35` neutralise le fond, pas la bordure ni les pseudo-éléments | neutraliser `border` et `::before/::after` des hôtes |
| D10 | Port : mise en page | toutes | 314 px de haut sur 646 (49 %) ; boutons étirés sur 1044 px | `main.css:504-516` (`.port-buy-btn{width:100%}`), gabarit de panneau HUD de 230 px | grille 3 colonnes (service, état, bouton de largeur fixe) |
| D11 | Aide : clé brute affichée | toutes, 4 langues | ligne « M — lblStarMapTitle » | `26-barre-d-icones-du.js:66` : `labelKey:'lblStarMapTitle'` absente d'`I18N` | clé I18N dans les 4 langues (ou réemploi de `conTabNav`) |
| D12 | Console trop petite sur grand écran | ≥ 1600 px | cadre 1100×760 sur 1920×1080 (57 % × 70 %) | `51:11` (`min(1100px,96vw)` × `min(760px,90vh)`) | politique de taille par variables (§2.1) **— décision D-A** |
| D13 | Missions : triple ascenseur | hauteur ≤ 768 | 1366×768 : `.con-body` s 650 > c 646, plus le H+V du `.board-panel` ; 1024×640 : s 545 > c 531 et `.board-panel` s 623 > c 508 | `max-height:82vh` (`main.css:247`) + rembourrage de `.con-panel` 2 × 10 px (`51:29`) | un seul défileur : le panneau (§2.2) |
| D14 | Aide + Son : défilement | hauteur ≤ 768 | `.con-body` s 659 > c 646 (1366×768) ; 676 > 480 (800×600) | contenu plus haut que la zone | voulu, mais **un seul** ascenseur, thémé (D24) |
| D15 | Barre d'onglets tronquée | 800×600 fr (c 545 / s 651), de (584 / 634) ; en tient (574) | « AIDE · RÉGLAGES » coupé ; ascenseur horizontal de 15 px dans l'en-tête | `51:18` (`overflow-x:auto`, pas de passage à la ligne), titre `nowrap` | ≤ 900 px : titre masqué ou abrégé, onglets compacts |
| D16 | La console recouvre la barre d'icônes | hauteur ≤ ~900 | bas du cadre à 729 contre haut de la barre à 716 (1366×768 : 13 px) ; 16 px à 1280×720 ; 22 px à 800×600 | `51:11` (`90vh`) contre `main.css:614-616` (`bottom:18px`, 34 px) | hauteur = `100vh − --hud-top − --hud-bottom` **— décision D-A** |
| D17 | Titres internes hétérogènes | toutes | Aide 15 px ambre centré ; Missions et Chantier 14 px blanc centré ; Port 10 px gris majuscules à gauche ; Journal sans titre | `main.css:191,254,504` | un seul style `.con-h` (ou suppression : l'onglet nomme déjà) **— D-C** |
| D18 | Contrôles de même rôle, hauteurs différentes | toutes | onglets 26 px ; puces du Journal 36 ; boutons Missions et Port 31 ; zoom de la carte 28 ; croix 24 et 16 | règles dispersées | `--ctl-h` (32 px ; 44 en tactile) |
| D19 | Échelle typographique éclatée | toutes | 17 tailles distinctes dans `main.css` (7,5 à 34 px) ; 11 tailles dans la seule console (9,5 / 10 / 10,5 / 11 / 11,5 / 12 / 12,5 / 13 / 14 / 15 / 16) | aucune variable de police | 5 paliers `--fs-*` (§2.1) |
| D20 | Aide : textes figés et casse mêlée | en, de, es | « ESPACE / ENTRÉE » et « ÉCHAP / P » toujours en français ; « COMMANDES MOTEUR » côtoie « Navigation » | `26:210-211` ; libellés HUD en majuscules | clés `hk_*` ×4 ; `text-transform` uniforme dans `.help-grid .hv` |
| D21 | Mode de jeu : police des options | toutes | `.ms-opt` à 13,33 px (valeur par défaut du navigateur) | `main.css:861` (pas de `font` sur le bouton) | `font:inherit` |
| D22 | Pause : boutons de hauteurs inégales | toutes | 39 / 39 / 39 / 40 px (glyphe ⏻) | `main.css:707-711` | `height:var(--ctl-h-lg)` |
| D23 | HUD : polices minuscules | toutes | 7,5 / 8 / 8,5 px (jauges, Propulsion, Temp.) | `main.css` (jauges) | **hors U1** (§6) |
| D24 | Ascenseurs non thémés (gris clair sur fond sombre) | toutes | visibles sur toutes les captures | aucune règle `scrollbar-*` | `scrollbar-width:thin; scrollbar-color:var(--line) transparent` |
| D25 | Barre de filtres du Journal couplée au rembourrage | — | `top:-10px; margin:-10px -14px` = rembourrage de `.con-panel` | `57-tab-journal.js:10`, `scroller()` `:193` (= `.con-body`) | variables `--con-pad-*` ; `scroller()` suit le défileur unique |
| D26 | Sélection du vaisseau (`.ss-panel`) en écran bas | `max-height` | C : même schéma coins -1px + `overflow:auto` | `main.css:796-800,848` | §2.3 |

Bilan : **14 défauts visibles partout** (D1 à D12, D17, D24), **4 sur certaines tailles** (D13 à D16), **8 mineurs** (D18 à D23, D25, D26). D23 n'est pas traité.
Sans défaut propre (M) : le **redimensionnement**. La carte se recale de 1083×631 à 966×516 puis revient, le Journal et les Missions se remettent en page, et le retour à la taille initiale redonne des mesures identiques. Le **Journal** sert de référence (pleine largeur, aucun ascenseur) ; ses lignes tronquées par « … » sont voulues (dépliage au clic). Pause et HUD : aucun débordement.

## 2. Principes de mise en page imposés

1. **Variables** (`:root`, `css/main.css`) : `--fs-xs:10px; --fs-sm:11px; --fs-md:12px; --fs-lg:14px; --fs-xl:16px` ; `--sp-1:4px … --sp-4:16px` ; `--ctl-h:32px; --ctl-h-lg:40px` ; `--con-pad-y:10px; --con-pad-x:14px` ; `--hud-top:34px; --hud-bottom:70px; --con-max-w; --con-max-h` ; `--corner:14px`. Le CSS injecté par `51`/`52`-`57` les consomme : aucune taille de police ni de contrôle en dur dans la console.
2. **Un seul défileur par onglet.** `.con-frame` est en flex colonne ; `.con-body{display:flex;flex-direction:column;overflow:hidden;min-height:0}` ; `.con-panel{flex:1 1 auto;min-height:0;overflow:auto;overflow-x:hidden}`. L'onglet Navigation passe en `overflow:hidden; padding:0`. Tout hôte est neutralisé en `width:auto; max-width:none; max-height:none; overflow:visible; border:none` ; ses coins et sa croix sont masqués. Aucun `vh` ni `max-height` en dur à l'intérieur de la console.
3. **Coins ambrés sans débordement.** Ils sont dessinés en `background-image` (dégradés linéaires, classe utilitaire `.stt-corners`) ou placés dans la boîte de rembourrage (`top:0`) ; jamais d'élément positionné hors d'une boîte qui défile. Cela s'applique aussi aux dialogues hors console (`.ms-panel`, `.ss-panel`, `.help-panel` et `.board-panel` hors console).
4. **Dialogues** : `max-height` = zone utile, un seul enfant qui défile, ascenseurs thémés (D24), aucun défilement horizontal.
5. **Alignement** : contrôles de même rôle à `--ctl-h` ; libellé / valeur en grille (`grid-template-columns: max-content 1fr auto`) ; titres de section `.con-h` (un style unique).
6. **Pas de nouvelle globale** : uniquement du CSS et le membre `CONSOLE.view` existant. `sim/` n'est pas touché ; `shared/` non plus (règles de surcharge côté jeu).

## 3. Tâches (estimation en tokens, revue comprise)

| Tâche | Contenu | Fichiers | Dépend de | Profil, cx | Tokens |
|---|---|---|---|---|---|
| U1.0 | Test `ui_layout_test.py` écrit **d'abord** : il échoue sur le build actuel (§4) | `src/test/ui_layout_test.py` (nouveau) | — | DEV Opus, cx 2 | 60 k |
| U1.1 | Variables `:root`, `.stt-corners`, ascenseurs thémés ; coins de `.panel`, `.help-panel`, `.board-panel`, `.audio-panel`, `.pause-panel`, `.ss-c`, `.ms-panel` (D1-D3, D24, D26) | `css/main.css` | — | DEV Sonnet, cx 2 | 50 k |
| U1.2 | Cadre de console : taille par variables (D12, D16, décision D-A), flex et défileur unique (D13, D14), barre d'onglets compacte ≤ 900 px (D15), Journal : `sticky` et `scroller()` (D25), nav : coins `#stmMap .p` (D4) | `ui/51-console-view.js`, `ui/53-tab-navigation.js`, `ui/57-tab-journal.js` | U1.1 | DEV Opus, cx 3 | 80 k |
| U1.3 | Neutralisation complète des hôtes : largeur, hauteur, bordure, coins, croix (D4-D6, D8, D9) ; style en ligne des Missions → classe | `ui/51-console-view.js`, `game/20q-missions.js:131`, `css/main.css` | U1.2 | DEV Sonnet, cx 2 | 45 k |
| U1.4 | Port en grille, Réglages en section alignée, titres `.con-h` (D7, D10, D17) | `css/main.css`, `ui/52-tab-aide.js` (CSS injecté), au besoin `html/index.template.html` (classes) | U1.3 | DEV Sonnet, cx 2 | 55 k |
| U1.5 | Typographie et contrôles sur les variables (D18, D19, D21, D22) | `css/main.css`, CSS injecté par `51`, `54`, `57` | U1.4 | DEV Sonnet, cx 2 | 50 k |
| U1.6 | Aide : clé `lblStarMapTitle` et `hk_skip`/`hk_pause` dans les 4 langues ; casse uniforme (D11, D20) | `game/01-…anglais.js`, `game/26-barre-d-icones-du.js` | — | DEV Sonnet, cx 1 | 25 k |
| U1.7 | Recompilation, suite complète, captures avant/après (mêmes 10 vues), mise à jour de `CODEMAP` | `target/`, `docs/specs/CODEMAP.md` | toutes | CP | 30 k |

**Total ≈ 395 k tokens.** Conflits : U1.1, U1.3, U1.4 et U1.5 modifient `css/main.css` ; U1.2 et U1.3 modifient `51-console-view.js`. Ces tâches restent donc **séquentielles** (U1.1 → U1.2 → U1.3 → U1.4 → U1.5). **Parallélisables** : U1.0 et U1.6 (fichiers disjoints ; U1.6 est la seule tâche à toucher `I18N`, aucun conflit de clés).
Vérification de chaque tâche : `ui_layout_test.py` (assertions de la tâche passées à vert), plus `console_test.py`, `journal_test.py` et `carte_test.py` pour U1.2 et U1.3, plus 1 capture à 1366×768.

## 4. Test de non-régression `src/test/ui_layout_test.py`

- Lancé automatiquement par `build.py test` (motif `*_test.py`, argument : le HTML). Chromium avec `ignore_default_args=["--hide-scrollbars"]`, temps virtuel (`INIT` de `console_test.py`), `LAYERS.skipRender = true`, **aucune capture sauf en cas d'échec** : une capture coûte environ 25 s sous SwiftShader, une mesure moins de 1 s. Budget : moins de 3 min.
- Matrice : {1920×1080, 1366×768, 1024×768} × {fr, de} ; plus 800×600 en fr et en de pour la barre d'onglets. Campagne : escale (le tableau des missions s'ouvre seul), `orbitState.active = true` pour Port et Chantier, `LOCAL.openContractBoard()`, `CONSOLE.help.toggleAudio()`, Mode de jeu, Pause.
- Assertions, pour chaque onglet et chaque dialogue :
  - **(a)** aucun élément de `#sttConsole`, `#modeSelect` ou `#pauseOverlay` avec `scrollWidth > clientWidth` en `overflow:auto|scroll` ;
  - **(b)** au plus **un** élément qui défile verticalement par onglet, et ce doit être `.con-panel` ;
  - **(c)** aucun défilement dans `#modeSelect` ni `#pauseOverlay` à partir de 1024×768 ;
  - **(d)** le panneau actif remplit `.con-body` à ± 1 px (largeur et hauteur) ;
  - **(e)** le premier enfant visible de l'hôte occupe toute la largeur utile du panneau à ± 1 px ;
  - **(f)** aucune `.panel-close-btn` visible dans `#sttConsole` ;
  - **(g)** `#sttConsoleTabs` : `scrollWidth ≤ clientWidth` (aucun onglet caché) ;
  - **(h)** le cadre ne chevauche ni `#hudIconBar` ni la barre du haut (selon D-A) ;
  - **(i)** les contrôles d'un même rôle ont une hauteur égale à ± 1 px ; les tailles de police calculées dans la console appartiennent à l'ensemble des `--fs-*` ;
  - **(j)** aucun texte « lbl… » ni « hk_… » brut dans `#helpGrid`.
- Redimensionnement : console ouverte sur Navigation, Missions puis Journal, passage à 1024×640 puis retour ; (a), (b) et (d) sont vérifiés aux deux tailles.

## 5. Risques

- **Observation des étoiles** : le CSS du jeu ne lui est pas partagé, aucun impact. `shared/starmap.js` n'est **pas** modifié ; si U1.2 était tenté de le faire, la démo devrait être reconstruite et republiée (étiquette `ode_`) : c'est refusé, on surcharge côté jeu.
- **Tests existants sensibles aux tailles** : `console_test.py` (tactile 390×844 en plein écran ; `#apHud` qui ne doit pas masquer les onglets), `journal_test.py` (PgUp/PgDn via `scroller()`, pas de défilement horizontal en tactile), `carte_test.py` (taille du canevas après `resize`). U1.2 doit les garder verts. La règle tactile `@media (max-width:760px),(pointer:coarse)` (`51:39-56`) prime sur les variables.
- **Poids du build** : quelques centaines d'octets de CSS ; un 23e fichier de test, non embarqué.
- `!important` des hôtes : à garder ciblé (`#sttConsole .con-hosted …`), sinon les overlays hors console régressent (Partie libre inchangée : les overlays ne sont visibles que dans la console, comme en L1).
- **Polices** : JetBrains Mono vient du CDN ; les tests coupent les polices (solution de repli monospace). Les largeurs mesurées varient donc de quelques px en ligne : tolérances à ± 1 px seulement sur des rapports de boîtes, pas sur des largeurs de texte.
- Les ascenseurs dits « superposés » (macOS, mobiles) masquent D1 à D4 chez certains joueurs. C'est bien pour cela que le test retire `--hide-scrollbars`.

## 6. Non couvert

D23 (micro-polices du HUD, 7,5 à 8,5 px : lot HUD distinct), contenu et rédaction de l'aide au-delà de D11 et D20, thème clair, espagnol non mesuré (mêmes règles, longueurs proches du français), écrans de titre et de démarrage (`#boot`, `#titleScreen`), l'éditeur `STT_modules`, tactile au-delà du maintien des tests existants, accessibilité (contraste, focus).

## 7. Décisions demandées au mainteneur

- **D-A Taille de la console** : (1) fluide, de la barre du haut jusqu'au-dessus de la barre d'icônes, largeur `min(1400px, 100vw − 48px)` (recommandé ; corrige D12 et D16) ; ou (2) taille actuelle 1100×760, sans chevaucher la barre d'icônes.
- **D-B Largeur des listes** (Missions, Chantier, Contrats) : pleine largeur comme le Journal (recommandé), ou colonne de lecture d'au plus 960 px **alignée à gauche**.
- **D-C Titres internes** : un style `.con-h` unique (recommandé) ou suppression (l'onglet nomme déjà le contenu).
- **D-D Réglages** : section sous l'aide (actuel, mais pleine largeur) ou sous-onglet « Réglages ».

## 8. Captures (`~/.claude/jobs/2f919eee/tmp/u1/shots/`, ascenseurs visibles)

`1366x768-fr_modeSelect` (D1) · `1366x768-fr_yard` (D2, D6, D8) · `1366x768-fr_helpAudio` (D3, D7, D11, D14 : trois ascenseurs) · `1366x768-fr_missions` (D5, D13) · `1366x768-fr_resize-missions-1024x640` (D13 après redimensionnement) · `1366x768-fr_port` (D4, D8, D9, D10) · `1366x768-fr_nav` (D4) · `1366x768-fr_journal` (référence, sans défaut) · `800x600-fr_help` (D15, D16) · `800x600-fr_pause` (D22, sans défaut majeur).

## 9. Critères d'acceptation

`ui_layout_test.py` vert sur la matrice du §4 ; suite complète verte (Node et Playwright) ; aucun ascenseur visible sur les 10 vues refaites ; Partie libre inchangée hors console ; 4 langues ; aucune modification de `sim/` ni de `shared/`.
