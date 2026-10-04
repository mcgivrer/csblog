# Renumérotation des spécifications — tâche C0.5 (stt-dev, Haiku)

Règle de nommage : `SPEC-[NNN]-[titre_en_minuscules_avec_soulignés]-V[version].md`, numéros attribués dans l'**ordre d'apparition**.

Décisions du mainteneur (04/10/2026) :

- SPEC-010 et SPEC-011 **gardent leur numéro** ; les spécifications plus anciennes tiennent en 001 à 009.
- Le plan Scene et ses deux annexes deviennent des **annexes de la DAT**, hors numérotation, à côté de `docs/DAT.md` (leurs liens `./DAT.md` deviennent ainsi valides).
- Variantes autonomes (images intégrées) : suffixe **`-autonome` après la version**.
- Version initiale **V1.0** pour tous les documents ; les révisions suivantes incrémentent.
- Les dossiers d'images (`etude-echelles/`, `etude-rendu-etoiles/`, `generation-de-l-univers/`, `spec-L9-trafic-concurrence-escorte-radar/`, `specs-et-maquettes/`, `img/`) **gardent leur nom** : aucun lien d'image à corriger.

## Table de correspondance (`demos/space-travel/docs/specs/`)

| N° | Fichier actuel | Nouveau nom | Apparition | Ordre |
|---|---|---|---|---|
| 001 | `etude-vaisseaux-generatifs.md` et `.pdf` | `SPEC-001-vaisseaux_generatifs-V1.0.md` et `.pdf` | ajout git 20/09 15:38 | confirmé (git) |
| 002 | `generation-de-l-univers.md` | `SPEC-002-generation_de_l_univers-V1.0.md` | ajout git 20/09 16:55 | confirmé (git) |
| 003 | `etude-echelles.md` | `SPEC-003-etude_des_echelles-V1.0.md` | ajout git 20/09 17:47 | confirmé (git) |
| 004 | `etude-rendu-etoiles.md` | `SPEC-004-rendu_des_etoiles-V1.0.md` | ajout git 20/09 20:05 | confirmé (git) |
| 005 | `Observation des étoiles — plan des corrections et améliorations (v6.7 → v7).md` | `SPEC-005-plan_corrections_observation_des_etoiles-V1.0.md` | 26/09 | sûr |
| 006 | `etude-integration-demo.md` | `SPEC-006-integration_de_la_demo-V1.0.md` | 26/09, après 005 (cite la démo v7.2.2) | sûr |
| 007 | `spec-L9-jeu.md` | `SPEC-007-l9_trafic_concurrence_escorte_jeu-V1.0.md` | base v2.17, cité par 008 | sûr |
| 007 | `spec-L9-technique.md` | `SPEC-007-l9_trafic_concurrence_escorte_technique-V1.0.md` | idem | sûr |
| 007 | `spec-L9-jeu-autonome.md` | `SPEC-007-l9_trafic_concurrence_escorte_jeu-V1.0-autonome.md` | idem | sûr |
| 008 | `spec-ports-orbitaux-navette.md` | `SPEC-008-ports_orbitaux_et_navette-V1.0.md` | 28/09 | sûr |
| 008 | `spec-ports-orbitaux-navette-autonome.md` | `SPEC-008-ports_orbitaux_et_navette-V1.0-autonome.md` | 28/09 | sûr |
| 009 | `spec-missions.md` | `SPEC-009-missions_risques_et_competences-V1.0.md` | 29/09 | sûr |
| 009 | `spec-missions-autonome.md` | `SPEC-009-missions_risques_et_competences-V1.0-autonome.md` | 29/09 | sûr |
| 010 | `SPEC-010-chantier-naval-campagne.md` | **à supprimer** : déjà remplacé par `SPEC-010-chantier_naval_et_campagne-V1.0.md` (déposé, non suivi par git) | 04/10 | — |
| 011 | `SPEC-011-implementation-technology-roadmap.md` | `SPEC-011-implementation_technology_roadmap-V1.0.md` | 04/10 | — |

## Annexes de la DAT (déplacées dans `demos/space-travel/docs/`)

| Fichier actuel (`docs/specs/`) | Nouveau chemin |
|---|---|
| `PLAN-scenes.md` | `docs/DAT-annexe_1-plan_scenes-V1.0.md` |
| `PLAN-scenes-T0.1-inventaire.md` | `docs/DAT-annexe_2-inventaire_des_etats_T0.1-V1.0.md` |
| `PLAN-scenes-T0.2-matrice.md` | `docs/DAT-annexe_3-matrice_des_scenes_T0.2-V1.0.md` |

## Nettoyage associé (tâche C0.6)

- Supprimer `docs/specs/PLAN-STATUS.md` : remplacé par `docs/work_in_progress/plan-status.js` et `kanban.html`.
- Déplacer `docs/work_in_progress/agents/stt-cp.md`, `stt-archi.md`, `stt-dev.md` (versions à jour) vers `.claude/agents/` à la racine du dépôt `csblog`.
- Supprimer `docs/specs/agents/` (premières copies, périmées).

## Procédure (stt-dev)

1. **Confirmer l'ordre 001 à 004** par la date d'ajout dans git : `git log --diff-filter=A --follow --format=%ad --date=short -- <fichier>`. Si git donne un autre ordre, permuter les numéros et le signaler au CP dans le rapport.
2. **Renommer avec `git mv`** (jamais copie + suppression), pour garder l'historique.
3. **Mettre à jour les références** à chaque ancien nom : `grep -rln` dans `demos/space-travel/` (hors `archives/`, `node_modules/`, `.git/`), `CLAUDE.md` et `AGENTS.md`. Points connus : `demos/space-travel/CLAUDE.md` (motifs `spec-L9-*.md`, `spec-missions*.md`, `spec-ports-orbitaux-navette*.md`), liens croisés L9 jeu ↔ technique, liens du plan Scene vers la DAT et entre ses annexes, `sources/src/test/scenes_matrice_test.py` (vérifier s'il lit la matrice T0.2), copies dans `sources/src/docs/` (à signaler, ne pas renommer sans accord).
4. **Fichiers autonomes (0,8 à 1,8 Mo)** : ne jamais les ouvrir ; corriger leurs liens par `sed -i` ciblé uniquement.
5. Vérifier : plus aucune occurrence des anciens noms (`grep -rn`), `python3 build.py test` seulement si un test lit un document renommé.
6. Un commit : `docs: renumérotation des spécifications (SPEC-NNN-…-V1.0)`, puis rapport au CP (≤ 15 lignes).
