/* =========================================================================
   SCÈNES DU JEU — enregistrement, table des transitions, déduction de la pile (lot 1)
   Table et inventaire : docs/PLAN-scenes.md §3 et docs/PLAN-scenes-T0.1-inventaire.md §6.
   Chargé après le moteur (drapeaux déclarés) et avant la boucle (41-…) qui appelle SCENES.tick().
   Lot 1 : aucune scène n'agit encore ; la pile est DÉDUITE des drapeaux existants à chaque image.
   ========================================================================= */
(function(){
  /* scènes de base */
  SCENES.register({ name: 'boot',  type: 'base' });                    /* générique, terminal */
  SCENES.register({ name: 'title', type: 'base' });                    /* écran-titre et travelling de fond */
  SCENES.register({ name: 'flight', type: 'base' });                   /* TRANSFER, APPROACH, DEPART, COAST, HOP */
  SCENES.register({ name: 'orbit', type: 'base' });                    /* escale : ORBIT et attente du départ */
  SCENES.register({ name: 'jump',  type: 'base' });                    /* saut quantique, distorsion */
  /* scènes modales */
  SCENES.register({ name: 'shipSelect', type: 'modal' });
  SCENES.register({ name: 'flyover',    type: 'modal' });              /* survol du système (touche G) */
  SCENES.register({ name: 'starMap',    type: 'modal' });              /* ne gèle pas la simulation */
  SCENES.register({ name: 'pause',      type: 'modal', freezesBelow: true });

  SCENES.configure({
    allow: {
      '':     ['boot'],
      boot:   ['title'],
      title:  ['flight'],
      flight: ['orbit', 'jump'],
      orbit:  ['flight'],
      jump:   ['flight']
    },
    over: {
      shipSelect: ['title'],
      flyover:    ['flight', 'orbit'],
      starMap:    ['flight', 'orbit', 'jump', 'flyover'],
      pause:      ['flight', 'orbit', 'jump', 'flyover']
    }
  });

  /* pile voulue d'après l'état du jeu : base d'abord, puis les modales dans l'ordre d'empilement */
  const wanted = [];
  function desired(){
    wanted.length = 0;
    if(!worldReadyForCinematic) wanted.push('boot');
    else if(!gameStarted) wanted.push('title');
    else if(jumpState || REAL.phase === 'WARP' || REAL.phase === 'WARPOUT') wanted.push('jump');
    else if(REAL.phase === 'ORBIT') wanted.push('orbit');
    else wanted.push('flight');
    if(SHIP_SELECT_OPEN) wanted.push('shipSelect');
    if(SURVOL.isActive()) wanted.push('flyover');
    if(isStarMapOpen()) wanted.push('starMap');
    if(gamePaused) wanted.push('pause');
    return wanted;
  }

  /* appelé à chaque image par animate() ; une erreur de déduction ne doit jamais arrêter le jeu */
  let reported = false;
  SCENES.tick = function(dt, elapsed){
    try { SCENES.sync(desired()); } catch(e){ if(!reported){ reported = true; console.error('[scenes]', e); } }
    SCENES.update(dt, elapsed);
  };
  SCENES.desired = desired;

  /* au chargement du script, le jeu est dans le générique : animate() ne démarre qu'à sa fin,
     la scène `boot` ne serait donc jamais observée par tick() */
  SCENES.sync(['boot']);
})();
