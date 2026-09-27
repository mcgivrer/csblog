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
  if(REAL.active) return;   /* L2.2 : saut entre étoiles à l'échelle réelle = L2.4 */
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
  if(LAYERS.skipRender) return;   /* tests : simulation sans rendu */
  if(!WARP.active){ LAYERS.render(); return; }
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  if(!WARP.rt || WARP.rt.width !== size.x || WARP.rt.height !== size.y){
    if(WARP.rt) WARP.rt.dispose();
    WARP.rt = new THREE.WebGLRenderTarget(size.x, size.y); WARP.rt.texture.encoding = renderer.outputEncoding;
  }
  const u = WARP.mat.uniforms, p = shipRig.position.clone().project(camera);
  u.uCenter.value.set(p.x*0.5 + 0.5, p.y*0.5 + 0.5); u.uAspect.value = camera.aspect;
  u.uR.value = (SHIP_GAME_LEN*0.38)/(2*Math.tan(camera.fov*Math.PI/360)*Math.max(1, camera.position.distanceTo(shipRig.position)));
  renderer.setRenderTarget(WARP.rt); LAYERS.render(); renderer.setRenderTarget(null);
  u.tScene.value = WARP.rt.texture; renderer.render(WARP.scene, WARP.cam);
}
function warpSmooth(x){ x = Math.max(0, Math.min(1, x)); return x*x*(3 - 2*x); }
function endWarpJump(){
  WARP.active = false; WARP_THR = null; WARP_SPIN = 1; SHIPGEN.JUMP_U.uCharge.value = 0; shipMesh.scale.set(1, 1, 1); shipMesh.position.set(0, 0, 0); hideJumpGrid();
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
  /* quadrillage d'espace-temps (v2.16, §31.4) : puits, torsion, opacité, onde ; glissement du vaisseau dans le puits */
  let depth = 0, twist = 0, gop = 0, gRip = 0, gRipA = 0, slide = 0;
  const slideOf = function(x){ const e = Math.min(1, Math.max(0, (x - T1)/(WARP_T.fold + WARP_T.flash*0.5))); return e*e; };
  const arrival = function(u){      /* à l'arrivée : un nouveau puits se referme en ondulant */
    const e = Math.min(1, u/(T4 - T2 - WARP_T.flash*0.5));
    depth = 0.9*Math.exp(-e*4.6)*Math.cos(e*8.0); twist = -2.2*Math.exp(-e*3.6); gop = 1 - warpSmooth((e - 0.45)/0.55);
    gRip = 0.04 + 1.0*e; gRipA = 0.07*(1 - e);
  };
  if(tt < T1){            /* charge : moteurs coupés, anneaux qui montent en régime, bulle */
    const k = warpSmooth(tt/T1); field = k; spin = 1 + 5*k; lens = 0.12*warpSmooth((tt - 0.8)/(T1 - 0.8));
    thr = 0.05 + 0.3*(1 - k); vig = 0.45*k;
    depth = 0.55*k*k; twist = 0.5*k; gop = warpSmooth(tt/0.8);
  } else if(tt < T2){     /* pli : l'espace se creuse autour du vaisseau, qui s'étire */
    const e = Math.pow((tt - T1)/WARP_T.fold, 2); field = 1 + 0.8*e; spin = 6 + 12*e; lens = 0.12 + 0.88*e; stretch = e; chroma = 0.015 + 0.05*e;
    depth = 0.55 + 0.75*e; twist = 0.5 + 2.6*e; gop = 1; slide = slideOf(tt);
  } else if(tt < T3){     /* saut : éclair, téléportation au milieu */
    const k = (tt - T2)/WARP_T.flash; flash = Math.sin(k*Math.PI);
    if(!jumpState.teleported && k >= 0.5){ shipMesh.scale.set(1, 1, 1); if(jumpState.real) REAL.jumpTeleport(jumpState); else performQuantumTeleport(jumpState); jumpState.teleported = true; }
    stretch = jumpState.teleported ? 0 : 1 + k; lens = jumpState.teleported ? 0.8 : 1; field = jumpState.teleported ? 0.6 : 1.8; spin = 18;
    ripple = jumpState.teleported ? 0.02 : 0; rAmp = 0.03; chroma = 0.06;
    if(jumpState.teleported) arrival(tt - (T2 + WARP_T.flash*0.5));
    else { depth = 1.3 + 0.3*k; twist = 3.1; gop = 1; slide = slideOf(tt); }
  } else if(tt < T4){     /* onde : à l'arrivée, l'espace se relâche */
    const k = (tt - T3)/WARP_T.wave; lens = 0.8*(1 - warpSmooth(k)); ripple = 0.02 + 1.3*k; rAmp = 0.03*(1 - k);
    chroma = 0.04*(1 - k); field = 0.6*(1 - k); thr = 0.05 + 0.3*warpSmooth(k); vig = 0.45*(1 - k);
    arrival(tt - (T2 + WARP_T.flash*0.5));
  } else { endWarpJump(); return; }
  WARP.active = true; WARP_THR = thr; WARP_SPIN = spin;
  SHIPGEN.JUMP_U.uCharge.value = field;
  const sz = 1 + 1.3*stretch, sxy = 1/(1 + 0.5*stretch); shipMesh.scale.set(sxy, sxy, sz);
  const u = WARP.mat.uniforms; u.uLens.value = lens; u.uRipple.value = ripple; u.uRippleAmp.value = rAmp; u.uFlash.value = flash*0.9; u.uChroma.value = chroma;
  if(vignette) vignette.style.opacity = String(vig);
  if(flashEl) flashEl.style.opacity = String(flash*0.5);
  setJumpGrid(depth, twist, gop, gRip, gRipA, tt);
  shipMesh.position.set(0, -SHIP_GAME_LEN*0.3*slide, 0);    /* le vaisseau glisse dans le puits avant de disparaître */
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
