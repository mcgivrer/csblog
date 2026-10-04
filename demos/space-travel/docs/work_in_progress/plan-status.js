/* Données du Kanban des agents — SPEC-010 (Chantier Naval STT et campagne).
   SEUL fichier modifié par le chef de projet (stt-cp), par Edit ciblé : jamais kanban.html.
   Emplacement : demos/space-travel/docs/work_in_progress/ — mis à jour à chaque transition de tâche et à chaque rapport d'agent.
   status : todo | doing | review | blocked | done      agent : cp | archi | dev
   used   : tokens mesurés (total_tokens du bloc <usage> rendu par l'appel Agent) ; null = non mesuré ; est:true = estimation
   Le total d'un lot est calculé par la page (somme des tâches) : ne pas le saisir. */
window.PLAN = {
  updated: "2026-10-04 23:38",
  spec: "SPEC-010-chantier_naval_et_campagne-V1.0.md",
  currentLot: "C0",
  models: { cp: "CP Sonnet", archi: "ARCHI Opus", dev: "DEV Sonnet / Haiku" },

  lots: [
    { id: "C0", title: "Cadrage SPEC-010",      status: "doing", budget: 500000,  version: "—" },
    { id: "L0", title: "Fondations",            status: "todo", budget: 600000,  version: "stt_v2.18" },
    { id: "L1", title: "Console",               status: "todo", budget: 500000,  version: "stt_v2.19" },
    { id: "L2", title: "Chantier v1",           status: "todo", budget: 1200000, version: "stt_v2.20" },
    { id: "L3", title: "Flotte + équipages",    status: "todo", budget: 1200000, version: "stt_v2.21" },
    { id: "L4", title: "Technologies",          status: "todo", budget: 600000,  version: "stt_v2.22" },
    { id: "L5", title: "Station",               status: "todo", budget: 1100000, version: "stt_v2.23" },
    { id: "L6", title: "Marché, missions",      status: "todo", budget: 900000,  version: "stt_v2.24" },
    { id: "L7", title: "Équilibrage, v3.0",     status: "todo", budget: 400000,  version: "stt_v3.0" }
  ],

  tasks: [
    { id: "C0.1", lot: "C0", title: "SPEC-010 : mécanique, architecture, plan, équilibrage", agent: "archi", model: "opus", status: "done", progress: 100, budget: 300000, used: 330000, est: true, updated: "2026-10-04 23:00", note: "Session Cowork : estimation d'après le compteur de session." },
    { id: "C0.2", lot: "C0", title: "Fichiers d'agents stt-cp / stt-archi / stt-dev", agent: "cp", model: "opus", status: "done", progress: 100, budget: 20000, used: 15000, est: true, updated: "2026-10-04 23:10", note: "" },
    { id: "C0.3", lot: "C0", title: "Kanban des agents (kanban.html + plan-status.js)", agent: "cp", model: "opus", status: "done", progress: 100, budget: 40000, used: 40000, est: true, updated: "2026-10-04 22:00", note: "" },
    { id: "C0.4", lot: "C0", title: "Maquettes SVG des 5 nouveaux écrans", agent: "archi", model: "opus", status: "done", progress: 100, budget: 60000, used: 65000, est: true, updated: "2026-10-04 22:30", note: "docs/specs/img/spec010/*.svg, intégrées à SPEC-010." },
    { id: "C0.5", lot: "C0", title: "Renumérotation des specs (git mv + liens)", agent: "dev", model: "haiku", status: "review", progress: 90, budget: 60000, used: 85616, updated: "2026-10-04 23:38", note: "Fait par stt-dev (Haiku) : 20 fichiers renommés, ordre 001–004 corrigé d'après git log, liens mis à jour. Revue CP faite." },
    { id: "C0.6", lot: "C0", title: "Installer les agents dans .claude/agents, supprimer specs/PLAN-STATUS.md", agent: "dev", model: "haiku", status: "doing", progress: 50, budget: 10000, used: null, updated: "2026-10-04 23:33", note: "Agents suivis dans .claude/agents/ (gitignore ajusté) ; suppressions faites dans la branche." },
    { id: "C0.7", lot: "C0", title: "Valider les 10 décisions de SPEC-010 § 4", agent: "cp", model: "sonnet", status: "done", progress: 100, budget: 5000, used: 4000, est: true, updated: "2026-10-04 23:00", note: "Toutes les recommandations retenues par le mainteneur ; spec et Claude Doc mis à jour." },
    { id: "L0.0", lot: "L0", title: "Fiche de lot et pilotage", agent: "cp", model: "sonnet", status: "todo", progress: 0, budget: 40000, used: null, est: true, updated: "", note: "Consommation du CP non mesurable par lui-même : estimation." },
    { id: "L0.1", lot: "L0", title: "Contrat L0 et découpage en tâches", agent: "archi", model: "opus", status: "todo", progress: 0, budget: 60000, used: null, updated: "", note: "" },
    { id: "L0.2", lot: "L0", title: "codemap.py → docs/specs/CODEMAP.md", agent: "dev", model: "sonnet", status: "todo", progress: 0, budget: 50000, used: null, updated: "", note: "" },
    { id: "L0.3", lot: "L0", title: "Chronométrage d'une mission (Playwright)", agent: "dev", model: "sonnet", status: "todo", progress: 0, budget: 60000, used: null, updated: "", note: "Mesure décisive pour l'équilibrage (§ 1.7)." },
    { id: "L0.4", lot: "L0", title: "build.py : sttData, contrôle @requires, parité i18n", agent: "dev", model: "sonnet", status: "todo", progress: 0, budget: 80000, used: null, updated: "", note: "" },
    { id: "L0.5", lot: "L0", title: "GAME, RNG.game, DATA, SAVE + tests Node", agent: "dev", model: "sonnet", status: "todo", progress: 0, budget: 140000, used: null, updated: "", note: "" },
    { id: "L0.6", lot: "L0", title: "Choix Campagne / Partie libre, Courlis de départ", agent: "dev", model: "sonnet", status: "todo", progress: 0, budget: 100000, used: null, updated: "", note: "" },
    { id: "L0.7", lot: "L0", title: "Revue des diffs L0", agent: "archi", model: "opus", status: "todo", progress: 0, budget: 50000, used: null, updated: "", note: "" },
    { id: "L6.M", lot: "L6", title: "Nouveaux maillages : laboratoire, raffinerie, fabrique, serre, tourelle (MCP Blender)", agent: "dev", model: "sonnet", status: "todo", progress: 0, budget: 250000, used: null, updated: "", note: "Décision 9. Le CP demande au mainteneur de démarrer Blender et son serveur MCP au moment de la tâche." }
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
    { n: 10, subject: "Lots M3 / P2 / M4 intercalés", status: "validée (04/10)" }
  ],

  journal: [
    { at: "2026-10-04", text: "SPEC-010 proposée : mécanique, architecture, plan ; fichiers d'agents et Kanban créés." },
    { at: "2026-10-04", text: "Décisions 1 à 10 validées par le mainteneur ; point 9 : maillages par le MCP Blender, démarré à la demande." },
    { at: "2026-10-04", text: "Maquettes SVG intégrées ; règle de nommage SPEC-NNN décidée (010/011 conservés, plan Scene en annexes de la DAT, suffixe -autonome) ; Kanban déplacé dans docs/work_in_progress/." },
    { at: "2026-10-04", text: "Lancement : clone cloud, branche stt-C0-L0, livraison par bundle git (pas d'accès en écriture à GitHub)." }
  ]
};
