# LOT L1 — Console de bord

Fiche du CP (SPEC-010 § 3.6). Branche `worktree-stt-L1-console`, base `main` (tag `stt_v2.18.0`). Version visée : `stt_v2.19`.

**But :** remplacer les overlays épars par une seule fenêtre à onglets, la **Console de bord** (SPEC-010 § 1.8), sans changer le comportement de *Partie libre* ni les instruments de vol du HUD.

**Périmètre**
- Cadre de console : barre d'onglets, un panneau à la fois, `Tab` ouvre sur le dernier onglet, `Échap` ferme, badges (API seulement, alimentés plus tard).
- Migration des 6 overlays existants dans des onglets : `shipyardOverlay`, `contractBoardOverlay`, `portPanel`, carte stellaire, `helpOverlay`, `audioOverlay`. Le contenu et la logique de chaque overlay restent ceux du jeu : on les héberge, on ne les réécrit pas.
- Onglets de L1 : **Navigation** (carte, M/F2), **Missions** (J/F3), **Port** (F4), **Aide · Réglages** (H, Échap), plus l'hébergement de l'overlay chantier existant (F5, ancien `shipyardOverlay`) et **Journal** (L) s'ils existent déjà comme overlays. Les onglets sans contenu en L1 (Flotte, Technologie, Équipages, Station) ne sont pas affichés.
- Raccourcis : F1 à F8 passent aux onglets ; le HUD garde sa barre d'icônes et `Alt+1` à `Alt+8` pour ses panneaux (à valider, SPEC-010 § 1.8).
- Tactile : plein écran, onglets en barre défilante, un seul panneau visible, onglets verrouillés masqués.
- Mode : la console s'ouvre en campagne **et** en Partie libre ; en Partie libre, seuls les onglets qui existent aujourd'hui.
- Visibilité conditionnelle (Port à quai, etc.) par une fonction `visible()` par onglet, testable.
- La console ne met pas le jeu en pause.

**Hors périmètre :** contenu des onglets Flotte, Technologie, Équipages, Station (L2 à L5) ; éditeur de chantier (L2) ; pause du jeu ; refonte du HUD ; nouvelles données de campagne.

**Critères d'acceptation**
1. Une seule console remplace les 6 overlays : plus aucun de ces overlays ne s'ouvre seul, chaque ancien raccourci ouvre le bon onglet.
2. `Tab` (dernier onglet), `Échap` (ferme), F1–F8, M, J, H, L fonctionnent ; aucun conflit avec les commandes de vol et le dialogue radio.
3. Les onglets masqués ne sont pas dans le DOM visible ; un onglet affiché apparaît ou disparaît quand sa condition change.
4. À 960 px et sur un viewport tactile étroit (390 px) : console plein écran, un panneau à la fois, onglets défilants, aucun débordement horizontal de la page.
5. *Partie libre* inchangée en dehors de l'ouverture des panneaux ; la campagne (`campagne_test.py`) passe toujours.
6. Aucune erreur JS au démarrage ni à l'ouverture de chaque onglet ; suite complète `build.py test` verte (pages lisible et obfusquée) ; tests Node de la logique de console (`sim/` ou `ui/` sans DOM) verts.
7. Chaînes dans `I18N`, 4 langues ; parité i18n du build verte.

**Entrées :** SPEC-010 § 1.8 et § 2.3–2.4, § 3 ; `docs/specs/CODEMAP.md` ; maquettes `docs/specs/img/spec010/*.svg` ; `docs/specs/lots/L0-contrat.md` (conventions `@provides` / `@requires`, dossier `src/JS/ui/`) ; `docs/DAT.md` pour le lien avec les scènes.

**Points d'attention pour l'ARCHI :** repérer dans `CODEMAP.md` où naissent les 6 overlays et leurs touches, et quelles touches F1–F8 / M / J / H existent déjà (conflits) ; `ORDER.txt`, `index.template.html` et `I18N` sont des points de conflit sérialisés (une tâche à la fois) ; proposer un découpage en tâches livrables seules, dans l'ordre : cadre, migration par overlay (un commit chacune), raccourcis, tactile, tests.

**Budget :** 500 k tokens (contrat ≤ 150 lignes, tâches 40–100 k chacune, revue comprise). Arrêt et question au mainteneur si > 650 k.
