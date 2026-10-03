/* =========================================================================
   5. LES VAISSEAUX — GÉNÉRATEUR (v2.13)
   Le vaisseau unique d'origine est remplacé par le générateur de l'étude
   « Construction générative des vaisseaux cargo » : dix modèles, familles
   entrepôt / poutre / citernier / pousseurs / paquebot / cargo léger, moteur
   Epstein sur tous, anneaux de distorsion (saut quantique) réservés aux
   long-courriers. Le générateur vit dans son propre espace de noms (SHIPGEN)
   pour ne rien partager par accident avec le reste du jeu ; installShip()
   raccorde ensuite le modèle choisi aux systèmes existants.
   ========================================================================= */
const SHIPGEN = (function(){
const U = 6, V3 = THREE.Vector3;
let FLARE_K = 1, RCS_PODS = [], ANT_TIPS = [];
const NAV = { green:new THREE.MeshBasicMaterial({ color:0x2ee66b, transparent:true }),
              red:  new THREE.MeshBasicMaterial({ color:0xe0402e, transparent:true }),
              white:new THREE.MeshBasicMaterial({ color:0xf2f2f2, transparent:true }) };
const OCT_R = 1/Math.cos(Math.PI/8);   // rayon circonscrit / apothème d'un octogone
const REG = 0.2929;                     // chanfrein d'un octogone régulier, en fraction du côté du carré

function rngFactory(seed){ let a = seed>>>0; return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let RND = rngFactory(1);

/* ---------- textures procédurales, partagées par tous les vaisseaux ---------- */
function makeHullTexture(){
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
  const r = rngFactory(7);
  x.fillStyle = '#c3c8cf'; x.fillRect(0,0,512,512);
  function panel(x0,y0,w,h,d){
    if(d>0 && (w>70 || h>70) && r()<0.88){
      if(w>h){ const s = Math.round(w*(0.3+r()*0.4)); panel(x0,y0,s,h,d-1); panel(x0+s,y0,w-s,h,d-1); }
      else   { const s = Math.round(h*(0.3+r()*0.4)); panel(x0,y0,w,s,d-1); panel(x0,y0+s,w,h-s,d-1); }
      return;
    }
    const t = 186 + Math.floor(r()*34);
    x.fillStyle = 'rgb('+t+','+(t+3)+','+(t+8)+')'; x.fillRect(x0+1,y0+1,w-2,h-2);
    x.strokeStyle = 'rgba(38,43,52,0.6)'; x.lineWidth = 2; x.strokeRect(x0+1,y0+1,w-2,h-2);
    if(r()<0.16){ x.strokeStyle='rgba(38,43,52,0.35)'; x.lineWidth=1; x.strokeRect(x0+w*0.3,y0+h*0.3,w*0.4,h*0.4); }
    if(r()<0.3){ x.fillStyle='rgba(55,60,70,0.45)'; for(let i=7;i<w-7;i+=11){ x.fillRect(x0+i,y0+4,2,2); x.fillRect(x0+i,y0+h-6,2,2); } }
  }
  panel(0,0,512,512,7);
  for(let i=0;i<320;i++){ x.fillStyle='rgba(28,32,38,'+(r()*0.07)+')'; const s=4+r()*30; x.fillRect(r()*512, r()*512, s, s*0.35); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
function makeStripeTexture(){
  const c = document.createElement('canvas'); c.width = 128; c.height = 32; const x = c.getContext('2d');
  x.fillStyle = '#1c1e22'; x.fillRect(0,0,128,32); x.fillStyle = '#e3ae3c';
  for(let i=-32;i<160;i+=32){ x.beginPath(); x.moveTo(i,32); x.lineTo(i+16,32); x.lineTo(i+32,0); x.lineTo(i+16,0); x.closePath(); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function makeCorrTexture(){
  const c = document.createElement('canvas'); c.width = 64; c.height = 8; const x = c.getContext('2d');
  const g = x.createLinearGradient(0,0,64,0);
  for(let i=0;i<=8;i++){ g.addColorStop(i/8, i%2 ? '#8d8d8d' : '#ffffff'); }
  x.fillStyle = g; x.fillRect(0,0,64,8);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5,1); return t;
}
function makeRadTexture(){
  const c = document.createElement('canvas'); c.width = 16; c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#3a4352'; x.fillRect(0,0,16,256);
  x.fillStyle = '#1d222b'; for(let i=0;i<256;i+=16) x.fillRect(0,i,16,5);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const HULL_TEX = makeHullTexture(), STRIPE_TEX = makeStripeTexture(), CORR_TEX = makeCorrTexture(), RAD_TEX = makeRadTexture();
const TANK_TEX = HULL_TEX.clone(); TANK_TEX.needsUpdate = true; TANK_TEX.repeat.set(5, 3);
const SHARED_TEX = new Set([HULL_TEX, STRIPE_TEX, CORR_TEX, RAD_TEX, TANK_TEX]);

/* ---------- matériaux ---------- */
function hullMat(hex, o){ o = o || {};
  return new THREE.MeshStandardMaterial({ color:hex, map:HULL_TEX, bumpMap:HULL_TEX, bumpScale:o.bump!==undefined?o.bump:0.035,
    metalness:o.metal!==undefined?o.metal:0.35, roughness:o.rough!==undefined?o.rough:0.72, flatShading:true }); }
function plainMat(hex, o){ o = o || {};
  return new THREE.MeshStandardMaterial({ color:hex, metalness:o.metal!==undefined?o.metal:0.5, roughness:o.rough!==undefined?o.rough:0.55,
    emissive:o.emissive||0x000000, emissiveIntensity:o.ei||0, flatShading:true, side:o.side||THREE.FrontSide }); }
function materialsFor(M){
  return {
    hull: hullMat(0xe2e6eb), mid: hullMat(0xa4acb6), livery: hullMat(M.livery, {bump:0.02}),
    dark: plainMat(0x2f343b, {metal:0.55, rough:0.55}),
    bell: plainMat(0x2b3036, {metal:0.8, rough:0.35, emissive:0x3a7fb8, ei:0.18, side:THREE.DoubleSide}),
    noz:  plainMat(0x555b64, {metal:0.7, rough:0.4, side:THREE.DoubleSide}),
    rad:  new THREE.MeshStandardMaterial({ color:0xffffff, map:RAD_TEX, metalness:0.4, roughness:0.55, flatShading:true }),
    win:  new THREE.MeshBasicMaterial({ color:0x9ad4ff }),
    stripe: new THREE.MeshStandardMaterial({ map:STRIPE_TEX, roughness:0.7, metalness:0.1 }),
    cargo: {}, band: plainMat(0x1c1f24, {metal:0.6, rough:0.45})
  };
}

/* ---------- géométrie ---------- */
/* UV « par face dominante », en unités monde : une seule texture de plaquage
   répétée à la même échelle sur toutes les pièces, quelle que soit leur taille. */
function panelUV(geo, s){
  s = s || 7;
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position, uv = new Float32Array(p.count*2);
  const a = new V3(), b = new V3(), c = new V3(), e1 = new V3(), e2 = new V3(), n = new V3();
  for(let i=0;i<p.count;i+=3){
    a.fromBufferAttribute(p,i); b.fromBufferAttribute(p,i+1); c.fromBufferAttribute(p,i+2);
    n.crossVectors(e1.subVectors(b,a), e2.subVectors(c,a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    [a,b,c].forEach(function(v,k){
      let u, w;
      if(ax>=ay && ax>=az){ u=v.z; w=v.y; } else if(ay>=az){ u=v.x; w=v.z; } else { u=v.x; w=v.y; }
      uv[(i+k)*2] = u/s; uv[(i+k)*2+1] = w/s;
    });
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.computeVertexNormals();
  return g;
}
function mesh(geo, mat){ return new THREE.Mesh(geo, mat); }
function octShape(w, h, cx, cy){
  const s = new THREE.Shape(), hw = w/2, hh = h/2;
  s.moveTo(-hw+cx,-hh); s.lineTo(hw-cx,-hh); s.lineTo(hw,-hh+cy); s.lineTo(hw,hh-cy);
  s.lineTo(hw-cx,hh); s.lineTo(-hw+cx,hh); s.lineTo(-hw,hh-cy); s.lineTo(-hw,-hh+cy); s.closePath();
  return s;
}
/* prisme octogonal EXACT (pas de biseau qui déborde) : x ∈ ±w/2, y ∈ ±h/2, z ∈ ±l/2 */
function octBox(w, h, l, mat, ch){
  ch = ch===undefined ? REG : ch;
  const g = new THREE.ExtrudeGeometry(octShape(w, h, w*ch, h*ch), { depth:l, bevelEnabled:false, curveSegments:1 });
  g.translate(0, 0, -l/2);
  return mesh(panelUV(g), mat);
}
function boxM(w, h, l, mat){ return mesh(panelUV(new THREE.BoxGeometry(w, h, l)), mat); }
/* profil de révolution le long de +Z (de 0 à la longueur du profil) ; faces centrées sur les axes */
function lathe(profile, seg, mat, ys){
  const g = new THREE.LatheGeometry(profile.map(function(q){ return new THREE.Vector2(q[0], q[1]); }), seg, Math.PI/seg, Math.PI*2);
  g.rotateX(Math.PI/2);
  if(ys && ys !== 1) g.scale(1, ys, 1);
  return mesh(panelUV(g), mat);
}
function octLathe(profile, mat, ys){ return lathe(profile.map(function(q){ return [q[0]*OCT_R, q[1]]; }), 8, mat, ys); }
function prism(r, len, seg, mat){ const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false, Math.PI/seg); g.rotateX(Math.PI/2); return mesh(panelUV(g), mat); }
function strut(parent, pA, pB, r, mat){
  const dir = new V3().subVectors(pB, pA), len = dir.length(); if(len < 1e-4) return;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), mat);
  m.position.copy(pA).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new V3(0,1,0), dir.normalize());
  parent.add(m);
}
function makeEngineBell(throatR, exitR, length, mat){
  const pr = [[throatR*0.55,0],[throatR,length*0.12],[throatR*0.82,length*0.3],[exitR*0.55,length*0.72],[exitR,length]];
  return lathe(pr, 16, mat);
}

/* ---------- peinture : nom du vaisseau ---------- */
function makeLabel(name, reg){
  const H = 192, big = '800 104px "JetBrains Mono", ui-monospace, monospace', small = '500 42px "JetBrains Mono", ui-monospace, monospace';
  const m = document.createElement('canvas').getContext('2d');
  m.font = big; const w1 = m.measureText(name.toUpperCase()).width; m.font = small; const w2 = m.measureText(reg).width;
  const c = document.createElement('canvas'); c.width = Math.ceil(Math.max(w1, w2) + 40); c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#20252d'; x.textBaseline = 'alphabetic';
  x.font = big; x.fillText(name.toUpperCase(), 16, 110);
  x.font = small; x.globalAlpha = 0.8; x.fillText(reg, 20, 170);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
  return { aspect: c.width/H, mat: new THREE.MeshStandardMaterial({ map:t, transparent:true, alphaTest:0.25, roughness:0.8, metalness:0.1 }) };
}

/* ======================================================================
   SHADER EPSTEIN DRIVE (repris tel quel de la démo dédiée)
   ====================================================================== */
const DRIVE_U = {
  uTime:     { value: 3.7 },
  uThrottle: { value: 1.0 },
  uDiamonds: { value: 7.0 },
  uCore:     { value: new THREE.Color(0.93, 0.97, 1.00) },
  uSheath:   { value: new THREE.Color(0.28, 0.55, 1.00) },
  uHaze:     { value: new THREE.Color(0.52, 0.36, 1.00) }
};
const DRIVE_LIGHTS = [];

const NOISE_GLSL = `
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  float a = hash(i); float b = hash(i + vec2(1.0,0.0));
  float c = hash(i + vec2(0.0,1.0)); float d = hash(i + vec2(1.0,1.0));
  vec2 u = f*f*(3.0 - 2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){ float v = 0.0; float a = 0.5; for(int i = 0; i < 4; i++){ v += a*vnoise(p); p *= 2.03; a *= 0.5; } return v; }
`;

const PLUME_VS = `
uniform float uLength; uniform float uRadius; uniform float uThrottle;
varying float vAxial; varying float vRadial; varying float vEndOn;
void main(){
  vec3 origin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 axisW  = (modelMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz;   // axe de poussée = +Z local (vers l'arrière)
  float sc = length(axisW);
  vec3 axis = axisW / sc;
  float L = uLength * (0.35 + 0.65*uThrottle) * sc;           // le jet s'allonge avec la poussée
  vec3 toCam = normalize(cameraPosition - (origin + axis*L*0.5));
  vec3 side = cross(axis, toCam);
  float sl = length(side);
  side = sl > 1e-4 ? side/sl : normalize(cross(axis, vec3(0.0, 1.0, 0.0)));
  vAxial  = uv.y;                  // 0 = sortie de tuyère, 1 = extrémité du jet
  vRadial = uv.x*2.0 - 1.0;        // -1..1 en travers du jet
  vEndOn  = abs(dot(axis, normalize(cameraPosition - origin)));
  vec3 wp = origin + axis*(uv.y*L) + side*(vRadial*uRadius*sc);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const PLUME_FS = `
precision highp float;
uniform float uTime; uniform float uThrottle; uniform float uDiamonds; uniform float uSeed; uniform float uGain;
uniform vec3 uCore; uniform vec3 uSheath; uniform vec3 uHaze;
varying float vAxial; varying float vRadial; varying float vEndOn;
${NOISE_GLSL}
void main(){
  float z = vAxial; float x = vRadial;
  float t = uTime + uSeed*13.7;
  // turbulence qui s'écoule vers l'arrière (deux échelles)
  float n  = fbm(vec2(x*5.0  + uSeed*3.1, z*12.0 - t*7.0));
  float n2 = fbm(vec2(x*13.0 - uSeed*1.7, z*28.0 - t*15.0));
  float xw = x + (n - 0.5)*0.05*z;                     // léger flottement latéral, nul à la tuyère
  // largeurs : jet très collimaté (cœur quasi constant), gaine qui s'évase doucement
  float wCore   = mix(0.10, 0.15, z);
  float wSheath = mix(0.26, 0.60, pow(z, 0.8));
  // diamants de choc : losanges lumineux régulièrement espacés sur l'axe ;
  // entre deux noeuds le coeur s'assombrit (structure en chapelet du jet)
  float cell = z*uDiamonds;
  float u = fract(cell + 0.5) - 0.5;
  float dOn = step(0.5, uDiamonds) * smoothstep(0.4, 0.8, cell);
  float nodeA = (1.0 - abs(u)*2.0); nodeA *= nodeA;
  float a = xw/wCore;
  float core = exp(-a*a) * exp(-z*1.8) * (1.0 - dOn*0.55*(1.0 - nodeA)*exp(-z*1.2));
  float m = abs(u)*1.8 + abs(xw)/(wCore*2.4);
  float diamond = pow(clamp(1.0 - m, 0.0, 1.0), 1.5) * exp(-z*2.6) * dOn;
  // gaine et halo naissent progressivement à la sortie de tuyère (le gaz se détend) : pas de « mur » lumineux
  float b = xw/wSheath;            float sheath = exp(-b*b) * exp(-z*1.15) * (0.55 + 0.45*n) * smoothstep(0.0, 0.05, z);
  float c = xw/(wSheath*2.1);      float haze   = exp(-c*c) * exp(-z*2.2) * (0.6 + 0.4*n2) * smoothstep(0.0, 0.10, z);
  float d = xw/0.22;               float hot    = exp(-z*22.0) * exp(-d*d);
  float flick = 0.9 + 0.1*vnoise(vec2(t*21.0, uSeed*5.0));
  vec3 col = uHaze*haze*0.16 + uSheath*sheath*0.45 + uCore*(core*1.5 + diamond*1.8 + hot*2.6);
  float fade = (1.0 - smoothstep(0.5, 1.0, z)) * smoothstep(0.0, 0.02, z) * (1.0 - smoothstep(0.82, 1.0, abs(x)));
  fade *= 1.0 - smoothstep(0.80, 0.985, vEndOn);       // vu dans l'axe : le flare prend le relais
  col *= flick * uThrottle * uGain * fade;
  col = vec3(1.0) - exp(-col*1.3);                     // tonemapping : cœur saturé au blanc, gaine qui reste bleue
  gl_FragColor = vec4(col, 1.0);
}`;

const FLARE_VS = `
uniform float uSize; uniform float uThrottle;
varying vec2 vUv; varying float vFacing;
void main(){
  vUv = uv;
  vec3 origin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 axis = normalize((modelMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
  vFacing = max(dot(axis, normalize(cameraPosition - origin)), 0.0);   // 1 = on regarde dans la tuyère
  float s = uSize * (0.55 + 1.6*pow(vFacing, 4.0)) * (0.4 + 0.6*uThrottle);
  vec4 mv = viewMatrix * vec4(origin, 1.0);
  mv.xy += position.xy * s;
  gl_Position = projectionMatrix * mv;
}`;

const FLARE_FS = `
precision highp float;
uniform float uTime; uniform float uThrottle; uniform float uSeed; uniform float uGain;
uniform vec3 uCore; uniform vec3 uSheath;
varying vec2 vUv; varying float vFacing;
${NOISE_GLSL}
void main(){
  vec2 p = (vUv - 0.5)*vec2(8.0, 2.0);                 // quad 4:1 -> repère isotrope
  float r2 = dot(p, p);
  float core   = exp(-r2*18.0)*2.6;
  float glow   = exp(-r2*2.2)*0.55;
  float streak = exp(-p.y*p.y*90.0) * exp(-abs(p.x)*0.8) * (0.25 + 1.1*vFacing);   // traînée anamorphique
  float rr = sqrt(r2) - 0.75;
  float ring   = exp(-rr*rr*81.0) * 0.08 * vFacing;
  float flick  = 0.9 + 0.1*vnoise(vec2((uTime + uSeed*9.1)*19.0, 3.3));
  vec3 col = uCore*core + uSheath*(glow + ring) + mix(uSheath, vec3(1.0), 0.35)*streak;
  col *= flick * uThrottle * uGain;
  col *= (1.0 - smoothstep(3.0, 4.0, abs(p.x))) * (1.0 - smoothstep(0.75, 1.0, abs(p.y)));
  col = vec3(1.0) - exp(-col*1.5);
  gl_FragColor = vec4(col, 1.0);
}`;

/* une tuyère = un groupe placé à la SORTIE de la tuyère, axe +Z vers l'arrière */
function addEpsteinDrive(parent, x, y, z, exitR, length, seed, gain){
  gain = gain || 1.0;
  const g = new THREE.Group(); g.position.set(x, y, z);
  const plumeMat = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, DRIVE_U, { uSeed:{value:seed}, uGain:{value:gain}, uLength:{value:length}, uRadius:{value:exitR*3.4} }),
    vertexShader: PLUME_VS, fragmentShader: PLUME_FS,
    transparent:true, depthWrite:false, side:THREE.DoubleSide, blending:THREE.AdditiveBlending
  });
  const plume = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), plumeMat);
  plume.frustumCulled = false; plume.renderOrder = 10; plume.userData.noFrame = true;
  g.add(plume);
  const flareMat = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, DRIVE_U, { uSeed:{value:seed}, uGain:{value:gain}, uSize:{value:exitR*2.4*FLARE_K} }),
    vertexShader: FLARE_VS, fragmentShader: FLARE_FS,
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending
  });
  const flare = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), flareMat);
  flare.frustumCulled = false; flare.renderOrder = 11; flare.userData.noFrame = true; flare.userData.isFlare = true;
  g.add(flare);
  parent.add(g);
}
/* UNE lumière dynamique par vaisseau (pas par tuyère) : le jet éclaire la
   poupe, comme dans la série, pour un coût maîtrisé */
function addDriveLight(parent, x, y, z, range){
  const l = new THREE.PointLight(0x9fd0ff, 2.0, range, 2);
  l.position.set(x, y, z); parent.add(l); DRIVE_LIGHTS.push(l);
}
function setDrive(p){
  if(p.time !== undefined) DRIVE_U.uTime.value = p.time;
  if(p.throttle !== undefined){ DRIVE_U.uThrottle.value = p.throttle; }
  if(p.diamonds !== undefined) DRIVE_U.uDiamonds.value = p.diamonds;
  DRIVE_LIGHTS.forEach(l => { l.intensity = 2.0*DRIVE_U.uThrottle.value; });
}


/* ======================================================================
   PROPULSION SUPRALUMINIQUE (distorsion de l'espace, principe d'Alcubierre)
   Anneaux de distorsion autour de la poupe (bobines à impulsions animées),
   bulle de distorsion en shader de bord (fresnel + ondulations), et petits
   propulseurs ioniques pour la manœuvre à la place des tuyères Epstein.
   ====================================================================== */
const PROP = 'epstein';   // les tuyères Epstein restent sur tous les vaisseaux ; les anneaux s'y ajoutent (M.ftl)
const FTL_U = { uTime:{ value:0 }, uField:{ value:0 }, uPhase:{ value:0 } };
const QUAD_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }';
const COIL_FS = `precision highp float; uniform float uPhase; uniform float uField; varying vec2 vUv;
void main(){
  float p  = pow(fract(vUv.x*6.0 - uPhase), 10.0);
  float p2 = pow(fract(vUv.x*6.0 - uPhase + 0.5), 10.0)*0.5;
  vec3 col = vec3(0.45, 0.7, 1.0)*(0.22 + uField*(0.8 + 2.6*(p + p2)));
  col = vec3(1.0) - exp(-col*1.3); gl_FragColor = vec4(col, 1.0);
}`;
const ION_FS = `precision highp float; uniform float uField; varying vec2 vUv;
void main(){
  float k = clamp(1.0 - length(vUv - 0.5)*2.0, 0.0, 1.0);
  vec3 col = vec3(0.5, 0.75, 1.0)*(pow(k, 4.0)*2.2 + pow(k, 1.5)*0.4)*(0.35 + 0.65*uField);
  col = vec3(1.0) - exp(-col*1.4); gl_FragColor = vec4(col, 1.0);
}`;
const BUBBLE_VS = `varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix*mv; }`;
const BUBBLE_FS = `precision highp float; uniform float uTime; uniform float uField; varying vec3 vN; varying vec3 vV; varying vec3 vP;
${NOISE_GLSL}
void main(){
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float rim = pow(f, 2.6);
  float n = fbm(vec2(vP.z*3.0 - uTime*0.5, atan(vP.y, vP.x)*1.6 + uTime*0.15));
  float rip = 0.6 + 0.4*sin(vP.z*14.0 - uTime*2.4 + n*5.0);
  vec3 col = mix(vec3(0.35, 0.55, 1.0), vec3(0.62, 0.4, 1.0), f)*rim*(0.5 + 0.7*n)*rip*uField*0.9;
  col = vec3(1.0) - exp(-col*1.4); gl_FragColor = vec4(col, 1.0);
}`;
/* rayon libre autour de l'axe, à une cote z donnée (tout ce qui s'y trouve : coque, radiateurs, nacelles…) */
function clearanceAt(g, z, w){
  let m = 0; g.updateMatrixWorld(true);
  g.traverse(function(c){
    if(!c.isMesh || c.userData.noFrame) return;
    if(!c.geometry.boundingBox) c.geometry.computeBoundingBox();
    const b = c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld);
    if(b.max.z < z - w || b.min.z > z + w) return;
    m = Math.max(m, Math.hypot(Math.max(Math.abs(b.min.x), Math.abs(b.max.x)), Math.max(Math.abs(b.min.y), Math.abs(b.max.y))));
  });
  return m;
}
function addWarpDrive(g){
  const rc = g.userData.reactor; if(!rc) return;
  const box0 = frameBox(g), len = box0.max.z - box0.min.z;
  const zs = len > 110 ? [rc.z0 + rc.len*0.15, rc.z0 + rc.len*0.85] : [rc.z0 + rc.len*0.5];
  const tube = U*0.38;
  let rMax = 0; zs.forEach(function(z){ rMax = Math.max(rMax, clearanceAt(g, z, tube*2)); });
  const R = rMax + tube*1.4 + U*0.3;
  const ringMat = hullMat(0x7d8792, {metal:0.5}), nodeMat = plainMat(0x2f343b, {metal:0.6});
  const coilMat = new THREE.ShaderMaterial({ uniforms:FTL_U, vertexShader:QUAD_VS, fragmentShader:COIL_FS });
  zs.forEach(function(z){
    const ring = mesh(panelUV(new THREE.TorusGeometry(R, tube, 8, 96)), ringMat); ring.position.z = z; g.add(ring);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(R - tube*0.95, tube*0.32, 8, 96), coilMat); coil.position.z = z; g.add(coil);
    [45, 135, 225, 315].forEach(function(d){
      const a = d*Math.PI/180, c = Math.cos(a), sn = Math.sin(a);
      strut(g, new V3(c*rc.apo, sn*rc.apo, z), new V3(c*(R - tube*0.8), sn*(R - tube*0.8), z), U*0.16, nodeMat);
      const node = boxM(U*0.75, U*0.75, tube*2.6, nodeMat); node.position.set(c*R, sn*R, z); node.rotation.z = a; g.add(node);
    });
  });
  S.rings = zs.length;
  const b = frameBox(g), cc = b.getCenter(new V3()), sz = b.getSize(new V3());
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.ShaderMaterial({ uniforms:FTL_U, vertexShader:BUBBLE_VS, fragmentShader:BUBBLE_FS,
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending }));
  bubble.scale.set(sz.x*0.62, sz.y*0.66, sz.z*0.6); bubble.position.copy(cc); bubble.userData.noFrame = true; bubble.renderOrder = 12; g.add(bubble);
}
/* GÉNÉRATEUR DE SAUT QUANTIQUE (v2.15) — matériel distinct des anneaux de
   distorsion : les anneaux donnent la croisière supraluminique, le
   générateur donne le saut (téléportation). Cœur lumineux dans une cage
   icosaédrique, sur un pylône dorsal au milieu du réacteur (entre les
   pylônes diagonaux des anneaux et au-dessus des radiateurs). */
const JUMP_U = { uTime:FTL_U.uTime, uCharge:{ value:0 } };
const CORE_FS = `precision highp float; uniform float uTime; uniform float uCharge; varying vec3 vN; varying vec3 vV; varying vec3 vP;
${NOISE_GLSL}
void main(){
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float n = fbm(vec2(atan(vP.y, vP.x)*2.0 + uTime*0.6, vP.z*4.0 - uTime*0.9));
  float pulse = 0.5 + 0.5*sin(uTime*(2.0 + 10.0*uCharge));
  float k = 0.35 + 0.25*n + 0.2*pulse*(0.3 + uCharge) + 1.2*uCharge;
  vec3 col = mix(vec3(0.25, 0.12, 0.55), vec3(0.78, 0.62, 1.0), clamp(k - 0.3, 0.0, 1.0))*(0.6 + k) + vec3(1.0)*pow(f, 2.0)*0.3*(0.3 + uCharge);
  col = vec3(1.0) - exp(-col*1.2); gl_FragColor = vec4(col, 1.0);
}`;
const HALO_FS = `precision highp float; uniform float uCharge; varying vec3 vN; varying vec3 vV;
void main(){
  float c = abs(dot(normalize(vN), normalize(vV)));
  vec3 col = vec3(0.55, 0.4, 1.0)*pow(c, 2.5)*(0.12 + 1.4*uCharge);
  col = vec3(1.0) - exp(-col*1.3); gl_FragColor = vec4(col, 1.0);
}`;
function addJumpCore(g){
  const rc = g.userData.reactor; if(!rc) return;
  const dark = plainMat(0x2f343b, {metal:0.6, rough:0.5});
  const r = rc.apo*0.85, zc = rc.z0 + rc.len*0.5, y0 = rc.apo, yc = y0 + U*0.45 + r*1.25;
  strut(g, new V3(0, y0, zc), new V3(0, yc - r*1.05, zc), U*0.14, dark);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r*0.55, r*0.7, U*0.25, 10), dark); base.position.set(0, y0 + U*0.12, zc); g.add(base);
  const cage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(r*1.25, 1)), new THREE.LineBasicMaterial({ color:0xb8c2cc }));
  cage.position.set(0, yc, zc); g.add(cage);
  const core = new THREE.Mesh(new THREE.SphereGeometry(r*0.8, 24, 16), new THREE.ShaderMaterial({ uniforms:JUMP_U, vertexShader:BUBBLE_VS, fragmentShader:CORE_FS }));
  core.position.set(0, yc, zc); g.add(core);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(r*1.7, 24, 16), new THREE.ShaderMaterial({ uniforms:JUMP_U, vertexShader:BUBBLE_VS, fragmentShader:HALO_FS,
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending }));
  halo.position.set(0, yc, zc); halo.userData.noFrame = true; halo.renderOrder = 12; g.add(halo);
  S.jumpCore = 1;
}

/* ---------- statistiques du vaisseau en cours de construction ---------- */
let S = null;
function newStats(){ return { engines:0, pdc:0, containers:0, cabins:0, radiators:0, tanks:0, rings:0, jumpCore:0 }; }

/* ---------- pièces d'équipement ---------- */
function addNavLight(g, hex, x, y, z){
  const mat = hex === 0x2ee66b ? NAV.green : hex === 0xe0402e ? NAV.red : NAV.white;
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.48, 10, 8), mat);
  m.position.set(x, y, z); g.add(m);
}
/* RCS : bloc de 3 buses (vers l'extérieur, vers l'avant, vers l'arrière), posé sur une surface de normale (nx, ny) */
function rcsPod(g, x, y, z, nx, ny, o){
  const s = U*0.32, cx = x + nx*s/2, cy = y + ny*s/2;
  RCS_PODS.push({ x:cx + nx*s*1.15, y:cy + ny*s*1.15, z:z, nx:nx, ny:ny });
  const blk = boxM(s, s, s, o.mid); blk.position.set(cx, cy, z); g.add(blk);
  [new V3(nx, ny, 0), new V3(0,0,1), new V3(0,0,-1)].forEach(function(d){
    const c = new THREE.Mesh(new THREE.ConeGeometry(s*0.24, s*0.5, 8, 1, true), o.noz);
    c.quaternion.setFromUnitVectors(new V3(0,-1,0), d);
    c.position.set(cx + d.x*(s*0.5 + s*0.25), cy + d.y*(s*0.5 + s*0.25), z + d.z*(s*0.5 + s*0.25));
    g.add(c);
  });
}
/* tourelle de défense rapprochée (PDC), dessus (up=1) ou dessous (up=-1) */
function pdc(g, x, y, z, up, s, o){
  const t = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42*s, 0.5*s, 0.16*s, 10), o.dark); base.position.y = 0.08*s; t.add(base);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.36*s, 12, 6, 0, Math.PI*2, 0, Math.PI/2), o.mid); dome.position.y = 0.16*s; t.add(dome);
  [-1,1].forEach(function(k){
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.045*s, 0.055*s, 0.8*s, 6), o.dark);
    b.rotation.x = -(Math.PI/2 - 0.35); b.position.set(k*0.1*s, 0.34*s, -0.32*s); t.add(b);
  });
  t.position.set(x, y, z); if(up < 0) t.rotation.z = Math.PI; g.add(t); S.pdc++;
}
function antenna(g, x, y, z, h, o){
  strut(g, new V3(x, y, z), new V3(x, y + h, z), U*0.035, o.dark);
  strut(g, new V3(x - h*0.18, y + h*0.7, z), new V3(x + h*0.18, y + h*0.7, z), U*0.02, o.dark);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(U*0.06, 6, 5), plainMat(0x000000, {emissive:0xff3b2e, ei:1.15}));
  tip.position.set(x, y + h, z); g.add(tip); ANT_TIPS.push(tip);
}
function dish(g, x, y, z, r, o){
  strut(g, new V3(x, y, z), new V3(x, y + r*0.9, z), U*0.05, o.dark);
  const d = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 6, 0, Math.PI*2, 0, 0.6), plainMat(0xd9dde2, {metal:0.3, rough:0.6, side:THREE.DoubleSide}));
  d.rotation.x = Math.PI + 0.9; d.position.set(x, y + r*0.9 + r*0.05, z); g.add(d);
}
/* radiateur thermique : aile plate sur un bras, pivot à la racine (reste attachée quelle que soit l'inclinaison) */
function radiatorWing(g, side, x0, y, zc, span, len, o){
  const boom = boxM(U*0.55, U*0.14, U*0.18, o.dark); boom.position.set(side*(x0 + U*0.27), y, zc); g.add(boom);
  const pv = new THREE.Group(); pv.position.set(side*(x0 + U*0.5), y, zc); pv.rotation.z = side*0.06;
  const panel = new THREE.Mesh(new THREE.BoxGeometry(span, U*0.05, len), o.rad); panel.position.x = side*span/2; pv.add(panel);
  [-1,1].forEach(function(k){ const e = boxM(span, U*0.08, U*0.1, o.dark); e.position.set(side*span/2, 0, k*len/2); pv.add(e); });
  const tipBar = boxM(U*0.1, U*0.08, len, o.dark); tipBar.position.set(side*span, 0, 0); pv.add(tipBar);
  g.add(pv); S.radiators++;
}
function stripeBand(g, x, y, z, lenX, lenZ, o){
  const geo = new THREE.PlaneGeometry(lenX, lenZ);
  const uv = geo.attributes.uv; for(let i=0;i<uv.count;i++) uv.setX(i, uv.getX(i)*lenX/(U*0.9));
  const m = new THREE.Mesh(geo, o.stripe); m.rotation.x = -Math.PI/2; m.position.set(x, y, z); g.add(m);
}
/* conteneur ISO : tôle ondulée + cadres d'extrémité */
const CARGO_COLORS = { minerais:0x8a6a4a, denrees:0x4a8a52, medical:0xe6e6de, transport:0x4a6a9a, techno:0x8a4ac0, glace:0xaee4ea };
const CARGO_LABELS = { minerais:'Minerais', denrees:'Denrées', medical:'Matériel médical', transport:'Matériel de transport', techno:'Technologies', glace:'Glace' };
const CARGO_LIST = Object.keys(CARGO_COLORS);
function container(type, w, h, d, o){
  if(!o.cargo[type]) o.cargo[type] = new THREE.MeshStandardMaterial({ color:CARGO_COLORS[type], map:CORR_TEX, roughness:0.7, metalness:0.2 });
  const c = new THREE.Group();
  c.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), o.cargo[type]));
  [-1,1].forEach(function(k){ const f = new THREE.Mesh(new THREE.BoxGeometry(w*1.04, h*1.04, d*0.05), o.band); f.position.z = k*d*0.48; c.add(f); });
  S.containers++;
  c.userData.cargo = type; c.userData.cdims = [w, h, d];   /* prise directe sur la pile (navette-cargo) */
  return c;
}
/* fenêtres éclairées (shader radial, cf. §6.3 de l'étude) */
const WIN_CACHE = {};
function windowMaterial(hex){
  if(WIN_CACHE[hex]) return WIN_CACHE[hex];
  return WIN_CACHE[hex] = new THREE.ShaderMaterial({
    uniforms:{ uColor:{value:new THREE.Color(hex)} },
    vertexShader:'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader:'precision highp float; varying vec2 vUv; uniform vec3 uColor; void main(){ vec2 c=vUv-0.5; float d=length(c)*2.0; float k=clamp(1.0-d,0.0,1.0); gl_FragColor=vec4(uColor, clamp(pow(k,3.2)+pow(k,2.4)*0.35,0.0,1.0)); }',
    transparent:true, depthWrite:false, side:THREE.DoubleSide });
}
function bayMaterial(){
  if(WIN_CACHE.bay) return WIN_CACHE.bay;
  return WIN_CACHE.bay = new THREE.ShaderMaterial({
    vertexShader:'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader:'precision highp float; varying vec2 vUv; void main(){ vec2 e=min(vUv,1.0-vUv); float edge=smoothstep(0.0,0.08,min(e.x,e.y)); float mull=step(0.06,abs(fract(vUv.x*3.0)-0.5)*2.0); gl_FragColor=vec4(vec3(1.0,0.95,0.82)*(0.75+0.25*vUv.y), edge*mull*0.95); }',
    transparent:true, depthWrite:false, side:THREE.DoubleSide });
}
function cabinRow(g, xAbs, y, z0, z1, cabins, rowH){
  const n = cabins.length; if(!n) return;
  const sp = (z1 - z0)/n, port = Math.min(U*0.42, rowH*0.45);
  cabins.forEach(function(cab, i){
    const zc = z0 + sp*(i + 0.5);
    [-1,1].forEach(function(side){
      const x = side*xAbs;
      if(cab === 'panoramique'){
        const b = new THREE.Mesh(new THREE.PlaneGeometry(sp*0.9, rowH*0.78), bayMaterial());
        b.position.set(x, y, zc); b.rotation.y = side*Math.PI/2; g.add(b);
      } else {
        const k = cab === 'standard' ? 1 : cab === 'confort' ? 2 : 3;
        for(let j=0;j<k;j++){
          const off = k > 1 ? (j/(k-1) - 0.5)*sp*0.55 : 0;
          const p = new THREE.Mesh(new THREE.PlaneGeometry(port, port), windowMaterial(0xfff3d0));
          p.position.set(x, y, zc + off); p.rotation.y = side*Math.PI/2; g.add(p);
        }
      }
    });
  });
  S.cabins += n;
}

/* ======================================================================
   SECTIONS — toutes construites EN CHAÎNE le long de +Z (avant = -Z) :
   chaque section démarre exactement sur la face arrière de la précédente.
   ====================================================================== */

/* Proue : nez octogonal fermé + tronçon constant (passerelle) portant
   hublots de passerelle, nom peint, rétropropulseurs latéraux, RCS, feux. */
function bowSection(g, zRear, w, h, M, o){
  const L = Math.max(w, h)*1.25, a = w/2, ys = h/w, Lc = L*0.4, zc0 = zRear - Lc;
  const nose = octLathe([[0,0],[a*0.32,0],[a*0.66,L*0.28],[a,L*0.6],[a,L]], o.hull, ys);
  nose.position.z = zRear - L; g.add(nose);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(a*0.3*OCT_R*0.78, U*0.07, 6, 16), o.dark);
  ring.position.z = zRear - L; g.add(ring);
  // passerelle : bande de hublots en haut des flancs
  const wz0 = zc0 + Lc*0.42, wz1 = zRear - Lc*0.05, nWin = Math.max(3, Math.round((wz1-wz0)/(U*0.55)));
  const ww = (wz1 - wz0)/nWin*0.7, wh = Math.min(h*0.075, U*0.32);
  [-1,1].forEach(function(side){
    for(let i=0;i<nWin;i++){
      const p = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), o.win);
      p.position.set(side*(a + 0.05), h*0.11, wz0 + (i + 0.5)*(wz1 - wz0)/nWin); p.rotation.y = side*Math.PI/2; g.add(p);
    }
  });
  // nom peint, bas des flancs
  const lab = makeLabel(M.name, M.reg);
  let lh = h*0.13, lw = lh*lab.aspect; const avail = (wz1 - wz0)*0.95;
  if(lw > avail){ lw = avail; lh = lw/lab.aspect; }
  [-1,1].forEach(function(side){
    const m = new THREE.Mesh(new THREE.PlaneGeometry(lw, lh), lab.mat);
    m.position.set(side*(a + 0.07), -h*0.11, wz0 + lw/2 + (avail - lw)*0.1); m.rotation.y = side*Math.PI/2; g.add(m);
  });
  // rétropropulseurs sur les côtés, à l'avant, sortie vers l'avant
  const podL = Math.min(Lc*0.3, U*1.1), podS = Math.min(h*0.15, U*0.42), pz = zc0 + Lc*0.05 + podL/2;
  [-1,1].forEach(function(side){
    const pod = octBox(podS, podS, podL, o.mid, 0.25); pod.position.set(side*(a + podS/2), 0, pz); g.add(pod);
    const b = makeEngineBell(podS*0.2, podS*0.36, podS*0.8, o.noz); b.rotation.x = Math.PI; b.position.set(side*(a + podS/2), 0, pz - podL/2); g.add(b);
  });
  // feux : vert à tribord (+X), rouge à bâbord (-X)
  addNavLight(g, 0x2ee66b,  a + 0.3, h*0.11, zc0 + Lc*0.2);
  addNavLight(g, 0xe0402e, -a - 0.3, h*0.11, zc0 + Lc*0.2);
  // RCS dessus / dessous, antenne
  rcsPod(g, 0,  h/2, zc0 + Lc*0.25, 0,  1, o);
  rcsPod(g, 0, -h/2, zc0 + Lc*0.25, 0, -1, o);
  pdc(g, 0, -h/2, zc0 + Lc*0.72, -1, U*0.75, o);
  antenna(g, a*0.35, h/2, zc0 + Lc*0.75, U*1.0, o);
  return { zFront: zRear - L };
}

/* Habitat : modules octogonaux séparés par des collerettes aux couleurs de la livrée */
function habitatModules(g, z0, w, h, p, o){
  const ch = p.decks > 1 ? 0.15 : REG, cT = U*0.45, grow = U*0.32;
  let z = z0; const spans = [];
  function collar(){ const c = octBox(w + grow, h + grow, cT, o.livery, ch); c.position.z = z + cT/2; g.add(c); z += cT; }
  collar();
  for(let m=0;m<p.modules;m++){
    const mod = octBox(w, h, p.modL, o.hull, ch); mod.position.z = z + p.modL/2; g.add(mod);
    spans.push([z, z + p.modL]); z += p.modL; collar();
  }
  // cabines : réparties par (module, pont)
  const D = p.decks, flatHalf = (0.5 - ch)*h, winMods = p.bayLast ? p.modules - 1 : p.modules, slots = winMods*D;
  const rowH = D === 1 ? flatHalf*1.4 : (h*0.6/D)*0.9;
  for(let m=0;m<winMods;m++){
    for(let d=0;d<D;d++){
      const list = p.cabins.filter(function(_, i){ return i % slots === m*D + d; });
      const y = D === 1 ? -h*0.02 : (d - (D-1)/2)*(h*0.6/D);
      const mg = p.modL*0.07;
      cabinRow(g, w/2 + 0.06, y, spans[m][0] + mg, spans[m][1] - mg, list, rowH);
    }
  }
  if(p.bayLast){
    const sp = spans[spans.length-1], L = sp[1] - sp[0], zm = (sp[0] + sp[1])/2;
    [-1,1].forEach(function(side){
      const door = new THREE.Mesh(new THREE.PlaneGeometry(L*0.62, h*0.3), o.dark);
      door.position.set(side*(w/2 + 0.05), -h*0.02, zm); door.rotation.y = side*Math.PI/2; g.add(door);
      const sg = new THREE.PlaneGeometry(L*0.62, h*0.045), uv = sg.attributes.uv;
      for(let i=0;i<uv.count;i++) uv.setX(i, uv.getX(i)*L*0.62/(U*0.9));
      const st = new THREE.Mesh(sg, o.stripe); st.position.set(side*(w/2 + 0.06), h*0.16, zm); st.rotation.y = side*Math.PI/2; g.add(st);
    });
  }
  const first = spans[0], last = spans[spans.length-1];
  dish(g, 0, h/2, first[0] + (first[1]-first[0])*0.5, U*0.55, o);
  pdc(g, 0, h/2, last[0] + (last[1]-last[0])*0.5, 1, U*0.9, o);
  g.userData.dockPt = new V3(0, -h/2, (last[0] + last[1])/2);
  return z;
}

/* Section moteur : adaptateur -> réacteur (côtes, radiateurs) -> jupe -> plaque de poussée -> tuyères */
function engineSection(g, z0, p, o){
  const rRc = p.rR*OCT_R;
  const ad = octLathe([[p.r0,0],[p.r0,p.adaptL*0.15],[p.rR*1.04,p.adaptL*0.85],[p.rR,p.adaptL]], o.mid);
  ad.position.z = z0; g.add(ad);
  const zR = z0 + p.adaptL;
  const drum = prism(rRc, p.reactL, 8, o.hull); drum.position.z = zR + p.reactL/2; g.add(drum);
  [0.15, 0.85].forEach(function(k, i){ const rib = prism(rRc*1.08, U*0.3, 8, i ? o.dark : o.livery); rib.position.z = zR + p.reactL*k; g.add(rib); });
  if(!p.noRad) [-1,1].forEach(function(s){ radiatorWing(g, s, p.rR, 0, zR + p.reactL*0.5, p.radSpan || p.rR*2.6, p.reactL*0.55, o); });
  const zS = zR + p.reactL;
  const skirt = lathe([[rRc*0.97,0],[p.plateR,p.skirtL]], 12, o.dark); skirt.position.z = zS; g.add(skirt);
  const zP = zS + p.skirtL, pT = U*0.4;
  const plate = prism(p.plateR, pT, 12, o.dark); plate.position.z = zP + pT/2; g.add(plate);
  const zB = zP + pT, n = p.n, apo = p.plateR*Math.cos(Math.PI/12);
  const rb = n === 1 ? 0 : p.plateR*(n <= 3 ? 0.52 : 0.6);
  const exitMax = n === 1 ? p.plateR*0.7 : rb*Math.sin(Math.PI/n)*0.93;
  const exit = Math.min(p.exit || exitMax, exitMax), throat = exit*0.5;
  const ftl = PROP === 'ftl', ionL = U*0.55;
  const ionMat = ftl ? new THREE.ShaderMaterial({ uniforms:FTL_U, vertexShader:QUAD_VS, fragmentShader:ION_FS, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending }) : null;
  for(let i=0;i<n;i++){
    const ang = i/n*Math.PI*2 + (n === 2 ? 0 : Math.PI/2);
    const bx = Math.cos(ang)*rb, by = Math.sin(ang)*rb;
    if(ftl){
      const r = exit*0.75;
      const th = new THREE.Mesh(new THREE.CylinderGeometry(r, r*1.1, ionL, 12), o.dark); th.rotation.x = Math.PI/2; th.position.set(bx, by, zB + ionL/2); g.add(th);
      const grid = new THREE.Mesh(new THREE.CircleGeometry(r*0.85, 20), plainMat(0x3a5a86, {emissive:0x5aa0ff, ei:0.6})); grid.position.set(bx, by, zB + ionL + 0.01); g.add(grid);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(r*4, r*4), ionMat); glow.position.set(bx, by, zB + ionL + 0.3); glow.userData.noFrame = true; g.add(glow);
      continue;
    }
    const bell = makeEngineBell(throat, exit, p.bellLen, o.bell); bell.position.set(bx, by, zB); g.add(bell);
    const gim = new THREE.Mesh(new THREE.TorusGeometry(throat*1.15, throat*0.22, 6, 14), o.dark); gim.position.set(bx, by, zB + p.bellLen*0.08); g.add(gim);
    addEpsteinDrive(g, bx, by, zB + p.bellLen, exit, p.plume, i*1.7 + 0.3, 1/Math.sqrt(n));
  }
  S.engines = n;
  addDriveLight(g, 0, 0, zB + p.bellLen + U, p.plume);
  [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){ rcsPod(g, d[0]*apo, d[1]*apo, zP + pT/2, d[0], d[1], o); });
  addNavLight(g, 0xf0f0f0, p.plateR*0.62, p.plateR*0.62, zB + 0.15);
  const tail = ftl ? ionL : p.bellLen;
  g.userData.driveCenter = new V3(0, 0, zB + tail);
  g.userData.plumeLen = p.plume;
  g.userData.reactor = { z0:zR, len:p.reactL, apo:p.rR };
  return zB + tail;
}

/* ============ ARCHÉTYPE A : cargo-entrepôt ============ */
function buildWarehouse(n, M){
  const g = new THREE.Group(), o = materialsFor(M);
  const cbrt = Math.max(1, Math.cbrt(n));
  const cols = Math.max(2, Math.round(cbrt*1.25)), rows = Math.max(2, Math.round(cbrt*0.95));
  const depth = Math.max(1, Math.ceil(n/(cols*rows)));
  const hullW = cols*U*1.12 + U*1.6, hullH = rows*U*1.12 + U*1.6, hullL = depth*U*1.12 + U*3.2;
  const cx = (hullW + U)/2, cy = (hullH + U)/2;
  const seg = Math.max(2, Math.round(hullL/(U*2.4)));
  // cage : longerons d'angle, cadres, croisillons
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(s){ const l = octBox(U*0.42, U*0.42, hullL, o.mid, 0.25); l.position.set(s[0]*cx, s[1]*cy, 0); g.add(l); });
  for(let k=0;k<=seg;k++){
    const z = -hullL/2 + k*hullL/seg;
    [-1,1].forEach(function(s){
      const hb = boxM(2*cx, U*0.24, U*0.24, o.dark); hb.position.set(0, s*cy, z); g.add(hb);
      const vb = boxM(U*0.24, 2*cy, U*0.24, o.dark); vb.position.set(s*cx, 0, z); g.add(vb);
    });
  }
  const dz = hullL/seg, r = U*0.055;
  const faces = [
    function(z){ return [new V3(-cx,-cy,z), new V3(-cx,cy,z)]; }, function(z){ return [new V3(cx,-cy,z), new V3(cx,cy,z)]; },
    function(z){ return [new V3(-cx,cy,z), new V3(cx,cy,z)]; },   function(z){ return [new V3(-cx,-cy,z), new V3(cx,-cy,z)]; }
  ];
  faces.forEach(function(fn){ for(let i=0;i<seg;i++){ const z0 = -hullL/2 + i*dz, a0 = fn(z0), a1 = fn(z0 + dz); strut(g, a0[0], a1[1], r, o.dark); strut(g, a0[1], a1[0], r, o.dark); } });
  // cloisons pleines avant / arrière
  const bT = U*0.5, bw = 2*cx + U*0.6, bh = 2*cy + U*0.6;
  [-1,1].forEach(function(s){
    const b = octBox(bw, bh, bT, o.hull, 0.12); b.position.z = s*(hullL/2 + bT/2); g.add(b);
    stripeBand(g, 0, bh/2 + 0.03, s*(hullL/2 + bT/2), bw*0.6, bT*0.7, o);
    [-1,1].forEach(function(k){ rcsPod(g, k*bw/2, 0, s*(hullL/2 + bT/2), k, 0, o); });
  });
  pdc(g, -cx*0.6, bh/2, -hullL/2 - bT/2, 1, U*0.9, o);
  pdc(g,  cx*0.6, bh/2, -hullL/2 - bT/2, 1, U*0.9, o);
  pdc(g, 0, -bh/2, -hullL/2 - bT/2, -1, U*0.9, o);
  g.userData.dockPt = new V3(0, -bh/2, hullL/2 + bT/2);
  // conteneurs
  let placed = 0;
  for(let d=0; d<depth && placed<n; d++) for(let rr=0; rr<rows && placed<n; rr++) for(let c=0; c<cols && placed<n; c++){
    const box = container(CARGO_LIST[placed % CARGO_LIST.length], U*0.92, U*0.92, U*0.92, o);
    box.position.set(-hullW/2 + U*0.8 + c*U*1.08, -hullH/2 + U*0.8 + rr*U*1.08, -hullL/2 + U*1.6 + d*U*1.08);
    g.add(box); placed++;
  }
  // proue sur la cloison avant, section moteur sur la cloison arrière
  const wb = Math.min(2*cx, 2*cy)*0.42, hb = wb*0.86;
  const bow = bowSection(g, -hullL/2 - bT, wb, hb, M, o);
  const m = Math.min(cx, cy), nozzles = n > 80 ? 6 : (n > 25 ? 4 : 2);
  engineSection(g, hullL/2 + bT, { r0:m*0.55, rR:m*0.36, adaptL:U*1.2, reactL:U*2.2, skirtL:U*0.6, plateR:m*0.66, n:nozzles, bellLen:U*1.5,
    radSpan:m*0.9, plume:(hullL/2 + bT - bow.zFront)*0.95 }, o);
  return g;
}

/* ============ ARCHÉTYPE B : cargo-poutre ============ */
function buildBeam(n, M){
  const g = new THREE.Group(), o = materialsFor(M);
  const slices = Math.ceil(n/4), spacing = U*2.3, a = U*0.55;
  const beamLen = slices*spacing, zA = -beamLen/2, zB = beamLen/2;
  // poutre en treillis carré : 4 longerons, cadres à chaque tranche, diagonales alternées
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(s){ const l = octBox(U*0.26, U*0.26, beamLen, o.mid, 0.25); l.position.set(s[0]*a, s[1]*a, 0); g.add(l); });
  for(let k=0;k<=slices;k++){
    const z = zA + k*spacing;
    [-1,1].forEach(function(s){
      const hb = boxM(2*a, U*0.2, U*0.2, o.dark); hb.position.set(0, s*a, z); g.add(hb);
      const vb = boxM(U*0.2, 2*a, U*0.2, o.dark); vb.position.set(s*a, 0, z); g.add(vb);
    });
  }
  const corners = [[-1,-1],[1,-1],[1,1],[-1,1]];
  for(let k=0;k<slices;k++){
    const z0 = zA + k*spacing, z1 = z0 + spacing;
    for(let f=0;f<4;f++){
      const c0 = corners[f], c1 = corners[(f+1)%4], flip = (k + f) % 2;
      strut(g, new V3(c0[0]*a, c0[1]*a, flip ? z0 : z1), new V3(c1[0]*a, c1[1]*a, flip ? z1 : z0), U*0.05, o.dark);
    }
  }
  // conteneurs sur les 4 faces, fixés par des brides aux cadres
  const cs = U*0.9, cl = U*2.0, gap = U*0.18, off = a + gap + cs/2;
  const dirs = [[1,0],[0,1],[-1,0],[0,-1]];
  for(let i=0;i<n;i++){
    const sl = Math.floor(i/4), d = dirs[i%4], zc = zA + (sl + 0.5)*spacing;
    const c = container(CARGO_LIST[i % CARGO_LIST.length], cs, cs, cl, o); c.position.set(d[0]*off, d[1]*off, zc); g.add(c);
    [-1,1].forEach(function(k){
      const br = boxM(d[0] ? gap + U*0.1 : U*0.3, d[1] ? gap + U*0.1 : U*0.3, U*0.22, o.dark);
      br.position.set(d[0]*(a + gap/2), d[1]*(a + gap/2), zc + k*cl*0.42); g.add(br);
    });
  }
  // cloisons d'extrémité
  const bT = U*0.4, bs = 2*a + U*0.8;
  [-1,1].forEach(function(s){ const b = octBox(bs, bs, bT, o.hull, 0.2); b.position.z = s*(beamLen/2 + bT/2); g.add(b); });
  // proue à l'avant
  const bow = bowSection(g, zA - bT, U*1.6, U*1.6, M, o);
  pdc(g, 0, bs/2, zA - bT/2, 1, U*0.8, o);
  // pousseur à l'arrière : habitat puis section moteur
  const hw = U*2.0;
  const zH = habitatModules(g, zB + bT, hw, hw, { modules: n > 24 ? 2 : 1, modL: U*2.4, decks:1, cabins:['confort','panoramique','standard','standard'] }, o);
  engineSection(g, zH, { r0:hw/2*0.95, rR:U*0.7, adaptL:U*1.0, reactL:U*2.0, skirtL:U*0.5, plateR:U*1.25, n: n > 24 ? 4 : 2, bellLen:U*1.3,
    plume:(zH - bow.zFront)*0.85 }, o);
  return g;
}

/* ============ pousseurs et paquebot ============ */
function buildTug(t, M){
  const g = new THREE.Group(), o = materialsFor(M);
  const bow = bowSection(g, 0, t.w, t.h, M, o);
  const zH = habitatModules(g, 0, t.w, t.h, { modules:t.modules, modL:t.modL, decks:t.decks, cabins:t.cabins }, o);
  engineSection(g, zH, Object.assign({ r0:Math.min(t.w, t.h)/2*0.95, plume:(zH - bow.zFront)*1.05 }, t.eng), o);
  return g;
}
/* ============ cargo léger rapide (indépendant) ============
   Fuselage court (proue, module équipage, module soute) + section moteur
   centrale, et deux nacelles motrices déportées, chacune tenue par deux
   pylônes ancrés sur les collerettes du fuselage et de la nacelle. */
function buildRunner(M){
  const g = new THREE.Group(), o = materialsFor(M);
  o.hull = hullMat(0xaeb5bd);
  const w = U*1.6, h = U*1.3, cT = U*0.45, grow = U*0.32, modL = U*2.2;
  const bow = bowSection(g, 0, w, h, M, o);
  const zH = habitatModules(g, 0, w, h, { modules:2, modL:modL, decks:1, cabins:['confort','panoramique'], bayLast:true }, o);
  const collarZ = [cT/2, cT + modL + cT/2, 2*cT + 2*modL + cT/2];
  engineSection(g, zH, { r0:Math.min(w, h)/2*0.95, rR:U*0.5, adaptL:U*0.7, reactL:U*1.3, skirtL:U*0.4, plateR:U*0.85,
    n:1, bellLen:U*1.2, noRad:true, plume:(zH - bow.zFront)*1.2 }, o);
  const podW = U*0.95, podH = U*0.95, podY = -h*0.06;
  const cx = (w + grow)/2, podX = cx + U*1.15 + podW/2;
  const zF = collarZ[1] - U*2.2, zR = zH + U*2.4, L = zR - zF, zc = (zF + zR)/2;
  [-1,1].forEach(function(side){
    const px = side*podX;
    const pod = octBox(podW, podH, L, o.hull); pod.position.set(px, podY, zc); g.add(pod);
    const nL = podW*1.3;
    const nose = octLathe([[0,0],[podW/2*0.3,0],[podW/2*0.8,nL*0.5],[podW/2,nL]], o.mid, podH/podW);
    nose.position.set(px, podY, zF - nL); g.add(nose);
    [collarZ[1], collarZ[2]].forEach(function(zp){
      const c = octBox(podW + grow*0.7, podH + grow*0.7, cT, o.livery); c.position.set(px, podY, zp); g.add(c);
      const inner = cx, outer = podX - podW/2, len = outer - inner;
      const py = boxM(len + 0.2, U*0.26, U*0.8, o.mid); py.position.set(side*(inner + len/2), podY, zp); g.add(py);
      stripeBand(g, side*(inner + len/2), podY + U*0.13 + 0.02, zp, len*0.8, U*0.6, o);
    });
    const exit = podW*0.34, throat = exit*0.5, bl = U*1.1;
    if(PROP === 'ftl'){
      const r = exit*0.75, il = U*0.55;
      const th = new THREE.Mesh(new THREE.CylinderGeometry(r, r*1.1, il, 12), o.dark); th.rotation.x = Math.PI/2; th.position.set(px, podY, zR + il/2); g.add(th);
      const grid = new THREE.Mesh(new THREE.CircleGeometry(r*0.85, 20), plainMat(0x3a5a86, {emissive:0x5aa0ff, ei:0.6})); grid.position.set(px, podY, zR + il + 0.01); g.add(grid);
    } else {
      const bell = makeEngineBell(throat, exit, bl, o.bell); bell.position.set(px, podY, zR); g.add(bell);
      const gim = new THREE.Mesh(new THREE.TorusGeometry(throat*1.15, throat*0.22, 6, 14), o.dark); gim.position.set(px, podY, zR + bl*0.08); g.add(gim);
      addEpsteinDrive(g, px, podY, zR + bl, exit, (zR - bow.zFront)*1.1, 5 + side, 1);
    }
    radiatorWing(g, side, podX + podW/2, podY, zc, U*1.6, L*0.45, o);
    rcsPod(g, px, podY + podH/2, zF + L*0.12, 0, 1, o);
    addNavLight(g, side > 0 ? 0x2ee66b : 0xe0402e, side*(podX + podW/2 + 0.3), podY + podH*0.12, zF + L*0.08);
  });
  S.engines += 2;
  return g;
}
/* ============ citernier à glace ============
   Avant -> arrière : proue, module d'équipage, cloison, poutre triangulaire
   portant des triades de réservoirs sphériques, cloison, section moteur.
   L'équipage est à l'opposé du réacteur : la glace fait écran entre eux. */
function buildTanker(M){
  const g = new THREE.Group(), o = materialsFor(M);
  const tankMat = new THREE.MeshStandardMaterial({ color:0xd6ecf3, map:TANK_TEX, bumpMap:TANK_TEX, bumpScale:0.02, roughness:0.5, metalness:0.2 });
  const ranks = 5, spR = U*1.35, spacing = spR*2 + U*0.7, Rt = U*1.0, saddle = U*0.4;
  const D = Rt/2 + saddle + spR;                        // distance axe -> centre d'un réservoir
  const w = U*1.8, bT = U*0.45, bw = U*2.4;
  const bow = bowSection(g, 0, w, w, M, o);
  const zH = habitatModules(g, 0, w, w, { modules:1, modL:U*2.4, decks:1, cabins:['standard','confort','standard'] }, o);
  const zS0 = zH + bT, spineLen = ranks*spacing, zS1 = zS0 + spineLen;
  [zH + bT/2, zS1 + bT/2].forEach(function(z, i){
    const b = octBox(bw, bw, bT, o.hull, 0.2); b.position.z = z; g.add(b);
    stripeBand(g, 0, bw/2 + 0.03, z, bw*0.55, bT*0.7, o);
    pdc(g, 0, i ? -bw/2 : bw/2, z, i ? -1 : 1, U*0.8, o);
  });
  // poutre triangulaire : longerons à 30°, 150°, 270° -> faces centrées à 90°, 210°, 330°
  const corner = [30, 150, 270].map(function(d){ const r = d*Math.PI/180; return [Math.cos(r)*Rt, Math.sin(r)*Rt]; });
  corner.forEach(function(c){ const l = octBox(U*0.28, U*0.28, spineLen, o.mid, 0.25); l.position.set(c[0], c[1], zS0 + spineLen/2); g.add(l); });
  for(let k=0;k<=ranks;k++){
    const z = zS0 + k*spacing;
    for(let f=0;f<3;f++){ const a = corner[f], b = corner[(f+1)%3]; strut(g, new V3(a[0], a[1], z), new V3(b[0], b[1], z), U*0.09, o.dark); }
  }
  for(let k=0;k<ranks;k++){
    const z0 = zS0 + k*spacing, z1 = z0 + spacing;
    for(let f=0;f<3;f++){ const a = corner[f], b = corner[(f+1)%3], fl = (k + f) % 2;
      strut(g, new V3(a[0], a[1], fl ? z0 : z1), new V3(b[0], b[1], fl ? z1 : z0), U*0.05, o.dark); }
  }
  // triades de réservoirs : semelle posée sur la face, selle radiale, sphère, ceinture, vanne
  const side = Rt*Math.sqrt(3);
  for(let k=0;k<ranks;k++){
    const zc = zS0 + (k + 0.5)*spacing;
    [90, 210, 330].forEach(function(d){
      const t = new THREE.Group(); t.position.z = zc; t.rotation.z = d*Math.PI/180 - Math.PI/2;
      const plate = boxM(side*1.02, U*0.16, U*1.4, o.dark); plate.position.y = Rt/2 + U*0.08; t.add(plate);
      const sd = new THREE.Mesh(new THREE.CylinderGeometry(U*0.32, U*0.45, saddle + spR*0.12, 8), o.mid);
      sd.position.y = Rt/2 + U*0.16 + (saddle + spR*0.12)/2 - U*0.08; t.add(sd);
      const sph = new THREE.Mesh(new THREE.SphereGeometry(spR, 32, 20), tankMat); sph.position.y = D; t.add(sph);
      const belt = new THREE.Mesh(new THREE.TorusGeometry(spR*1.005, U*0.09, 6, 40), o.livery); belt.position.y = D; t.add(belt);
      const valve = new THREE.Mesh(new THREE.CylinderGeometry(U*0.14, U*0.18, U*0.5, 8), o.dark); valve.position.y = D + spR + U*0.2; t.add(valve);
      g.add(t); S.tanks++;
    });
  }
  engineSection(g, zS1 + bT, { r0:bw/2*0.95, rR:U*0.9, adaptL:U*1.2, reactL:U*2.6, skirtL:U*0.7, plateR:U*1.9, n:4, bellLen:U*1.7,
    radSpan:U*3.0, plume:(zS1 + bT - bow.zFront)*0.9 }, o);
  return g;
}
function cabinMix(n){ const a = []; for(let i=0;i<n;i++) a.push(['standard','confort','suite','panoramique'][i%4]); return a; }

/* ============ catalogue ============ */
const MODELS = [
  { id:'e18', group:'Fret en entrepôt', name:'Carrelet', reg:'STT-E018', livery:0xd98c2b, arch:'Cargo-entrepôt', tier:'II',
    meta:'18 conteneurs, 2 moteurs',
    desc:"Petit cargo-entrepôt : les conteneurs sont empilés dans une cage en croisillons, fermée par deux cloisons pleines qui portent la proue et la section moteur.",
    build:function(M){ return buildWarehouse(18, M); } },
  { id:'e140', ftl:true, group:'Fret en entrepôt', name:'Basalte', reg:'STT-E140', livery:0xc0492f, arch:'Cargo-entrepôt', tier:'IV',
    meta:'140 conteneurs, 6 moteurs',
    desc:"Le même principe à l'échelle du vraquier : la cage épaissit dans les trois dimensions au lieu de s'allonger, et la section moteur passe à six tuyères.",
    build:function(M){ return buildWarehouse(140, M); } },
  { id:'p10', group:'Fret en poutre', name:'Hirondelle', reg:'STT-P010', livery:0x2f8f86, arch:'Cargo-poutre', tier:'II',
    meta:'10 conteneurs, 2 moteurs',
    desc:"Chaque conteneur reste visible, bridé sur une poutre en treillis. La proue guide, le pousseur à l'arrière loge l'équipage et pousse l'ensemble.",
    build:function(M){ return buildBeam(10, M); } },
  { id:'p44', ftl:true, group:'Fret en poutre', name:'Longue-Échine', reg:'STT-P044', livery:0x3d6fb3, arch:'Cargo-poutre', tier:'III',
    meta:'44 conteneurs, 4 moteurs',
    desc:"Quarante-quatre conteneurs sur la même poutre : seule sa longueur change. Le pousseur gagne un second module d'habitation et deux tuyères.",
    build:function(M){ return buildBeam(44, M); } },
  { id:'g1', ftl:true, group:'Fret en vrac', name:'Banquise', reg:'STT-G015', livery:0x2d6fa0, arch:'Citernier à glace', tier:'IV',
    meta:'15 réservoirs de glace, 4 moteurs',
    desc:"Transporteur de glace en vrac : quinze réservoirs sphériques, groupés par trois autour d'une poutre triangulaire. L'équipage vit à l'avant, le plus loin possible du réacteur, la cargaison faisant écran entre les deux.",
    build:function(M){ return buildTanker(M); } },
  { id:'tS', group:'Pousseurs', name:'Mistral', reg:'STT-T001', livery:0x3aa0c9, arch:'Pousseur léger', tier:'I',
    meta:'2 cabines, 2 moteurs',
    desc:"Un seul module d'habitation, une cabine standard et une cabine panoramique à grande baie.",
    build:function(M){ return buildTug({ w:U*1.7, h:U*1.7, modules:1, modL:U*2.6, decks:1, cabins:['standard','panoramique'],
      eng:{ rR:U*0.55, adaptL:U*0.9, reactL:U*1.6, skirtL:U*0.5, plateR:U*0.95, n:2, bellLen:U*1.1 } }, M); } },
  { id:'tM', group:'Pousseurs', name:'Sirocco', reg:'STT-T006', livery:0xd98c2b, arch:'Pousseur moyen', tier:'II',
    meta:'6 cabines, 3 moteurs',
    desc:"Deux modules d'habitation séparés par des collerettes, six cabines de trois catégories.",
    build:function(M){ return buildTug({ w:U*2.1, h:U*2.1, modules:2, modL:U*2.8, decks:1, cabins:['standard','confort','panoramique','confort','standard','suite'],
      eng:{ rR:U*0.7, adaptL:U*1.0, reactL:U*2.0, skirtL:U*0.55, plateR:U*1.2, n:3, bellLen:U*1.3 } }, M); } },
  { id:'tL', group:'Pousseurs', name:'Tramontane', reg:'STT-T009', livery:0xb8433a, arch:'Pousseur lourd', tier:'III',
    meta:'9 cabines sur 2 ponts, 4 moteurs',
    desc:"Deux ponts, trois modules, et les quatre catégories de cabines, des hublots simples jusqu'aux grandes baies.",
    build:function(M){ return buildTug({ w:U*2.8, h:U*3.4, modules:3, modL:U*2.6, decks:2, cabins:cabinMix(9),
      eng:{ rR:U*0.95, adaptL:U*1.2, reactL:U*2.4, skirtL:U*0.6, plateR:U*1.6, n:4, bellLen:U*1.5 } }, M); } },
  { id:'l20', ftl:true, group:'Passagers', name:'Belle-Étoile', reg:'STT-L020', livery:0xc9a24a, arch:'Paquebot', tier:'III',
    meta:'20 cabines sur 3 ponts, 5 moteurs',
    desc:"Sans fret, tout le volume est habitable : vingt cabines réparties sur trois ponts et quatre modules.",
    build:function(M){ return buildTug({ w:U*3.4, h:U*3.9, modules:4, modL:U*2.4, decks:3, cabins:cabinMix(20),
      eng:{ rR:U*1.1, adaptL:U*1.3, reactL:U*2.6, skirtL:U*0.7, plateR:U*1.9, n:5, bellLen:U*1.6 } }, M); } },
  { id:'x1', group:'Indépendants', name:'Vagabonde', reg:'STT-X001', livery:0xcc5a24, arch:'Cargo léger rapide', tier:'II',
    meta:'soute légère, 3 moteurs',
    desc:"Coureur indépendant : fuselage court, une cabine confort et une cabine panoramique, une soute à portes latérales. Deux nacelles motrices déportées sur pylônes ajoutent poussée et maniabilité ; tourelles dessus et dessous.",
    build:function(M){ return buildRunner(M); } }
];

function frameBox(obj){
  const box = new THREE.Box3(); obj.updateMatrixWorld(true);
  obj.traverse(function(c){
    if(c.isMesh && !c.userData.noFrame){ if(!c.geometry.boundingBox) c.geometry.computeBoundingBox(); box.union(c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld)); }
  });
  return box;
}
function disposeObj(obj){
  const kept = function(x){ return typeof MODSHIP !== 'undefined' && MODSHIP.keeps(x); };   /* prototypes modulaires (09c) partagés */
  obj.traverse(function(c){
    if(c.geometry && !kept(c.geometry)) c.geometry.dispose();
    if(c.material){ (Array.isArray(c.material) ? c.material : [c.material]).forEach(function(m){
      if(kept(m)) return;
      if(m.map && !SHARED_TEX.has(m.map) && !kept(m.map)) m.map.dispose();
      if(m !== WIN_CACHE.bay && !Object.values(WIN_CACHE).includes(m)) m.dispose();
    }); }
  });
}

/* le jeu rend en sRGB + ACES : couleurs de matériaux et textures de coque
   converties une fois (sans quoi les coques paraîtraient délavées) */
function linearize(g){
  g.traverse(function(o){
    if(!o.material) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(function(m){
      if(m.userData.lin || m.isShaderMaterial) return;
      m.userData.lin = true;
      if(m.color) m.color.convertSRGBToLinear();
      if(m.emissive) m.emissive.convertSRGBToLinear();
      if(m.map && m.map.encoding !== THREE.sRGBEncoding){ m.map.encoding = THREE.sRGBEncoding; m.map.needsUpdate = true; }
      m.needsUpdate = true;
    });
  });
}
function build(id, opts){
  opts = opts || {};
  FLARE_K = opts.flareK || 1; DRIVE_LIGHTS.length = 0; S = newStats(); RND = rngFactory(11); RCS_PODS = []; ANT_TIPS = [];
  const M = MODELS.find(function(m){ return m.id === id; }) || MODELS[0];
  const g = M.build(M);
  /* modèles modulaires (09c) : statistiques, RCS et balises fournis par l'assembleur */
  const X = g.userData.extern;
  if(X){ Object.assign(S, X.stats || {}); if(X.rcs) RCS_PODS = X.rcs; if(X.tips) ANT_TIPS = X.tips; }
  const hullBox = frameBox(g), hullDims = hullBox.getSize(new V3());
  /* options de propulsion (long-courriers seulement) : supraluminique = anneaux, saut = générateur */
  const warp = !!M.ftl && opts.warp !== false, jump = !!M.ftl && opts.jump !== false;
  if(warp) addWarpDrive(g);
  if(jump) addJumpCore(g);
  linearize(g);
  const box = frameBox(g);
  return { group:g, M:M, warp:warp, jump:jump, stats:Object.assign({}, S), hullBox:hullBox, hullDims:hullDims, box:box, dims:box.getSize(new V3()),
           rcs:RCS_PODS, tips:ANT_TIPS, lights:DRIVE_LIGHTS.slice() };
}
function tick(elapsed, dt, spin){
  DRIVE_U.uTime.value = elapsed; FTL_U.uTime.value = elapsed;
  FTL_U.uPhase.value += dt*0.7*(spin || 1);
}
return { MODELS:MODELS, build:build, tick:tick, setDrive:setDrive, DRIVE_U:DRIVE_U, FTL_U:FTL_U, JUMP_U:JUMP_U, NAV:NAV,
         dispose:disposeObj, CARGO_COLORS:CARGO_COLORS,
         fx:{ addEpsteinDrive:addEpsteinDrive, addDriveLight:addDriveLight } };   /* fx : pour les coques modulaires (09c) */
})();

/* dock de navettes + bras de chargement : code d'origine du vaisseau v2.12,
   désormais posé sous n'importe quelle coque (point d'ancrage fourni par le
   générateur), à l'échelle du jeu et non à celle de la coque */
function buildDockModule(parent, x, dockY, dockZ){
  const darkPanel = new THREE.MeshStandardMaterial({color:0x2a2f36, metalness:0.5, roughness:0.7});
  const frameMat  = new THREE.MeshStandardMaterial({color:0x8a919b, metalness:0.45, roughness:0.65});
  window.shipDockAnchor = new THREE.Object3D();
  window.shipDockAnchor.position.set(x, dockY, dockZ);
  parent.add(window.shipDockAnchor);

  /* -- puits qui relie le plancher du caisson à la baie en saillie -- */
  const dockWell = new THREE.Mesh(
    new THREE.BoxGeometry(4.0, 1.3, 3.2),
    darkPanel
  );
  dockWell.position.set(x, dockY+0.65, dockZ);
  parent.add(dockWell);

  /* -- cadre métallique visible en bordure de l'ouverture -- */
  const dockRim = new THREE.Mesh(
    new THREE.BoxGeometry(5.0, 0.14, 4.1),
    frameMat
  );
  dockRim.position.set(x, dockY+0.05, dockZ);
  parent.add(dockRim);

  /* -- surface éclairée de la baie : matériau très émissif, la vraie
     source visuelle de lumière bleue (pas une texture, une émission
     matériau — bon marché et cohérent avec le verre de cockpit déjà
     traité en émissif ailleurs sur ce vaisseau) -- */
  const dockGlowMat = new THREE.MeshStandardMaterial({
    color:0x0a1622, metalness:0.2, roughness:0.4,
    emissive:0x3fa9ff, emissiveIntensity:2.8
  });
  const dockFloor = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 3.2), dockGlowMat);
  dockFloor.rotation.x = Math.PI/2;
  /* décalage franc sous la face inférieure du cadre (dockRim descend
     jusqu'à dockY-0.02) : les deux étaient exactement coplanaires,
     provoquant un scintillement (z-fighting) sur toute la surface —
     bug remonté en jeu. 0.06 au lieu de 0.02 les sépare nettement. */
  dockFloor.position.set(x, dockY-0.06, dockZ);
  parent.add(dockFloor);
  window.__dockGlow = { mat:dockGlowMat, baseIntensity:2.8 };

  /* -- halo : la lumière de la baie DIFFUSE dans l'espace environnant,
     comme sur la référence — deux sprites additifs superposés, un cœur
     serré et un halo large et doux -- */
  const dockHaloCore = new THREE.Sprite(new THREE.SpriteMaterial({
    map:glowTex, color:0x8fd8ff, blending:THREE.AdditiveBlending,
    transparent:true, depthWrite:false, opacity:0.9
  }));
  dockHaloCore.scale.set(6.5, 5.2, 1);
  dockHaloCore.position.set(x, dockY-0.15, dockZ);
  dockHaloCore.userData.baseOpacity = 0.9;
  parent.add(dockHaloCore);

  const dockHaloWide = new THREE.Sprite(new THREE.SpriteMaterial({
    map:glowTex, color:0x3fa9ff, blending:THREE.AdditiveBlending,
    transparent:true, depthWrite:false, opacity:0.4
  }));
  dockHaloWide.scale.set(14, 11, 1);
  dockHaloWide.position.set(x, dockY-0.15, dockZ);
  dockHaloWide.userData.baseOpacity = 0.4;
  parent.add(dockHaloWide);
  window.__dockHalos = [dockHaloCore, dockHaloWide];

  /* -- éclairage réel, à courte portée : la baie illumine véritablement
     la coque alentour, pas seulement un effet de sprite -- */
  const dockLight = new THREE.PointLight(0x4db8ff, 1.6, 20, 2);
  dockLight.position.set(x, dockY-0.4, dockZ);
  parent.add(dockLight);
  window.__dockLight = dockLight;

  /* -- feu de gabarit, conservé : repère de position net, même la baie éteinte -- */
  (function dockBeacon(){
    const mat = new THREE.SpriteMaterial({
      map:glowTex, color:0xffffff, blending:THREE.AdditiveBlending,
      transparent:true, depthWrite:false, opacity:0
    });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(0.5, 0.5, 1);
    sp.position.set(x, dockY+0.75, dockZ);
    parent.add(sp);
    window.__beacons.push({ mat:mat, period:1.4, phase:0, duty:0.5, peak:0.85 });
  })();

  /* -- bras de chargement, 3 segments -- monté à côté du dock, va chercher
     un conteneur dans un point de stockage voisin (représentant la soute)
     et vient le déposer sur la pince avant de la navette qui patiente au
     dock. Articulation base (épaule, 2 axes) → coude (1 axe) → poignet
     (pince) — animée par poses-clés plutôt que par une IK complète,
     largement suffisant pour un geste bref observé en gros plan. */
  const ARM_ORIGIN = new THREE.Vector3(x + 1.55, dockY+0.55, dockZ);
  window.shipCargoStageAnchor = new THREE.Object3D();
  window.shipCargoStageAnchor.position.set(x + 2.85, dockY+0.55, dockZ);
  parent.add(window.shipCargoStageAnchor);

  const armBase = new THREE.Object3D();
  armBase.position.copy(ARM_ORIGIN);
  parent.add(armBase);

  const armSeg1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 1.0), frameMat);
  armSeg1.position.z = -0.5;
  armBase.add(armSeg1);

  const armElbow = new THREE.Object3D();
  armElbow.position.z = -1.0;
  armBase.add(armElbow);
  const armSeg2 = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.85), frameMat);
  armSeg2.position.z = -0.425;
  armElbow.add(armSeg2);

  const armWrist = new THREE.Object3D();
  armWrist.position.z = -0.85;
  armElbow.add(armWrist);
  const gripper = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.34, 0.22),
    new THREE.MeshStandardMaterial({color:0x8a8f97, metalness:0.6, roughness:0.4})
  );
  armWrist.add(gripper);

  window.shipArm = { base:armBase, elbow:armElbow, wrist:armWrist, gripper:gripper, origin:ARM_ORIGIN };
}

/* raccordement du modèle choisi aux systèmes du jeu */
let SHIP_CAN_JUMP = false, SHIP_GAME_LEN = 40, SHIP_BUILD = null, SHIP_WARP = false, WARP_FACTOR = 1;
const SHIP_DEFAULT_ID = 'e18';
const shipBody = new THREE.Group();
shipMesh.add(shipBody);
const RCS_TRAIL_LEN = 2.4;
const rcsTrailGeo = new THREE.ConeGeometry(0.20, RCS_TRAIL_LEN, 7, 1, true);
rcsTrailGeo.translate(0, RCS_TRAIL_LEN/2, 0);
let SHIP_HULL = null, SHIP_K = 1, SHIP_ID = null;
/* coque seule : moteurs, RCS, feux, balises d'antenne, jauges. Réutilisée
   par refitWarpRings() pour poser les anneaux sans reconstruire le dock. */
function mountHull(id, opts){
  if(SHIP_HULL){ shipBody.remove(SHIP_HULL); SHIPGEN.dispose(SHIP_HULL); SHIP_HULL = null; }
  window.__engineGlows = []; window.__rcs = [];
  window.__beacons = (window.__beacons || []).filter(function(bc){ return !bc.hull; });
  const b = SHIPGEN.build(id, { flareK:0.6, warp:opts.warp, jump:opts.jump, age:SHIP_WEAR.age, ageSeed:SHIP_WEAR.seed });   /* L6 : usure et livrée (shipwear.js) */
  SHIP_BUILD = b;
  /* taille en jeu : de ~35 u (le plus petit) à ~70 u (le plus grand) ; le
     vaisseau d'origine en faisait 40. Mesurée hors anneaux : poser les
     anneaux ne change ni l'échelle ni le centrage. */
  const L = b.hullDims.z, gameLen = (typeof REAL !== 'undefined' && REAL.active) ? L : 40*Math.pow(L/89, 0.55), k = gameLen/L;   /* L2.2 : taille réelle (k = 1) */
  const hull = b.group, c = b.hullBox.getCenter(new THREE.Vector3());
  hull.scale.setScalar(k); shipBody.add(hull);
  shipBody.position.set(-c.x*k, -c.y*k, -c.z*k);
  SHIP_HULL = hull; SHIP_K = k; SHIP_GAME_LEN = gameLen;
  hull.traverse(function(o){ if(o.userData.isFlare){ window.__engineGlows.push(o); o.material.uniforms.uSize.value *= k; } });
  b.rcs.forEach(function(p){
    const d = new THREE.Vector3(p.nx, p.ny, 0).normalize(), front = p.z < c.z;
    let axis, sign;
    if(Math.abs(p.ny) > 0.5){ axis = front ? 'pitch' : 'roll'; sign = p.ny > 0 ? 1 : -1; }
    else { axis = 'yaw'; sign = (p.nx > 0 ? 1 : -1)*(front ? 1 : -1); }
    const jet = new THREE.Mesh(rcsTrailGeo, new THREE.MeshBasicMaterial({ color:0x7ec8ff, transparent:true, opacity:0,
      blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide }));
    jet.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    jet.position.set(p.x, p.y, p.z); jet.visible = false; jet.userData.noFrame = true;
    hull.add(jet);
    window.__rcs.push({ jet:jet, axis:axis, sign:sign, base:0.8/k });
  });
  window.__navLights = [SHIPGEN.NAV.green, SHIPGEN.NAV.red];
  b.tips.forEach(function(tip, i){ tip.material.transparent = true; window.__beacons.push({ mat:tip.material, period:1.6 + i*0.4, phase:i*0.7, duty:0.3, peak:1, hull:true }); });
  SHIP_CAN_JUMP = !!b.M.ftl;          /* éligible aux deux options : long-courrier */
  hasQuantumJump = b.jump;            /* générateur de saut installé */
  SHIP_WARP = b.warp;                 /* anneaux de distorsion : croisière supraluminique */
  WARP_FACTOR = shipSpecs(b).warpFactor;
  engineTemps = window.__engineGlows.map(function(_, i){ return 40 + (i*3) % 5; });
  buildEnginePanel();
  return b;
}
function gameLen40(){ return SHIP_GAME_LEN/40; }
/* L6 : usure du vaisseau du joueur — neuf à l'achat, s'use à chaque escale (cf. SHIPFX.onEscale) ; la graine
   fixe la livrée et le dessin de l'usure (même vaisseau, même aspect, même après pose du générateur de saut) */
let SHIP_WEAR = { age: .04, seed: 1 };
function installShip(id, opts){
  opts = opts || {};
  SHIP_WEAR = { age: .04, seed: 1 + Math.floor(Math.random()*1e9) };   /* coque neuve */
  while(shipBody.children.length){ const ch = shipBody.children[0]; shipBody.remove(ch); SHIPGEN.dispose(ch); }
  SHIP_HULL = null; window.__engineCones = []; window.__beacons = [];
  const b = mountHull(id, { warp:opts.warp !== false, jump:opts.jump !== false });
  SHIP_ID = id;
  const k = SHIP_K, f = SHIP_GAME_LEN/40, c = b.hullBox.getCenter(new THREE.Vector3());
  const dp = (b.group.userData.dockPt || new THREE.Vector3(0, b.hullBox.min.y, c.z)).clone().multiplyScalar(k);
  const nBefore = shipBody.children.length;
  const noDock = typeof CARGO !== 'undefined';   /* lot N2 : plus aucun module d'amarrage — les engins partent des baies intégrées */
  if(noDock){ window.shipDockAnchor = null; window.shipArm = null; window.shipCargoStageAnchor = null; }
  else buildDockModule(shipBody, dp.x, dp.y - 1.15, dp.z);
  if(typeof REAL !== 'undefined' && REAL.active){           /* L2.3 : dock dessiné pour un vaisseau de 40 u → mis à l'échelle du vaisseau réel */
    const fs = (typeof CARGO !== 'undefined') ? CARGO.DOCK_SCALE : gameLen40(), o = new THREE.Vector3(dp.x, dp.y, dp.z);   /* lot N : taillé pour le conteneur ISO 20' */
    shipBody.children.slice(nBefore).forEach(function(ch){ ch.position.sub(o).multiplyScalar(fs).add(o); ch.scale.multiplyScalar(fs); });
  }
  CAM_OFFSET.set(0, 12*f, 46*f);
  SHIP_HULL_RADIUS = 20*f; SHIP_LABEL_RADIUS = 22*f;
  SHIP_REGISTRY = b.M.reg;
  const nameEl = document.getElementById('shipName');
  if(nameEl) nameEl.textContent = b.M.name.toUpperCase() + ' ' + b.M.reg;
}
/* achat du module de saut en escale sur un long-courrier parti sans
   générateur : seule la coque est remontée, avec son générateur — dock,
   bras et navette en cours de chargement ne sont pas touchés. */
function refitJumpCore(){ if(SHIP_ID && SHIP_CAN_JUMP) mountHull(SHIP_ID, { warp:SHIP_WARP, jump:true }); }


/* le HUD affiche la même immatriculation que celle peinte sur la coque */
