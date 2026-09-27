/* =====================================================================
   ÉTOILES DE SYSTÈME — rendu « cinéma »
   - soleils à leur taille réelle (rayon du moteur × R☉) : éclipses totales par les lunes, transits
   - photosphère : granulation animée, assombrissement centre-bord, facules, taches (ombre + pénombre)
   - chromosphère (liseré H-alpha), couronne à jets (streamers) face caméra
   - protubérances en arches magnétiques, éruptions : flash, arche qui s'arrache, éjection de masse coronale
   - halo lumineux modulé par l'occultation (lunes / planètes) → couronne visible pendant la totalité
   ===================================================================== */
(function(){
'use strict';
const ST = window.__STARS = {};
const V3 = THREE.Vector3;

/* ---------- rayon réel (données du moteur, en rayons solaires) et activité selon la classe ---------- */
const RSUN = 6.957e8;
ST.radiusFor = function(star){ return Math.max(.008, (star && star.radius) || 1)*RSUN; };
function activity(des){
  const c = des[0];
  if(c === 'M') return { gran:1.0, spots:2, prom:3, flareEvery:[16, 34], flarePower:1.6, corona:.8, limb:.62 };
  if(c === 'K') return { gran:1.0, spots:5, prom:6, flareEvery:[28, 55], flarePower:1.0, corona:1.0, limb:.6 };
  if(c === 'G') return { gran:1.0, spots:6, prom:8, flareEvery:[26, 50], flarePower:1.0, corona:1.1, limb:.56 };
  if(c === 'F') return { gran:.8,  spots:4, prom:6, flareEvery:[34, 64], flarePower:.9, corona:1.1, limb:.5 };
  if(c === 'D') return { gran:.2,  spots:0, prom:0, flareEvery:[90, 140], flarePower:.5, corona:.6, limb:.3 };
  return { gran:.35, spots:1, prom:3, flareEvery:[45, 90], flarePower:.8, corona:1.3, limb:.38 };   // A, B, O
}
ST.isSunLike = star => /^[FGK]\d? ?.*V/.test((star && star.designation) || '') || /^[FGK]/.test((star && star.designation) || '');

/* ---------- GLSL commun ---------- */
const HASH = `
vec3 hash33(vec3 p){ p = vec3(dot(p, vec3(127.1,311.7,74.7)), dot(p, vec3(269.5,183.3,246.1)), dot(p, vec3(113.5,271.9,124.6))); return fract(sin(p)*43758.5453123); }
float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0,0.0)), f.x), mix(hash21(i + vec2(0.0,1.0)), hash21(i + vec2(1.0,1.0)), f.x), f.y); }
float fbm2(vec2 p){ float v = 0.0, a = 0.5; for(int i = 0; i < 5; i++){ v += a*n2(p); p = p*2.03 + 17.1; a *= 0.5; } return v; }
float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
  float a = hash33(i).x, b = hash33(i + vec3(1,0,0)).x, c = hash33(i + vec3(0,1,0)).x, d = hash33(i + vec3(1,1,0)).x;
  float e = hash33(i + vec3(0,0,1)).x, f1 = hash33(i + vec3(1,0,1)).x, g = hash33(i + vec3(0,1,1)).x, h = hash33(i + vec3(1,1,1)).x;
  return mix(mix(mix(a,b,f.x), mix(c,d,f.x), f.y), mix(mix(e,f1,f.x), mix(g,h,f.x), f.y), f.z); }
/* distances aux deux germes les plus proches (Worley) */
vec2 worley(vec3 p){
  vec3 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for(int x = -1; x <= 1; x++) for(int y = -1; y <= 1; y++) for(int z = -1; z <= 1; z++){
    vec3 g = vec3(float(x), float(y), float(z)); vec3 r = g + hash33(i + g) - f; float d = dot(r, r);
    if(d < d1){ d2 = d1; d1 = d; } else if(d < d2) d2 = d;
  }
  return vec2(sqrt(d1), sqrt(d2));
}`;

/* ---------- photosphère ---------- */
const PH_VERT = `
varying vec3 vN; varying vec3 vWN; varying vec3 vWP; varying float vWS;
void main(){ vWS = length(modelMatrix[0].xyz); vN = normal; vWN = normalize((modelMatrix*vec4(normal,0.0)).xyz); vec4 wp = modelMatrix*vec4(position,1.0); vWP = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }`;
const PH_FRAG = `
precision highp float;
varying vec3 vN; varying vec3 vWN; varying vec3 vWP; varying float vWS;
uniform vec3 uColor; uniform float uTime; uniform float uLimb; uniform float uGran; uniform float uRadius; uniform float uPixAng; uniform float uSeed;
uniform vec4 uSpot[6]; uniform vec4 uFlare; uniform float uFlareI;
${HASH}
void main(){
  vec3 n = normalize(vN), N = normalize(vWN), V = normalize(cameraPosition - vWP);
  float mu = clamp(dot(N, V), 0.0, 1.0);
  float fp = length(cameraPosition - vWP)*uPixAng/(uRadius*vWS);
  /* granulation : cellules de convection, lanes sombres ; s'efface quand les cellules deviennent sous-pixel */
  float gF = 70.0;
  vec3 q = n*gF + vec3(uSeed, uTime*0.045, -uTime*0.03);
  q += 0.35*vec3(n3(n*9.0 + uTime*0.02), n3(n*9.0 + 13.0), n3(n*9.0 - 7.0));
  vec2 w = worley(q);
  float gran = smoothstep(0.02, 0.42, w.y - w.x);
  float gVis = uGran*(1.0 - smoothstep(0.08, 0.3, fp*gF));
  /* réseau de supergranulation → facules brillantes près du limbe */
  vec2 w2 = worley(n*9.0 + uSeed*0.3);
  float net = 1.0 - smoothstep(0.0, 0.12, w2.y - w2.x);
  float mott = n3(n*22.0 + uSeed + uTime*0.01);
  float b = mix(0.95 + 0.05*mott, 0.86 + 0.18*gran, gVis) + net*0.18*pow(1.0 - mu, 1.5);
  /* taches : ombre sombre, pénombre filamentaire radiale */
  float spot = 0.0;
  for(int i = 0; i < 6; i++){
    vec4 s = uSpot[i]; if(s.w <= 0.0) continue;
    float d = acos(clamp(dot(n, s.xyz), -1.0, 1.0));
    if(d > s.w*1.3) continue;
    vec3 t = normalize(n - s.xyz*dot(n, s.xyz) + 1e-5);
    float ang = atan(dot(t, normalize(cross(s.xyz, vec3(0.0,1.0,0.0)))), dot(t, normalize(cross(s.xyz, cross(s.xyz, vec3(0.0,1.0,0.0))))));
    float fil = 0.6 + 0.4*n2(vec2(ang*18.0, d*40.0/s.w));
    float pen = (1.0 - smoothstep(s.w*0.55, s.w, d))*fil;
    float umb = 1.0 - smoothstep(s.w*0.25, s.w*0.45, d);
    spot = max(spot, max(pen*0.55, umb*0.92));
  }
  b *= 1.0 - spot;
  /* assombrissement centre-bord */
  float limb = 1.0 - uLimb*(1.0 - pow(mu, 0.6));
  vec3 hot = mix(vec3(1.0, 0.97, 0.88), uColor, 0.25)*1.18;
  vec3 col = mix(uColor*vec3(1.0, 0.6, 0.34), hot, pow(mu, 0.4))*b*limb;
  /* éruption : noyau et rubans blancs sur la région active */
  if(uFlareI > 0.001){
    float fd = acos(clamp(dot(n, uFlare.xyz), -1.0, 1.0));
    float rib = n2(vec2(fd*160.0, uTime*2.0))*0.6 + 0.4;
    col += vec3(1.0, 0.96, 0.9)*uFlareI*(exp(-fd*fd/(uFlare.w*uFlare.w))*1.6 + exp(-fd*fd/(uFlare.w*uFlare.w*6.0))*0.5*rib);
  }
  gl_FragColor = vec4(min(col, vec3(1.2)), 1.0);
}`;

/* ---------- chromosphère (liseré) ---------- */
const CH_FRAG = `
precision highp float;
varying vec3 vN; varying vec3 vWN; varying vec3 vWP;
uniform vec3 uTint; uniform float uTime; uniform float uAmp;
${HASH}
void main(){
  vec3 N = normalize(vWN), V = normalize(cameraPosition - vWP);
  float rim = pow(1.0 - abs(dot(N, V)), 4.0);
  float sp = 0.6 + 0.4*n3(normalize(vN)*140.0 + vec3(0.0, uTime*0.3, 0.0));   /* spicules */
  gl_FragColor = vec4(uTint*rim*sp*uAmp, 1.0);
}`;

/* ---------- couronne : disque face caméra, jets radiaux ---------- */
const CO_VERT = `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const CO_FRAG = `
precision highp float;
varying vec2 vP;
uniform vec3 uColor; uniform float uTime; uniform float uSeed; uniform float uAmp; uniform float uExt;
${HASH}
void main(){
  float r = length(vP);                      /* en rayons stellaires */
  if(r < 0.98 || r > uExt) discard;
  float a = atan(vP.y, vP.x);
  float ca = cos(a), sa = sin(a);
  /* jets : bruit angulaire étiré radialement, lente évolution */
  float st = fbm2(vec2(ca*3.2 + uSeed, sa*3.2 + uSeed*0.7) + vec2(0.0, log(r)*0.35 - uTime*0.01));
  float fine = fbm2(vec2(ca*22.0 + uSeed, sa*22.0) + vec2(log(r)*1.2 - uTime*0.02, 0.0));
  float streamers = pow(st, 2.2)*2.6 + fine*0.35;
  float polar = 0.55 + 0.45*abs(sa);          /* plumes polaires moins intenses */
  float base = pow(r, -3.0)*1.3 + pow(r, -1.6)*0.06;
  float I = base*(0.35 + streamers)*polar*smoothstep(0.98, 1.04, r)*(1.0 - smoothstep(uExt*0.7, uExt, r));
  vec3 col = mix(vec3(0.92, 0.94, 1.0), uColor, 0.28)*I*uAmp;
  gl_FragColor = vec4(col, 1.0);
}`;

/* ---------- protubérance / arche magnétique (ruban face caméra) ---------- */
const PR_VERT = `
attribute vec2 aUV;
uniform vec3 uA; uniform vec3 uB; uniform float uH; uniform float uW; uniform float uErupt; uniform float uRs; uniform float uTwist; uniform float uTime;
varying float vU; varying float vV; varying float vR; varying float vDisk;
vec3 slerpDir(vec3 a, vec3 b, float t){ float o = acos(clamp(dot(a, b), -1.0, 1.0)); if(o < 1e-4) return a; return normalize((sin((1.0 - t)*o)*a + sin(t*o)*b)/sin(o)); }
vec3 archPoint(float u){
  vec3 d = slerpDir(uA, uB, u);
  float h = uH*sin(3.14159*u)*(1.0 + 0.08*sin(u*12.0 + uTime*0.6));
  vec3 mid = normalize(uA + uB);
  /* éruption : l'arche s'étire et s'arrache vers l'extérieur */
  float lift = uErupt*uErupt*(0.5 + 3.6*sin(3.14159*u));
  return (d*(1.0 + h) + mid*lift)*uRs;
}
void main(){
  float u = aUV.x, v = aUV.y;
  vec3 p = archPoint(u), p2 = archPoint(min(u + 0.01, 1.0)), p1 = archPoint(max(u - 0.01, 0.0));
  vec3 tng = normalize(p2 - p1);
  vec4 wp = modelMatrix*vec4(p, 1.0);
  float ws = length(modelMatrix[0].xyz);                  /* échelle du monde de rendu */
  vec3 toCam = normalize(cameraPosition - wp.xyz);
  vec3 side = normalize(cross(mat3(modelMatrix)*tng, toCam));
  float w = uW*uRs*ws*(0.35 + 0.65*sin(3.14159*u))*(1.0 + uErupt*4.0);
  wp.xyz += side*v*w + normalize(mat3(modelMatrix)*normalize(p))*sin(u*20.0 + uTime*0.8)*uTwist*uRs*ws*0.01;
  vU = u; vV = v; vR = length(p)/uRs;
  vec3 cW = (modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz, toC = cW - cameraPosition, toP = wp.xyz - cameraPosition;
  float dC = length(toC), ang = acos(clamp(dot(normalize(toC), normalize(toP)), -1.0, 1.0));
  vDisk = step(ang, asin(min(1.0, uRs*ws/dC))) * step(length(toP), dC);   /* devant le disque : filament */
  gl_Position = projectionMatrix*viewMatrix*wp;
}`;
const PR_FRAG = `
precision highp float;
varying float vU; varying float vV; varying float vR; varying float vDisk;
uniform float uAlpha; uniform float uTime; uniform float uSeed; uniform vec3 uHot;
${HASH}
void main(){
  float fil = fbm2(vec2(vU*26.0 + uSeed - uTime*0.12, vV*2.2 + uSeed));
  float strand = 0.55 + 0.45*sin(vV*9.0 + fil*6.0);
  float edge = 1.0 - vV*vV;
  float foot = smoothstep(0.0, 0.06, vU)*smoothstep(1.0, 0.94, vU);
  vec3 col = mix(vec3(1.0, 0.3, 0.16), uHot, fil*0.8);
  float a = uAlpha*edge*foot*(0.25 + 0.75*fil)*strand*smoothstep(0.995, 1.02, vR)*mix(1.0, 0.15, vDisk);
  gl_FragColor = vec4(col*a, 1.0);
}`;

/* ---------- éjection de masse coronale (coquille qui s'étend) ----------
   v7.2.2 : plus de demi-sphère franche — coquille à peine ondulée, brillance de bord qui
   s'efface avant la silhouette (bord plume, déchiqueté par le bruit), fondu large et irrégulier au bord ouvert de la
   calotte, filaments qui dérivent vers l'extérieur. */
const CME_VERT = `
varying vec3 vN; varying vec3 vWN; varying vec3 vWP;
uniform float uTime;
${HASH}
void main(){
  vec3 n = normalize(position);
  float d = 0.025*(n3(n*3.5 + vec3(0.0, uTime*0.2, 0.0)) - 0.5);          /* ondulation légère : la silhouette reste celle de la sphère (bord plume exact) */
  vN = n; vWN = normalize((modelMatrix*vec4(normal, 0.0)).xyz);
  vec4 wp = modelMatrix*vec4(position*(1.0 + d), 1.0); vWP = wp.xyz;
  gl_Position = projectionMatrix*viewMatrix*wp;
}`;
const CME_FRAG = `
precision highp float;
varying vec3 vN; varying vec3 vWN; varying vec3 vWP;
uniform float uAlpha; uniform float uTime; uniform vec3 uTint;
${HASH}
void main(){
  vec3 N = normalize(vWN), V = normalize(cameraPosition - vWP);
  float c = abs(dot(N, V));
  vec3 q = normalize(vN);
  float n1 = n3(q*5.0 + vec3(0.0, -uTime*0.35, 0.0)), n2 = n3(q*14.0 - uTime*0.5), n3v = n3(q*31.0 + uTime*0.2);
  float limb = pow(1.0 - c, 1.7);                                     /* coquille vue par la tranche : plus lumineuse… */
  float feather = smoothstep(0.0, 0.38, c - 0.3*(n2 - 0.5) - 0.06);    /* …mais effacée avant la silhouette : bord plume, déchiqueté par le bruit */
  float cap = smoothstep(0.26, 0.6 + 0.25*n1, q.y);                    /* bord ouvert de la calotte : fondu large et irrégulier */
  float wisp = 0.12 + 0.88*smoothstep(0.42, 0.88, n1*0.7 + n2*0.35 + n3v*0.15);  /* filaments, trouées */
  gl_FragColor = vec4(uTint*limb*feather*cap*wisp*uAlpha*1.2, 1.0);
}`;

function stripGeometry(N, M){
  const uv = new Float32Array((N+1)*(M+1)*2), pos = new Float32Array((N+1)*(M+1)*3), idx = [];
  for(let i=0;i<=N;i++) for(let j=0;j<=M;j++){ const k = i*(M+1)+j; uv[k*2] = i/N; uv[k*2+1] = j/M*2 - 1; }
  for(let i=0;i<N;i++) for(let j=0;j<M;j++){ const a = i*(M+1)+j, b = a+M+1; idx.push(a,b,a+1,b,b+1,a+1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos,3)); g.setAttribute('aUV', new THREE.BufferAttribute(uv,2)); g.setIndex(idx);
  return g;
}
function prng(seed){ let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; }; }
function randDir(r, latMax){ const lat = (r()*2 - 1)*latMax, lon = r()*Math.PI*2; return new V3(Math.cos(lat)*Math.cos(lon), Math.sin(lat), Math.cos(lat)*Math.sin(lon)); }

/* ---------- création d'un soleil ---------- */
ST.create = function(leg, PIX, host){
  host = host || scene;
  const des = leg.star.designation || 'G2 V', A = activity(des), Rs = ST.radiusFor(leg.star);
  const r = prng(leg.cell.split(',').reduce((a, c) => a*131 + (+c), 11) >>> 0);
  const col = new THREE.Color(leg.star.color.r, leg.star.color.g, leg.star.color.b);
  const colV = new V3(col.r, col.g, col.b);
  const root = new THREE.Group(); root.position.copy(leg.starPosition);
  // photosphère (tourne lentement : les taches défilent)
  const spots = []; for(let i=0;i<6;i++){ if(i < A.spots){ const d = randDir(r, .55); spots.push(new THREE.Vector4(d.x, d.y, d.z, .025 + .045*r())); } else spots.push(new THREE.Vector4(0,1,0,0)); }
  const phMat = new THREE.ShaderMaterial({ uniforms: { uColor:{value:colV}, uTime:{value:0}, uLimb:{value:A.limb}, uGran:{value:A.gran}, uRadius:{value:Rs}, uPixAng:PIX, uSeed:{value:r()*50},
      uSpot:{value:spots}, uFlare:{value:new THREE.Vector4(0,1,0,.05)}, uFlareI:{value:0} }, vertexShader: PH_VERT, fragmentShader: PH_FRAG });
  const photo = new THREE.Mesh(new THREE.SphereGeometry(Rs, 160, 120), phMat); root.add(photo);
  // chromosphère
  const chroma = new THREE.Mesh(new THREE.SphereGeometry(Rs*1.012, 96, 72), new THREE.ShaderMaterial({ uniforms: { uTint:{value:new V3(1.0, .32, .38)}, uTime:{value:0}, uAmp:{value:1.1} },
    vertexShader: PH_VERT, fragmentShader: CH_FRAG, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending }));
  chroma.renderOrder = 6; root.add(chroma);
  // couronne (disque orienté vers la caméra à chaque image)
  const ext = 7.5;
  const corona = new THREE.Mesh(new THREE.CircleGeometry(ext, 96), new THREE.ShaderMaterial({ uniforms: { uColor:{value:colV}, uTime:{value:0}, uSeed:{value:r()*40}, uAmp:{value:.5}, uExt:{value:ext} },
    vertexShader: CO_VERT, fragmentShader: CO_FRAG, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending }));
  corona.scale.setScalar(Rs); corona.renderOrder = 3; root.add(corona);
  // protubérances (repère non tournant)
  const promGroup = new THREE.Group(); root.add(promGroup);
  const geo = stripGeometry(96, 6), proms = [];
  const hot = new V3(1.0, .72, .55);
  const makeProm = (a, b, h, w, alpha) => {
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: { uA:{value:a}, uB:{value:b}, uH:{value:h}, uW:{value:w}, uErupt:{value:0}, uRs:{value:Rs}, uTwist:{value:1 + r()*2}, uTime:{value:0},
      uAlpha:{value:alpha}, uSeed:{value:r()*30}, uHot:{value:hot} }, vertexShader: PR_VERT, fragmentShader: PR_FRAG, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide }));
    m.frustumCulled = false; m.userData.bsR = Rs*4; m.renderOrder = 7; promGroup.add(m); return m;
  };
  for(let i=0;i<A.prom;i++){
    const c = randDir(r, .75), t = new V3().crossVectors(c, new V3(r()-.5, r()-.5, r()-.5)).normalize(), sep = .05 + .12*r();
    const a = c.clone().addScaledVector(t, -sep).normalize(), b = c.clone().addScaledVector(t, sep).normalize();
    const pm = makeProm(a, b, .08 + .28*r(), .03 + .05*r(), .5 + .5*r());
    proms.push({ mesh: pm, base: pm.material.uniforms.uAlpha.value, phase: r()*6.28 });
  }
  // éjection de masse coronale (réutilisée à chaque éruption)
  const cme = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24, 0, Math.PI*2, 0, Math.PI*.42), new THREE.ShaderMaterial({ uniforms: { uAlpha:{value:0}, uTime:{value:0}, uTint:{value:new V3(1.0, .8, .7)} },
    vertexShader: CME_VERT, fragmentShader: CME_FRAG, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide }));
  cme.visible = false; cme.renderOrder = 7; root.add(cme);
  // halo : éblouissement modulé par l'occultation
  const glowC = col.clone().lerp(new THREE.Color(1,1,1), .35);
  const glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: glowC, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending }));
  const glare2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: glowC, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending }));
  glare.renderOrder = 20; glare2.renderOrder = 20; host.add(glare); host.add(glare2);
  const S = {
    root, photo, chroma, corona, promGroup, proms, cme, glare, glare2, Rs, A, des, flares: [], nextFlare: 6 + r()*12, r, makeProm,
    obstacle: { position: leg.starPosition.clone(), radius: Rs*1.6, hasRings: false, isStar: true },
    visible: 1,
    dispose(){ host.remove(glare); host.remove(glare2); glare.material.dispose(); glare2.material.dispose(); geo.dispose(); }
  };
  return S;
};

/* ---------- éruption (déclenchée au hasard, ou par le réalisateur face au limbe) ---------- */
ST.flare = function(S, T, dirWorld){
  const r = S.r;
  const d = dirWorld ? dirWorld.clone().normalize() : randDir(r, .6);
  const t = new V3().crossVectors(d, new V3(0,1,0)).normalize(); if(t.lengthSq() < 1e-4) t.set(1,0,0);
  const sep = .06 + .06*r();
  const a = d.clone().addScaledVector(t, -sep).normalize(), b = d.clone().addScaledVector(t, sep).normalize();
  const pm = S.makeProm(a, b, .18 + .12*r(), .05 + .03*r(), 1.3*S.A.flarePower);
  S.flares.push({ t0: T, dir: d, prom: pm, dur: 9 + 3*r(), power: S.A.flarePower*(.8 + .4*r()) });
  S.nextFlare = T + S.A.flareEvery[0] + (S.A.flareEvery[1] - S.A.flareEvery[0])*r();
};

/* ---------- occultation du disque par les corps du système (fraction visible) ---------- */
function circleOverlap(a, b, c){                  // rayons angulaires a (étoile), b (occulteur), séparation c → aire commune / aire de l'étoile
  if(c >= a + b) return 0;
  if(c <= Math.abs(b - a)) return b >= a ? 1 : (b*b)/(a*a);
  const a2 = a*a, b2 = b*b;
  const p1 = a2*Math.acos((c*c + a2 - b2)/(2*c*a)), p2 = b2*Math.acos((c*c + b2 - a2)/(2*c*b));
  const p3 = .5*Math.sqrt(Math.max(0, (-c + a + b)*(c + a - b)*(c - a + b)*(c + a + b)));
  return (p1 + p2 - p3)/(Math.PI*a2);
}
ST.occlusion = function(S, camPos, bodies){
  const toS = S.root.position.clone().sub(camPos), ds = toS.length(); toS.divideScalar(ds);
  const a = Math.asin(Math.min(1, S.Rs/ds));
  let vis = 1, sliver = null;
  bodies.forEach(bd => {
    const to = bd.pos.clone().sub(camPos), dd = to.length(); if(dd >= ds || dd < bd.r) return; to.divideScalar(dd);
    const b = Math.asin(Math.min(1, bd.r/dd)), c = Math.acos(Math.max(-1, Math.min(1, to.dot(toS))));
    const f = circleOverlap(a, b, c);
    if(f > 0){ vis *= (1 - f); if(f < 1) sliver = toS.clone().sub(to).normalize(); }
  });
  return { vis: Math.max(0, vis), sliver, angR: a, dist: ds };
};

/* ---------- mise à jour par image ---------- */
ST.update = function(S, T, dt, cam, bodies){
  S.photo.rotation.y += dt*.006;
  const u = S.photo.material.uniforms; u.uTime.value = T;
  S.chroma.material.uniforms.uTime.value = T;
  S.corona.material.uniforms.uTime.value = T;
  S.corona.quaternion.copy(cam.quaternion);
  // éruptions programmées
  if(T >= S.nextFlare) ST.flare(S, T);
  let fI = 0, fDir = null;
  S.flares = S.flares.filter(f => {
    const e = (T - f.t0)/f.dur;
    if(e > 1){ S.promGroup.remove(f.prom); f.prom.material.dispose(); return false; }
    if(e < 0){ f.prom.material.uniforms.uAlpha.value = 0; return true; }
    const flash = Math.exp(-Math.pow((T - f.t0 - .8)/.7, 2))*f.power;
    if(flash > fI){ fI = flash; fDir = f.dir; }
    const pu = f.prom.material.uniforms; pu.uTime.value = T; pu.uErupt.value = Math.max(0, (e - .12)/.88);
    pu.uAlpha.value = 1.4*f.power*Math.min(1, e*6)*(1 - Math.pow(Math.max(0, (e - .5)/.5), 1.5));
    return true;
  });
  // flash sur la photosphère (direction ramenée dans le repère tournant)
  if(fDir){ const q = S.photo.getWorldQuaternion(new THREE.Quaternion()).invert(); const d = fDir.clone().applyQuaternion(q); u.uFlare.value.set(d.x, d.y, d.z, .035); }
  u.uFlareI.value = fI;
  // éjection de masse coronale de la dernière éruption
  const started = S.flares.filter(f => T >= f.t0), last = started[started.length - 1];
  if(last && T - last.t0 > 1.2){
    const e = (T - last.t0 - 1.2)/(last.dur - 1.2);
    S.cme.visible = true; S.cme.quaternion.setFromUnitVectors(new V3(0,1,0), last.dir);
    S.cme.scale.setScalar(S.Rs*(1.1 + 5.5*e)); S.cme.position.copy(last.dir).multiplyScalar(S.Rs*e*1.2);
    S.cme.material.uniforms.uAlpha.value = .9*last.power*(1 - e)*Math.min(1, e*5); S.cme.material.uniforms.uTime.value = T;
  } else S.cme.visible = false;
  // protubérances : respiration lente
  S.proms.forEach(p => { const pu = p.mesh.material.uniforms; pu.uTime.value = T; pu.uAlpha.value = p.base*(.75 + .25*Math.sin(T*.13 + p.phase)); });
  // occultation → halo, couronne et chromosphère
  const oc = ST.occlusion(S, cam.position, bodies);
  S.visible = oc.vis;
  const dist = oc.dist, disk = S.Rs;
  const gv = Math.pow(oc.vis, .6);
  S.glare.position.copy(S.root.position); S.glare2.position.copy(S.root.position);
  if(oc.sliver && oc.vis > 0 && oc.vis < .35){      // anneau de diamant : l'éclat se concentre sur le croissant restant
    const off = oc.sliver.clone().multiplyScalar(disk*.95); S.glare.position.add(off); S.glare2.position.add(off);
  }
  const far = Math.max(1, dist/(disk*40));           // de loin, le halo garde une taille apparente minimale
  const nearK = THREE.MathUtils.clamp((dist/disk - 2)/12, .12, 1);   // de près, halo discret pour garder la lisibilité du limbe
  // éblouissement : effet d'optique, borné à une fraction du champ (les longues focales ne sont pas noyées de blanc)
  const fovW = 2*Math.tan((cam.fov || 50)*Math.PI/360)*dist;
  S.glare.scale.setScalar(Math.min(disk*(5.5 + 3*far)*(.25 + .75*gv), fovW*.9)); S.glare.material.opacity = Math.min(1, .15 + .85*gv)*nearK;
  S.glare2.scale.setScalar(Math.min(disk*2.6*(.3 + .7*gv)*Math.max(1, far*.6), Math.max(fovW*.45, disk*2.2))); S.glare2.material.opacity = oc.vis < .02 ? 0 : Math.min(1, .3 + .9*gv)*Math.max(nearK, .35);
  S.corona.material.uniforms.uAmp.value = S.A.corona*(.45 + 1.6*(1 - oc.vis));
  S.chroma.material.uniforms.uAmp.value = 1.1 + 2.2*(1 - oc.vis);
  S.proms.forEach(p => p.mesh.material.uniforms.uAlpha.value *= (1 + 1.2*(1 - oc.vis)));
  return oc;
};
ST.dispose = function(S){ if(S) S.dispose(); };
})();
