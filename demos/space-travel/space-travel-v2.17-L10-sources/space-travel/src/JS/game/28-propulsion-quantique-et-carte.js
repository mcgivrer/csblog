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
/* séquence de saut (§23.5) : machine à états à trois phases, mise à jour
   dans la boucle principale (updateFlight) — non interruptible, comme la
   mise en orbite. jumpState.phase vaut null hors séquence. */
let jumpState = null;
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
/* v2.17 : la carte est celle de la démo (carte 2D, src/JS/demo/starmap.js, raccordée par 20e-carte-2d.js) ;
   la carte 3D de la v2.16 est retirée. Ces trois fonctions gardent les noms appelés par la barre d'icônes
   et les raccourcis clavier. */
function isStarMapOpen(){ return !!(window.__STARMAP && window.__STARMAP.isOpen()); }
function openStarMap(){ if(gameStarted && window.__STARMAP) window.__STARMAP.open(); }
function closeStarMap(){ if(window.__STARMAP) window.__STARMAP.close(); }
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
const WARP_T = { charge:3.4, fold:1.25, flash:0.32, wave:1.7 };   /* L5 : durées de la démo v7.2.2 (battements de la géode pendant la charge) */
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
  /* L10 : profondeur de champ des gros plans (postfx.js de la démo) — la scène en tranches est rendue dans sa cible,
     la dernière tranche (0,2 → 400 m, échelle 1) fournit la profondeur du premier plan ; le reste est « à l'infini » */
  const D = (typeof GP !== 'undefined') ? GP.dof : null;
  const dof = !!(D && D.k > .01 && window.__POSTFX && window.__POSTFX.available(renderer));
  if(!WARP.active && !dof){ LAYERS.render(); return; }
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  let tex = null;
  if(dof){
    window.__POSTFX.begin(renderer, size.x, size.y); LAYERS.render();
    tex = window.__POSTFX.finish(renderer, { near: LAYERS.cfg.SLB[0], far: LAYERS.cfg.SLB[1]*1.00002, scale: 1, focus: D.focus, k: D.k, maxR: D.r*size.y, toTexture: WARP.active });
    if(!WARP.active) return;
  }
  if(!tex && (!WARP.rt || WARP.rt.width !== size.x || WARP.rt.height !== size.y)){
    if(WARP.rt) WARP.rt.dispose();
    WARP.rt = new THREE.WebGLRenderTarget(size.x, size.y, { stencilBuffer: true });   /* L10 : stencil des portails des baies (shipglass) */
    WARP.rt.texture.encoding = renderer.outputEncoding;
  }
  const u = WARP.mat.uniforms, p = shipRig.position.clone().project(camera);
  u.uCenter.value.set(p.x*0.5 + 0.5, p.y*0.5 + 0.5); u.uAspect.value = camera.aspect;
  u.uR.value = (SHIP_GAME_LEN*0.38)/(2*Math.tan(camera.fov*Math.PI/360)*Math.max(1, camera.position.distanceTo(shipRig.position)));
  if(!tex){ renderer.setRenderTarget(WARP.rt); LAYERS.render(); renderer.setRenderTarget(null); tex = WARP.rt.texture; }
  u.tScene.value = tex; renderer.render(WARP.scene, WARP.cam);
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
    if(!jumpState.teleported && k >= 0.5){ shipMesh.scale.set(1, 1, 1); REAL.jumpTeleport(jumpState); jumpState.teleported = true; }
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
