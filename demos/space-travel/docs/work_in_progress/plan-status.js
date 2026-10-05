/* Données du Kanban des agents — SPEC-010 (Chantier Naval STT et campagne).
   SEUL fichier modifié par le chef de projet (stt-cp), par Edit ciblé : jamais kanban.html.
   Emplacement : demos/space-travel/docs/work_in_progress/ — mis à jour à chaque transition de tâche et à chaque rapport d'agent.
   status : todo | doing | review | blocked | done      agent : cp | archi | dev
   used   : tokens mesurés (total_tokens du bloc <usage> rendu par l'appel Agent) ; null = non mesuré ; est:true = estimation
   docs   : (optionnel) documents liés à la tâche : [ { f: "chemin relatif à demos/space-travel/", r: "lu" | "modifié" | "créé" } ]
            lu = nécessaire à la tâche ; modifié / créé = produit par elle. Docs de spec/contrat/plan/maquette/carte de code, pas le code du jeu.
            Le chemin doit exister (ou avoir existé dans l'historique git pour une tâche passée).
   Le total d'un lot est calculé par la page (somme des tâches) : ne pas le saisir. */
window.PLAN = {
  updated: "2026-10-05 12:00",
  spec: "SPEC-010-chantier_naval_et_campagne-V1.0.md",
  currentLot: "L1",
  models: { cp: "CP Sonnet", archi: "ARCHI Opus", dev: "DEV Sonnet / Haiku" },

  lots: [
    { id: "C0", title: "Cadrage SPEC-010",      status: "done", budget: 500000,  version: "—" },
    { id: "L0", title: "Fondations",            status: "done"  , budget: 600000,  version: "stt_v2.18" },
    { id: "L1", title: "Console",               status: "todo", budget: 500000,  version: "stt_v2.19" },
    { id: "L2", title: "Chantier v1",           status: "todo", budget: 1200000, version: "stt_v2.20" },
    { id: "L3", title: "Flotte + équipages",    status: "todo", budget: 1200000, version: "stt_v2.21" },
    { id: "L4", title: "Technologies",          status: "todo", budget: 600000,  version: "stt_v2.22" },
    { id: "L5", title: "Station",               status: "todo", budget: 1100000, version: "stt_v2.23" },
    { id: "L6", title: "Marché, missions",      status: "todo", budget: 900000,  version: "stt_v2.24" },
    { id: "L7", title: "Équilibrage, v3.0",     status: "todo", budget: 400000,  version: "stt_v3.0" }
  ],

  tasks: [
    { id: "C0.1", lot: "C0", title: "SPEC-010 : mécanique, architecture, plan, équilibrage", agent: "archi", model: "opus", status: "done", progress: 100, budget: 300000, used: 330000, est: true, updated: "2026-10-04 23:00", note: "Session Cowork : estimation d'après le compteur de session.", docs: [ { f: "docs/specs/SPEC-010-chantier_naval_et_campagne-V1.0.md", r: "créé" }, { f: "docs/SPEC-010-arbre_des_technologies_et_missions.md", r: "créé" }, { f: "docs/specs/SPEC-011-implementation_technology_roadmap-V1.0.md", r: "lu" }, { f: "docs/specs/SPEC-009-missions_risques_et_competences-V1.0.md", r: "lu" }, { f: "docs/DAT.md", r: "lu" } ] },
    { id: "C0.2", lot: "C0", title: "Fichiers d'agents stt-cp / stt-archi / stt-dev", agent: "cp", model: "opus", status: "done", progress: 100, budget: 20000, used: 15000, est: true, updated: "2026-10-04 23:10", note: "", docs: [ { f: "../../.claude/agents/stt-cp.md", r: "créé" }, { f: "../../.claude/agents/stt-archi.md", r: "créé" }, { f: "../../.claude/agents/stt-dev.md", r: "créé" }, { f: "docs/specs/SPEC-010-chantier_naval_et_campagne-V1.0.md", r: "lu" }, { f: "CLAUDE.md", r: "lu" } ] },
    { id: "C0.3", lot: "C0", title: "Kanban des agents (kanban.html + plan-status.js)", agent: "cp", model: "opus", status: "done", progress: 100, budget: 40000, used: 40000, est: true, updated: "2026-10-04 22:00", note: "", docs: [ { f: "docs/work_in_progress/kanban.html", r: "créé" }, { f: "docs/work_in_progress/plan-status.js", r: "créé" }, { f: "docs/specs/SPEC-010-chantier_naval_et_campagne-V1.0.md", r: "lu" } ] },
    { id: "C0.4", lot: "C0", title: "Maquettes SVG des 5 nouveaux écrans", agent: "archi", model: "opus", status: "done", progress: 100, budget: 60000, used: 65000, est: true, updated: "2026-10-04 22:30", note: "docs/specs/img/spec010/*.svg, intégrées à SPEC-010.", docs: [ { f: "docs/specs/img/spec010/chantier.svg", r: "créé" }, { f: "docs/specs/img/spec010/console-flotte.svg", r: "créé" }, { f: "docs/specs/img/spec010/equipages.svg", r: "créé" }, { f: "docs/specs/img/spec010/station-site.svg", r: "créé" }, { f: "docs/specs/img/spec010/technologie.svg", r: "créé" }, { f: "docs/specs/SPEC-010-chantier_naval_et_campagne-V1.0.md", r: "modifié" } ] },
    { id: "C0.5", lot: "C0", title: "Renumérotation des specs (git mv + liens)", agent: "dev", model: "haiku", status: "done", progress: 100, budget: 60000, used: 85616, updated: "2026-10-04 23:39", note: "Fait par stt-dev (Haiku) : 20 fichiers renommés, ordre 001–004 corrigé d'après git log, liens mis à jour. Revue CP faite.", docs: [ { f: "docs/work_in_progress/renumerotation-specs.md", r: "créé" }, { f: "docs/specs/SPEC-001-vaisseaux_generatifs-V1.0.md", r: "modifié" }, { f: "docs/specs/SPEC-002-generation_de_l_univers-V1.0.md", r: "modifié" }, { f: "docs/specs/SPEC-006-integration_de_la_demo-V1.0.md", r: "modifié" }, { f: "docs/DAT-annexe_1-plan_scenes-V1.0.md", r: "modifié" }, { f: "docs/spec-space_travel_and_transport-v2.17-P1.md", r: "modifié" }, { f: "docs/work_in_progress/plan-status.js", r: "modifié" } ] },
    { id: "C0.6", lot: "C0", title: "Installer les agents dans .claude/agents, supprimer specs/PLAN-STATUS.md", agent: "dev", model: "haiku", status: "done", progress: 100, budget: 10000, used: null, updated: "2026-10-04 23:39", note: "Agents suivis dans .claude/agents/ (gitignore : .claude/* sauf agents/). Copies locales non suivies à effacer après récupération du bundle.", docs: [ { f: "../../.claude/agents/stt-cp.md", r: "modifié" }, { f: "../../.claude/agents/stt-archi.md", r: "modifié" }, { f: "../../.claude/agents/stt-dev.md", r: "modifié" }, { f: "docs/work_in_progress/plan-status.js", r: "modifié" } ] },
    { id: "C0.7", lot: "C0", title: "Valider les 10 décisions de SPEC-010 § 4", agent: "cp", model: "sonnet", status: "done", progress: 100, budget: 5000, used: 4000, est: true, updated: "2026-10-04 23:00", note: "Toutes les recommandations retenues par le mainteneur ; spec et Claude Doc mis à jour.", docs: [ { f: "docs/specs/SPEC-010-chantier_naval_et_campagne-V1.0.md", r: "modifié" }, { f: "docs/work_in_progress/plan-status.js", r: "modifié" } ] },
    { id: "L0.0", lot: "L0", title: "Fiche de lot et pilotage", agent: "cp", model: "opus", status: "done", progress: 100, budget: 40000, used: 95000, est: true, updated: "2026-10-05 00:53", note: "Pilotage par la session Cowork (Opus) : contrat, revues, Kanban, intégration. Estimation d'après le compteur de session.", docs: [ { f: "docs/specs/SPEC-010-chantier_naval_et_campagne-V1.0.md", r: "lu" }, { f: "docs/specs/lots/L0-contrat.md", r: "lu" }, { f: "docs/work_in_progress/plan-status.js", r: "modifié" }, { f: "docs/work_in_progress/kanban.html", r: "lu" } ] },
    { id: "L0.1", lot: "L0", title: "Contrat L0 et découpage en tâches", agent: "archi", model: "opus", status: "done", progress: 100, budget: 60000, used: 25000, updated: "2026-10-04 23:42", note: "Contrat : docs/specs/lots/L0-contrat.md (rédigé par le CP-ARCHI de la session Cowork).", est: true, docs: [ { f: "docs/specs/lots/L0-contrat.md", r: "créé" }, { f: "docs/specs/SPEC-010-chantier_naval_et_campagne-V1.0.md", r: "lu" }, { f: "docs/specs/CODEMAP.md", r: "lu" } ] },
    { id: "L0.2", lot: "L0", title: "codemap.py → docs/specs/CODEMAP.md", agent: "dev", model: "sonnet", status: "done", progress: 100, budget: 50000, used: 150788, updated: "2026-10-04 23:51", note: "Dépassement ×3 du budget : l'agent a beaucoup lu pour valider l'analyseur. CODEMAP.md : 238 lignes.", docs: [ { f: "docs/specs/lots/L0-contrat.md", r: "lu" }, { f: "docs/specs/CODEMAP.md", r: "créé" }, { f: "CLAUDE.md", r: "lu" } ] },
    { id: "L0.3", lot: "L0", title: "Chronométrage d'une mission (Playwright)", agent: "dev", model: "sonnet", status: "done", progress: 100, budget: 60000, used: 87054, updated: "2026-10-05 00:20", note: "Mesure : 71 s (Courlis) et 142 s (e18) par mission locale, contre 6 min supposées. Avec 45 s de décision humaine, station à 1 h 52 : facteur de primes ≈ 0,33 en campagne pour revenir vers 6 h (décision 11).", docs: [ { f: "docs/specs/lots/L0-contrat.md", r: "lu" }, { f: "sources/tools/eco_sim.py", r: "modifié" }, { f: "sources/target/mesures/missions-e18.json", r: "créé" }, { f: "sources/target/mesures/missions-mod_stt-courlis.json", r: "créé" }, { f: "docs/specs/CODEMAP.md", r: "lu" }, { f: "docs/work_in_progress/plan-status.js", r: "modifié" } ] },
    { id: "L0.4", lot: "L0", title: "build.py : sttData, contrôle @requires, parité i18n", agent: "dev", model: "sonnet", status: "done", progress: 100, budget: 80000, used: 104470, updated: "2026-10-04 23:51", note: "build.py : sttData, sim/ ui/, @requires, parité i18n (169 clés), tests Node fichier par fichier (Node 22).", docs: [ { f: "docs/specs/lots/L0-contrat.md", r: "lu" }, { f: "docs/specs/CODEMAP.md", r: "lu" }, { f: "CLAUDE.md", r: "lu" }, { f: "README.md", r: "lu" } ] },
    { id: "L0.5", lot: "L0", title: "GAME, RNG.game, DATA, SAVE + tests Node", agent: "dev", model: "sonnet", status: "done", progress: 100, budget: 140000, used: 116508, updated: "2026-10-04 23:51", note: "GAME, RNG.game, DATA, SAVE : 50 tests Node verts.", docs: [ { f: "docs/specs/lots/L0-contrat.md", r: "lu" }, { f: "docs/specs/SPEC-010-chantier_naval_et_campagne-V1.0.md", r: "lu" }, { f: "docs/specs/CODEMAP.md", r: "lu" }, { f: "sources/src/data/economy.json", r: "créé" } ] },
    { id: "L0.6", lot: "L0", title: "Choix Campagne / Partie libre, Courlis de départ", agent: "dev", model: "sonnet", status: "done", progress: 100, budget: 100000, used: 194050, updated: "2026-10-05 00:17", note: "Fait + 4 corrections de revue (reprise sur la même graine, confirmation, import, tests). Corrections non mesurées (reprise d'agent) : total réel plus élevé.", docs: [ { f: "docs/specs/lots/L0-contrat.md", r: "lu" }, { f: "docs/specs/SPEC-010-chantier_naval_et_campagne-V1.0.md", r: "lu" }, { f: "docs/specs/CODEMAP.md", r: "lu" }, { f: "docs/specs/img/spec010/console-flotte.svg", r: "lu" }, { f: "sources/src/data/economy.json", r: "lu" } ] },
    { id: "L0.7", lot: "L0", title: "Revue des diffs L0", agent: "archi", model: "opus", status: "done", progress: 100, budget: 50000, used: 12000, updated: "2026-10-05 00:17", note: "Revues sur diff faites par le CP-ARCHI de la session à chaque tâche.", est: true, docs: [ { f: "docs/specs/lots/L0-contrat.md", r: "lu" }, { f: "docs/specs/SPEC-010-chantier_naval_et_campagne-V1.0.md", r: "lu" }, { f: "docs/specs/CODEMAP.md", r: "modifié" } ] },
    { id: "L6.M", lot: "L6", title: "Nouveaux maillages : laboratoire, raffinerie, fabrique, serre, tourelle (MCP Blender)", agent: "dev", model: "sonnet", status: "todo", progress: 0, budget: 250000, used: null, updated: "", note: "Décision 9. Le CP demande au mainteneur de démarrer Blender et son serveur MCP au moment de la tâche.", docs: [ { f: "docs/specs/SPEC-010-chantier_naval_et_campagne-V1.0.md", r: "lu" }, { f: "docs/specs/img/spec010/chantier.svg", r: "lu" }, { f: "docs/specs/img/spec010/station-site.svg", r: "lu" }, { f: "docs/specs/SPEC-001-vaisseaux_generatifs-V1.0.md", r: "lu" }, { f: "docs/specs/CODEMAP.md", r: "lu" } ] }
  ],

  decisions: [
    { n: 1,  subject: "Intégration de l'éditeur : portage natif + shared/sttcomp.js", status: "validée (04/10)" },
    { n: 2,  subject: "Départ : Courlis modulaire, 4 000 CR", status: "validée (04/10)" },
    { n: 3,  subject: "Vaisseaux procéduraux en occasion", status: "validée (04/10)" },
    { n: 4,  subject: "Pas de progression hors ligne", status: "validée (04/10)" },
    { n: 5,  subject: "F1–F8 → onglets de la console", status: "validée (04/10)" },
    { n: 6,  subject: "Station construite par missions d'approvisionnement", status: "validée (04/10)" },
    { n: 7,  subject: "Flotte bornée par les postes", status: "validée (04/10)" },
    { n: 8,  subject: "Rendement automatisé 65 %", status: "validée (04/10)" },
    { n: 9,  subject: "Nouveaux maillages après L5", status: "validée (04/10)" },
    { n: 10, subject: "Lots M3 / P2 / M4 intercalés", status: "validée (04/10)" },
    { n: 11, subject: "Campagne : facteur de primes ≈ 0,33 (economy.json) pour garder la station vers 6 h, à re-mesurer après M2 (gabares)", status: "validée (05/10)" }
  ],

  journal: [
    { at: "2026-10-04", text: "SPEC-010 proposée : mécanique, architecture, plan ; fichiers d'agents et Kanban créés." },
    { at: "2026-10-04", text: "Décisions 1 à 10 validées par le mainteneur ; point 9 : maillages par le MCP Blender, démarré à la demande." },
    { at: "2026-10-04", text: "Maquettes SVG intégrées ; règle de nommage SPEC-NNN décidée (010/011 conservés, plan Scene en annexes de la DAT, suffixe -autonome) ; Kanban déplacé dans docs/work_in_progress/." },
    { at: "2026-10-04", text: "Lancement : clone cloud, branche stt-C0-L0, livraison par bundle git (pas d'accès en écriture à GitHub)." },
    { at: "2026-10-05", text: "L0 : C0.5, L0.1 à L0.7 faits dans la branche stt-C0-L0. Mesure des missions : 71 s (Courlis), 142 s (e18) ; décision 11 proposée (facteur de primes de campagne)." },
    { at: "2026-10-05", text: "Suite complète verte sur les pages lisible et obfusquée (556 contrôles, 0 échec). Branche livrée en bundle : à relire et fusionner par PR." },
    { at: "2026-10-05", text: "L0 fusionnée dans main (5f7135d) ; build et suite complète relancés sur le code fusionné : 547 PASS, 0 échec. Décision 11 validée ; L0 close (tag stt_v2.18 après fusion de la PR de clôture). Kanban : docs par tâche, tâches faites repliées, onglet Indicateurs." }
  ]
};
