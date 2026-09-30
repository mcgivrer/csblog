/* =========================================================================
   L10 — GROS PLANS ET PROFONDEUR DE CHAMP
   - nouveau mode de caméra « GROS PLANS » (cycle des modes, touche et icône habituelles) :
     un réalisateur enchaîne des plans rapprochés du vaisseau du joueur, coupes franches toutes
     les 6 à 9 s — tuyères, géode (si générateur posé), anneaux de distorsion (long-courriers),
     proue et passerelle, travelling le long de la coque, module d'amarrage. Caméras calculées
     dans le repère du vaisseau à chaque image (valables à toute vitesse, retournements compris)
     et toujours hors de sa boîte englobante (jamais dans la coque) — même principe que la démo ;
   - plans des navettes pendant l'escale (coupés depuis L2.3 à l'échelle réelle, la caméra
     perdait la navette) : chargement au module d'amarrage, puis suivi de la navette qui part
     vers la planète — dans le repère de la navette, donc sans retard ; automatiques, quel que
     soit le mode de caméra, sauf en escale abrégée (Entrée) ;
   - profondeur de champ (postfx.js de la démo) sur tous ces plans : ouverture tirée par plan
     (0,45 à 0,75 % de la hauteur d'image), mise au point sur le point visé et lissée, ouverture
     progressive ; coupée si la résolution dynamique descend sous 0,7 (?dof=1 : jamais coupée,
     ?dof=0 : jamais de flou) ;
   - les modes « plan-séquence » et « plans lointains » gardaient leurs distances de l'ancien jeu
     (95 m, 260 à 520 m) : désormais proportionnelles à la longueur du vaisseau.
   Inactif pendant un saut, une distorsion, le plan extérieur du départ et le survol du système.
   ========================================================================= */
const GP = (function(){
const V3 = THREE.Vector3;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = x => { x = clamp(x, 0, 1); return x*x*(3 - 2*x); };
const Q = new URLSearchParams(location.search);
const DOF_ON = Q.get('dof') !== '0', DOF_FORCE = Q.get('dof') === '1';
const dof = { k: 0, focus: 50, r: .006, want: 0, off: false };
const S = { shot: null, auto: null, recent: [], seen: new WeakSet(), loadShot: null, baseFov: null };

/* le mode 'closeup' est déclaré dans CAMERA_MODES (module 24, chargé après celui-ci) */

function axes(){ const q = shipRig.quaternion; return { fw: new V3(0, 0, -1).applyQuaternion(q), up: new V3(0, 1, 0).applyQuaternion(q), rt: new V3(1, 0, 0).applyQuaternion(q) }; }
function hullBox(){ return SHIP_BUILD && SHIP_BUILD.hullBox ? SHIP_BUILD.hullBox : new THREE.Box3(new V3(-5, -5, -25), new V3(5, 5, 25)); }
function world(v){ return SHIP_HULL ? SHIP_HULL.localToWorld(v.clone()) : shipRig.position.clone().add(v); }
/* jamais dans la coque : un point dans la boîte (élargie de 4 %) est repoussé vers la face la plus proche */
function outside(p){
  if(!SHIP_HULL) return p;
  const B = hullBox().clone().expandByScalar(hullBox().getSize(new V3()).length()*.04), l = SHIP_HULL.worldToLocal(p.clone());
  if(!B.containsPoint(l)) return p;
  const d = [l.x - B.min.x, B.max.x - l.x, l.y - B.min.y, B.max.y - l.y, l.z - B.min.z, B.max.z - l.z], i = d.indexOf(Math.min(...d));
  if(i === 0) l.x = B.min.x; else if(i === 1) l.x = B.max.x; else if(i === 2) l.y = B.min.y; else if(i === 3) l.y = B.max.y; else if(i === 4) l.z = B.min.z; else l.z = B.max.z;
  return SHIP_HULL.localToWorld(l);
}
/* ---------- plans du vaisseau ---------- */
const SHOTS = {
  engine: { ok: () => true, make(s){ return k => { const B = hullBox(), L = SHIP_GAME_LEN, W = B.max.x - B.min.x, H = B.max.y - B.min.y, a = axes();
      const dc = SHIP_BUILD && SHIP_BUILD.group.userData.driveCenter ? SHIP_BUILD.group.userData.driveCenter : new V3(0, 0, B.max.z);
      const A = world(dc);
      return { pos: A.clone().addScaledVector(a.rt, s*(.55*W + .12*L)).addScaledVector(a.up, .3*H).addScaledVector(a.fw, -(.36 - .1*k)*L), look: A.clone().addScaledVector(a.fw, .06*L), up: a.up, fov: 44 }; }; } },
  geode: { ok: () => !!(window.SHIPFX && SHIPFX.state.geo), make(s){ return k => { const G = SHIPFX.state.geo, A = G.core.getWorldPosition(new V3()), a = axes();
      const d = Math.max(.14*SHIP_GAME_LEN, 9*G.r), ang = s*(.5 + .7*k);
      return { pos: A.clone().addScaledVector(a.rt, Math.sin(ang)*d).addScaledVector(a.fw, -Math.cos(ang)*d*.8).addScaledVector(a.up, .45*d), look: A, up: a.up, fov: 38 }; }; } },
  rings: { ok: () => !!(SHIP_BUILD && SHIP_BUILD.rings && SHIP_BUILD.rings.list.length), make(s){ return k => { const r = SHIP_BUILD.rings.list[0], P = r.pivot.getWorldPosition(new V3()), R = r.R, a = axes();
      return { pos: P.clone().addScaledVector(a.rt, s*R*(1.9 - .3*k)).addScaledVector(a.up, R*.55).addScaledVector(a.fw, -R*.9), look: P.clone().addScaledVector(a.rt, s*R*.85), up: a.up, fov: 46 }; }; } },
  bow: { ok: () => true, make(s){ return k => { const B = hullBox(), L = SHIP_GAME_LEN, W = B.max.x - B.min.x, H = B.max.y - B.min.y, a = axes(), A = world(new V3(0, .12*H, B.min.z + .06*L));
      return { pos: A.clone().addScaledVector(a.fw, (.34 - .06*k)*L).addScaledVector(a.rt, s*.62*W).addScaledVector(a.up, .26*H), look: A.clone().addScaledVector(a.fw, -.1*L), up: a.up, fov: 42 }; }; } },
  dolly: { ok: () => true, make(s){ return k => { const B = hullBox(), L = SHIP_GAME_LEN, W = B.max.x - B.min.x, H = B.max.y - B.min.y, a = axes(), z = B.min.z + .12*L + (B.max.z - B.min.z - .24*L)*smooth(k);
      return { pos: world(new V3(s*(W/2 + .38*W), .18*H, z)), look: world(new V3(0, .05*H, z - .22*L)), up: a.up, fov: 48 }; }; } },
  dock: { ok: () => !!window.shipDockAnchor, make(s){ return k => { const A = window.shipDockAnchor.getWorldPosition(new V3()), L = SHIP_GAME_LEN, B = hullBox(), H = B.max.y - B.min.y, a = axes();
      return { pos: A.clone().addScaledVector(a.up, -(.4*H + .06*L)).addScaledVector(a.rt, s*.24*L).addScaledVector(a.fw, -(.12 + .05*k)*L), look: A, up: a.up, fov: 44 }; }; } }
};
const SHIP_TYPES = Object.keys(SHOTS);
function pickShot(){
  const ok = SHIP_TYPES.filter(t => SHOTS[t].ok() && !S.recent.includes(t));
  const list = ok.length ? ok : SHIP_TYPES.filter(t => SHOTS[t].ok());
  const type = list[Math.floor(Math.random()*list.length)];
  S.recent.push(type); if(S.recent.length > 3) S.recent.shift();
  return { type: type, dur: 6 + 3*Math.random(), t: 0, eval: SHOTS[type].make(Math.random() < .5 ? -1 : 1), h: Math.random(), ship: true };
}
/* ---------- plans des navettes (escale) ---------- */
function shuttleLen(){ return 8*(REAL.shipScale ? REAL.shipScale() : 1); }
function hullLen(group){
  const bx = new THREE.Box3(); group.updateMatrixWorld(true);
  group.traverse(o => { if(o.isMesh && !o.isSprite && o.geometry){ o.geometry.computeBoundingBox(); bx.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
  return bx.isEmpty() ? shuttleLen() : Math.max(3, bx.getSize(new V3()).length()*.8);
}
function loadShot(L){
  const s = Math.random() < .5 ? -1 : 1, len = L.shuttle ? hullLen(L.shuttle.group) : shuttleLen();   /* longueur réelle de la navette */
  return { type: 'shuttleLoad', dur: 3.4, t: 0, h: Math.random(), ship: true, eval: k => {
    if(L.pick){                                              /* prise sur la pile : du côté du conteneur, hors de la coque */
      const Cp = L.container.getWorldPosition(new V3()), Sp = L.shuttle.group.getWorldPosition(new V3()), mid = Cp.clone().lerp(Sp, .5), a = axes();
      return { pos: mid.clone().addScaledVector(a.rt, L.side*1.9*len).addScaledVector(a.up, -.7*len).addScaledVector(a.fw, -(1.2 + .3*k)*len), look: mid, up: a.up, fov: 44 }; } const A = window.shipDockAnchor ? window.shipDockAnchor.getWorldPosition(new V3()) : shipRig.position.clone(), a = axes(), sl = len;
    /* point visé pris sur les ancres DU VAISSEAU (à jour) : avant la saisie et après la pose, conteneur et navette sont
       replacés contre le dock plus tard dans l'image — leur position du moment a une image de retard, ≈ 330 m en orbite */
    let C = A;
    if(!L.grabbed && window.shipCargoStageAnchor) C = window.shipCargoStageAnchor.getWorldPosition(new V3());
    else if(L.grabbed && !L.released && L.container) C = L.container.getWorldPosition(new V3());   /* sur la pince : suit le vaisseau */
    /* lot N : plan resserré sur la navette et le point de dépose (≈ 2 longueurs de navette) — l'ancien cadrage,
       prévu pour la petite navette d'origine, montrait tout le vaisseau et rendait la manœuvre du bras illisible */
    const Sp = L.shuttle ? L.shuttle.group.getWorldPosition(new V3()) : A, mid = Sp.clone().lerp(C, .5);
    return { pos: mid.clone().addScaledVector(a.up, -1.1*sl).addScaledVector(a.rt, s*2.1*sl).addScaledVector(a.fw, -(.9 + .35*k)*sl), look: mid, up: a.up, fov: 44 }; } };
}
function followShot(sh){
  const s = Math.random() < .5 ? -1 : 1;
  /* longueur réelle de la navette (boîte englobante) : l'estimation d'après la taille du vaisseau la surévaluait ×3 */
  const bx = new THREE.Box3(); sh.group.updateMatrixWorld(true);
  sh.group.traverse(o => { if(o.isMesh && !o.isSprite && o.geometry){ o.geometry.computeBoundingBox(); bx.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });   /* coque seule : la lueur du moteur (sprite) gonflait la mesure */
  const len = Math.max(3, bx.isEmpty() ? 8 : bx.getSize(new V3()).length()*.8);
  let fwS = null, fwH = null;                             /* cap de la caméra, lissé (τ = 0,7 s) ; dernier cap horizontal valable */
  return { type: 'shuttleFollow', dur: 4.2, t: 0, h: Math.random(), eval: (k, dt) => { const P0 = sh.group.getWorldPosition(new V3()), sl = len;
    /* position de l'image EN COURS : les navettes sont désormais mises à jour avant les caméras (boucle, module 41) —
       l'ancienne extrapolation d'une image ne tenait qu'à cadence régulière et faisait trembler le plan en jeu */
    const P = P0;
    /* repère de la NAVETTE (son attitude, lissée) — le déplacement, lui, mélange la vitesse orbitale (~8 km/s) au trajet
       vers le port et faisait tourner le plan dans tous les sens */
    const C = orbitState.center || new V3(), up = P.clone().sub(C).normalize();
    /* la caméra SUIT le cap de la navette avec un retard lissé au lieu d'y être rivée : quand la navette pivote de
       l'attitude du vaisseau vers sa route, un repère rigide faisait basculer tout le décor (7,5 rad/s mesurés) */
    const fwN = new V3(0, 0, -1).applyQuaternion(sh.group.quaternion);
    fwS = fwS ? fwS.lerp(fwN, 1 - Math.exp(-(dt || 0)/.7)).normalize() : fwN.clone();
    /* navette plongeant presque à la verticale vers le port : son cap horizontal devient minuscule et instable — on
       garde alors le dernier cap horizontal valable (ramené dans le plan horizontal local) */
    const h = fwS.clone().addScaledVector(up, -fwS.dot(up));
    if(h.lengthSq() > .0625 || !fwH) fwH = h.lengthSq() > 1e-8 ? h.normalize() : new V3(1, 0, 0).applyQuaternion(shipRig.quaternion);
    else fwH.addScaledVector(up, -fwH.dot(up)).normalize();
    const fw = fwH.clone();
    let rt = new V3().crossVectors(fw, up); if(rt.lengthSq() < 1e-4) rt = new V3(1, 0, 0).applyQuaternion(shipRig.quaternion); rt.normalize();
    return { pos: P.clone().addScaledVector(rt, s*2.8*sl).addScaledVector(up, .7*sl).addScaledVector(fw, -(1.1 - .9*k)*sl), look: P.clone().addScaledVector(fw, .35*sl), up: up, fov: 44 }; } };
}
function blocked(){
  return !REAL.started || !!jumpState || REAL.phase === 'WARP' || REAL.phase === 'WARPOUT' || REAL.phase === 'HOP' || !!REAL.camHold ||
         (typeof SURVOL !== 'undefined' && SURVOL.isActive());
}
function setDof(shot, dt){
  if(!shot){ dof.want = 0; dof.k = 0; return; }
  if(shot !== dof.shot){
    dof.shot = shot; const pr = renderer.getPixelRatio();
    if(pr < .7 && !DOF_FORCE) dof.off = true; else if(pr >= .85 || DOF_FORCE) dof.off = false;
    dof.want = DOF_ON && !dof.off ? 1 : 0;
    dof.r = (.0045 + .003*shot.h)*clamp(50/camera.fov, .85, 1.3); dof.focus = null; if(!dof.want) dof.k = 0;
  }
  if(!dof.want){ dof.k = 0; return; }
  const fw = new V3(0, 0, -1).applyQuaternion(camera.quaternion), f = Math.max(.3, shot.lastLook.clone().sub(camera.position).dot(fw));
  dof.focus = dof.focus == null ? f : dof.focus*Math.pow(f/dof.focus, 1 - Math.exp(-dt/.15));
  dof.k += (1 - dof.k)*(1 - Math.exp(-dt/.13));
}
function apply(shot, dt){
  shot.t += dt;
  const c = shot.eval(clamp(shot.t/shot.dur, 0, 1), dt), pos = shot.ship ? outside(c.pos) : c.pos;
  if(S.baseFov === null) S.baseFov = camera.fov;
  if(camera.fov !== c.fov){ camera.fov = c.fov; camera.updateProjectionMatrix(); }
  camera.position.copy(pos); camera.up.copy(c.up); camera.lookAt(c.look); camera.updateMatrixWorld();
  shot.lastLook = c.look.clone();
  setDof(shot, dt);
}
function release(){
  if(S.baseFov !== null){ camera.fov = S.baseFov; camera.updateProjectionMatrix(); S.baseFov = null; }
  S.shot = null; dof.k = 0; dof.want = 0; dof.shot = null;
}
/* ---------- par image : après le survol, avant les greffons vaisseau (le tremblement s'ajoute par-dessus) ---------- */
function update(dt){
  if(blocked()){ if(S.auto || S.shot) { S.auto = null; release(); } return; }
  /* plans automatiques des navettes pendant l'escale */
  if(flightPhase === 'ARRIVAL_PAUSE' && !arrivalSkip){
    const L = orbitState.loading;
    if(L && L.container && (!L.pick || L.phase === 'pick') && S.loadShot !== L){ S.loadShot = L; S.auto = loadShot(L); }
    (orbitState.shuttles || []).forEach(sh => { if(sh.phase === 'outbound' && sh.group && !S.seen.has(sh) &&
      sh.group.getWorldPosition(new V3()).distanceTo(shipRig.position) > SHIP_GAME_LEN*.7){ S.seen.add(sh); S.auto = followShot(sh); } });   /* navette dégagée du vaisseau */
  }
  if(S.auto){
    if(S.auto.t >= S.auto.dur || flightPhase !== 'ARRIVAL_PAUSE'){ S.auto = null; if(CAMERA_MODES[cameraMode] !== 'closeup') release(); }
    else { apply(S.auto, dt); return; }
  }
  if(CAMERA_MODES[cameraMode] === 'closeup'){
    if(!S.shot || S.shot.t >= S.shot.dur) S.shot = pickShot();
    apply(S.shot, dt);
  } else if(S.shot || S.baseFov !== null){ release(); }
}
return { update, dof, state: S, SHOTS, pickShot };
})();
