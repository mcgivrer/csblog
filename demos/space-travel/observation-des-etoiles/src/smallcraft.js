/* =====================================================================
   PETITS ENGINS — générateur procédural (remplace les navettes du jeu dans la démo)
   Style mixte : base réaliste (structure, réservoirs, radiateurs, tuyères, blocs RCS, usure)
   + touches « space opera » : carénages anguleux, détails en relief, feux bleus.
   Types : 'maint' (navette de maintenance, bras manipulateurs, projecteurs),
           'crew' (navette de transport court : cockpit, hublots, ailerons radiateurs, 2 tuyères),
           'drone' (variantes 'inspect' | 'relay' | 'cargo'),
           'lighter' (gabare à conteneurs : poutre, cabine, 1 ou 2 conteneurs).
   Unités : mètres ; nez vers −Z, dos vers +Y (même repère que SHIPGEN).
   CRAFT.build(kind, { variant, age, seed, slim }) → { group, kind, variant, len, box, rcs, rcsLen, nav, lamps, thr, bay, dispose }
   Les pièces d'un même matériau sont fusionnées (4 à 8 appels de dessin par engin).
   Dans un hangar, bay.uBayP (plan de la baie dans le repère de l'engin) éteint le soleil
   et baigne l'engin de la lumière bleue du hangar.
   ===================================================================== */
(function(){
'use strict';
const CR = window.__CRAFT = {};
const V3 = THREE.Vector3;
const ORDER = (window.__SHIPGLASS && __SHIPGLASS.RENDER_ORDER) ? __SHIPGLASS.RENDER_ORDER.craft : 7;

/* ---------- textures partagées ---------- */
/* v7.1 : textures tracées 4 fois plus fines (2 avec ?quality=low) — même dessin en unités de base, net en gros plan ; filtrage anisotrope maximal */
const TEX_K = new URLSearchParams(location.search).get('quality') === 'low' ? 2 : 4;
function canvasTex(w, h, draw){ const c = document.createElement('canvas'); c.width = w*TEX_K; c.height = h*TEX_K; const g = c.getContext('2d'); g.scale(TEX_K, TEX_K); draw(g, w, h); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = typeof renderer !== 'undefined' ? renderer.capabilities.getMaxAnisotropy() : 8; t.encoding = THREE.sRGBEncoding; return t; }
let rs = 11; const rnd = () => (rs = (rs*16807) % 2147483647)/2147483647;
const PANEL = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#c9cdd3'; g.fillRect(0, 0, w, h);
  (function split(x, y, a, b, d){
    if(d > 0 && (a > 40 || b > 40) && rnd() < .85){ if(a > b){ const s = Math.round(a*(.3 + .4*rnd())); split(x, y, s, b, d - 1); split(x + s, y, a - s, b, d - 1); } else { const s = Math.round(b*(.3 + .4*rnd())); split(x, y, a, s, d - 1); split(x, y + s, a, b - s, d - 1); } return; }
    const l = 190 + Math.floor(30*rnd()); g.fillStyle = `rgb(${l},${l + 2},${l + 6})`; g.fillRect(x + 1, y + 1, a - 2, b - 2);
    g.strokeStyle = 'rgba(30,34,40,.65)'; g.lineWidth = 1.5; g.strokeRect(x + 1, y + 1, a - 2, b - 2);
    if(rnd() < .35){ g.fillStyle = 'rgba(40,45,52,.5)'; for(let i = 5; i < a - 5; i += 8){ g.beginPath(); g.arc(x + i + .75, y + 3.75, .8, 0, 6.2832); g.fill(); g.beginPath(); g.arc(x + i + .75, y + b - 4.25, .8, 0, 6.2832); g.fill(); } }
    if(rnd() < .12){ g.fillStyle = 'rgba(30,34,40,.35)'; g.fillRect(x + a*.3, y + b*.3, a*.4, b*.4); }
  })(0, 0, w, h, 6);
});
const HAZARD = canvasTex(128, 32, (g, w, h) => { g.fillStyle = '#1d1f23'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8a91c';
  for(let x = -32; x < w + 32; x += 32){ g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 32, 0); g.lineTo(x + 16, 0); g.closePath(); g.fill(); } });
const CARGO = [0xb4542a, 0x2f6fa8, 0x6f7f2c, 0xc9a227, 0x7a3d8c, 0x8e9aa6];

/* ---------- matériaux (par engin : l'usure et l'éclairage de hangar sont propres à chaque engin) ---------- */
const BAY_PARS_V = `\nuniform vec4 uBayP; varying float vBayS;`;
const BAY_PARS_F = `\nuniform float uBayOn; uniform vec3 uBayCol; varying float vBayS;`;
function bayOBC(bay){
  return function(shader){
    shader.uniforms.uBayP = bay.uBayP; shader.uniforms.uBayOn = bay.uBayOn; shader.uniforms.uBayCol = bay.uBayCol;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>' + BAY_PARS_V)
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vBayS = dot(transformed, uBayP.xyz) + uBayP.w;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>' + BAY_PARS_F)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  { float kb = uBayOn*smoothstep(0.4, -0.8, vBayS);          /* dans le hangar : pas de soleil, lumière bleue diffuse */
    reflectedLight.directDiffuse *= 1.0 - 0.92*kb; reflectedLight.directSpecular *= 1.0 - 0.92*kb;
    reflectedLight.indirectDiffuse += kb*uBayCol*diffuseColor.rgb; }`);
  };
}
function mats(bay, paint, accentHex, midHex){
  const std = (color, o) => { const m = new THREE.MeshStandardMaterial(Object.assign({ color, metalness: .4, roughness: .6, flatShading: true }, o || {})); m.color.convertSRGBToLinear(); if(m.emissive) m.emissive.convertSRGBToLinear(); m.userData.lin = true;
    m.onBeforeCompile = bayOBC(bay); m.customProgramCacheKey = () => 'craft-bay-v1'; return m; };
  const out = {
    paint: std(paint, { map: PANEL, bumpMap: PANEL, bumpScale: .02, metalness: .3, roughness: .62 }),
    mid: std(midHex || 0x8a9098, { map: PANEL, bumpMap: PANEL, bumpScale: .015, metalness: .5, roughness: .5 }),
    dark: std(0x2c3036, { metalness: .6, roughness: .5 }),
    noz: std(0x3a3c41, { metalness: .85, roughness: .35, side: THREE.DoubleSide, emissive: 0x2a4a7a, emissiveIntensity: .25 }),
    hazard: std(0xffffff, { map: HAZARD, metalness: .2, roughness: .7 }),
    accent: std(0x0a0e14, { emissive: accentHex || 0x2f86ff, emissiveIntensity: 1.3, metalness: .2, roughness: .4 }),
    lamp: std(0x111111, { emissive: 0xfff4e0, emissiveIntensity: 3, metalness: 0, roughness: .3 }),
    heat: std(0x1a0a06, { emissive: 0xff4a1a, emissiveIntensity: .7, metalness: .3, roughness: .6 }),   // v7.4 : canaux de chaleur des radiateurs
    cargo: {}, std
  };
  // usure : pas de « tôles remplacées » (cellules de 4 m, trop grandes pour un petit engin)
  [out.paint, out.mid, out.hazard, out.accent, out.lamp].forEach(m => m.userData.wearKind = 4); out.dark.userData.wearKind = 2; out.heat.userData.wearKind = 2; out.noz.userData.wearKind = 1;
  const std0 = out.std; out.std = (c, o) => { const m = std0(c, o); m.userData.wearKind = 4; return m; };
  return out;
}
CR.mats = mats;

/* ---------- primitives ---------- */
function T(g){ const n = g.index ? g.toNonIndexed() : g; if(!n.attributes.uv){ const uv = new Float32Array(n.attributes.position.count*2); n.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }
  // UV planaires en mètres (panneaux de 2,5 m) : cohérents d'une pièce à l'autre
  const p = n.attributes.position, uv = n.attributes.uv, a = new V3(), b = new V3(), c = new V3(), nn = new V3();
  for(let i = 0; i < p.count; i += 3){ a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    nn.crossVectors(b.clone().sub(a), c.clone().sub(a)); const ax = Math.abs(nn.x), ay = Math.abs(nn.y), az = Math.abs(nn.z);
    [a, b, c].forEach((v, j) => { let u, w; if(ax >= ay && ax >= az){ u = v.z; w = v.y; } else if(ay >= az){ u = v.x; w = v.z; } else { u = v.x; w = v.y; } uv.setXY(i + j, u/2.5, w/2.5); }); }
  n.computeVertexNormals(); return n; }
function part(G, geo, mat, x, y, z, rx, ry, rz){ const m = new THREE.Mesh(T(geo), mat); m.position.set(x || 0, y || 0, z || 0); m.rotation.set(rx || 0, ry || 0, rz || 0); G.add(m); return m; }
function box(G, w, h, d, mat, x, y, z, rx, ry, rz){ return part(G, new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx, ry, rz); }
/* prisme à pans coupés le long de Z, effilé : (w0,h0) à l'avant (−Z), (w1,h1) à l'arrière */
function prism(G, w0, h0, w1, h1, len, ch, mat, x, y, z, dy0, dy1){
  const s = new THREE.Shape(), r = .5, c = ch;
  s.moveTo(-r + c, -r); s.lineTo(r - c, -r); s.lineTo(r, -r + c); s.lineTo(r, r - c); s.lineTo(r - c, r); s.lineTo(-r + c, r); s.lineTo(-r, r - c); s.lineTo(-r, -r + c); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 1 });
  const p = g.attributes.position;
  for(let i = 0; i < p.count; i++){ const t = p.getZ(i); p.setXYZ(i, p.getX(i)*(w0 + (w1 - w0)*t), p.getY(i)*(h0 + (h1 - h0)*t) + (dy0 || 0)*(1 - t) + (dy1 || 0)*t, (t - .5)*len); }
  return part(G, g, mat, x, y, z);
}
function cyl(G, r0, r1, len, seg, mat, x, y, z, rx, ry, rz){ return part(G, new THREE.CylinderGeometry(r0, r1, len, seg || 10, 1), mat, x, y, z, rx, ry, rz); }
function rod(G, A, B, r, mat){ const d = B.clone().sub(A), L = d.length(); const m = cyl(G, r, r, L, 6, mat); m.position.copy(A).addScaledVector(d, .5); m.quaternion.setFromUnitVectors(new V3(0, 1, 0), d.normalize()); return m; }
function bell(G, r0, r1, len, mat, x, y, z){ const pts = [[.55*r0, 0], [r0, .12*len], [.8*r0, .32*len], [.6*r1, .7*len], [r1, len]].map(q => new THREE.Vector2(q[0], q[1]));
  const g = new THREE.LatheGeometry(pts, 14); g.rotateX(Math.PI/2); return part(G, g, mat, x, y, z); }
/* bloc RCS (cube + 3 buses) ; la démo anime les panaches par couple (buses radiales nx, ny) */
function rcsPod(G, M, rcs, x, y, z, nx, ny, s){ box(G, s, s, s, M.mid, x, y, z);
  [[nx, ny, 0], [0, 0, 1], [0, 0, -1]].forEach(n => { const c = cyl(G, .1*s*2.2, .22*s*2.2, .5*s, 6, M.noz); c.quaternion.setFromUnitVectors(new V3(0, -1, 0), new V3(n[0], n[1], n[2])); c.position.set(x + .72*s*n[0], y + .72*s*n[1], z + .72*s*n[2]); });
  rcs.push({ x: x + s*nx*1.1, y: y + s*ny*1.1, z, nx, ny }); }

/* ---------- panache de tuyère (torche bleue compacte, billboard le long de l'axe +Z) ---------- */
const PLUME_V = `uniform float uLen; uniform float uRad; uniform float uThr; varying vec2 vU; varying float vEnd;
void main(){ vec3 o = (modelMatrix*vec4(0.0, 0.0, 0.0, 1.0)).xyz; vec3 ax = (modelMatrix*vec4(0.0, 0.0, 1.0, 0.0)).xyz; float sc = length(ax); ax /= sc;
  float L = uLen*(0.3 + 0.7*uThr)*sc; vec3 tc = normalize(cameraPosition - (o + ax*L*0.5)); vec3 sd = cross(ax, tc); float sl = length(sd); sd = sl > 1e-4 ? sd/sl : normalize(cross(ax, vec3(0.0, 1.0, 0.0)));
  vU = vec2(uv.x*2.0 - 1.0, uv.y); vEnd = abs(dot(ax, normalize(cameraPosition - o)));
  vec3 wp = o + ax*(uv.y*L) + sd*((uv.x*2.0 - 1.0)*uRad*sc); gl_Position = projectionMatrix*viewMatrix*vec4(wp, 1.0); }`;
const PLUME_F = `precision highp float; uniform float uThr; uniform float uTime; uniform float uSeed; varying vec2 vU; varying float vEnd;
void main(){ float z = vU.y, x = vU.x; float w = mix(0.22, 0.5, z); float a = x/w; float core = exp(-a*a*3.0)*exp(-z*2.4); float sh = exp(-a*a)*exp(-z*1.3);
  float fl = 0.9 + 0.1*sin(uTime*37.0 + uSeed*11.0);
  vec3 col = (vec3(0.9, 0.96, 1.0)*core*1.6 + vec3(0.3, 0.55, 1.0)*sh*0.6)*uThr*fl*(1.0 - smoothstep(0.6, 1.0, z))*(1.0 - smoothstep(0.85, 0.99, vEnd));
  gl_FragColor = vec4(vec3(1.0) - exp(-col*1.3), 1.0); }`;
CR.TIME = { value: 0 };
function plume(G, thr, x, y, z, r, len, seed){
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(.5, .5, 0), new THREE.ShaderMaterial({ uniforms: { uLen: { value: len }, uRad: { value: r*1.6 }, uThr: thr, uTime: CR.TIME, uSeed: { value: seed } },
    vertexShader: PLUME_V, fragmentShader: PLUME_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  m.position.set(x, y, z); m.frustumCulled = false; m.renderOrder = ORDER + 3; m.userData.noFrame = true; m.userData.keep = true; G.add(m); return m;
}
/* ---------- feux (sprites additifs) ---------- */
function glowMat(color){ return new THREE.SpriteMaterial({ map: (typeof glowTex !== 'undefined') ? glowTex : null, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }); }
function navLight(G, nav, color, x, y, z, size, period, duty, phase, peak){ const s = new THREE.Sprite(glowMat(color)); s.position.set(x, y, z); s.scale.setScalar(size); s.renderOrder = ORDER + 2; s.userData.noFrame = true; s.userData.keep = true; G.add(s);
  nav.push({ mat: s.material, sprite: s, period, duty, phase, peak }); return s; }
/* cône de projecteur (volume lumineux discret) */
function lampCone(G, lamps, x, y, z, dir, len, ang){
  const g = new THREE.ConeGeometry(Math.tan(ang)*len, len, 16, 1, true); g.translate(0, -len/2, 0);
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: { uOn: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = -position.y; vec4 mv = modelViewMatrix*vec4(position, 1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: `precision highp float; uniform float uOn; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float e = abs(dot(vN, vV)); float k = uOn*0.10*exp(-vY/${(len*.45).toFixed(2)})*pow(e, 1.5); gl_FragColor = vec4(vec3(1.0, 0.95, 0.85)*k, 1.0); }` }));
  m.position.set(x, y, z); m.quaternion.setFromUnitVectors(new V3(0, -1, 0), dir.clone().normalize()); m.renderOrder = ORDER + 1; m.userData.noFrame = true; m.userData.keep = true; G.add(m);
  lamps.push(m.material.uniforms.uOn); return m;
}

/* ---------- fusion par matériau ---------- */
function merge(G){
  const groups = new Map();
  G.children.slice().forEach(m => { if(!m.isMesh || m.userData.keep) return; const k = m.material; if(!groups.has(k)) groups.set(k, []); groups.get(k).push(m); });
  groups.forEach((list, mat) => {
    const pos = [], nor = [], uvs = [];
    list.forEach(m => { m.updateMatrix(); const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); g.applyMatrix4(m.matrix);
      pos.push(g.attributes.position.array); nor.push(g.attributes.normal.array); uvs.push(g.attributes.uv ? g.attributes.uv.array : new Float32Array(g.attributes.position.count*2)); g.dispose(); m.geometry.dispose(); G.remove(m); });
    const cat = (arrs) => { const n = arrs.reduce((a, p) => a + p.length, 0), out = new Float32Array(n); let o = 0; arrs.forEach(p => { out.set(p, o); o += p.length; }); return out; };
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(cat(pos), 3)); g.setAttribute('normal', new THREE.BufferAttribute(cat(nor), 3)); g.setAttribute('uv', new THREE.BufferAttribute(cat(uvs), 2));
    g.computeBoundingSphere(); const m = new THREE.Mesh(g, mat); m.renderOrder = ORDER; G.add(m);
  });
}

/* =====================================================================
   MODÈLES
   ===================================================================== */
const PAINT = { maint: [0xd9a21b, 0xd06a1c, 0xc9c24a], crew: [0xe4e7ea, 0xcfd4d9, 0x9aa3ad], drone: [0x3a3f47, 0x4b525c, 0x2d3238], lighter: [0x6b7a5a, 0x8a8f96, 0x5d6b78] };

function buildMaint(G, M, o, R){   // navette de maintenance : cabine vitrée, soute d'équipement, bras, projecteurs (≈ 8,5 m)
  const w = o.slim ? 2.5 : 3.3, h = 2.6;
  prism(G, w*.86, h*.8, w, h, 3.2, .18, M.paint, 0, 0, -2.4);                    // cabine
  prism(G, w, h, w*.96, h*.92, 3.8, .14, M.mid, 0, 0, 1.1);                        // soute d'équipement
  box(G, w*1.02, .22, 3.6, M.hazard, 0, h*.47, 1.1);                                // bande de danger dorsale
  box(G, w*.7, .5, 1.6, M.dark, 0, h*.5 + .25, .6);                                 // caisson de treuil
  greeble(G, M, R, 12, -w*.35, w*.35, h*.46, -3.6, -1.0);
  [-1, 1].forEach(s => { cyl(G, .42, .42, 3.2, 10, M.paint, s*(w/2 + .35), -.35, 1.2, Math.PI/2);   // réservoirs latéraux
    box(G, .06, 1.3, 2.2, M.mid, s*(w/2 + .1), h*.25, 1.6);                         // radiateur
    const sh = new V3(s*w*.3, -h*.42, -3.4), el = new V3(s*w*.42, -h*.7, -4.5), wr = new V3(s*w*.2, -h*.55, -5.4);   // bras manipulateur
    rod(G, sh, el, .11, M.paint); rod(G, el, wr, .08, M.paint);
    part(G, new THREE.SphereGeometry(.18, 8, 6), M.dark, sh.x, sh.y, sh.z); part(G, new THREE.SphereGeometry(.15, 8, 6), M.dark, el.x, el.y, el.z);
    [-1, 1].forEach(k => rod(G, wr, wr.clone().add(new V3(k*.18, -.05, -.35)), .035, M.dark));
    box(G, .38, .26, .3, M.dark, s*w*.32, h*.52, -3.3);                              // projecteur
    box(G, .3, .2, .02, M.lamp, s*w*.32, h*.52, -3.46);
  });
  // tuyères arrière (4) et blocs RCS (4 coins)
  const nz = []; [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(c => { const x = c[0]*w*.26, y = c[1]*h*.22; bell(G, .16, .3, .6, M.noz, x, y, 3.0); nz.push([x, y, 3.6]); });
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach((c, i) => rcsPod(G, M, o.rcs, c[0]*(w/2 + .15), c[1]*(h/2 - .2), i < 2 ? -3.6 : 2.6, c[0], 0, .34));
  box(G, w*.5, .06, .5, M.accent, 0, -h*.42, -3.9);                                 // feu bleu sous la cabine
  box(G, .05, .5, 2.6, M.accent, w/2 + .01, .1, 1.1); box(G, .05, .5, 2.6, M.accent, -w/2 - .01, .1, 1.1);
  return { len: 8.8, nozzles: nz, nozR: .3, windows: [
    { kind: 'bridge', C: new V3(0, .15, -4.0 - .01), T: new V3(-1, 0, 0), N: new V3(0, 0, -1), w: w*.62, h: h*.42, D: 1.6, floor: .6 },
    { kind: 'bridge', C: new V3(w*.462, .25, -2.6), T: new V3(0, 0, -1), N: new V3(1, 0, -.07).normalize(), w: 1.3, h: .8, D: 1.4, lift: .05 },
    { kind: 'bridge', C: new V3(-w*.462, .25, -2.6), T: new V3(0, 0, 1), N: new V3(-1, 0, -.07).normalize(), w: 1.3, h: .8, D: 1.4, lift: .05 } ],
    lamps: [[w*.32, h*.52, -3.5, new V3(0, -.35, -1)], [-w*.32, h*.52, -3.5, new V3(0, -.35, -1)]], navY: h*.5, navX: w/2 + .5, navZ: -2 };
}
function buildCrew(G, M, o, R){   // navette de transport court : nez effilé, cabine à hublots, ailerons radiateurs (≈ 16 m)
  const w = 4.4, h = 3.8, L = 16;
  prism(G, w*.45, h*.5, w*.92, h*.95, 4.2, .22, M.paint, 0, 0, -L/2 + 2.1, -.25, 0);            // nez
  prism(G, w*.92, h*.95, w, h, 7.2, .2, M.paint, 0, 0, -L/2 + 7.8);                              // cabine
  prism(G, w, h, w*.8, h*.78, 4.6, .18, M.mid, 0, 0, L/2 - 2.3);                                 // section propulsion
  box(G, w*1.01, .12, 7.0, M.accent, 0, -h*.12, -L/2 + 7.8);                                      // liseré lumineux
  greeble(G, M, R, 26, -w*.28, w*.28, h*.5 - .02, -L/2 + 4.8, L/2 - 1.5);
  box(G, w*.6, .25, 2.2, M.dark, 0, h*.5 + .1, -L/2 + 8.5);                                       // collier d'amarrage dorsal
  cyl(G, .9, .9, .5, 16, M.mid, 0, h*.5 + .35, -L/2 + 8.5);
  // ailerons radiateurs en flèche (dorsaux) et ventraux, comme sur l'image
  [-1, 1].forEach(s => {
    const f = new THREE.Shape(); f.moveTo(0, 0); f.lineTo(3.2, 0); f.lineTo(4.4, 2.4); f.lineTo(2.6, 2.4); f.closePath();
    const g = new THREE.ExtrudeGeometry(f, { depth: .12, bevelEnabled: false }); g.translate(0, 0, -.06); g.rotateY(Math.PI/2);
    const m = part(G, g, M.mid, s*w*.28, h*.42, L/2 - 1.2); m.rotation.z = s*.35;
    const g2 = new THREE.ExtrudeGeometry(f, { depth: .1, bevelEnabled: false }); g2.translate(0, 0, -.05); g2.rotateY(Math.PI/2); g2.scale(1, .6, .7);
    const m2 = part(G, g2, M.dark, s*w*.3, -h*.42, L/2 - 1.2); m2.rotation.z = Math.PI - s*.5;
    box(G, .16, 1.0, 3.4, M.dark, s*(w/2 + .08), -h*.3, L/2 - 3.2);                              // carénage de réservoir
    rcsPod(G, M, o.rcs, s*(w/2 + .2), h*.25, -L/2 + 3.2, s, 0, .42); rcsPod(G, M, o.rcs, s*(w/2 + .1), h*.2, L/2 - 1.4, s, 0, .42);
  });
  rcsPod(G, M, o.rcs, 0, h/2 + .15, -L/2 + 2.6, 0, 1, .4); rcsPod(G, M, o.rcs, 0, -h/2 - .15, L/2 - 2, 0, -1, .4);
  box(G, w*.7, h*.6, .3, M.dark, 0, 0, L/2 + .1);                                                 // plaque de poussée
  const nz = []; [-1, 1].forEach(s => { bell(G, .32, .62, 1.3, M.noz, s*w*.2, 0, L/2 + .2); nz.push([s*w*.2, 0, L/2 + 1.5]); });
  // hublots de la cabine (intérieurs simulés) et verrière du cockpit
  const win = [];
  [-1, 1].forEach(s => { for(let k = 0; k < 6; k++){ const z = -L/2 + 5.2 + k*1.05, t = (z - (-L/2 + 4.2))/7.2, hw = (.92 + .08*t)*w/2;
    win.push({ kind: 'port', C: new V3(s*hw, .45, z), T: new V3(0, 0, -s), N: new V3(s, 0, -.024).normalize(), w: .52, D: 2.0, room: [-.9, .9, -1.4, 1.0], lift: .04 }); } });
  const tn = .55, ytop = .7 + 1.105*tn;                                                            // pare-brise sur la pente du nez
  win.push({ kind: 'bridge', C: new V3(0, ytop + .02, -L/2 + tn*4.2), T: new V3(-1, 0, 0), N: new V3(0, 1, -.263).normalize(), w: 1.5, h: 1.1, D: 1.6, floor: .6, lift: .04 });
  return { len: L + 1.5, nozzles: nz, nozR: .62, windows: win, lamps: [[0, -h*.45, -L/2 + 1.2, new V3(0, -.3, -1)]], navY: h*.2, navX: w/2 + .15, navZ: -1 };
}
function buildDrone(G, M, o, R){   // drones : inspection (quadri-propulseur à tourelle), relais (antenne, panneaux), cargo (caisse)
  const v = o.variant || 'inspect', nz = [];
  if(v === 'inspect'){
    part(G, new THREE.IcosahedronGeometry(.8, 0), M.paint, 0, 0, 0);
    box(G, .5, .4, .6, M.dark, 0, -.6, -.35); box(G, .22, .22, .05, M.accent, 0, -.6, -.66);          // tourelle caméra
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(c => { const P = new V3(c[0]*1.1, .1, c[1]*1.0); rod(G, new V3(c[0]*.5, 0, c[1]*.45), P, .06, M.dark);
      cyl(G, .18, .22, .4, 8, M.mid, P.x, P.y, P.z); rcsRadial(c); });
    cyl(G, .95, .95, .06, 20, M.accent, 0, .12, 0);                                                 // anneau lumineux
    nz.push([0, 0, .9]);
    return { len: 2.4, nozzles: nz, nozR: .14, windows: [], lamps: [[0, -.6, -.7, new V3(0, -.2, -1)]], navY: .4, navX: 1.25, navZ: 0 };
  }
  if(v === 'relay'){
    box(G, 1.1, .9, 1.6, M.paint, 0, 0, 0);
    [-1, 1].forEach(s => { box(G, 2.6, .04, 1.1, M.accent, s*2.0, 0, .1); rod(G, new V3(s*.55, 0, .1), new V3(s*.8, 0, .1), .05, M.dark); });   // panneaux solaires bleutés
    const dish = new THREE.SphereGeometry(.9, 14, 6, 0, Math.PI*2, 0, .55); dish.rotateX(-Math.PI/2);
    part(G, dish, M.mid, 0, .3, -1.2); rod(G, new V3(0, .3, -.8), new V3(0, .3, -1.7), .03, M.dark);
    bell(G, .08, .16, .3, M.noz, 0, 0, .8); nz.push([0, 0, 1.1]);
    rcsRadial([1, 1]); rcsRadial([-1, -1]);
    return { len: 3.4, nozzles: nz, nozR: .16, windows: [], lamps: [], navY: .5, navX: 3.3, navZ: .1 };
  }
  // cargo
  const k = CARGO[Math.floor(R()*CARGO.length)]; if(!M.cargo[k]) M.cargo[k] = M.std(k, { map: PANEL, metalness: .25, roughness: .7 });
  box(G, 1.6, 1.4, 2.2, M.cargo[k], 0, -.2, 0);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(c => { rod(G, new V3(c[0]*.85, .6, c[1]*1.15), new V3(c[0]*.85, -.95, c[1]*1.15), .05, M.dark); cyl(G, .16, .2, .35, 8, M.mid, c[0]*1.05, .65, c[1]*1.2); rcsRadial(c); });
  box(G, 1.9, .12, 2.6, M.dark, 0, .62, 0); box(G, 1.6, .05, .1, M.accent, 0, .7, -1.3);
  nz.push([0, .62, 1.4]);
  return { len: 2.8, nozzles: nz, nozR: .14, windows: [], lamps: [], navY: .7, navX: 1.1, navZ: 0 };
  function rcsRadial(c){ o.rcs.push({ x: c[0]*1.2, y: 0, z: (c[1] || 0)*1.0, nx: c[0], ny: 0 }); }
}
function buildLighter(G, M, o, R){   // gabare : cabine à l'avant, poutre en treillis, 1–2 conteneurs de 12 m, moteur (≈ 22–34 m)
  const n = o.containers || (R() < .5 ? 1 : 2), Lc = 12.2, sp = 1.2, Ls = n*(Lc + .6) + 1.2, L = Ls + 7;
  const z0 = -L/2 + 3.2;
  prism(G, 2.6, 2.4, 3.4, 3.0, 3.2, .2, M.paint, 0, .4, z0 - 1.6 + .0);                            // cabine
  box(G, 3.5, .3, 1.2, M.hazard, 0, -1.2, z0 - .4);
  const zs = z0, ze = zs + Ls;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(c => box(G, .28, .28, Ls, M.dark, c[0]*sp*.55, c[1]*sp*.55 - 1.8, (zs + ze)/2));   // poutre sous les conteneurs
  for(let k = 0; k <= n*3; k++){ const z = zs + k*Ls/(n*3); box(G, sp*1.2, .18, .18, M.dark, 0, -1.8 + sp*.55, z); box(G, sp*1.2, .18, .18, M.dark, 0, -1.8 - sp*.55, z); }
  for(let i = 0; i < n; i++){
    const k = CARGO[Math.floor(R()*CARGO.length)]; if(!M.cargo[k]) M.cargo[k] = M.std(k, { map: PANEL, metalness: .25, roughness: .7 });
    const zc = zs + .6 + i*(Lc + .6) + Lc/2;
    box(G, 2.5, 2.6, Lc, M.cargo[k], 0, .1, zc);
    [-1, 1].forEach(e => box(G, 2.62, 2.72, .18, M.dark, 0, .1, zc + e*Lc*.47));                      // cadres d'extrémité
    [-1, 1].forEach(s => box(G, .22, .5, .5, M.hazard, s*1.35, -1.25, zc));                            // verrous
  }
  prism(G, 2.4, 2.2, 2.0, 1.8, 3.4, .2, M.mid, 0, -.4, ze + 1.7);                                     // section propulsion
  const nz = []; bell(G, .5, .9, 1.6, M.noz, 0, -.4, ze + 3.4); nz.push([0, -.4, ze + 5.0]);
  [-1, 1].forEach(s => { rcsPod(G, M, o.rcs, s*1.9, .4, z0 - 1.6, s, 0, .38); rcsPod(G, M, o.rcs, s*1.5, -.4, ze + 2.4, s, 0, .38); box(G, .05, .1, Ls*.9, M.accent, s*(sp*.66 + .05), -1.8, (zs + ze)/2); });
  const win = [{ kind: 'bridge', C: new V3(0, .75, z0 - 3.21), T: new V3(-1, 0, 0), N: new V3(0, 0, -1), w: 2.0, h: .9, D: 2.4, floor: .8 },
    { kind: 'bridge', C: new V3(1.49, .8, z0 - 1.7), T: new V3(0, 0, -1), N: new V3(1, 0, -.125).normalize(), w: 1.4, h: .7, D: 1.8, lift: .05 },
    { kind: 'bridge', C: new V3(-1.49, .8, z0 - 1.7), T: new V3(0, 0, 1), N: new V3(-1, 0, -.125).normalize(), w: 1.4, h: .7, D: 1.8, lift: .05 }];
  return { len: L + 2, nozzles: nz, nozR: .9, windows: win, lamps: [[0, -1.2, z0 - 3.0, new V3(0, -.4, -1)]], navY: 1.7, navX: 1.9, navZ: z0 };
}
/* détails en relief (« greebles ») semés sur une face supérieure */
function greeble(G, M, R, n, x0, x1, y, z0, z1){
  for(let i = 0; i < n; i++){ const a = .15 + .45*R(), b = .15 + .6*R(), hh = .06 + .22*R();
    box(G, a, hh, b, R() < .6 ? M.dark : M.mid, x0 + (x1 - x0)*R(), y + hh/2, z0 + (z1 - z0)*R()); }
}
const BUILDERS = { maint: buildMaint, crew: buildCrew, drone: buildDrone, lighter: buildLighter };
/* v7.4 : outils exposés pour d'autres générateurs (warships.js) et enregistrement de nouveaux types */
CR.H = { T, part, box, prism, cyl, rod, bell, rcsPod, plume, navLight, lampCone, merge, greeble, PANEL, HAZARD, ORDER };
CR.register = function(kind, builder, paints, name){ BUILDERS[kind] = builder; PAINT[kind] = paints; CR.NAMES[kind] = name; };
CR.NAMES = { maint: 'Maintenance tender', crew: 'Crew shuttle', lighter: 'Container lighter', drone: { inspect: 'Inspection drone', relay: 'Relay drone', cargo: 'Cargo drone' } };

CR.build = function(kind, opts){
  opts = opts || {};
  let s = ((opts.seed || 1) >>> 0) || 1; const R = () => ((s = (s*16807) % 2147483647) - 1)/2147483646;
  const G = new THREE.Group();
  const bay = { uBayP: { value: new THREE.Vector4(0, 0, 0, 1e6) }, uBayOn: { value: 0 }, uBayCol: { value: new THREE.Color(.05, .16, .42) } };
  const pal = PAINT[kind] || PAINT.crew, paint = opts.paint || pal[Math.floor(R()*pal.length)];
  const mil = CR.MIL && CR.MIL[kind];                                             // v7.4 : militaires — structure sombre, feux rouges
  const M = mats(bay, paint, opts.accent || (mil ? mil.accent : undefined), mil ? mil.mid : undefined);
  const o = { rcs: [], variant: opts.variant, slim: opts.slim, containers: opts.containers };
  const spec = BUILDERS[kind](G, M, o, R);
  const thr = { value: 0 };
  spec.nozzles.forEach((p, i) => plume(G, thr, p[0], p[1], p[2], spec.nozR, spec.plumeLen || spec.len*(kind === 'drone' ? .6 : .9), i + R()*9));   // v7.6 : longueur imposable (porte-vaisseaux)
  const nav = [], lamps = [], ns = spec.navSize || spec.len*.07 + .25;
  navLight(G, nav, 0xff3030, -spec.navX, spec.navY, spec.navZ, ns, 1.6, .5, 0, .9);
  navLight(G, nav, 0x30ff60, spec.navX, spec.navY, spec.navZ, ns, 1.6, .5, 0, .9);
  navLight(G, nav, 0xffffff, 0, spec.navY*.6, spec.len*.42, spec.navSize ? ns*1.4 : spec.len*.1 + .4, 1.3, .08, R(), 1);
  if(kind === 'drone') navLight(G, nav, 0x5aa8ff, 0, spec.navY, 0, .9, .9, .35, R(), .9);
  (spec.lamps || []).forEach(l => lampCone(G, lamps, l[0], l[1], l[2], l[3], kind === 'maint' ? 14 : 9, .28));
  merge(G);
  if(spec.windows.length && window.__SHIPGLASS){ const gm = __SHIPGLASS.addWindows(G, spec.windows, opts.age || 0, s, spec.style !== undefined ? spec.style : (kind === 'crew' ? 0 : 1)); gm.renderOrder = ORDER; }   // v7.3 : navette de passagers = hospitalité
  let docks = [];
  if(spec.bays && window.__SHIPGLASS && __SHIPGLASS.addBays) docks = __SHIPGLASS.addBays(G, spec.bays, opts.age || 0, s, 1).docks;   // v7.5 : hangars à champ de force (destroyer)
  let wearU = null;
  if(window.__SHIPWEAR) wearU = __SHIPWEAR.apply(G, opts.age || 0, s, 1);             // v7.1 : aussi neuf (micro-relief des gros plans)
  G.traverse(m => { if(m.isMesh && m.renderOrder < ORDER && !m.userData.portal) m.renderOrder = ORDER; });
  if(docks.length) G.children.forEach(m => { if(m.isMesh && !m.userData.portal && !m.userData.noFrame && !m.userData.glass) m.renderOrder = 0; });   // coque avant les portails (comme les vaisseaux du jeu)
  const box3 = new THREE.Box3(); G.updateMatrixWorld(true); G.traverse(m => { if(m.isMesh && !m.userData.noFrame){ m.geometry.computeBoundingBox(); box3.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld)); } });
  if(spec.floods && wearU && __SHIPWEAR.floods) __SHIPWEAR.floods(wearU, box3, spec.floods);   // v7.4 : projecteurs de coque (coques sombres)
  return { group: G, kind, variant: o.variant || null, name: kind === 'drone' ? CR.NAMES.drone[o.variant || 'inspect'] : CR.NAMES[kind], len: spec.len, box: box3,
    rcs: o.rcs, rcsLen: spec.rcsLen || Math.max(1.2, spec.len*.18), nav, lamps, thr, bay, turrets: spec.turrets || [], mil: !!mil, wear: wearU, docks, extra: spec.extra || null,
    dispose(){ G.traverse(m => { if(m.geometry) m.geometry.dispose(); if(m.material){ (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => { if(x.userData && x.userData.ownMap && x.map) x.map.dispose(); x.dispose(); }); } }); G.parent && G.parent.remove(G); } };   // v7.6 : textures propres (porte-vaisseaux)
};
})();
