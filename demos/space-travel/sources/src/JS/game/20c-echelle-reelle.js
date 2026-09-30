/* =========================================================================
   7sexies. ÉCHELLE RÉELLE — cœur (lot L2.2, fusion de la démo v7.2.2)
   Seul mode du jeu depuis la v2.17 (l'ancien monde compressé de la v2.16
   est abandonné : plus de paramètre ?echelle).
   - couche galactique inchangée (unités du jeu, 1 u = 1/38 pc) ; la
     position galactique du vaisseau (REAL.galPos) pilote le champ
     d'étoiles, les nébuleuses et le décor ;
   - couche système en MÈTRES, étoile hôte à l'origine : système converti à
     l'échelle réelle par les fonctions de cine.js reprises telles quelles
     (zone habitable à √L UA, rayons en R⊕, lunes képlériennes), surfaces
     et atmosphères de planets.js, roches d'asteroids.js, soleil de
     stars.js (taille réelle, couronne, éruptions, occultations) ;
   - l'étoile hôte du champ galactique est masquée : c'est stars.js qui la
     dessine, à sa taille réelle, dans la couche système ;
   - vaisseau du joueur à sa taille réelle (échelle 1 du générateur) ;
   - étape L2.2 : le vaisseau est « posé » au point d'arrivée de la
     première étape (32 à 60 rayons de la planète habitable, par le flanc),
     rotation libre, sans translation — le vol arrive avec L2.3.
   ========================================================================= */
const REAL = (function(){
'use strict';
const V3 = THREE.Vector3;
/* depuis la v2.17 : l'échelle réelle est le SEUL mode du jeu (l'ancien monde compressé est abandonné) */
const active = true;
/* ---------- constantes physiques (identiques à cine.js) ---------- */
const RSUN = 6.957e8, REARTH = 6.371e6, AU = 1.496e11, GRAV = 6.674e-11, LY = 9.4607e15, PC = 3.0857e16;
const UNIT_GAL = PC/38;                                   /* 1 u du champ galactique = 1/38 pc (cf. apparentMagnitude) */
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/* ---------- repris de cine.js v7.2.2, sans modification ---------- */
function realizeSystem(leg){
  const sys = leg.system, st = leg.star, r = rngFor(SEED + ':real:' + leg.cell);
  leg.Rs = Math.max(.008, st.radius || 1)*RSUN;
  leg.lum = Math.max(1e-4, st.lum || 1);
  const n = sys.planets.length, hi = sys.habIdx, aHZ = Math.sqrt(leg.lum)*AU;
  const engD = sys.planets.map(p => p.position.length());
  const a = new Array(n); a[hi] = aHZ*(.95 + .25*r());
  for(let i = hi + 1; i < n; i++) a[i] = a[i-1]*(1.5 + .7*r());
  for(let i = hi - 1; i >= 0; i--) a[i] = a[i+1]/(1.5 + .7*r());
  const off = Math.max(1, (leg.Rs*8)/a[0]); for(let i=0;i<n;i++) a[i] *= off;   // aucune planète dans la couronne
  sys.planets.forEach((p, i) => {
    const dir = p.position.clone().normalize();
    p.engineRadius = p.radius;
    p.radius = p.kind.gas ? REARTH*(3.8 + (p.radius - 200)/120*8) : REARTH*(.45 + (p.radius - 100)/100*1.2);
    p.position.copy(dir).multiplyScalar(a[i]); p.orbitA = a[i];
    p.mass = (p.kind.gas ? 1300 : 5500)*4/3*Math.PI*Math.pow(p.radius, 3);
    p.GM = GRAV*p.mass;
    p.dayLen = (p.kind.gas ? 9 + 8*r() : 16 + 28*r())*3600*(r() < .12 ? -1 : 1);
  });
  // ceinture : bornes du moteur transposées entre les orbites réelles (interpolation logarithmique)
  if(sys.asteroidBelt){
    const map = d => { let i = 0; while(i < n - 2 && engD[i+1] < d) i++; const x = clamp((d - engD[i])/Math.max(1, engD[i+1] - engD[i]), 0, 1); return a[i]*Math.pow(a[i+1]/a[i], x); };
    leg.beltInfo = { inner: map(sys.asteroidBelt.inner), outer: map(sys.asteroidBelt.outer) };
  }
  leg.realized = true;
}
function ensureSystemData(leg){
  if(!leg.system){ leg.system = generateSystemData(leg); leg.planets = leg.system.planets; leg.hab = leg.planets[leg.system.habIdx]; realizeSystem(leg); }
  return leg;
}
function stripBelt(leg){   // les instances du moteur, étalées sur des UA, seraient sous-pixel et imprécises en float32
  leg.group.children.slice().forEach(c => { let belt = false; c.traverse(o => { if(o.isInstancedMesh && o.material === ASTEROID_MAT) belt = true; }); if(belt){ leg.group.remove(c); c.traverse(o => o.isInstancedMesh && o.dispose && o.dispose()); } });
}
function realizeMoons(leg){
  const r = rngFor(SEED + ':moons-real:' + leg.cell);
  leg.planets.forEach(p => (p.moonPivots || []).forEach((pv, i) => {
    const m = pv.children[0]; if(!m) return;
    if(p.kind.gas) m.scale.multiplyScalar(.13);
    const d = p.radius*(p.kind.gas ? 6 + 6*i + 5*r() : 18 + 20*i + 22*r());
    m.position.set(d, 0, 0);
    pv.userData.n = Math.sqrt(p.GM/(d*d*d))*(pv.userData.speed < 0 ? -1 : 1);
    pv.userData.dist = d;
  }));
}
function bodiesOf(leg){   // corps susceptibles d'éclipser l'étoile : planètes et lunes
  const out = [];
  (leg.planets || []).forEach(p => { out.push({ pos: p.position, r: p.radius }); (p.moonPivots || []).forEach(pv => { const m = pv.children[0]; if(m) out.push({ pos: m.getWorldPosition(new V3()), r: m.scale.x*1.02 }); }); });
  return out;
}
function planetClearance(p){ return p.isStar ? p.radius : (p.hasRings ? p.radius*3.25 : p.radius*1.03); }

/* ---------- état ---------- */
const R = {
  active: active, parked: active, started: false,
  galPos: new V3(), galCam: new THREE.PerspectiveCamera(55, 1, 0.1, 6000),
  leg: null, hideCell: null, debugView: null, T: 0, cloudT: 0, corridor: null, hops: 0,
  UNITS: { RSUN: RSUN, REARTH: REARTH, AU: AU, UNIT_GAL: UNIT_GAL, LY: LY, PC: PC }
};

/* tranches de profondeur de la démo : 0,2 m → 1,3·10¹⁹ m, rapport ≤ 2 000 par tranche,
   monde réduit par tranche (w ≤ 2·10⁶) ; vaisseaux et effets seulement dans les tranches d'échelle 1 */
LAYERS.cfg.SLB = [.2, 400, 8e5, 1.6e9, 3.2e12, 6.4e15, 1.3e19];
LAYERS.cfg.SLS = [1, 1, 800, 1.6e6, 3.2e9, 6.4e12];
LAYERS.sysScene.fog = null;                                /* le brouillard du jeu est en unités de jeu : pas de sens en mètres */

/* étape du jeu → étape « système » en coordonnées locales (étoile à l'origine), comme legFromStar() de cine.js */
function localLeg(g){
  return { name: g.name, designation: g.designation, gal: g.starPosition.clone(), position: new V3(), starPosition: new V3(),
           cell: g.cell, star: g.star, gameLeg: g };
}
function buildSystem(leg){
  ensureSystemData(leg);
  leg.group = buildPlanetSystemMeshes(leg);
  stripBelt(leg);
  LAYERS.sysWorld.add(leg.group);
  leg.sunColor = new THREE.Color(leg.star.color.r, leg.star.color.g, leg.star.color.b);
  if(!window.__AST.ready) window.__AST.init(String(SEED));
  leg.planets.forEach(p => { window.__PLANETS.enhance(p); if(p.beaconSprite) p.beaconSprite.visible = false; });
  window.__AST.apply(leg);
  realizeMoons(leg);
  buildStations(leg);
  leg.star3 = window.__STARS.create(leg, window.__PLANETS.PIX, leg.group); leg.group.add(leg.star3.root);
  return leg;
}
function disposeSystem(leg){
  if(!leg || !leg.group) return;
  window.__AST.detachShared(leg.group);
  if(leg.star3){ window.__STARS.dispose(leg.star3); leg.star3 = null; }
  LOCAL.disposeStations(leg);
  LAYERS.detach(leg.group); disposePlanetGroup(leg.group); leg.group = null;
}
/* point d'arrivée (arrivalPlan de cine.js, tirage déterministe) : par le flanc, un peu côté nuit,
   à 32–60 rayons de la planète visée (12–22 pour une géante) */
function arrival(leg, target){
  target = target || leg.hab;
  const r = rngFor(SEED + ':arrivee:' + leg.cell + ':' + (target.name || 'hab')), rr = (a, b) => a + (b - a)*r();
  const Cp = target.position, toStar = Cp.clone().negate().normalize();
  const hint = new V3(r() - .5, r() - .5, r() - .5).normalize();
  const flank = hint.sub(toStar.clone().multiplyScalar(hint.dot(toStar))).normalize();
  const up = new V3().crossVectors(toStar, flank).normalize();
  const dA = target.radius*(target.kind.gas ? rr(12, 22) : rr(32, 60));
  const dir = flank.clone().addScaledVector(toStar, -rr(.1, .45)).addScaledVector(up, rr(-.3, .3)).normalize();
  return { target: target, pos: Cp.clone().addScaledVector(dir, dA), dA: dA };
}

/* ---------- séquence de titre : un système construit et animé SANS vaisseau (caméra seule) ---------- */
R.titleActive = false;
R.titleEnter = function(g){
  if(R.leg){ disposeSystem(R.leg); R.leg = null; }
  const leg = buildSystem(localLeg(g));
  R.leg = leg; R.hideCell = leg.cell; R.galPos.copy(leg.gal); R.titleActive = true;
  if(ROUTE.gates) ROUTE.gates.visible = false;
  return leg;
};
R.titleExit = function(){
  R.titleActive = false; R.galOverride = null;
  if(R.leg && !R.started){ disposeSystem(R.leg); R.leg = null; }
  LAYERS.sysWorld.visible = true;
};
const _tSun = new V3(), _tWhite = new THREE.Color(1, 1, 1), _tBuf = new THREE.Vector2();
R.titleUpdate = function(dt){
  const leg = R.leg; if(!leg) return;
  R.T += dt; R.cloudT += dt;
  camera.updateMatrixWorld();
  if(R.galOverride) R.galPos.copy(R.galOverride); else R.galPos.copy(leg.gal).addScaledVector(camera.position, 1/UNIT_GAL);
  const g = R.galCam;
  g.position.copy(R.galPos); g.quaternion.copy(camera.quaternion);
  g.fov = camera.fov; g.aspect = camera.aspect; g.zoom = camera.zoom; g.near = .1; g.far = 6000;
  g.updateProjectionMatrix(); g.updateMatrixWorld();
  leg.planets.forEach(p => {
    if(!p.mesh) return;
    p.mesh.rotation.y += 2*Math.PI/p.dayLen*dt*40;            /* rotation propre accélérée ×40 : la surface vit à l'écran */
    if(p.fx) window.__PLANETS.update(p, new V3(), leg.sunColor, R.T, camera.position, R.cloudT);
    (p.moonPivots || []).forEach(m => m.rotation.y += (m.userData.n || 0)*dt*40);
  });
  if(leg.star3) leg.star3.lastOcc = window.__STARS.update(leg.star3, R.T, dt, camera, bodiesOf(leg));
  window.__PLANETS.setPixelAngle(camera.fov, renderer.getDrawingBufferSize(_tBuf).y);
  _tSun.copy(camera.position).negate().normalize();
  starLight.position.copy(_tSun); starLight.target.position.set(0, 0, 0); starLight.target.updateMatrixWorld();
  starLight.color.copy(leg.sunColor).lerp(_tWhite, .45); starLight.intensity = 1.65;
};
R.enterSystem = function(gameLeg){
  if(!gameLeg) return;
  if(R.titleActive){ R.titleActive = false; R.galOverride = null; LAYERS.sysWorld.visible = true; }   /* fin de la séquence de titre */
  if(R.leg){ disposeSystem(R.leg); R.leg = null; }
  if(R.corridor){ R.corridor.children.forEach(c => { c.geometry.dispose(); c.material.dispose(); }); LAYERS.detach(R.corridor); R.corridor = null; }
  const leg = buildSystem(localLeg(gameLeg));
  R.leg = leg; R.hideCell = leg.cell; R.galPos.copy(leg.gal); LAYERS.sysWorld.visible = true;
  R.visited.push({ cell: leg.cell, name: leg.name, designation: leg.designation, gal: leg.gal.clone() }); if(R.visited.length > 60) R.visited.shift();
  if(ROUTE.gates) ROUTE.gates.visible = false;            /* couloir d'approche : L2.3 */
  const a = arrival(leg);
  R.arrival = a;
  shipRig.position.copy(a.pos);
  shipRig.quaternion.setFromUnitVectors(new V3(0, 0, -1), a.target.position.clone().sub(a.pos).normalize());
  currentSpeed = 0; angVel.set(0, 0, 0);
  camPos.copy(shipRig.position).add(CAM_OFFSET.clone().applyQuaternion(shipRig.quaternion));
  camLook.copy(shipRig.position);
  R.started = true;
  R.plan(leg);   /* L2.3 : transfert → approche → orbite → départ */
  refreshField(STAR_CELL, STAR_RADIUS, starField, buildStarCell);
  refreshField(NEBULA_CELL, NEBULA_RADIUS, nebulaField, buildNebulaCell);
};

const _toSun = new V3(), _white = new THREE.Color(1, 1, 1), _drawSize = new THREE.Vector2();
R.update = function(dt){
  const leg = R.leg; if(!leg) return;
  R.T += dt; R.cloudT += dt;
  if(R.debugView && R.debugView.rel){                       /* vue de contrôle relative au vaisseau (tests) : suit le vaisseau */
    const o = R.debugView.rel, L = SHIP_GAME_LEN, q = shipRig.quaternion, p = shipRig.position;
    const fw = new V3(0, 0, -1).applyQuaternion(q), up = new V3(0, 1, 0).applyQuaternion(q), rt = new V3(1, 0, 0).applyQuaternion(q);
    R.debugView.pos = p.clone().addScaledVector(fw, o.f*L).addScaledVector(up, o.u*L).addScaledVector(rt, o.r*L);
    R.debugView.look = p.clone().addScaledVector(fw, (o.lf || 0)*L).addScaledVector(up, (o.lu || 0)*L);
  }
  if(R.debugView){                                          /* vue imposée (tests) */
    camera.position.copy(R.debugView.pos); camera.up.set(0, 1, 0); camera.lookAt(R.debugView.look);
    if(R.debugView.fov){ camera.fov = R.debugView.fov; camera.updateProjectionMatrix(); }
    camPos.copy(camera.position); camLook.copy(R.debugView.look);
  }
  /* caméras cinématiques AVANT le ciel galactique et les planètes (niveau de détail, atmosphère relatifs à la caméra) */
  if(R.camHold){ camera.position.copy(R.camHold.pos); camera.up.set(0, 1, 0); camera.lookAt(R.camHold.look || shipRig.position); }   /* L5 : départ vu de l'extérieur */
  if(typeof SURVOL !== 'undefined') SURVOL.update(dt);         /* survol du système */
  if(typeof GP !== 'undefined') GP.update(dt);                 /* L10 : gros plans (mode de caméra) et plans des navettes */
  camera.updateMatrixWorld();
  /* position galactique : étoile hôte + décalage du vaisseau (négligeable, mais exact) */
  if(R.galOverride) R.galPos.copy(R.galOverride); else R.galPos.copy(leg.gal).addScaledVector(shipRig.position, 1/UNIT_GAL);
  const g = R.galCam;
  g.position.copy(R.galPos); g.quaternion.copy(camera.quaternion);
  g.fov = camera.fov; g.aspect = camera.aspect; g.zoom = camera.zoom; g.near = 0.1; g.far = 6000;
  g.updateProjectionMatrix(); g.updateMatrixWorld();
  /* corps du système : rotation propre réelle, surfaces et atmosphères, lunes képlériennes, soleil */
  leg.planets.forEach(p => {
    if(!p.mesh) return;
    p.mesh.rotation.y += 2*Math.PI/p.dayLen*dt;
    if(p.fx) window.__PLANETS.update(p, new V3(), leg.sunColor, R.T, camera.position, R.cloudT);
    (p.moonPivots || []).forEach(m => m.rotation.y += (m.userData.n || 0)*dt);
  });
  if(leg.star3) leg.star3.lastOcc = window.__STARS.update(leg.star3, R.T, dt, camera, bodiesOf(leg));
  LOCAL.updateStations(leg, dt);
  window.__PLANETS.setPixelAngle(camera.fov, renderer.getDrawingBufferSize(_drawSize).y);
  /* soleil local : lumière directionnelle venant de l'étoile hôte (à l'origine) */
  _toSun.copy(shipRig.position).negate().normalize();
  starLight.position.copy(_toSun); starLight.target.position.set(0, 0, 0); starLight.target.updateMatrixWorld();
  starLight.color.copy(leg.sunColor).lerp(_white, .45); starLight.intensity = 1.65;
  if(typeof SHIPFX !== 'undefined') SHIPFX.update(dt, R.T);   /* L5/L6 : tuyères, anneaux, géode, usure, tremblement */
};

/* occupation des tranches (sliceUnits de cine.js) : seules les tranches traversées par un objet sont rendues */
LAYERS.units = function(){
  const out = [], leg = R.leg;
  if(!(R.started || R.titleActive) || !leg) return null;
  out.push([shipRig.position, SHIP_GAME_LEN*1.6]);
  out.push([camera.position, 7e5]);   /* L2.3 : couche vaisseau (couloir, navettes) = tranches d'échelle 1, jusqu'à 800 km */
  leg.planets.forEach(p => { out.push([p.position, p.radius*(p.hasRings ? 3.4 : 1.12)]);
    (p.moonPivots || []).forEach(pv => { const m = pv.children[0]; if(m) out.push([m.getWorldPosition(new V3()), m.scale.x*1.4]); }); });
  (leg.stations || []).forEach(function(st){ out.push([st.position, st.radius*3]); });
  if(leg.star3){ const S = leg.star3; out.push([S.root.position, Math.max(S.Rs*8, S.glare.scale.x*.75, S.glare2.scale.x*.75) + S.glare.position.length()]); }
  return out;
};

/* ---------- HUD en unités physiques ---------- */
const LOC = { fr: 'fr-FR', en: 'en-GB', de: 'de-DE', es: 'es-ES' };
const U_AU = { fr: 'ua', en: 'AU', de: 'AE', es: 'ua' }, U_LY = { fr: 'al', en: 'ly', de: 'Lj', es: 'al' };
function num(x, d){ return x.toLocaleString(LOC[LANG] || 'fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }); }
function dist(m){
  const a = Math.abs(m);
  if(a < 1e4) return num(a, 0) + ' m';
  if(a < 1e9) return num(a/1e3, 0) + ' km';
  if(a < .05*LY) return num(a/AU, a/AU < 10 ? 2 : 1) + ' ' + (U_AU[LANG] || 'ua');
  return num(a/LY, 2) + ' ' + (U_LY[LANG] || 'al');
}
function speed(v){ return v < 1e4 ? num(v, 0) + ' m/s' : num(v/1e3, 1) + ' km/s'; }
R.fmt = { dist: dist, speed: speed, num: num };
let lastHud = 0;
R.hud = function(now){
  document.getElementById('speedVal').textContent = R.hudSpeed || (speed(currentSpeed) + (R.tau > 1.5 ? '  \u23f1\u00d7' + num(R.tau, 0) : ''));
  const c = { x: Math.round(R.galPos.x/STAR_CELL), y: Math.round(R.galPos.y/STAR_CELL), z: Math.round(R.galPos.z/STAR_CELL) };
  document.getElementById('sectorVal').textContent = c.x + ' · ' + c.y + ' · ' + c.z;
  const fwd = new V3(0, 0, -1).applyQuaternion(shipRig.quaternion);
  document.getElementById('headingVal').textContent = String(Math.round(((Math.atan2(fwd.x, -fwd.z)*180/Math.PI) + 360) % 360)).padStart(3, '0') + '°';
  if(now - lastHud < 350 || !R.leg) return; lastHud = now;
  const leg = R.leg, p = shipRig.position;
  let best = null, bd = Infinity;
  leg.planets.forEach(pl => { const d = pl.position.distanceTo(p) - pl.radius; if(d < bd){ bd = d; best = pl; } });
  const dStar = p.length() - leg.Rs;
  if(best && bd < dStar){
    const kind = t('planetKind_' + best.kind.key);
    document.getElementById('nearName').textContent = best.isHabitable ? best.portName : kind.charAt(0).toUpperCase() + kind.slice(1);
    let meta = best.isHabitable ? (t('cityOf') + best.cityName + t('navTarget') + '<br>') : '';
    meta += leg.name + ' · ' + kind;
    if(!best.kind.gas) meta += ' · ' + Math.round(best.oceanFrac*100) + t('submerged');
    meta += '<br>' + t('radiusUnit') + dist(best.radius);
    if(best.moonCount) meta += ' · ' + best.moonCount + ' ' + (best.moonCount > 1 ? t('satellites') : t('satellite'));
    meta += '<br>' + dist(best.orbitA) + ' · ' + dist(bd);
    document.getElementById('nearMeta').innerHTML = meta;
    renderNearestIcon('planet', { key: best.kind.key, gas: best.kind.gas });
  } else {
    const s = leg.star;
    document.getElementById('nearName').textContent = leg.name;
    document.getElementById('nearMeta').innerHTML = s.designation + ' · ' + t('lum_' + s.lumClass) + '<br>' +
      'R ' + s.radius.toFixed(2) + ' R☉ · L ' + (s.lum < .01 ? s.lum.toExponential(1) : s.lum.toFixed(2)) + ' L☉<br>' + dist(dStar);
    renderNearestIcon('star', { color: s.color });
  }
};

/* =====================================================================
   L2.3 — VOL PAR ÉTAPE À L'ÉCHELLE RÉELLE
   arrivée → TRANSFERT (pilote automatique, accélération / retournement /
   freinage, temps accéléré) → APPROCHE (temps réel, pilotage manuel dans le
   couloir holographique) → ORBITE (escale v2.16 : arc d'orbite basse en
   temps réel, navettes, radio) → DÉPART (poussée continue vers le point de
   saut, temps accéléré) → ERRE (3 s) → PASSAGE à l'étoile suivante
   (fondu provisoire : la distorsion et le saut de la démo arrivent en L2.4).
   Profils, chemins de Bézier et orientation : repris tels quels de cine.js.
   ===================================================================== */
const Q = THREE.Quaternion, _m4 = new THREE.Matrix4(), v = (x, y, z) => new V3(x, y, z);
const smooth = x => { x = clamp(x,0,1); return x*x*(3-2*x); };
const smoother = x => { x = clamp(x,0,1); return x*x*x*(x*(x*6-15)+10); };
function bez(P, s){ const a = 1-s; return P[0].clone().multiplyScalar(a*a*a).addScaledVector(P[1],3*a*a*s).addScaledVector(P[2],3*a*s*s).addScaledVector(P[3],s*s*s); }
function bezD(P, s){ const a = 1-s; return P[1].clone().sub(P[0]).multiplyScalar(3*a*a).addScaledVector(P[2].clone().sub(P[1]),6*a*s).addScaledVector(P[3].clone().sub(P[2]),3*s*s); }
function quatNose(nose, up){ _m4.lookAt(new V3(0,0,0), nose, up || v(0,1,0)); return new Q().setFromRotationMatrix(_m4); }
function flipProfile(L, vs, ve, a, coastFrac, Lf){
  // Lf : erre finale (freinage terminé avant l'arrivée) pendant laquelle le vaisseau se retourne nez en avant (v6.7)
  Lf = Lf && ve > 1 ? Math.min(Lf, L*.3) : 0; const Lm = L - Lf;
  const tc = coastFrac*Math.sqrt(Lm/a);
  const A = 1/a, B = tc, Cc = -(vs*vs + ve*ve)/(2*a) - Lm;
  const vm = Math.max((-B + Math.sqrt(B*B - 4*A*Cc))/(2*A), vs, ve);
  const t1 = (vm - vs)/a, t2 = (vm - ve)/a, tm = t1 + tc + t2, tf = Lf > 0 ? Lf/ve : 0, D = tm + tf, s1 = vs*t1 + .5*a*t1*t1, sc = vm*tc;
  const f = t => {
    if(t <= 0) return { s: vs*t, v: vs };
    if(t < t1) return { s: vs*t + .5*a*t*t, v: vs + a*t };
    if(t < t1 + tc) return { s: s1 + vm*(t - t1), v: vm };
    if(t < tm){ const u = t - t1 - tc; return { s: s1 + sc + vm*u - .5*a*u*u, v: vm - a*u }; }
    if(t < D) return { s: Lm + ve*(t - tm), v: ve };
    return { s: L + ve*(t - D), v: ve };
  };
  return { f, D, vm, t1, tc, t2, tm, tf, L, a, flip: true };
}
function accelProfile(L, vs, a){
  const D = (-vs + Math.sqrt(vs*vs + 2*a*L))/a, ve = vs + a*D;
  const f = t => t <= 0 ? { s: vs*t, v: vs } : (t < D ? { s: vs*t + .5*a*t*t, v: vs + a*t } : { s: L + ve*(t - D), v: ve });
  return { f, D, ve, L, a, flip: false };
}
function arcPath(P){
  const N = 128, acc = [0]; let prev = P[0].clone();
  for(let i=1;i<=N;i++){ const p = bez(P, i/N); acc.push(acc[i-1] + p.distanceTo(prev)); prev = p; }
  const L = acc[N], d0 = bezD(P, 0).normalize(), d1 = bezD(P, 1).normalize();
  const tOf = s => { let lo = 0, hi = N; while(hi - lo > 1){ const m = (lo + hi) >> 1; if(acc[m] < s) lo = m; else hi = m; } return (lo + (s - acc[lo])/Math.max(1e-9, acc[hi] - acc[lo]))/N; };
  return { P, L, d0, d1,
    at: s => s <= 0 ? P[0].clone().addScaledVector(d0, s) : (s >= L ? P[3].clone().addScaledVector(d1, s - L) : bez(P, tOf(s))),
    dir: s => s <= 0 ? d0.clone() : (s >= L ? d1.clone() : bezD(P, tOf(s)).normalize()) };
}
const XAX = new V3(1,0,0);
function pathState(path, prof, t, up){
  const st = prof.f(t), dir = path.dir(st.s), qf = quatNose(dir, up);
  let q = qf, thr = 0; const e = prof.D*.012 + 1e-6;
  if(prof.flip){
    const x = (t - prof.t1)/Math.max(prof.tc, 1e-6);
    let ang = Math.PI*smoother((x - .06)/.88);                                                   // retournement en tangage autour de l'axe transversal (sens constant) : couple RCS avant/arrière
    if(prof.tf > 0) ang += Math.PI*smoother(((t - prof.tm)/prof.tf - .02)/.45);                  // retournement final : freinage terminé, le vaisseau arrive nez en avant
    q = qf.clone().multiply(new Q().setFromAxisAngle(XAX, ang));
    const tm = prof.tm !== undefined ? prof.tm : prof.D;
    if(t > 0 && t < prof.t1) thr = smooth(t/e)*smooth((prof.t1 - t)/e);
    else if(t > prof.t1 + prof.tc && t < tm) thr = smooth((t - prof.t1 - prof.tc)/e)*smooth((tm - t)/(e*.5));
  } else if(t > 0 && t < prof.D) thr = smooth(t/e)*smooth((prof.D - t)/(e*.4));
  return { pos: path.at(st.s), q, throttle: thr, speed: st.v };
}

const FLIGHT = {
  ACC_G: 1.0,          /* poussée nominale (g) */
  TRANSFER_S: 22,      /* durée d'un transfert à l'écran (s) */
  DEPART_S: 14,        /* durée d'un départ à l'écran (s) */
  COAST_S: 3,          /* erre en temps réel avant le passage (démo) */
  ORBIT_ALT: .065,     /* altitude de l'orbite de livraison (fraction du rayon) : ≈ 410 km pour une Terre */
  APPROACH_S: 30,      /* longueur du couloir = 30 s à la vitesse orbitale, en temps réel */
  DOCK_SPEED: 120,      /* vitesse d'approche d'une lune ou d'une station (pas de GM propre) */
  GATES: 10,           /* portiques du couloir */
  FUEL_PER_KMS: 10,    /* carburant par km/s de Δv : une étape ≈ la consommation d'une étape v2.16 */
  HOP_FADE: .7         /* fondu du passage provisoire (s) */
};
R.FLIGHT = FLIGHT;
R.phase = 'IDLE'; R.tau = 1; R.mission = null;

/* chemin qui ne traverse pas la planète : on écarte les points de contrôle tant qu'un échantillon passe sous 1,05 R */
function clearPath(P, C, Rp){
  for(let it = 0; it < 10; it++){
    let worst = Infinity, wp = null;
    for(let i = 1; i < 48; i++){ const q = bez(P, i/48), d = q.distanceTo(C); if(d < worst){ worst = d; wp = q; } }
    if(worst >= Rp*1.05) break;
    const out = wp.clone().sub(C).normalize().multiplyScalar(Rp*.6 + (Rp*1.05 - worst));
    P[1].add(out); P[2].add(out);
  }
  return P;
}
function burn(M, speed){                              /* carburant ∝ Δv */
  const dv = Math.abs(speed - M.lastV); M.lastV = speed;
  if(dv > 0 && fuel > 0) fuel = Math.max(0, fuel - FLIGHT.FUEL_PER_KMS*dv/1000);
}
function portDir(p, C){
  const w = new V3();
  if(p.beaconSprite){ p.beaconSprite.updateWorldMatrix(true, false); p.beaconSprite.getWorldPosition(w); }
  if(w.distanceToSquared(C) < 1) return new V3(0, 1, 0);
  return w.sub(C).normalize();
}
/* plan de l'étape : orbite de livraison passant au-dessus du port, couloir d'approche, transfert */
R.plan = function(leg, target, local){
  if(typeof CARGO !== 'undefined') CARGO.restoreStack();   /* soute rechargée (conteneurs pris à l'escale précédente) */
  const p = target || leg.hab, C = p.position, Rp = p.radius;
  const ro = Rp*(1 + FLIGHT.ORBIT_ALT), vo = p.GM ? Math.sqrt(p.GM/ro) : FLIGHT.DOCK_SPEED;
  const u = portDir(p, C), A = shipRig.position.clone(), a = A.clone().sub(C).normalize();
  let N = new V3().crossVectors(a, u); if(N.lengthSq() < 1e-8) N = new V3().crossVectors(u, v(0, 1, 0)); N.normalize();
  const Lc = vo*FLIGHT.APPROACH_S, thO = vo/ro*12, thE = Lc/ro;           /* le port défile ~12 s après l'insertion */
  const Uo = u.clone().applyAxisAngle(N, -thO), Ue = Uo.clone().applyAxisAngle(N, -thE);
  const drop = Lc*.22;
  const E = C.clone().addScaledVector(Ue, ro + drop), Te = new V3().crossVectors(N, Ue).normalize();
  const L0 = A.distanceTo(E);
  const P = clearPath([A, A.clone().addScaledVector(E.clone().sub(A).normalize(), L0/3), E.clone().addScaledVector(Te, -L0/3), E], C, Rp);
  const path = arcPath(P), acc = FLIGHT.ACC_G*9.81;
  let prof = flipProfile(path.L, 0, vo, acc, .25, 0);
  let tau = Math.max(1, prof.D/FLIGHT.TRANSFER_S);
  prof = flipProfile(path.L, 0, vo, acc, .25, vo*2.5*tau);                 /* erre finale ≈ 2,5 s à l'écran : retournement nez en avant */
  tau = Math.max(1, prof.D/FLIGHT.TRANSFER_S);
  const M = R.mission = { leg: leg, target: p, local: !!local, C: C, Rp: Rp, ro: ro, vo: vo, N: N, Uo: Uo, Ue: Ue, thE: thE, Lc: Lc, drop: drop,
    tr: { path: path, prof: prof }, upT: Ue.clone(), tau: tau, t: 0, s: 0, ox: 0, oy: 0, vx: 0, vy: 0, lastV: 0 };
  buildCorridor(M);
  R.phase = 'TRANSFER'; R.tau = tau;
  return M;
};
/* couloir holographique : portiques carrés le long de la descente vers l'orbite */
function corridorAt(M, s){
  const k = Math.max(0, Math.min(1, s/M.Lc));
  const U = M.Ue.clone().applyAxisAngle(M.N, M.thE*k);
  const r = M.ro + M.drop*.5*(1 + Math.cos(Math.PI*k));
  const drds = -M.drop*.5*Math.PI*Math.sin(Math.PI*k)/M.Lc;
  const T = new V3().crossVectors(M.N, U).normalize().addScaledVector(U, drds).normalize();
  return { pos: M.C.clone().addScaledVector(U, r), T: T, U: U };
}
function buildCorridor(M){
  disposeCorridor();
  const g = new THREE.Group(); g.name = 'couloir';
  M.half = Math.min(Math.max(600, M.vo*.2), Math.max(40, M.Rp*20)); M.gates = [];
  for(let i = 1; i <= FLIGHT.GATES; i++){
    const s = M.Lc*i/(FLIGHT.GATES + .5), f = corridorAt(M, s), B = new V3().crossVectors(f.T, f.U).normalize(), h = M.half;
    const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(q => new V3().addScaledVector(B, q[0]*h).addScaledVector(f.U, q[1]*h));   /* relatifs : précision float32 */
    const pts = []; for(let j = 0; j < 4; j++){ pts.push(c[j], c[(j + 1) % 4]); }
    const mat = new THREE.LineBasicMaterial({ color: 0x4de1ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const ln = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat); ln.frustumCulled = false;
    ln.position.copy(f.pos); ln.userData.s = s; g.add(ln); M.gates.push(ln);
  }
  LAYERS.shipWorld.add(g); R.corridor = g;
}
function disposeCorridor(){
  if(!R.corridor) return;
  R.corridor.children.forEach(c => { c.geometry.dispose(); c.material.dispose(); });
  LAYERS.detach(R.corridor); R.corridor = null;
}
function fadeGates(M, sShip){
  if(!M.gates) return;
  M.gates.forEach(ln => { const d = ln.userData.s - sShip;   /* devant : visible jusqu'à ~40 % du couloir ; derrière : s'efface vite */
    ln.material.opacity = d < 0 ? Math.max(0, 1 + d/(M.half*1.5))*.8 : .85*smooth(1 - d/(M.Lc*.45)); });
}
function arriveOrbit(M){
  disposeCorridor();
  if(typeof SHIPFX !== 'undefined') SHIPFX.onEscale();   /* L6 : usure progressive */
  if(M.local){
    startOrbitDelivery(M.target, false);   /* livraison locale : hors itinéraire interstellaire */
  } else if(R.offRoute){
    R.offRoute = false;                    /* arrivée par la carte : itinéraire neuf depuis cette étoile, étape 0 = la suivante */
    startOrbitDelivery(M.target, false);
  } else {
    const deliverIdx = ROUTE.nextDelivery, isLast = deliverIdx === ROUTE.legs.length - 1;
    ROUTE.nextDelivery++;
    startOrbitDelivery(M.target, isLast);
    if(isLast){
      computeRoute(galPosition(), new V3(0, 0, -1).applyQuaternion(shipRig.quaternion), false);
      if(ROUTE.gates) ROUTE.gates.visible = false;
    }
  }
  flightPhase = 'ARRIVAL_PAUSE'; pauseTimer = 0; R.phase = 'ORBIT'; R.tau = 1;
}
function planDeparture(M){
  const next = R.nextTarget();
  const dirN = next ? next.starPosition.clone().sub(M.leg.gal).normalize() : new V3(0, 0, -1).applyQuaternion(shipRig.quaternion);
  const r = rngFor(SEED + ':depart:' + M.leg.cell), S = shipRig.position.clone();
  const J = M.C.clone().addScaledVector(dirN, M.Rp*(25 + 20*r()));
  const T0 = new V3(0, 0, -1).applyQuaternion(shipRig.quaternion), L0 = S.distanceTo(J);
  const P = clearPath([S, S.clone().addScaledVector(T0, L0/3), J.clone().addScaledVector(dirN, -L0/3), J], M.C, M.Rp);
  const path = arcPath(P), prof = accelProfile(path.L, M.vo, FLIGHT.ACC_G*9.81);
  M.dep = { path: path, prof: prof, next: next, dirN: dirN, up: S.clone().sub(M.C).normalize() };
  M.tau = Math.max(1, prof.D/FLIGHT.DEPART_S); M.t = 0; M.lastV = M.vo;
  R.phase = 'DEPART'; R.tau = M.tau;
}
/* après une escale (L3) : long-courrier -> étoile suivante (comportement L2.3/L2.4 inchangé) ;
   sinon -> tableau de contrats (commerce local, cf. LOCAL, chargé après ce module) */
R.afterEscale = function(M){
  if(typeof MISSIONS !== 'undefined' && MISSIONS.enabled()){ MISSIONS.afterEscale(M, planDeparture); return; }   /* M1 : plus d'itinéraire */
  if(hasQuantumJump || SHIP_WARP){ planDeparture(M); return; }
  const boardUp = document.getElementById('contractBoardOverlay').classList.contains('visible');
  const yardUp = document.getElementById('shipyardOverlay').classList.contains('visible');
  if(!boardUp && !yardUp) LOCAL.openContractBoard();   /* sinon : rappelée chaque image tant qu'aucun plan n'est relancé */
};
let hopVeil = null;
function veil(op){
  if(!hopVeil){ hopVeil = document.createElement('div');
    hopVeil.style.cssText = 'position:fixed;inset:0;background:#000;pointer-events:none;opacity:0;transition:opacity ' + FLIGHT.HOP_FADE + 's ease;z-index:5';
    const c = document.getElementById('scene'); c.parentNode.insertBefore(hopVeil, c.nextSibling); }
  hopVeil.style.opacity = String(op);
}
R.flight = function(dt){
  const M = R.mission; if(!M || flightPhase === 'ARRIVAL_PAUSE' && R.phase !== 'ORBIT') return;
  if(jumpState) return;                                   /* séquence de saut du jeu : vaisseau et caméra tenus par updateJumpSequence */
  angVel.set(0, 0, 0);                                     /* attitude tenue par le pilote automatique */
  const prev = shipRig.position.clone();
  if(R.phase === 'TRANSFER'){
    M.t += dt*M.tau;
    const st = pathState(M.tr.path, M.tr.prof, M.t, M.upT);
    shipRig.position.copy(st.pos); shipRig.quaternion.copy(st.q);
    currentSpeed = st.speed; R.throttle = st.throttle; burn(M, st.speed);
    if(M.t >= M.tr.prof.D){ R.phase = 'APPROACH'; R.tau = 1; M.s = 0; }
  } else if(R.phase === 'APPROACH'){
    M.s += M.vo*dt;
    const f = corridorAt(M, M.s), B = new V3().crossVectors(f.T, f.U).normalize();
    const yaw = ((keys['ArrowLeft']||keys['KeyQ']||keys['KeyA']) ? 1 : 0) - ((keys['ArrowRight']||keys['KeyD']) ? 1 : 0) + (dragYaw || 0);
    const pit = ((keys['ArrowUp']||keys['KeyZ']||keys['KeyW']) ? 1 : 0) - ((keys['ArrowDown']||keys['KeyS']) ? 1 : 0) + (dragPitch || 0);
    const lat = M.half/6, idle = performance.now() - lastInputTime > IDLE_MS && !yaw && !pit;
    const tvx = idle ? -M.ox*.6 : -yaw*lat, tvy = idle ? -M.oy*.6 : pit*lat;   /* au repos : recentrage automatique */
    M.vx += (tvx - M.vx)*Math.min(1, dt*2.5); M.vy += (tvy - M.vy)*Math.min(1, dt*2.5);
    M.ox = Math.max(-M.half*.85, Math.min(M.half*.85, M.ox + M.vx*dt));
    M.oy = Math.max(-M.half*.85, Math.min(M.half*.85, M.oy + M.vy*dt));
    shipRig.position.copy(f.pos).addScaledVector(B, M.ox).addScaledVector(f.U, M.oy);
    const q = quatNose(f.T, f.U);
    q.multiply(new Q().setFromAxisAngle(v(0, 0, 1), -M.vx/lat*.4)).multiply(new Q().setFromAxisAngle(XAX, M.vy/lat*.12));
    shipRig.quaternion.slerp(q, Math.min(1, dt*6));
    currentSpeed = M.vo; R.throttle = 0; fadeGates(M, M.s);
    if(M.s >= M.Lc) arriveOrbit(M);
  } else if(R.phase === 'ORBIT'){
    if(flightPhase === 'CRUISE') R.afterEscale(M);
    return;                                                /* l'escale v2.16 tient le vaisseau (updateOrbitDelivery) */
  } else if(R.phase === 'DEPART'){
    M.t += dt*M.tau;
    const st = pathState(M.dep.path, M.dep.prof, M.t, M.dep.up);
    shipRig.position.copy(st.pos); shipRig.quaternion.slerp(st.q, Math.min(1, dt*3));
    currentSpeed = st.speed; R.throttle = st.throttle; burn(M, st.speed);
    if(M.t >= M.dep.prof.D){ R.phase = 'COAST'; R.tau = 1; M.coast = 0; M.dir = M.dep.path.dir(M.dep.path.L); }
  } else if(R.phase === 'WARP' || R.phase === 'WARPOUT'){
    if(updateWarp(M, dt)) return;                         /* système suivant construit : pas de report co-mobile depuis l'ancien */
  } else if(R.phase === 'COAST' || R.phase === 'HOP'){
    shipRig.position.addScaledVector(M.dir, currentSpeed*dt); R.throttle = 0;
    if(R.phase === 'COAST'){ M.coast += dt; if(M.coast >= FLIGHT.COAST_S) startPassage(M); }
    else { M.hop += dt;
      if(M.hop >= FLIGHT.HOP_FADE && M.dep.next){ const next = M.dep.next; ROUTE.index = ROUTE.nextDelivery; R.hops = (R.hops || 0) + 1;
        R.enterSystem(next); veil(0); return; } }
  }
  if(!R.camHold){ const d = shipRig.position.clone().sub(prev); camPos.add(d); camLook.add(d); }   /* caméras co-mobiles : suivent le vaisseau sans retard (sauf plan extérieur du départ en distorsion) */
  if(jumpState){ camera.position.copy(camPos); camera.lookAt(camLook); }   /* saut déclenché : la caméra reste fixe pendant la séquence — on la cale sur la dernière position */
};
/* caméra d'escale à l'échelle réelle : plan rapproché du vaisseau, planète en dessous (remplace le plan centré planète) */
R.orbitCam = function(angle, pitch){
  const Ls = SHIP_GAME_LEN, C = orbitState.center, rad = shipRig.position.clone().sub(C).normalize();
  const T = (R.orbitTangent || v(0, 0, -1)).clone(), B = new V3().crossVectors(T, rad).normalize(), sw = Math.sin(angle*.7);
  return { pos: shipRig.position.clone().addScaledVector(rad, Ls*(-.15 + .5*(pitch || 0) + .12*Math.sin(angle))).addScaledVector(T, -Ls*2.6).addScaledVector(B, Ls*1.2*sw),
           look: shipRig.position.clone().addScaledVector(T, Ls*1.5).addScaledVector(rad, -Ls*.6) };
};

/* =====================================================================
   L2.4 — PASSAGE ENTRE ÉTOILES À L'ÉCHELLE RÉELLE
   Sur l'erre (vitesse de départ, 3 s), selon l'équipement du vaisseau :
   - SAUT QUANTIQUE (générateur installé, §23) : séquence du jeu v2.16
     (charge, pli, éclair, onde, quadrillage d'espace-temps) — seule la
     téléportation change : entrée dans le système suivant, au point
     d'arrivée à 32–60 rayons ;
   - DISTORSION (anneaux) : traversée réelle de l'espace interstellaire,
     comme dans la démo — la caméra galactique parcourt les 18–40 pc qui
     séparent les deux étoiles (parallaxe), anneaux et traînées à plein
     régime ; le système quitté s'efface, le suivant est construit pendant
     le ralentissement ; vitesse WARP_FACTOR × 100 c ;
   - sans moyen supraluminique : fondu provisoire (commerce local en L3).
   Coût : celui du jeu (quantumJumpFuelCost, proportionnel à la distance),
   identique pour les deux modes comme en v2.16 — le saut fait gagner du
   temps, pas du carburant. Réservoir insuffisant : le saut est refusé, la
   distorsion passe sur la réserve de secours, 2,5 fois plus lente.
   ===================================================================== */
FLIGHT.WARP_SPOOL = 2.2; FLIGHT.WARP_HOLD = 1.3; FLIGHT.WARP_OUT = 1.8; FLIGHT.WARP_C_PER_FACTOR = 100; FLIGHT.WARP_STOP_U = 40;
R.warpTarget = 0; R.hudSpeed = null; R.galOverride = null;
function startPassage(M){
  const next = R.nextOverride || M.dep.next;
  if(!next){ R.phase = 'HOP'; M.hop = 0; veil(1); return; }
  const dist = next.starPosition.distanceTo(M.leg.gal), cost = quantumJumpFuelCost(dist);
  const mode = (hasQuantumJump && fuel >= cost) ? 'JUMP' : (SHIP_WARP ? 'WARP' : 'HOP');
  M.pass = { mode: mode, next: next, dist: dist, cost: cost, t: 0 }; M.dep.next = next;
  R.lastPassage = mode;
  if(mode === 'JUMP'){
    R.phase = 'JUMP';
    jumpState = { phase: 'charge', t: 0, real: true, next: next, fuelCost: cost, teleported: false };
  } else if(mode === 'WARP'){
    const P = M.pass, pc = dist/38, dir = next.starPosition.clone().sub(M.leg.gal).normalize();
    P.reserve = fuel < cost; P.cruise = clamp(4 + pc*.25, 6, 12)*(P.reserve ? 2.5 : 1);
    P.vC = Math.max(1, WARP_FACTOR)*FLIGHT.WARP_C_PER_FACTOR/(P.reserve ? 2.5 : 1);
    P.galA = M.leg.gal.clone(); P.galStop = next.starPosition.clone().addScaledVector(dir, -FLIGHT.WARP_STOP_U); P.galB = next.starPosition.clone();
    P.tau = pc*3.2616*3.156e7/P.vC/P.cruise;
    R.phase = 'WARP';
    if(typeof SHIPFX !== 'undefined') SHIPFX.warpDepartStart(P, M);   /* L5 : départ vu de l'extérieur, traînée et gerbe violettes */
    R.camHold = P.camHold || null;
  } else { R.phase = 'HOP'; M.hop = 0; veil(1); }
}
function flash(op){ const el = document.getElementById('jumpFlash'); if(el) el.style.opacity = String(op); }
function updateWarp(M, dt){
  const P = M.pass; P.t += dt;
  const T1 = FLIGHT.WARP_SPOOL, T2 = T1 + FLIGHT.WARP_HOLD + P.cruise;
  if(R.phase === 'WARP'){
    R.warpTarget = 1;
    /* L5 (v7.2.1) : engagement vu de l'extérieur — le vaisseau s'éloigne en accélérant (dE·(t/T1)²), disparaît dans la
       gerbe à T1 ; la caméra reste sur la gerbe FLIGHT.WARP_HOLD s, puis rejoint le vaisseau pour la traversée */
    const H = FLIGHT.WARP_HOLD, TC = T1 + H;
    if(P.P0 && P.t < T1) shipRig.position.copy(P.P0).addScaledVector(P.dirW, P.dE*Math.pow(P.t/T1, 2));
    else if(!P.P0) shipRig.position.addScaledVector(M.dir, currentSpeed*dt);
    if(P.P0 && P.t >= T1 && !P.gone){ P.gone = true; shipRig.visible = false; }
    if(P.t >= TC && !P.cut){ P.cut = true; R.camHold = null; shipRig.visible = true;
      camPos.copy(shipRig.position).add(CAM_OFFSET.clone().applyQuaternion(shipRig.quaternion)); camLook.copy(shipRig.position);
      camera.position.copy(camPos); camera.lookAt(camLook); flash(.7); }
    if(P.t >= TC && !P.hid){ P.hid = true; LAYERS.sysWorld.visible = false; R.hideCell = null; if(typeof SHIPFX !== 'undefined') SHIPFX.hideDep(); }   /* le système quitté s'efface : la parallaxe galactique prend le relais */
    else if(P.cut && P.t < TC + .5) flash(.7*(1 - smooth((P.t - TC)/.5)));
    const k = smoother((P.t - TC)/P.cruise);
    R.galOverride = P.galA.clone().lerp(P.galStop, k);
    const eng = smooth(P.t/T1);
    R.hudSpeed = num(P.vC*eng, 0) + ' c  \u23f1\u00d7' + num(P.tau, 0); R.tau = 1;
    currentSpeed = 1900*eng;                              /* traînées à pleine longueur */
    flash(P.t >= T2 - .25 ? smooth((P.t - T2 + .25)/.25)*.8 : 0);
    if(P.t >= T2){                                        /* ralentissement : le système suivant est construit derrière l'éclair */
      const next = P.next; ROUTE.index = ROUTE.nextDelivery; R.hops = (R.hops || 0) + 1;
      fuel = Math.max(0, fuel - Math.min(fuel, P.cost));
      R.enterSystem(next); arrivedAt(next); R.mission.pass = P; R.phase = 'WARPOUT'; P.t2 = 0;
      R.galOverride = P.galStop.clone();
      return true;
    }
  } else {
    P.t2 += dt; const k = smoother(P.t2/FLIGHT.WARP_OUT);
    R.warpTarget = 0; R.galOverride = P.galStop.clone().lerp(P.galB, k);
    flash(.8*(1 - smooth(P.t2/.5)));
    R.hudSpeed = num(P.vC*(1 - k), 0) + ' c'; currentSpeed = 1900*(1 - k);
    if(P.t2 >= FLIGHT.WARP_OUT){ R.galOverride = null; R.hudSpeed = null; flash(0); currentSpeed = 0; R.phase = 'TRANSFER'; }
  }
  return false;
}
R.jumpTeleport = function(js){
  fuel = Math.max(0, fuel - js.fuelCost);
  ROUTE.index = ROUTE.nextDelivery; R.hops = (R.hops || 0) + 1;
  R.enterSystem(js.next);
  arrivedAt(js.next);
  camera.position.copy(camPos); camera.lookAt(camLook);
};
/* tests : saute l'approche et l'escale (vaisseau en orbite basse, prêt au départ) */
R.debugSkipToDeparture = function(){
  const M = R.mission; if(!M) return;
  disposeCorridor();
  shipRig.position.copy(M.C).addScaledVector(M.Uo, M.ro);
  shipRig.quaternion.copy(quatNose(new V3().crossVectors(M.N, M.Uo).normalize(), M.Uo));
  camPos.copy(shipRig.position).add(CAM_OFFSET.clone().applyQuaternion(shipRig.quaternion)); camLook.copy(shipRig.position);
  if(!M.local) ROUTE.nextDelivery = Math.min(ROUTE.nextDelivery + 1, ROUTE.legs.length - 1);
  flightPhase = 'CRUISE'; R.phase = 'ORBIT';
};


/* =====================================================================
   L4 — DONNÉES DE LA CARTE 2D ET CIBLAGE DU PROCHAIN SAUT
   systemInfo / moonsInfo : mêmes structures que cine.js (C.systemInfo, C.moonsInfo) ;
   le système courant est lu tel qu'il est construit, les autres sont rejoués depuis leur
   graine (données pures, aucun maillage). planeBasis : reprise telle quelle de cine.js.
   Prochain saut : R.nextTarget() = cible choisie sur la carte (R.nextOverride) sinon étape
   suivante de l'itinéraire ; une cible choisie pendant un passage attend le suivant
   (R.pendingNext). Arrivée hors itinéraire : l'itinéraire est recalculé depuis la nouvelle
   étoile, et l'escale qui suit ne consomme pas d'étape (R.offRoute).
   ===================================================================== */
function planeBasis(cell){ const n = rngFor(SEED + ':system:' + cell), a = 2 + Math.floor(2*n()); Math.floor(n()*a);
  const r = new V3(n() - .5, .35*(n() - .5), n() - .5).normalize(), i = Math.abs(r.y) < .9 ? v(0, 1, 0) : v(1, 0, 0);
  const s = new V3().crossVectors(i, r).normalize(), l = new V3().crossVectors(r, s).normalize(); return { s, l, n: r }; }
const SYS_INFO = new Map();
R.visited = [];
R.nextOverride = null; R.pendingNext = null; R.offRoute = false;
R.systemInfo = function(cell){
  if(R.leg && R.leg.cell === cell) SYS_INFO.delete(cell);          /* système courant : toujours relu (positions vivantes) */
  let e = SYS_INFO.get(cell); if(e) return e;
  let leg = R.leg && R.leg.cell === cell ? R.leg : null;
  if(!leg){
    const c = String(cell).split(',').map(Number), sd = starDataForCell(c[0], c[1], c[2]); if(!sd) return null;
    leg = localLeg({ name: sd.name, designation: sd.star.designation, starPosition: sd.position, cell: sd.cell, star: sd.star });
    ensureSystemData(leg);
  }
  const B = planeBasis(cell), st = leg.star, aHZ = Math.sqrt(leg.lum)*AU;
  e = { cell: cell, name: leg.name, designation: leg.designation, color: [st.color.r, st.color.g, st.color.b], lum: leg.lum, Rs: leg.Rs, temp: st.temp, mass: st.mass, lumLabel: st.lumLabel, gal: leg.gal.toArray(),
    basis: { s: B.s.toArray(), l: B.l.toArray() }, hz: [aHZ*.8, aHZ*1.4], belt: leg.beltInfo ? [leg.beltInfo.inner, leg.beltInfo.outer] : null,
    planets: leg.planets.map((p, i) => ({ i: i, name: p.properName, kind: p.kind.key, gas: !!p.kind.gas, R: p.radius, a: p.orbitA, ang: Math.atan2(p.position.dot(B.l), p.position.dot(B.s)),
      moons: p.moonCount || 0, rings: !!p.hasRings, hab: !!p.isHabitable, atmo: !!p.hasAtmosphere, day: p.dayLen })) };
  if(leg !== R.leg){ SYS_INFO.set(cell, e); if(SYS_INFO.size > 80) SYS_INFO.delete(SYS_INFO.keys().next().value); }
  return e;
};
R.moonsInfo = function(pi){ const p = R.leg && R.leg.planets[pi]; if(!p) return [];
  return (p.moonPivots || []).map((pv, k) => { const m = pv.children[0]; if(!m) return null; const rel = m.getWorldPosition(new V3()).sub(p.position);
    return { k: k, name: pv.userData.moonName || (p.properName + ' ' + 'abcdef'[k]), R: m.scale.x, d: pv.userData.dist || rel.length(), rel: rel.toArray() }; }).filter(Boolean); };
R.nextTarget = function(){
  if(R.nextOverride) return R.nextOverride;
  /* avant la première escale d'un système, l'étape courante de l'itinéraire EST le système visité :
     le prochain saut est l'étape suivante (après l'escale, nextDelivery a déjà avancé) */
  let i = ROUTE.nextDelivery;
  if(ROUTE.legs[i] && R.leg && ROUTE.legs[i].cell === R.leg.cell) i++;
  return ROUTE.legs[i] || null;
};
/* arrivée par saut ou distorsion : si la cible venait de la carte, itinéraire recalculé depuis elle */
function arrivedAt(next){
  if(next && next === R.nextOverride){
    R.nextOverride = R.pendingNext; R.pendingNext = null; R.offRoute = true;
    computeRoute(next.starPosition.clone(), new V3(0, 0, -1).applyQuaternion(shipRig.quaternion), false);
    if(ROUTE.gates) ROUTE.gates.visible = false;
  } else if(R.pendingNext){ R.nextOverride = R.pendingNext; R.pendingNext = null; }
}
R.arrivedAt = arrivedAt;

R.shipScale = function(){ return SHIP_GAME_LEN/40; };
R.radialUp = function(){ return shipRig.position.clone().sub(orbitState.center).normalize(); };

return R;
})();
/* position galactique courante (unités du jeu) : le vaisseau en v2.16, l'étoile visitée à l'échelle réelle */
function galPosition(){ return (REAL.active && (REAL.started || REAL.titleActive)) ? REAL.galPos : shipRig.position; }
