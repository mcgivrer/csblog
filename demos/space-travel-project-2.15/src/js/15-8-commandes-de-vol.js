/* =========================================================================
   8. COMMANDES DE VOL — dérive automatique par défaut, prise de contrôle
      au clavier (ZQSD / flèches / AE) ou à la souris (glisser)
   ========================================================================= */
const AXIS_X = new THREE.Vector3(1,0,0), AXIS_Y = new THREE.Vector3(0,1,0), AXIS_Z = new THREE.Vector3(0,0,1);

/* =========================================================================
   PLANIFICATION / RELANCE D'ITINÉRAIRE
   Fonction commune au démarrage et à la relance automatique en fin de
   route : établit les étapes, la courbe, les repères d'abscisse curviligne
   de chaque étape et les portiques, à partir d'une position et d'un cap
   de départ donnés. Définie au niveau global : l'autopilote (plus bas)
   doit pouvoir l'appeler dès qu'une route est terminée.
   ========================================================================= */
function computeRoute(origin, heading, alignShip){
  if(ROUTE.gates){ scene.remove(ROUTE.gates); ROUTE.gates = null; }
  /* les systèmes de l'ancienne route n'ont plus de sens une fois les
     étapes renumérotées : on les démonte tous avant de recalculer */
  ROUTE.builtSystems.forEach(function(grp){ scene.remove(grp); disposePlanetGroup(grp); });
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
  scene.add(ROUTE.gates);

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
    /* même piège que ÉCHAP ci-dessous (carte stellaire réutilisant
       gamePaused, §23.3) : sans ce test, ESPACE reprendrait le vol via
       resumeGame() SANS fermer proprement la carte (overlay toujours
       affiché, étiquettes jamais nettoyées) — cf. commentaire détaillé
       plus bas pour ÉCHAP. */
    if(starMapOpen){ closeStarMap(); return; }
    if(gamePaused){ resumeGame(); return; }
    if(flightPhase === 'ARRIVAL_PAUSE') arrivalSkip = true;
  }
  if(e.code === 'Enter'){
    if(starMapOpen){ closeStarMap(); return; }
    if(gamePaused){ resumeGame(); return; }
    if(flightPhase === 'ARRIVAL_PAUSE') arrivalSkip = true;
  }
  /* ÉCHAP / P / PAUSE — mode Pause (§11). Diagramme d'états de la spec :
     Jeu → Paused sur ÉCHAP/P/PAUSE ; Paused → Jeu sur ESPACE/ENTRÉE
     (ci-dessus) ; Paused → écran-titre sur ÉCHAP UNIQUEMENT (P/PAUSE
     n'ont alors aucun effet — pas de bascule retour par ces deux-là). */
  if(e.code === 'Escape' || e.code === 'KeyP' || e.code === 'Pause'){
    e.preventDefault();
    /* bug remonté en jeu : la carte stellaire réutilise gamePaused pour
       geler le vol (§23.3), le même drapeau que la pause générale — donc
       ÉCHAP, en vérifiant seulement gamePaused, croyait la partie déjà en
       pause et retournait à l'écran-titre au lieu de fermer la carte. La
       touche M avait déjà été protégée de ce piège (cf. commentaire
       ci-dessous), mais pas ÉCHAP/P elles-mêmes, qui passaient encore par
       le test générique. Sort de la carte en priorité, avant même de
       regarder gamePaused. */
    if(starMapOpen){ closeStarMap(); return; }
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
  if(e.code === 'KeyM' || e.code === 'Semicolon'){
    e.preventDefault();
    const it = HUD_BAR_ITEMS.find(function(x){ return x.kind === 'starmap'; });
    if(it) activateHudBarItem(it);
    return;
  }
  if(gamePaused) return;   /* aucune autre touche n'agit tant que le jeu est en pause */
  keys[e.code] = true;
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

/* =========================================================================
   MODE PAUSE — §11 de la spec v2.1.
   Gel total : animate() (plus bas) ne fait plus qu'afficher l'image figée
   tant que gamePaused est vrai — aucune mise à jour de simulation, aucune
   navette, aucun chrono radio n'avance. La superposition plein écran
   bloque aussi, par simple empilement (z-index), tout clic ou glisser sur
   le canevas ou les contrôles tactiles en dessous : nul besoin de garde
   supplémentaire dans ces gestionnaires-là.
   gameStarted évite qu'une pression sur ÉCHAP pendant le générique ou
   l'écran-titre ne déclenche quoi que ce soit avant que la partie existe
   vraiment. */
let gamePaused = false;
let gameStarted = false;
/* travelling cinématique de fond de l'écran-titre (demande utilisateur) :
   vrai une fois le premier monde généré (cf. finish() dans le générique),
   garde animate() de tenter le moindre calcul avant que shipRig/starField
   n'aient de quoi produire un plan cohérent. */
let worldReadyForCinematic = false;
let titleCineTimer = 0, titleCinePos = null, titleCineLook = null;
const TITLE_CINE_SHOT_MIN = 14, TITLE_CINE_SHOT_MAX = 24;
/* choisit une cible au hasard parmi ce qui existe déjà — étoiles, planètes
   des systèmes déjà construits (ensureSystemsBuilt, via computeRoute),
   nébuleuses — chacune avec une distance de champ adaptée à sa taille
   réelle plutôt qu'une même distance pour tout (une nébuleuse est nettement
   plus grande qu'une planète, s'en approcher pareil la ferait sortir du
   cadre). */
function pickCinematicTarget(){
  const candidates = [];
  /* distance de champ pour une étoile : PAS proportionnelle à son halo
     (bug corrigé — donnait des centaines d'unités, où l'étoile n'est
     plus qu'un point sub-pixel). La taille apparente d'une étoile dans
     ce jeu vient exclusivement du calcul d'angle appliqué chaque image
     (baseCore*26/distance, cf. plus haut dans animate()) — une échelle
     compressée pensée pour un survol RAPPROCHÉ, pas un cadrage lointain.
     Viser un angle d'environ 3 (baseCore*26/dist=3 → dist=baseCore*8.7)
     donne un plan net à toute taille d'étoile, grosse ou petite. */
  starField.forEach(function(o){
    if(o) candidates.push({pos:o.mesh.position, dist: Math.max(6, o.baseCore*8.7)});
  });
  /* les planètes vivent en données sur ROUTE.legs[i].system.planets (p.mesh
     posé par buildPlanetSystemMeshes) — pas dans les enfants du groupe
     Three.js lui-même, qui les imbrique dans un sous-groupe par planète
     sans reporter leurs propriétés (rayon...) dans userData. Plus fiable
     de repartir de la donnée source que de la deviner depuis la scène. */
  ROUTE.builtSystems.forEach(function(grp, i){
    const leg = ROUTE.legs[i];
    if(!leg || !leg.system) return;
    leg.system.planets.forEach(function(p){
      if(p.mesh) candidates.push({pos:p.mesh.getWorldPosition(new THREE.Vector3()), dist: 35 + p.radius*8});
    });
  });
  nebulaField.forEach(function(o){
    if(o) candidates.push({pos:o.mesh.position, dist: 420});
  });
  if(!candidates.length) return null;
  return candidates[Math.floor(Math.random()*candidates.length)];
}
function updateTitleCinematic(dt){
  titleCineTimer -= dt;
  if(titleCineTimer <= 0 || !titleCinePos){
    const target = pickCinematicTarget();
    if(target){
      /* bug remonté en jeu (« pas de travelling ARRIÈRE ») : l'ancienne
         version choisissait une direction d'approche totalement
         aléatoire autour de la cible — sans lien avec la position
         actuelle de la caméra, ce qui pouvait très bien la placer
         derrière son sens de déplacement en cours, obligeant le plan
         suivant à reculer pour l'atteindre. Corrigé en approchant TOUJOURS
         la nouvelle cible depuis la position actuelle de la caméra (le
         long de la droite qui les relie), en s'arrêtant à distance de
         champ avant de l'atteindre — la caméra n'avance donc jamais que
         vers l'avant, jamais en arrière, quelle que soit la cible tirée. */
      const toTarget = target.pos.clone().sub(camPos);
      const d = toTarget.length();
      const dir = d > 1e-3 ? toTarget.divideScalar(d) : new THREE.Vector3(0,0,-1);
      titleCinePos = target.pos.clone().addScaledVector(dir, -target.dist);
      titleCineLook = target.pos.clone();
    }
    titleCineTimer = TITLE_CINE_SHOT_MIN + Math.random()*(TITLE_CINE_SHOT_MAX-TITLE_CINE_SHOT_MIN);
  }
  if(titleCinePos){
    /* très lent (demande utilisateur) : un taux d'interpolation environ
       15 fois plus faible que la poursuite normale du vaisseau en jeu
       (dt*4.5) — un plan met plusieurs secondes à s'installer plutôt que
       de sauter dessus, cohérent avec un fond d'écran-titre plutôt qu'une
       caméra de jeu. */
    camPos.lerp(titleCinePos, Math.min(1, dt*0.3));
    camLook.lerp(titleCineLook, Math.min(1, dt*0.3));
    camera.position.copy(camPos);
    camera.up.set(0,1,0);
    camera.lookAt(camLook);
  }
}
function enterPause(){
  if(gamePaused || !gameStarted) return;
  gamePaused = true;
  document.body.classList.add('game-paused');
  const overlay = document.getElementById('pauseOverlay');
  if(overlay) overlay.classList.add('visible');
  /* suspend la voix SANS l'annuler (contrairement au bouton muet) — elle
     reprend au même mot à la sortie de pause, quand le navigateur le
     permet ; à défaut, un échec silencieux ne casse rien d'autre. */
  if(window.speechSynthesis){
    try{ window.speechSynthesis.pause(); }catch(e){}
  }
}
function resumeGame(){
  if(!gamePaused) return;
  gamePaused = false;
  document.body.classList.remove('game-paused');
  const overlay = document.getElementById('pauseOverlay');
  if(overlay) overlay.classList.remove('visible');
  if(window.speechSynthesis){
    try{ window.speechSynthesis.resume(); }catch(e){}
  }
}
function quitToTitle(){
  /* recharge complète plutôt qu'une remise à zéro manuelle de dizaines de
     variables globales interdépendantes (ROUTE, orbitState, crédits,
     orientation du vaisseau...) — le rechargement garantit un état
     entièrement propre ET une graine neuve (SEED dérive de Date.now()),
     exactement ce que demande la spec ("nouvelle graine à la prochaine
     sélection de langue"), sans le risque d'oublier une variable au
     passage. */
  window.location.reload();
}

let dragging=false, lastPX=0, lastPY=0, dragYaw=0, dragPitch=0;
/* bouton de regard libre tactile (amélioration demandée, équivalent de
   CTRL maintenu au clavier) — maintenu enfoncé pour autoriser le
   glisser-regard ; remplace l'ancien « tout glisser tactile regarde »,
   qui n'avait aucune affordance visuelle dédiée. */
let touchLookHeld = false;
/* caméra libre : Ctrl + glisser oriente la vue autour du vaisseau sans
   toucher au pilotage — un simple regard autour de soi, pas une commande.
   Un appui court sur Ctrl bascule ensuite entre plusieurs MODES de
   caméra en croisière, selon le nombre d'appuis rapprochés :
     1 appui  → recentre le regard libre (comportement existant)
     2 appuis → mode de caméra suivant (poursuite → plan-séquence → plans lointains)
     3 appuis → retour direct à la poursuite standard
   On ne décide qu'une fois la fenêtre passée sans nouvel appui, pour
   distinguer correctement 1, 2 ou 3 appuis d'une seule séquence. */
let camOrbitYaw=0, camOrbitPitch=0;
let ctrlDownAt=0, ctrlDragged=false;
const CAMERA_MODES = ['tracking','sequence','distant'];
let cameraMode = 0;
/* mode 'distant' : succession de plans fixes (coupes franches, pas de
   fondu) à bonne distance du vaisseau, choisis pour cadrer une planète ou
   une nébuleuse proche en arrière-plan quand c'est possible. */
const distantShotState = { offset:new THREE.Vector3(80,40,220), until:0 };
function pickDistantShot(elapsed){
  let backdrop = null, backdropDist = Infinity;
  ROUTE.builtSystems.forEach(function(grp, legIdx){
    const leg = ROUTE.legs[legIdx];
    if(!leg || !leg.system) return;
    leg.system.planets.forEach(function(p){
      const d = shipRig.position.distanceTo(p.position);
      if(d < backdropDist){ backdropDist = d; backdrop = p.position; }
    });
  });
  nebulaField.forEach(function(obj){
    if(!obj) return;
    const d = shipRig.position.distanceTo(obj.mesh.position);
    if(d < backdropDist){ backdropDist = d; backdrop = obj.mesh.position; }
  });
  const dist = 260 + Math.random()*260;
  let dir;
  if(backdrop && backdropDist < 6000){
    /* la caméra se place du côté OPPOSÉ au décor par rapport au vaisseau :
       vue depuis la caméra, le vaisseau se détache alors devant lui */
    dir = shipRig.position.clone().sub(backdrop).normalize();
    dir.applyAxisAngle(new THREE.Vector3(0,1,0), (Math.random()-0.5)*0.7);
  } else {
    dir = new THREE.Vector3(Math.random()-0.5, (Math.random()-0.5)*0.5, Math.random()-0.5).normalize();
  }
  distantShotState.offset.copy(dir).multiplyScalar(dist);
  distantShotState.until = elapsed + 6 + Math.random()*4;
}

let cameraModeFlashTimer = null;
function flashCameraModeLabel(){
  const el = document.getElementById('cameraModeFlash');
  if(!el) return;
  const keys = {tracking:'cam_tracking', sequence:'cam_sequence', distant:'cam_distant'};
  el.textContent = t('cameraLabel') + t(keys[CAMERA_MODES[cameraMode]]);
  el.style.display = 'block';
  el.style.opacity = '1';
  if(cameraModeFlashTimer) clearTimeout(cameraModeFlashTimer);
  cameraModeFlashTimer = setTimeout(function(){ el.style.opacity = '0'; }, 1800);
}
window.addEventListener('keydown', function(e){
  if((e.code==='ControlLeft'||e.code==='ControlRight') && !e.repeat){
    ctrlDownAt = performance.now();
    ctrlDragged = false;
  }
});
window.addEventListener('keyup', function(e){
  if(e.code==='ControlLeft'||e.code==='ControlRight'){
    const heldFor = performance.now() - ctrlDownAt;
    /* Un appui court sur CTRL recentre simplement le regard libre. Le
       comptage d'appuis rapprochés (1/2/3 appuis pour changer de mode
       caméra) a été retiré au profit de F3 : CTRL retrouve un rôle unique
       et sans ambiguïté, et l'action est immédiate — plus besoin d'attendre
       une fenêtre de temps pour savoir si un second appui va suivre. */
    if(!ctrlDragged && heldFor < 400){
      camOrbitYaw = 0;
      camOrbitPitch = 0;
    }
  }
});
canvas.addEventListener('pointerdown', function(e){ dragging=true; lastPX=e.clientX; lastPY=e.clientY; });
window.addEventListener('pointerup', function(){ dragging=false; });
window.addEventListener('pointermove', function(e){
  if(!dragging) return;
  const dx = e.clientX-lastPX, dy = e.clientY-lastPY;
  lastPX=e.clientX; lastPY=e.clientY;
  /* au tactile (§15.1), le pilotage passe par le joystick virtuel : un
     doigt qui glisse sur la vue 3D regarde autour UNIQUEMENT si le bouton
     dédié est maintenu (équivalent tactile de CTRL) — corrige un manque
     d'affordance remonté en jeu (« le bouton de regard n'existe plus »),
     même branche que le regard libre CTRL+souris du bureau. */
  if(e.ctrlKey || (e.pointerType === 'touch' && touchLookHeld)){
    ctrlDragged = true;
    camOrbitYaw   -= dx*0.0032;
    camOrbitPitch  = THREE.MathUtils.clamp(camOrbitPitch - dy*0.0032, -1.3, 1.3);
    return;   /* ne pilote pas le vaisseau pendant un regard libre */
  }
  if(e.pointerType === 'touch') return;   /* tactile sans le bouton de regard maintenu : ni pilotage ni regard — le joystick reste la seule commande de vol */
  dragYaw = -dx*0.0022;
  dragPitch = -dy*0.0022;
  lastInputTime = performance.now();
});

/* =========================================================================
   CONTRÔLE TACTILE — §15 de la spec v2.1. Détection par capacité de
   pointage plutôt que par taille d'écran (un ordinateur portable dans une
   petite fenêtre n'est pas une tablette) ; recalculée à chaque changement
   d'orientation puisqu'un appareil peut basculer en cours de partie.
   Les boutons pilotent les MÊMES variables (`keys[...]`) que le clavier :
   aucune logique de vol nouvelle, updateFlight() ne voit pas la différence. */
/* =========================================================================
   BARRE D'ICÔNES DU HUD — §12 de la spec v2.1. Un mécanisme UNIQUE pour le
   bureau ET le tactile (fusionnée avec l'ancien menu ☰ tactile, qui
   dupliquait la même idée avec un rendu différent) : 7 bascules de
   panneaux + 1 bouton caméra (double de F3), tous générés depuis la même
   liste, avec les mêmes icônes SVG et la même fonction d'activation —
   seule la POSITION change entre bureau (bas-gauche, fixe) et tactile
   (haut, le bas étant occupé par le joystick et les commandes de vol).
   ========================================================================= */
const HUD_ICONS = {
  speed:  '<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l3.5-5.5" stroke-linecap="round"/><circle cx="12" cy="18" r="1.4" fill="currentColor" stroke="none"/>',
  route:  '<path d="M4 19c4-9 8 3 16-14" stroke-dasharray="2.5 3"/><circle cx="4" cy="19" r="1.6" fill="currentColor" stroke="none"/><circle cx="20" cy="5" r="1.6" fill="currentColor" stroke="none"/>',
  target: '<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
  temp:   '<path d="M13 4a1.6 1.6 0 0 0-3.2 0v8.7a3.6 3.6 0 1 0 3.2 0V4z"/><circle cx="11.4" cy="17.5" r="1.5" fill="currentColor" stroke="none"/>',
  flame:  '<path d="M12 3c1.8 3.4-2.4 4.6-2.4 8a2.4 2.4 0 0 0 4.8 0c0-1.6-.8-2.4-.8-4 1.6.9 2.6 3.2 2.6 5a4.2 4.2 0 0 1-8.4 0C7.8 8 12 6.5 12 3z"/>',
  sliders:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="1.7" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="10" cy="18" r="1.7" fill="currentColor" stroke="none"/>',
  radio:  '<path d="M12 21v-9M8.5 21h7"/><circle cx="12" cy="8.2" r="2.2"/><path d="M8.6 10a5.4 5.4 0 0 1 6.8 0M5.8 6.6a9.4 9.4 0 0 1 12.4 0" stroke-linecap="round"/>',
  port:   '<path d="M4 20h16M6 20V10l6-5 6 5v10"/><path d="M9.5 20v-6h5v6"/>',
  /* caméra : trois symboles distincts, un par mode (§ amélioration —
     l'icône reflète le mode ACTIF plutôt qu'un pictogramme générique) */
  cam_tracking: '<rect x="3" y="7.5" width="18" height="12" rx="2"/><path d="M8.5 7.5l1.6-2.5h3.8l1.6 2.5"/><circle cx="12" cy="13.5" r="3.2"/>',
  cam_sequence: '<circle cx="12" cy="12" r="7" stroke-dasharray="2.4 2.6"/><circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none"/><path d="M12 12l4 2.3" stroke-linecap="round"/>',
  cam_distant:  '<path d="M3 17l6-8 4 5 3-4 5 6"/><circle cx="12" cy="12" r="9"/>',
  /* itinéraire (§ amélioration v2.4) : un repère de position sur un tracé
     pointillé — distinct de « route » (juste un trait entre deux points),
     pour ne pas confondre le plan de vol textuel et ce mini-suivi visuel. */
  itinerary: '<path d="M3 15h5.5M15.5 15H21" stroke-dasharray="2.5 3"/><circle cx="12" cy="15" r="1.8" fill="currentColor" stroke="none"/><path d="M12 3.5a4 4 0 0 1 4 4c0 3-4 7.5-4 7.5s-4-4.5-4-7.5a4 4 0 0 1 4-4z"/><circle cx="12" cy="7.3" r="1.3" fill="currentColor" stroke="none"/>',
  /* point de Lagrange : boussole (cadran + aiguille) plutôt qu'un pictogramme
     orbital littéral — c'est l'ORIENTATION relative qui est montrée, pas la
     géométrie à N corps elle-même */
  lagrange: '<circle cx="12" cy="12" r="8.5"/><path d="M12 5L14 12L12 19L10 12Z" fill="currentColor" stroke="none"/>',
  /* carte stellaire (§23) : trois points reliés par des traits fins,
     évoquant une petite constellation — distinct de « route » (un seul
     trait) et de « itinerary » (repère + trajet pointillé) déjà utilisés
     par ailleurs dans cette même barre. */
  starmap: '<circle cx="6" cy="17" r="1.6" fill="currentColor" stroke="none"/><circle cx="13" cy="6" r="1.6" fill="currentColor" stroke="none"/><circle cx="18" cy="14" r="1.6" fill="currentColor" stroke="none"/><path d="M6 17L13 6M13 6L18 14M6 17L18 14" stroke-dasharray="2 2"/>',
  /* réglage des volumes (demande utilisateur) : haut-parleur simple, sans
     ondes barrées (ce n'est pas un bouton muet comme F10/radio, juste
     l'accès au réglage) */
  audio: '<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16 9.5c1 1 1 4 0 5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.3 9.2a2.7 2.7 0 1 1 3.8 2.4c-.7.35-1.1.9-1.1 1.7v.4" stroke-linecap="round"/><circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none"/>'
};
const HUD_BAR_ITEMS = [
  { cls:'hud-left',      icon:'speed',   labelKey:'menuNavPanel',    kind:'panel'  },
  { cls:'hud-route',     icon:'route',   labelKey:'lblFlightPlan',   kind:'panel'  },
  { cls:'hud-right',     icon:'target',  labelKey:'lblNearest',      kind:'panel'  },
  { cls:'hud-temp',      icon:'temp',    labelKey:'lblEngineTemp',   kind:'panel'  },
  { cls:'hud-engines',   icon:'flame',   labelKey:'lblPropulsion',   kind:'panel'  },
  { cls:'hud-telemetry', icon:'sliders', labelKey:'lblEngineCmd',    kind:'panel'  },
  { cls:null,            icon:'radio',   labelKey:'lblRadioChannel', kind:'radio'  },
  { cls:null,            icon:'port',    labelKey:'lblPortServices', kind:'port'   },
  { cls:null,            icon:'camera',  labelKey:null,              kind:'camera' },
  /* itinéraire et point de Lagrange (§ amélioration v2.4) : deux nouveaux
     panneaux, ajoutés APRÈS camera plutôt qu'entremêlés aux six premiers
     panneaux d'info — F1-F9 sont affectés par POSITION dans ce tableau
     (cf. le gestionnaire keydown plus bas, indexé sur e.code), donc tout
     insertion avant radio/port/camera aurait décalé leurs raccourcis F7-F9.
     Comme l'aide (H), ceux-ci prennent une touche FIXE plutôt qu'un F-slot. */
  { cls:'hud-itinerary', icon:'itinerary', labelKey:'lblItinerary',  kind:'panel', hotkey:'I' },
  { cls:'hud-lagrange',  icon:'lagrange',  labelKey:'lblLagrange',   kind:'panel', hotkey:'L' },
  /* carte stellaire (§23) : même principe (touche fixe, ajoutée après les
     six premiers panneaux pour ne pas décaler F7-F9) — indispensable au
     clavier ET au tactile, faute de quoi le module resterait totalement
     hors d'atteinte sur mobile/tablette (pas de touche M sur un écran
     tactile). kind:'starmap', pas 'panel' : n'affiche/masque pas une
     classe CSS mais ouvre/ferme l'overlay dédié, cf. activateHudBarItem. */
  { cls:null,            icon:'starmap', labelKey:'lblStarMapTitle', kind:'starmap', hotkey:'M' },
  /* réglage des volumes (demande utilisateur) : même principe, touche fixe
     ajoutée après les six premiers panneaux pour ne pas décaler F7-F9. */
  { cls:null,            icon:'audio',   labelKey:'lblAudioTitle', kind:'audio', hotkey:'V' },
  /* aide (amélioration demandée) : ajoutée dans la MÊME barre plutôt qu'un
     bouton séparé, pour une seule et unique zone de contrôle — mais avec
     un raccourci FIXE ('H', déjà établi) plutôt que le F-suivant
     automatique (F10), qui entrerait en conflit avec la coupure de voix
     déjà affectée à F10. */
  { cls:null,            icon:'help',    labelKey:'lblHelpTitle',    kind:'help', hotkey:'H' }
];
/* #9 (bug remonté en jeu) : le panneau services portuaires n'est
   activable que près d'une planète-port ou pendant une livraison en
   cours — sinon l'icône reste visible mais inerte, plutôt que de
   proposer un service sans objet. */
function isNearPortService(){
  if(orbitState.active) return true;
  let near = false;
  ROUTE.builtSystems.forEach(function(grp, i){
    const leg = ROUTE.legs[i];
    if(leg && leg.planet && shipRig.position.distanceTo(leg.planet.position) < leg.planet.radius*4){
      near = true;
    }
  });
  return near;
}
/* action déclenchée par un bouton de la barre — factorisée pour être
   réutilisée à l'identique par les raccourcis F1-F9 (amélioration). */
function activateHudBarItem(item){
  if(item.kind === 'panel'){
    const el = document.querySelector('.'+item.cls);
    if(el) el.classList.toggle('panel-hidden');
    repositionAllPanels();
  } else if(item.kind === 'radio'){
    toggleRadioPanel();
  } else if(item.kind === 'port'){
    if(!isNearPortService()) return;   /* icône inerte hors zone/livraison */
    const el = document.getElementById('portPanel');
    if(el){ el.classList.toggle('visible'); if(el.classList.contains('visible')) refreshPortPanel(); }
  } else if(item.kind === 'camera'){
    nextCameraMode();
  } else if(item.kind === 'help'){
    const el = document.getElementById('helpOverlay');
    if(el) el.classList.toggle('visible');
  } else if(item.kind === 'starmap'){
    if(starMapOpen) closeStarMap(); else openStarMap();
  } else if(item.kind === 'audio'){
    toggleAudioPanel();
  }
  refreshHudIconBar();
}
function refreshHudIconBar(){
  HUD_BAR_ITEMS.forEach(function(item){
    if(!item.el) return;
    let active = false, disabled = false;
    if(item.kind === 'panel'){
      const el = document.querySelector('.'+item.cls);
      active = !!(el && !el.classList.contains('panel-hidden'));
    } else if(item.kind === 'radio'){
      const el = document.getElementById('radioPanel');
      active = !!(el && el.classList.contains('visible'));
    } else if(item.kind === 'port'){
      const el = document.getElementById('portPanel');
      active = !!(el && el.classList.contains('visible'));
      disabled = !isNearPortService();
      if(disabled && active){
        /* la fenêtre d'activation s'est refermée (le vaisseau s'est
           éloigné) pendant que le panneau était ouvert : on le referme
           plutôt que de laisser un service inaccessible affiché */
        el.classList.remove('visible'); active = false;
      }
    } else if(item.kind === 'camera'){
      item.el.querySelector('svg').innerHTML = HUD_ICONS['cam_'+CAMERA_MODES[cameraMode]];
    } else if(item.kind === 'help'){
      const el = document.getElementById('helpOverlay');
      active = !!(el && el.classList.contains('visible'));
    } else if(item.kind === 'starmap'){
      active = starMapOpen;
    } else if(item.kind === 'audio'){
      const el = document.getElementById('audioOverlay');
      active = !!(el && el.classList.contains('visible'));
    }
    item.el.classList.toggle('active', active);
    item.el.classList.toggle('disabled', disabled);
    const label = item.kind === 'camera'
      ? t('cameraLabel') + t('cam_'+CAMERA_MODES[cameraMode])
      : (item.labelKey ? t(item.labelKey) : '');
    item.el.title = label + (item.hotkey ? '  [' + item.hotkey + ']' : '');
  });
}
/* aide clavier (§ amélioration) — construite dynamiquement à partir de
   HUD_BAR_ITEMS pour les touches F1-F9, plutôt que dupliquée en dur :
   toujours synchronisée avec la barre d'icônes, même si son contenu
   change plus tard (paliers suivants). */
function buildHelpGrid(){
  const grid = document.getElementById('helpGrid');
  if(!grid) return;
  const rows = [
    [t('hk_move'), t('hlp_move')],
    [t('hk_roll'), t('hlp_roll')],
    [t('hk_thrust'), t('hlp_thrust')],
    [t('hk_aim'), t('hlp_aim')],
    [t('hk_freelook'), t('hlp_freelook')]
  ];
  HUD_BAR_ITEMS.forEach(function(item){
    /* l'aide se décrit elle-même juste en dessous (« Affiche/masque cette
       aide ») — l'inclure ici aussi ferait doublon sur la touche H, comme
       repéré sur une capture d'écran de la spec (§17.3). */
    if(item.kind === 'help') return;
    const label = item.kind === 'camera' ? t('cameraLabel').replace(/[\s\u2014]+$/,'') : (item.labelKey ? t(item.labelKey) : '');
    rows.push([item.hotkey, label]);
  });
  rows.push(['F10', t('hlp_voice')]);
  rows.push(['ESPACE / ENTR\u00c9E', t('hlp_skip')]);
  rows.push(['\u00c9CHAP / P', t('hlp_pause')]);
  rows.push(['H', t('hlp_help')]);
  grid.innerHTML = rows.map(function(r){
    return '<div class="help-row"><div class="hk">'+r[0]+'</div><div class="hv">'+r[1]+'</div></div>';
  }).join('');
}
/* croix de fermeture — un seul gestionnaire délégué pour tous les
   panneaux (amélioration) plutôt qu'un écouteur par panneau : chaque
   bouton porte juste sa cible dans data-panel-cls, y compris les cas
   spéciaux (radio/services/aide) qui n'utilisent pas .panel-hidden. */
document.addEventListener('click', function(e){
  const btn = e.target.closest('.panel-close-btn');
  if(!btn) return;
  e.stopPropagation();
  const cls = btn.dataset.panelCls;
  if(cls === '__radio__'){
    toggleRadioPanel();
  } else if(cls === '__port__'){
    const el = document.getElementById('portPanel');
    if(el) el.classList.remove('visible');
    if(typeof refreshHudIconBar === 'function') refreshHudIconBar();
  } else if(cls === '__help__'){
    const el = document.getElementById('helpOverlay');
    if(el) el.classList.remove('visible');
    if(typeof refreshHudIconBar === 'function') refreshHudIconBar();
  } else if(cls === '__starmap__'){
    closeStarMap();
  } else if(cls === '__audio__'){
    toggleAudioPanel();
  } else {
    const el = document.querySelector('.'+cls);
    if(el) el.classList.add('panel-hidden');
    if(typeof repositionAllPanels === 'function') repositionAllPanels();
    if(typeof refreshHudIconBar === 'function') refreshHudIconBar();
  }
});

(function initHudIconBar(){
  const bar = document.getElementById('hudIconBar');
  if(!bar) return;
  HUD_BAR_ITEMS.forEach(function(item, idx){
    if(!item.hotkey) item.hotkey = 'F' + (idx+1);   /* F1..F9, dans l'ordre — l'aide fixe déjà la sienne à 'H' */
    const btn = document.createElement('button');
    btn.className = 'hud-icon-btn';
    btn.innerHTML = '<svg viewBox="0 0 24 24">'+HUD_ICONS[item.icon]+'</svg>';
    btn.addEventListener('pointerdown', function(e){
      e.preventDefault();
      activateHudBarItem(item);
    });
    bar.appendChild(btn);
    item.el = btn;
  });
  /* pas d'appel à refreshHudIconBar() ici : orbitState/ROUTE (lus par
     isNearPortService) ne sont déclarés que plus bas dans le script — ce
     premier rafraîchissement est fait depuis startGame(), une fois tout
     le script chargé. */
})();


(function initTouchControls(){
  const isTouchCapable = window.matchMedia('(pointer: coarse)').matches;
  if(!isTouchCapable) return;
  document.body.classList.add('touch-mode');

  function applyOrientation(){
    const portrait = window.innerHeight >= window.innerWidth;
    document.body.classList.toggle('portrait-touch', portrait);
    document.body.classList.toggle('landscape-touch', !portrait);
  }
  applyOrientation();
  window.addEventListener('resize', applyOrientation);
  if(window.screen && window.screen.orientation){
    window.screen.orientation.addEventListener('change', applyOrientation);
  }

  /* ---------- joystick virtuel : pitch/lacet, mappé sur les mêmes codes
     que les flèches — pas de valeur analogique, updateFlight() ne lit de
     toute façon que des booléens (-1/0/+1), inutile d'en inventer une. */
  const base = document.getElementById('touchJoyBase');
  const nub = document.getElementById('touchJoyNub');
  let joyPointerId = null;
  const DEADZONE = 0.32;
  function resetJoyKeys(){
    keys['ArrowUp'] = keys['ArrowDown'] = keys['ArrowLeft'] = keys['ArrowRight'] = false;
    nub.style.transform = 'translate(-50%,-50%)';
  }
  function updateJoyFromEvent(e){
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
    const r = rect.width/2;
    let nx = (e.clientX - cx) / r, ny = (e.clientY - cy) / r;
    const mag = Math.hypot(nx, ny);
    if(mag > 1){ nx /= mag; ny /= mag; }
    nub.style.transform = 'translate(calc(-50% + ' + (nx*r*0.55) + 'px), calc(-50% + ' + (ny*r*0.55) + 'px))';
    keys['ArrowUp']    = ny < -DEADZONE;
    keys['ArrowDown']  = ny >  DEADZONE;
    keys['ArrowLeft']  = nx < -DEADZONE;
    keys['ArrowRight'] = nx >  DEADZONE;
    lastInputTime = performance.now();
  }
  base.addEventListener('pointerdown', function(e){
    e.preventDefault();
    joyPointerId = e.pointerId;
    base.setPointerCapture(e.pointerId);
    updateJoyFromEvent(e);
  });
  base.addEventListener('pointermove', function(e){
    if(e.pointerId !== joyPointerId) return;
    updateJoyFromEvent(e);
  });
  function endJoy(e){
    if(joyPointerId !== null && e.pointerId !== joyPointerId) return;
    joyPointerId = null;
    resetJoyKeys();
  }
  base.addEventListener('pointerup', endJoy);
  base.addEventListener('pointercancel', endJoy);

  /* ---------- boutons maintenus : roulis (E/R) et boost (ESPACE) ---------- */
  function bindHoldButton(id, code){
    const btn = document.getElementById(id);
    if(!btn) return;
    btn.addEventListener('pointerdown', function(e){
      e.preventDefault();
      /* try/catch défensif : setPointerCapture peut lever si l'id de
         pointeur n'est plus actif (relâchement très rapide, multi-doigts) —
         une exception ici ne doit jamais empêcher la mise à jour de l'état
         qui suit. */
      try{ btn.setPointerCapture(e.pointerId); }catch(err){}
      keys[code] = true;
      btn.classList.add('active');
      lastInputTime = performance.now();
    });
    function release(e){
      keys[code] = false;
      btn.classList.remove('active');
    }
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
  }
  bindHoldButton('touchRollMinus', 'KeyR');
  bindHoldButton('touchRollPlus', 'KeyE');
  bindHoldButton('touchBoostBtn', 'Space');

  /* bouton de regard libre — pas un keys[code] comme les précédents (rien
     à voir avec le clavier), juste un booléen lu par le gestionnaire de
     glisser du canevas. */
  (function bindLookButton(){
    const btn = document.getElementById('touchLookBtn');
    if(!btn) return;
    btn.addEventListener('pointerdown', function(e){
      e.preventDefault();
      try{ btn.setPointerCapture(e.pointerId); }catch(err){}
      touchLookHeld = true;
      btn.classList.add('active');
    });
    function release(){ touchLookHeld = false; btn.classList.remove('active'); }
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
  })();

  /* les 7 panneaux d'info sont maintenant pilotés par la barre d'icônes
     unifiée du HUD (§12, cf. initHudIconBar plus bas) — plus de menu
     déroulant ni de boutons dédiés séparés ici. En portrait seulement, on
     pré-ferme les 6 panneaux (hors canal radio, qui garde sa propre
     bascule automatique) : pas la place de les garder tous ouverts en
     continu sur un écran de smartphone. */
  if(document.body.classList.contains('portrait-touch')){
    ['hud-left','hud-route','hud-right','hud-temp','hud-engines','hud-telemetry','hud-itinerary','hud-lagrange'].forEach(function(cls){
      const el = document.querySelector('.'+cls);
      if(el) el.classList.add('panel-hidden');
    });
    /* pas de refreshHudIconBar() ici non plus, même raison que dans
       initHudIconBar juste au-dessus — le premier rafraîchissement aura
       lieu depuis startGame(). */
  }
})();

let manual = false;
let lastInputTime = 0;
/* sollicitation d'attitude de l'image courante, lue par les RCS */
const rcsDemand = {yaw:0, pitch:0, roll:0};
/* niveau d'allumage lissé de chaque tuyère (montée vive, extinction douce) */
const rcsLevel = {yawP:0, yawN:0, pitchP:0, pitchN:0, rollP:0, rollN:0};
const IDLE_MS = 3200;
const CRUISE_SPEED_BASE = 56, BOOST_MULT = 3.1;   /* 42→56 (+33%) : compense
   l'allongement des systèmes planétaires (bug #1) pour garder un temps de
   croisière comparable — sans quoi l'espacement plus généreux à lui seul
   aurait rallongé chaque trajet d'autant. */
let currentSpeed = CRUISE_SPEED_BASE;
/* amélioration « Propulseurs » — services portuaires (#9, palier 1) :
   chaque niveau augmente durablement la vitesse de croisière effective.
   Autonome vis-à-vis du palier 2 (dégâts/réparations, pas encore
   implémenté) : un vrai gain de gameplay dès maintenant, pas une coquille
   qui attend un système inexistant. */
let speedUpgradeLevel = 0;
const SPEED_UPGRADE_STEP = 0.09;   /* +9% de vitesse de croisière par niveau */
const SPEED_UPGRADE_MAX = 4;
function effectiveCruiseSpeed(){
  return CRUISE_SPEED_BASE * (1 + speedUpgradeLevel*SPEED_UPGRADE_STEP);
}
function speedUpgradeCost(level){
  return Math.round(3200 * Math.pow(1.55, level));
}

/* =========================================================================
   CARBURANT (§22) — jauge, consommation liée au régime moteur,
   ravitaillement en escale.
   ========================================================================= */
/* Réservoir de départ dimensionné contre les constantes RÉELLES du
   générateur de routes (§22.1) : un saut mesure 700-1500 u (HOP_MIN/MAX,
   findNextWaypoint), ~1100 u en moyenne ; une route compte 3-12 étapes
   (legCount), ~7,5 en moyenne — soit ~8000 u par itinéraire complet en
   croisière économique. 24 000 u ≈ 3 itinéraires à ce régime. */
const FUEL_CAPACITY = 24000;
let fuel = FUEL_CAPACITY;
/* sous ce ratio vitesse/croisière, aucun surcoût : une amélioration
   Propulseurs (ci-dessus) ne change donc PAS le coût en carburant d'un
   trajet, seulement sa durée — cf. §22.2. Au-delà (boost), l'exposant 1,5
   fait grimper vite le coût : un trajet intégralement boosté coûterait
   ≈ 5,46× la référence (BOOST_MULT^1.5), plus qu'un réservoir plein —
   délibéré, le boost soutenu doit rester un appoint, pas un régime de
   croisière. */
const FUEL_CONSUMPTION_EXPONENT = 1.5;
/* à sec, le vaisseau n'est pas totalement immobilisé (ce qui bloquerait
   la partie sans espoir de rejoindre un port) : le boost devient
   indisponible et la croisière tombe à ce ratio — de quoi se traîner
   jusqu'à l'escale la plus proche, pas de quoi continuer normalement.
   Ce comportement à vide n'était pas détaillé dans la proposition
   d'origine (§22) ; choisi ici pour rester jouable plutôt que de bloquer
   la partie. */
const FUEL_EMPTY_SPEED_SCALE = 0.2;
/* tarif du ravitaillement (§22.3) : facturé uniquement sur le volume
   manquant, jamais un forfait fixe. */
const FUEL_PRICE_PER_UNIT = 0.20;
/* seuils d'alerte HUD (§22.4), proposition de départ à ajuster en playtest */
const FUEL_WARN_RATIO = 0.25, FUEL_CRIT_RATIO = 0.10;
function fuelRefuelCost(){
  return Math.ceil((FUEL_CAPACITY - fuel) * FUEL_PRICE_PER_UNIT);
}

/* =========================================================================
   PROPULSION QUANTIQUE ET CARTE STELLAIRE (§23)
   ========================================================================= */
/* achat unique en escale (§23.1) — pas un système à paliers comme les
   propulseurs : soit le vaisseau dispose du module, soit non. */
const QUANTUM_JUMP_PRICE = 18000;
let hasQuantumJump = false;
/* rayon (en cellules stellaires, §2) dans lequel une étoile est proposée
   comme cible de saut — plus large que le rayon de rendu courant
   (STAR_RADIUS=3) : la carte s'appuie sur starDataForCell() directement
   (pur calcul, sans construire de maillage 3D complet) plutôt que sur les
   seules étoiles déjà rendues, pour une portée de saut qui a du sens sans
   pour autant générer/dessiner une région jamais visitée (§23.4). */
const STAR_MAP_RADIUS = 5;
let starMapOpen = false;
let starMapCandidates = [];      /* étoiles candidates de la session en cours */
let starMapSelectedKey = null;   /* clé de cellule de l'étoile sélectionnée */
/* caméra libre de la carte : coordonnées sphériques autour du vaisseau,
   pas de THREE.OrbitControls (non chargé) — même esprit que le regard
   libre déjà en place (§4), juste appliqué à une caméra dédiée plutôt
   qu'à la caméra de jeu. */
let mapCamYaw = 0.6, mapCamPitch = 0.5, mapCamDist = 1400;
let mapScene = null, mapCamera = null;
let mapDragging = false, mapLastX = 0, mapLastY = 0;
/* rotation automatique après inactivité (demande utilisateur) : très
   lente, seulement le temps que la souris ne bouge pas sur la carte —
   reprend la main dès le moindre mouvement ou molette, sans geste
   particulier pour la couper. */
const MAP_AUTOROTATE_DELAY = 5, MAP_AUTOROTATE_SPEED = 0.035;
let mapIdleTimer = 0;
/* séquence de saut (§23.5) : machine à états à trois phases, mise à jour
   dans la boucle principale (updateFlight) — non interruptible, comme la
   mise en orbite. jumpState.phase vaut null hors séquence. */
let jumpState = null;
const JUMP_CHARGE_DURATION = 0.4, JUMP_STRETCH_DURATION = 0.5, JUMP_FLASH_DURATION = 0.15;
function quantumJumpFuelCost(distance){
  /* §23.2 : exactement le coût d'un trajet en croisière normale — le
     régime de la formule de consommation (§22.2) vaut 1 par construction
     au ratio vitesse/croisière = 1, donc coût = distance × 1. L'intérêt du
     module est le temps gagné, pas le carburant économisé. */
  return distance;
}

/* ---------- constitution de la liste de cibles (§23.4) ----------
   S'appuie sur starDataForCell() directement — un pur calcul déterministe,
   sans construire de maillage 3D — plutôt que sur les seules étoiles déjà
   RENDUES (starField, fenêtre glissante bien plus étroite, §2). La portée
   de saut peut ainsi dépasser ce qui est affiché à l'écran sans pour
   autant générer une région jamais visitée : la donnée existe déjà,
   seule sa matérialisation graphique est différée. Le volume brut
   (STAR_MAP_RADIUS élargi) est ensuite réduit aux plus proches : sans ce
   plafond, une carte à 5 cellules de rayon proposerait plusieurs centaines
   d'étoiles, illisible. */
const STAR_MAP_MAX_CANDIDATES = 24;
function collectStarMapCandidates(){
  const p = shipRig.position;
  const cx = Math.round(p.x/STAR_CELL), cy = Math.round(p.y/STAR_CELL), cz = Math.round(p.z/STAR_CELL);
  const list = [];
  for(let dx=-STAR_MAP_RADIUS; dx<=STAR_MAP_RADIUS; dx++){
    for(let dy=-STAR_MAP_RADIUS; dy<=STAR_MAP_RADIUS; dy++){
      for(let dz=-STAR_MAP_RADIUS; dz<=STAR_MAP_RADIUS; dz++){
        const data = starDataForCell(cx+dx, cy+dy, cz+dz);
        if(!data) continue;
        list.push({
          key: data.cell, position: data.position.clone(), name: data.name, star: data.star,
          dist: data.position.distanceTo(p), built: starField.has(data.cell)
        });
      }
    }
  }
  list.sort(function(a,b){ return a.dist - b.dist; });
  return list.slice(0, STAR_MAP_MAX_CANDIDATES);
}

/* ---------- scène dédiée de la carte (§23.3) ----------
   Marqueurs simples (sphères), pas les maillages étoile réels (shaders +
   halo additif) : bien moins coûteux à instancier pour ~24 candidates, et
   plus proche de la maquette filaire (§22.5/§23.6) — construite (pleine),
   à portée non construite (fil de fer), sélection (anneau). Rendue à la
   place de la scène de jeu tant que la carte est ouverte (cf. animate()),
   pas un second contexte WebGL. */
const starMapRaycaster = new THREE.Raycaster();
/* étiquettes HTML de la carte (noms + repères de grille) — même principe
   que #starLabels (position:fixed + projection écran), conteneur séparé
   nettoyé à chaque fermeture de la carte plutôt que des éléments qui
   s'accumuleraient d'une ouverture à l'autre. */
let starMapLabelEls = [];
function clearStarMapLabels(){
  starMapLabelEls.forEach(function(l){ l.el.remove(); });
  starMapLabelEls = [];
}
function addStarMapLabel(text, worldPos, cls, rich){
  const el = document.createElement('div');
  el.className = cls;
  if(rich){
    /* cercle + flèche + nom, comme les étiquettes du jeu (createStarLabel)
       — réutilise directement les mêmes classes CSS (.star-ring/.star-
       arrow/.star-text), ce conteneur-ci (#starMapLabels) leur est
       indifférent, seule compte la classe. Taille fixe (cf. commentaire
       d'appel) plutôt que le calcul dynamique de projectShipLabel. */
    el.innerHTML = '<span class="star-ring"></span><span class="star-arrow"></span><span class="star-text"></span>';
    el.querySelector('.star-text').textContent = text;
  } else {
    el.textContent = text;
  }
  document.getElementById('starMapLabels').appendChild(el);
  starMapLabelEls.push({el:el, pos:worldPos});
}
function updateStarMapLabels(){
  if(!mapCamera) return;
  const w = window.innerWidth, h = window.innerHeight;
  starMapLabelEls.forEach(function(l){
    const p = l.pos.clone().project(mapCamera);
    if(p.z > 1){ l.el.style.display = 'none'; return; }
    l.el.style.display = 'block';
    l.el.style.left = ((p.x*0.5+0.5)*w)+'px';
    l.el.style.top = ((1-(p.y*0.5+0.5))*h)+'px';
  });
}
function buildStarMapScene(){
  mapScene = new THREE.Scene();
  clearStarMapLabels();
  const center = shipRig.position.clone();

  /* le vaisseau du joueur, représenté par une miniature du VRAI modèle
     plutôt qu'un simple repère géométrique (demande utilisateur) : clone
     du groupe visuel shipMesh (buildShip) — géométries et matériaux
     réutilisés par référence (comportement par défaut de .clone(true),
     pas de copie profonde), donc aucun coût de génération des textures de
     coque une seconde fois. Les halos moteurs de l'original ne sont
     référencés que par window.__engineGlows (une liste d'objets
     précis) : le clone n'y figure pas, ses propres halos restent donc
     immobiles — sans incidence puisqu'une miniature statique n'a pas
     besoin de scintiller. shipMesh utilise des MeshStandardMaterial
     (éclairés) : sans lumière dans cette scène dédiée, le clone
     resterait quasi noir — cf. les deux lumières ajoutées plus bas. */
  const shipMarker = shipMesh.clone(true);
  mapScene.add(shipMarker);
  mapScene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const mapSunLight = new THREE.DirectionalLight(0xfff4e0, 0.9);
  mapSunLight.position.set(60, 90, 40);
  mapScene.add(mapSunLight);

  /* étiquette du vaisseau : même vocabulaire visuel que dans le jeu
     (cercle + flèche + nom, .ship-label) plutôt qu'un simple texte comme
     pour les étoiles (demande utilisateur) — taille fixe, la carte se
     zoome librement contrairement à la caméra de jeu dont la formule de
     dimensionnement (projectShipLabel) suppose une distance de vue bien
     plus stable. */
  addStarMapLabel(SHIP_REGISTRY, new THREE.Vector3(0, 0, 0), 'star-label ship-label starmap-ship-label', true);

  /* empreinte au sol (X/Z) des candidates + hauteur moyenne, pour
     dimensionner la grille et placer son plan (demande utilisateur) */
  let minX=0, maxX=0, minZ=0, maxZ=0, sumY=0, maxDist=600;
  starMapCandidates.forEach(function(c){
    const rel = c.position.clone().sub(center);
    c.rel = rel;
    minX = Math.min(minX, rel.x); maxX = Math.max(maxX, rel.x);
    minZ = Math.min(minZ, rel.z); maxZ = Math.max(maxZ, rel.z);
    sumY += rel.y;
    maxDist = Math.max(maxDist, rel.length());
  });
  const planeY = starMapCandidates.length ? sumY/starMapCandidates.length : 0;

  /* grille de référence, fine et blanche, sur un plan horizontal centré
     sur les étoiles (demande utilisateur) — cellules d'environ 220 u,
     taille arrondie au nombre de divisions le plus proche pour que les
     repères lettrés tombent pile sur les lignes. */
  const half = Math.max(maxX-minX, maxZ-minZ, 400)/2*1.3;
  const divisions = Math.min(20, Math.max(6, Math.round(half*2/220)));
  const gridSize = divisions*220;
  const gridHelper = new THREE.GridHelper(gridSize, divisions, 0xffffff, 0xffffff);
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = 0.3;
  gridHelper.position.y = planeY;
  mapScene.add(gridHelper);

  /* repères lettrés le long d'un bord de la grille (A, B, C…) */
  const step = gridSize/divisions;
  for(let i=0;i<=divisions;i++){
    const letter = String.fromCharCode(65 + Math.min(25, i));
    const gx = -gridSize/2 + i*step;
    addStarMapLabel(letter, new THREE.Vector3(gx, planeY, -gridSize/2 - 26), 'starmap-grid-letter');
  }

  starMapCandidates.forEach(function(c){
    const rel = c.rel;
    const color = new THREE.Color(c.star.color.r, c.star.color.g, c.star.color.b);

    /* étoile rendue COMME dans le jeu principal (même shader cœur +
       même halo additif, buildStarCell) mais à une échelle réduite,
       adaptée au recul de la carte — un rayon « au sens du jeu » serait
       ici quasi invisible, une échelle réaliste serait illisible. Les
       systèmes non encore construits restent visuellement présents mais
       plus discrets (cœur et halo réduits) plutôt qu'un simple fil de
       fer, pour garder le même langage visuel que le jeu partout. */
    const baseCore = 7 + (c.built ? 4 : 0);
    const coreMat = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
      uniforms:{
        baseColor:{value:color},
        limbU:{value: 0.45 + 0.3*Math.exp(-c.star.temp/9000)},
        time:{value:0},
        granulation:{value: c.star.temp < 7000 ? 1.0 : 0.25},
        seed:{value: Math.abs(c.key.split(',').reduce(function(a,v){ return a+parseInt(v,10); },0)) % 97 / 97}
      }
    });
    const core = new THREE.Mesh(new THREE.SphereGeometry(baseCore, 16, 16), coreMat);
    core.position.copy(rel);
    mapScene.add(core);
    c.coreMat = coreMat;

    const haloMat = new THREE.SpriteMaterial({
      map:glowTex, color:color, transparent:true, depthWrite:false,
      blending:THREE.AdditiveBlending, opacity: c.built ? 1 : 0.5
    });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.setScalar(baseCore*(c.built ? 4.4 : 3.2));
    halo.position.copy(rel);
    mapScene.add(halo);

    /* cible de clic généreuse, découplée de la taille visuelle du cœur —
       une sphère invisible mais bien réelle pour le lancer de rayon
       (raycaster ignore seulement les objets visible:false, pas
       l'opacité), sans quoi cliquer une petite étoile deviendrait
       pénible une fois le cœur réduit à l'échelle carte. */
    const hitMat = new THREE.MeshBasicMaterial({transparent:true, opacity:0});
    const hitSphere = new THREE.Mesh(new THREE.SphereGeometry(26, 8, 8), hitMat);
    hitSphere.position.copy(rel);
    hitSphere.userData.candidateKey = c.key;
    mapScene.add(hitSphere);
    c.mesh = hitSphere;

    /* ligne pointillée jusqu'au plan de référence, couleur de l'étoile
       (demande utilisateur) — matérialise sa hauteur au-dessus/en dessous
       du plan, comme un fil à plomb. */
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      rel.clone(), new THREE.Vector3(rel.x, planeY, rel.z)
    ]);
    const lineMat = new THREE.LineDashedMaterial({color:color, dashSize:9, gapSize:7, transparent:true, opacity:0.75});
    const dropLine = new THREE.Line(lineGeo, lineMat);
    dropLine.computeLineDistances();
    mapScene.add(dropLine);

    const ringGeo = new THREE.RingGeometry(baseCore*1.7, baseCore*2.0, 24);
    const ringMat = new THREE.MeshBasicMaterial({color:0xffb454, side:THREE.DoubleSide, transparent:true, opacity:0});
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(rel);
    mapScene.add(ring);
    c.selectionRing = ring;

    /* étiquette de nom (demande utilisateur) — sur chaque étoile, discrète */
    addStarMapLabel(c.name, rel.clone().add(new THREE.Vector3(0, -baseCore*1.4, 0)), 'starmap-label');
  });

  mapCamYaw = 0.6; mapCamPitch = 0.5; mapCamDist = maxDist*1.35;
  mapCamera = new THREE.PerspectiveCamera(55, window.innerWidth/window.innerHeight, 1, 200000);
  updateMapCameraFromSpherical();
}
function updateMapCameraFromSpherical(){
  if(!mapCamera) return;
  mapCamPitch = THREE.MathUtils.clamp(mapCamPitch, -1.4, 1.4);
  mapCamDist = THREE.MathUtils.clamp(mapCamDist, 200, 60000);
  const cp = Math.cos(mapCamPitch);
  mapCamera.position.set(
    mapCamDist*cp*Math.sin(mapCamYaw),
    mapCamDist*Math.sin(mapCamPitch),
    mapCamDist*cp*Math.cos(mapCamYaw)
  );
  mapCamera.lookAt(0,0,0);
}
function selectStarMapCandidate(key){
  starMapCandidates.forEach(function(c){
    if(c.selectionRing) c.selectionRing.material.opacity = (c.key === key) ? 1 : 0;
  });
  starMapSelectedKey = key;
  refreshStarMapSidePanel();
}
function refreshStarMapSidePanel(){
  const bodyEl = document.getElementById('starMapTargetBody');
  const btn = document.getElementById('starMapConfirmBtn');
  if(!bodyEl || !btn) return;
  const target = starMapCandidates.find(function(c){ return c.key === starMapSelectedKey; });
  if(!target){
    bodyEl.innerHTML = '<div class="starmap-empty" id="lblStarMapNone">'+t('starMapNone')+'</div>';
    btn.style.display = 'none';
    return;
  }
  const dist = target.position.distanceTo(shipRig.position);
  const cost = Math.round(quantumJumpFuelCost(dist));
  bodyEl.innerHTML =
    '<div class="starmap-target-name">'+target.name+'</div>'
    + '<div class="starmap-target-line">'+target.star.designation+'</div>'
    + '<div class="starmap-target-line">'+t('starMapDist')+' '+Math.round(dist)+' u</div>'
    + '<div class="starmap-target-line">'+t('starMapFuelCost')+' \u2248 '+cost+' u</div>';
  btn.style.display = 'block';
  if(!hasQuantumJump){
    btn.textContent = SHIP_CAN_JUMP ? t('starMapNeedsModule') : t('starMapLongHaulOnly');
    btn.classList.add('starmap-disabled');
  } else if(cost > fuel){
    btn.textContent = t('starMapNotEnoughFuel');
    btn.classList.add('starmap-disabled');
  } else {
    btn.textContent = t('starMapConfirm');
    btn.classList.remove('starmap-disabled');
  }
}
function openStarMap(){
  /* la carte reste consultable sans le module (§23.3) — seule la
     confirmation de saut se verrouille, cf. refreshStarMapSidePanel().
     Non ouvrable pendant une manœuvre d'orbite/livraison en cours : sauter
     au milieu d'une livraison (navettes en vol) n'a pas de sens propre. */
  if(starMapOpen || gamePaused || flightPhase === 'ARRIVAL_PAUSE' || jumpState || !gameStarted) return;
  enterPause();
  document.body.classList.add('starmap-open');
  const pauseOv = document.getElementById('pauseOverlay');
  if(pauseOv) pauseOv.classList.remove('visible');
  starMapOpen = true;
  starMapSelectedKey = null;
  mapIdleTimer = 0;
  starMapCandidates = collectStarMapCandidates();
  buildStarMapScene();
  const lockedBox = document.getElementById('starMapLockedBox');
  if(lockedBox) lockedBox.style.display = hasQuantumJump ? 'none' : 'block';
  if(lockedBox && !SHIP_CAN_JUMP) lockedBox.textContent = t('starMapLongHaulOnly');
  refreshStarMapSidePanel();
  const overlay = document.getElementById('starMapOverlay');
  if(overlay) overlay.classList.add('visible');
}
function closeStarMap(){
  if(!starMapOpen) return;
  starMapOpen = false;
  clearStarMapLabels();
  mapScene = null; mapCamera = null;
  document.body.classList.remove('starmap-open');
  const overlay = document.getElementById('starMapOverlay');
  if(overlay) overlay.classList.remove('visible');
  resumeGame();
}
function confirmQuantumJump(){
  const target = starMapCandidates.find(function(c){ return c.key === starMapSelectedKey; });
  if(!target || !hasQuantumJump) return;
  const dist = target.position.distanceTo(shipRig.position);
  const cost = quantumJumpFuelCost(dist);
  if(cost > fuel) return;
  /* point d'arrivée (§23.4) : pas le centre de l'étoile elle-même — le
     long de l'axe qu'on vient de viser sur la carte, en s'arrêtant à
     bonne distance de sécurité (proportionnelle au rayon stellaire réel,
     jamais moins de 400 u). */
  const dir = target.position.clone().sub(shipRig.position).normalize();
  const safeDist = Math.max(400, target.star.radius*4);
  const arrivalPos = target.position.clone().addScaledVector(dir, -safeDist);
  closeStarMap();
  jumpState = { phase:'charge', t:0, targetPos:arrivalPos, fuelCost:cost, teleported:false };
}
function performQuantumTeleport(js){
  fuel = Math.max(0, fuel - js.fuelCost);
  shipRig.position.copy(js.targetPos);
  refreshField(STAR_CELL, STAR_RADIUS, starField, buildStarCell);
  refreshField(NEBULA_CELL, NEBULA_RADIUS, nebulaField, buildNebulaCell);
  const curFwd = new THREE.Vector3(0,0,-1).applyQuaternion(shipRig.quaternion);
  computeRoute(shipRig.position, curFwd, false);
  /* recale les variables de suivi de caméra sur la nouvelle position —
     sans quoi la poursuite normale, en reprenant après la séquence,
     « rattraperait » le vaisseau depuis son ancienne position à travers
     tout l'écran d'un coup. */
  camPos.copy(shipRig.position).add(CAM_OFFSET.clone().applyQuaternion(shipRig.quaternion));
  camLook.copy(shipRig.position).add(new THREE.Vector3(0,0,-45).applyQuaternion(shipRig.quaternion));
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}
/* ---------- séquence visuelle du saut (§23.5) ----------
   Trois phases, appelées depuis updateFlight() (cf. plus bas) tant que
   jumpState n'est pas nul — non interruptible, comme la mise en orbite.
   Réutilise des éléments déjà en place (halo des réacteurs, .speedlines
   du boost) plutôt qu'un nouveau système de particules. */
/* ---------- SAUT QUANTIQUE v2.13 : déformation de l'espace-temps ----------
   Réservé aux long-courriers (anneaux de distorsion). Pendant la seule durée
   du saut, la scène est rendue dans une texture puis déviée en plein écran
   (lentille gravitationnelle, tourbillon, irisation, anneau lumineux, onde de
   choc) ; la zone du vaisseau reste nette — c'est l'espace qui se plie
   autour de lui. Hors saut : un seul rendu, aucun surcoût. */
let WARP_THR = null, WARP_SPIN = 1, WARP_LEVEL = 0;
const WARP_T = { charge:1.8, fold:1.0, flash:0.3, wave:1.3 };
const WARP_LENS_FS = `precision highp float; uniform sampler2D tScene; uniform vec2 uCenter; uniform float uAspect; uniform float uR;
uniform float uLens; uniform float uRipple; uniform float uRippleAmp; uniform float uFlash; uniform float uChroma;
varying vec2 vUv;
vec2 warp(vec2 uv, float s){
  vec2 d = uv - uCenter; d.x *= uAspect;
  float r = length(d) + 1e-5; vec2 dir = d/r;
  float mask = smoothstep(uR*0.7, uR*1.5, r);
  float defl = uLens*s*mask*uR*uR/(r + uR*0.3);
  float sw = uLens*s*mask*0.9*exp(-r/(uR*1.8));
  vec2 rot = vec2(dir.x*cos(sw) - dir.y*sin(sw), dir.x*sin(sw) + dir.y*cos(sw));
  float dr = r - uRipple;
  float rip = uRippleAmp*sin(dr*70.0)*exp(-dr*dr*220.0);
  vec2 p = rot*max(0.0, r - defl + rip); p.x /= uAspect;
  return uCenter + p;
}
void main(){
  vec3 col = vec3(texture2D(tScene, warp(vUv, 1.0 + uChroma)).r, texture2D(tScene, warp(vUv, 1.0)).g, texture2D(tScene, warp(vUv, 1.0 - uChroma)).b);
  vec2 d = vUv - uCenter; d.x *= uAspect; float r = length(d);
  float e = (r - uR*1.25)/(uR*0.1);
  col += vec3(0.55, 0.45, 1.0)*exp(-e*e)*uLens*0.6;
  col += vec3(0.85, 0.9, 1.0)*(uFlash*1.6*exp(-r*r/(uR*uR*3.0)) + uFlash*0.12);
  gl_FragColor = vec4(col, 1.0);
}`;
const WARP = { active:false, rt:null, scene:new THREE.Scene(), cam:new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
WARP.mat = new THREE.ShaderMaterial({
  uniforms:{ tScene:{value:null}, uCenter:{value:new THREE.Vector2(0.5, 0.5)}, uAspect:{value:1}, uR:{value:0.1}, uLens:{value:0},
             uRipple:{value:0}, uRippleAmp:{value:0}, uFlash:{value:0}, uChroma:{value:0} },
  vertexShader:'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader:WARP_LENS_FS, depthTest:false, depthWrite:false });
WARP.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), WARP.mat));
function renderMain(){
  if(!WARP.active){ renderer.render(scene, camera); return; }
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  if(!WARP.rt || WARP.rt.width !== size.x || WARP.rt.height !== size.y){
    if(WARP.rt) WARP.rt.dispose();
    WARP.rt = new THREE.WebGLRenderTarget(size.x, size.y); WARP.rt.texture.encoding = renderer.outputEncoding;
  }
  const u = WARP.mat.uniforms, p = shipRig.position.clone().project(camera);
  u.uCenter.value.set(p.x*0.5 + 0.5, p.y*0.5 + 0.5); u.uAspect.value = camera.aspect;
  u.uR.value = (SHIP_GAME_LEN*0.38)/(2*Math.tan(camera.fov*Math.PI/360)*Math.max(1, camera.position.distanceTo(shipRig.position)));
  renderer.setRenderTarget(WARP.rt); renderer.render(scene, camera); renderer.setRenderTarget(null);
  u.tScene.value = WARP.rt.texture; renderer.render(WARP.scene, WARP.cam);
}
function warpSmooth(x){ x = Math.max(0, Math.min(1, x)); return x*x*(3 - 2*x); }
function endWarpJump(){
  WARP.active = false; WARP_THR = null; WARP_SPIN = 1; SHIPGEN.JUMP_U.uCharge.value = 0; shipMesh.scale.set(1, 1, 1);
  const u = WARP.mat.uniforms; u.uLens.value = u.uRipple.value = u.uRippleAmp.value = u.uFlash.value = u.uChroma.value = 0;
  ['jumpVignette', 'jumpFlash', 'speedlines'].forEach(function(id){ const el = document.getElementById(id); if(el) el.style.opacity = '0'; });
  const banner = document.getElementById('jumpBanner'); if(banner) banner.style.display = 'none';
  jumpState = null;
}
function updateJumpSequence(dt){
  jumpState.t += dt; WARP_LEVEL = 0;
  const tt = jumpState.t, T1 = WARP_T.charge, T2 = T1 + WARP_T.fold, T3 = T2 + WARP_T.flash, T4 = T3 + WARP_T.wave;
  const banner = document.getElementById('jumpBanner'), vignette = document.getElementById('jumpVignette'), flashEl = document.getElementById('jumpFlash');
  if(banner){ banner.style.display = 'block'; banner.textContent = t('jumpBannerText'); }
  let field = 0, lens = 0, stretch = 0, flash = 0, ripple = 0, rAmp = 0, chroma = 0, thr = 0.05, vig = 0.45, spin = 1;
  if(tt < T1){            /* charge : moteurs coupés, anneaux qui montent en régime, bulle */
    const k = warpSmooth(tt/T1); field = k; spin = 1 + 5*k; lens = 0.12*warpSmooth((tt - 0.8)/(T1 - 0.8));
    thr = 0.05 + 0.3*(1 - k); vig = 0.45*k;
  } else if(tt < T2){     /* pli : l'espace se creuse autour du vaisseau, qui s'étire */
    const e = Math.pow((tt - T1)/WARP_T.fold, 2); field = 1 + 0.8*e; spin = 6 + 12*e; lens = 0.12 + 0.88*e; stretch = e; chroma = 0.015 + 0.05*e;
  } else if(tt < T3){     /* saut : éclair, téléportation au milieu */
    const k = (tt - T2)/WARP_T.flash; flash = Math.sin(k*Math.PI);
    if(!jumpState.teleported && k >= 0.5){ shipMesh.scale.set(1, 1, 1); performQuantumTeleport(jumpState); jumpState.teleported = true; }
    stretch = jumpState.teleported ? 0 : 1 + k; lens = jumpState.teleported ? 0.8 : 1; field = jumpState.teleported ? 0.6 : 1.8; spin = 18;
    ripple = jumpState.teleported ? 0.02 : 0; rAmp = 0.03; chroma = 0.06;
  } else if(tt < T4){     /* onde : à l'arrivée, l'espace se relâche */
    const k = (tt - T3)/WARP_T.wave; lens = 0.8*(1 - warpSmooth(k)); ripple = 0.02 + 1.3*k; rAmp = 0.03*(1 - k);
    chroma = 0.04*(1 - k); field = 0.6*(1 - k); thr = 0.05 + 0.3*warpSmooth(k); vig = 0.45*(1 - k);
  } else { endWarpJump(); return; }
  WARP.active = true; WARP_THR = thr; WARP_SPIN = spin;
  SHIPGEN.JUMP_U.uCharge.value = field;
  const sz = 1 + 1.3*stretch, sxy = 1/(1 + 0.5*stretch); shipMesh.scale.set(sxy, sxy, sz);
  const u = WARP.mat.uniforms; u.uLens.value = lens; u.uRipple.value = ripple; u.uRippleAmp.value = rAmp; u.uFlash.value = flash*0.9; u.uChroma.value = chroma;
  if(vignette) vignette.style.opacity = String(vig);
  if(flashEl) flashEl.style.opacity = String(flash*0.5);
}
/* ---------- interaction souris sur la carte (glisser = orbite, molette =
   zoom, clic = sélection, double-clic = confirmation directe) ---------- */
(function initStarMapInteraction(){
  const vp = document.getElementById('starMapViewport');
  if(!vp) return;
  vp.addEventListener('pointerdown', function(e){
    mapDragging = true; mapLastX = e.clientX; mapLastY = e.clientY;
  });
  window.addEventListener('pointerup', function(){ mapDragging = false; });
  window.addEventListener('pointermove', function(e){
    if(!mapDragging || !starMapOpen) return;
    mapIdleTimer = 0;
    const dx = e.clientX - mapLastX, dy = e.clientY - mapLastY;
    mapLastX = e.clientX; mapLastY = e.clientY;
    mapCamYaw -= dx*0.006;
    mapCamPitch += dy*0.006;
    updateMapCameraFromSpherical();
  });
  /* simple survol (sans glisser) compte aussi comme une présence — remet
     à zéro le minuteur d'inactivité qui déclenche la rotation auto,
     séparément du glisser ci-dessus qui gère en plus l'orbite elle-même. */
  vp.addEventListener('pointermove', function(){
    if(starMapOpen) mapIdleTimer = 0;
  });
  vp.addEventListener('wheel', function(e){
    if(!starMapOpen) return;
    e.preventDefault();
    mapIdleTimer = 0;
    mapCamDist *= (e.deltaY > 0 ? 1.12 : 0.89);
    updateMapCameraFromSpherical();
  }, {passive:false});
  function pickAt(clientX, clientY){
    if(!mapCamera) return null;
    const rect = vp.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX-rect.left)/rect.width)*2-1,
      -((clientY-rect.top)/rect.height)*2+1
    );
    starMapRaycaster.setFromCamera(ndc, mapCamera);
    const meshes = starMapCandidates.map(function(c){ return c.mesh; }).filter(Boolean);
    const hits = starMapRaycaster.intersectObjects(meshes);
    return hits.length ? hits[0].object.userData.candidateKey : null;
  }
  vp.addEventListener('click', function(e){
    if(!starMapOpen) return;
    const key = pickAt(e.clientX, e.clientY);
    if(key) selectStarMapCandidate(key);
  });
  vp.addEventListener('dblclick', function(e){
    if(!starMapOpen) return;
    const key = pickAt(e.clientX, e.clientY);
    if(key){ selectStarMapCandidate(key); confirmQuantumJump(); }
  });
  const confirmBtn = document.getElementById('starMapConfirmBtn');
  if(confirmBtn) confirmBtn.addEventListener('click', function(e){
    e.stopPropagation();
    if(!confirmBtn.classList.contains('starmap-disabled')) confirmQuantumJump();
  });
})();
const CAM_OFFSET = new THREE.Vector3(0, 12, 46);
let camPos = new THREE.Vector3(0, 12, 46);
let camLook = new THREE.Vector3(0,0,-40);

/* ---------- pause d'arrivée : mise en orbite + livraison ----------
   À la fin d'un itinéraire, le vaisseau ne s'arrête plus sur place : il
   entre en orbite autour de la planète de destination pour un tour complet,
   le temps que de petites navettes transfèrent quelques conteneurs vers le
   port spatial. Le prochain itinéraire est calculé pendant la manœuvre. */
let flightPhase = 'CRUISE';           /* 'CRUISE' | 'ARRIVAL_PAUSE' */
let pauseTimer = 0;
/* La phase d'approche est volontairement plus lente que le reste du vol :
   on doit avoir le temps de VOIR le déchargement des conteneurs, pas
   juste le deviner entre deux plans qui défilent trop vite. */
const ARRIVAL_PAUSE_DURATION = 36;    /* durée d'un tour d'orbite complet — allongée pour
                                          des navettes bien plus lentes (cf. §ci-dessous),
                                          coordonnées avec les échanges radio */
const ARRIVAL_FF_SCALE = 4.5;         /* facteur d'accélération en mode abrégé */
let arrivalSkip = false;              /* déclenché par la touche d'abrégé (Entrée) */
let arrivalTimeScale = 1;             /* lu par updateShuttles(), hors de updateFlight */
const CUTAWAY_DURATION = 7.4;         /* chargement (3.4s) + suivi du départ (4.0s) — cf. SHUTTLE_CLOSEUP_DURATION plus bas ; reste sous l'écart entre deux largages (~7.9s) pour ne jamais chevaucher le suivant */
const ORBIT_CAPTURE_TIME = 5.5;       /* fondu d'entrée sur le cercle d'orbite — allongé
                                          (était 1.3s : un cargo de cette masse "s'insérait"
                                          en orbite en un claquement de doigts, ressenti comme
                                          bien trop brutal — bug remonté en jeu) */

/* =========================================================================
   ÉCONOMIE — crédits
   Chaque escale livre 1 à 5 conteneurs, répartis entre les navettes
   réellement larguées. Point important de cohérence : c'est CETTE
   répartition qui alimente à la fois le dialogue radio (qui annonce un
   nombre de conteneurs par navette) et le gain de crédits — un second
   tirage indépendant ferait dire à l'équipage des chiffres sans rapport
   avec ce qui est effectivement crédité.
   ========================================================================= */
let credits = 10000;
let creditsFlashTimer = null;
function formatCredits(n){
  try { return Math.round(n).toLocaleString(t('ttsLang') || 'fr-FR'); }
  catch(e){ return String(Math.round(n)); }
}
function refreshCreditsDisplay(flash){
  const el = document.getElementById('creditsVal');
  if(!el) return;
  el.textContent = formatCredits(credits);
  if(flash){
    el.style.color = 'var(--amber)';
    if(creditsFlashTimer) clearTimeout(creditsFlashTimer);
    creditsFlashTimer = setTimeout(function(){ el.style.color = ''; }, 1500);
  }
}
function addCredits(amount){
  credits = Math.max(0, credits + amount);
  refreshCreditsDisplay(amount > 0);
  if(typeof refreshPortPanel === 'function') refreshPortPanel();
}

const orbitState = {
  active:false, planet:null, center:new THREE.Vector3(),
  radius:0, U:new THREE.Vector3(), V:new THREE.Vector3(), N:new THREE.Vector3(),
  startPos:new THREE.Vector3(), startQuat:new THREE.Quaternion(),
  camPhase0:0, shuttles:[], spawned:[false,false,false],
  spawnFractions:[0.08,0.30,0.52],
  radioScript:[], radioIdx:0,
  voiceGender:{ship:'male', tower:'female'},
  /* répartition des conteneurs par navette + prix unitaire de l'escale */
  cargoSplit:[], unitPrice:0, creditsPaid:false,
  cutawayUntil:-1,  /* valeur de pauseTimer jusqu'à laquelle le plan large reste actif */
  cutawaySeq:null,  /* séquence de plans en cours ('lateral'|'face'|'travelling'|'shoulder') */
  cutawayStart:0,   /* pauseTimer au déclenchement, pour interpoler la progression de la séquence */
  cutawayShuttleId:-1,  /* identifie la navette suivie, pour ne pas en changer en cours de plan */
  cutawayCut:false  /* la coupure franche gros-plan -> suivi n'a lieu qu'une fois par séquence */
};

/* =========================================================================
   CANAL RADIO — échanges équipage / contrôle du port pendant l'approche
   Un script de messages horodatés (fraction de la durée de l'orbite),
   généré depuis le seed de la planète : demande d'autorisation, coordination
   des transferts de conteneurs (calée sur les largages de navettes),
   échange technique sur les navettes, puis remerciements de clôture.
   ========================================================================= */
/* message de bienvenue du capitaine — amélioration demandée : joué une
   seule fois, juste après le premier calcul de route (startGame), avant
   toute escale. Réutilise le même panneau/la même voix que le reste du
   canal radio plutôt qu'un mécanisme séparé. */
function showWelcomeMessage(){
  const R = RADIO_TEMPLATES[LANG] || RADIO_TEMPLATES.fr;
  if(!R.welcome) return;
  const rng = rngFor(SEED+':welcome');
  const text = R.welcome(SHIP_REGISTRY)[Math.floor(rng()*R.welcome(SHIP_REGISTRY).length)];
  const radioLog = document.getElementById('radioLog');
  if(radioLog) radioLog.innerHTML = '';
  const radioPanel = document.getElementById('radioPanel');
  if(radioPanel) radioPanel.classList.add('visible');
  repositionRadioPanel();
  if(typeof refreshHudIconBar === 'function') refreshHudIconBar();
  appendRadioLine({ from:'ship', label:SHIP_REGISTRY, text:text });
}
function buildRadioScript(planet){
  const rng = rngFor(SEED+':radio:'+planet.seedNoise);
  function pick(arr){ return arr[Math.floor(rng()*arr.length)]; }
  const R = RADIO_TEMPLATES[LANG] || RADIO_TEMPLATES.fr;
  const tower = R.towerName(planet.cityName);
  const ship = SHIP_REGISTRY;
  const msgs = [];

  /* 1. demande d'autorisation d'approche */
  msgs.push({t:0.02, from:'ship', label:ship, text: pick(R.hail(tower,ship))});
  msgs.push({t:0.08, from:'tower', label:tower, text: pick(R.hailReply(tower,ship,planet.cityName))});

  /* 2. coordination des transferts de conteneurs, calée sur les navettes */
  orbitState.spawnFractions.forEach(function(f, i){
    const label = R.shuttleLabel(i+1);
    /* le nombre annoncé est celui RÉELLEMENT attribué à cette navette */
    const n = orbitState.cargoSplit[i] || 0;
    if(n <= 0) return;   /* navette sans fret : pas d'annonce de largage */
    msgs.push({t:f+0.015, from:'ship', label:ship, text: pick(R.dropoff(tower,ship,label,n))});
    msgs.push({t:f+0.06, from:'tower', label:tower, text: pick(R.dropoffReply(label))});
  });

  /* 3. échange technique lié aux mini-vaisseaux (navettes) */
  msgs.push({t:0.50, from:'tower', label:tower, text: pick(R.techQuery(ship))});
  msgs.push({t:0.55, from:'ship', label:ship, text: pick(R.techReply())});

  /* 4. remerciements de clôture */
  msgs.push({t:0.90, from:'tower', label:tower, text: pick(R.thanks(tower,ship))});
  msgs.push({t:0.95, from:'ship', label:ship, text: pick(R.thanksReply(tower,ship))});

  msgs.sort(function(a,b){ return a.t-b.t; });
  return msgs;
}
function repositionRadioPanel(){
  const panel = document.getElementById('radioPanel');
  const port = document.getElementById('portPanel');
  const nearest = document.getElementById('nearestPanel');
  if(!panel) return;
  /* le canal radio s'empile maintenant SOUS les services portuaires (ordre
     inversé, demande explicite) quand ce dernier est affiché ; sinon il
     reprend sa place historique sous « objet le plus proche ». Calculé
     dynamiquement contre le bas RÉEL de l'ancre (sa hauteur varie avec le
     contenu) plutôt qu'un décalage fixe, qui finissait par chevaucher. */
  const anchor = (port && getComputedStyle(port).display !== 'none') ? port : nearest;
  if(!anchor) return;
  const rect = anchor.getBoundingClientRect();
  panel.style.top = Math.round(rect.bottom + 14) + 'px';
}
function repositionPortPanel(){
  const panel = document.getElementById('portPanel');
  const nearest = document.getElementById('nearestPanel');
  if(!panel || !nearest) return;
  /* services portuaires EN PREMIER, juste sous « objet le plus proche »
     (ordre inversé par rapport à avant — demande explicite) ; le canal
     radio se recale ensuite à sa suite, cf. repositionRadioPanel. Bug
     corrigé au passage : les deux panneaux n'étaient repositionnés QUE
     lors de l'ouverture, jamais quand le contenu de l'un des deux
     grandissait ensuite (le journal radio, notamment) — d'où le
     chevauchement remonté en jeu. Chaque fonction redéclenche maintenant
     l'autre. */
  const rect = nearest.getBoundingClientRect();
  panel.style.top = Math.round(rect.bottom + 14) + 'px';
  repositionRadioPanel();
}
/* bug remonté en jeu : « le positionnement des panneaux se chevauche par
   moment » — la colonne de gauche (hud-left → hud-route) avait, elle, un
   décalage FIXE en CSS (top:210px), jamais recalculé quand hud-left change
   de hauteur réelle (retour à la ligne sur petit écran, panneau masqué via
   la barre du HUD, changement de langue…). Même patron que la colonne de
   droite : mesurer le bas RÉEL de l'ancre plutôt que deviner une valeur
   fixe. Un seul point d'entrée regroupe désormais TOUT le repositionnement
   de la pile de panneaux, pour être sûr qu'aucune combinaison de panneaux
   affichés/masqués ne puisse laisser une ancienne position obsolète. */
function repositionRoutePanel(){
  const left = document.querySelector('.hud-left');
  const route = document.getElementById('routePanel');
  if(!route) return;
  if(left && getComputedStyle(left).display !== 'none'){
    route.style.top = Math.round(left.getBoundingClientRect().bottom + 14) + 'px';
  } else {
    route.style.top = '64px';   /* hud-left masquée : reprend sa position d'origine */
  }
}
function repositionAllPanels(){
  repositionRoutePanel();
  repositionPortPanel();   /* enchaîne déjà repositionRadioPanel() */
  repositionCornerBottomPanels();
}
/* évite le chevauchement entre les deux panneaux bas-coin (itinéraire,
   Lagrange, §21) et la rangée basse CENTRÉE (température/propulsion/
   commandes, §8) — repéré sur une capture d'écran de documentation à
   1100px de large : la rangée centrée peut s'étendre assez pour mordre
   sur leur emplacement habituel, alors qu'à 1280px l'un et l'autre
   semblaient avoir assez de marge. On les remonte au-dessus d'elle plutôt
   que de les laisser se chevaucher. Repositionnement dynamique (mesuré),
   pas un simple seuil de largeur fixe : la largeur de la rangée centrée
   dépend aussi de QUELS panneaux elle contient à l'instant.

   Bug remonté en jeu (v2.6, ajout du carburant §22) : le panneau ITINÉRAIRE
   peut AUSSI chevaucher la pile de droite (objet proche → services
   portuaires → canal radio) sur une fenêtre basse — la pile s'est allongée
   avec la ligne carburant. Un premier correctif calculait le rehaussement
   nécessaire pour CHAQUE obstacle indépendamment puis gardait le plus
   grand des deux (Math.max) : ça suffit tant que « rehausser assez pour
   dégager le plus haut des deux obstacles » dégage AUSSI l'autre — faux ici,
   puisque la pile de droite est elle-même haute sur l'écran (elle part du
   HUD tout en haut) : un rehaussement dicté par la rangée du bas peut
   remonter l'itinéraire pile AU MILIEU de cette pile plutôt que
   d'en sortir. D'où une boucle courte qui revérifie la position réelle
   après chaque ajustement, contre les DEUX obstacles à chaque passage,
   plutôt qu'un calcul unique supposé valable d'un coup. */
function repositionCornerBottomPanels(){
  const row = document.querySelector('.hud-bottom-row');
  const itin = document.querySelector('.hud-itinerary');
  const lag = document.querySelector('.hud-lagrange');
  const MARGIN = 14;

  if(lag) lag.style.bottom = '';
  if(row && lag && !lag.classList.contains('panel-hidden')){
    const rowRect = row.getBoundingClientRect();
    const lagRect = lag.getBoundingClientRect();
    if(lagRect.right > rowRect.left - MARGIN){
      lag.style.bottom = ((window.innerHeight - rowRect.top) + MARGIN)+'px';
    }
  }

  if(!itin || itin.classList.contains('panel-hidden')) return;
  itin.style.bottom = '';
  for(let pass=0; pass<3; pass++){
    let moved = false;
    if(row){
      const rowRect = row.getBoundingClientRect();
      const itinRect = itin.getBoundingClientRect();
      const overlapsRow = itinRect.left < rowRect.right + MARGIN && itinRect.bottom > rowRect.top - MARGIN;
      if(overlapsRow){
        itin.style.bottom = ((window.innerHeight - rowRect.top) + MARGIN)+'px';
        moved = true;
      }
    }
    let stackBottom = 0, stackTop = Infinity;
    ['nearestPanel','portPanel','radioPanel'].forEach(function(id){
      const el = document.getElementById(id);
      if(!el || el.classList.contains('panel-hidden')) return;
      if(getComputedStyle(el).display === 'none') return;
      const r = el.getBoundingClientRect();
      if(r.bottom > stackBottom) stackBottom = r.bottom;
      if(r.top < stackTop) stackTop = r.top;
    });
    if(stackBottom > 0){
      const itinRect = itin.getBoundingClientRect();
      const overlapsStack = itinRect.top < stackBottom + MARGIN && itinRect.bottom > stackTop - MARGIN;
      if(overlapsStack){
        /* déjà sous le bas de la pile (cas courant) → juste dégager son bas ;
           déjà remonté AU-DESSUS de son haut (poussé là par la rangée du
           bas, cas rare mais celui qui a motivé cette boucle) → dégager
           son haut à la place, pas son bas, sans quoi on repousserait
           l'itinéraire droit dans la pile plutôt que hors d'elle. */
        const clearBelow = window.innerHeight - stackBottom - MARGIN - itinRect.height;
        const clearAbove = window.innerHeight - stackTop + MARGIN;
        const current = parseFloat(itin.style.bottom) || 0;
        let next = current < clearBelow ? clearBelow : clearAbove;
        /* garde-fou (fenêtre extrêmement basse, plusieurs panneaux ouverts
           à la fois) : ne jamais pousser le panneau au point de dépasser le
           HAUT de l'écran — un résidu de chevauchement, panneau entièrement
           visible, reste préférable à un panneau à moitié hors champ. Pas
           de solution parfaite dans ce cas extrême, un compromis assumé. */
        const minBottom = window.innerHeight - itinRect.height - 60;
        if(next > minBottom) next = minBottom;
        itin.style.bottom = next+'px';
        moved = true;
      }
    }
    if(!moved) break;
  }
}
function refreshPortPanel(){
  const dots = document.getElementById('portLevelDots');
  const btn = document.getElementById('portBuyBtn');
  if(!dots || !btn) return;
  let dotsStr = '';
  for(let i=0;i<SPEED_UPGRADE_MAX;i++){ dotsStr += (i < speedUpgradeLevel ? '\u25CF' : '\u25CB') + ' '; }
  dots.textContent = dotsStr.trim();
  btn.classList.remove('port-disabled', 'port-maxed');
  if(speedUpgradeLevel >= SPEED_UPGRADE_MAX){
    btn.textContent = t('portMaxLevel');
    btn.classList.add('port-maxed');
  } else {
    const cost = speedUpgradeCost(speedUpgradeLevel);
    btn.textContent = t('portUpgradeBtn') + ' \u2014 ' + formatCredits(cost) + ' CR';
    if(credits < cost) btn.classList.add('port-disabled');
  }
  refreshFuelPortRow();
  refreshJumpPortRow();
  repositionPortPanel();
}
/* ravitaillement (§22.3) : même panneau, même mécanisme d'activation que
   le reste des services portuaires (isNearPortService) — pas de condition
   séparée à maintenir. Facturé uniquement sur le volume manquant. */
function refreshFuelPortRow(){
  const pctEl = document.getElementById('fuelPortPct');
  const btn = document.getElementById('fuelBuyBtn');
  if(!pctEl || !btn) return;
  const ratio = fuel / FUEL_CAPACITY;
  pctEl.textContent = Math.round(ratio*100)+'%';
  btn.classList.remove('port-disabled', 'port-maxed');
  if(fuel >= FUEL_CAPACITY - 0.5){
    btn.textContent = t('portFuelFull');
    btn.classList.add('port-maxed');
  } else {
    const cost = fuelRefuelCost();
    btn.textContent = t('portFuelBtn') + ' \u2014 ' + formatCredits(cost) + ' CR';
    if(credits < cost) btn.classList.add('port-disabled');
  }
}
/* module de saut quantique (§23.1) : achat UNIQUE, pas de paliers — la
   ligne bascule définitivement sur « ACQUIS » une fois payée, jamais de
   retour en arrière (sauf nouvelle partie, §11). */
function refreshJumpPortRow(){
  const statusEl = document.getElementById('jumpPortStatus');
  const btn = document.getElementById('jumpBuyBtn');
  if(!statusEl || !btn) return;
  btn.classList.remove('port-disabled', 'port-maxed');
  if(!SHIP_CAN_JUMP){ statusEl.textContent = '\u2014'; btn.textContent = t('portJumpLongHaul'); btn.classList.add('port-disabled'); return; }
  if(hasQuantumJump){
    statusEl.textContent = '\u25CF';
    btn.textContent = t('portJumpAcquired');
    btn.classList.add('port-maxed');
  } else {
    statusEl.textContent = '\u25CB';
    btn.textContent = t('portJumpBtn') + ' \u2014 ' + formatCredits(QUANTUM_JUMP_PRICE) + ' CR';
    if(credits < QUANTUM_JUMP_PRICE) btn.classList.add('port-disabled');
  }
}
function buySpeedUpgrade(){
  if(speedUpgradeLevel >= SPEED_UPGRADE_MAX) return;
  const cost = speedUpgradeCost(speedUpgradeLevel);
  if(credits < cost) return;
  addCredits(-cost);
  speedUpgradeLevel++;
  refreshPortPanel();
}
function buyFuel(){
  if(fuel >= FUEL_CAPACITY - 0.5) return;
  const cost = fuelRefuelCost();
  if(credits < cost) return;
  addCredits(-cost);
  fuel = FUEL_CAPACITY;
  refreshPortPanel();
}
function buyQuantumJump(){
  if(hasQuantumJump || !SHIP_CAN_JUMP) return;
  if(credits < QUANTUM_JUMP_PRICE) return;
  addCredits(-QUANTUM_JUMP_PRICE);
  hasQuantumJump = true;
  refitJumpCore();
  refreshPortPanel();
}
(function initPortPanel(){
  const btn = document.getElementById('portBuyBtn');
  if(btn) btn.addEventListener('click', function(e){ e.stopPropagation(); buySpeedUpgrade(); });
  const fuelBtn = document.getElementById('fuelBuyBtn');
  if(fuelBtn) fuelBtn.addEventListener('click', function(e){ e.stopPropagation(); buyFuel(); });
  const jumpBtn = document.getElementById('jumpBuyBtn');
  if(jumpBtn) jumpBtn.addEventListener('click', function(e){ e.stopPropagation(); buyQuantumJump(); });
})();
const RADIO_AVATARS = {
  /* silhouette de capitaine (ambre) et d'antenne de tour (cyan) —
     amélioration demandée : identifier l'interlocuteur d'un coup d'œil,
     même vocabulaire de trait que les icônes de la barre du HUD. */
  ship:  '<circle cx="12" cy="8" r="4.2"/><path d="M4.5 20.5c0-4.4 3.3-7 7.5-7s7.5 2.6 7.5 7"/>',
  tower: '<path d="M9 21V10.5l3-7.5 3 7.5V21"/><path d="M5.5 21h13"/><circle cx="12" cy="5.5" r="1.3" fill="currentColor" stroke="none"/>'
};
function appendRadioLine(entry){
  const log = document.getElementById('radioLog');
  if(!log) return;
  const div = document.createElement('div');
  div.className = 'radio-line ' + entry.from;
  const avatarSvg = RADIO_AVATARS[entry.from] || RADIO_AVATARS.ship;
  div.innerHTML = '<svg class="radio-avatar" viewBox="0 0 24 24">'+avatarSvg+'</svg>'
    + '<span class="who">['+entry.label+']</span><span class="txt">'+entry.text+'</span>';
  log.appendChild(div);
  while(log.children.length > 6) log.removeChild(log.firstChild);
  repositionRadioPanel();
  playRadioBlip(entry.from);
  /* en mode abrégé, les lignes défilent trop vite pour être lues à voix
     haute sans se chevaucher — on garde le bip, on saute la voix (et donc
     la garde radioSpeaking, puisqu'aucune lecture n'est en cours) */
  if(!arrivalSkip) speakRadioLine(entry);
}

/* =========================================================================
   SON ET VOIX DU CANAL RADIO
   Le bip est synthétisé (Web Audio), pas un fichier audio à charger.
   Pour la voix : il n'existe pas d'API internet gratuite et sans clé qui
   fasse de la synthèse vocale multi-voix depuis une page statique — la
   seule option réellement gratuite, sans inscription ni clé, est l'API
   navigateur SpeechSynthesis (locale : elle utilise les voix déjà
   installées par le système/navigateur, pas un service distant). C'est
   ce qu'on utilise ici ; le nombre et la qualité des voix disponibles
   varient selon le navigateur et l'OS de la personne qui joue.
   ========================================================================= */
let radioMuted = false;
/* =========================================================================
   MUSIQUE DE FOND ET RÉGLAGE DES VOLUMES (demande utilisateur)
   ========================================================================= */
/* Fichier livré à part (pas embarqué en base64 dans le HTML — un simple
   fichier audio libre de droit, aucune raison d'alourdir le fichier
   principal) : chargé depuis un dossier `musics/` à côté du HTML, comme
   convenu. `Audio()` plutôt qu'un <audio> HTML : rien à afficher, juste à
   piloter par JS (lecture, boucle, volume). */
const MUSIC_PATH = 'musics/observation-des-etoiles_by_scorestudio_from_envato.m4a';
let musicVolume = 0.4, voiceVolume = 0.85;
const musicAudio = new Audio(MUSIC_PATH);
musicAudio.loop = true;
musicAudio.volume = musicVolume;
/* la lecture ne peut démarrer que sur un geste utilisateur (politique
   autoplay des navigateurs) — le clic qui referme le générique (§11, déjà
   un vrai geste) sert aussi de déclencheur ici, cf. plus bas dans ce
   fichier (bootEl.addEventListener). .catch() : un blocage éventuel du
   navigateur ne doit jamais faire remonter d'erreur bruyante, la musique
   est un agrément, pas une fonction critique. */
function setMusicVolume(v){
  musicVolume = THREE.MathUtils.clamp(v, 0, 1);
  musicAudio.volume = musicVolume;
}
function setVoiceVolume(v){
  voiceVolume = THREE.MathUtils.clamp(v, 0, 1);
}
let radioSpeaking = false;  /* false, ou l'utterance en cours de lecture */
let audioCtx = null;
function getAudioCtx(){
  if(!audioCtx){
    try{ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }
    catch(e){ audioCtx = null; }
  }
  return audioCtx;
}
function playRadioBlip(from){
  if(radioMuted) return;
  const ctx = getAudioCtx();
  if(!ctx) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  const baseFreq = from === 'tower' ? 920 : 640;
  osc.frequency.setValueAtTime(baseFreq, t0);
  osc.frequency.exponentialRampToValueAtTime(baseFreq*0.7, t0+0.09);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.05, t0+0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0+0.13);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0+0.15);
}

let ttsVoices = [];
function refreshVoices(){ if(window.speechSynthesis) ttsVoices = window.speechSynthesis.getVoices(); }
if(window.speechSynthesis){
  refreshVoices();
  window.speechSynthesis.onvoiceschanged = refreshVoices;
}
function pickVoice(from){
  if(!ttsVoices.length) return null;
  const langPrefix = t('ttsLang').slice(0,2);
  const langMatch = ttsVoices.filter(function(v){ return v.lang && v.lang.slice(0,2).toLowerCase() === langPrefix; });
  const pool = langMatch.length ? langMatch : ttsVoices;
  if(pool.length < 2) return pool[0] || null;
  /* le genre de chaque interlocuteur est tiré aléatoirement à chaque
     échange (cf. startOrbitDelivery) plutôt que fixé par rôle : parfois
     la tour est une voix masculine, parfois féminine, indépendamment de
     l'équipage — pour ne pas toujours entendre la même association.
     Les indices de nom couvrent plusieurs langues (les voix installées
     varient selon le navigateur/système, cf. §12.3 de la documentation). */
  const gender = orbitState.voiceGender[from];
  const pattern = gender === 'female'
    ? /female|femme|frau|mujer|amélie|amelie|marie|julie|samantha|karen|anna|maria|petra/i
    : /male|homme|mann|hombre|thomas|nicolas|paul|daniel|david|stefan|carlos|jorge/i;
  return pool.find(function(v){ return pattern.test(v.name); }) || pool[Math.floor(Math.random()*pool.length)];
}
function speakRadioLine(entry){
  if(radioMuted || !window.speechSynthesis){ return; }
  const u = new SpeechSynthesisUtterance(entry.text);
  const v = pickVoice(entry.from);
  if(v) u.voice = v;
  u.lang = (v && v.lang) || t('ttsLang');
  u.rate = entry.from === 'tower' ? 0.98 : 1.05;
  /* le ton suit le GENRE tiré pour cet interlocuteur, pas son rôle : la
     tour et l'équipage sonnent différemment selon le tirage du jour. */
  u.pitch = orbitState.voiceGender[entry.from] === 'female' ? 1.15 : 0.85;
  u.volume = voiceVolume;
  /* on bloque le message suivant tant que celui-ci n'est pas terminé —
     et on ne bloque JAMAIS indéfiniment : onend/onerror lèvent tous les
     deux la garde, et un filet de sécurité la lève aussi après un délai
     large (estimation très généreuse), au cas où l'évènement ne se
     déclencherait pas sur un navigateur particulier. */
  radioSpeaking = true;
  const release = function(){
    if(radioSpeaking === u) radioSpeaking = false;
  };
  u.onend = release;
  u.onerror = release;
  radioSpeaking = u;
  window.speechSynthesis.speak(u);
  setTimeout(function(){ if(radioSpeaking === u) radioSpeaking = false; }, 16000);
}
(function initRadioMuteButton(){
  const btn = document.getElementById('radioMuteBtn');
  if(!btn) return;
  btn.addEventListener('click', function(e){
    e.stopPropagation();
    toggleVoiceMute();
  });
})();
(function initPauseButtons(){
  const resumeBtn = document.getElementById('pauseResumeBtn');
  const quitBtn = document.getElementById('pauseQuitBtn');
  if(resumeBtn) resumeBtn.addEventListener('click', function(e){ e.stopPropagation(); resumeGame(); });
  if(quitBtn) quitBtn.addEventListener('click', function(e){ e.stopPropagation(); quitToTitle(); });
})();

/* =========================================================================
   DIALOGUES RADIO PAR IA EMBARQUÉE (Gemini Nano) — §14 de la spec v2.1.
   Principe : le script par gabarits ci-dessus (buildRadioScript) reste la
   SEULE source de vérité affichée par défaut — c'est aussi, sans code
   supplémentaire, le repli automatique si Gemini Nano est absent,
   indisponible, ou trop lent. Cette IA ne fait qu'essayer de RÉÉCRIRE
   chaque réplique déjà présente, en tâche de fond, sans jamais bloquer
   ni retarder l'affichage : un dépassement de délai (2 s) ou une erreur
   laisse simplement le texte du gabarit en place, silencieusement.
   Aucun appel réseau : l'inférence tourne en local dans le navigateur,
   même principe que SpeechSynthesis déjà utilisée pour la voix (§12.3). */
let llmAvailability = 'unchecked';   /* 'unchecked' | 'available' | 'unavailable' */
async function checkLLMAvailability(){
  try{
    if(!('LanguageModel' in self)){ llmAvailability = 'unavailable'; return; }
    const a = await LanguageModel.availability();
    /* couvre l'ancien ET le nouveau nommage de l'API — encore instable
       d'une version de Chrome à l'autre au moment d'écrire ce code */
    llmAvailability = (a === 'available' || a === 'readily') ? 'available' : 'unavailable';
  }catch(e){
    llmAvailability = 'unavailable';
  }finally{
    updateLLMIndicator();
  }
}
checkLLMAvailability();

/* icône cerveau du panneau radio : active (pleine, lumineuse) quand l'IA
   embarquée est détectée et effectivement utilisée pour les dialogues,
   barrée (grisée, biffée) sinon — seul indicateur visible de la voie
   employée, sans quoi le joueur ne peut pas savoir laquelle est active. */
function updateLLMIndicator(){
  const el = document.getElementById('llmIndicator');
  if(!el) return;
  const active = llmAvailability === 'available';
  el.classList.toggle('active', active);
  el.classList.toggle('inactive', !active);
  el.title = llmAvailability === 'unchecked' ? t('llmChecking') : (active ? t('llmActive') : t('llmInactive'));
}

/* une identité par interlocuteur (§14.2) : ton et vocabulaire distincts,
   fournis en instruction système à sa PROPRE session — plutôt qu'un seul
   modèle générique appelé plusieurs fois, qui produirait des répliques
   interchangeables entre équipage et tour de contrôle. */
const LLM_PERSONAS = {
  ship: {
    fr: "Tu es le capitaine d'un cargo spatial. Ton direct, professionnel, phrases courtes. Réponds par une seule phrase courte, sans guillemets ni mise en forme.",
    en: 'You are the captain of a cargo starship. Direct, professional tone, short sentences. Reply with a single short sentence, no quotes or formatting.',
    de: 'Du bist der Kapitän eines Frachtraumschiffs. Direkt, professionell, kurze Sätze. Antworte mit einem einzigen kurzen Satz, ohne Anführungszeichen oder Formatierung.',
    es: 'Eres el capitán de un carguero espacial. Tono directo y profesional, frases cortas. Responde con una sola frase corta, sin comillas ni formato.'
  },
  tower: {
    fr: 'Tu es un contrôleur du trafic d\u2019un port spatial. Ton protocolaire, débit posé, formules consacrées. Réponds par une seule phrase courte, sans guillemets ni mise en forme.',
    en: 'You are a starport traffic controller. Formal, measured tone, standard phrasing. Reply with a single short sentence, no quotes or formatting.',
    de: 'Du bist ein Fluglotse eines Raumhafens. Förmlich, ruhiger Tonfall, feste Formulierungen. Antworte mit einem einzigen kurzen Satz, ohne Anführungszeichen oder Formatierung.',
    es: 'Eres un controlador de tráfico de un puerto espacial. Tono protocolario, ritmo pausado, fórmulas habituales. Responde con una sola frase corta, sin comillas ni formato.'
  }
};
const llmSessions = {};
async function getLLMSession(persona){
  if(llmSessions[persona]) return llmSessions[persona];
  const dict = LLM_PERSONAS[persona] || LLM_PERSONAS.ship;
  const sysPrompt = dict[LANG] || dict.fr;
  const session = await LanguageModel.create({ initialPrompts: [{role:'system', content: sysPrompt}] });
  llmSessions[persona] = session;
  return session;
}
function llmPromptFor(entry, planet){
  return 'Contexte : ' + entry.label + ' vient de dire, pendant l\u2019approche du port de '
    + planet.cityName + ' : "' + entry.text + '". Reformule ce message dans ton propre style, '
    + 'en gardant le même sens et les mêmes informations concrètes (nombres, noms).';
}
/* lance la réécriture de chaque réplique en arrière-plan, dès la
   construction du script — bien avant l'affichage du premier message
   (§14.5) — et abandonne silencieusement toute réponse qui arriverait
   après que CE message précis a déjà été affiché avec son texte de repli. */
function enhanceRadioScriptWithLLM(script, planet, gen){
  if(llmAvailability !== 'available') return;
  script.forEach(function(entry, idx){
    (async function(){
      try{
        const session = await getLLMSession(entry.from);
        const prompt = llmPromptFor(entry, planet);
        const timeout = new Promise(function(_, reject){ setTimeout(function(){ reject(new Error('timeout')); }, 2000); });
        const text = await Promise.race([session.prompt(prompt), timeout]);
        if(orbitState.radioGen !== gen) return;      /* nouvelle escale entre-temps */
        if(orbitState.radioIdx > idx) return;         /* déjà affiché avec le repli */
        const cleaned = String(text).trim().replace(/^["\u201c\u201d]|["\u201c\u201d]$/g, '');
        if(cleaned) entry.text = cleaned;
      }catch(e){
        /* silencieux : le texte du gabarit déjà en place reste affiché,
           c'est tout l'intérêt de ne jamais l'effacer avant d'avoir un
           remplacement confirmé */
      }
    })();
  });
}

function startOrbitDelivery(planet){
  /* nettoyage défensif d'un éventuel reliquat de navettes non arrivées */
  orbitState.shuttles.forEach(function(s){
    scene.remove(s.group); disposePlanetGroup(s.group);
    if(s.trail){ scene.remove(s.trail); s.trail.geometry.dispose(); s.trail.material.dispose(); }
  });
  orbitState.shuttles.length = 0;
  orbitState.spawned = [false,false,false];

  const center = planet.position.clone();
  const toShip = shipRig.position.clone().sub(center);
  const dist = Math.max(toShip.length(), 1);
  const U = toShip.clone().divideScalar(dist);
  const fwd = new THREE.Vector3(0,0,-1).applyQuaternion(shipRig.quaternion);
  let N = new THREE.Vector3().crossVectors(U, fwd);
  if(N.lengthSq() < 1e-6){
    N = new THREE.Vector3().crossVectors(U, new THREE.Vector3(0,1,0));
    if(N.lengthSq() < 1e-6) N = new THREE.Vector3().crossVectors(U, new THREE.Vector3(1,0,0));
  }
  N.normalize();
  let V = new THREE.Vector3().crossVectors(N, U).normalize();
  if(V.dot(fwd) < 0){ V.negate(); N.negate(); }  /* aligne le sens de parcours sur le cap actuel */

  orbitState.active = true;
  orbitState.planet = planet;
  orbitState.center = center;
  orbitState.radius = planet.radius*2.3;
  orbitState.U = U; orbitState.V = V; orbitState.N = N;
  /* garde-fou anti-collision : si le vaisseau se retrouve anormalement
     proche de la planète au moment du déclenchement (léger dépassement du
     seuil d'arrivée, etc.), on démarre la capture depuis un point sûr sur
     le même axe plutôt que depuis sa position réelle — sans quoi le
     fondu vers le cercle d'orbite pourrait couper à travers la surface. */
  const safeDist = Math.max(dist, planet.radius*1.7);
  orbitState.startPos.copy(center).addScaledVector(U, safeDist);
  orbitState.startQuat.copy(shipRig.quaternion);
  orbitState.camPhase0 = Math.random()*Math.PI*2;

  /* canal radio : script généré depuis le seed de la planète, panneau vidé et affiché.
     Le genre de chaque voix est tiré au hasard à chaque échange — équipage
     et tour peuvent être masculins, féminins, ou l'un de chaque, sans
     schéma fixe d'un appel à l'autre. */
  /* cargaison de l'escale : 1 à 5 conteneurs au total, répartis sur les
     navettes larguées (ex. 5 sur 3 navettes -> 2/2/1). Tiré AVANT
     buildRadioScript, qui lit cette répartition pour ses annonces. */
  const nShuttles = orbitState.spawnFractions.length;
  const totalCargo = 1 + Math.floor(Math.random()*5);
  const split = new Array(nShuttles).fill(0);
  for(let c=0;c<totalCargo;c++) split[c % nShuttles]++;
  orbitState.cargoSplit = split;
  orbitState.unitPrice = 180 + Math.floor(Math.random()*241);  /* 180 à 420 crédits */
  orbitState.creditsPaid = false;
  orbitState.deliveredCount = 0;
  orbitState.loading = null;

  orbitState.voiceGender = {
    ship:  Math.random() < 0.5 ? 'male' : 'female',
    tower: Math.random() < 0.5 ? 'male' : 'female'
  };
  orbitState.radioScript = buildRadioScript(planet);
  orbitState.radioIdx = 0;
  /* réécriture IA en tâche de fond (§14) : orbitState.radioGen identifie
     cette escale précise, pour que toute réponse tardive d'une escale
     précédente (dépassée ou abandonnée) ne vienne jamais écraser le script
     de la nouvelle. */
  orbitState.radioGen = (orbitState.radioGen||0) + 1;
  enhanceRadioScriptWithLLM(orbitState.radioScript, planet, orbitState.radioGen);
  const radioLog = document.getElementById('radioLog');
  if(radioLog) radioLog.innerHTML = '';
  const radioPanel = document.getElementById('radioPanel');
  if(radioPanel) radioPanel.classList.add('visible');
  if(typeof refreshHudIconBar === 'function') refreshHudIconBar();
  /* services portuaires (#9, palier 1) : n'est plus auto-affiché avec la
     radio — le panneau est désormais piloté UNIQUEMENT par sa propre
     icône dans la barre du HUD (§12), activable dès qu'on est en
     livraison OU à proximité d'une planète-port (cf. isNearPortService).
     On rafraîchit son contenu quand même ici, au cas où il serait déjà
     ouvert (le coût du trajet peut changer avec le niveau atteint). */
  if(typeof refreshPortPanel === 'function') refreshPortPanel();
  repositionRadioPanel();
  repositionPortPanel();
  const arrivalHint = document.getElementById('arrivalHint');
  if(arrivalHint) arrivalHint.style.display = 'block';
}

/* ---------- navettes de livraison ----------
   De petits vaisseaux transfèrent quelques conteneurs vers le port spatial
   pendant que le vaisseau principal reste en orbite. */
/* textures des navettes : générées UNE FOIS (buildShuttle est appelée à
   chaque largage, il ne faut pas refabriquer un canvas à chaque fois) */
const SHUTTLE_HULL_TEX = buildHullPanelTexture(SEED+':shuttle:hull', 0x8f3026, {hazard:true});
SHUTTLE_HULL_TEX.repeat.set(1.5, 1);
const SHUTTLE_CONT_TEX = buildHullPanelTexture(SEED+':shuttle:cont', 0xb0b0b0, {hazard:false});
SHUTTLE_CONT_TEX.repeat.set(1, 1);
const CONTAINER_PALETTE = [0xd9a12c, 0x2d5f9e, 0xa33a2e, 0x2f7a72];

/* Construit un conteneur seul (réutilisé à la fois par le stock près du
   bras de chargement et par l'attache avant de la navette une fois posé). */
function buildContainerMesh(){
  const mat = new THREE.MeshStandardMaterial({
    color: CONTAINER_PALETTE[Math.floor(Math.random()*CONTAINER_PALETTE.length)],
    map: SHUTTLE_CONT_TEX, metalness:0.3, roughness:0.78
  });
  return new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.8, 1.2), mat);
}

/* =========================================================================
   NAVETTE — silhouette « pousseur » (tug orbital) : une nacelle arrière
   portant UN SEUL moteur principal et un système RCS, reliée par une
   épine dorsale à une pince avant qui reçoit le conteneur — la charge
   n'est donc jamais attachée au moment de la construction, elle est posée
   ensuite par le bras de chargement (cf. buildShipArm / updateLoadingArm).
   Convention d'axe identique au vaisseau principal : -Z = avant.
   ========================================================================= */
const SHUTTLE_TRAIL_LEN = 9;    /* traînée du propulseur — amélioration demandée */
function buildShuttle(){
  const g = new THREE.Group();

  /* -- nacelle arrière : habitacle + moteur -- */
  const podMat = new THREE.MeshStandardMaterial({color:0xffffff, map:SHUTTLE_HULL_TEX, metalness:0.45, roughness:0.55});
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.38, 1.05, 8), podMat);
  pod.rotation.x = Math.PI/2;
  pod.position.set(0, 0, 0.85);
  g.add(pod);

  /* -- moteur principal, UNIQUE (silhouette de pousseur, pas de grappe) -- */
  const engineHousing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.30, 0.24, 0.3, 8),
    new THREE.MeshStandardMaterial({color:0x2a2d33, metalness:0.6, roughness:0.4})
  );
  engineHousing.rotation.x = Math.PI/2;
  engineHousing.position.set(0, 0, 1.42);
  g.add(engineHousing);
  const engineCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.24, 0.42, 8, 1, true),
    new THREE.MeshStandardMaterial({color:0x15171b, metalness:0.7, roughness:0.3, side:THREE.DoubleSide})
  );
  engineCone.rotation.x = -Math.PI/2;
  engineCone.position.set(0, 0, 1.72);
  g.add(engineCone);
  const glowMat = new THREE.SpriteMaterial({
    map:glowTex, color:0x8fd8ff, blending:THREE.AdditiveBlending, transparent:true, depthWrite:false
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(1.0, 1.0, 1);
  glow.position.set(0, 0, 1.95);
  g.add(glow);

  /* -- système RCS : quatre petites tuyères autour de la nacelle -- */
  const rcsMat = new THREE.MeshStandardMaterial({color:0x555b63, metalness:0.5, roughness:0.5});
  [[0.26,0.2],[-0.26,0.2],[0.26,-0.2],[-0.26,-0.2]].forEach(function(xy){
    const rcs = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.16, 6), rcsMat);
    rcs.position.set(xy[0], xy[1], 0.5);
    g.add(rcs);
  });

  /* -- épine dorsale : relie la nacelle à la pince avant -- */
  const spineMat = new THREE.MeshStandardMaterial({color:0x3a3f46, metalness:0.5, roughness:0.6});
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 1.55), spineMat);
  spine.position.set(0, 0, -0.05);
  g.add(spine);

  /* -- pince avant : vide au départ — cf. clampGroup, où le bras de
     chargement vient déposer le conteneur avant le lancement -- */
  const clampMat = new THREE.MeshStandardMaterial({color:0x6b6f75, metalness:0.55, roughness:0.5});
  const clampGroup = new THREE.Group();
  clampGroup.position.set(0, 0, -1.05);
  g.add(clampGroup);
  [-1,1].forEach(function(s){
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.55, 0.07), clampMat);
    arm.position.set(s*0.32, 0, 0);
    clampGroup.add(arm);
  });

  /* -- signaux lumineux : convention aéronautique bâbord rouge / tribord
     vert sur la nacelle, strobe blanc à l'arrière — chacun sur son propre
     cycle, réutilise le mécanisme de balises déjà en place sur le
     vaisseau principal. -- */
  const navLights = [];
  function navLight(color, pos, period, phase){
    const mat = new THREE.SpriteMaterial({
      map:glowTex, color:color, blending:THREE.AdditiveBlending, transparent:true, depthWrite:false, opacity:0
    });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(0.22, 0.22, 1);
    sp.position.set(pos[0], pos[1], pos[2]);
    g.add(sp);
    navLights.push({mat:mat, period:period, phase:phase, duty:0.5, peak:0.9});
  }
  navLight(0xff3b30, [-0.34, 0.05, 0.7], 1.1, 0);
  navLight(0x3ddc84, [ 0.34, 0.05, 0.7], 1.1, 0);
  navLight(0xffffff, [0, 0.24, 1.3], 0.7, 0.35);

  /* traînée du propulseur principal (amélioration demandée, pour mieux
     suivre les navettes en vol) : une polyligne en coordonnées MONDE —
     ajoutée à la scène, pas au groupe de la navette, sinon ses propres
     points historiques subiraient le déplacement courant en plus de
     l'ancien. Fondu obtenu par assombrissement des couleurs en mélange
     additif (queue plus sombre → se noie dans le noir spatial) plutôt
     qu'un canal alpha par sommet, que LineBasicMaterial ne gère pas. */
  const trailGeom = new THREE.BufferGeometry();
  const trailPosArr = new Float32Array(SHUTTLE_TRAIL_LEN*3);
  const trailColArr = new Float32Array(SHUTTLE_TRAIL_LEN*3);
  trailGeom.setAttribute('position', new THREE.BufferAttribute(trailPosArr, 3));
  trailGeom.setAttribute('color', new THREE.BufferAttribute(trailColArr, 3));
  const trailMat = new THREE.LineBasicMaterial({
    vertexColors:true, blending:THREE.AdditiveBlending, transparent:true, depthWrite:false, opacity:0.85
  });
  const trail = new THREE.Line(trailGeom, trailMat);
  trail.frustumCulled = false;

  return {group:g, glow:glow, clampGroup:clampGroup, navLights:navLights, hasCargo:false, trail:trail};
}
/* Catalogue de séquences de plans pour le départ d'une navette (§15.2/15.3
   de la spec) : un gros plan sur le dock au largage, puis un style de suivi
   distinct selon la séquence tirée — tirée au hasard à CHAQUE navette pour
   que la variété se voie dès la première livraison. */
const SHUTTLE_CAMERA_SEQUENCES = ['lateral', 'face', 'travelling', 'shoulder'];
const SHUTTLE_CLOSEUP_DURATION = 3.4;   /* couvre tout le chargement par le bras */
let _shuttleIdCounter = 0;

/* ---------- poses-clés du bras de chargement ----------
   Une pose = deux axes à l'épaule (baseX/baseY), un au coude, un au
   poignet. Interpolées linéairement entre trois postures : repos (replié
   contre la coque), saisie (tendu vers le stock), dépose (tendu vers la
   pince de la navette). Suffisant pour un geste bref observé en gros
   plan — pas une IK complète. */
const ARM_POSE_REST  = { baseX:0.35, baseY:0,     elbow:-2.35, wrist:0 };
const ARM_POSE_REACH = { baseX:0.15, baseY:1.15,  elbow:-0.35, wrist:0.2 };
const ARM_POSE_PLACE = { baseX:0.10, baseY:-1.05, elbow:-0.40, wrist:-0.1 };
function lerpArmPose(a, b, t){
  return {
    baseX: THREE.MathUtils.lerp(a.baseX, b.baseX, t),
    baseY: THREE.MathUtils.lerp(a.baseY, b.baseY, t),
    elbow: THREE.MathUtils.lerp(a.elbow, b.elbow, t),
    wrist: THREE.MathUtils.lerp(a.wrist, b.wrist, t)
  };
}
function applyArmPose(pose){
  const arm = window.shipArm;
  if(!arm) return;
  arm.base.rotation.set(pose.baseX, pose.baseY, 0);
  arm.elbow.rotation.x = pose.elbow;
  arm.wrist.rotation.x = pose.wrist;
}

/* ---------- minutage du chargement (total = SHUTTLE_CLOSEUP_DURATION) ---------- */
const LOAD_T_REACH   = 0.9;   /* fin de l'approche vers le stock */
const LOAD_T_GRAB    = 1.1;   /* préhension du conteneur */
const LOAD_T_PLACE   = 2.3;   /* fin du transfert vers la navette */
const LOAD_T_RELEASE = 2.5;   /* dépose sur la pince de la navette */
/* au-delà : retour du bras au repos, jusqu'à SHUTTLE_CLOSEUP_DURATION */

/* Démarre le chargement d'une navette : construit la navette (vide) et un
   conteneur de stock, tous deux ancrés sur le dock/le point de stockage —
   qui suivent le vaisseau tant qu'il orbite, cf. updateShuttleLoading(). */
function startShuttleLoading(withCutaway){
  const sh = buildShuttle();
  const dockPos = new THREE.Vector3();
  if(window.shipDockAnchor) window.shipDockAnchor.getWorldPosition(dockPos);
  else dockPos.copy(shipRig.position);
  sh.group.position.copy(dockPos);
  sh.group.quaternion.copy(shipRig.quaternion);
  scene.add(sh.group);
  scene.add(sh.trail);

  const container = buildContainerMesh();
  const stagePos = new THREE.Vector3();
  if(window.shipCargoStageAnchor) window.shipCargoStageAnchor.getWorldPosition(stagePos);
  else stagePos.copy(dockPos);
  container.position.copy(stagePos);
  container.quaternion.copy(shipRig.quaternion);
  scene.add(container);

  const camSeq = SHUTTLE_CAMERA_SEQUENCES[Math.floor(Math.random()*SHUTTLE_CAMERA_SEQUENCES.length)];
  const id = ++_shuttleIdCounter;

  orbitState.loading = {
    id:id, shuttle:sh, container:container, t:0, duration:SHUTTLE_CLOSEUP_DURATION,
    camSeq:camSeq, grabbed:false, released:false
  };

  if(withCutaway){
    orbitState.cutawayUntil = pauseTimer + CUTAWAY_DURATION;
    orbitState.cutawayStart = pauseTimer;
    orbitState.cutawaySeq = camSeq;
    orbitState.cutawayShuttleId = id;
    orbitState.cutawayCut = false;
  }
}

/* Anime le bras à chaque image tant qu'un chargement est en cours, puis
   lance réellement la navette une fois le conteneur déposé et le bras
   revenu au repos. */
/* =========================================================================
   ÉVITEMENT D'OBSTACLES POUR LA CAMÉRA (bug remonté en jeu)
   ========================================================================= */
/* Repousse une position de caméra candidate hors de sphères d'exclusion
   (coque du cargo, planète cible...) plutôt que de laisser le plan
   traverser leur géométrie. Deux passes, indépendantes :
   1) si la position elle-même tombe DANS une sphère, la repousse
      radialement depuis le centre de cette sphère jusqu'à sa surface ;
   2) si le SEGMENT caméra→cible croise une sphère qui n'est pas la cible
      elle-même, décale la caméra perpendiculairement à ce segment pour
      dégager la ligne de mire, sans changer la distance de suivi voulue.
   Volontairement générique (liste d'obstacles en paramètre, pas figée sur
   le cargo) : sert à la fois aux séquences de largage de navette et,
   plus généralement, à tout plan « travelling » qui suit un vaisseau
   (cargo ou navette) à proximité d'une planète ou d'un autre corps. */
function clearCameraObstacles(pos, lookAt, obstacles){
  obstacles.forEach(function(ob){
    const toPos = pos.clone().sub(ob.center);
    const d = toPos.length();
    if(d < ob.radius){
      if(d < 1e-4) toPos.set(0, 1, 0.0001);
      pos.copy(ob.center).addScaledVector(toPos.normalize(), ob.radius);
    }
  });
  const toLook = lookAt.clone().sub(pos);
  const segLen = toLook.length();
  if(segLen < 1e-4) return pos;
  const dir = toLook.clone().normalize();
  obstacles.forEach(function(ob){
    const toObs = ob.center.clone().sub(pos);
    const proj = toObs.dot(dir);
    if(proj <= 0 || proj >= segLen) return;   /* obstacle pas entre caméra et cible */
    const closest = pos.clone().addScaledVector(dir, proj);
    const dist = closest.distanceTo(ob.center);
    if(dist < ob.radius){
      const lateral = pos.clone().sub(closest);
      if(lateral.lengthSq() < 1e-6){
        lateral.copy(dir).cross(new THREE.Vector3(0,1,0));
        if(lateral.lengthSq() < 1e-6) lateral.set(1,0,0);
      }
      lateral.normalize();
      pos.addScaledVector(lateral, (ob.radius - dist) + 2);
    }
  });
  return pos;
}
/* Rayon d'exclusion englobant la coque du cargo (corps arrière + caisson
   avant + porte-à-faux) — mesuré large plutôt qu'au plus juste, une marge
   généreuse coûte moins cher qu'un plan qui re-traverse la coque de justesse. */
let SHIP_HULL_RADIUS = 20;

function updateShuttleLoading(dt){
  const L = orbitState.loading;
  if(!L) return;
  L.t += dt;

  /* le dock et le stock sont solidaires du vaisseau, qui continue
     d'orbiter pendant le chargement : on les réaligne à chaque image
     plutôt que de figer une position prise au départ. */
  const dockPos = new THREE.Vector3();
  if(window.shipDockAnchor) window.shipDockAnchor.getWorldPosition(dockPos);
  else dockPos.copy(shipRig.position);
  L.shuttle.group.position.copy(dockPos);
  L.shuttle.group.quaternion.copy(shipRig.quaternion);
  if(!L.grabbed){
    const stagePos = new THREE.Vector3();
    if(window.shipCargoStageAnchor) window.shipCargoStageAnchor.getWorldPosition(stagePos);
    else stagePos.copy(dockPos);
    L.container.position.copy(stagePos);
    L.container.quaternion.copy(shipRig.quaternion);
  }

  if(L.t < LOAD_T_REACH){
    applyArmPose(lerpArmPose(ARM_POSE_REST, ARM_POSE_REACH, THREE.MathUtils.clamp(L.t/LOAD_T_REACH, 0, 1)));
  } else if(L.t < LOAD_T_GRAB){
    applyArmPose(ARM_POSE_REACH);
    if(!L.grabbed && window.shipArm){
      L.grabbed = true;
      /* préhension : le conteneur passe dans le référentiel de la pince
         du bras, il suit désormais son mouvement automatiquement */
      scene.remove(L.container);
      window.shipArm.gripper.add(L.container);
      L.container.position.set(0, 0, 0.25);
      L.container.rotation.set(0, 0, 0);
    }
  } else if(L.t < LOAD_T_PLACE){
    applyArmPose(lerpArmPose(ARM_POSE_REACH, ARM_POSE_PLACE, THREE.MathUtils.clamp((L.t-LOAD_T_GRAB)/(LOAD_T_PLACE-LOAD_T_GRAB), 0, 1)));
  } else if(L.t < LOAD_T_RELEASE){
    applyArmPose(ARM_POSE_PLACE);
    if(!L.released && window.shipArm){
      L.released = true;
      /* dépose : le conteneur passe de la pince du bras à celle de la
         navette, qui l'emporte au lancement */
      window.shipArm.gripper.remove(L.container);
      L.shuttle.clampGroup.add(L.container);
      L.container.position.set(0, 0, 0);
      L.container.rotation.set(0, 0, 0);
      L.shuttle.hasCargo = true;
    }
  } else {
    applyArmPose(lerpArmPose(ARM_POSE_PLACE, ARM_POSE_REST, THREE.MathUtils.clamp((L.t-LOAD_T_RELEASE)/(L.duration-LOAD_T_RELEASE), 0, 1)));
  }

  if(L.t >= L.duration){
    launchLoadedShuttle(L.shuttle, L.id, dockPos, L.camSeq);
    orbitState.loading = null;
  }
}

/* La navette, déjà chargée, part réellement vers la planète — reprend le
   rôle de l'ancienne spawnShuttle(), mais sans reconstruire le modèle. */
function launchLoadedShuttle(sh, id, dockPos, camSeq){
  const arcOffset = new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5)
    .normalize().multiplyScalar(50 + Math.random()*70);
  orbitState.shuttles.push({
    id:id, group:sh.group, glow:sh.glow, navLights:sh.navLights,
    trail:sh.trail, trailHistory:[],
    startPos:dockPos.clone(), t:0, duration:11+Math.random()*3, arcOffset:arcOffset,
    camSeq:camSeq, phase:'outbound'
  });
}

/* chorégraphie du départ (amélioration demandée) : plutôt qu'un simple
   lerp direct vers la cible dès l'instant zéro, le départ suit trois temps
   bien identifiés — chute hors de la baie (repère du VAISSEAU, qui bouge
   pendant toute la manœuvre d'orbite), éloignement progressif, puis seulement
   alors mise en cap vers le port cible. */
const OUTBOUND_DROP_FRAC = 0.12;    /* fraction du trajet : chute hors baie */
const OUTBOUND_CLEAR_FRAC = 0.32;   /* fraction du trajet : fin d'éloignement */
const OUTBOUND_DROP_DIST = 14;      /* unités parcourues à la verticale du dock */
const OUTBOUND_CLEAR_DIST = 55;     /* éloignement supplémentaire avant le cap */
const _shipDown = new THREE.Vector3();
const _dockPosNow = new THREE.Vector3();
const _clearPos = new THREE.Vector3();

const _shuttleTarget = new THREE.Vector3();
function updateShuttles(dt, elapsed){
  updateShuttleLoading(dt);
  for(let i=orbitState.shuttles.length-1; i>=0; i--){
    const s = orbitState.shuttles[i];
    s.t += dt;
    const f = Math.min(1, s.t/s.duration);
    const ease = f*f*(3-2*f);

    /* cible : la planète à l'aller, le dock du vaisseau (mobile, en
       orbite) au retour */
    if(s.phase === 'outbound'){
      if(orbitState.planet && orbitState.planet.beaconSprite){
        orbitState.planet.beaconSprite.getWorldPosition(_shuttleTarget);
      } else if(orbitState.planet){
        _shuttleTarget.copy(orbitState.planet.position);
      }
    } else if(window.shipDockAnchor){
      window.shipDockAnchor.getWorldPosition(_shuttleTarget);
    } else {
      _shuttleTarget.copy(shipRig.position);
    }

    let pos, lookDir;
    if(s.phase === 'outbound'){
      /* repère du vaisseau réévalué CHAQUE image : le cargo est en train
         de manœuvrer en orbite pendant tout ce temps, la chute et
         l'éloignement doivent rester solidaires de sa position/orientation
         RÉELLE au moment présent, pas d'un instantané figé au largage. */
      _shipDown.set(0,-1,0).applyQuaternion(shipRig.quaternion);
      if(window.shipDockAnchor) window.shipDockAnchor.getWorldPosition(_dockPosNow);
      else _dockPosNow.copy(shipRig.position);

      if(f < OUTBOUND_DROP_FRAC){
        /* phase 1 : translation verticale pure, part du centre du dock */
        const t2 = f/OUTBOUND_DROP_FRAC, e2 = t2*t2*(3-2*t2);
        pos = _dockPosNow.clone().addScaledVector(_shipDown, OUTBOUND_DROP_DIST*e2);
        lookDir = _shipDown;
      } else if(f < OUTBOUND_CLEAR_FRAC){
        /* phase 2 : poursuite du même axe, la navette s'éloigne encore du cargo */
        const t2 = (f-OUTBOUND_DROP_FRAC)/(OUTBOUND_CLEAR_FRAC-OUTBOUND_DROP_FRAC), e2 = t2*t2*(3-2*t2);
        pos = _dockPosNow.clone().addScaledVector(_shipDown, OUTBOUND_DROP_DIST + OUTBOUND_CLEAR_DIST*e2);
        lookDir = _shipDown;
      } else {
        /* phase 3 : dégagée du cargo, la navette amorce enfin sa descente
           vers le port — même lerp+arc qu'avant, mais reparti du point de
           dégagement plutôt que du dock lui-même */
        _clearPos.copy(_dockPosNow).addScaledVector(_shipDown, OUTBOUND_DROP_DIST + OUTBOUND_CLEAR_DIST);
        const t2 = (f-OUTBOUND_CLEAR_FRAC)/(1-OUTBOUND_CLEAR_FRAC), e2 = t2*t2*(3-2*t2);
        pos = _clearPos.clone().lerp(_shuttleTarget, e2);
        pos.addScaledVector(s.arcOffset, Math.sin(Math.PI*t2));
        lookDir = _shuttleTarget.clone().sub(pos);
      }
    } else {
      /* retour au dock : trajet inchangé, un simple lerp+arc suffit —
         la chorégraphie de départ ne concerne que la SORTIE de la baie */
      pos = s.startPos.clone().lerp(_shuttleTarget, ease);
      pos.addScaledVector(s.arcOffset, Math.sin(Math.PI*f));
      lookDir = _shuttleTarget.clone().sub(pos);
    }
    s.group.position.copy(pos);

    if(lookDir.lengthSq() > 1e-6){
      const m4 = new THREE.Matrix4().lookAt(new THREE.Vector3(0,0,0), lookDir.clone().normalize(), new THREE.Vector3(0,1,0));
      s.group.quaternion.setFromRotationMatrix(m4);
    }
    /* rétrécissement + fondu en fin de trajectoire : simulation d'un
       atterrissage — à la livraison comme à l'amerrissage au dock */
    const shrink = f > 0.82 ? THREE.MathUtils.mapLinear(f, 0.82, 1, 1, 0.12) : 1;
    s.group.scale.setScalar(shrink);
    s.glow.material.opacity = shrink;

    /* traînée du propulseur — historique de positions MONDE du moteur,
       le plus récent en tête ; la géométrie se met à jour en place
       plutôt que d'être reconstruite (un seul Float32Array, réécrit).
       Bug corrigé : le point moteur était décalé selon l'orientation DU
       NEZ (s.group.quaternion), qui vise la cible en ligne droite pendant
       la phase 3 — alors que la trajectoire réelle suit un arc (sinus).
       Les deux axes divergent nettement au sommet de l'arc, donnant une
       traînée visiblement désaxée par rapport au déplacement effectif.
       Calculé maintenant à partir du DÉPLACEMENT RÉEL d'une image à
       l'autre (position actuelle − position précédente), qui coïncide
       par construction avec l'axe de déplacement, quelle que soit
       l'orientation du modèle. */
    if(s.trail){
      let engineWorld;
      if(s.lastTrailPos){
        const vel = pos.clone().sub(s.lastTrailPos);
        if(vel.lengthSq() > 1e-6){
          engineWorld = pos.clone().addScaledVector(vel.normalize(), -1.95*shrink);
        }
      }
      /* première image, ou vaisseau ponctuellement immobile (dt≈0) :
         retombe sur l'orientation du modèle, faute de mieux */
      if(!engineWorld){
        engineWorld = pos.clone().addScaledVector(
          new THREE.Vector3(0,0,1).applyQuaternion(s.group.quaternion), 1.95*shrink
        );
      }
      s.lastTrailPos = pos.clone();
      s.trailHistory.unshift(engineWorld);
      if(s.trailHistory.length > SHUTTLE_TRAIL_LEN) s.trailHistory.length = SHUTTLE_TRAIL_LEN;
      const posAttr = s.trail.geometry.attributes.position;
      const colAttr = s.trail.geometry.attributes.color;
      for(let k=0;k<SHUTTLE_TRAIL_LEN;k++){
        const p = s.trailHistory[k] || engineWorld;
        posAttr.array[k*3]=p.x; posAttr.array[k*3+1]=p.y; posAttr.array[k*3+2]=p.z;
        const fade = (1 - k/(SHUTTLE_TRAIL_LEN-1)) * shrink;
        const c = fade*fade;
        colAttr.array[k*3]=0.30*c; colAttr.array[k*3+1]=0.68*c; colAttr.array[k*3+2]=0.82*c;
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    }

    /* feux de navigation : cycle propre, indépendant du reste */
    (s.navLights||[]).forEach(function(nl){
      const tt = ((elapsed + nl.phase) % nl.period) / nl.period;
      const v = tt < nl.duty ? Math.pow(1 - tt/nl.duty, 1.6) : 0;
      nl.mat.opacity = v * nl.peak;
    });

    if(f >= 1){
      if(s.phase === 'outbound'){
        /* livraison effectuée : crédité ici (au dépôt du dernier
           conteneur), puis la navette repart aussitôt vers le dock —
           elle ne disparaît qu'après avoir rejoint le vaisseau, cf.
           shuttlesDone qui conditionne la reprise de croisière. */
        orbitState.deliveredCount = (orbitState.deliveredCount||0) + 1;
        if(!orbitState.creditsPaid && orbitState.spawned.every(Boolean)
           && orbitState.deliveredCount >= orbitState.spawnFractions.length){
          const total = orbitState.cargoSplit.reduce(function(a,b){ return a+b; }, 0);
          addCredits(total * orbitState.unitPrice);
          orbitState.creditsPaid = true;
        }
        s.phase = 'returning';
        s.t = 0;
        s.startPos = pos.clone();
        s.arcOffset = new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5)
          .normalize().multiplyScalar(50 + Math.random()*70);
        s.duration = 9 + Math.random()*2;
        s.group.scale.setScalar(1);
        s.glow.material.opacity = 1;
      } else {
        /* retour terminé : amerrissage au dock */
        scene.remove(s.group);
        disposePlanetGroup(s.group);
        if(s.trail){ scene.remove(s.trail); s.trail.geometry.dispose(); s.trail.material.dispose(); }
        orbitState.shuttles.splice(i,1);
      }
    }
  }
}

/* ---------- position/orientation du vaisseau sur le cercle d'orbite ---------- */
function updateOrbitDelivery(dt){
  const os = orbitState;
  const angularSpeed = (Math.PI*2)/ARRIVAL_PAUSE_DURATION;
  const angle = pauseTimer*angularSpeed;
  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  const parametricPos = os.center.clone()
    .addScaledVector(os.U, cosA*os.radius)
    .addScaledVector(os.V, sinA*os.radius);
  const tangent = os.U.clone().multiplyScalar(-sinA).addScaledVector(os.V, cosA).normalize();
  const m4 = new THREE.Matrix4().lookAt(new THREE.Vector3(0,0,0), tangent, os.N);
  const targetQuat = new THREE.Quaternion().setFromRotationMatrix(m4);

  /* capture douce : on part de la position/orientation réelles du vaisseau
     à l'instant du déclenchement plutôt que de le téléporter sur le cercle */
  const capT = Math.min(1, pauseTimer/ORBIT_CAPTURE_TIME);
  const blend = capT*capT*(3-2*capT);
  shipRig.position.copy(os.startPos).lerp(parametricPos, blend);
  shipRig.quaternion.copy(os.startQuat).slerp(targetQuat, blend);

  /* déclenchement des navettes, réparties sur le tour d'orbite */
  const frac = pauseTimer/ARRIVAL_PAUSE_DURATION;
  os.spawnFractions.forEach(function(sf, i){
    if(!os.spawned[i] && frac >= sf){
      os.spawned[i] = true;
      /* mise en scène du chargement puis du largage — sautée en mode
         abrégé, où l'on privilégie le travelling continu à une
         succession de plans (le chargement lui-même reste joué, mais en
         accéléré comme le reste, via arrivalTimeScale). */
      startShuttleLoading(!arrivalSkip);
    }
  });

  /* canal radio : les messages du script sont déjà triés par instant de
     déclenchement, MAIS on n'affiche jamais le suivant tant que la voix
     est encore en train de lire le précédent — sans cette garde, un
     message pouvait apparaître (et sa lecture démarrer, mise en file par
     le navigateur) alors que le message précédent n'avait pas fini d'être
     dicté, et le texte affiché prenait de l'avance sur la voix. */
  if(!radioSpeaking && os.radioIdx < os.radioScript.length && os.radioScript[os.radioIdx].t <= frac){
    appendRadioLine(os.radioScript[os.radioIdx]);
    os.radioIdx++;
  }

  currentSpeed = os.radius*angularSpeed;
  return tangent;
}

/* =========================================================================
   INERTIE DE ROTATION
   Le vaisseau ne tourne plus instantanément : les commandes appliquent un
   COUPLE, qui fait évoluer une vitesse angulaire, laquelle intègre
   l'orientation. Un cargo de plusieurs centaines de tonnes met plusieurs
   secondes à établir puis à annuler sa rotation — c'est ce retard qui donne
   la sensation de masse.
   L'amortissement représente les tuyères de stabilisation : sans lui, en
   l'absence de frottement, le vaisseau tournerait indéfiniment.
   ========================================================================= */
const angVel = new THREE.Vector3();      /* rad/s autour des axes LOCAUX X,Y,Z */
const TORQUE   = {pitch:0.30, yaw:0.26, roll:0.42};  /* accélération angulaire (rad/s²) */
const ANG_MAX  = {pitch:0.42, yaw:0.38, roll:0.72};  /* vitesse angulaire plafond */
const ANG_DAMP = 0.55;                   /* stabilisation quand la commande est relâchée */
const _qDelta = new THREE.Quaternion();
const _eTmp = new THREE.Euler();
/* vecteurs de travail réutilisés par l'autopilote (évite d'allouer
   plusieurs Vector3 par image, dans une boucle appelée 60 fois/s) */
const _routeTmpA = new THREE.Vector3();
const _routeTmpB = new THREE.Vector3();
const _routeTmpC = new THREE.Vector3();
const _routeTmpD = new THREE.Vector3();
const _routeTmpE = new THREE.Vector3();
const _routeTmpF = new THREE.Vector3();
const _qInv = new THREE.Quaternion();

function applyAngular(dt){
  /* intégration de l'orientation à partir de la vitesse angulaire */
  if(angVel.lengthSq() > 1e-12){
    _eTmp.set(angVel.x*dt, angVel.y*dt, angVel.z*dt, 'XYZ');
    _qDelta.setFromEuler(_eTmp);
    shipRig.quaternion.multiply(_qDelta);
    shipRig.quaternion.normalize();
  }
}

function updateFlight(dt, elapsed){
  /* séquence de saut quantique (§23.5) en cours : non interruptible, prend
     entièrement la main sur cette fonction — ni pilotage, ni caméra (qui
     reste fixe, cf. commentaire de updateJumpSequence) tant qu'elle dure. */
  if(jumpState){ updateJumpSequence(dt); return; }
  const paused = (flightPhase === 'ARRIVAL_PAUSE');

  /* sollicitation d'attitude de l'image, remise à zéro à chaque tour */
  rcsDemand.yaw = 0; rcsDemand.pitch = 0; rcsDemand.roll = 0;

  const pitchInput = ((keys['ArrowUp']||keys['KeyZ']||keys['KeyW'])?1:0) - ((keys['ArrowDown']||keys['KeyS'])?1:0);
  const yawInput   = ((keys['ArrowLeft']||keys['KeyQ']||keys['KeyA'])?1:0) - ((keys['ArrowRight']||keys['KeyD'])?1:0);
  const rollKey    = (keys['KeyE']?1:0) - (keys['KeyR']?1:0);

  const hasManualInput = pitchInput!==0 || yawInput!==0 || rollKey!==0 || dragYaw!==0 || dragPitch!==0;
  if(hasManualInput) lastInputTime = performance.now();
  manual = !paused && (performance.now() - lastInputTime) < IDLE_MS;

  /* --- couples demandés, exprimés dans le repère local du vaisseau ---
     Signes : un tangage « cabrer » (pitchInput +1) correspond à un couple
     NÉGATIF autour de X, et un roulis (rollKey +1) à un couple négatif
     autour de Z. Les tuyères RCS lisent exactement les mêmes valeurs, ce
     qui garantit qu'elles soufflent du bon côté. */
  let tx = 0, ty = 0, tz = 0;

  if(paused){
    /* pause d'arrivée : aucune commande, aucun pilotage — la vitesse
       angulaire s'éteint par le seul amortissement, plus bas dans cette
       fonction, exactement comme un axe relâché en vol normal. */
  } else {
    /* --- SUIVI DE ROUTE : toujours actif, pilotage manuel OU automatique ---
       La progression le long de la courbe (et donc la détection d'arrivée)
       ne doit JAMAIS dépendre du mode de pilotage : cette logique vivait
       auparavant uniquement dans la branche autopilote, ce qui voulait dire
       que piloter manuellement à l'approche d'une destination empêchait
       purement et simplement l'arrivée de se déclencher — aucune navette,
       aucun canal radio, sans le moindre message d'erreur. */
    if(ROUTE.curve && ROUTE.length > 0){
      const L = ROUTE.length;
      /* bug remonté en jeu (« le vaisseau semble avancer en saccadant ») :
         cette recherche du point le plus proche sur la courbe tournait à
         24 pas sur 420 u, soit un pas de ~17,5 u — bien plus grossier que
         la distance parcourue par image en croisière (~0,9 u à 56 u/s,
         60 i/s). ROUTE.s restait donc figée une vingtaine d'images avant
         de sauter d'un coup au palier suivant, décalant le cap visé
         (§« suivi de courbe » ci-dessous) par à-coups plutôt que de le
         laisser glisser en continu.
         Une simple passe densifiée (essayé : 240 pas, ~1,75 u) restait
         perceptible — ROUTE.s alternait encore entre 0 et 1,75 u d'une
         image à l'autre, faute d'être plus fin que le déplacement réel.
         Recherche en DEUX passes à la place : une grossière (24 pas,
         repère la bonne zone), puis une fine (32 pas resserrés sur ± un
         pas grossier autour de ce repère) — un pas final de l'ordre de
         0,05 u, largement sous tout déplacement par image, pour un total
         de 56 itérations seulement (moins cher que les 240 de la
         première tentative, pour un résultat nettement plus lisse). */
      const COARSE_AHEAD = 420, COARSE_STEPS = 24;
      let bestS = ROUTE.s, bestD = Infinity;
      for(let i=0;i<=COARSE_STEPS;i++){
        const s = ROUTE.s + (i/COARSE_STEPS)*COARSE_AHEAD;
        if(s > L) break;
        const q = ROUTE.curve.getPointAt(s/L, _routeTmpA);
        const d = q.distanceToSquared(shipRig.position);
        if(d < bestD){ bestD = d; bestS = s; }
      }
      const coarseStep = COARSE_AHEAD/COARSE_STEPS;
      const FINE_STEPS = 32;
      const fineMin = Math.max(ROUTE.s, bestS - coarseStep);
      const fineMax = Math.min(L, bestS + coarseStep);
      for(let i=0;i<=FINE_STEPS;i++){
        const s = fineMin + (i/FINE_STEPS)*(fineMax-fineMin);
        const q = ROUTE.curve.getPointAt(s/L, _routeTmpA);
        const d = q.distanceToSquared(shipRig.position);
        if(d < bestD){ bestD = d; bestS = s; }
      }
      ROUTE.s = bestS;

      let idx = 0;
      while(idx < ROUTE.legS.length-1 && ROUTE.s > ROUTE.legS[idx] - 120) idx++;
      if(idx !== ROUTE.index){ ROUTE.index = idx; refreshRoutePanel(); refreshItineraryDots(); ensureSystemsBuilt(); }

      /* mise en orbite/livraison à CHAQUE étape de l'itinéraire, pas
         seulement à la fin : dès que le vaisseau approche le point
         d'approche de l'étape en cours de livraison (ROUTE.nextDelivery,
         suivi séparément de ROUTE.index pour éviter tout conflit d'ordre
         entre les deux seuils), on déclenche la manœuvre. Seule la
         DERNIÈRE étape entraîne le calcul d'un nouvel itinéraire complet ;
         pour les autres, le vaisseau reprend simplement sa route existante
         vers l'étape suivante une fois la livraison terminée. */
      if(ROUTE.nextDelivery < ROUTE.legs.length && ROUTE.s > ROUTE.legS[ROUTE.nextDelivery] - 180){
        const deliverIdx = ROUTE.nextDelivery;
        const destPlanet = ROUTE.legs[deliverIdx].planet;
        const isLastLeg = (deliverIdx === ROUTE.legs.length - 1);
        ROUTE.nextDelivery++;
        startOrbitDelivery(destPlanet, isLastLeg);
        if(isLastLeg){
          const curFwd = new THREE.Vector3(0,0,-1).applyQuaternion(shipRig.quaternion);
          computeRoute(shipRig.position, curFwd, false);
        }
        flightPhase = 'ARRIVAL_PAUSE';
        pauseTimer = 0;
      }
    }

    if(manual){
      tx += -pitchInput * TORQUE.pitch;
      ty +=  yawInput   * TORQUE.yaw;
      tz += -rollKey    * TORQUE.roll;

      /* la souris agit comme un manche : impulsion proportionnelle au geste */
      if(dragYaw || dragPitch){
        ty += dragYaw   * TORQUE.yaw   * 55;
        tx += dragPitch * TORQUE.pitch * 55;
        dragYaw = 0; dragPitch = 0;
      }
    } else if(flightPhase !== 'ARRIVAL_PAUSE'){
      /* --- AUTOPILOTE : SUIVI DE COURBE PAR CHAMP DE VECTEURS ---
       Objectif : rester CENTRÉ dans les portiques. Viser l'étoile en ligne
       droite ferait couper les virages ; la poursuite pure seule oscille,
       car la visée est courte face au rayon de virage du vaisseau (~110 u).

       Trois éléments, tous nécessaires :
       1. direction voulue = tangente à la courbe + rappel latéral vers elle ;
       2. anticipation de courbure : on lit la courbe plus loin pour connaître
          À L'AVANCE la vitesse de rotation à établir, au lieu de réagir après
          coup (une masse pareille ne rattrape pas son retard) ;
       3. asservissement en cascade : la boucle externe produit une consigne
          de VITESSE ANGULAIRE (vecteur), la boucle interne la convertit en
          couple.

       Point critique : la boucle interne asservit les DEUX composantes du
       vecteur vitesse angulaire. Ne piloter que sa projection sur l'axe de
       correction laisse la composante perpendiculaire libre de diverger —
       le vaisseau finit en rotation saturée, dix fois plus vite que
       nécessaire, et sort du couloir. */
      if(ROUTE.curve && ROUTE.length > 0){
        const L = ROUTE.length;
        /* direction voulue : tangente + rappel vers la courbe
           (ROUTE.s déjà mis à jour par le suivi de route ci-dessus) */
        const LD = 180, KC = 1.4;      /* pondération tangente / rappel latéral */
        const here = ROUTE.curve.getPointAt(ROUTE.s/L, _routeTmpA);
        const ahead = ROUTE.curve.getPointAt(Math.min((ROUTE.s+2)/L, 1), _routeTmpB);
        const tang = _routeTmpC.copy(ahead).sub(here).normalize();
        const desired = _routeTmpD.copy(tang).multiplyScalar(LD)
          .addScaledVector(_routeTmpE.copy(here).sub(shipRig.position), KC)
          .normalize();

        /* anticipation : rotation que la courbe imposera un peu plus loin */
        const LF = 140;
        const m0 = ROUTE.curve.getPointAt(Math.min((ROUTE.s+LF)/L, 1), _routeTmpA);
        const m1 = ROUTE.curve.getPointAt(Math.min((ROUTE.s+2*LF)/L, 1), _routeTmpB);
        const tang2 = _routeTmpE.copy(m1).sub(m0).normalize();
        const turn = _routeTmpF.crossVectors(tang, tang2);
        const turnLen = turn.length();
        let wffx = 0, wffy = 0;
        if(turnLen > 1e-9){
          const kappa = Math.asin(THREE.MathUtils.clamp(turnLen,-1,1))/LF;
          const wFF = currentSpeed*kappa;
          /* axe de rotation ramené dans le repère local du vaisseau */
          turn.divideScalar(turnLen).applyQuaternion(_qInv.copy(shipRig.quaternion).invert());
          wffx = wFF*turn.x; wffy = wFF*turn.y;
        }

        /* erreur de cap, en axe-angle (bien défini pour tout angle) */
        const local = _routeTmpA.copy(desired)
          .applyQuaternion(_qInv.copy(shipRig.quaternion).invert());
        let ax = local.y, ay = -local.x;
        const axLen = Math.hypot(ax, ay);
        const angle = Math.atan2(axLen, -local.z);

        const KP = 1.2, KW = 8;
        let wdx = wffx, wdy = wffy;
        if(axLen > 1e-6){
          ax /= axLen; ay /= axLen;
          wdx += ax*angle*KP; wdy += ay*angle*KP;
        }
        /* plafond de la consigne, cohérent avec les limites mécaniques */
        const wdm = Math.hypot(wdx, wdy);
        if(wdm > 0.36){ wdx *= 0.36/wdm; wdy *= 0.36/wdm; }

        tx += THREE.MathUtils.clamp((wdx - angVel.x)*KW, -1, 1) * TORQUE.pitch;
        ty += THREE.MathUtils.clamp((wdy - angVel.y)*KW, -1, 1) * TORQUE.yaw;
        /* remise à plat lente du roulis */
        tz += THREE.MathUtils.clamp(-angVel.z*1.6, -1, 1) * TORQUE.roll * 0.5;
      }
    }
  }

  /* --- intégration : couple -> vitesse angulaire --- */
  angVel.x += tx*dt;
  angVel.y += ty*dt;
  angVel.z += tz*dt;

  /* amortissement actif sur les axes sans commande (tuyères de maintien) */
  const damp = Math.exp(-ANG_DAMP*dt);
  if(Math.abs(tx) < 1e-4) angVel.x *= damp;
  if(Math.abs(ty) < 1e-4) angVel.y *= damp;
  if(Math.abs(tz) < 1e-4) angVel.z *= damp;

  angVel.x = THREE.MathUtils.clamp(angVel.x, -ANG_MAX.pitch, ANG_MAX.pitch);
  angVel.y = THREE.MathUtils.clamp(angVel.y, -ANG_MAX.yaw,   ANG_MAX.yaw);
  angVel.z = THREE.MathUtils.clamp(angVel.z, -ANG_MAX.roll,  ANG_MAX.roll);

  applyAngular(dt);

  /* --- les tuyères soufflent selon le COUPLE réellement appliqué ---
     Seuil : une correction infime ne doit pas déclencher un jet visible. */
  const TQ_TH = 0.02;
  if(Math.abs(tx) > TQ_TH) rcsDemand.pitch = Math.sign(tx);
  if(Math.abs(ty) > TQ_TH) rcsDemand.yaw   = Math.sign(ty);
  if(Math.abs(tz) > TQ_TH) rcsDemand.roll  = Math.sign(tz);

  const boosting = !paused && !!(keys['ShiftLeft']||keys['ShiftRight']||keys['Space']);
  let forward;
  if(paused){
    /* position et orientation pilotées par la mécanique orbitale, pas par
       l'intégration couple/vitesse habituelle */
    forward = updateOrbitDelivery(dt);
  } else {
    /* ralentissement à l'approche d'une étape : le vaisseau doit avoir
       nettement réduit sa vitesse avant que les transmissions radio ne
       commencent, plutôt que d'entamer l'échange en filant encore à
       pleine vitesse. */
    let approachScale = 1;
    if(ROUTE.legS && ROUTE.nextDelivery < ROUTE.legS.length){
      const distToArrival = ROUTE.legS[ROUTE.nextDelivery] - ROUTE.s;
      const ZONE = 950;
      if(distToArrival <= ZONE && distToArrival >= -300){
        const t = THREE.MathUtils.clamp(distToArrival/ZONE, 0, 1);
        approachScale = THREE.MathUtils.lerp(0.28, 1, t);
      }
    }
    /* PROPULSION SUPRALUMINIQUE (v2.15) : croisière multipliée par WARP_FACTOR
       (5 à 10 selon la masse), engagée progressivement loin des étapes et
       coupée assez tôt pour retrouver la vitesse normale avant la zone
       d'approche — arrivée, orbite et navettes restent inchangées. */
    let warpTarget = 0;
    if(SHIP_WARP && fuel > 0){
      const dA = (ROUTE.legS && ROUTE.nextDelivery < ROUTE.legS.length) ? ROUTE.legS[ROUTE.nextDelivery] - ROUTE.s : Infinity;
      if(dA > 950 + currentSpeed*1.2) warpTarget = 1;        /* ~1,2 s de décélération : la vitesse normale est retrouvée avant la zone d'approche */
    }
    WARP_LEVEL += (warpTarget - WARP_LEVEL)*Math.min(1, dt*(warpTarget > WARP_LEVEL ? 1.0 : 1.6));
    const warpMul = 1 + (WARP_FACTOR - 1)*WARP_LEVEL;
    const targetSpeed = effectiveCruiseSpeed()
      * (boosting && fuel > 0 && WARP_LEVEL < 0.2 ? BOOST_MULT : 1)
      * warpMul
      * approachScale
      * (fuel > 0 ? 1 : FUEL_EMPTY_SPEED_SCALE);
    currentSpeed += (targetSpeed-currentSpeed)*Math.min(1, dt*2.2);
    forward = new THREE.Vector3(0,0,-1).applyQuaternion(shipRig.quaternion);
    const fuelDist = currentSpeed*dt;
    shipRig.position.addScaledVector(forward, fuelDist);

    /* consommation (§22.2) : proportionnelle à la distance ET au régime —
       pas seulement à la distance seule, sans quoi une amélioration
       Propulseurs coûterait plus cher en carburant pour rien. Seule la
       croisière normale (cette branche) consomme ; la manœuvre d'orbite
       (branche « paused » ci-dessus) suit son propre mouvement paramétrique,
       hors du champ du calcul de §22.1. */
    const cruiseRef = effectiveCruiseSpeed();
    if(fuel > 0 && cruiseRef > 0 && fuelDist > 0){
      const regime = currentSpeed / (cruiseRef*warpMul);   /* la bulle est alimentée par le réacteur : consommation au km inchangée */
      fuel = Math.max(0, fuel - fuelDist * Math.pow(regime, FUEL_CONSUMPTION_EXPONENT));
    }
  }

  const speedlines = document.getElementById('speedlines');
  speedlines.style.opacity = String(Math.max(boosting ? 0.5 : 0, 0.45*WARP_LEVEL));

  /* réacteurs : le cœur et le panache réagissent à la poussée.
     Scintillement volontairement faible (±2 %) et lent : un moteur de
     croisière doit paraître stable, pas clignotant. */
  const glowScale = boosting ? 4.4 : 3.0;
  /* puissance affichée = ratio de la vitesse de consigne réellement établie
     sur la vitesse maximale ; c'est la même grandeur physique qui pilote
     déjà le déplacement, donc jauges et mouvement ne peuvent pas diverger */
  const enginePowerBase = THREE.MathUtils.clamp(currentSpeed/(effectiveCruiseSpeed()*BOOST_MULT), 0, 1);
  const mainPowers = [];
  (window.__engineGlows||[]).forEach(function(g, i){
    g.scale.set(glowScale,glowScale,1);
    const flicker = 0.98 + 0.02*Math.sin(elapsed*3.2 + g.position.x*3.1);
    mainPowers[i] = THREE.MathUtils.clamp(enginePowerBase*flicker, 0, 1);
  });
  if(!jumpState) SHIPGEN.FTL_U.uField.value = 0.45*WARP_LEVEL;   /* bulle de distorsion pendant la croisière supraluminique */
  SHIPGEN.tick(elapsed, dt, jumpState ? WARP_SPIN : 1 + 5*WARP_LEVEL);
  SHIPGEN.setDrive({ throttle: WARP_THR !== null ? WARP_THR : (boosting ? 1.0 : 0.3 + 0.5*enginePowerBase) });
  (window.__engineCones||[]).forEach(function(c){
    /* le panache s'allonge et s'intensifie en propulsion
       (facteur borné : au-delà, la pointe viendrait traverser la caméra) */
    const stretch = boosting ? 1.45 : 1.0;
    const flicker = 0.98 + 0.02*Math.sin(elapsed*3.2 + c.position.x*3.1);
    c.scale.set(1, stretch*flicker, 1);
    c.material.opacity = (boosting ? 0.42 : 0.26) * flicker;
  });
  (window.__navLights||[]).forEach(function(m){ m.opacity = 0.4+0.6*Math.abs(Math.sin(elapsed*3 + (m===window.__navLights[1]?Math.PI:0))); });

  /* ---------- tuyères d'attitude ----------
     Montée rapide à l'allumage, extinction plus lente : c'est cette
     asymétrie qui donne la sensation d'une bouffée de gaz qui se dissipe
     plutôt que d'un interrupteur. */
  const rise = 1 - Math.exp(-dt*22);
  const fall = 1 - Math.exp(-dt*6);
  function ramp(cur, target){
    return cur + (target - cur) * (target > cur ? rise : fall);
  }
  rcsLevel.yawP   = ramp(rcsLevel.yawP,   rcsDemand.yaw   > 0.05 ? 1 : 0);
  rcsLevel.yawN   = ramp(rcsLevel.yawN,   rcsDemand.yaw   < -0.05 ? 1 : 0);
  rcsLevel.pitchP = ramp(rcsLevel.pitchP, rcsDemand.pitch > 0.05 ? 1 : 0);
  rcsLevel.pitchN = ramp(rcsLevel.pitchN, rcsDemand.pitch < -0.05 ? 1 : 0);
  rcsLevel.rollP  = ramp(rcsLevel.rollP,  rcsDemand.roll  > 0.05 ? 1 : 0);
  rcsLevel.rollN  = ramp(rcsLevel.rollN,  rcsDemand.roll  < -0.05 ? 1 : 0);

  (window.__rcs||[]).forEach(function(t){
    const key = t.axis + (t.sign > 0 ? 'P' : 'N');
    const lvl = rcsLevel[key] || 0;
    t.currentLevel = lvl;   /* lu par le panneau de jauges et la télémétrie */
    if(lvl < 0.01){ t.jet.material.opacity = 0; t.jet.visible = false; return; }
    /* crépitement rapide propre à chaque tuyère : jet de gaz sous pression */
    const sput = 0.75 + 0.25*Math.sin(elapsed*38 + t.jet.position.x*7.7 + t.jet.position.y*4.3);
    t.jet.visible = true;
    t.jet.material.opacity = lvl * 0.75 * sput;
    /* la trainée s'allonge dans SON axe (Y local du cône = axe d'éjection) :
       facteur 2 sur la longueur, l'épaisseur restant contenue */
    const w = t.base * (0.65 + lvl*0.45) * (0.85 + 0.15*sput);
    const l = t.base * (0.8 + lvl*1.6) * (0.80 + 0.20*sput) * 2.0;
    t.jet.scale.set(w, l, w);
  });

  /* ---------- panneau de jauges : lecture directe des grandeurs ci-dessus ---------- */
  (window.__gaugeEls.main||[]).forEach(function(g, i){
    const pct = Math.round((mainPowers[i]||0)*100);
    if(g.fill) g.fill.style.height = pct+'%';
    if(g.pct)  g.pct.textContent = pct+'%';
  });
  (window.__gaugeEls.rcs||[]).forEach(function(g){
    if(g.fill) g.fill.style.height = Math.round((g.thruster.currentLevel||0)*100)+'%';
  });

  /* jauge carburant (§22.4) : classe warn/crit sous les seuils plutôt qu'une
     couleur recalculée en JS à chaque image (cf. règles CSS .gauge.fuel). */
  const fuelPctEl = document.getElementById('fuelPct');
  const fuelFillEl = document.getElementById('fuelFill');
  const fuelGaugeEl = document.getElementById('fuelGauge');
  if(fuelFillEl){
    const fuelRatio = fuel / FUEL_CAPACITY;
    fuelFillEl.style.height = Math.round(fuelRatio*100)+'%';
    if(fuelPctEl) fuelPctEl.textContent = Math.round(fuelRatio*100)+'%';
    if(fuelGaugeEl){
      fuelGaugeEl.classList.toggle('crit', fuelRatio < FUEL_CRIT_RATIO);
      fuelGaugeEl.classList.toggle('warn', fuelRatio >= FUEL_CRIT_RATIO && fuelRatio < FUEL_WARN_RATIO);
    }
  }

  /* ---------- dialogue de télémétrie : commandes envoyées aux moteurs ---------- */
  updateTelemetryPanel(mainPowers, boosting);
  updateEngineTemps(mainPowers, dt);

  /* ---------- balises clignotantes de la nacelle ----------
     Chaque balise suit son propre cycle : phase et période distinctes,
     avec un rapport cyclique court (éclat bref) et un fondu en sortie. */
  (window.__beacons||[]).forEach(function(b){
    const t = ((elapsed + b.phase) % b.period) / b.period;
    let v = 0;
    if(t < b.duty){
      /* éclat : montée quasi instantanée puis décroissance */
      v = Math.pow(1 - t/b.duty, 1.6);
    }
    b.mat.opacity = v * b.peak;
  });

  /* ---------- respiration douce de la baie du dock ----------
     Contrairement aux balises (éclat bref, cyclique), la baie reste
     allumée en permanence — seule son intensité varie légèrement, pour
     donner une impression de système actif plutôt qu'un néon statique. */
  const dockPulse = 0.85 + 0.15*Math.sin(elapsed*0.6);
  if(window.__dockGlow) window.__dockGlow.mat.emissiveIntensity = window.__dockGlow.baseIntensity * dockPulse;
  if(window.__dockHalos) window.__dockHalos.forEach(function(h){ h.material.opacity = h.userData.baseOpacity !== undefined ? h.userData.baseOpacity*dockPulse : h.material.opacity; });
  if(window.__dockLight) window.__dockLight.intensity = 1.4 * dockPulse;

  /* caméra : poursuite normale, ou plan cinématique orbitant la PLANÈTE
     pendant la mise en orbite/livraison — pour garder le vaisseau ET la
     planète dans le cadre. Les deux branches écrivent dans les MÊMES
     variables partagées (camPos/camLook) : la transition reste amortie par
     le lerp, jamais de saut brutal au changement d'état. */
  if(paused){
    arrivalTimeScale = arrivalSkip ? ARRIVAL_FF_SCALE : 1;
    pauseTimer += dt*arrivalTimeScale;
    const os = orbitState;

    if(os.cutawayUntil > pauseTimer){
      /* ---------- mise en scène du largage : gros plan sur le dock, puis
         suivi selon la séquence tirée au hasard pour CETTE navette
         (catalogue de 4, §15 de la spec) ----------
         « travelling » excepté, les trois autres séquences comportent une
         COUPURE FRANCHE (pas un fondu) entre le gros plan et le suivi —
         cutawayCut n'autorise ce saut qu'une fois par largage.

         Correctif (bugs remontés en jeu) : le suivi utilisait les axes
         PROPRES du vaisseau (shipRight/shipUp/shipFwd), recalculés à
         chaque image depuis son orientation réelle — or le vaisseau
         tourne en continu pendant toute la mise en orbite (son nez doit
         suivre la tangente de la trajectoire circulaire). La caméra de
         suivi héritait donc de ce balayage permanent, ce qui donnait une
         image mal centrée et instable (« tremblement »). Le suivi
         s'ancre maintenant sur le repère STABLE de l'orbite (os.U/V/N,
         fixé une fois pour toute l'escale) plutôt que sur des axes qui
         tournent sous la caméra. Les distances ont aussi été resserrées :
         la navette, trop petite à l'écran, restait à peine identifiable. */
      const shuttle = os.shuttles.find(function(s){ return s.id === os.cutawayShuttleId; });
      const dockPos = new THREE.Vector3();
      if(window.shipDockAnchor) window.shipDockAnchor.getWorldPosition(dockPos);
      else dockPos.copy(shipRig.position);
      const shipUp = new THREE.Vector3(0,1,0).applyQuaternion(shipRig.quaternion);
      const shipRight = new THREE.Vector3(1,0,0).applyQuaternion(shipRig.quaternion);
      const shipFwd = new THREE.Vector3(0,0,-1).applyQuaternion(shipRig.quaternion);
      /* repère stable de l'orbite (ne tourne pas avec le vaisseau) —
         orienté de façon cohérente avec shipRight/shipUp au moment du
         largage, pour que la séquence tirée garde le même « sens » visuel
         qu'avant ce correctif.
         Correctif (bug remonté en jeu) : le PLAN RAPPROCHÉ de chargement
         (closeUpPos, juste en dessous) utilisait encore shipRight/shipUp/
         shipFwd — vivants, recalculés à chaque image depuis l'orientation
         RÉELLE du vaisseau — alors que celui-ci tourne en continu pendant
         toute la manœuvre d'orbite. Le cadrage du gros plan balayait donc
         un angle totalement différent d'une image à l'autre (vérifié :
         coque à t=0.2s, tuyères à t=1.5s, coque sous un autre angle à
         t=3.3s, pour une seule et même prise) — perçu comme un tremblement
         du vaisseau, et empêchait de voir clairement le dock ou la navette
         en sortir. Le correctif précédent n'avait stabilisé que le plan de
         SUIVI (après la coupure) ; le plan RAPPROCHÉ, juste avant, avait le
         même défaut et n'avait pas été couvert. Un troisième axe stable
         (stableFwd) complète stableRight/stableUp ci-dessous, sur le même
         principe. */
      const stableRight = os.U.clone().multiplyScalar(os.U.dot(shipRight) >= 0 ? 1 : -1);
      const stableUp    = os.N.clone().multiplyScalar(os.N.dot(shipUp)    >= 0 ? 1 : -1);
      const stableFwd   = os.V.clone().multiplyScalar(os.V.dot(shipFwd)   >= 0 ? 1 : -1);
      const shuttlePos = shuttle ? shuttle.group.position : dockPos;
      const seq = os.cutawaySeq || 'lateral';

      const p = Math.max(0, pauseTimer - os.cutawayStart);
      const closeT = Math.min(1, p / SHUTTLE_CLOSEUP_DURATION);

      /* cadrage du gros plan de chargement : ni le dock seul, ni le stock
         seul — un point de vue reculé qui cadre les deux à la fois, pour
         que le geste du bras (qui va de l'un à l'autre) reste lisible
         d'un bout à l'autre, plutôt qu'un cadrage centré sur le seul
         dock qui coupait le stock hors champ. */
      const stagePos = new THREE.Vector3();
      if(window.shipCargoStageAnchor) window.shipCargoStageAnchor.getWorldPosition(stagePos);
      else stagePos.copy(dockPos);
      const loadMidpoint = dockPos.clone().lerp(stagePos, 0.5);
      const closeUpPos = loadMidpoint.clone()
        .addScaledVector(stableRight, 9).addScaledVector(stableUp, -1.5).addScaledVector(stableFwd, 5);
      const closeUpLook = loadMidpoint;

      let desiredPos, desiredLook, lerpRate, lookLerpRate;

      if(seq === 'travelling'){
        /* pas de coupure : un seul mouvement continu du gros plan au suivi
           rapproché — distance divisée par plus de 2 par rapport à avant */
        const farPos = dockPos.clone().addScaledVector(stableRight, 38).addScaledVector(stableUp, 15);
        const t = Math.min(1, p / CUTAWAY_DURATION);
        const ease = t*t*(3-2*t);
        desiredPos = closeUpPos.clone().lerp(farPos, ease);
        desiredLook = closeUpLook.clone().lerp(shuttlePos, ease);
        lerpRate = 3.2; lookLerpRate = 3.2;
        /* évitement d'obstacles seulement une fois assez éloigné du cargo
           (ease > 0.5) : en tout début de mouvement, la caméra EST tout
           près de la coque par construction (départ sur closeUpPos, cf.
           bug du plan rapproché plus haut) — l'exclure dès l'obstacle
           entier ferait sursauter la caméra dès la première image. */
        if(ease > 0.5){
          const camObstacles = [{ center: shipRig.position, radius: SHIP_HULL_RADIUS }];
          if(orbitState.planet) camObstacles.push({ center: orbitState.planet.position, radius: orbitState.planet.radius });
          clearCameraObstacles(desiredPos, desiredLook, camObstacles);
        }
      } else if(closeT < 1){
        /* phase de gros plan, commune aux trois séquences à coupure */
        desiredPos = closeUpPos;
        desiredLook = closeUpLook;   /* même cadrage de chargement quelle que soit la séquence tirée */
        lerpRate = 7; lookLerpRate = 7;
      } else {
        /* phase de suivi, propre à chaque séquence — ancrée sur le repère
           stable de l'orbite, pas sur les axes rotatifs du vaisseau. La
           coupure elle-même (saut instantané) est appliquée juste après
           ce bloc. */
        if(seq === 'face'){
          /* suivi latéral large : le port de destination entre progressivement dans le cadre */
          desiredPos = dockPos.clone().addScaledVector(stableRight, 42).addScaledVector(stableUp, 6);
          const target = orbitState.planet ? orbitState.planet.position : shuttlePos;
          desiredLook = shuttlePos.clone().lerp(target, 0.3);
        } else if(seq === 'shoulder'){
          /* plan fixe SOLIDAIRE DE L'ORBITE (plus du vaisseau) : la navette s'éloigne dans le cadre */
          desiredPos = dockPos.clone()
            .addScaledVector(stableRight, 15).addScaledVector(stableUp, 6).addScaledVector(stableFwd, 4);
          desiredLook = shuttlePos;
        } else {
          /* « lateral » : suivi à distance rapprochée, légèrement en hauteur-arrière */
          desiredPos = shuttlePos.clone().addScaledVector(stableRight, 26).addScaledVector(stableUp, 17);
          desiredLook = shuttlePos;
        }
        /* suivi plus réactif qu'avant (2.0 → 4.5) : la navette, en pleine
           accélération sur son arc, sortait du cadre le temps que la
           caméra la rattrape — d'où l'impression de cadrage décentré. */
        lerpRate = 4.5; lookLerpRate = 6;

        /* évitement d'obstacles (bug remonté en jeu) : la cible de ces trois
           séquences est la NAVETTE, pas le cargo — qui reste pourtant un
           obstacle massif tout proche du point de départ. Repéré très
           concrètement en testant chaque séquence : « shoulder » plaçait la
           caméra à ~17 unités du point d'ancrage, à l'intérieur même de la
           coque (rayon mesuré ~20). Le cargo est donc traité ici comme un
           obstacle à contourner, jamais comme la cible — cf. clearCameraObstacles
           plus haut. La planète cible s'ajoute quand elle existe, même logique. */
        const camObstacles = [{ center: shipRig.position, radius: SHIP_HULL_RADIUS }];
        if(orbitState.planet) camObstacles.push({ center: orbitState.planet.position, radius: orbitState.planet.radius });
        clearCameraObstacles(desiredPos, desiredLook, camObstacles);
      }

      /* coupure franche : au premier passage en phase de suivi, on saute
         directement à la nouvelle position plutôt que d'y glisser */
      if(seq !== 'travelling' && closeT >= 1 && !os.cutawayCut){
        camPos.copy(desiredPos);
        camLook.copy(desiredLook);
        os.cutawayCut = true;
      }

      camPos.lerp(desiredPos, Math.min(1, dt*lerpRate));
      camera.position.copy(camPos);
      camLook.lerp(desiredLook, Math.min(1, dt*lookLerpRate));
      camera.up.set(0,1,0);
      camera.lookAt(camLook);
    } else {
      /* ---------- plan d'ensemble : orbite autour de la planète ----------
         Le regard libre (Ctrl+souris) décale l'angle et la hauteur de ce
         plan, pour regarder autour de soi sans interrompre la manœuvre.
         Rotation et amortissement volontairement lents : un travelling
         posé, pas un survol précipité. */
      const camAngle = pauseTimer*0.09 + os.camPhase0 + camOrbitYaw;
      const camDist = os.radius*1.9;
      const camHeight = os.radius*0.55 + Math.sin(pauseTimer*0.18)*os.radius*0.08 + camOrbitPitch*os.radius*0.6;
      const desired = os.center.clone()
        .addScaledVector(os.U, Math.cos(camAngle)*camDist)
        .addScaledVector(os.V, Math.sin(camAngle)*camDist)
        .addScaledVector(os.N, camHeight);
      camPos.lerp(desired, Math.min(1, dt*0.9));
      camera.position.copy(camPos);
      /* on regarde un point entre le vaisseau et la planète, pondéré vers la
         planète, pour que l'orbite entière (et les navettes) reste lisible */
      const lookTarget = os.center.clone().lerp(shipRig.position, 0.35);
      camLook.lerp(lookTarget, Math.min(1, dt*0.9));
      camera.up.set(0,1,0);
      camera.lookAt(camLook);
    }

    /* fin de la manœuvre : la durée minimale, la fin complète du dialogue
       radio (dernier message affiché, sa lecture terminée) ET l'atterrissage
       de toutes les navettes déjà larguées sont nécessaires — sans ces
       conditions, une voix lente, des messages nombreux ou des navettes
       ralenties pourraient se faire couper avant la fin par le simple
       minuteur. */
    const radioDone = os.radioIdx >= os.radioScript.length && !radioSpeaking;
    const shuttlesDone = os.spawned.every(Boolean) && os.shuttles.length === 0 && !os.loading;
    /* plafond défensif : si quelque chose empêchait radioDone/shuttlesDone
       de devenir vrais (cas non prévu), la manœuvre se termine quand même
       plutôt que de bloquer indéfiniment le vol. */
    const hardCap = pauseTimer >= ARRIVAL_PAUSE_DURATION*2.5;
    if((pauseTimer >= ARRIVAL_PAUSE_DURATION && radioDone && shuttlesDone) || hardCap){
      flightPhase = 'CRUISE';
      pauseTimer = 0;
      orbitState.active = false;
      arrivalSkip = false;
      arrivalTimeScale = 1;
      const radioPanel = document.getElementById('radioPanel');
      if(radioPanel) radioPanel.classList.remove('visible');
      /* le panneau services portuaires n'est plus lié au cycle de vie de
         l'escale (cf. startOrbitDelivery) — on ne le referme plus ici,
         le joueur garde la main via son icône dédiée. */
      const arrivalHint = document.getElementById('arrivalHint');
      if(arrivalHint) arrivalHint.style.display = 'none';
      if(window.speechSynthesis) window.speechSynthesis.cancel();
    }
  } else {
    arrivalTimeScale = 1;
    if(CAMERA_MODES[cameraMode] === 'sequence'){
      /* ---------- plan-séquence : orbite continue autour du vaisseau ----------
         Un plan filmé façon drone qui tourne lentement autour de l'appareil
         pendant qu'il vole, plutôt qu'une poursuite fixe derrière lui. */
      const seqAngle = elapsed*0.18;
      const seqRadius = 95;
      const seqHeight = 26 + Math.sin(elapsed*0.25)*10;
      const shipUp = new THREE.Vector3(0,1,0).applyQuaternion(shipRig.quaternion);
      const shipRight = new THREE.Vector3(1,0,0).applyQuaternion(shipRig.quaternion);
      const shipFwd = new THREE.Vector3(0,0,-1).applyQuaternion(shipRig.quaternion);
      const offset = shipRight.clone().multiplyScalar(Math.cos(seqAngle)*seqRadius)
        .addScaledVector(shipFwd, Math.sin(seqAngle)*seqRadius)
        .addScaledVector(shipUp, seqHeight);
      const desired = shipRig.position.clone().add(offset);
      /* évitement d'obstacles (bug remonté en jeu, portée générale : « lors
         de ses travelling, la caméra traverse parfois vaisseau, planète,
         objet ») : cette orbite tourne à proximité du vaisseau — la cible —
         mais peut, à certains angles, se retrouver du mauvais côté d'une
         planète toute proche pendant l'approche. Seule la planète de
         l'étape en cours entre en jeu ici (le vaisseau LUI-MÊME est la
         cible, jamais un obstacle pour son propre plan). Vérifié bon marché
         : ignoré la plupart du temps, une seule planète candidate, pas de
         parcours de liste. */
      const seqLeg = ROUTE.legs && ROUTE.legs[ROUTE.index];
      if(seqLeg && seqLeg.planet && shipRig.position.distanceTo(seqLeg.planet.position) < seqLeg.planet.radius*6){
        clearCameraObstacles(desired, shipRig.position, [{ center: seqLeg.planet.position, radius: seqLeg.planet.radius }]);
      }
      camPos.lerp(desired, Math.min(1, dt*2.2));
      camera.position.copy(camPos);
      camLook.lerp(shipRig.position, Math.min(1, dt*2.2));
      camera.up.set(0,1,0);
      camera.lookAt(camLook);
    } else if(CAMERA_MODES[cameraMode] === 'distant'){
      /* ---------- plans lointains : coupes franches, décor en fond ---------- */
      if(elapsed > distantShotState.until) pickDistantShot(elapsed);
      camera.position.copy(shipRig.position).add(distantShotState.offset);
      camPos.copy(camera.position);
      camLook.copy(shipRig.position);
      camera.up.set(0,1,0);
      camera.lookAt(camLook);
    } else {
      /* ---------- poursuite standard ----------
         Caméra en poursuite, avec un léger amortissement pour un rendu
         cinématique. Le regard libre (Ctrl+souris) tourne l'offset de
         poursuite AUTOUR du vaisseau, dans son propre repère, avant d'être
         orienté par son cap : on regarde autour de soi sans changer la
         trajectoire suivie. */
      const freeLook = new THREE.Quaternion().setFromEuler(new THREE.Euler(camOrbitPitch, camOrbitYaw, 0, 'YXZ'));
      const camQuat = shipRig.quaternion.clone().multiply(freeLook);
      const desiredCamPos = shipRig.position.clone().add(CAM_OFFSET.clone().applyQuaternion(camQuat));
      camPos.lerp(desiredCamPos, Math.min(1, dt*4.5));
      camera.position.copy(camPos);
      const desiredLook = shipRig.position.clone().add(forward.clone().multiplyScalar(45));
      camLook.lerp(desiredLook, Math.min(1, dt*4.5));
      camera.up.copy(new THREE.Vector3(0,1,0).applyQuaternion(shipRig.quaternion));
      camera.lookAt(camLook);
    }
  }

  document.getElementById('modeBadge').textContent =
    paused ? t('badge_orbit') : (manual ? t('badge_manual') : t('badge_auto'));
  document.getElementById('modeBadge').className =
    'hud-mode mono ' + (paused ? 'auto' : (manual?'manual':'auto'));
}

