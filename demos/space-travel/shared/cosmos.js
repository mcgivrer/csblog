/* =====================================================================
   COSMOS — moteur allégé de l'univers, sans vaisseau (lot P1 de la présentation)
   window.__COSMOS.create(opts) → un monde : graine → champ galactique (fond d'étoiles, nébuleuses,
   cellules stellaires) → système à l'échelle réelle (étoile, planètes, lunes, anneaux, astéroïdes).
   - mêmes tirages que le jeu (modules 02, 03, 04, 07, 11, 12, 14, 16 et partie « système » de 20c) :
     pour une graine donnée, les systèmes sont ceux du jeu (vérifié par presentation/tests/cosmos_test.py) ;
   - aucun global du jeu requis : THREE r128 et les modules partagés planets.js, stars.js, asteroids.js ;
   - jamais de vaisseau, de station, de port ni de navette : décor seulement ;
   - rendu en deux couches comme le jeu : couche galactique (unités du jeu, 1 u = 1/38 pc) puis couche système
     en mètres, origine flottante et tranches de profondeur (0,2 m → 1,3·10¹⁹ m).
   Réglages de rendu (sRGB, ACES, exposition) : à la charge de l'hôte.
   ===================================================================== */
(function(){
'use strict';
const CO = window.__COSMOS = {};
const V3 = THREE.Vector3;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = x => { x = clamp(x, 0, 1); return x*x*(3 - 2*x); };

/* ---------- constantes physiques (identiques à 20c / cine.js) ---------- */
const RSUN = 6.957e8, REARTH = 6.371e6, AU = 1.496e11, GRAV = 6.674e-11, LY = 9.4607e15, PC = 3.0857e16;
const UNIT_GAL = PC/38;
CO.UNITS = { RSUN, REARTH, AU, LY, PC, UNIT_GAL };

/* ---------- PRNG (module 02) ---------- */
function xmur3(str){
  let h = 1779033703 ^ str.length;
  for(let i = 0; i < str.length; i++){ h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return function(){ h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return h >>> 0; };
}
function mulberry32(a){
  return function(){ a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0)/4294967296; };
}
const rngFor = tag => mulberry32(xmur3(tag)());

/* ---------- noms (module 03) ---------- */
const LANG_BANKS = {
  grec:      ['thal','xan','ory','phe','kass','iot','nyx','ther','poly','aster','dora','krys','helio','sel'],
  latin:     ['sol','lux','via','nova','terra','ignis','stel','magna','fer','rex','aqua','umbra','ventus','ferox'],
  hindi:     ['chandra','tara','veer','anant','surya','maya','indra','shakti','deva','loka','ratna','megha'],
  chinois:   ['xing','tian','long','yun','hai','feng','jing','ming','hua','shan','lan','yue'],
  francais:  ['etoile','ombre','lune','ciel','feu','vent','noir','clair','riviere','songe','brume','aube'],
  anglais:   ['star','drift','shadow','edge','far','deep','light','wander','void','dawn','frost','ash'],
  russe:     ['zvezda','nebo','ogon','burya','tumana','svet','krasny','volna','strannik','zima'],
  espagnol:  ['estrella','sombra','fuego','cielo','luna','viento','lejano','claro','niebla','alba'],
  portugais: ['estrela','nevoa','fogo','ceu','lua','vento','distante','bruma','aurora']
};
const LANG_KEYS = Object.keys(LANG_BANKS);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const ROMAN = ['I','II','III','IV','V','VI','VII','VIII'];
const toRoman = n => ROMAN[n - 1] || String(n);
function generateName(rng){
  const l1 = LANG_KEYS[Math.floor(rng()*LANG_KEYS.length)];
  let l2 = LANG_KEYS[Math.floor(rng()*LANG_KEYS.length)], guard = 0;
  while(l2 === l1 && guard < 5){ l2 = LANG_KEYS[Math.floor(rng()*LANG_KEYS.length)]; guard++; }
  const b1 = LANG_BANKS[l1], b2 = LANG_BANKS[l2];
  const p1 = cap(b1[Math.floor(rng()*b1.length)]), p2 = b2[Math.floor(rng()*b2.length)];
  const joiner = rng() < 0.45 ? '-' : ' ';
  let name = p1 + joiner + cap(p2);
  if(rng() < 0.55) name += ' ' + Math.floor(rng()*899 + 100);
  return name;
}

/* ---------- modèle astrophysique (module 04) ---------- */
const SPECTRAL_CLASSES = [
  {cls:'M', frac:0.7645,  mMin:0.08, mMax:0.45, tMin:2400,  tMax:3700},
  {cls:'K', frac:0.1210,  mMin:0.45, mMax:0.80, tMin:3700,  tMax:5200},
  {cls:'G', frac:0.0760,  mMin:0.80, mMax:1.04, tMin:5200,  tMax:6000},
  {cls:'F', frac:0.0300,  mMin:1.04, mMax:1.40, tMin:6000,  tMax:7500},
  {cls:'A', frac:0.0060,  mMin:1.40, mMax:2.10, tMin:7500,  tMax:10000},
  {cls:'B', frac:0.0013,  mMin:2.10, mMax:16.0, tMin:10000, tMax:30000},
  {cls:'O', frac:0.00003, mMin:16.0, mMax:60.0, tMin:30000, tMax:45000}
];
const LUMINOSITY_CLASSES = [
  {code:'V',   label:'naine (séquence principale)', frac:0.880},
  {code:'IV',  label:'sous-géante',                 frac:0.030},
  {code:'III', label:'géante',                      frac:0.045},
  {code:'I',   label:'supergéante',                 frac:0.003},
  {code:'D',   label:'naine blanche',               frac:0.042}
];
const T_SUN = 5772, MBOL_SUN = 4.74;
function pickWeighted(rng, table){ let total = 0; for(const e of table) total += e.frac; let r = rng()*total; for(const e of table){ r -= e.frac; if(r <= 0) return e; } return table[table.length - 1]; }
function blackbodyRGB(T){
  const t = Math.max(1700, Math.min(40000, T));
  const x = t <= 4000 ? -0.2661239e9/(t*t*t) - 0.2343589e6/(t*t) + 0.8776956e3/t + 0.179910
                      : -3.0258469e9/(t*t*t) + 2.1070379e6/(t*t) + 0.2226347e3/t + 0.240390;
  const y = t <= 2222 ? -1.1063814*x*x*x - 1.34811020*x*x + 2.18555832*x - 0.20219683
          : t <= 4000 ? -0.9549476*x*x*x - 1.37418593*x*x + 2.09137015*x - 0.16748867
                      :  3.0817580*x*x*x - 5.87338670*x*x + 3.75112997*x - 0.37001483;
  const X = x/y, Y = 1.0, Z = (1 - x - y)/y;
  let r = 3.2406*X - 1.5372*Y - 0.4986*Z, g = -0.9689*X + 1.8758*Y + 0.0415*Z, b = 0.0557*X - 0.2040*Y + 1.0570*Z;
  const max = Math.max(r, g, b, 1e-6);
  return { r: Math.max(0, r/max), g: Math.max(0, g/max), b: Math.max(0, b/max) };
}
function luminosityFromMass(M){ if(M < 0.43) return 0.23*Math.pow(M, 2.3); if(M < 2.0) return Math.pow(M, 4.0); if(M < 55.0) return 1.4*Math.pow(M, 3.5); return 32000*M; }
const radiusFromLT = (L, T) => Math.sqrt(L)*Math.pow(T_SUN/T, 2);
function apparentMagnitude(L, distPc){ const Mbol = MBOL_SUN - 2.5*Math.log10(Math.max(L, 1e-8)); return Mbol + 5*Math.log10(Math.max(distPc, 1e-4)/10); }
function generateStar(rng){
  const sc = pickWeighted(rng, SPECTRAL_CLASSES), lc = pickWeighted(rng, LUMINOSITY_CLASSES), alpha = 2.35;
  const a = Math.pow(sc.mMin, 1 - alpha), b = Math.pow(sc.mMax, 1 - alpha);
  let mass = Math.pow(a + rng()*(b - a), 1/(1 - alpha));
  const tFrac = rng(); let temp = sc.tMax - tFrac*(sc.tMax - sc.tMin);
  const sub = Math.min(9, Math.floor(tFrac*10));
  let lum = luminosityFromMass(mass);
  if(lc.code === 'IV'){ lum *= 2.5 + rng()*3; }
  else if(lc.code === 'III'){ lum *= 25 + rng()*60; temp *= 0.72; }
  else if(lc.code === 'I'){ lum *= 4000 + rng()*20000; temp *= 0.62; }
  else if(lc.code === 'D'){ temp = 6000 + rng()*24000; mass = 0.5 + rng()*0.7; lum = 4*Math.PI*Math.pow(0.013, 2)*Math.pow(temp/T_SUN, 4); }
  if(lc.code !== 'D') temp = Math.max(temp, 2100);
  const radius = lc.code === 'D' ? 0.013*Math.pow(0.6/mass, 1/3) : radiusFromLT(lum, temp);
  return { spectralClass: sc.cls, subClass: sub, lumClass: lc.code, lumLabel: lc.label,
    designation: lc.code === 'D' ? 'D' + sc.cls + ' ' + sub : sc.cls + sub + ' ' + lc.code,
    temp, mass, lum, radius, color: blackbodyRGB(temp) };
}
const NEBULA_TYPES = [
  {key:'emission',   name:'Nébuleuse en émission',     colorA:0xff5d8a, colorB:0x7a2d6b},
  {key:'hii',        name:'Région HII',                colorA:0xff8fa8, colorB:0x8e3f7a},
  {key:'dark',       name:'Nébuleuse obscure',         colorA:0x3a2a5c, colorB:0x140e26},
  {key:'planetary',  name:'Nébuleuse planétaire',      colorA:0x7dffe8, colorB:0x1d6f82},
  {key:'supernova',  name:'Rémanent de supernova',     colorA:0xffb066, colorB:0x8f3a2a},
  {key:'nursery',    name:'Pouponnière stellaire',     colorA:0xc08cff, colorB:0x3d47a8},
  {key:'reflection', name:'Nébuleuse par réflexion',   colorA:0x8fb8ff, colorB:0x2a3f8f},
  {key:'molecular',  name:'Nuage moléculaire',         colorA:0x5e7ba8, colorB:0x1e2a4d},
  {key:'oiii',       name:'Nébuleuse en émission OIII',colorA:0x6fffc4, colorB:0x2a7a6b}
];
const PLANET_KINDS = [
  {key:'ocean',      name:'monde océanique',   ocean:0.62, life:true,  atmo:true},
  {key:'continental',name:'monde continental', ocean:0.32, life:true,  atmo:true},
  {key:'desert',     name:'monde désertique',  ocean:0.04, life:false, atmo:true},
  {key:'ice',        name:'monde glacé',       ocean:0.50, life:false, atmo:true,  icy:true},
  {key:'volcanic',   name:'monde volcanique',  ocean:0.00, life:false, atmo:false, volcanic:true},
  {key:'gas',        name:'géante gazeuse',    ocean:0.00, life:false, atmo:true,  gas:true}
];
const HABITABLE_KIND_COUNT = 2;
CO.PLANET_KINDS = PLANET_KINDS; CO.NEBULA_TYPES = NEBULA_TYPES;

/* ---------- textures générées (module 05) ---------- */
function makeGlowTexture(){
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d'), g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function makeNoiseTexture(seed, N){
  const rng = rngFor(seed + ':noise');
  const grid = res => { const g = new Float32Array(res*res); for(let i = 0; i < res*res; i++) g[i] = rng(); return g; };
  function sample(g, res, x, y){
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, sx = xf*xf*(3 - 2*xf), sy = yf*yf*(3 - 2*yf);
    const i0 = ((xi % res) + res) % res, i1 = (i0 + 1) % res, j0 = ((yi % res) + res) % res, j1 = (j0 + 1) % res;
    const a = g[j0*res + i0], b = g[j0*res + i1], c = g[j1*res + i0], d = g[j1*res + i1];
    return (a + (b - a)*sx) + ((c + (d - c)*sx) - (a + (b - a)*sx))*sy;
  }
  function channel(){
    const grids = [8, 16, 32, 64].map(r => ({ res: r, g: grid(r) })), out = new Float32Array(N*N);
    let min = Infinity, max = -Infinity;
    for(let y = 0; y < N; y++) for(let x = 0; x < N; x++){
      let v = 0, amp = 0.5;
      for(const o of grids){ v += amp*sample(o.g, o.res, x/N*o.res, y/N*o.res); amp *= 0.5; }
      out[y*N + x] = v; if(v < min) min = v; if(v > max) max = v;
    }
    const span = Math.max(max - min, 1e-6); for(let i = 0; i < out.length; i++) out[i] = (out[i] - min)/span;
    return out;
  }
  const ch = [channel(), channel(), channel(), channel()], data = new Uint8Array(N*N*4);
  for(let i = 0; i < N*N; i++){ data[i*4] = ch[0][i]*255; data[i*4 + 1] = ch[1][i]*255; data[i*4 + 2] = ch[2][i]*255; data[i*4 + 3] = ch[3][i]*255; }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.minFilter = THREE.LinearMipMapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true; tex.needsUpdate = true;
  return tex;
}
const glow = makeGlowTexture();
/* globaux lus par les modules partagés (définis par le jeu ; ici seulement s'ils sont absents) */
if(typeof window.glowTex === 'undefined') window.glowTex = glow;
if(typeof window.ATMO_FRAG === 'undefined') window.ATMO_FRAG = '/* cosmos : aucune atmosphère du jeu à remplacer */';
if(typeof window.ASTEROID_MAT === 'undefined') window.ASTEROID_MAT = null;
if(typeof window.ASTEROID_TEMPLATES === 'undefined') window.ASTEROID_TEMPLATES = [];

/* ---------- shaders : surface stellaire lointaine (06), étoiles de fond (07), nébuleuses (11) ---------- */
const STAR_VERT = `varying vec3 vNormal; varying vec3 vPos; varying vec3 vWorldPos;
  void main(){ vNormal = normalize(normalMatrix*normal); vPos = position; vec4 wp = modelMatrix*vec4(position, 1.0); vWorldPos = wp.xyz;
    gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }`;
const STAR_FRAG = `precision highp float; varying vec3 vNormal; varying vec3 vPos; varying vec3 vWorldPos;
  uniform vec3 baseColor; uniform float limbU; uniform float time; uniform float granulation; uniform float seed;
  float hash(vec3 p){ p = fract(p*0.3183099 + vec3(0.1,0.2,0.3)); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float noise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x), mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x), f.y),
               mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x), mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x), f.y), f.z); }
  float fbm(vec3 p){ float v=0.0, a=0.5; for(int i=0;i<3;i++){ v += a*noise(p); p *= 2.1; a *= 0.5; } return v; }
  void main(){
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float mu = clamp(dot(normalize(vNormal), normalize(viewDir)), 0.0, 1.0);
    float limb = 1.0 - limbU*(1.0 - mu);
    vec3 gp = normalize(vPos)*7.0 + vec3(seed);
    float gran = fbm(gp + vec3(0.0, 0.0, time*0.08));
    float cells = mix(1.0, 0.80 + 0.40*gran, granulation);
    float spot = smoothstep(0.62, 0.78, fbm(gp*0.45 + vec3(seed*1.7)));
    cells *= mix(1.0, 0.55, spot*granulation);
    vec3 col = baseColor*limb*cells;
    col = mix(col, col*vec3(1.15, 0.80, 0.58), (1.0-mu)*0.55);
    gl_FragColor = vec4(col, 1.0);
  }`;
const POINTS_VERT = `attribute float aSize; uniform float uPxScale; varying vec3 vColor;
  void main(){ vColor = color; vec4 mv = modelViewMatrix*vec4(position, 1.0); gl_PointSize = max(aSize*(uPxScale/max(-mv.z, 1.0)), 1.0); gl_Position = projectionMatrix*mv; }`;
const POINTS_FRAG = `precision highp float; uniform sampler2D map; uniform float uOpacity; varying vec3 vColor;
  void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vColor*t.a, t.a*uOpacity); }`;
const NEBULA_VERT = `attribute vec3 iPos; attribute float iSize; attribute float iAlpha; attribute vec3 iColIn; attribute vec3 iColOut; attribute vec4 iNoise;
  uniform float uTime; uniform float uFade;
  varying vec2 vCorner; varying vec3 vColIn; varying vec3 vColOut; varying float vAlpha; varying vec2 vNoiseUv; varying vec4 vMask;
  void main(){
    vec2 corner = position.xy; float ph = iNoise.x*6.2831853;
    vec3 drift = vec3(sin(uTime*0.05 + ph), cos(uTime*0.04 + ph*1.7), sin(uTime*0.035 + ph*2.3))*iSize*0.10;
    float breathe = 1.0 + 0.10*sin(uTime*0.07 + ph*3.1);
    vec4 mv = modelViewMatrix*vec4(iPos + drift, 1.0); mv.xy += corner*iSize*breathe; gl_Position = projectionMatrix*mv;
    vCorner = corner; vColIn = iColIn; vColOut = iColOut; vAlpha = iAlpha*uFade; vNoiseUv = iNoise.xy + (corner*0.5 + 0.5)*iNoise.z;
    vMask = vec4(float(iNoise.w < 0.5), float(iNoise.w >= 0.5 && iNoise.w < 1.5), float(iNoise.w >= 1.5 && iNoise.w < 2.5), float(iNoise.w >= 2.5));
  }`;
const NEBULA_FRAG = `precision highp float;
  varying vec2 vCorner; varying vec3 vColIn; varying vec3 vColOut; varying float vAlpha; varying vec2 vNoiseUv; varying vec4 vMask; uniform sampler2D uNoise;
  void main(){ float d2 = dot(vCorner, vCorner); if(d2 > 1.0) discard; float falloff = 1.0 - d2; float n = dot(texture2D(uNoise, vNoiseUv), vMask);
    float t = falloff*(0.35 + 0.75*n); float a = vAlpha*t*t; if(a < 0.002) discard; vec3 tint = mix(vColIn, vColOut, d2); gl_FragColor = vec4(tint*a, a); }`;
const PUFF_CORNERS = new Float32Array([-1,-1,0, 1,-1,0, 1,1,0, -1,-1,0, 1,1,0, -1,1,0]);

/* ---------- anneaux (modules 15 et 16) ---------- */
function buildRingGeometry(innerR, outerR, segments){
  const geo = new THREE.BufferGeometry(), positions = [], uvs = [], indices = [];
  for(let i = 0; i <= segments; i++){
    const th = (i/segments)*Math.PI*2, c = Math.cos(th), s = Math.sin(th);
    positions.push(c*innerR, s*innerR, 0); uvs.push(i/segments, 0);
    positions.push(c*outerR, s*outerR, 0); uvs.push(i/segments, 1);
  }
  for(let i = 0; i < segments; i++){ const a = i*2, b = i*2 + 1, c = i*2 + 2, d = i*2 + 3; indices.push(a, b, c, b, d, c); }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(indices);
  return geo;
}
function buildRingTexture(tag){
  const rng = rngFor(tag), h = 256, canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = h;
  const ctx = canvas.getContext('2d'), img = ctx.createImageData(1, h);
  const bands = 5 + Math.floor(rng()*6), phase = rng()*Math.PI*2, grain = 0.10 + rng()*0.10, tone = rng();
  const base = tone < 0.5 ? [214, 198, 168] : [206, 214, 222];
  for(let y = 0; y < h; y++){
    const t = y/(h - 1); let v = 0.5 + 0.30*Math.sin(t*bands*Math.PI*2 + phase); v += Math.sin(t*97.0 + phase*3.0)*grain*0.4; v = Math.max(0, Math.min(1, v));
    const edge = Math.min(t/0.05, (1 - t)/0.05, 1), i = y*4;
    img.data[i] = base[0]; img.data[i + 1] = base[1]; img.data[i + 2] = base[2]; img.data[i + 3] = Math.round(Math.max(0, v*edge)*255);
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas); tex.needsUpdate = true; return tex;
}

/* ---------- score de « spectacle » d'un système (séquence de titre du jeu, 20i) ---------- */
function scoreSystem(info){
  if(!info || !info.planets.length) return -1;
  let s = 0;
  info.planets.forEach(p => { s += (p.rings ? 3 : 0) + Math.min(p.moons, 3)*1.2 + (p.gas ? .8 : 0) + (p.hab ? 2 : 0) + (p.kind === 'ocean' || p.kind === 'continental' ? .6 : 0); });
  if(info.temp > 9000) s += 2; else if(info.temp < 3800) s += .6;
  if(/I/.test(String(info.lumLabel || '')) && !/V/.test(String(info.lumLabel || ''))) s += 2;
  if(info.planets.length >= 3) s += 1;
  return s;
}
CO.scoreSystem = scoreSystem;

/* =====================================================================
   MONDE
   ===================================================================== */
CO.create = function(opts){
  opts = opts || {};
  const SEED = String(opts.seed || 'COSMOS');
  const W = { seed: SEED, leg: null, T: 0, cloudT: 0, timeScale: opts.timeScale || 40, galPos: new V3() };
  const portPrefix = opts.portPrefix !== undefined ? opts.portPrefix : 'Port ';
  const density = clamp(opts.starDensity !== undefined ? opts.starDensity : 1, .05, 1);
  const noiseTex = makeNoiseTexture(SEED, 256);

  /* ---------- couche galactique ---------- */
  const galScene = new THREE.Scene();
  galScene.fog = new THREE.FogExp2(0x0b1220, 0.00026);
  const galCam = new THREE.PerspectiveCamera(55, 1, 0.1, 6000);
  const backdrop = new THREE.Group(); galScene.add(backdrop);
  W.galScene = galScene; W.galCam = galCam; W.backdrop = backdrop;

  const STAR_SAMPLE = (function(){ const rng = rngFor(SEED + ':starsample'), out = new Array(3000);
    for(let i = 0; i < 3000; i++){ const s = generateStar(rng); out[i] = { r: s.color.r, g: s.color.g, b: s.color.b, lum: s.lum }; } return out; })();
  function buildStarLayer(tag, count, rMin, rMax, sizeScale, o){
    count = Math.max(1, Math.round(count*density));
    const rng = rngFor(SEED + ':' + tag), pos = new Float32Array(count*3), col = new Float32Array(count*3), size = new Float32Array(count);
    for(let i = 0; i < count; i++){
      const r = rMin + rng()*(rMax - rMin), th = rng()*Math.PI*2, ph = Math.acos(2*rng() - 1);
      pos[i*3] = r*Math.sin(ph)*Math.cos(th); pos[i*3 + 1] = r*Math.sin(ph)*Math.sin(th); pos[i*3 + 2] = r*Math.cos(ph);
      const st = STAR_SAMPLE[(rng()*STAR_SAMPLE.length) | 0]; col[i*3] = st.r; col[i*3 + 1] = st.g; col[i*3 + 2] = st.b;
      const mag = apparentMagnitude(st.lum, r/38), br = Math.pow(10, -0.4*(mag - 6.0));
      size[i] = sizeScale*clamp(Math.pow(br, 0.22), 0.35, 4.5);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: glow }, uOpacity: { value: o.opacity }, uPxScale: { value: o.pxScale } },
      vertexShader: POINTS_VERT, fragmentShader: POINTS_FRAG, transparent: true, depthWrite: false, vertexColors: true, blending: THREE.AdditiveBlending, fog: false });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = -1000; backdrop.add(pts);
  }
  buildStarLayer('skybox', 95000, 2400, 4200, 1.45, { opacity: .70, pxScale: 6500 });
  buildStarLayer('skybox2', 70000, 1900, 3600, 1.20, { opacity: .62, pxScale: 6500 });
  buildStarLayer('skybox3', 52000, 1500, 3100, 1.00, { opacity: .55, pxScale: 6200 });
  buildStarLayer('dust', 58000, 700, 2300, 1.10, { opacity: .62, pxScale: 3800 });
  buildStarLayer('dust2', 24000, 380, 1100, 0.95, { opacity: .55, pxScale: 2100 });
  buildStarLayer('accent', 900, 500, 2600, 3.0, { opacity: .95, pxScale: 3600 });

  function buildNebulaCluster(type, rng, o){
    const n = o.puffCount || (55 + Math.floor(rng()*55)), radius = o.radius || (420 + rng()*380);
    const iPos = new Float32Array(n*3), iSize = new Float32Array(n), iAlpha = new Float32Array(n), iColIn = new Float32Array(n*3), iColOut = new Float32Array(n*3), iNoise = new Float32Array(n*4);
    const ax = 0.6 + rng()*0.9, ay = 0.45 + rng()*0.8, az = 0.6 + rng()*0.9;
    const cIn = new THREE.Color(type.colorA), cOut = new THREE.Color(type.colorB), c = new THREE.Color();
    for(let i = 0; i < n; i++){
      const u = Math.pow(rng(), 0.62), th = rng()*Math.PI*2, ph = Math.acos(2*rng() - 1), r = u*radius;
      iPos[i*3] = r*Math.sin(ph)*Math.cos(th)*ax; iPos[i*3 + 1] = r*Math.sin(ph)*Math.sin(th)*ay; iPos[i*3 + 2] = r*Math.cos(ph)*az;
      const core = 1.0 - u;
      iSize[i] = radius*(0.28 + rng()*0.42)*(0.55 + core*0.75); iAlpha[i] = (0.10 + rng()*0.16)*(0.4 + core*0.9);
      c.copy(cIn).lerp(cOut, rng()*0.45); c.offsetHSL((rng() - 0.5)*0.05, (rng() - 0.5)*0.15, (rng() - 0.5)*0.12);
      iColIn[i*3] = c.r; iColIn[i*3 + 1] = c.g; iColIn[i*3 + 2] = c.b;
      c.copy(cOut).offsetHSL((rng() - 0.5)*0.06, 0, (rng() - 0.5)*0.10);
      iColOut[i*3] = c.r; iColOut[i*3 + 1] = c.g; iColOut[i*3 + 2] = c.b;
      iNoise[i*4] = rng(); iNoise[i*4 + 1] = rng(); iNoise[i*4 + 2] = 0.35 + rng()*0.75; iNoise[i*4 + 3] = Math.floor(rng()*4);
    }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(PUFF_CORNERS, 3));
    geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(iPos, 3)); geo.setAttribute('iSize', new THREE.InstancedBufferAttribute(iSize, 1));
    geo.setAttribute('iAlpha', new THREE.InstancedBufferAttribute(iAlpha, 1)); geo.setAttribute('iColIn', new THREE.InstancedBufferAttribute(iColIn, 3));
    geo.setAttribute('iColOut', new THREE.InstancedBufferAttribute(iColOut, 3)); geo.setAttribute('iNoise', new THREE.InstancedBufferAttribute(iNoise, 4));
    geo.instanceCount = n; geo.boundingSphere = new THREE.Sphere(new V3(), radius*2.2);
    const mat = new THREE.ShaderMaterial({ vertexShader: NEBULA_VERT, fragmentShader: NEBULA_FRAG,
      uniforms: { uNoise: { value: noiseTex }, uTime: { value: 0 }, uFade: { value: o.fade !== undefined ? o.fade : 1.0 } },
      transparent: true, depthWrite: false, depthTest: o.depthTest !== undefined ? o.depthTest : true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation });
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = o.renderOrder || 0;
    return mesh;
  }
  (function(){ const rng = rngFor(SEED + ':backdrop-neb');
    for(let i = 0; i < 9; i++){
      const type = NEBULA_TYPES[Math.floor(rng()*NEBULA_TYPES.length)];
      const neb = buildNebulaCluster(type, rng, { radius: 900 + rng()*1100, puffCount: 45 + Math.floor(rng()*45), fade: 0.30 + rng()*0.30, depthTest: false, renderOrder: -10 });
      const r = 3000 + rng()*1400, th = rng()*Math.PI*2, ph = Math.acos(2*rng() - 1);
      neb.position.set(r*Math.sin(ph)*Math.cos(th), r*Math.sin(ph)*Math.sin(th), r*Math.cos(ph));
      backdrop.add(neb);
    } })();

  /* cellules stellaires et nébuleuses (module 12) */
  const STAR_CELL = 190, STAR_RADIUS = 3, NEBULA_CELL = 1600, NEBULA_RADIUS = 1;
  const starField = new Map(), nebulaField = new Map(), starCache = new Map();
  W.STAR_CELL = STAR_CELL; W.starField = starField; W.nebulaField = nebulaField;
  function starData(ix, iy, iz){
    const key = ix + ',' + iy + ',' + iz;
    if(starCache.has(key)) return starCache.get(key);
    const rng = rngFor(SEED + ':star:' + ix + ':' + iy + ':' + iz);
    let data = null;
    if(rng() <= 0.5){
      const ox = (rng() - 0.5)*STAR_CELL*0.85, oy = (rng() - 0.5)*STAR_CELL*0.85, oz = (rng() - 0.5)*STAR_CELL*0.85;
      const star = generateStar(rng), name = generateName(rng), seedNoise = rng()*100;
      data = { position: new V3(ix*STAR_CELL + ox, iy*STAR_CELL + oy, iz*STAR_CELL + oz), star, name, seedNoise, cell: key };
    }
    if(starCache.size > 20000) starCache.clear();
    starCache.set(key, data);
    return data;
  }
  W.starData = starData;
  function buildStarCell(ix, iy, iz){
    const data = starData(ix, iy, iz); if(!data) return null;
    const star = data.star, group = new THREE.Group(); group.position.copy(data.position);
    const baseCore = 1.4*Math.pow(star.radius, 0.42), color = new THREE.Color(star.color.r, star.color.g, star.color.b);
    const coreMat = new THREE.ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, uniforms: {
      baseColor: { value: color }, limbU: { value: 0.45 + 0.3*Math.exp(-star.temp/9000) }, time: { value: 0 },
      granulation: { value: star.temp < 7000 ? 1.0 : 0.25 }, seed: { value: data.seedNoise } } });
    const core = new THREE.Mesh(new THREE.SphereGeometry(baseCore, 24, 24), coreMat); group.add(core);
    const baseHalo = baseCore*(3.0 + 1.6*Math.log10(1 + star.lum));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(baseHalo); group.add(halo);
    galScene.add(group);
    return { mesh: group, core, halo, baseCore, baseHalo, name: data.name, star, cell: data.cell };
  }
  function buildNebulaCell(ix, iy, iz){
    const rng = rngFor(SEED + ':nebula:' + ix + ':' + iy + ':' + iz);
    if(rng() > 0.42) return null;
    const off = new V3((rng() - 0.5)*NEBULA_CELL*0.7, (rng() - 0.5)*NEBULA_CELL*0.7, (rng() - 0.5)*NEBULA_CELL*0.7);
    const typeIdx = Math.floor(rng()*NEBULA_TYPES.length), type = NEBULA_TYPES[typeIdx], name = generateName(rng);
    const center = new V3(ix*NEBULA_CELL + off.x, iy*NEBULA_CELL + off.y, iz*NEBULA_CELL + off.z);
    const mesh = buildNebulaCluster(type, rng, { radius: 420 + rng()*480, puffCount: 55 + Math.floor(rng()*60), fade: 0 });
    mesh.position.copy(center); mesh.userData.targetFade = 1.0; mesh.userData.currentFade = 0;
    galScene.add(mesh);
    return { mesh, name, type: type.name, typeIdx, isNebula: true, center };
  }
  function disposeObj(o){ o.traverse(c => { if(c.geometry) c.geometry.dispose(); if(c.material) c.material.dispose(); }); }
  function refreshField(cellSize, radius, map, build){
    const p = W.galPos, cx = Math.round(p.x/cellSize), cy = Math.round(p.y/cellSize), cz = Math.round(p.z/cellSize), active = new Set();
    for(let dx = -radius; dx <= radius; dx++) for(let dy = -radius; dy <= radius; dy++) for(let dz = -radius; dz <= radius; dz++){
      const ix = cx + dx, iy = cy + dy, iz = cz + dz, key = ix + ',' + iy + ',' + iz;
      active.add(key); if(!map.has(key)) map.set(key, build(ix, iy, iz));
    }
    map.forEach((o, key) => { if(!active.has(key)){ if(o && o.mesh){ galScene.remove(o.mesh); disposeObj(o.mesh); } map.delete(key); } });
  }
  W.refreshGalaxy = function(){ refreshField(STAR_CELL, STAR_RADIUS, starField, buildStarCell); refreshField(NEBULA_CELL, NEBULA_RADIUS, nebulaField, buildNebulaCell); };

  /* ---------- couche système (mètres, étoile hôte à l'origine) ---------- */
  const sysScene = new THREE.Scene();
  const sysWorld = new THREE.Group(); sysWorld.name = 'sysWorld'; sysScene.add(sysWorld);
  sysScene.add(new THREE.AmbientLight(0x141c2e, 0.55));
  const sunLight = new THREE.DirectionalLight(0xdfe8ff, 1.65); sysScene.add(sunLight); sysScene.add(sunLight.target);
  const rcam = new THREE.PerspectiveCamera();
  W.sysScene = sysScene; W.sysWorld = sysWorld; W.sunLight = sunLight;
  const SLB = [.2, 400, 8e5, 1.6e9, 3.2e12, 6.4e15, 1.3e19], SLS = [1, 1, 800, 1.6e6, 3.2e9, 6.4e12];
  W.stats = { calls: 0, triangles: 0, slices: 0 };
  const extras = [];   /* objets ajoutés par l'hôte (amas d'astéroïdes…) : { position, radius } pour les tranches */

  function generateSystemData(leg){
    const rng = rngFor(SEED + ':system:' + leg.cell);
    const count = 2 + Math.floor(rng()*2), habIdx = Math.floor(rng()*count);
    const planeNormal = new V3(rng() - 0.5, (rng() - 0.5)*0.35, rng() - 0.5).normalize();
    const ref = Math.abs(planeNormal.y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0);
    const u = new V3().crossVectors(ref, planeNormal).normalize(), v = new V3().crossVectors(planeNormal, u).normalize();
    const kinds = [];
    for(let i = 0; i < count; i++){
      const isHab = i === habIdx;
      const kind = isHab ? PLANET_KINDS[Math.floor(rng()*HABITABLE_KIND_COUNT)] : PLANET_KINDS[Math.floor(rng()*PLANET_KINDS.length)];
      kinds.push({ kind, radius: kind.gas ? (200 + rng()*120) : (100 + rng()*100), isHab });
    }
    const GAP_MIN = 400, GAP_RANGE = 480, ORBIT_GROWTH = 1.65, planets = [];
    let orbit = 780 + rng()*380;
    for(let i = 0; i < count; i++){
      if(i > 0){ const geometric = orbit*ORBIT_GROWTH, safeFloor = orbit + kinds[i - 1].radius + kinds[i].radius + (GAP_MIN + rng()*GAP_RANGE); orbit = Math.max(geometric, safeFloor); }
      const { isHab, kind, radius } = kinds[i];
      const angle = rng()*Math.PI*2;
      const worldPos = leg.starPosition.clone().add(u.clone().multiplyScalar(Math.cos(angle)*orbit).addScaledVector(v, Math.sin(angle)*orbit));
      const oceanFrac = kind.gas ? 0 : clamp(kind.ocean + (rng() - 0.5)*0.22, 0, 0.92);
      const p = { kind, name: kind.name, properName: generateName(rng) + ' ' + toRoman(i + 1), radius, position: worldPos, oceanFrac,
        spinSpeed: (0.05 + rng()*0.10)*(rng() < 0.5 ? 1 : -1), spinAngle: rng()*Math.PI*2, tilt: (rng() - 0.5)*0.6,
        moonCount: kind.gas ? Math.floor(rng()*3) : (rng() < 0.4 ? 1 : 0), seedNoise: rng()*1000, hueShift: rng(),
        hasAtmosphere: !!kind.atmo, hasRings: kind.gas && rng() < 0.5, ringSeed: rng()*1000, isHabitable: isHab };
      if(isHab){
        p.cityName = generateName(rng); p.portName = portPrefix + p.cityName;
        const lat = (rng() - 0.5)*Math.PI*0.65, lon = rng()*Math.PI*2;
        p.portLocal = new V3(Math.cos(lat)*Math.cos(lon), Math.sin(lat), Math.cos(lat)*Math.sin(lon));
      }
      planets.push(p);
    }
    let asteroidBelt = null;
    if(planets.length >= 2 && rng() < 0.4){
      const byDist = planets.map(p => ({ p, d: p.position.distanceTo(leg.starPosition) })).sort((a, b) => a.d - b.d);
      const gi = Math.floor(rng()*(byDist.length - 1));
      const inner = byDist[gi].d + byDist[gi].p.radius + 60, outer = byDist[gi + 1].d - byDist[gi + 1].p.radius - 60;
      if(outer > inner + 150) asteroidBelt = { inner, outer, count: 240 + Math.floor(rng()*260) };
    }
    return { planets, habIdx, asteroidBelt };
  }
  function realizeSystem(leg){
    const sys = leg.system, st = leg.star, r = rngFor(SEED + ':real:' + leg.cell);
    leg.Rs = Math.max(.008, st.radius || 1)*RSUN; leg.lum = Math.max(1e-4, st.lum || 1);
    const n = sys.planets.length, hi = sys.habIdx, aHZ = Math.sqrt(leg.lum)*AU;
    const engD = sys.planets.map(p => p.position.length()), a = new Array(n);
    a[hi] = aHZ*(.95 + .25*r());
    for(let i = hi + 1; i < n; i++) a[i] = a[i - 1]*(1.5 + .7*r());
    for(let i = hi - 1; i >= 0; i--) a[i] = a[i + 1]/(1.5 + .7*r());
    const off = Math.max(1, (leg.Rs*8)/a[0]); for(let i = 0; i < n; i++) a[i] *= off;
    sys.planets.forEach((p, i) => {
      const dir = p.position.clone().normalize();
      p.engineRadius = p.radius;
      p.radius = p.kind.gas ? REARTH*(3.8 + (p.radius - 200)/120*8) : REARTH*(.45 + (p.radius - 100)/100*1.2);
      p.position.copy(dir).multiplyScalar(a[i]); p.orbitA = a[i];
      p.mass = (p.kind.gas ? 1300 : 5500)*4/3*Math.PI*Math.pow(p.radius, 3); p.GM = GRAV*p.mass;
      p.dayLen = (p.kind.gas ? 9 + 8*r() : 16 + 28*r())*3600*(r() < .12 ? -1 : 1);
    });
    if(sys.asteroidBelt){
      const map = d => { let i = 0; while(i < n - 2 && engD[i + 1] < d) i++; const x = clamp((d - engD[i])/Math.max(1, engD[i + 1] - engD[i]), 0, 1); return a[i]*Math.pow(a[i + 1]/a[i], x); };
      leg.beltInfo = { inner: map(sys.asteroidBelt.inner), outer: map(sys.asteroidBelt.outer) };
    }
    leg.realized = true;
  }
  function localLeg(sd){
    return { name: sd.name, designation: sd.star.designation, gal: sd.position.clone(), position: new V3(), starPosition: new V3(), cell: sd.cell, star: sd.star };
  }
  function legFor(cell){
    const c = String(cell).split(',').map(Number), sd = starData(c[0], c[1], c[2]); if(!sd) return null;
    const leg = localLeg(sd);
    leg.system = generateSystemData(leg); leg.planets = leg.system.planets; leg.hab = leg.planets[leg.system.habIdx];
    realizeSystem(leg);
    return leg;
  }
  function planeBasis(cell){
    const n = rngFor(SEED + ':system:' + cell), a = 2 + Math.floor(2*n()); Math.floor(n()*a);
    const r = new V3(n() - .5, .35*(n() - .5), n() - .5).normalize(), i = Math.abs(r.y) < .9 ? new V3(0, 1, 0) : new V3(1, 0, 0);
    const s = new V3().crossVectors(i, r).normalize(), l = new V3().crossVectors(r, s).normalize(); return { s, l, n: r };
  }
  const SYS_INFO = new Map();
  W.systemInfo = function(cell){
    let e = SYS_INFO.get(cell); if(e) return e;
    const leg = legFor(cell); if(!leg) return null;
    const B = planeBasis(cell), st = leg.star, aHZ = Math.sqrt(leg.lum)*AU;
    e = { cell, name: leg.name, designation: leg.designation, color: [st.color.r, st.color.g, st.color.b], lum: leg.lum, Rs: leg.Rs, temp: st.temp, mass: st.mass, lumLabel: st.lumLabel,
      gal: leg.gal.toArray(), basis: { s: B.s.toArray(), l: B.l.toArray() }, hz: [aHZ*.8, aHZ*1.4], belt: leg.beltInfo ? [leg.beltInfo.inner, leg.beltInfo.outer] : null,
      planets: leg.planets.map((p, i) => ({ i, name: p.properName, kind: p.kind.key, gas: !!p.kind.gas, R: p.radius, a: p.orbitA, ang: Math.atan2(p.position.dot(B.l), p.position.dot(B.s)),
        moons: p.moonCount || 0, rings: !!p.hasRings, hab: !!p.isHabitable, atmo: !!p.hasAtmosphere, day: p.dayLen })) };
    SYS_INFO.set(cell, e); if(SYS_INFO.size > 120) SYS_INFO.delete(SYS_INFO.keys().next().value);
    return e;
  };
  /* les n systèmes les plus spectaculaires autour d'une cellule (score de la séquence de titre), de proche en proche */
  W.pickSystems = function(n, radius, center){
    n = n || 4; radius = radius || 2; center = center || [0, 0, 0];
    const all = [];
    for(let x = -radius; x <= radius; x++) for(let y = -radius; y <= radius; y++) for(let z = -radius; z <= radius; z++){
      const sd = starData(center[0] + x, center[1] + y, center[2] + z); if(!sd) continue;
      const info = W.systemInfo(sd.cell), sc = scoreSystem(info); if(sc > 0) all.push({ cell: sd.cell, info, score: sc, pos: sd.position });
    }
    all.sort((a, b) => b.score - a.score);
    const top = all.slice(0, n); if(!top.length) return [];
    const ord = [top.shift()];
    while(top.length){ const last = ord[ord.length - 1].pos; let bi = 0, bd = Infinity; top.forEach((c, i) => { const d = c.pos.distanceTo(last); if(d < bd){ bd = d; bi = i; } }); ord.push(top.splice(bi, 1)[0]); }
    return ord;
  };

  /* maillages d'un système : planètes (remplacées par planets.js), anneaux, lunes — ni balise de port, ni station */
  function buildSystemMeshes(leg){
    const group = new THREE.Group();
    leg.planets.forEach(p => {
      const pg = new THREE.Group(); pg.position.copy(p.position); pg.rotation.z = p.tilt;
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(p.radius, 40, 28), new THREE.MeshBasicMaterial());
      mesh.rotation.y = p.spinAngle; pg.add(mesh); p.mesh = mesh;
      if(p.hasRings){
        const ringInner = p.radius*1.5, ringOuter = p.radius*(2.25 + (p.ringSeed % 100)/100*0.85);
        const ring = new THREE.Mesh(buildRingGeometry(ringInner, ringOuter, 72), new THREE.MeshBasicMaterial({
          map: buildRingTexture(SEED + ':ring:' + leg.cell + ':' + p.seedNoise), transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.88 }));
        ring.rotation.x = Math.PI/2; ring.rotation.y = ((p.ringSeed % 137)/137 - 0.5)*0.5;
        pg.add(ring); p.ring = ring; p.ringOuter = ringOuter;
      }
      p.moonPivots = [];
      const moonRng = rngFor(SEED + ':moons:' + leg.cell + ':' + p.seedNoise);
      for(let m = 0; m < p.moonCount; m++){
        const pivot = new THREE.Object3D();
        pivot.rotation.x = (moonRng() - 0.5)*0.8; pivot.rotation.z = moonRng()*Math.PI*2;
        const moonR = p.radius*(0.18 + moonRng()*0.12), orbitR = p.radius*(2.2 + moonRng()*1.8 + m*1.4);
        const moon = new THREE.Mesh(new THREE.SphereGeometry(moonR, 12, 10), new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL(0.08, 0.12, 0.45 + moonRng()*0.2), roughness: 0.9, metalness: 0.05 }));
        moon.position.set(orbitR, 0, 0); pivot.add(moon);
        pivot.userData.speed = (0.15 + moonRng()*0.2)*(moonRng() < 0.5 ? 1 : -1);
        pivot.userData.moonName = p.properName + ' ' + String.fromCharCode(97 + m);
        pg.add(pivot); p.moonPivots.push(pivot);
      }
      group.add(pg); p.group = pg;
    });
    return group;
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
  function orbitNormal(leg){
    const n = new V3(); for(let i = 0; i + 1 < leg.planets.length; i++) n.add(new V3().crossVectors(leg.planets[i].position, leg.planets[i + 1].position).normalize());
    if(n.lengthSq() < 1e-6) n.set(0, 1, 0); if(n.y < 0) n.negate(); return n.normalize();
  }
  function disposeGroup(grp){
    if(window.__AST) window.__AST.detachShared(grp);
    grp.traverse(o => { if(o.geometry) o.geometry.dispose(); if(o.material){ (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
      if(m.map && m.map !== glow && m.map !== window.glowTex) m.map.dispose();   /* textures d'anneaux ; jamais la lueur partagée */
      m.dispose(); }); } });
  }
  function disposeLeg(leg){
    if(!leg || !leg.group) return;
    extras.splice(0).forEach(x => { if(x.group.parent) x.group.parent.remove(x.group); });
    if(window.__AST) window.__AST.detachShared(leg.group);
    if(leg.star3){ window.__STARS.dispose(leg.star3); leg.star3 = null; }
    sysWorld.remove(leg.group); disposeGroup(leg.group); leg.group = null;
  }
  W.enter = function(cell){
    if(W.leg){ disposeLeg(W.leg); W.leg = null; }
    const leg = legFor(cell); if(!leg) return null;
    leg.group = buildSystemMeshes(leg); sysWorld.add(leg.group);
    leg.sunColor = new THREE.Color(leg.star.color.r, leg.star.color.g, leg.star.color.b);
    if(!window.__AST.ready) window.__AST.init(SEED);
    leg.planets.forEach(p => window.__PLANETS.enhance(p));
    window.__AST.apply(leg);
    realizeMoons(leg);
    leg.star3 = window.__STARS.create(leg, window.__PLANETS.PIX, leg.group); leg.group.add(leg.star3.root);
    leg.orbitN = orbitNormal(leg);
    W.leg = leg; W.galPos.copy(leg.gal); W.hideCell = leg.cell;
    W.refreshGalaxy();
    return leg;
  };
  W.legFor = legFor;

  /* amas d'astéroïdes : dans la ceinture du système, ou à défaut entre deux orbites (décor de premier plan) */
  W.beltCluster = function(angle, opt){
    const leg = W.leg; if(!leg || !window.__AST.ready) return null;
    opt = opt || {};
    const N = leg.orbitN, ref = Math.abs(N.y) < .9 ? new V3(0, 1, 0) : new V3(1, 0, 0);
    const s = new V3().crossVectors(ref, N).normalize(), l = new V3().crossVectors(N, s).normalize();
    let rad;
    if(leg.beltInfo) rad = (leg.beltInfo.inner + leg.beltInfo.outer)/2;
    else { const a = leg.planets.map(p => p.orbitA).sort((x, y) => x - y); rad = a.length > 1 ? Math.sqrt(a[0]*a[1]) : a[0]*1.6; }
    const ang = angle !== undefined ? angle : 0;
    const pos = s.clone().multiplyScalar(Math.cos(ang)*rad).addScaledVector(l, Math.sin(ang)*rad);
    const Rmain = opt.R || 2.5e3;
    const seed = (xmur3(SEED + ':belt:' + leg.cell + ':' + ang.toFixed(3))() >>> 0);
    const cl = window.__AST.cluster(seed, Rmain); if(!cl) return null;
    cl.group.position.copy(pos); leg.group.add(cl.group);
    const x = { group: cl.group, position: pos, R: Rmain, radius: Rmain*14, rocks: cl.rocks };
    extras.push(x);
    return x;
  };

  /* ---------- mise à jour par image ---------- */
  const _sun = new V3(), _white = new THREE.Color(1, 1, 1), _buf = new THREE.Vector2();
  let chunk = 0;
  W.bodies = function(){
    const out = [], leg = W.leg; if(!leg) return out;
    leg.planets.forEach(p => { out.push({ pos: p.position, r: p.radius }); (p.moonPivots || []).forEach(pv => { const m = pv.children[0]; if(m) out.push({ pos: m.getWorldPosition(new V3()), r: m.scale.x*1.02 }); }); });
    return out;
  };
  W.update = function(dt, camera, renderer){
    const leg = W.leg; W.T += dt; W.cloudT += dt;
    camera.updateMatrixWorld();
    /* couche galactique : caméra à la position galactique du système, orientée comme la caméra du système */
    if(leg) W.galPos.copy(leg.gal).addScaledVector(camera.position, 1/UNIT_GAL);
    galCam.position.copy(W.galPos); galCam.quaternion.copy(camera.quaternion);
    galCam.fov = camera.fov; galCam.aspect = camera.aspect; galCam.zoom = camera.zoom; galCam.near = .1; galCam.far = 6000;
    galCam.updateProjectionMatrix(); galCam.updateMatrixWorld();
    backdrop.position.copy(galCam.position);
    chunk += dt; if(chunk > .5){ chunk = 0; W.refreshGalaxy(); }
    const gp = galCam.position;
    starField.forEach((o, key) => {
      if(!o) return;
      if(key === W.hideCell){ o.mesh.visible = false; return; }
      o.mesh.visible = true;
      const d = o.mesh.position.distanceTo(gp), mag = apparentMagnitude(o.star.lum, Math.max(d/38, 1e-3));
      const perceived = clamp(Math.pow(Math.pow(10, -0.4*(mag - 4.0)), 0.25), 0, 6);
      o.core.scale.setScalar(clamp(o.baseCore*26/Math.max(d, 1), 0.3, 9.0));
      o.core.material.uniforms.time.value = W.T;
      o.halo.scale.setScalar(o.baseHalo*(0.55 + perceived*0.55));
      o.halo.material.opacity = clamp(0.25 + perceived*0.35, 0.15, 1.0);
    });
    nebulaField.forEach(o => {
      if(!o) return;
      o.mesh.material.uniforms.uTime.value = W.T;
      const ud = o.mesh.userData;
      if(ud.currentFade < ud.targetFade - 0.001){ ud.currentFade += (ud.targetFade - ud.currentFade)*Math.min(1, dt*0.5); o.mesh.material.uniforms.uFade.value = ud.currentFade; }
    });
    backdrop.children.forEach(c => { if(c.material && c.material.uniforms && c.material.uniforms.uTime) c.material.uniforms.uTime.value = W.T; });
    if(!leg) return;
    /* système : rotation propre accélérée (comme la séquence de titre), lunes képlériennes, soleil */
    const k = W.timeScale;
    leg.planets.forEach(p => {
      if(!p.mesh) return;
      p.mesh.rotation.y += 2*Math.PI/p.dayLen*dt*k;
      if(p.fx) window.__PLANETS.update(p, new V3(), leg.sunColor, W.T, camera.position, W.cloudT);
      (p.moonPivots || []).forEach(m => m.rotation.y += (m.userData.n || 0)*dt*k);
    });
    if(leg.star3) leg.star3.lastOcc = window.__STARS.update(leg.star3, W.T, dt, camera, W.bodies());
    if(renderer) window.__PLANETS.setPixelAngle(camera.fov, renderer.getDrawingBufferSize(_buf).y);
    _sun.copy(camera.position).negate().normalize();
    sunLight.position.copy(_sun); sunLight.target.position.set(0, 0, 0); sunLight.target.updateMatrixWorld();
    sunLight.color.copy(leg.sunColor).lerp(_white, .45);
  };

  /* ---------- rendu : couche galactique, puis tranches du système (loin → proche) ---------- */
  function units(camera){
    const out = [], leg = W.leg; if(!leg) return out;
    leg.planets.forEach(p => { out.push([p.position, p.radius*(p.hasRings ? 3.4 : 1.12)]);
      (p.moonPivots || []).forEach(pv => { const m = pv.children[0]; if(m) out.push([m.getWorldPosition(new V3()), m.scale.x*1.4]); }); });
    extras.forEach(x => out.push([x.position, x.radius]));
    if(leg.star3){ const S = leg.star3; out.push([S.root.position, Math.max(S.Rs*8, S.glare.scale.x*.75, S.glare2.scale.x*.75) + S.glare.position.length()]); }
    return out;
  }
  W.render = function(renderer, camera){
    const Rn = renderer, autoClear = Rn.autoClear;
    Rn.autoClear = false; Rn.clear(true, true, true);
    let calls = 0, tris = 0, n = 0;
    Rn.render(galScene, galCam); calls += Rn.info.render.calls; tris += Rn.info.render.triangles;
    if(W.leg){
      const cp = camera.position;
      rcam.position.set(0, 0, 0); rcam.quaternion.copy(camera.quaternion);
      rcam.fov = camera.fov; rcam.aspect = camera.aspect; rcam.zoom = camera.zoom;
      let used = 0;
      units(camera).forEach(u => { const dd = u[0].distanceTo(cp), lo = Math.max(dd - u[1], SLB[0]), hi = dd + u[1];
        for(let i = 0; i < SLB.length - 1; i++) if(hi > SLB[i] && lo < SLB[i + 1]) used |= 1 << i; });
      let curS = -1;
      for(let i = SLB.length - 2; i >= 0; i--){
        if(!(used & (1 << i))) continue;
        const s = SLS[i];
        if(s !== curS){ curS = s; sysWorld.scale.setScalar(1/s); sysWorld.position.copy(cp).multiplyScalar(-1/s); sysWorld.updateMatrixWorld(); }
        rcam.near = SLB[i]/s; rcam.far = SLB[i + 1]*1.00002/s; rcam.updateProjectionMatrix();
        Rn.clearDepth(); Rn.render(sysScene, rcam); calls += Rn.info.render.calls; tris += Rn.info.render.triangles; n++;
      }
      sysWorld.scale.setScalar(1); sysWorld.position.set(0, 0, 0); sysWorld.updateMatrixWorld();
      W.stats.used = used;
    }
    Rn.autoClear = autoClear;
    W.stats.calls = calls; W.stats.triangles = tris; W.stats.slices = n;
  };

  W.dispose = function(){
    if(W.leg){ disposeLeg(W.leg); W.leg = null; }
    starField.forEach(o => { if(o && o.mesh){ galScene.remove(o.mesh); disposeObj(o.mesh); } }); starField.clear();
    nebulaField.forEach(o => { if(o && o.mesh){ galScene.remove(o.mesh); disposeObj(o.mesh); } }); nebulaField.clear();
    disposeObj(backdrop); noiseTex.dispose();
  };
  return W;
};
CO.smooth = smooth;
})();
