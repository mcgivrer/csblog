TÂCHE L2a.8 — correctif minimal du noyau sttcomp demandé par l'ARCHI (lot L2a). Worktree : /home/frederic/Projects/web/csblog/.claude/worktrees/stt-L2a (branche worktree-stt-L2a). Tu ne touches PAS au Kanban (ni plan-status.js ni kanban.html) : le CP s'en charge.

Contexte : dans shared/sttcomp.js, K.gameExport appelle toExport sans companies ni stats et perdrait les marques perso. L'éditeur (STT_modules/sources/index.html) garde donc son propre gameExportObj ; son remplacement par K.gameExport est reporté à L2b (ne modifie PAS l'éditeur).

À faire :
1. shared/sttcomp.js (vers les lignes 406 et 412) : la fonction gameExport accepte désormais `opts` (gameExport(c, analysis, opts)) et appelle core.toExport(c, Object.assign({}, opts, { stats: analysis.stats })). Ne change rien d'autre : comportement identique quand opts est absent. Garde le module sans THREE ni DOM ni aléa direct.
2. Test Node dans sttcomp-io.test.mjs (sources/src/test/unit/) : une marque perso passée via opts.companies est conservée dans l'export (companies) ; et sans opts le résultat est inchangé par rapport à avant.
3. STT_modules/STT_INTEGRATION.md § 11 : ajoute une phrase : la géométrie du jeu (JSON arrondi à 6 décimales) et celle de l'éditeur (geomFromProtos, pleine précision) peuvent différer jusqu'à 1e-5 m.
4. Vérifie : `node --test` sur les tests sttcomp (tous verts : il y en avait 78) et que `python3 STT_modules/tests/editor_probe.py --check` reste vert si la machine le permet (sinon dis-le). Ne lance pas build.py ni les tests Playwright. Le poids de sttcomp.js doit rester ≤ 35 Ko.
5. Commit avec pathspecs explicites (shared/sttcomp.js, le test, STT_INTEGRATION.md), message « L2a.8 : gameExport transmet opts (marques perso), test et note § 11 », terminé par la ligne Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>. Rien n'est poussé.

Rapport ≤ 12 lignes, en tête : hash du commit, fichiers touchés, tests passés (nombre), poids de sttcomp.js, écarts au contrat. Puis arrête-toi.
