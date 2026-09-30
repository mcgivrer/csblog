/* =========================================================================
   PORTS ORBITAUX — lot P1 : génération et rendu (spec-ports-orbitaux-navette.md, Partie B)
   Décisions : archétypes + modules tirés par graine ; tous les vaisseaux accostent → chaque port offre au moins
   un poste L (vaisseau ≤ 240 m) ; les stations du commerce local (L3) sont absorbées (mêmes planètes, angles, noms).
   - A « anneau » (280–380 m) : anneau habité tournant, moyeu, rayons, un ponton L (+ parfois un ponton S/M) ;
   - B « moyeu à pontons » (≈ 500–700 m) : noyau vertical, 3 à 5 pontons horizontaux (L, M, S), radiateurs, mât ;
   - C « tour d'amarrage » (700–1 000 m) : épine, anneaux d'amarrage étagés, ponton L le long de l'épine —
     réservée aux géantes gazeuses (orbite haute, au-delà des anneaux).
   Tailles ABSOLUES (échelle réelle). Port stabilisé par gradient de gravité : son axe +Y pointe à l'opposé de la
   planète ; seul l'anneau habité tourne, les postes restent fixes (amarrage, lot P2).
   Chaque port décrit ses POSTES : { cls: 'S'|'M'|'L', max (m), pos, dir (axe du ponton), side (côté du navire) }.
   Rendu : géométrie fusionnée par matériau (plaques projetées à taille réelle) + feux de balisage instanciés,
   ≈ 10 appels de dessin par port.
   ========================================================================= */
const PORTS = (function(){
const V3 = THREE.Vector3;
const CLASS_MAX = { S: 100, M: 180, L: 240 };
const PONTOON_LEN = { S: 140, M: 220, L: 300 };

/* ---------- textures de plaques (générées une fois) ---------- */
let MATS = null;
function plateTex(base, seam, dirt){
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  let s = 7; const r = () => { s = (s*16807) % 2147483647; return s/2147483647; };
  for(let y = 0; y < 256; y += 32) for(let x = 0; x < 256; x += (r() < .5 ? 64 : 32)){
    const k = .9 + .18*r(); g.fillStyle = 'rgba(' + [255, 255, 255].map(v => Math.round(v*(k - .9)*2)).join(',') + ',.35)'; g.fillRect(x + 1, y + 1, 30 + (r() < .3 ? 32 : 0), 30); }
  g.strokeStyle = seam; g.lineWidth = 1.2; for(let i = 0; i <= 256; i += 32){ g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  for(let i = 0; i < 40; i++){ g.fillStyle = dirt + (.04 + .08*r()) + ')'; g.fillRect(r()*256, r()*256, 4 + 30*r(), 2 + 20*r()); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if(THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding; return t;
}
function mats(){
  if(MATS) return MATS;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  MATS = {
    /* éclairage propre des coques (projecteurs de la station) : faible, mais la structure reste lisible côté nuit */
    hull:   (() => { const t = plateTex('#c9ced6', 'rgba(60,66,78,.55)', 'rgba(60,50,40,'); return std({ map: t, emissiveMap: t, emissive: 0x2a3140, emissiveIntensity: .55, metalness: .45, roughness: .55 }); })(),
    dark:   (() => { const t = plateTex('#4a505c', 'rgba(20,22,28,.7)', 'rgba(10,10,10,'); return std({ map: t, emissiveMap: t, emissive: 0x1a1f2a, emissiveIntensity: .45, metalness: .6, roughness: .5 }); })(),
    accent: std({ color: 0xd9822b, metalness: .3, roughness: .6 }),
    rad:    std({ map: plateTex('#232a36', 'rgba(90,110,140,.5)', 'rgba(0,0,0,'), metalness: .2, roughness: .8, emissive: 0x05080f }),
    win:    std({ color: 0x2a2010, emissive: 0xffd28a, emissiveIntensity: 1.2, roughness: .4 }),
    lampL:  std({ color: 0x221400, emissive: 0xffb454, emissiveIntensity: 1.6 }),
    lampM:  std({ color: 0x021110, emissive: 0x5eead4, emissiveIntensity: 1.6 }),
    lampS:  std({ color: 0x111111, emissive: 0xe8edf5, emissiveIntensity: 1.4 })
  };
  return MATS;
}
/* coordonnées de texture projetées selon la normale : une plaque = TILE mètres quelle que soit la pièce */
const TILE = 9;
function plated(geo){
  const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count*2);
  for(let i = 0; i < p.count; i++){
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v; if(ax >= ay && ax >= az){ u = p.getZ(i); v = p.getY(i); } else if(ay >= az){ u = p.getX(i); v = p.getZ(i); } else { u = p.getX(i); v = p.getY(i); }
    uv[i*2] = u/TILE; uv[i*2 + 1] = v/TILE;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}
/* fusion par matériau (repris de smallcraft.js de la démo, avec coordonnées de texture) */
function merge(G){
  const groups = new Map();
  G.children.slice().forEach(m => { if(!m.isMesh || m.userData.keep) return; const k = m.material; if(!groups.has(k)) groups.set(k, []); groups.get(k).push(m); });
  groups.forEach((list, mat) => {
    const pos = [], nor = [], uvs = [];
    list.forEach(m => { m.updateMatrix(); const g = plated(m.geometry.clone()); g.applyMatrix4(m.matrix); const g2 = plated(g);
      pos.push(g2.attributes.position.array); nor.push(g2.attributes.normal.array); uvs.push(g2.attributes.uv.array); G.remove(m); m.geometry.dispose(); });
    const cat = (arrs) => { const n = arrs.reduce((a, p) => a + p.length, 0), out = new Float32Array(n); let o = 0; arrs.forEach(p => { out.set(p, o); o += p.length; }); return out; };
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(cat(pos), 3)); g.setAttribute('normal', new THREE.BufferAttribute(cat(nor), 3)); g.setAttribute('uv', new THREE.BufferAttribute(cat(uvs), 2));
    g.computeBoundingSphere(); G.add(new THREE.Mesh(g, mat));
  });
}
const box = (G, w, h, d, m, x, y, z, ry) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); if(ry) o.rotation.y = ry; G.add(o); return o; };
const cyl = (G, r, h, m, x, y, z, seg) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg || 28), m); o.position.set(x, y, z); G.add(o); return o; };
const torus = (G, R, t, m, x, y, z, rx) => { const o = new THREE.Mesh(new THREE.TorusGeometry(R, t, 12, 64), m); o.position.set(x, y, z); o.rotation.x = rx === undefined ? Math.PI/2 : rx; G.add(o); return o; };

/* ---------- pontons et postes ---------- */
/* ponton horizontal partant de `root` (repère du port) selon l'angle a (autour de +Y), à la hauteur y */
function pontoon(G, lamps, berths, cls, a, rootR, y, side2){
  const M = mats(), len = PONTOON_LEN[cls], dir = new V3(Math.sin(a), 0, Math.cos(a)), nrm = new V3(Math.cos(a), 0, -Math.sin(a));
  const c = dir.clone().multiplyScalar(rootR + len/2);
  box(G, 12, 7, len, M.dark, c.x, y, c.z, a);                                 /* poutre du ponton */
  box(G, 14, 1.2, len, M.hull, c.x, y + 4, c.z, a);                           /* tablier */
  for(let k = 20; k < len; k += 40){ const p = dir.clone().multiplyScalar(rootR + k); box(G, 16, 2, 3, M.accent, p.x, y + 5, p.z, a); }   /* bittes et pinces */
  /* feux de balisage des deux bords, couleur de la classe */
  const lamp = cls === 'L' ? lamps.L : cls === 'M' ? lamps.M : lamps.S;
  for(let k = 8; k < len; k += 18) [-1, 1].forEach(sg => lamp.push(dir.clone().multiplyScalar(rootR + k).addScaledVector(nrm, sg*7.5).setY(y + 5.5)));
  /* postes : côté +nrm de la classe du ponton ; côté −nrm une classe en dessous (si demandé) */
  const berthAt = (bcls, sg) => { const mid = dir.clone().multiplyScalar(rootR + len*.52);
    berths.push({ cls: bcls, max: CLASS_MAX[bcls], pos: mid.clone().addScaledVector(nrm, sg*(8 + 12)).setY(y), dir: dir.clone(), side: nrm.clone().multiplyScalar(sg) }); };
  berthAt(cls, 1);
  if(side2) berthAt(side2, -1);
}
function radiators(G, n, r, y0, h, rnd){
  const M = mats();
  for(let i = 0; i < n; i++){ const a = (i + .5)/n*Math.PI*2 + rnd()*.2; box(G, 2, h, 40 + 30*rnd(), M.rad, Math.sin(a)*(r + 22), y0, Math.cos(a)*(r + 22), a + Math.PI/2); }
}
function lampMeshes(G, lamps){
  const M = mats(), geo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
  [['L', M.lampL], ['M', M.lampM], ['S', M.lampS]].forEach(([k, m]) => { const list = lamps[k]; if(!list.length) return;
    const im = new THREE.InstancedMesh(geo, m, list.length), mx = new THREE.Matrix4();
    list.forEach((p, i) => { mx.makeTranslation(p.x, p.y, p.z); im.setMatrixAt(i, mx); }); im.userData.keep = true; G.add(im); });
}
function beacon(G, y){
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: typeof glowTex !== 'undefined' ? glowTex : null, color: 0xffb454, transparent: true, opacity: .95, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(40); s.position.set(0, y, 0); s.userData.keep = true; G.add(s); return s;
}

/* ---------- archétypes ---------- */
function buildRing(rnd){
  const G = new THREE.Group(), spin = new THREE.Group(), M = mats(), lamps = { L: [], M: [], S: [] }, berths = [];
  const R = 140 + 50*rnd(), t = 12 + 4*rnd(), hubR = 26 + 8*rnd(), hubH = 60 + 30*rnd(), nSp = 3 + Math.floor(rnd()*4);
  torus(spin, R, t, M.hull, 0, 0, 0); torus(spin, R + t*.98, 1.2, M.win, 0, 0, 0);
  for(let i = 0; i < 16; i++){ const a = i/16*Math.PI*2; lamps.S.push(new V3(Math.sin(a)*(R + t + 1.5), 0, Math.cos(a)*(R + t + 1.5))); }   /* feux de gabarit de l'anneau (fixes) */
  for(let i = 0; i < nSp; i++){ const a = i/nSp*Math.PI*2; box(spin, 5, 5, R - hubR, M.dark, Math.sin(a)*(hubR + (R - hubR)/2), 0, Math.cos(a)*(hubR + (R - hubR)/2), a); }
  cyl(G, hubR, hubH, M.hull, 0, 0, 0); cyl(G, hubR*1.15, 8, M.accent, 0, hubH/2 - 6, 0); cyl(G, hubR*.5, 40, M.dark, 0, hubH/2 + 20, 0);
  radiators(G, 2, hubR, -hubH/2 + 10, 18, rnd);
  const a0 = rnd()*Math.PI*2;
  pontoon(G, lamps, berths, 'L', a0, hubR, -hubH/2 - 8, rnd() < .5 ? 'M' : 'S');
  if(rnd() < .6) pontoon(G, lamps, berths, rnd() < .5 ? 'M' : 'S', a0 + Math.PI, hubR, -hubH/2 - 8, 'S');
  merge(spin); merge(G); lampMeshes(G, lamps); G.add(spin);
  const bc = beacon(G, hubH/2 + 44);
  return { group: G, spin: spin, berths: berths, beacon: bc };
}
function buildHub(rnd){
  const G = new THREE.Group(), spin = new THREE.Group(), M = mats(), lamps = { L: [], M: [], S: [] }, berths = [];
  const r = 40 + 10*rnd(), h = 220 + 40*rnd();
  cyl(G, r, h, M.hull, 0, 0, 0);
  for(let y = -h/2 + 20; y < h/2 - 10; y += 34) cyl(G, r*1.06, 5, M.dark, 0, y, 0);
  cyl(G, r*1.3, 26, M.dark, 0, h/2 - 13, 0); cyl(G, r*1.3, 26, M.dark, 0, -h/2 + 13, 0);
  for(let y = -h/2 + 40; y < h/2 - 30; y += 34) for(let i = 0; i < 10; i++){ const a = i/10*Math.PI*2; box(G, 6, 2.2, 1, M.win, Math.sin(a)*r*1.005, y, Math.cos(a)*r*1.005, a); }
  cyl(G, 4, 80, M.dark, 0, h/2 + 40, 0); radiators(G, 3, r, 20, 60, rnd);
  for(let i = 0; i < 12; i++){ const a = i/12*Math.PI*2; [h/2 + 1, -h/2 - 1].forEach(y => lamps.S.push(new V3(Math.sin(a)*r*1.3, y, Math.cos(a)*r*1.3))); }
  if(rnd() < .5){ torus(spin, r + 60, 8, M.hull, 0, h/2 - 40, 0); for(let i = 0; i < 4; i++){ const a = i/4*Math.PI*2; box(spin, 4, 4, 60, M.dark, Math.sin(a)*(r + 30), h/2 - 40, Math.cos(a)*(r + 30), a); } }
  const n = 3 + Math.floor(rnd()*3), a0 = rnd()*Math.PI*2, cls = ['L', 'M', 'S', rnd() < .5 ? 'M' : 'S', 'S'];
  for(let i = 0; i < n; i++) pontoon(G, lamps, berths, cls[i], a0 + i/n*Math.PI*2, r, -h/2 + 40 + (i % 2)*30, cls[i] === 'L' ? 'M' : cls[i] === 'M' ? 'S' : null);
  merge(spin); merge(G); lampMeshes(G, lamps); G.add(spin);
  const bc = beacon(G, h/2 + 86);
  return { group: G, spin: spin, berths: berths, beacon: bc };
}
function buildTower(rnd){
  const G = new THREE.Group(), spin = new THREE.Group(), M = mats(), lamps = { L: [], M: [], S: [] }, berths = [];
  const L = 700 + 300*rnd(), n = 4 + Math.floor(rnd()*4), step = L/(n + 1);
  box(G, 24, L, 24, M.dark, 0, 0, 0);                                           /* épine verticale (axe +Y, loin de la planète) */
  for(let i = 1; i <= n; i++){ const y = -L/2 + i*step; torus(G, 46, 6, M.hull, 0, y, 0); cyl(G, 18, 16, M.hull, 0, y, 0);
    if(i % 2) box(G, 130, 2, 34, M.rad, 0, y + 12, 0); }
  cyl(G, 30, 40, M.accent, 0, L/2 - 20, 0); cyl(G, 3, 120, M.dark, 0, L/2 + 60, 0);
  for(let y = -L/2 + 20; y < L/2; y += 40) [[13, 0], [-13, 0], [0, 13], [0, -13]].forEach(([x, z]) => lamps.L.push(new V3(x, y, z)));   /* feux de l'épine */
  for(let i = 1; i <= n; i++){ const y = -L/2 + i*step; torus(G, 46 + 5.9, .8, M.win, 0, y, 0); }   /* hublots des anneaux */
  torus(spin, 90, 10, M.hull, 0, L/2 - 90, 0); torus(spin, 90 + 9.8, 1, M.win, 0, L/2 - 90, 0);
  /* ponton L au pied de la tour, ponton M plus haut */
  pontoon(G, lamps, berths, 'L', rnd()*Math.PI*2, 20, -L/2 + step*.5, 'M');
  pontoon(G, lamps, berths, 'M', rnd()*Math.PI*2, 20, -L/2 + step*2.5, 'S');
  merge(spin); merge(G); lampMeshes(G, lamps); G.add(spin);
  const bc = beacon(G, L/2 + 130);
  return { group: G, spin: spin, berths: berths, beacon: bc };
}
const BUILD = { ring: buildRing, hub: buildHub, tower: buildTower };
function build(archetype, seedStr){
  const rnd = rngFor(SEED + ':port:' + seedStr), P = BUILD[archetype](rnd);
  P.group.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(P.group), size = b.getSize(new V3());
  P.radius = .5*size.length(); P.size = size; P.archetype = archetype; P.spinRate = .02 + .02*rnd();
  if(!P.berths.some(x => x.cls === 'L')) throw new Error('port sans poste L');   /* garde-fou : tous les vaisseaux accostent */
  return P;
}
/* archétype selon la planète : géante gazeuse → tour ; sinon anneau ou moyeu (graine) */
function archetypeFor(planet, u){ return planet.kind && planet.kind.gas ? 'tower' : (u < .45 ? 'ring' : 'hub'); }
/* altitude (spec §B.4) : tellurique 1,15–1,4 R ; géante 2,5–3 R (au-delà des anneaux) */
function orbitRadius(planet, u){ return planet.radius*(planet.kind && planet.kind.gas ? 2.5 + .5*u : 1.15 + .25*u); }
/* orientation : +Y du port à l'opposé de la planète (stabilisation par gradient de gravité) */
function orient(group, pos, planetPos){ const up = pos.clone().sub(planetPos).normalize(); group.quaternion.setFromUnitVectors(new V3(0, 1, 0), up); }
return { build, archetypeFor, orbitRadius, orient, CLASS_MAX, PONTOON_LEN, mats };
})();
