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
const CAMERA_MODES = ['tracking','sequence','distant','closeup'];   /* L10 : gros plans (réalisateur : 20h-gros-plans.js) */
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
  const dist = (260 + Math.random()*260)*SHIP_GAME_LEN/40;   /* L10 : à l'échelle du vaisseau */
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
  const keys = {tracking:'cam_tracking', sequence:'cam_sequence', distant:'cam_distant', closeup:'cam_closeup'};   /* L10 : gros plans */
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
