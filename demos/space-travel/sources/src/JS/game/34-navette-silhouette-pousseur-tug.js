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
  /* lot N : navette-cargo (P2) et conteneur ISO 20' réels, en mètres (plus de mise à l'échelle) */
  const sh = CARGO.buildCargoShuttle(_shuttleIdCounter + 11);
  const pts = CARGO.armPoints();
  const dockPos = new THREE.Vector3();
  if(window.shipDockAnchor) window.shipDockAnchor.getWorldPosition(dockPos);
  else dockPos.copy(shipRig.position);
  sh.group.position.copy(dockPos);
  sh.group.quaternion.copy(shipRig.quaternion);
  LAYERS.shipWorld.add(sh.group);
  LAYERS.shipWorld.add(sh.trail);

  const container = CARGO.buildIsoContainer(_shuttleIdCounter*7 + 3);
  const stagePos = new THREE.Vector3();
  if(window.shipCargoStageAnchor) window.shipCargoStageAnchor.getWorldPosition(stagePos);
  else stagePos.copy(dockPos);
  container.position.copy(stagePos);
  container.quaternion.copy(shipRig.quaternion);
  LAYERS.shipWorld.add(container);

  const camSeq = SHUTTLE_CAMERA_SEQUENCES[Math.floor(Math.random()*SHUTTLE_CAMERA_SEQUENCES.length)];
  const id = ++_shuttleIdCounter;

  /* la navette attend là où la pince dépose (berceau dorsal sous le point de dépose), le conteneur là où elle saisit */
  const rest = pts ? pts.place.clone().sub(sh.clampGroup.position) : null, stage = pts ? pts.stage.clone() : null;
  if(rest){ sh.group.position.copy(CARGO.shipPoint(rest)); container.position.copy(CARGO.shipPoint(stage)); }
  sh.rest = rest;
  orbitState.loading = {
    id:id, shuttle:sh, container:container, t:0, duration:SHUTTLE_CLOSEUP_DURATION,
    camSeq:camSeq, grabbed:false, released:false, rest:rest, stage:stage
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