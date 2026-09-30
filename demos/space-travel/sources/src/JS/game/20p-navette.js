/* =========================================================================
   NAVETTE-CARGO ET CONTENEUR ISO 20' (lot N — refonte de la navette, choix P2)
   - Conteneur ISO 20' réel : 6,058 × 2,438 × 2,591 m ; tôle ondulée, rails, pièces de coin, portes à
     barres de verrouillage, code propriétaire (texture générée, une par combinaison couleur/code) ;
     couleur d'armateur tirée par graine. Un seul maillage (6 faces texturées).
   - Navette-cargo : corps de la navette de transport de la démo (smallcraft.js, 17,5 m : cockpit,
     hublots, ailerons radiateurs, 2 tuyères à torche, RCS, feux, usure) + BERCEAU DORSAL à 4 pinces.
     Dorsal et non ventral (rendu de principe) : pendant le chargement, la navette attend sous le module
     d'amarrage et le bras descend le conteneur depuis la soute — il le pose donc sur son dos.
   - Même interface que l'ancienne navette (group, glow, clampGroup, navLights, trail, hasCargo) : le
     chargement, le vol et les plans de caméra existants s'en servent sans autre changement.
   - Module d'amarrage dimensionné pour le conteneur ISO (DOCK_SCALE m par unité d'origine) au lieu de la
     taille du vaisseau : le conteneur passe la porte de la soute quel que soit le modèle.
   ========================================================================= */
const CARGO = (function(){
const V3 = THREE.Vector3;
const ISO = { L: 6.058, W: 2.438, H: 2.591 };
const DOCK_SCALE = ISO.L/1.2;                                  /* le module d'origine était dessiné pour un conteneur de 1,2 u */
const COLORS = ['#9c3b2a', '#2f5d8c', '#3f7a4a', '#d9822b', '#7d8691', '#d8d6cc', '#5b3f7a', '#b8a032'];
const OWNERS = ['STTU', 'MCGU', 'VYGU', 'ORNU', 'KSLU', 'ASTU'];
const cache = {};
function rng(seed){ let s = (seed >>> 0) || 1; return () => { s = (s*16807) % 2147483647; return s/2147483647; }; }
function shade(hex, k){ const n = parseInt(hex.slice(1), 16), c = [n >> 16, n >> 8 & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v*k)))); return 'rgb(' + c.join(',') + ')'; }
function tex(key, w, h, draw){ if(cache[key]) return cache[key]; const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.anisotropy = 4; if(renderer && renderer.outputEncoding !== undefined) t.encoding = THREE.sRGBEncoding; cache[key] = t; return t; }
/* flanc : ondulations verticales, rails haut/bas, pièces de coin, salissures, code propriétaire */
function sideTex(col, code, big, r){
  return tex('s' + col + code + big, 1024, 448, (g, w, h) => {
    g.fillStyle = col; g.fillRect(0, 0, w, h);
    for(let x = 0; x < w; x += 16){ g.fillStyle = shade(col, 1.14); g.fillRect(x, 0, 6, h); g.fillStyle = shade(col, .8); g.fillRect(x + 9, 0, 5, h); }
    g.fillStyle = shade(col, .62); g.fillRect(0, 0, w, 22); g.fillRect(0, h - 26, w, 26);
    g.fillStyle = '#2b2b2b'; [[0, 0], [w - 44, 0], [0, h - 44], [w - 44, h - 44]].forEach(([x, y]) => g.fillRect(x, y, 44, 44));
    for(let i = 0; i < 26; i++){ g.fillStyle = 'rgba(70,40,20,' + (.05 + .12*r()) + ')'; const x = r()*w, y = r()*h; g.fillRect(x, y, 6 + 40*r(), 2 + 90*r()); }
    if(big){ g.fillStyle = 'rgba(255,255,255,.88)'; g.font = 'bold 54px JetBrains Mono, monospace'; g.fillText(big, 70, 120); }
    g.fillStyle = 'rgba(255,255,255,.85)'; g.font = 'bold 26px JetBrains Mono, monospace'; g.fillText(code, w - 320, 76);
    g.font = '18px JetBrains Mono, monospace'; g.fillText('22G1 · MAX 30 480 KG', w - 320, 104);
  });
}
function endTex(col, door){
  return tex('e' + col + door, 256, 272, (g, w, h) => {
    g.fillStyle = col; g.fillRect(0, 0, w, h);
    g.fillStyle = shade(col, .62); g.fillRect(0, 0, w, 18); g.fillRect(0, h - 18, w, 18); g.fillRect(0, 0, 16, h); g.fillRect(w - 16, 0, 16, h);
    g.fillStyle = '#2b2b2b'; [[0, 0], [w - 30, 0], [0, h - 30], [w - 30, h - 30]].forEach(([x, y]) => g.fillRect(x, y, 30, 30));
    if(door){ g.fillStyle = shade(col, .5); g.fillRect(w/2 - 2, 18, 4, h - 36);
      [.16, .36, .64, .84].forEach(k => { g.fillStyle = '#c8c8c0'; g.fillRect(k*w - 4, 22, 8, h - 44); g.fillStyle = '#6b6b66'; g.fillRect(k*w - 10, h*.5 - 6, 20, 12); }); }
  });
}
function topTex(col){ return tex('t' + col, 256, 512, (g, w, h) => { g.fillStyle = shade(col, .9); g.fillRect(0, 0, w, h); for(let y = 0; y < h; y += 24){ g.fillStyle = shade(col, .78); g.fillRect(0, y, w, 8); } }); }
function buildIsoContainer(seed){
  const r = rng(seed || 7), col = COLORS[Math.floor(r()*COLORS.length)], own = OWNERS[Math.floor(r()*OWNERS.length)];
  const num = String(Math.floor(r()*900000) + 100000), code = own + ' ' + num + ' ' + Math.floor(r()*10), big = r() < .5 ? own.slice(0, 3) : '';
  const std = (map) => new THREE.MeshStandardMaterial({ map: map, metalness: .35, roughness: .62 });
  const side = std(sideTex(col, code, big, r));
  const mats = [side, side, std(topTex(col)), std(topTex(col)), std(endTex(col, true)), std(endTex(col, false))];   /* +x −x +y −y +z(portes) −z */
  const m = new THREE.Mesh(new THREE.BoxGeometry(ISO.W, ISO.H, ISO.L), mats);
  const g = new THREE.Group(); g.add(m); g.userData.iso = true; g.userData.code = code;
  return g;
}
/* traînée (identique à l'ancienne navette : polyligne en coordonnées monde, fondu par assombrissement) */
function buildTrail(){
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SHUTTLE_TRAIL_LEN*3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SHUTTLE_TRAIL_LEN*3), 3));
  const tr = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: .85 }));
  tr.frustumCulled = false; return tr;
}
function buildCargoShuttle(seed){
  const c = window.__CRAFT.build('crew', { age: typeof SHIP_WEAR !== 'undefined' ? SHIP_WEAR.age : .1, seed: seed || 1 });
  if(c.thr) c.thr.value = .15;
  const g = new THREE.Group(); g.add(c.group);
  const b = c.box.clone(), top = b.max.y, zc = (b.min.z + b.max.z)/2 + .4;
  /* berceau dorsal : deux rails et quatre pinces */
  const mDark = new THREE.MeshStandardMaterial({ color: 0x3b4252, metalness: .6, roughness: .45 });
  const mAmb = new THREE.MeshStandardMaterial({ color: 0x2a1c08, emissive: 0xffb454, emissiveIntensity: .8 });
  [-1, 1].forEach(sx => { const rail = new THREE.Mesh(new THREE.BoxGeometry(.28, .3, ISO.L + .6), mDark); rail.position.set(sx*(ISO.W/2 - .3), top + .15, zc); g.add(rail);
    [-1, 1].forEach(sz => { const cl = new THREE.Mesh(new THREE.BoxGeometry(.34, .75, .34), mDark); cl.position.set(sx*(ISO.W/2 + .12), top + .45, zc + sz*(ISO.L/2 - .35)); g.add(cl);
      const led = new THREE.Mesh(new THREE.BoxGeometry(.12, .12, .12), mAmb); led.position.set(sx*(ISO.W/2 + .12), top + .86, zc + sz*(ISO.L/2 - .35)); g.add(led); }); });
  const clampGroup = new THREE.Group(); clampGroup.position.set(0, top + .3 + ISO.H/2, zc); g.add(clampGroup);
  /* lueur de propulsion à l'arrière (utilisée par le vol : fondu à l'arrivée) */
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x9fd4ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 1 }));
  glow.position.set(0, (b.min.y + b.max.y)/2, b.max.z + .8); glow.scale.setScalar(3.2); g.add(glow);
  return { group: g, glow: glow, clampGroup: clampGroup, navLights: c.nav || [], hasCargo: false, trail: buildTrail(), craft: c,
           engineBack: b.max.z + .8, len: b.max.z - b.min.z };
}
/* points de saisie et de dépose de la pince, dans le repère du vaisseau (une fois par chargement) :
   le conteneur attend EXACTEMENT où la pince le saisit, la navette se place EXACTEMENT où elle le dépose */
const _q = new THREE.Quaternion();
function armPoints(){
  if(!window.shipArm) return null;
  const grip = () => { shipRig.updateMatrixWorld(true); return window.shipArm.gripper.localToWorld(new V3(0, 0, .25)); };
  applyArmPose(ARM_POSE_REACH); const pR = grip(); applyArmPose(ARM_POSE_PLACE); const pP = grip(); applyArmPose(ARM_POSE_REST); shipRig.updateMatrixWorld(true);
  _q.copy(shipRig.quaternion).invert();
  return { stage: pR.sub(shipRig.position).applyQuaternion(_q), place: pP.sub(shipRig.position).applyQuaternion(_q) };
}
function shipPoint(local){ return local.clone().applyQuaternion(shipRig.quaternion).add(shipRig.position); }
/* ===================== navette de baie des porte-conteneurs (lot N2) =====================
   Décision du 28/09 : la navette SORT DE LA BAIE ventrale du vaisseau, longe la coque jusqu'à la pile, prend
   directement le conteneur extérieur, livre au port, puis REVIENT SE RANGER dans la baie. Tout le trajet proche du
   vaisseau est calculé dans son repère (il file à ~8 km/s en orbite) et se fait à vitesse de manœuvre :
   chaque mouvement part de l'arrêt et s'y arrête, avec une vitesse de pointe imposée (VP). Pas de module
   d'amarrage ni de bras sur ces vaisseaux. Le logement vidé reste vide pendant l'escale ; la pile est complétée
   au départ de l'étape suivante. */
const CONTAINER_GROUPS = ['Fret en entrepôt', 'Fret en poutre'];
function isContainerShip(id){ const m = SHIPGEN.MODELS.find(x => x.id === id); return !!m && CONTAINER_GROUPS.includes(m.group); }
const VP = { exit: 2.5, side: 8, approach: 2, clear: 8, enter: 2.5 };        /* vitesses de pointe (m/s) — relevées pour raccourcir l'escale (29/09) */
const T_PICK = 2.6, GAP = .6, CLEAR_D = 30;   /* écartement jusqu'à 30 m de la pile (60 m auparavant) : au-delà, la navette accélère */
let taken = [];
const smoother = x => { x = Math.max(0, Math.min(1, x)); return x*x*x*(x*(6*x - 15) + 10); };
/* durée d'un mouvement de longueur L (profil lissé : vitesse de pointe = 1,875 L / T) */
const durFor = (L, vp) => Math.max(3, 1.875*L/vp);
function toLocal(w){ return shipRig.worldToLocal(w.clone()); }
function dirToLocal(d){ return d.clone().applyQuaternion(shipRig.quaternion.clone().invert()); }
/* baie ventrale (shipglass) et encombrement du vaisseau, dans le repère du vaisseau */
function bayInfo(){
  const b = SHIP_BUILD; if(!b || !b.docks) return null;
  const d = arguments[0] || b.docks.find(x => x.ventral) || b.docks[0]; if(!d) return null;
  shipRig.updateMatrixWorld(true);
  const C = toLocal(b.group.localToWorld(d.C.clone()));
  const N = dirToLocal(d.N.clone().transformDirection(b.group.matrixWorld)).normalize();
  const box = new THREE.Box3(); b.group.traverse(o => { if(o.isMesh && !o.isSprite && o.geometry && !(o.userData && o.userData.glass)){ o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); [bb.min, bb.max].forEach(p => box.expandByPoint(toLocal(p))); } });
  return { C: C, N: N, D: d.D, hx: d.hx, hy: d.hy, box: box, ventral: !!d.ventral };
}
function stackSlots(){
  const out = []; if(!SHIP_HULL) return out;
  SHIP_HULL.updateMatrixWorld(true);
  SHIP_HULL.traverse(o => { if(o.userData && o.userData.cargo && o.visible){ out.push({ obj: o, local: toLocal(o.getWorldPosition(new V3())), dims: o.userData.cdims }); } });
  if(!out.length) return out;
  const maxX = Math.max(...out.map(s => Math.abs(s.local.x)));
  const outer = out.filter(s => Math.abs(s.local.x) >= maxX - .5*s.dims[0]);   /* couche extérieure, bâbord ou tribord */
  const mis = outer.filter(s => s.obj.userData.mission);                         /* M1 : conteneurs de la mission en priorité */
  return mis.length ? mis : outer;
}
function restoreStack(){ taken.forEach(o => { o.visible = true; }); taken = []; }
/* chemin polyligne (repère du vaisseau) parcouru selon le profil lissé */
function polyline(pts){
  const seg = []; let L = 0;
  for(let i = 1; i < pts.length; i++){ const l = pts[i].distanceTo(pts[i - 1]); seg.push(l); L += l; }
  return { L: L, at: s => { let acc = 0; for(let i = 0; i < seg.length; i++){ if(s <= acc + seg[i] || i === seg.length - 1){ const k = seg[i] > 0 ? Math.min(1, (s - acc)/seg[i]) : 1; return pts[i].clone().lerp(pts[i + 1], k); } acc += seg[i]; } return pts[pts.length - 1].clone(); } };
}
/* ---- autres vaisseaux (décision : chacun livre sa cargaison avec les engins de ses baies, JAMAIS de conteneur) ----
   paquebot : navette de transport (passagers) ; Vagabonde : drone-cargo ; pousseurs : navette de maintenance.
   Baie choisie pour que l'engin y tienne : ventrale (engin à plat, axe long le long de la baie) ou latérale (engin nez
   vers l'intérieur, sortie en marche arrière — comme les navettes de la démo). */
function buildBayCraft(kind, variant, seed, slim){
  const c = window.__CRAFT.build(kind, { variant: variant, age: typeof SHIP_WEAR !== 'undefined' ? SHIP_WEAR.age : .1, seed: seed || 1, slim: !!slim });
  if(c.thr) c.thr.value = .08;
  const g = new THREE.Group(); g.add(c.group); const b = c.box.clone();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x9fd4ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 1 }));
  glow.position.set(0, (b.min.y + b.max.y)/2, b.max.z + .5); glow.scale.setScalar(Math.max(1, (b.max.x - b.min.x)*.6)); g.add(glow);
  const clampGroup = new THREE.Group(); g.add(clampGroup);
  return { group: g, glow: glow, clampGroup: clampGroup, navLights: c.nav || [], hasCargo: false, trail: buildTrail(), craft: c, engineBack: b.max.z + .5, len: b.max.z - b.min.z, kind: kind };
}
function startBayOther(){
  const b = SHIP_BUILD, m = SHIPGEN.MODELS.find(x => x.id === SHIP_ID); if(!b || !b.docks || !b.docks.length || !m) return false;
  let kind = m.group === 'Passagers' ? 'crew' : m.group === 'Indépendants' ? 'drone' : 'maint';
  const slim = m.group === 'Pousseurs';                         /* baies ventrales des pousseurs : fentes de 3,2 m — version étroite (2,5 m) */
  let sh = buildBayCraft(kind, kind === 'drone' ? 'cargo' : undefined, _shuttleIdCounter + 11, slim);
  const sz = sh.craft.box.getSize(new V3());
  /* marges serrées : les engins de la démo passent par ces mêmes baies (la navette de transport du paquebot : 6,8 m de haut
     pour 7,0 m d'ouverture ; les drones de la Vagabonde dans des fentes de 2,3 m) */
  const fitsBelly = d => d.ventral && 2*d.hx >= sz.z + .6 && 2*d.hy >= sz.x + .3 && d.D >= sz.y + .3;
  const fitsSide = d => !d.ventral && d.D >= sz.z - .5 && 2*d.hx >= sz.x + .3 && 2*d.hy >= sz.y + .05;   /* la tuyère peut affleurer au champ (paquebot : 17,3 m pour 17,5 m) */
  let dk = b.docks.find(fitsBelly) || b.docks.find(fitsSide);
  if(!dk && kind === 'crew'){ sh = buildBayCraft('maint', undefined, _shuttleIdCounter + 11, true); kind = 'maint'; const s2 = sh.craft.box.getSize(new V3()); sz.copy(s2); dk = b.docks.find(fitsBelly) || b.docks.find(fitsSide); }
  if(!dk){                                                        /* dernier recours (fret léger) : le drone-cargo tient dans toutes les baies */
    sh.craft.dispose && sh.craft.dispose(); sh = buildBayCraft('drone', 'cargo', _shuttleIdCounter + 11); kind = 'drone';
    sz.copy(sh.craft.box.getSize(new V3())); dk = b.docks.find(fitsBelly) || b.docks.find(fitsSide); }
  if(!dk) return false;
  const bay = bayInfo(dk), ventral = bay.ventral;
  /* attitude de rangement (repère du vaisseau) : à plat sous le vaisseau, ou nez vers l'intérieur d'une baie latérale */
  const parkQ = ventral ? new THREE.Quaternion() : new THREE.Quaternion().setFromUnitVectors(new V3(0, 0, -1), bay.N.clone().negate());
  const halfN = ventral ? sz.y/2 : sz.z/2;
  const bayIn = bay.C.clone().addScaledVector(bay.N, -Math.max(halfN - .5, Math.min(bay.D - halfN - .3, halfN + .4))), bayOut = bay.C.clone().addScaledVector(bay.N, halfN + 2.5);
  const clearDir = bay.N.clone().add(new V3(0, -.6, 0)).normalize(), clearTo = bayOut.clone().addScaledVector(clearDir, CLEAR_D);
  const ORD = (window.__SHIPGLASS && __SHIPGLASS.RENDER_ORDER) ? __SHIPGLASS.RENDER_ORDER.craft : 7;
  sh.group.traverse(o => { if(o.isMesh || o.isSprite) o.renderOrder = ORD; });
  sh.group.position.copy(shipPoint(bayIn)); sh.group.quaternion.copy(shipRig.quaternion.clone().multiply(parkQ));
  LAYERS.shipWorld.add(sh.group); LAYERS.shipWorld.add(sh.trail);
  const plan = [
    { ph: 'exit',  path: polyline([bayIn, bayOut]), T: durFor(bayOut.distanceTo(bayIn), VP.exit) },
    { ph: 'clear', path: polyline([bayOut, clearTo]), T: durFor(CLEAR_D, VP.clear) }
  ];
  const camSeq = SHUTTLE_CAMERA_SEQUENCES[Math.floor(Math.random()*SHUTTLE_CAMERA_SEQUENCES.length)], id = ++_shuttleIdCounter;
  sh.rest = clearTo; sh.pickQ = parkQ; sh.outLocal = clearDir.clone(); sh.bay = { bayIn: bayIn, bayOut: bayOut, N: bay.N.clone(), parkQ: parkQ, box: bay.box };
  orbitState.loading = { id: id, pick: false, bayFlow: true, phase: 'exit', step: 0, st: 0, plan: plan, shuttle: sh, container: null, t: 0,
    duration: plan.reduce((a, p) => a + p.T, 0), camSeq: camSeq, grabbed: true, released: true, kind: kind };
  return true;
}
/* citernier (sans baie) : glace transférée sans navette — la livraison est comptée et payée comme les autres */
function deliverDirect(){
  const os = orbitState; os.deliveredCount = (os.deliveredCount || 0) + 1;
  if(!os.creditsPaid && os.spawned.every(Boolean) && os.deliveredCount >= os.spawnFractions.length){
    const total = os.cargoSplit.reduce((a, b) => a + b, 0); addCredits(total*os.unitPrice); os.creditsPaid = true; }
}
function startBay(){
  if(!isContainerShip(SHIP_ID)) return startBayOther();
  const bay = bayInfo(), slots = stackSlots(); if(!bay || !slots.length) return false;
  const s = slots[Math.floor(Math.random()*slots.length)], side = Math.sign(s.local.x) || 1, w = s.dims[0];
  const sh = buildCargoShuttle(_shuttleIdCounter + 11);
  const ORD = (window.__SHIPGLASS && __SHIPGLASS.RENDER_ORDER) ? __SHIPGLASS.RENDER_ORDER.craft : 7;
  sh.group.traverse(o => { if(o.isMesh || o.isSprite) o.renderOrder = ORD; });   /* dessinée après le portail de la baie */
  const len = sh.len, halfH = 3.4;
  /* garée dans la baie : le long de son axe, sa face dorsale vers le fond ; point de sortie sous l'ouverture */
  const bayIn = bay.C.clone().addScaledVector(bay.N, -(Math.max(halfH + .4, bay.D - halfH - .6)));
  const bayOut = bay.C.clone().addScaledVector(bay.N, halfH + 2.5);
  /* pose de prise : navette roulée de 90° (dos vers la pile), berceau face au logement */
  const pickQ = new THREE.Quaternion().setFromAxisAngle(new V3(0, 0, 1), side*Math.PI/2);
  sh.clampGroup.position.y = sh.clampGroup.position.y - ISO.H/2 + w/2;
  const out = s.local.clone().add(new V3(side*(w + GAP), 0, 0));
  const rest = out.clone().sub(sh.clampGroup.position.clone().applyQuaternion(pickQ));
  const hold = rest.clone().add(new V3(side*4, 0, 0));
  /* le long de la coque, en dehors de son encombrement (anneaux compris) : sous la baie, puis sur le flanc */
  const xOut = side*(Math.max(Math.abs(bay.box.min.x), Math.abs(bay.box.max.x)) + len*.5 + 4);
  /* descente sous le point le plus bas du vaisseau avant de se décaler : jamais dans son encombrement */
  const yLow = Math.min(bayOut.y, bay.box.min.y - halfH - 2);
  const W0 = new V3(bayOut.x, yLow, bayOut.z), W1 = new V3(xOut, yLow, bayOut.z), W2 = new V3(xOut, hold.y, hold.z);
  /* écartement en DIAGONALE (vers l'extérieur et vers le bas, côté planète et port) : quitte vite le voisinage du vaisseau */
  const clearDir = new V3(side, -1.1, 0).normalize(), clearTo = rest.clone().addScaledVector(clearDir, CLEAR_D);
  const cont = s.obj.clone(true); s.obj.updateMatrixWorld(true); s.obj.matrixWorld.decompose(cont.position, cont.quaternion, cont.scale);
  s.obj.visible = false; taken.push(s.obj); LAYERS.shipWorld.add(cont);
  sh.group.position.copy(shipPoint(bayIn)); sh.group.quaternion.copy(shipRig.quaternion);
  LAYERS.shipWorld.add(sh.group); LAYERS.shipWorld.add(sh.trail);
  if(sh.craft && sh.craft.thr) sh.craft.thr.value = .08;
  const toSide = polyline([bayOut, W0, W1, W2, hold]);
  const plan = [
    { ph: 'exit',     path: polyline([bayIn, bayOut]), T: durFor(bayOut.distanceTo(bayIn), VP.exit) },
    { ph: 'toStack',  path: toSide, T: durFor(toSide.L, VP.side) },
    { ph: 'approach', path: polyline([hold, rest]), T: durFor(6, VP.approach) },
    { ph: 'pick',     T: T_PICK },
    { ph: 'clear',    path: polyline([rest, clearTo]), T: durFor(CLEAR_D, VP.clear) }
  ];
  const camSeq = SHUTTLE_CAMERA_SEQUENCES[Math.floor(Math.random()*SHUTTLE_CAMERA_SEQUENCES.length)], id = ++_shuttleIdCounter;
  sh.rest = clearTo; sh.pickQ = pickQ; sh.outLocal = clearDir.clone();
  sh.bay = { bayIn: bayIn, bayOut: bayOut, N: bay.N.clone(), box: bay.box };
  orbitState.loading = { id: id, pick: true, bayFlow: true, phase: 'exit', step: 0, st: 0, plan: plan, shuttle: sh, container: cont, t: 0,
    duration: plan.reduce((a, p) => a + p.T, 0), camSeq: camSeq, grabbed: false, released: false, side: side,
    slotLocal: s.local.clone(), outLocal: out };
  return true;
}
/* phases proches du vaisseau du chargement (sortie de baie → pile → prise → écartement) ; true quand terminé */
function updateBay(L, dt){
  const sh = L.shuttle, qShip = shipRig.quaternion, qPick = qShip.clone().multiply(sh.pickQ);
  L.st += dt;
  while(L.step < L.plan.length && L.st >= L.plan[L.step].T){ L.st -= L.plan[L.step].T; L.step++; }
  if(L.step >= L.plan.length) return true;
  const P = L.plan[L.step], k = L.st/P.T, e = smoother(k); L.phase = P.ph;
  if(P.path) sh.group.position.copy(shipPoint(P.path.at(e*P.path.L)));
  if(P.ph === 'exit'){ sh.group.quaternion.copy(L.pick ? qShip : qPick); if(sh.craft && sh.craft.thr) sh.craft.thr.value = .08 + .2*Math.sin(Math.PI*k); }
  else if(P.ph === 'toStack'){ sh.group.quaternion.copy(qShip).slerp(qPick, smoother((k - .2)/.6)); if(sh.craft && sh.craft.thr) sh.craft.thr.value = .1 + .35*Math.sin(Math.PI*k); }
  else if(P.ph === 'approach'){ sh.group.quaternion.copy(qPick); if(sh.craft && sh.craft.thr) sh.craft.thr.value = .06; }
  else if(P.ph === 'pick'){
    sh.group.quaternion.copy(qPick); sh.group.position.copy(shipPoint(L.plan[2].path.at(L.plan[2].path.L)));
    if(!L.grabbed) L.grabbed = true;
    if(!L.released){
      L.container.position.copy(shipPoint(L.slotLocal.clone().lerp(L.outLocal, e))); L.container.quaternion.copy(qShip);
      if(k >= .999){ L.released = true; sh.group.updateMatrixWorld(true); sh.clampGroup.attach(L.container); sh.hasCargo = true; }
    }
  } else if(P.ph === 'clear'){
    if(!L.released && L.container){                                         /* image longue qui a sauté la fin de la prise : conteneur replacé à sa position
                                                               finale DE CETTE IMAGE avant l'accrochage (sinon ~300 m de retard en orbite) */
      sh.group.quaternion.copy(qPick); sh.group.position.copy(shipPoint(L.plan[2].path.at(L.plan[2].path.L)));
      L.container.position.copy(shipPoint(L.outLocal)); L.container.quaternion.copy(qShip);
      L.released = true; sh.group.updateMatrixWorld(true); sh.clampGroup.attach(L.container); sh.hasCargo = true;
    }
    sh.group.quaternion.copy(qPick); if(sh.craft && sh.craft.thr) sh.craft.thr.value = .1 + .4*k;
  }
  if(L.container && !L.grabbed){ L.container.position.copy(shipPoint(L.slotLocal)); L.container.quaternion.copy(qShip); }
  return false;
}
/* retour (vol) : calculé dans le repère du vaisseau — la distance restante jusqu'au POINT D'APPROCHE (60 m sous la baie)
   (90 m sous la baie) décroît en échelle logarithmique et s'annule avec une vitesse nulle. L'interpolation d'origine (du port vers le
   vaisseau) arrivait encore à des centaines de m/s dans les derniers mètres : profil de l'ancien monde compressé. */
const GATE = 40;
/* point d'approche du retour : dans l'axe de sortie de la baie, au plus près MAIS hors de l'encombrement du vaisseau élargi de
   45 m — la fin du vol (encore rapide) reste hors de la zone de manœuvre ; seule l'approche finale (≤ 8 m/s) s'en approche.
   Placé dans la direction d'arrivée, à 40 m, il faisait longer la coque à ~60 m/s (test navette de baie, 29/09). */
function gateOf(B){
  const box = B.box ? B.box.clone().expandByScalar(45) : null, p = new V3();
  for(let g = GATE*.5; g <= 400; g += 5){ p.copy(B.bayOut).addScaledVector(B.N, g); if(!box || !box.containsPoint(p)) break; }
  return p.clone();
}
function toShipLocal(w){ return w.clone().sub(shipRig.position).applyQuaternion(shipRig.quaternion.clone().invert()); }
function returnPose(s, f){
  const B = s.bay;
  if(!s.ret){
    const start = toShipLocal(s.group.getWorldPosition(new V3()));
    const gate = gateOf(B);   /* dans l'axe de sortie de la baie, juste hors de la zone des 40 m (et non dans la direction d'arrivée) */
    const d0 = start.distanceTo(gate), dir = start.clone().sub(gate).normalize();
    s.ret = { gate: gate, dir: dir, lnD: Math.log(d0 + 1) }; B.gate = gate;
  }
  const R = s.ret, e = f*f*(3 - 2*f), d = Math.exp(R.lnD*(1 - e)) - 1;
  const local = R.gate.clone().addScaledVector(R.dir, d), pos = shipPoint(local);
  const toward = R.dir.clone().negate().applyQuaternion(shipRig.quaternion);
  return { pos: pos, look: toward, d: d };
}
/* départ (vol) depuis le point d'écartement : repère du vaisseau, distance parcourue croissant en échelle logarithmique —
   la vitesse est proportionnelle à la distance déjà parcourue : lente près du vaisseau, rapide seulement loin de lui.
   L'interpolation d'origine (du point de départ vers le port) partait à des centaines de m/s dès les premiers mètres. */
function departPose(s, f, targetWorld){
  if(!s.dep) s.dep = { start: toShipLocal(s.group.getWorldPosition(new V3())) };
  const tgt = toShipLocal(targetWorld), D = tgt.distanceTo(s.dep.start), dir = tgt.clone().sub(s.dep.start).normalize();
  const e = f*f*(3 - 2*f), d = Math.min(D, Math.exp(Math.log(D + 1)*e) - 1);
  const local = s.dep.start.clone().addScaledVector(dir, d);
  return { pos: shipPoint(local), look: dir.clone().applyQuaternion(shipRig.quaternion) };
}
/* approche (point d'approche → sous la baie, ≤ 5 m/s) puis entrée lente en baie ; true quand rangée */
function updateEnter(s, dt){
  const B = s.bay; if(!B) return true;
  if(!s.enterPlan){ const g = B.gate || gateOf(B);
    s.enterPlan = [{ path: polyline([g, B.bayOut]), T: durFor(g.distanceTo(B.bayOut), VP.side) }, { path: polyline([B.bayOut, B.bayIn]), T: durFor(B.bayOut.distanceTo(B.bayIn), VP.enter) }];
    s.enterStep = 0; s.enterT = 0; }
  s.enterT += dt;
  while(s.enterStep < 2 && s.enterT >= s.enterPlan[s.enterStep].T){ s.enterT -= s.enterPlan[s.enterStep].T; s.enterStep++; }
  const qPark = B.parkQ ? shipRig.quaternion.clone().multiply(B.parkQ) : shipRig.quaternion;
  if(s.enterStep >= 2){ s.group.position.copy(shipPoint(B.bayIn)); s.group.quaternion.copy(qPark); return true; }
  const P = s.enterPlan[s.enterStep], k = s.enterT/P.T;
  s.group.position.copy(shipPoint(P.path.at(smoother(k)*P.path.L)));
  s.group.quaternion.slerp(qPark, 1 - Math.exp(-dt*(s.enterStep ? 4 : 1.5)));
  if(s.craft && s.craft.thr) s.craft.thr.value = s.enterStep ? .05 + .1*(1 - k) : .1 + .3*Math.sin(Math.PI*k);
  if(s.trailHistory) s.trailHistory.length = 0;
  return false;
}
function hasBay(){ return !!bayInfo(); }
return { ISO, DOCK_SCALE, buildIsoContainer, buildCargoShuttle, armPoints, shipPoint, isContainerShip, startBay, updateBay, updateEnter, returnPose, departPose, restoreStack, hasBay, deliverDirect, VP };
})();
