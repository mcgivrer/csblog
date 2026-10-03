/* =========================================================================
   PLANIFICATION / RELANCE D'ITINÉRAIRE
   Fonction commune au démarrage et à la relance automatique en fin de
   route : établit les étapes, la courbe, les repères d'abscisse curviligne
   de chaque étape et les portiques, à partir d'une position et d'un cap
   de départ donnés. Définie au niveau global : l'autopilote (plus bas)
   doit pouvoir l'appeler dès qu'une route est terminée.
   ========================================================================= */
function computeRoute(origin, heading, alignShip){
  if(ROUTE.gates){ LAYERS.detach(ROUTE.gates); ROUTE.gates = null; }
  /* les systèmes de l'ancienne route n'ont plus de sens une fois les
     étapes renumérotées : on les démonte tous avant de recalculer */
  ROUTE.builtSystems.forEach(function(grp){ LAYERS.detach(grp); disposePlanetGroup(grp); });
  ROUTE.builtSystems.clear();

  /* Le nombre d'étapes varie d'un itinéraire à l'autre (3 à 12) : chaque
     trajet a sa propre longueur, plutôt qu'un compte fixe. */
  const legCount = 3 + Math.floor(Math.random()*10);
  ROUTE.legs = planRoute(origin, heading, legCount);
  ROUTE.index = 0;
  ROUTE.s = 0;
  /* déclenchement de la mise en orbite/livraison : désormais À CHAQUE
     étape (pas seulement à la fin de l'itinéraire) — cet index avance
     indépendamment de ROUTE.index (qui sert à l'affichage du plan de vol)
     pour éviter tout conflit d'ordre entre les deux seuils. */
  ROUTE.nextDelivery = 0;
  if(!ROUTE.legs.length){ ROUTE.curve = null; ROUTE.length = 0; refreshRoutePanel(); refreshItineraryDots(); return; }

  /* génération des systèmes planétaires : la cible réelle de chaque étape
     devient la planète habitable (son port spatial), pas l'étoile elle-même.
     La courbe ne vise cependant pas le CENTRE de la planète — désormais bien
     plus grande que le vaisseau — mais un point d'approche sûr, décalé vers
     l'extérieur le long de l'axe étoile→planète, pour que le vol frôle la
     planète au lieu de traverser sa surface. */
  ROUTE.legs.forEach(function(leg){
    leg.system = generateSystemData(leg);
    const hab = leg.system.planets[leg.system.habIdx];
    leg.planet = hab;
    const outward = hab.position.clone().sub(leg.starPosition).normalize();
    leg.position = hab.position.clone().addScaledVector(outward, hab.radius*2.6);
    leg.cityName = hab.cityName;
    leg.portName = hab.portName;

    /* évitement des AUTRES planètes du système : la route locale suit
       grossièrement le segment étoile → point d'approche, donc c'est là
       qu'une planète non ciblée risquerait de se retrouver sur le
       passage. On l'écarte perpendiculairement, juste assez pour dégager
       le passage, sans perturber le reste de sa position orbitale. */
    const segA = leg.starPosition, segDir = leg.position.clone().sub(segA);
    const segLenSq = Math.max(segDir.lengthSq(), 1);
    leg.system.planets.forEach(function(p){
      if(p === hab) return;
      const toP = p.position.clone().sub(segA);
      const t = THREE.MathUtils.clamp(toP.dot(segDir)/segLenSq, 0, 1);
      const closest = segA.clone().addScaledVector(segDir, t);
      const dist = closest.distanceTo(p.position);
      const safe = p.radius + 320;   /* marge confortable (~6× la longueur du vaisseau) */
      if(dist < safe){
        const push = p.position.clone().sub(closest);
        if(push.lengthSq() < 1){
          /* position dégénérée (quasiment sur le segment) : direction
             perpendiculaire arbitraire mais déterministe */
          push.set(1,0,0).cross(segDir);
          if(push.lengthSq() < 1) push.set(0,1,0).cross(segDir);
        }
        push.normalize();
        p.position.addScaledVector(push, (safe-dist) + 60);
      }
    });
  });

  ROUTE.curve = buildRouteCurve(ROUTE.legs, origin);
  ROUTE.length = ROUTE.curve.getLength();

  /* La spline de Catmull-Rom peut bomber plus près d'une planète CIBLÉE que
     son point d'approche officiel (2,6 rayons) ne le laisse penser — ce
     point n'est garanti que PAR CONSTRUCTION à cette distance-là ; rien
     n'empêche la courbe de repasser plus près juste avant ou après. On
     vérifie donc après coup, et si besoin on éloigne le point d'approche
     encore plus de l'étoile (donc de la planète, le long du même axe) puis
     on redessine la courbe — jusqu'à ce que la marge soit sûre.
     Corrige aussi un bug distinct remonté en jeu : l'ÉTOILE de l'étape,
     elle, n'était jusqu'ici JAMAIS vérifiée (seules les planètes
     l'étaient) — le vaisseau pouvait purement et simplement la traverser.
     Même correctif, même axe : s'éloigner de la planète éloigne aussi de
     son étoile. */
  for(let attempt=0; attempt<10; attempt++){
    const SAMPLES = 300;
    const pts = [];
    for(let i=0;i<=SAMPLES;i++) pts.push(ROUTE.curve.getPointAt(i/SAMPLES));
    let adjusted = false;
    ROUTE.legs.forEach(function(leg){
      const hab = leg.planet;
      if(!hab) return;
      let bestDPlanet = Infinity, bestDStar = Infinity;
      for(let i=0;i<pts.length;i++){
        const dP = pts[i].distanceTo(hab.position);
        if(dP < bestDPlanet) bestDPlanet = dP;
        /* l'ÉTOILE elle-même n'était jusqu'ici JAMAIS vérifiée : seules les
           planètes l'étaient — bug remonté en jeu, le vaisseau pouvait
           traverser l'étoile de l'étape en cours. Rayon visuel réel de
           l'étoile (même formule que buildStarCell, cohérence oblige). */
        const dS = pts[i].distanceTo(leg.starPosition);
        if(dS < bestDStar) bestDStar = dS;
      }
      const safePlanet = hab.radius + 130;
      const starCoreR = 1.4 * Math.pow(leg.star.radius, 0.42);
      const safeStar = starCoreR + 220;
      const deficitPlanet = safePlanet - bestDPlanet;
      const deficitStar = safeStar - bestDStar;
      /* un seul et même geste corrige les deux contraintes : éloigner le
         point d'approche du système, le long de l'axe étoile→planète déjà
         utilisé — cet axe s'éloigne à la fois de l'étoile (par definition)
         et de la planète (qu'il continue de longer). On applique le plus
         grand déficit constaté des deux. */
      const deficit = Math.max(deficitPlanet, deficitStar);
      if(deficit > 0){
        const outward = hab.position.clone().sub(leg.starPosition).normalize();
        const currentOffset = leg.position.distanceTo(hab.position);
        /* on comble le manque effectivement constaté, avec une marge —
           plus robuste qu'un pas fixe face à un déficit parfois important */
        leg.position = hab.position.clone().addScaledVector(outward, currentOffset + deficit + 260);
        adjusted = true;
      }
    });
    if(!adjusted) break;
    ROUTE.curve = buildRouteCurve(ROUTE.legs, origin);
    ROUTE.length = ROUTE.curve.getLength();
  }

  /* filet de sécurité final : si la courbe résiste encore après 10
     tentatives (rare — deux étapes voisines dont les corrections
     s'entravent mutuellement), on écarte directement la planète de son
     point le plus proche sur la courbe. Cela ne modifie plus la courbe
     elle-même, seulement la position de la planète : garantie de marge
     sûre dans tous les cas, au prix d'un léger écart avec l'axe
     étoile→planète d'origine — un compromis rare et mineur. */
  (function finalHabitableSafety(){
    const SAMPLES = 400;
    const pts = [];
    for(let i=0;i<=SAMPLES;i++) pts.push(ROUTE.curve.getPointAt(i/SAMPLES));
    ROUTE.legs.forEach(function(leg){
      const hab = leg.planet;
      if(!hab) return;
      let bestD = Infinity, bestPt = null;
      for(let i=0;i<pts.length;i++){
        const d = pts[i].distanceTo(hab.position);
        if(d < bestD){ bestD = d; bestPt = pts[i]; }
      }
      const safe = hab.radius + 130;
      if(bestD < safe){
        const push = hab.position.clone().sub(bestPt);
        if(push.lengthSq() < 1) push.set(1,0,0);
        push.normalize();
        hab.position.addScaledVector(push, (safe-bestD) + 40);
      }
    });
  })();

  /* filet de sécurité complémentaire : la spline peut légèrement bomber
     entre deux étapes (propriété des courbes de Catmull-Rom) et passer
     plus près d'une planète que le simple segment étoile→approche vérifié
     plus haut. On échantillonne la courbe entière et on écarte toute
     planète qui se retrouverait malgré tout trop proche. */
  (function avoidPlanetsAlongCurve(){
    const SAMPLES = 300;
    const pts = [];
    for(let i=0;i<=SAMPLES;i++) pts.push(ROUTE.curve.getPointAt(i/SAMPLES));
    /* la courbe elle-même ne bouge pas ici (seules les planètes sont
       déplacées) : quelques passes suffisent à converger, sans jamais
       avoir besoin de rééchantillonner — un premier écart, calculé à
       partir du point le plus proche d'AVANT le déplacement, peut se
       révéler tout juste insuffisant une fois la planète effectivement
       déplacée (la courbe tourne localement) ; on revérifie donc. */
    for(let pass=0; pass<3; pass++){
      let anyPush = false;
      ROUTE.legs.forEach(function(leg){
        if(!leg.system) return;
        leg.system.planets.forEach(function(p){
          if(p === leg.planet) return;  /* la planète ciblée a sa propre marge d'approche dédiée */
          let bestD = Infinity, bestPt = null;
          for(let i=0;i<pts.length;i++){
            const d = pts[i].distanceToSquared(p.position);
            if(d < bestD){ bestD = d; bestPt = pts[i]; }
          }
          const dist = Math.sqrt(bestD);
          const safe = p.radius + 320;
          if(dist < safe){
            const push = p.position.clone().sub(bestPt);
            if(push.lengthSq() < 1) push.set(1,0,0);
            push.normalize();
            p.position.addScaledVector(push, (safe-dist) + 60);
            anyPush = true;
          }
        });
      });
      if(!anyPush) break;
    }
  })();

  /* abscisse curviligne de chaque étape : on la retrouve en cherchant le
     point de la courbe le plus proche de l'étoile. C'est ce repère qui
     pilote l'avancement du panneau de plan de vol. */
  const SAMPLES = 1200;
  const cache = [];
  for(let i=0;i<=SAMPLES;i++){
    cache.push(ROUTE.curve.getPointAt(i/SAMPLES));
  }
  ROUTE.legS = ROUTE.legs.map(function(leg){
    let bi = 0, bd = Infinity;
    for(let i=0;i<=SAMPLES;i++){
      const d = cache[i].distanceToSquared(leg.position);
      if(d < bd){ bd = d; bi = i; }
    }
    return (bi/SAMPLES)*ROUTE.length;
  });

  ROUTE.gates = buildRouteGates(ROUTE.curve);
  LAYERS.sysWorld.add(ROUTE.gates);

  if(alignShip){
    /* orientation initiale : nez aligné sur la tangente de la courbe.
       Uniquement au tout premier calcul — en relance, le vaisseau garde
       l'inertie de son vol en cours, il ne se réoriente pas d'un coup. */
    const t0 = ROUTE.curve.getTangentAt(0).normalize();
    shipRig.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1), t0);
  }
  ensureSystemsBuilt();
  refreshRoutePanel();
  refreshItineraryDots();
}
const keys = {};
window.addEventListener('keydown', function(e){
  /* générique, écran-titre, choix du vaisseau : le clavier appartient à ces écrans (42-…), jamais aux
     panneaux, à la pause ni au pilotage de la partie, qui n'existe pas encore */
  if(!gameStarted) return;
  /* abrégé de la manœuvre d'orbite/livraison : le reste de la séquence se
     joue en accéléré (travelling rapide) plutôt que d'être coupé net —
     les navettes et le canal radio restent visibles, juste comprimés.
     ÉCHAP n'abrège plus depuis l'introduction du mode Pause (§11) : elle
     est désormais LA touche pause, sans exception ni double emploi selon
     la phase — ESPACE/ENTRÉE restent seuls pour l'abrégé, ce qu'ils
     faisaient déjà. */
  if(e.code === 'Space'){
    /* empêche le défilement de la page (comportement par défaut du
       navigateur pour Espace) — pertinent aussi bien pour la propulsion
       en vol normal que pour l'abrégé pendant l'approche */
    e.preventDefault();
    /* carte ouverte : ESPACE la ferme (la carte ne gèle pas la simulation et n'utilise pas gamePaused) */
    if(isStarMapOpen()){ closeStarMap(); return; }
    if(gamePaused){ resumeGame(); return; }
    if(flightPhase === 'ARRIVAL_PAUSE') arrivalSkip = true;
  }
  if(e.code === 'Enter'){
    if(isStarMapOpen()){ closeStarMap(); return; }
    if(gamePaused){ resumeGame(); return; }
    if(flightPhase === 'ARRIVAL_PAUSE') arrivalSkip = true;
  }
  /* ÉCHAP / P / PAUSE — mode Pause (§11). Diagramme d'états de la spec :
     Jeu → Paused sur ÉCHAP/P/PAUSE ; Paused → Jeu sur ESPACE/ENTRÉE
     (ci-dessus) ; Paused → écran-titre sur ÉCHAP UNIQUEMENT (P/PAUSE
     n'ont alors aucun effet — pas de bascule retour par ces deux-là). */
  if(e.code === 'Escape' || e.code === 'KeyP' || e.code === 'Pause'){
    e.preventDefault();
    /* carte ouverte : ÉCHAP / P la ferment en priorité, sans mettre en pause (la carte ne gèle pas la
       simulation et n'utilise pas gamePaused) */
    if(isStarMapOpen()){ closeStarMap(); return; }
    if(gamePaused){
      if(e.code === 'Escape') quitToTitle();
    } else {
      enterPause();
    }
    return;
  }
  /* M — carte stellaire (§23.3) : bascule dédiée, distincte d'ÉCHAP/P pour
     ne pas hériter du « ÉCHAP en pause quitte vers l'écran-titre » — sortir
     de la carte doit reprendre le vol, jamais recharger la partie. Passe
     par activateHudBarItem comme H/I/L : jamais dupliquée entre clavier
     et bouton de la barre.
     Bug remonté en jeu : ne réagissait pas sur clavier AZERTY. `e.code`
     donne la position PHYSIQUE de la touche (référence QWERTY), pas le
     caractère produit — sur AZERTY, la lettre M occupe la position de la
     touche point-virgule de QWERTY (`Semicolon`), pas celle de son M
     (bas du clavier, qui produit une virgule en AZERTY). Même principe
     déjà en place pour ZQSD (keys['KeyZ']||keys['KeyW'] etc.) : on
     accepte les deux codes plutôt que de supposer un unique clavier. */
  if(gamePaused) return;   /* aucune autre touche n'agit tant que le jeu est en pause, M comprise */
  if(e.code === 'KeyM' || e.code === 'Semicolon'){
    e.preventDefault();
    const it = HUD_BAR_ITEMS.find(function(x){ return x.kind === 'starmap'; });
    if(it) activateHudBarItem(it);
    return;
  }
  /* T — pilote automatique (débrayer / engager), J — tableau des missions (fermer / rappeler) : mêmes circuits que M/H/V */
  if(e.code === 'KeyT' || e.code === 'KeyJ'){
    e.preventDefault();
    const kind = e.code === 'KeyT' ? 'autopilot' : 'missions';
    const it = HUD_BAR_ITEMS.find(function(x){ return x.kind === kind; });
    if(it) activateHudBarItem(it);
    return;
  }
  if(!isStarMapOpen()) keys[e.code] = true;   /* sous la carte, le pilotage n'est pas mémorisé */
  if(e.code === 'KeyH'){
    /* passe par activateHudBarItem comme le bouton d'aide de la barre —
       une seule logique, jamais dupliquée entre clavier et bouton */
    const helpItem = HUD_BAR_ITEMS.find(function(it){ return it.kind === 'help'; });
    if(helpItem) activateHudBarItem(helpItem);
  }
  /* I / L — itinéraire et point de Lagrange (§ amélioration v2.4), mêmes
     touches fixes que H : passent par activateHudBarItem, jamais dupliquées
     entre clavier et bouton de la barre. */
  if(e.code === 'KeyI'){
    const it = HUD_BAR_ITEMS.find(function(x){ return x.cls === 'hud-itinerary'; });
    if(it) activateHudBarItem(it);
  }
  if(e.code === 'KeyL'){
    const it = HUD_BAR_ITEMS.find(function(x){ return x.cls === 'hud-lagrange'; });
    if(it) activateHudBarItem(it);
  }
  /* V — réglage des volumes (demande utilisateur), même principe que H/I/L */
  if(e.code === 'KeyV'){
    const it = HUD_BAR_ITEMS.find(function(x){ return x.kind === 'audio'; });
    if(it) activateHudBarItem(it);
  }
  /* TAB bascule directement l'affichage du canal radio, à tout moment —
     un simple interrupteur, pas une préférence qui viendrait interférer
     avec l'affichage/masquage automatique au début/fin de la manœuvre.
     preventDefault : Tab déplacerait sinon le focus clavier sur la page. */
  if(e.code === 'Tab'){
    e.preventDefault();
    toggleRadioPanel();
  }
  /* F1 à F9 — bascule chacune des icônes de la barre du HUD (§12), dans
     leur ordre d'affichage (remplace l'ancienne affectation dédiée de F3
     à la caméra, désormais F9 comme les autres icônes — une seule
     numérotation, plus simple à retenir et à documenter dans l'aide). */
  if(e.code.length === 2 && e.code[0] === 'F' && e.code >= 'F1' && e.code <= 'F9'){
    const idx = Number(e.code.slice(1)) - 1;
    if(HUD_BAR_ITEMS[idx]){
      e.preventDefault();
      activateHudBarItem(HUD_BAR_ITEMS[idx]);
    }
  }
  /* F10 — coupe/rétablit la voix de synthèse. Agit sur le MÊME état que le
     bouton muet du panneau radio (une seule source de vérité) : l'icône du
     bouton doit donc être resynchronisée ici aussi. */
  if(e.code === 'F10'){
    e.preventDefault();
    toggleVoiceMute();
  }
});
window.addEventListener('keyup', function(e){ keys[e.code] = false; });

/* ---------- fonctions partagées clavier/tactile ----------
   Extraites du gestionnaire keydown pour que les boutons tactiles (§15 de
   la spec) déclenchent EXACTEMENT la même action que leur touche, sans
   dupliquer la logique. */
function toggleRadioPanel(){
  const panel = document.getElementById('radioPanel');
  if(panel){ panel.classList.toggle('visible'); repositionRadioPanel(); }
  if(typeof refreshHudIconBar === 'function') refreshHudIconBar();
}
function nextCameraMode(){
  cameraMode = (cameraMode+1) % CAMERA_MODES.length;
  flashCameraModeLabel();
}
function toggleVoiceMute(){
  radioMuted = !radioMuted;
  const btn = document.getElementById('radioMuteBtn');
  if(btn) btn.textContent = radioMuted ? '\u{1F507}' : '\u{1F50A}';
  if(radioMuted && window.speechSynthesis){ window.speechSynthesis.cancel(); radioSpeaking = false; }
}
function toggleAudioPanel(){
  const el = document.getElementById('audioOverlay');
  if(el) el.classList.toggle('visible');
}
(function initAudioPanel(){
  const musicSlider = document.getElementById('musicVolumeSlider');
  const voiceSlider = document.getElementById('voiceVolumeSlider');
  const musicPct = document.getElementById('musicVolumePct');
  const voicePct = document.getElementById('voiceVolumePct');
  if(musicSlider) musicSlider.addEventListener('input', function(){
    setMusicVolume(musicSlider.value/100);
    if(musicPct) musicPct.textContent = musicSlider.value+'%';
  });
  if(voiceSlider) voiceSlider.addEventListener('input', function(){
    setVoiceVolume(voiceSlider.value/100);
    if(voicePct) voicePct.textContent = voiceSlider.value+'%';
  });
})();
