/* =====================================================================
   PORTE-VAISSEAUX (lot 10, v7.6) — window.__CRAFT : types 'carrier' (civil) et 'carrierMil' (militaire)
   Transporteur de vaisseaux sans moyen supraluminique (cargos, remorqueurs : jusqu'à 120 × 63 × 38 m).
   Silhouette « catamaran » : une coque dorsale et une coque ventrale réunies à la proue et à la poupe ; le dock
   (≈ 290 × 96 × 55 m) traverse le vaisseau de bord à bord — on voit les étoiles à travers — et contient deux postes
   en ligne, séparés par un pylône en treillis. Deux champs de force ferment les ouvertures en transit.
   Dock en vraie géométrie : pont à berceaux et pinces, plafond lumineux, rails et portique roulant, passerelles,
   deux salles de contrôle vitrées (intérieurs simulés), numéros de poste peints, feux d'approche chenillards.
   Arrière : deux anneaux de distorsion (même structure que warpring.js), radiateurs, quatre tuyères.
   L'ombre de la soute et la lumière du plafond sont calculées par le shader d'usure (shipwear.js, W.HOLD).
   Unités : mètres ; nez vers −Z, dos vers +Y, ouvertures du dock vers ±X.
   ===================================================================== */
(function(){
'use strict';
if(!window.__CRAFT || !__CRAFT.H) return;
const CR = __CRAFT, H = CR.H, V3 = THREE.Vector3;
const W = 96, HD = 55, TH = 22.5, ZA = -196, ZB = 94, ZC = (ZA + ZB)/2, YF = -HD/2, YC = HD/2;   // largeur, hauteur du dock, épaisseur des coques, dock en z
const BERTHS = [(ZA + ZC - 5)/2, (ZC + 5 + ZB)/2];                        // centres des deux postes (140 m chacun)
const DECK = YF + 4.6;                                                   // dessus des berceaux (quille du vaisseau garé)
const CIVIL = [0xc9cdd2, 0xb7bdc4, 0xd8d3c6], MILP = [0x4a5058, 0x2f3b4d, 0x3a4034];

/* numéros de poste : un atlas « 01 | 02 » (texture sur plan, UV propres — pas de fusion) */
function berthNumbers(G){
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  g.font = 'bold 200px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 14; g.strokeStyle = '#15171b'; g.fillStyle = '#e8a91c';
  ['01', '02'].forEach((t, i) => { g.strokeText(t, 128 + 256*i, 136); g.fillText(t, 128 + 256*i, 136); });
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: .5, metalness: .1, roughness: .8, color: 0xffffff }); m.userData.wearKind = 4; m.userData.ownMap = true;
  const pos = [], uv = [], nor = [];
  const quad = (cx, cz, sx, u0) => {                                      // plan couché (y = sol), lisible depuis l'ouverture de côté sx
    const hw = 13, hh = 6.5, y = YF + .06, P = [[-hh, -hw], [hh, -hw], [hh, hw], [-hh, hw]].map(([a, b]) => [cx + a*sx, y, cz - b*sx]);
    const U = [[u0, 0], [u0, 1], [u0 + .5, 1], [u0 + .5, 0]];
    [[0, 1, 2], [0, 2, 3]].forEach(t => t.forEach(k => { pos.push(...P[k]); uv.push(...U[k]); nor.push(0, 1, 0); }));
  };
  BERTHS.forEach((z, i) => { quad(34, z, 1, i*.5); quad(-34, z, -1, i*.5); });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  const mesh = new THREE.Mesh(geo, m); mesh.userData.keep = true; mesh.renderOrder = H.ORDER; G.add(mesh);
}
/* immatriculation : grandes lettres sur les flancs de la proue et du bloc arrière (une texture, 4 plans, 1 appel de dessin) */
function hullText(G, text, color){
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d');
  g.font = 'bold 190px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(text, 512, 138);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: .45, metalness: .2, roughness: .7 }); m.userData.wearKind = 4; m.userData.ownMap = true;
  const pos = [], uv = [], nor = [];
  const quad = (sx, cz, cy, len, ht) => { const x = sx*(W/2 + .3), P = [[x, cy - ht/2, cz + sx*len/2], [x, cy - ht/2, cz - sx*len/2], [x, cy + ht/2, cz - sx*len/2], [x, cy + ht/2, cz + sx*len/2]];
    const U = [[0, 0], [1, 0], [1, 1], [0, 1]]; [[0, 1, 2], [0, 2, 3]].forEach(t => t.forEach(k => { pos.push(...P[k]); uv.push(...U[k]); nor.push(sx, 0, 0); })); };
  [-1, 1].forEach(sx => { quad(sx, -214, 12, 56, 14); quad(sx, ZB + 75, 30, 72, 18); });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  const mesh = new THREE.Mesh(geo, m); mesh.userData.keep = true; mesh.renderOrder = H.ORDER; G.add(mesh);
}
/* feux d'approche : un seul nuage de points, impulsions qui courent vers l'arrière le long des lèvres du dock */
function chaseLights(G, color){
  const pos = [], ph = [];
  [-1, 1].forEach(sx => [-1, 1].forEach(sy => { for(let z = ZA + 4; z <= ZB - 4; z += 7){ pos.push(sx*(W/2 + .6), sy*(YC + 1.2), z); ph.push(z - ZA); } }));
  [-1, 1].forEach(sx => { for(let y = YF + 3; y <= YC - 3; y += 5){ pos.push(sx*(W/2 + .6), y, ZC); ph.push(1e3 + y); } });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aU', new THREE.Float32BufferAttribute(ph, 1));
  const U = { uTime: CR.TIME, uCol: { value: new THREE.Color(color) }, uOn: { value: 1 } };
  const m = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute float aU; uniform float uTime; varying float vI; void main(){ vec4 mv = modelViewMatrix*vec4(position, 1.0); float p = aU > 999.0 ? 0.5 + 0.5*sin(uTime*2.2) : pow(fract(aU/70.0 - uTime*0.35), 10.0); vI = 0.3 + 2.4*p; gl_PointSize = clamp(2600.0/max(-mv.z, 1.0), 1.5, 14.0)*(0.8 + 0.4*p); gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'precision highp float; uniform vec3 uCol; uniform float uOn; varying float vI; void main(){ vec2 d = gl_PointCoord - 0.5; float a = exp(-dot(d, d)*18.0); gl_FragColor = vec4(uCol*vI*a*uOn, 1.0); }' });
  const pts = new THREE.Points(g, m); pts.userData.keep = true; pts.userData.noFrame = true; pts.renderOrder = H.ORDER + 2; pts.frustumCulled = false; G.add(pts);
  return U;
}
/* champs de force sur les deux ouvertures : voile bleu translucide, trame hexagonale, bords vifs, ondes */
function fieldCurtains(G){
  const U = { uField: { value: .8 }, uTime: CR.TIME, uRip: { value: new THREE.Vector4(0, 0, 0, -99) } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vQ; varying vec3 vN; varying vec3 vV; void main(){ vQ = position.xy; vec4 mv = modelViewMatrix*vec4(position, 1.0); vN = normalize(normalMatrix*vec3(0.0, 0.0, 1.0)); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: `precision highp float; uniform float uField; uniform float uTime; uniform vec4 uRip; varying vec2 vQ; varying vec3 vN; varying vec3 vV;
void main(){
  vec2 q = vQ/5.0; q.x *= 0.8660254; float odd = step(1.0, mod(floor(q.x), 2.0)); vec2 c = vec2(fract(q.x), fract(q.y + 0.5*odd)) - 0.5;
  float cell = smoothstep(0.40, 0.49, max(abs(c.x)*1.1547 + abs(c.y)*0.5, abs(c.y)));      /* trame hexagonale */
  vec2 h = vec2(${(145).toFixed(1)}, ${(HD/2).toFixed(1)}) - abs(vQ); float e = exp(-min(h.x, h.y)/3.0);    /* bords */
  float wave = 0.5 + 0.5*sin(vQ.x*0.045 - uTime*1.1 + 0.8*sin(vQ.y*0.07 + uTime*0.6));
  float rd = length(vQ - uRip.xy), ra = uTime - uRip.w, rip = uRip.z*exp(-ra*1.2)*exp(-pow((rd - ra*40.0)/6.0, 2.0));
  float view = 1.0 - abs(dot(vN, vV));
  float k = uField*((0.035 + 0.10*cell*wave)*(0.45 + 0.9*view) + 0.55*e) + rip;
  gl_FragColor = vec4(vec3(0.28, 0.55, 1.0)*k, 1.0);
}` });
  U.sides = {};
  [-1, 1].forEach(sx => { const mt = mat.clone(); mt.uniforms = { uField: sx > 0 ? U.uField : { value: U.uField.value }, uTime: CR.TIME, uRip: sx > 0 ? U.uRip : { value: new THREE.Vector4(0, 0, 0, -99) } };   // v7.10 : un champ par bord
    U.sides[sx] = { uField: mt.uniforms.uField, uRip: mt.uniforms.uRip, zSign: -sx };                       // coordonnée du plan : x = zSign·(z − ZC)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(ZB - ZA, HD, 1, 1), mt); m.rotation.y = sx*Math.PI/2; m.position.set(sx*(W/2 + .35), 0, ZC);
    m.userData.keep = true; m.userData.noFrame = true; m.renderOrder = H.ORDER + 3; G.add(m); });
  return U;
}
/* cœur de saut quantique (v7.6.1) : la raison d'être du porteur. Même géode que les vaisseaux du jeu (cadre blanc, noyau violet,
   halo), sur un mât au-dessus du bloc arrière, entre les anneaux. Shaders repris d'un vaisseau du jeu (une fois, en cache) et mêmes
   uniformes (SHIPGEN.JUMP_U) : la démo les remplace par la charge du porteur et reconnaît la géode (battements, rotation, saut). */
function geodeTpl(){
  if(CR._geodeTpl !== undefined) return CR._geodeTpl;
  let t = null;
  try { const b = SHIPGEN.build('e140', { warp: false, jump: true, wear: false, ringFx: false, realGlass: false }); let core = null, halo = null, wire = null;
    b.group.traverse(o => { const m = o.material; if(o.isMesh && m && m.isShaderMaterial && m.uniforms && m.uniforms.uCharge === SHIPGEN.JUMP_U.uCharge){ if(m.transparent) halo = m; else core = m; } if(o.isLineSegments && o.geometry.type === 'EdgesGeometry') wire = o.material; });
    if(core && halo) t = { v: core.vertexShader, f: core.fragmentShader, hv: halo.vertexShader, hf: halo.fragmentShader, wire: wire ? wire.color.getHex() : 0xb8c2cc };
    // v7.6.2 : jet de torche de fusion (dernière version des moteurs, shipdrive.js) — groupe jet + éclat, gardé hors du vaisseau modèle
    let jet = null; b.group.traverse(o => { const m = o.material; if(!jet && o.isMesh && m && m.isShaderMaterial && m.uniforms && m.uniforms.uLength && m.uniforms.uRadius) jet = o; });
    if(t && jet && jet.parent){ const pg = jet.parent; pg.parent && pg.parent.remove(pg); pg.position.set(0, 0, 0); t.plume = pg; t.plumeR = jet.material.uniforms.uRadius.value/3.4; t.plumeL = jet.material.uniforms.uLength.value/1.6; }
    SHIPGEN.dispose ? SHIPGEN.dispose(b.group) : null; } catch(e){ console.error(e); }
  return (CR._geodeTpl = t);
}
function jumpCore(G, M, x, y, z, o){
  const t = geodeTpl(); if(!t) return null;
  const U = SHIPGEN.JUMP_U, s = y + 2.7 + 1.25*o;                                   // centre de la géode (proportions du jeu)
  H.rod(G, new V3(x, y, z), new V3(x, s - 1.05*o, z), .14*o*1.6, M.dark);
  H.cyl(G, .55*o, .7*o, 1.5*o*.4, 12, M.mid, x, y + .3*o, z); H.box(G, 1.6*o, .35*o, 1.6*o, M.hazard, x, y + .12*o, z);
  const wire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.25*o, 1)), new THREE.LineBasicMaterial({ color: t.wire }));
  wire.position.set(x, s, z); wire.userData.keep = true; G.add(wire);
  const core = new THREE.Mesh(new THREE.SphereGeometry(.8*o, 24, 16), new THREE.ShaderMaterial({ uniforms: U, vertexShader: t.v, fragmentShader: t.f }));
  core.position.set(x, s, z); core.userData.keep = true; G.add(core);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.7*o, 24, 16), new THREE.ShaderMaterial({ uniforms: U, vertexShader: t.hv, fragmentShader: t.hf, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.position.set(x, s, z); halo.userData.keep = true; halo.userData.noFrame = true; halo.renderOrder = 12; G.add(halo);
  return new V3(x, s, z);
}
/* moteurs principaux (v7.6.2) : même ensemble que les vaisseaux du jeu (shipdrive.js, v6.3 → v6.9) — cloche de profil Rao,
   col incandescent, tubes de refroidissement, bobines magnétiques, vérins de cardan, jet de torche de fusion qui suit le cardan.
   Les cloches sont posées dans un groupe à part, avec leur jet (copie du jet du jeu, uniformes partagés : la démo les remplace
   par la poussée du porteur), puis __SHIPDRIVE.apply les remplace par les ensembles moteur. */
function mainDrives(G, M, list){
  const t = geodeTpl(), eng = new THREE.Group(); G.add(eng);
  const DU = SHIPGEN.DRIVE_U;
  list.forEach(([x, y, z, r, len, pk], i) => {
    H.bell(eng, r*.55, r, len, M.noz, x, y, z);
    if(!(t && t.plume)) return;
    const pg = t.plume.clone(true); pg.position.set(x, y, z + len); eng.add(pg);
    const k = r/t.plumeR;
    pg.traverse(o => { if(!o.isMesh || !o.material || !o.material.isShaderMaterial) return; const m0 = o.material, u = {};
      Object.keys(m0.uniforms).forEach(key => { u[key] = DU[key] && m0.uniforms[key] === DU[key] ? DU[key] : { value: (m0.uniforms[key].value && m0.uniforms[key].value.clone) ? m0.uniforms[key].value.clone() : m0.uniforms[key].value }; });
      if(u.uSeed) u.uSeed.value = 1.7 + i*2.3;
      if(u.uLength){ u.uLength.value = t.plumeL*k/1.6*(pk || 1.15); u.uRadius.value = 3.4*r; }        // ÷1,6 : __SHIPDRIVE.apply rallonge le jet
      if(u.uSize) u.uSize.value *= k;
      const m = m0.clone(); m.uniforms = u; o.material = m; });
  });
  const dr = window.__SHIPDRIVE ? __SHIPDRIVE.apply(eng) : null;
  if(dr && list.length === 1 && list[0][3] > 20){                                                     // v7.8 : grande tuyère — raidisseurs extérieurs et frettes lourdes (repère du cardan)
    const u = dr.units[0], [, , , r, len] = list[0], rAt = f => r*(.36 + .64*Math.pow(f, .8)) + r*.06;
    for(let k = 0; k < 16; k++){ const a = k*Math.PI/8, A = new V3(Math.cos(a)*rAt(.25), Math.sin(a)*rAt(.25), len*.25), B = new V3(Math.cos(a)*rAt(.97), Math.sin(a)*rAt(.97), len*.97);
      H.rod(u.G, A, B, .55, M.dark); }
    [.4, .62, .84].forEach(f => H.part(u.G, new THREE.TorusGeometry(rAt(f) + .5, 1.1, 8, 64), M.mid, 0, 0, len*f));
    H.merge(u.G); }
  return dr;
}
/* section de propulsion « hard SF » (v7.8, lot 12 — design original, esprit industriel) : derrière le bloc moteur,
   bouclier anti-radiations en disque nervuré, cuve du réacteur et pile de bobines magnétiques, treillis de poussée (4 longerons,
   croisillons, anneau de montage), 4 réservoirs d'ergols et leurs conduites, deux ailes de radiateurs à caloducs rougeoyants,
   et une torche de fusion unique (ensemble moteur du jeu à grande échelle : cloche Rao, col incandescent, vérins de cardan). */
function torchSection(G, M, z0){
  const copper = M.std(0x8a5a36, { metalness: .85, roughness: .36 }), Zs = z0 + 6;
  H.cyl(G, 46, 46, 4, 48, M.dark, 0, 0, Zs, Math.PI/2);                                              // bouclier
  H.part(G, new THREE.TorusGeometry(46, 1.7, 8, 72), M.hazard, 0, 0, Zs);
  for(let k = 0; k < 12; k++){ const a = k*Math.PI/6; H.box(G, 1.6, 40, 3.2, M.mid, Math.cos(a)*23, Math.sin(a)*23, Zs - 3.2, 0, 0, a - Math.PI/2); }
  H.cyl(G, 17, 21, 34, 32, M.mid, 0, 0, Zs + 20, Math.PI/2);                                      // cuve du réacteur
  for(let i = 0; i < 6; i++){ H.part(G, new THREE.TorusGeometry(24, 2.6, 10, 56), copper, 0, 0, Zs + 6 + i*5.4); H.part(G, new THREE.TorusGeometry(22, 1.0, 6, 48), M.dark, 0, 0, Zs + 8.7 + i*5.4); }
  const Zm = Zs + 70, Rm = 36, V = THREE.Vector3;                                                   // treillis de poussée
  H.part(G, new THREE.TorusGeometry(Rm, 2.2, 10, 64), M.mid, 0, 0, Zm);
  const A = k => new V(Math.cos(k*Math.PI/2)*43, Math.sin(k*Math.PI/2)*43, Zs + 2), B = k => new V(Math.cos(k*Math.PI/2)*Rm, Math.sin(k*Math.PI/2)*Rm, Zm);
  for(let k = 0; k < 4; k++){ H.rod(G, A(k), B(k), 2.2, M.mid); H.rod(G, A(k), B(k + 1), .9, M.dark); H.rod(G, B(k), A(k + 1), .9, M.dark); }
  for(let k = 0; k < 4; k++){ const a = Math.PI/4 + k*Math.PI/2, x = Math.cos(a)*40, y = Math.sin(a)*40;   // réservoirs d'ergols
    H.cyl(G, 9, 9, 26, 20, M.paint, x, y, Zs + 22, Math.PI/2); H.part(G, new THREE.SphereGeometry(9, 16, 10), M.paint, x, y, Zs + 9); H.part(G, new THREE.SphereGeometry(9, 16, 10), M.paint, x, y, Zs + 35);
    H.cyl(G, 9.3, 9.3, 2.2, 20, M.hazard, x, y, Zs + 22, Math.PI/2); H.rod(G, new V(x, y, Zs + 1), new V(x, y, Zs + 7), 1.4, M.dark);
    H.rod(G, new V(x*.8, y*.8, Zs + 22), new V(Math.cos(a)*20, Math.sin(a)*20, Zs + 26), .9, copper); }
  for(let w = 0; w < 4; w++){                                                                       // radiateurs : 4 ailes en croix (silhouette lisible sous tous les angles)
    const a = w*Math.PI/2, grp = new THREE.Group(); grp.rotation.z = a; G.add(grp);
    H.box(grp, 68, 3, 3.4, M.mid, 74, 0, Zs + 30); H.box(grp, 3, 3, 104, M.mid, 110, 0, Zs + 42);
    for(let p = 0; p < 3; p++){ const xc = 56 + p*37;
      H.box(grp, 34, .9, 100, M.dark, xc, 0, Zs + 42); H.box(grp, 34.4, 1.4, 1.6, M.mid, xc, 0, Zs - 8); H.box(grp, 34.4, 1.4, 1.6, M.mid, xc, 0, Zs + 92);
      for(let c = 0; c < 9; c++) H.box(grp, 31, 1.3, .9, M.heat, xc, 0, Zs + 42 - 44 + c*11); }
    grp.updateMatrix(); grp.children.slice().forEach(m => { m.applyMatrix4(grp.matrix); G.add(m); }); G.remove(grp); }   // remis à plat : fusion par matériau
  for(let k = 0; k < 10; k++){ const a = (k + .5)*Math.PI/5, r = 30;                               // conduites et pompes le long du bloc moteur
    H.cyl(G, 1.5, 1.5, 44, 8, k % 2 ? copper : M.dark, Math.cos(a)*r, Math.sin(a)*r, z0 - 22, Math.PI/2);
    if(k % 2 === 0) H.box(G, 6, 6, 8, M.mid, Math.cos(a)*(r + 3), Math.sin(a)*(r + 3), z0 - 10, 0, 0, a); }
  return Zs;
}
/* anneau de distorsion : tore de structure + tore lumineux (reconnus par warpring.js : pivot, émetteurs, halo) */
function ring(G, M, z, Rin, U){
  const glow = new THREE.Mesh(new THREE.TorusGeometry(Rin, 1.6, 10, 180), new THREE.ShaderMaterial({ uniforms: U,
    vertexShader: 'varying float vA; void main(){ vA = atan(position.y, position.x)/6.2831853; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }',
    fragmentShader: 'precision highp float; uniform float uField; uniform float uPhase; varying float vA; void main(){ float p = pow(fract(vA*6.0 - uPhase), 10.0) + 0.5*pow(fract(vA*6.0 - uPhase + 0.5), 10.0); gl_FragColor = vec4(vec3(0.3, 0.6, 1.0)*(0.25 + 1.2*p)*(0.35 + 1.6*uField), 1.0); }' }));
  glow.position.set(0, 0, z); glow.userData.keep = true; glow.renderOrder = H.ORDER; G.add(glow);
  const outer = new THREE.Mesh(new THREE.TorusGeometry(Rin + 4, 3.5, 12, 180), M.mid); outer.position.set(0, 0, z); outer.userData.keep = true; G.add(outer);
  for(let k = 0; k < 4; k++){ const a = Math.PI/4 + k*Math.PI/2, ca = Math.cos(a), sa = Math.sin(a);     // bras et colliers fixes (l'anneau tourne dans ses paliers)
    H.rod(G, new V3(ca*58, sa*58, z), new V3(ca*(Rin - 2), sa*(Rin - 2), z), 2.4, M.dark);
    H.box(G, 6, 13, 12, M.mid, ca*(Rin + 4), sa*(Rin + 4), z, 0, 0, a); H.box(G, 6.4, 2, 12.4, M.hazard, ca*(Rin + 4), sa*(Rin + 4), z, 0, 0, a); }
}
function bigGreeble(G, M, R, n, x0, x1, y, dir, z0, z1){
  for(let i = 0; i < n; i++){ const a = 2 + 7*R(), b = 2 + 12*R(), hh = .6 + 2.4*R();
    H.box(G, a, hh, b, R() < .55 ? M.dark : M.mid, x0 + (x1 - x0)*R(), y + dir*hh/2, z0 + (z1 - z0)*R()); }
}

function buildCarrier(G, M, o, R, mil){
  M.heat.userData.radiator = true;                                                                 // v7.8 : lueur des radiateurs selon la poussée (démo)
  if(!mil){ M.accent.emissive.setHex(0x2f86ff).convertSRGBToLinear(); }
  const wins = [], fam = mil ? 'slit' : 'hexH';
  // ---- proue : effilée, puis collier à la section du dock ; passerelle sur le dessus
  H.prism(G, 30, 26, 84, 86, 84, .22, M.paint, 0, -2, -278, -6, 0);
  H.prism(G, W, 100, W, 100, ZA + 236, .08, M.paint, 0, 0, (ZA - 236)/2);
  H.prism(G, 40, 12, 46, 14, 34, .25, M.paint, 0, 56, -222);
  H.box(G, 50, 1.2, 4, M.hazard, 0, 50.7, -205);
  H.cyl(G, .8, 1.1, 16, 8, M.dark, 0, 71, -214); const dish = new THREE.SphereGeometry(5, 18, 6, 0, Math.PI*2, 0, .6); dish.rotateX(-Math.PI/2); H.part(G, dish, M.mid, 0, 78, -212);
  wins.push({ kind: 'bridge', C: new V3(0, 58.5, -239.1), T: new V3(-1, 0, 0), N: new V3(0, 0, -1), w: 22, h: 3.2, D: 7, floor: 1.2 });
  // ---- coques dorsale et ventrale (les « mâchoires » du catamaran), dessus et dessous chargés de détails
  [1, -1].forEach(sy => {
    const yc = sy*(YC + TH/2);
    H.prism(G, W, TH, W, TH, ZB - ZA, .08, M.paint, 0, yc, ZC);
    H.prism(G, 34, 7, 34, 7, 250, .25, M.mid, 0, sy*(YC + TH + 3.5), ZC);                                   // épine
    for(let k = 0; k < 11; k++) H.box(G, W + 1.2, TH*.72, 2.2, M.mid, 0, yc, ZA + 14 + k*26.2);            // cerclages
    [-1, 1].forEach(sx => { H.box(G, .5, 2.2, ZB - ZA, M.hazard, sx*(W/2 + .2), sy*(YC + 1.3), ZC);           // bandes de danger sur les lèvres du dock
      H.box(G, .25, .6, ZB - ZA - 20, M.accent, sx*(W/2 + .15), yc + sy*5.5, ZC);
      for(let z = ZA + 12; z < ZB - 8; z += 11) wins.push({ kind: 'port', fam, C: new V3(sx*(W/2 + .02), yc - sy*1.5, z), T: new V3(0, 0, -sx), N: new V3(sx, 0, 0), w: 2.4, D: 4.5, room: [-2.6, 2.6, -1.5, 1.4], lift: .04 }); });
    bigGreeble(G, M, R, 90, -40, 40, sy*(YC + TH), sy, ZA + 6, ZB - 6);
  });
  // ---- bloc arrière (anneaux), radiateurs, bloc moteur et tuyères
  H.prism(G, W, 100, 88, 90, 150, .08, M.paint, 0, 0, ZB + 75);
  H.prism(G, 88, 90, 70, 70, 46, .15, M.mid, 0, 0, ZB + 173);
  bigGreeble(G, M, R, 40, -36, 36, 46, 1, ZB + 6, ZB + 140); bigGreeble(G, M, R, 40, -36, 36, -46, -1, ZB + 6, ZB + 140);   // dessus du bloc arrière (effilé de 50 à 45 m)
  [-1, 1].forEach(sx => { const zr = ZB + 75;
    H.box(G, 30, 1.2, 52, M.dark, sx*(W/2 + 15), 0, zr, 0, 0, sx*.1);
    for(let k = 0; k < 9; k++) H.box(G, 28, 1.3, .6, M.heat, sx*(W/2 + 15), 0, zr - 22 + k*5.5, 0, 0, sx*.1);
    for(let r = 0; r < 2; r++) for(let k = 0; k < 6; k++) wins.push({ kind: 'port', fam, C: new V3(sx*(W/2 + .02), r ? -18 : 18, ZA - 30 + k*5.5), T: new V3(0, 0, -sx), N: new V3(sx, 0, 0), w: 2.4, D: 4.5, room: [-2.6, 2.6, -1.5, 1.4], lift: .04 }); });
  const Zs = torchSection(G, M, ZB + 196);                                                             // v7.8 : section de propulsion hard SF
  const drive = mainDrives(G, M, [[0, 0, Zs + 34, 37, 95, .8]]);                                       // torche de fusion unique (cloche de 74 m)
  const nz = drive ? [] : [[-20, -20], [20, -20], [-20, 20], [20, 20]].map(c => (H.bell(G, 9, 15, 28, M.noz, c[0], c[1], ZB + 196), [c[0], c[1], ZB + 224]));   // repli : tuyères simples
  const geode = jumpCore(G, M, 0, 47.5, ZB + 75, 13);                                                      // v7.6.1 : cœur de saut quantique
  const RU = { uField: { value: .12 }, uPhase: { value: 0 }, uTime: CR.TIME };
  ring(G, M, ZB + 31, 72, RU); ring(G, M, ZB + 119, 72, RU);
  const rings = window.__WARPRING ? __WARPRING.apply(G) : null;
  if(rings) rings.pads.forEach(pg => H.merge(pg));                                                         // émetteurs : 1 appel de dessin par anneau
  // ---- dock : pylône en treillis entre les postes, pont, berceaux, pinces, plafond lumineux, rails, passerelles, conduites
  [-1, 1].forEach(sx => H.box(G, 6, HD, 9, M.mid, sx*(W/2 - 3.5), 0, ZC));
  H.rod(G, new V3(-44, YF + 1, ZC), new V3(44, YC - 1, ZC), 1.3, M.dark); H.rod(G, new V3(-44, YC - 1, ZC), new V3(44, YF + 1, ZC), 1.3, M.dark);
  H.box(G, W - 8, 2.2, 3, M.mid, 0, 0, ZC);
  const CL = [];
  BERTHS.forEach(zb => {
    H.box(G, 86, .4, 132, M.mid, 0, YF + .2, zb);
    [-1, 1].forEach(s => { H.box(G, 1.4, .5, 132, M.hazard, s*43, YF + .25, zb); H.box(G, 86, .5, 1.4, M.hazard, 0, YF + .25, zb + s*66); });
    [-44, 0, 44].forEach(dz => { H.box(G, 44, 3.8, 7, M.dark, 0, YF + 2.3, zb + dz); H.box(G, 38, .6, 5, M.mid, 0, DECK - .3, zb + dz); });
    const cl = []; [-1, 1].forEach(sx => {                                                                   // pinces : un groupe par bord (pivot parallèle à Z), animé par la démo
      const g = new THREE.Group(); g.position.set(sx*33, YF + 4, zb); G.add(g);
      [-1, 1].forEach(sz => { H.box(G, 4, 4, 4, M.dark, sx*33, YF + 2, zb + sz*30); H.box(g, 2.4, 16, 2.4, M.mid, 0, 8, sz*30); H.box(g, 2.6, 2.4, 2.6, M.hazard, 0, 15.6, sz*30); H.box(g, 5, 1.4, 3.2, M.dark, -sx*1.8, 16.4, sz*30); });
      H.merge(g); g.rotation.z = -sx*.42; cl.push({ g, sx, open: -sx*.42, closed: sx*.62 }); });
    CL.push(cl);
  });
  for(let z = ZA + 9; z < ZB - 5; z += 14){ if(Math.abs(z - ZC) < 8) continue; [-30, 0, 30].forEach(x => H.box(G, 18, .5, 2.6, M.lamp, x, YC - .3, z)); }
  [-1, 1].forEach(sx => H.box(G, 2.2, 1.6, ZB - ZA, M.dark, sx*44, YC - .8, ZC));
  [[ZA + 2.2, 1], [ZB - 2.2, -1]].forEach(([zw, sz]) => {
    [0, -15].forEach(y => { H.box(G, W - 10, .5, 4, M.mid, 0, y, zw - sz*.2); H.box(G, W - 10, 1.1, .25, M.dark, 0, y + .8, zw + sz*1.8); });   // passerelles et garde-corps
    [-38, -31, 31, 38].forEach(x => H.cyl(G, 1.2, 1.2, HD, 10, M.dark, x, 0, zw - sz*.9));                                                  // conduites
    wins.push({ kind: 'bridge', C: new V3(0, 13, zw - sz*2.18), T: new V3(sz, 0, 0), N: new V3(0, 0, sz), w: 26, h: 4.5, D: 8, floor: 1.3 });   // salles de contrôle
  });
  berthNumbers(G);
  // livrée : bande de couleur de l'armateur (civil) ou liseré sombre (militaire), immatriculation peinte en grand
  const band = mil ? M.dark : M.std([0xd0661f, 0x2a6fb0, 0x3d8c5a, 0xb8322c][Math.floor(R()*4)], { map: H.PANEL, metalness: .3, roughness: .6 });
  [1, -1].forEach(sy => [-1, 1].forEach(sx => H.box(G, .3, 4.5, ZB - ZA - 8, band, sx*(W/2 + .12), sy*(YC + TH*.5) + sy*1.5, ZC)));
  [-1, 1].forEach(sx => { H.box(G, .3, 8, 40, band, sx*(W/2 + .12), -26, -216); H.box(G, .3, 8, 150, band, sx*(W/2 + .12), -40, ZB + 75); });
  hullText(G, (mil ? 'FC ' : 'SC ') + (100 + Math.floor(R()*899)), mil ? '#d8dde4' : '#20242a');
  // portique roulant : groupe à part, déplacé par la démo le long des rails
  const gantry = new THREE.Group(); gantry.position.set(0, YC - 4.2, ZC - 60); G.add(gantry);
  H.box(gantry, W - 6, 3, 4, M.hazard, 0, 0, 0); H.box(gantry, 3.5, 3.2, 5, M.dark, -44, 1.5, 0); H.box(gantry, 3.5, 3.2, 5, M.dark, 44, 1.5, 0);
  H.box(gantry, 8, 4, 9, M.mid, 12, -3, 0); H.cyl(gantry, .3, .3, 2.5, 6, M.dark, 12, -6.2, 0); H.box(gantry, 3, 2.2, 3, M.dark, 12, -8.3, 0);   // palan relevé (au-dessus des plus hauts vaisseaux)
  H.merge(gantry);                                                                                          // v7.10 : 1 appel par matériau (le commentaire avalait la fusion)
  // ---- propulseurs d'attitude, armement (militaire)
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(c => { H.rcsPod(G, M, o.rcs, c[0]*(W/2 + 2), c[1]*42, -228, c[0], 0, 5); H.rcsPod(G, M, o.rcs, c[0]*(W/2 + 2), c[1]*42, ZB + 130, c[0], 0, 5); });
  H.rcsPod(G, M, o.rcs, 0, 52, -290, 0, 1, 5); H.rcsPod(G, M, o.rcs, 0, -52, ZB + 150, 0, -1, 5);
  const tur = [];
  if(mil && CR.turret){ [[-26, -150], [26, -150], [-26, 60], [26, 60]].forEach(([x, z]) => tur.push(CR.turret(G, M, x, YC + TH, z, 2.4, false, false)));
    [[-26, -60], [26, -60]].forEach(([x, z]) => tur.push(CR.turret(G, M, x, -YC - TH, z, 2.4, true, false)));
    tur.push(CR.turret(G, M, 0, YC + TH + 7, -120, 3.0, false, true)); }
  const chase = chaseLights(G, mil ? 0xff3a22 : 0xffa22e), field = fieldCurtains(G);
  return { len: 760, plumeLen: 260, navSize: 7, rcsLen: 26, nozzles: nz, nozR: 15, windows: wins, lamps: [], navY: 0, navX: W/2 + 3, navZ: -214, style: 1, floods: 1, turrets: tur,
    extra: { carrier: true, civil: !mil, hold: { center: new V3(0, 0, ZC), half: new V3(W/2, HD/2, (ZB - ZA)/2) }, berths: BERTHS.map(z => ({ C: new V3(0, DECK, z), L: 140, W: 86 })),
      gantry: { group: gantry, z0: ZA + 14, z1: ZB - 14 }, clamps: CL, fields: field.sides, geode, drive, torch: { Zs, z0: Zs + 34, len: 95, r: 37 }, wings: { z0: Zs - 8, z1: Zs + 92, r0: 40, r1: 130 }, field: field.uField, rip: field.uRip, chase, ring: RU, rings, dock: { W, HD, ZA, ZB, ZC } } };
}
CR.register('carrier', (G, M, o, R) => buildCarrier(G, M, o, R, false), CIVIL, 'Ship carrier');
CR.register('carrierMil', (G, M, o, R) => buildCarrier(G, M, o, R, true), MILP, 'Fleet carrier');
CR.MIL = CR.MIL || {}; CR.MIL.carrierMil = { mid: 0x30353b, accent: 0xff2a1a };
CR.CARRIER = { W, HD, ZA, ZB, ZC, BERTHS, DECK };
CR.mainDrives = mainDrives;                                                                          // v7.8 : moteurs du jeu pour d'autres générateurs (destroyer, corvette)
/* ombre de soute : met à jour les uniformes partagés du shader d'usure pour le dock donné (position / attitude absolues du porteur),
   vus depuis la caméra (position / attitude absolues) — rendu en tranches : vue = caméra au repère absolu décalé */
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new V3(), ONE = new V3(1, 1, 1);
CR.setHold = function(pos, quat, hold, camPos, camQuat, civil){
  const HU = window.__SHIPWEAR && __SHIPWEAR.HOLD; if(!HU) return;
  if(!hold){ HU.uHoldH.value.w = 0; return; }
  _v.copy(hold.center).applyQuaternion(quat).add(pos);
  _m1.compose(_v, quat, ONE).invert(); _m2.compose(camPos, camQuat, ONE);
  HU.uHoldM.value.multiplyMatrices(_m1, _m2);
  HU.uHoldH.value.set(hold.half.x, hold.half.y, hold.half.z, 1);
  if(civil) HU.uHoldCol.value.set(1, .95, .86, .5); else HU.uHoldCol.value.set(.86, .93, 1, .46);   // plafond : blanc chaud (civil), blanc froid (militaire)
  HU.uHoldUp.value.set(0, 1, 0).applyQuaternion(quat).applyQuaternion(_q.copy(camQuat).invert());
};
})();
