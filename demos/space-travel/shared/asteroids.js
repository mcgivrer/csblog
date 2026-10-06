/* =====================================================================
   ASTÉROÏDES TEXTURÉS — générés au démarrage
   - 5 gabarits de roches (icosphères déformées : forme irrégulière, cratères, arêtes)
   - 4 familles de textures tuilables générées sur canvas (albédo + hauteur) :
     carbonée (sombre), silicatée (grise-ocre), métallique, glacée
   - matériau standard + mappage triplanaire (sans coutures) + relief par dérivées écran
   Appliqué aux ceintures d'astéroïdes et aux lunes des systèmes générés.
   ===================================================================== */
(function(){
'use strict';
const AST = window.__AST = { ready:false };

/* ---------- bruits (JS) ---------- */
function hash3(x, y, z, s){ let h = (x*374761393 + y*668265263 + z*1274126177 + s*2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0)/4294967295; }
function vnoise3(x, y, z, s){
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx*fx*(3-2*fx), v = fy*fy*(3-2*fy), w = fz*fz*(3-2*fz);
  const L = (a,b,t) => a + (b-a)*t;
  return L(L(L(hash3(xi,yi,zi,s), hash3(xi+1,yi,zi,s), u), L(hash3(xi,yi+1,zi,s), hash3(xi+1,yi+1,zi,s), u), v),
           L(L(hash3(xi,yi,zi+1,s), hash3(xi+1,yi,zi+1,s), u), L(hash3(xi,yi+1,zi+1,s), hash3(xi+1,yi+1,zi+1,s), u), v), w);
}
function fbm3(x, y, z, s, oct){ let v = 0, a = .5, f = 1, n = 0; for(let i=0;i<oct;i++){ v += a*vnoise3(x*f, y*f, z*f, s+i*7); n += a; a *= .5; f *= 2.03; } return v/n; }
/* bruit 2D périodique (texture tuilable sans raccord) */
function tnoise(x, y, P, s){
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx*fx*(3-2*fx), v = fy*fy*(3-2*fy);
  const m = k => ((k % P) + P) % P;
  const a = hash3(m(xi), m(yi), 0, s), b = hash3(m(xi+1), m(yi), 0, s), c = hash3(m(xi), m(yi+1), 0, s), d = hash3(m(xi+1), m(yi+1), 0, s);
  return a + (b-a)*u + (c-a)*v + (a-b-c+d)*u*v;
}
function tfbm(x, y, P, s, oct){ let v = 0, a = .5, n = 0; for(let i=0;i<oct;i++){ v += a*tnoise(x, y, P, s+i*13); n += a; x *= 2; y *= 2; P *= 2; a *= .5; } return v/n; }
function prng(seed){ let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; }; }

/* ---------- icosphère indexée (normales lissées, pas de coutures) ---------- */
function icosphere(level){
  const t = (1 + Math.sqrt(5))/2;
  let V = [[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]].map(p => { const l = Math.hypot(...p); return p.map(c => c/l); });
  let F = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  for(let l=0;l<level;l++){
    const cache = new Map(), NF = [];
    const mid = (a,b) => { const k = a < b ? a+'_'+b : b+'_'+a; if(cache.has(k)) return cache.get(k);
      const p = V[a].map((c,i) => (c + V[b][i])/2), n = Math.hypot(...p); V.push(p.map(c => c/n)); cache.set(k, V.length-1); return V.length-1; };
    F.forEach(([a,b,c]) => { const ab = mid(a,b), bc = mid(b,c), ca = mid(c,a); NF.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]); });
    F = NF;
  }
  return { V, F };
}
/* roche : forme globale bosselée, ellipsoïde (sauf opts.round : lunes), cratères à rebord, stries */
function rockGeometry(seed, level, opts){
  opts = opts || {};
  const r = prng(seed), { V, F } = icosphere(level);
  let sx = .75 + .5*r(), sy = .65 + .45*r(), sz = .8 + .5*r();
  if(opts.round) sx = sy = sz = 1;   // lune ronde : l'aplatissement est réservé aux astéroïdes (tirages conservés : mêmes cratères)
  const craters = [];
  const nc = opts.craters !== undefined ? opts.craters : 9 + Math.floor(r()*9);
  for(let i=0;i<nc;i++){ const z = r()*2-1, a = r()*6.283, s = Math.sqrt(1-z*z); craters.push({ d:[Math.cos(a)*s, z, Math.sin(a)*s], rad: .12 + .38*Math.pow(r(), 2), depth: .06 + .1*r() }); }
  const amp = opts.amp !== undefined ? opts.amp : 1, lobe = opts.lobe ? { d:[r()*2-1, r()*2-1, r()*2-1] } : null;
  if(lobe){ const l = Math.hypot(...lobe.d); lobe.d = lobe.d.map(c => c/l); }
  const pos = new Float32Array(V.length*3);
  V.forEach((p, i) => {
    let h = 1 + amp*(.42*(fbm3(p[0]*1.1, p[1]*1.1, p[2]*1.1, seed, 3) - .5) + .16*(fbm3(p[0]*3.2, p[1]*3.2, p[2]*3.2, seed+50, 4) - .5));
    craters.forEach(c => {
      const cosA = p[0]*c.d[0] + p[1]*c.d[1] + p[2]*c.d[2], ang = Math.acos(Math.max(-1, Math.min(1, cosA))), x = ang/c.rad;
      if(x < 1) h -= c.depth*(1 - x*x)*amp;                       // cuvette
      h += c.depth*.35*Math.exp(-((x-1)/.22)*((x-1)/.22))*amp;     // rebord
    });
    if(lobe){ const k = p[0]*lobe.d[0] + p[1]*lobe.d[1] + p[2]*lobe.d[2]; h *= 1 - .22*Math.exp(-k*k*14); }  // étranglement (binaire de contact)
    pos[i*3] = p[0]*h*sx; pos[i*3+1] = p[1]*h*sy; pos[i*3+2] = p[2]*h*sz;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(F.flat());
  g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}

/* ---------- textures tuilables générées (albédo + hauteur) ---------- */
const FAMILIES = {
  carbonaceous: { a:[34,31,29], b:[62,56,50], c:[20,19,19], speck:[120,112,100], speckP:.004, rough:.97, metal:.02, cr:.55 },
  silicate:     { a:[112,98,82], b:[150,132,108], c:[78,64,52], speck:[190,176,150], speckP:.006, rough:.93, metal:.04, cr:.7 },
  metallic:     { a:[96,98,104], b:[140,142,148], c:[64,64,70], speck:[210,210,215], speckP:.012, rough:.62, metal:.55, cr:.45 },
  icy:          { a:[150,164,178], b:[206,220,232], c:[70,74,82], speck:[240,248,255], speckP:.008, rough:.55, metal:.02, cr:.6 }
};
function makeTextures(fam, seed, N){
  N = N || 512;
  const r = prng(seed), H = new Float32Array(N*N);
  const P0 = 6;
  for(let y=0;y<N;y++) for(let x=0;x<N;x++){
    const u = x/N*P0, v = y/N*P0;
    const base = tfbm(u, v, P0, seed, 6);
    const ridge = 1 - Math.abs(tfbm(u*1.7, v*1.7, P0*2, seed+91, 4)*2 - 1);
    H[y*N+x] = base*.75 + ridge*ridge*.25;
  }
  // cratères (repliés sur les bords pour rester tuilables)
  const nc = Math.floor(90*fam.cr);
  for(let i=0;i<nc;i++){
    const cx = r()*N, cy = r()*N, R = 3 + Math.pow(r(), 3)*N*.12, depth = .08 + .12*r(), ext = Math.ceil(R*1.6);
    for(let dy=-ext; dy<=ext; dy++) for(let dx=-ext; dx<=ext; dx++){
      const d = Math.hypot(dx, dy)/R; if(d > 1.6) continue;
      const xx = ((Math.floor(cx+dx) % N) + N) % N, yy = ((Math.floor(cy+dy) % N) + N) % N;
      let h = 0; if(d < 1) h -= depth*(1 - d*d); h += depth*.45*Math.exp(-((d-1)/.18)*((d-1)/.18));
      H[yy*N+xx] += h;
    }
  }
  let mn = Infinity, mx = -Infinity; for(let i=0;i<H.length;i++){ mn = Math.min(mn, H[i]); mx = Math.max(mx, H[i]); }
  const cA = document.createElement('canvas'), cH = document.createElement('canvas'); cA.width = cA.height = cH.width = cH.height = N;
  const xA = cA.getContext('2d'), xH = cH.getContext('2d'), iA = xA.createImageData(N, N), iH = xH.createImageData(N, N);
  for(let y=0;y<N;y++) for(let x=0;x<N;x++){
    const i = y*N + x, h = (H[i] - mn)/(mx - mn);
    const m = tfbm(x/N*3, y/N*3, 3, seed+333, 4);                    // taches minérales
    const hx = H[y*N + (x+1)%N] - H[i], hy = H[((y+1)%N)*N + x] - H[i];
    const slope = Math.min(1, Math.hypot(hx, hy)*40);
    let col = [0,1,2].map(k => fam.a[k] + (fam.b[k] - fam.a[k])*m);
    col = col.map((c,k) => c + (fam.c[k] - c)*Math.max(0, .55 - h)*1.2);   // creux plus sombres
    col = col.map(c => c*(1 - .25*slope));
    if(hash3(x, y, 7, seed) < fam.speckP) col = fam.speck.slice();
    const g = .9 + .2*hash3(x, y, 3, seed);
    iA.data[i*4] = Math.min(255, col[0]*g); iA.data[i*4+1] = Math.min(255, col[1]*g); iA.data[i*4+2] = Math.min(255, col[2]*g); iA.data[i*4+3] = 255;
    const hv = Math.round(h*255); iH.data[i*4] = iH.data[i*4+1] = iH.data[i*4+2] = hv; iH.data[i*4+3] = 255;
  }
  xA.putImageData(iA, 0, 0); xH.putImageData(iH, 0, 0);
  const tA = new THREE.CanvasTexture(cA), tH = new THREE.CanvasTexture(cH);
  [tA, tH].forEach(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; });
  return { albedo: tA, height: tH };
}

/* ---------- matériau : triplanaire + relief ---------- */
const TRI_VERT_PARS = `varying vec3 vAstObj; varying vec3 vAstN; varying float vAstScale;`;
const TRI_VERT = `
  vAstObj = position; vAstN = normal;
  #ifdef USE_INSTANCING
    vAstScale = length(instanceMatrix[0].xyz) * length(modelMatrix[0].xyz);
  #else
    vAstScale = length(modelMatrix[0].xyz);
  #endif`;
const TRI_FRAG_PARS = `
varying vec3 vAstObj; varying vec3 vAstN; varying float vAstScale;
uniform sampler2D tAstAlb; uniform sampler2D tAstH; uniform float uAstScale; uniform float uAstBump; uniform vec3 uAstTint;
vec3 astW(){ vec3 w = pow(abs(normalize(vAstN)), vec3(4.0)); return w/(w.x + w.y + w.z); }
vec3 astTex(sampler2D t, vec3 p, vec3 w){ return texture2D(t, p.yz).rgb*w.x + texture2D(t, p.xz + 0.37).rgb*w.y + texture2D(t, p.xy + 0.71).rgb*w.z; }
float astHt(vec3 p, vec3 w){ return astTex(tAstH, p, w).r + 0.35*astTex(tAstH, p*4.3 + 0.5, w).r; }
vec3 astAlbedo(){
  vec3 w = astW(), p = vAstObj*uAstScale;
  vec3 c = astTex(tAstAlb, p, w);
  vec3 c2 = astTex(tAstAlb, p*4.3 + 0.5, w);
  c = c*(0.72 + 0.56*c2.g/max(0.05, (c2.r + c2.g + c2.b)/3.0 + 0.2));
  return pow(c, vec3(2.2)) * uAstTint;                     // sRGB → linéaire (sortie du moteur en sRGB)
}
vec3 astPerturb(vec3 surf_pos, vec3 surf_norm){
  vec3 w = astW(), p = vAstObj*uAstScale;
  vec3 dpx = dFdx(p), dpy = dFdy(p);
  float Hc = astHt(p, w);
  float k = uAstBump*vAstScale;
  float dBx = (astHt(p + dpx, w) - Hc)*k, dBy = (astHt(p + dpy, w) - Hc)*k;
  vec3 sX = dFdx(surf_pos), sY = dFdy(surf_pos);
  vec3 R1 = cross(sY, surf_norm), R2 = cross(surf_norm, sX);
  float det = dot(sX, R1);
  vec3 grad = sign(det)*(dBx*R1 + dBy*R2);
  return normalize(abs(det)*surf_norm - grad);
}`;
function makeMaterial(fam, tex){
  const m = new THREE.MeshStandardMaterial({ color:0xffffff, roughness:fam.rough, metalness:fam.metal });
  m.extensions = { derivatives:true };
  m.userData.astShared = true;
  m.onBeforeCompile = sh => {
    sh.uniforms.tAstAlb = { value: tex.albedo }; sh.uniforms.tAstH = { value: tex.height };
    sh.uniforms.uAstScale = { value: .85 }; sh.uniforms.uAstBump = { value: .06 }; sh.uniforms.uAstTint = { value: new THREE.Color(1.25,1.25,1.25) };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + TRI_VERT_PARS).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + TRI_VERT);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + TRI_FRAG_PARS)
      .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= astAlbedo();')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  normal = astPerturb(-vViewPosition, normal);');
  };
  m.customProgramCacheKey = () => 'ast-triplanar';
  return m;
}

/* ---------- génération au démarrage ---------- */
AST.init = function(seedStr){
  let s = 0; for(let i=0;i<seedStr.length;i++) s = (s*31 + seedStr.charCodeAt(i)) | 0;
  const t0 = performance.now();
  AST.geos = [];
  for(let i=0;i<5;i++) AST.geos.push(rockGeometry((s + i*7919) >>> 0, 3, { lobe: i === 3 }));
  AST.moonGeo = rockGeometry((s + 424242) >>> 0, 4, { amp: .18, craters: 26, round: true });
  AST.fam = Object.keys(FAMILIES);
  AST.mats = {};
  AST.fam.forEach((k, i) => { const tex = makeTextures(FAMILIES[k], (s + i*104729) >>> 0, 512); AST.mats[k] = makeMaterial(FAMILIES[k], tex); });
  AST.ready = true;
  return { ms: Math.round(performance.now() - t0) };
};

/* ---------- application à un système construit par le moteur ---------- */
AST.apply = function(leg){
  if(!AST.ready || !leg.group) return;
  const r = prng((leg.cell.split(',').reduce((a,c) => a*131 + (+c), 7)) >>> 0);
  // composition de la ceinture : deux familles dominantes
  const famA = AST.fam[Math.floor(r()*AST.fam.length)], famB = AST.fam[Math.floor(r()*AST.fam.length)];
  leg.group.traverse(o => {
    if(o.isInstancedMesh && o.material === ASTEROID_MAT){
      const idx = ASTEROID_TEMPLATES.indexOf(o.geometry);
      o.geometry = AST.geos[Math.max(0, idx) % AST.geos.length];
      o.material = AST.mats[idx % 2 ? famB : famA];
      o.frustumCulled = false;                           // les instances s'étendent bien au-delà du gabarit
      o.userData.astShared = true;
    }
  });
  // lunes : sphères lisses → roches cratérisées texturées
  (leg.planets || []).forEach(p => (p.moonPivots || []).forEach(pv => pv.children.forEach(m => {
    if(!m.isMesh || m.userData.astShared) return;
    const rad = m.geometry.parameters && m.geometry.parameters.radius || 1;
    m.geometry.dispose(); m.material.dispose();
    m.geometry = AST.moonGeo; m.scale.setScalar(rad);
    m.material = AST.mats[AST.fam[Math.floor(r()*AST.fam.length)]];
    m.userData.astShared = true;
  })));
};
/* avant libération d'un système : on détache ce qui est partagé pour ne pas le détruire */
AST.detachShared = function(group){
  const list = []; group.traverse(o => { if(o.userData && (o.userData.astShared || o.userData.auroraGeoShared)) list.push(o); });
  list.forEach(o => { if(o.userData.auroraGeoShared && o.material) o.material.dispose(); });
  list.forEach(o => o.parent && o.parent.remove(o));
};
AST.rockTemplates = () => AST.geos;
/* amas local de la ceinture (échelle réelle) : un astéroïde principal et ses fragments, repère local → précision float32 préservée */
AST.cluster = function(seed, Rmain){
  if(!AST.ready) return null;
  const r = prng(seed >>> 0), g = new THREE.Group();
  const famA = AST.fam[Math.floor(r()*AST.fam.length)], famB = AST.fam[Math.floor(r()*AST.fam.length)];
  const rocks = [];
  const add = (rad, pos, fam) => {
    const m = new THREE.Mesh(AST.geos[Math.floor(r()*AST.geos.length)], AST.mats[fam]);
    m.scale.set(rad*(.8 + .4*r()), rad*(.7 + .3*r()), rad*(.8 + .4*r())); m.rotation.set(r()*6.28, r()*6.28, r()*6.28); m.position.copy(pos);
    g.add(m); rocks.push({ mesh: m, r: rad });
  };
  add(Rmain, new THREE.Vector3(), famA);
  const n = 14 + Math.floor(r()*12);
  for(let i=0;i<n;i++){
    const z = r()*2 - 1, a = r()*Math.PI*2, s = Math.sqrt(1 - z*z), d = Rmain*(2.4 + 10*Math.pow(r(), .8));
    add(Rmain*(.015 + .22*Math.pow(r(), 2.6)), new THREE.Vector3(Math.cos(a)*s*d, z*d*.35, Math.sin(a)*s*d), r() < .7 ? famA : famB);
  }
  g.userData.astShared = true;               // géométries et matériaux partagés : jamais détruits avec le système
  return { group: g, rocks, Rmain };
};
})();
