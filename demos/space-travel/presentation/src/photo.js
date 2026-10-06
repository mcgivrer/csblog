/* =====================================================================
   DIRECTION PHOTO « CINÉMA » (lot P3) — window.__PHOTO.create(renderer, opts) → PH
   La scène (W.render) est rendue dans une cible, à l'identique de l'écran (ACES + sRGB pour les matériaux de three,
   écriture directe pour les shaders des astres), puis habillée en espace d'affichage :
   profondeur de champ (carte de distance analytique), bloom multi-niveaux, halation, flare anamorphique et fantômes,
   adaptation d'exposition, étalonnage, aberration, vignettage, grain, bandes, fondu, CRT de transition.
   Un « directeur photo » choisit un look par système et règle chaque plan d'après les métadonnées du réalisateur.
   Lot P4 : calques derrière le texte des slides (PH.setVeil), réglages de qualité (PH.quality), grain et CRT réglables.
   Lot P7 : ambiances (Nolan 35 mm, noir & blanc, sépia, Technicolor, Super 8, CRT, VHS, vision nocturne), choisies par
   slide, appliquées sur la coupe (PH.queueLook) ; les bandes glissent d'un format à l'autre.
   Voir docs/SPEC-P3-photo.md, docs/SPEC-P4-lecteur.md et docs/SPEC-P7-ambiances.md.
   ===================================================================== */
(function(){
'use strict';
const PHO = window.__PHOTO = {};
const V3 = THREE.Vector3;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = x => { x = clamp(x, 0, 1); return x*x*(3 - 2*x); };
const lerp = (a, b, x) => a + (b - a)*x;
function xmur3(str){ let h = 1779033703 ^ str.length; for(let i = 0; i < str.length; i++){ h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return h >>> 0; }; }
function mulberry32(a){ return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0)/4294967296; }; }
const rngOf = tag => mulberry32(xmur3(tag)());

/* ---------- looks (un par système) ---------- */
const LOOKS = {
  denis:   { label: 'Villeneuve', w: .32, letter: 2.39, bloom: .55, halation: .22, streak: .8, streakTint: [.42, .6, 1.0], ghost: .45, grain: .045, vignette: .38, aberr: .0024,
             grade: { sat: .8, contrast: 1.16, gamma: 1.02, lift: [-.01, -.003, .012], gain: [1.05, 1.0, .94], shadows: [.05, .12, .16], highlights: [1.0, .74, .48], split: .24 } },
  imax:    { label: 'Nolan IMAX', w: .26, letter: 1.90, bloom: .45, halation: .14, streak: .45, streakTint: [.55, .7, 1.0], ghost: .35, grain: .028, vignette: .28, aberr: .0016,
             grade: { sat: .96, contrast: 1.08, gamma: 1.0, lift: [0, 0, .004], gain: [1.04, 1.0, .96], shadows: [.08, .1, .12], highlights: [1.0, .86, .7], split: .12 } },
  kodak:   { label: 'Kodak 2383', w: .24, letter: 2.39, bloom: .5, halation: .42, streak: .55, streakTint: [1.0, .7, .4], ghost: .4, grain: .062, vignette: .42, aberr: .0018,
             grade: { sat: 1.04, contrast: 1.2, gamma: 1.04, lift: [.006, 0, -.01], gain: [1.08, 1.0, .9], shadows: [.12, .1, .08], highlights: [1.0, .78, .52], split: .18 } },
  kubrick: { label: 'Kubrick 2001', w: .18, letter: 2.20, bloom: .32, halation: .06, streak: 0, streakTint: [.6, .75, 1.0], ghost: .45, grain: .018, vignette: .2, aberr: .001,
             grade: { sat: .9, contrast: 1.05, gamma: 1.0, lift: [0, .002, .01], gain: [.98, 1.0, 1.04], shadows: [.08, .1, .14], highlights: [.95, .97, 1.0], split: .08 } },
  /* ambiances (lot P7) : poids 0, jamais tirées au hasard ; champs optionnels : mono (monochrome) et tone/toneHi (virage
     des ombres et des hautes lumières), dye (séparation trichrome), expo, grainSize (px), weave (flottement du film),
     flicker (pompage), gate (fenêtre arrondie), dust (poussières), scratch (rayure), crt (écran cathodique permanent),
     vhs (bavure, tracking, commutation des têtes), tube (intensificateur) ; letter 0 : plein cadre */
  nolan35: { label: 'Nolan 35 mm', w: 0, letter: 2.39, bloom: .5, halation: .26, streak: .95, streakTint: [.45, .62, 1.0], ghost: .4, grain: .05, grainSize: 1.3, vignette: .4, aberr: .0022,
             grade: { sat: .9, contrast: 1.14, gamma: 1.0, lift: [.004, .002, .008], gain: [1.06, 1.0, .92], shadows: [.04, .1, .13], highlights: [1.0, .8, .58], split: .2 } },
  nb:      { label: 'Noir & blanc', w: 0, letter: 1.90, bloom: .42, halation: .1, streak: .5, streakTint: [1, 1, 1], ghost: .3, grain: .06, grainSize: 1.25, vignette: .38, aberr: .0012,
             mono: 1, tone: [1, 1, 1], toneHi: [1, 1, 1],
             grade: { sat: 1, contrast: 1.32, gamma: .96, lift: [0, 0, 0], gain: [1.04, 1.04, 1.04], shadows: [0, 0, 0], highlights: [1, 1, 1], split: 0 } },
  sepia:   { label: 'Sépia', w: 0, letter: 1.85, bloom: .38, halation: .18, streak: .25, streakTint: [1, .85, .6], ghost: .2, grain: .07, grainSize: 1.6, vignette: .62, aberr: .0012,
             mono: 1, tone: [1.04, .76, .5], toneHi: [1.05, .97, .84], flicker: .035, weave: .0007, dust: .6, scratch: .7,
             grade: { sat: 1, contrast: 1.12, gamma: 1.05, lift: [.05, .05, .05], gain: [1, 1, 1], shadows: [0, 0, 0], highlights: [1, 1, 1], split: 0 } },
  technicolor: { label: 'Technicolor', w: 0, letter: 1.85, bloom: .48, halation: .22, streak: .45, streakTint: [1.0, .8, .55], ghost: .35, grain: .035, vignette: .3, aberr: .0014, dye: .4,
             grade: { sat: 1.3, contrast: 1.16, gamma: 1.02, lift: [0, .004, .016], gain: [1.08, 1.0, .95], shadows: [.02, .05, .14], highlights: [1.0, .9, .74], split: .12 } },
  super8:  { label: 'Super 8', w: 0, letter: 0, bloom: .55, halation: .4, streak: .2, streakTint: [1, .8, .55], ghost: .25, grain: .11, grainSize: 2.2, vignette: .7, aberr: .0032,
             weave: .002, flicker: .05, gate: 1, dust: 1,
             grade: { sat: .82, contrast: .96, gamma: 1.06, lift: [.06, .04, .02], gain: [1.1, 1.0, .82], shadows: [.1, .06, .02], highlights: [1.0, .85, .6], split: .25 } },
  crt:     { label: 'CRT', w: 0, letter: 0, crt: .85, bloom: .7, halation: .05, streak: 0, streakTint: [.6, .8, 1], ghost: 0, grain: .02, vignette: .3, aberr: .0016,
             grade: { sat: 1.1, contrast: 1.12, gamma: 1.0, lift: [0, .006, .004], gain: [.96, 1.04, 1.0], shadows: [0, .05, .04], highlights: [.95, 1.0, .98], split: .1 } },
  vhs:     { label: 'VHS', w: 0, letter: 0, vhs: 1, bloom: .5, halation: .12, streak: .2, streakTint: [1, .9, .8], ghost: .1, grain: .05, grainSize: 1.5, vignette: .25, aberr: .0045,
             grade: { sat: .85, contrast: .92, gamma: 1.08, lift: [.03, .02, .04], gain: [1.04, 1.0, 1.02], shadows: [.03, 0, .06], highlights: [1.0, .95, .92], split: .15 } },
  nuit:    { label: 'Vision nocturne', w: 0, letter: 0, expo: 1.8, mono: 1, tone: [.16, .95, .3], toneHi: [.55, 1.12, .5], tube: .92, bloom: .9, halation: 0, streak: 0,
             streakTint: [1, 1, 1], ghost: 0, grain: .17, grainSize: 1.2, vignette: .2, aberr: 0,
             grade: { sat: 1, contrast: 1.18, gamma: .82, lift: [.02, .02, .02], gain: [1, 1, 1], shadows: [0, 0, 0], highlights: [1, 1, 1], split: 0 } }
};
PHO.LOOKS = LOOKS;
/* ouverture (profondeur de champ) et flare selon le type de plan du réalisateur. Le sujet mis au point reste net en
   entier : la profondeur de champ ne joue que sur les plans à premier plan ou à bascule de point (lune, ceinture,
   anneaux) et sur la nébuleuse (planète au premier plan, point à l'infini) ; ailleurs, image nette, passes économisées. */
const SHOT = {
  lune: { ap: [.55, .85], flare: .8 }, ceinture: { ap: [.55, .85], flare: .7 }, anneaux: { ap: [.4, .65], flare: .8 }, nebuleuse: { ap: [.18, .32], flare: .7 },
  limbe: { ap: [0, 0], flare: 1.15 }, croissant: { ap: [0, 0], flare: 1.25 }, eclipse: { ap: [0, 0], flare: 1.3 }, etoile: { ap: [0, 0], flare: .45 },
  survol: { ap: [0, 0], flare: .9 }, terminateur: { ap: [0, 0], flare: .9 }
};
PHO.SHOT = SHOT;

/* ---------- GLSL ---------- */
const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const HEAD = 'precision highp float; varying vec2 vUv;\n';
const LUMA = 'float luma(vec3 c){ return dot(c, vec3(.2126, .7152, .0722)); }\n';
/* une valeur de [0, 1) sur deux octets (cibles 8 bits partout : précision 1/65025, sans extension flottante) */
const PACK = 'vec4 pk(float v){ v = clamp(v, 0.0, .9999); float a = floor(v*255.0)/255.0; return vec4(a, fract(v*255.0), 0.0, 1.0); }\n' +
  'float upk(vec4 c){ return c.r + c.g/255.0; }\n';
const FS = {
  copy: HEAD + 'uniform sampler2D tIn; void main(){ gl_FragColor = texture2D(tIn, vUv); }',
  /* sous-échantillonnage 4 prises (bilinéaires : 16 texels) */
  down: HEAD + 'uniform sampler2D tIn; uniform vec2 uTexel; void main(){ vec2 o = uTexel*.5;' +
    'gl_FragColor = .25*(texture2D(tIn, vUv + vec2(-o.x, -o.y)) + texture2D(tIn, vUv + vec2(o.x, -o.y)) + texture2D(tIn, vUv + vec2(-o.x, o.y)) + texture2D(tIn, vUv + vec2(o.x, o.y))); }',
  /* hautes lumières, seuil doux */
  bright: HEAD + LUMA + 'uniform sampler2D tIn; uniform vec2 uTexel; uniform float uTh, uKnee, uNorm, uAspect; uniform vec3 uMask; void main(){ vec2 o = uTexel*.5;' +
    'vec3 c = .25*(texture2D(tIn, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tIn, vUv + vec2(o.x, -o.y)).rgb + texture2D(tIn, vUv + vec2(-o.x, o.y)).rgb + texture2D(tIn, vUv + vec2(o.x, o.y)).rgb);' +
    'float l = max(c.r, max(c.g, c.b)); float s = clamp(l - uTh + uKnee, 0.0, 2.0*uKnee); s = s*s/(4.0*uKnee + 1e-4);' +
    'float m = uMask.z > 0.0 ? smoothstep(uMask.z, uMask.z*.4, length((vUv - uMask.xy)*vec2(uAspect, 1.0))) : 1.0;' +   /* masque : autour de l'étoile seulement */
    'gl_FragColor = vec4(c*max(s, l - uTh)/max(l, 1e-4)*uNorm*m, 1.0); }',
  /* traînée anamorphique (Kawase) : 7 prises symétriques à pas uB, poids uA^distance ; trois passes (1, 4, 16) donnent
     une décroissance exponentielle sur ±63 pas, sans normaliser l'énergie (une source ponctuelle reste lisible) */
  streak: HEAD + 'uniform sampler2D tIn; uniform vec2 uDir; uniform float uB, uA, uNorm; void main(){ vec3 c = texture2D(tIn, vUv).rgb; float ws = 1.0;' +
    'for(int s = 1; s < 4; s++){ float w = pow(uA, uB*float(s)); vec2 o = uDir*uB*float(s); c += w*(texture2D(tIn, vUv + o).rgb + texture2D(tIn, vUv - o).rgb); ws += 2.0*w; }' +
    'gl_FragColor = vec4(c*uNorm/ws, 1.0); }',
  /* flou gaussien séparable, 5 prises linéaires (9 texels), pas réglable (traînée anamorphique) */
  blur: HEAD + 'uniform sampler2D tIn; uniform vec2 uDir; void main(){' +
    'vec4 c = texture2D(tIn, vUv)*.2270270270;' +
    'c += (texture2D(tIn, vUv + uDir*1.3846153846) + texture2D(tIn, vUv - uDir*1.3846153846))*.3162162162;' +
    'c += (texture2D(tIn, vUv + uDir*3.2307692308) + texture2D(tIn, vUv - uDir*3.2307692308))*.0702702703;' +
    'gl_FragColor = c; }',
  /* carte de flou : distance analytique (sphères et anneaux du système), cercle de confusion */
  coc: HEAD + 'uniform vec3 uR, uU, uF; uniform vec2 uTan; uniform vec4 uSph[40]; uniform int uN; uniform vec4 uRc[3]; uniform vec4 uRn[3]; uniform int uNr;' +
    'uniform float uFocus, uK, uBg, uInf; void main(){' +
    'vec3 d = normalize(uF + (vUv.x*2.0 - 1.0)*uTan.x*uR + (vUv.y*2.0 - 1.0)*uTan.y*uU); float t0 = 1e30, te = 1.0;' +
    'for(int i = 0; i < 40; i++){ if(i >= uN) break; vec3 oc = uSph[i].xyz; float b = dot(oc, d), h = b*b - dot(oc, oc) + uSph[i].w*uSph[i].w;' +
    '  if(h > 0.0){ float t = b - sqrt(h); if(t > 0.0 && t < t0){ t0 = t; float dc = length(oc); te = clamp(uFocus, dc - uSph[i].w, dc + uSph[i].w); } } }' +
    'for(int i = 0; i < 3; i++){ if(i >= uNr) break; vec3 n = uRn[i].xyz; float den = dot(d, n); if(abs(den) > 1e-6){ float t = dot(uRc[i].xyz, n)/den;' +
    '  if(t > 0.0 && t < t0){ float r = length(d*t - uRc[i].xyz); if(r > uRc[i].w && r < uRn[i].w){ t0 = t; te = t; } } } }' +
    'float c; if(t0 > 1e29) c = uInf > .5 ? 0.0 : uBg; else c = uInf > .5 ? -1.0 : 1.0 - uFocus/max(te, 1e-9);' +
    'float m = c < 0.0 ? min(-c, .75) : min(c, 1.0); gl_FragColor = vec4(m*uK, c < 0.0 ? 1.0 : 0.0, 0.0, 1.0); }',
  /* préparation : couleur à demi-résolution, prémultipliée par le flou (un pixel net ne bave pas sur le fond flou) */
  prep: HEAD + 'uniform sampler2D tIn, tCoc; uniform vec2 uTexel; void main(){ vec2 o = uTexel*.5;' +
    'vec3 c = .25*(texture2D(tIn, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tIn, vUv + vec2(o.x, -o.y)).rgb + texture2D(tIn, vUv + vec2(-o.x, o.y)).rgb + texture2D(tIn, vUv + vec2(o.x, o.y)).rgb);' +
    'float w = .03 + .97*texture2D(tCoc, vUv).r; gl_FragColor = vec4(c*w, w); }',
  /* flou de premier plan seul, au quart (étalé ensuite : un premier plan flou déborde sur le net, pas l'inverse) */
  fgdown: HEAD + 'uniform sampler2D tIn; uniform vec2 uTexel; void main(){ vec2 o = uTexel*.5; float s = 0.0; vec4 k;' +
    'k = texture2D(tIn, vUv + vec2(-o.x, -o.y)); s += k.r*k.g; k = texture2D(tIn, vUv + vec2(o.x, -o.y)); s += k.r*k.g;' +
    'k = texture2D(tIn, vUv + vec2(-o.x, o.y)); s += k.r*k.g; k = texture2D(tIn, vUv + vec2(o.x, o.y)); s += k.r*k.g; gl_FragColor = vec4(s*.25, 0.0, 0.0, 1.0); }',
  /* luminance moyenne 16×16 puis 1×1, lissée dans le temps (iris) */
  lum: HEAD + LUMA + PACK + 'uniform sampler2D tIn; void main(){ float s = 0.0; for(int i = 0; i < 4; i++) for(int j = 0; j < 4; j++){ vec2 o = (vec2(float(i), float(j)) - 1.5)/64.0;' +
    's += luma(texture2D(tIn, vUv + o).rgb); } gl_FragColor = pk(s/16.0); }',
  adapt: HEAD + PACK + 'uniform sampler2D tIn, tPrev; uniform float uRate; void main(){ float s = 0.0; for(int i = 0; i < 16; i++) for(int j = 0; j < 16; j++){ s += upk(texture2D(tIn, (vec2(float(i), float(j)) + .5)/16.0)); }' +
    's /= 256.0; float p = upk(texture2D(tPrev, vec2(.5))); gl_FragColor = pk(mix(p, s, uRate)); }',
  /* composition finale */
  comp: HEAD + LUMA + PACK + `
uniform sampler2D tScene, tCoc, tCf, tDofA, tDofB, tB1, tB2, tB3, tB4, tStreak, tAdapt, tVeil;
uniform vec4 uVeil[3]; uniform float uVeilK[3]; uniform int uNv; uniform float uVeilF; uniform vec3 uPanel;
uniform vec2 uRes; uniform float uTime, uOn, uDof, uBloom, uHal, uStreak, uGhost, uAberr, uVig, uGrain, uBar, uFade, uCRT, uCrtOpen, uKey, uDebug, uWipe;
uniform vec3 uStreakTint; uniform vec3 uStar;
uniform float uSat, uContrast, uGamma, uSplit; uniform vec3 uLift, uGain, uShadows, uHigh;
uniform float uMono, uDye, uExpo, uGrainSize, uWeave, uFlicker, uGate, uDust, uScratch, uVhs, uTube; uniform vec3 uTone, uToneHi;
float hash(vec2 p){ p = fract(p*vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y)*p.x); }
vec3 dofAt(vec2 p){
  vec3 s = texture2D(tScene, p).rgb;
  if(uDof > .001){ float c = max(texture2D(tCoc, p).r, texture2D(tCf, p).r*.9); vec4 a = texture2D(tDofA, p), b = texture2D(tDofB, p);
    s = mix(s, a.rgb/max(a.a, 1e-3), smoothstep(.0, .35, c)); s = mix(s, b.rgb/max(b.a, 1e-3), smoothstep(.35, .9, c)); }
  return s;
}
vec3 grade(vec3 c){
  c = max(c, 0.0);
  c = (c - .4)*uContrast + .4;
  c = c*uGain + uLift*(1.0 - c);
  c = pow(max(c, 0.0), vec3(1.0/uGamma));
  float l = luma(c);
  c = mix(vec3(l), c, uSat);
  c += uShadows*(1.0 - smoothstep(.0, .38, l))*uSplit*.45;
  c = mix(c, c*uHigh*1.25, smoothstep(.45, 1.0, l)*uSplit);
  return c;
}
/* ambiance : séparation trichrome, étalonnage, monochrome viré (ombres → hautes lumières) */
vec3 look(vec3 c){
  c = max(c, 0.0);
  if(uDye > .001){ vec3 t = vec3(c.r - (c.g + c.b)*.5, c.g - (c.r + c.b)*.5, c.b - (c.r + c.g)*.5); c = max(c + t*uDye, 0.0); }
  c = grade(c);
  if(uMono > .001){ float l = luma(c); c = mix(c, l*mix(uTone, uToneHi, smoothstep(.0, .9, l)), uMono); }
  return c;
}
void main(){
  vec2 uv = vUv;
  if(uOn < .5 || vUv.x < uWipe){ gl_FragColor = vec4(texture2D(tScene, uv).rgb*(1.0 - uFade)*(abs(vUv.x - uWipe)*uRes.x < 1.0 ? 0.0 : 1.0), 1.0); return; }
  if(uDebug > .5){ vec4 k = texture2D(tCoc, uv); gl_FragColor = vec4(k.r*(1.0 - k.g), k.r*k.g, texture2D(tScene, uv).g*.25, 1.0); return; }
  float fr = floor(uTime*18.0);                                                         /* cadence « film » : 18 images/s */
  if(uWeave > .001) uv += (vec2(hash(vec2(fr, 1.7)), hash(vec2(fr, 9.3))) - .5)*uWeave*vec2(.6, 1.0);   /* flottement */
  if(uVhs > .001){ float tf = floor(uTime*30.0), hs = smoothstep(.045, .0, vUv.y);        /* lignes instables, commutation des têtes */
    uv.x += ((hash(vec2(floor(vUv.y*uRes.y*.5), tf)) - .5)*.0012 + hs*(hash(vec2(tf, 3.1)) - .2)*.03)*uVhs; }
  vec2 cq = uv - .5;
  if(uCRT > .001){ uv = .5 + cq*(1.0 + dot(cq, cq)*.32*uCRT); cq = uv - .5;
    if(any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))){ gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; } }
  float aspect = uRes.x/uRes.y;
  vec2 off = cq*uAberr*(1.0 + 4.0*dot(cq, cq)) + vec2(uCRT*.0025, 0.0);
  vec3 col = vec3(dofAt(uv + off).r, dofAt(uv).g, dofAt(uv - off).b);
  if(uVhs > .001){ vec2 px = vec2(1.0/uRes.x, 0.0);                                    /* luminance molle, chrominance qui bave */
    vec3 sm = (dofAt(uv - 2.0*px) + dofAt(uv - 5.0*px) + dofAt(uv - 9.0*px) + col)*.25, soft = (dofAt(uv - 1.5*px) + dofAt(uv + 1.5*px))*.5;
    col = mix(col, vec3(luma(mix(col, soft, .6))) + (sm - luma(sm))*1.15, uVhs); }
  vec3 b1 = texture2D(tB1, uv).rgb;
  col += (b1*.16 + texture2D(tB2, uv).rgb*.22 + texture2D(tB3, uv).rgb*.28 + texture2D(tB4, uv).rgb*.34)*uBloom;
  col += b1*uHal*vec3(1.0, .32, .12);
  col += texture2D(tStreak, uv).rgb*uStreak*uStreakTint*.6;
  if(uGhost > .001){
    vec2 s = uStar.xy*.5 + .5, axis = vec2(.5) - s;
    for(int i = 0; i < 5; i++){
      float k = i == 0 ? .45 : i == 1 ? .85 : i == 2 ? 1.25 : i == 3 ? 1.6 : 2.1;
      float r = i == 0 ? .035 : i == 1 ? .06 : i == 2 ? .022 : i == 3 ? .09 : .045;
      vec3 tint = i == 0 ? vec3(.3, .55, 1.0) : i == 1 ? vec3(1.0, .6, .25) : i == 2 ? vec3(.6, 1.0, .7) : i == 3 ? vec3(.7, .4, 1.0) : vec3(1.0, .85, .5);
      vec2 g = s + axis*k; float d = length((uv - g)*vec2(aspect, 1.0));
      col += tint*(smoothstep(r, r*.55, d)*.55 + smoothstep(r*1.05, r, d)*.35)*uGhost*.2;
    }
  }
  float e = clamp(sqrt(uKey/max(upk(texture2D(tAdapt, vec2(.5))), 1e-3)), .85, 1.2);   /* iris : demi-correction, bornée */
  col *= e*uExpo;
  col = look(col);
  if(uFlicker > .001) col *= 1.0 + (hash(vec2(fr, 5.1)) - .5)*2.0*uFlicker;
  col *= 1.0 - uVig*smoothstep(.3, .95, length(cq*vec2(aspect/1.55, 1.0))*1.2);
  if(uTube > .001) col *= 1.0 - uTube*smoothstep(.86, 1.02, length(cq/vec2(.53, .64)));       /* oculaire de l'intensificateur */
  /* calques : derrière le texte d'une slide, l'image floutée, exposée, étalonnée, assombrie vers la couleur de panneau */
  float vq = 0.0;                                                                         /* présence d'un calque (texte) */
  if(uNv > 0 && uVeilF > .001){
    vec2 px = vUv*uRes; float vm = 0.0, vl = 0.0;
    for(int i = 0; i < 3; i++){ if(i >= uNv) break; vec4 r = uVeil[i]*vec4(uRes, uRes); vec2 d = max(r.xy - px, px - r.zw);
      float m = 1.0 - clamp(max(d.x, d.y) + .5, 0.0, 1.0); if(m > vm){ vm = m; vl = uVeilK[i]; } }
    if(vm > 0.0){ vec3 v = look(texture2D(tVeil, uv).rgb*e*uExpo); col = mix(col, mix(v, uPanel, vl), vm*uVeilF); vq = vm*uVeilF; }
  }
  float l = luma(col);
  col += (hash(floor(uv*uRes/max(uGrainSize, 1.0)) + fract(uTime*7.31)*91.7) - .5)*uGrain*(1.0 - .55*l)*(.4 + .6*smoothstep(.0, .25, l))
    *mix(vec3(1.0), (uTone + uToneHi)*.5, uMono);                                       /* grain viré avec l'image monochrome */
  if(uDust > .001){ float h = hash(floor(vUv*uRes/3.0) + fr*17.13);                     /* poussières : points clairs ou sombres */
    col = mix(col, vec3(h > 1.0 - .0004*uDust ? .85 : .03), step(1.0 - .0009*uDust, h)*.8*(1.0 - .85*vq)); }
  if(uScratch > .001){ float sk = floor(uTime*1.3), lx = hash(vec2(sk, 2.2)) + .002*sin(uTime*9.0);    /* rayure verticale */
    col *= 1.0 - step(.45, hash(vec2(sk, 7.7)))*uScratch*.35*smoothstep(1.2, 0.0, abs(vUv.x - lx)*uRes.x)*(1.0 - .85*vq); }
  if(uVhs > .001){ float d = abs(vUv.y - fract(.3 - uTime*.05));                            /* bande de tracking qui remonte */
    float nz = step(.82, hash(vec2(floor(vUv.x*uRes.x/4.0), floor(vUv.y*uRes.y*.5)) + fract(uTime*13.0)));
    col += nz*((1.0 - smoothstep(.0, .018, d))*.35 + smoothstep(.045, .0, vUv.y)*.12)*uVhs*(1.0 - .85*vq); }   /* discret sous le texte */
  if(uCRT > .001){
    float sl = .82 + .18*sin(uv.y*uRes.y*3.14159);
    float m = mod(gl_FragCoord.x, 3.0); vec3 mask = m < 1.0 ? vec3(1.0, .82, .82) : m < 2.0 ? vec3(.82, 1.0, .82) : vec3(.82, .82, 1.0);
    vec3 crt = col*sl*mask*vec3(.92, 1.06, .95)*(1.0 + .04*sin(uTime*60.0));
    crt *= 1.0 - .35*smoothstep(.25, .75, length(cq)*1.25);
    col = mix(col, crt, uCRT);
    if(uCrtOpen < 1.0){ float hh = .5*uCrtOpen + .003; col *= step(abs(cq.y), hh)*(1.0 + 2.5*(1.0 - uCrtOpen)); }   /* mise sous tension : une ligne qui s'ouvre */
  }
  if(uGate > .001){ float r = .06*uRes.y*uGate; vec2 p = abs(vUv - .5)*uRes - (uRes*.5 - vec2(r + .012*uRes.y*uGate));   /* fenêtre de projection */
    col *= 1.0 - smoothstep(-6.0, 2.0, length(max(p, 0.0)) - r); }
  float bar = step(uv.y, uBar) + step(1.0 - uBar, uv.y);
  col *= (1.0 - clamp(bar, 0.0, 1.0))*(1.0 - uFade);
  gl_FragColor = vec4(col, 1.0);
}`
};

PHO.create = function(renderer, opts){
  opts = opts || {};
  const SEED = String(opts.seed !== undefined ? opts.seed : Math.floor(Math.random()*1e9));
  const PH = { enabled: true, debug: null, wipe: 0, seed: SEED, grainScale: 1, aspect: 16/9, crtChance: opts.crtChance !== undefined ? opts.crtChance : .15,
    quality: { msaa: opts.msaa !== false, dof: true, flare: true }, state: { seq: -1, shot: -1, look: null, lookName: null, aperture: 0, flare: 1, crt: 0 } };
  let forcedLook = opts.look && opts.look !== 'auto' ? opts.look : null, forcedBar = undefined, crtUntil = -1, crtStart = -1, time = 0;
  const gl2 = renderer.capabilities.isWebGL2;

  /* ---------- cibles ---------- */
  const T = {}, size = { w: 0, h: 0 };
  const mk = (w, h, o) => new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), Object.assign({ minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false }, o || {}));
  /* exposition : cibles indépendantes de la taille, gardées d'une allocation à l'autre (pas de saut d'exposition quand la
     qualité automatique change la résolution) */
  const near = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
  const TA = { lum: mk(16, 16, near), ad0: mk(1, 1, near), ad1: mk(1, 1, near) };
  function alloc(w, h){
    Object.keys(T).forEach(k => { if(!TA[k]) T[k].dispose(); });
    const h2 = [w >> 1, h >> 1], h4 = [w >> 2, h >> 2], h8 = [w >> 3, h >> 3], h16 = [w >> 4, h >> 4], h32 = [w >> 5, h >> 5];
    msaaOn = !!(gl2 && THREE.WebGLMultisampleRenderTarget && PH.quality.msaa);
    /* profondeur 24 bits (DEPTH24_STENCIL8) : avec la profondeur 16 bits par défaut de three r128, un astre au fond d'une
       tranche (près de son plan lointain) se battait avec sa couronne et son halo (liseré qui scintillait au limbe) */
    if(msaaOn){ T.scene = new THREE.WebGLMultisampleRenderTarget(w, h, { format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: true }); T.scene.samples = 4; }
    else T.scene = mk(w, h, { depthBuffer: true, stencilBuffer: true });
    T.scene.texture.encoding = THREE.sRGBEncoding;        /* matériaux de three : ACES + sRGB, comme à l'écran */
    T.coc = mk(...h2); T.prep = mk(...h2); T.dofA = mk(...h2); T.tmp2 = mk(...h2);
    T.dofB = mk(...h4); T.tmp4 = mk(...h4); T.cf = mk(...h4);
    T.bright = mk(...h2); T.b1 = mk(...h4); T.b2 = mk(...h8); T.b3 = mk(...h16); T.b4 = mk(...h32);
    T.t1 = mk(...h4); T.t2 = mk(...h8); T.t3 = mk(...h16); T.t4 = mk(...h32);
    T.sA = mk(...h4); T.sB = mk(...h4);
    T.v2 = mk(...h2); T.v4 = mk(...h4); T.tv = mk(...h4);
    Object.assign(T, TA);
    size.w = w; size.h = h;
  }
  let adaptInit = false, adaptPing = 0, msaaOn = false;

  /* ---------- passes ---------- */
  const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), qScene = new THREE.Scene(), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false; qScene.add(quad);
  const M = {};
  const U = (o) => { const u = {}; Object.keys(o).forEach(k => u[k] = { value: o[k] }); return u; };
  M.copy = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FS.copy, uniforms: U({ tIn: null }), depthTest: false, depthWrite: false });
  M.down = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FS.down, uniforms: U({ tIn: null, uTexel: new THREE.Vector2() }), depthTest: false, depthWrite: false });
  M.bright = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FS.bright, uniforms: U({ tIn: null, uTexel: new THREE.Vector2(), uTh: .72, uKnee: .18, uNorm: 1, uAspect: 1, uMask: new V3() }), depthTest: false, depthWrite: false });
  M.streak = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FS.streak, uniforms: U({ tIn: null, uDir: new THREE.Vector2(), uB: 1, uA: .93, uNorm: 3 }), depthTest: false, depthWrite: false });
  M.blur = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FS.blur, uniforms: U({ tIn: null, uDir: new THREE.Vector2() }), depthTest: false, depthWrite: false });
  M.coc = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FS.coc, depthTest: false, depthWrite: false,
    uniforms: U({ uR: new V3(), uU: new V3(), uF: new V3(), uTan: new THREE.Vector2(), uSph: Array.from({ length: 40 }, () => new THREE.Vector4()), uN: 0,
      uRc: Array.from({ length: 3 }, () => new THREE.Vector4()), uRn: Array.from({ length: 3 }, () => new THREE.Vector4()), uNr: 0, uFocus: 1, uK: 0, uBg: .45, uInf: 0 }) });
  M.fgdown = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FS.fgdown, uniforms: U({ tIn: null, uTexel: new THREE.Vector2() }), depthTest: false, depthWrite: false });
  M.prep = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FS.prep, uniforms: U({ tIn: null, tCoc: null, uTexel: new THREE.Vector2() }), depthTest: false, depthWrite: false });
  M.lum = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FS.lum, uniforms: U({ tIn: null }), depthTest: false, depthWrite: false });
  M.adapt = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FS.adapt, uniforms: U({ tIn: null, tPrev: null, uRate: 1 }), depthTest: false, depthWrite: false });
  M.comp = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FS.comp, depthTest: false, depthWrite: false,
    uniforms: U({ tVeil: null, uVeil: Array.from({ length: 3 }, () => new THREE.Vector4()), uVeilK: [0, 0, 0], uNv: 0, uVeilF: 0, uPanel: new V3(.043, .071, .125),
      tScene: null, tCoc: null, tCf: null, tDofA: null, tDofB: null, tB1: null, tB2: null, tB3: null, tB4: null, tStreak: null, tAdapt: null,
      uRes: new THREE.Vector2(), uTime: 0, uOn: 1, uDof: 0, uBloom: 0, uHal: 0, uStreak: 0, uGhost: 0, uAberr: 0, uVig: 0, uGrain: 0, uBar: 0, uFade: 0, uCRT: 0, uKey: .14, uDebug: 0, uWipe: 0,
      uStreakTint: new V3(1, 1, 1), uStar: new V3(), uCrtOpen: 1, uSat: 1, uContrast: 1, uGamma: 1, uSplit: 0, uLift: new V3(), uGain: new V3(1, 1, 1), uShadows: new V3(), uHigh: new V3(1, 1, 1),
      uMono: 0, uDye: 0, uExpo: 1, uGrainSize: 1, uWeave: 0, uFlicker: 0, uGate: 0, uDust: 0, uScratch: 0, uVhs: 0, uTube: 0, uTone: new V3(1, 1, 1), uToneHi: new V3(1, 1, 1) }) });
  PH.passes = 0;
  function pass(mat, target, set){
    if(set) Object.keys(set).forEach(k => { const v = set[k]; if(v && v.isVector2) mat.uniforms[k].value.copy(v); else mat.uniforms[k].value = v; });
    quad.material = mat; renderer.setRenderTarget(target); renderer.render(qScene, qCam); PH.passes++;
  }
  const tex = t => t.texture, texel = t => new THREE.Vector2(1/t.width, 1/t.height);
  function blur2(src, tmp, dst, scale){
    pass(M.blur, tmp, { tIn: tex(src), uDir: new THREE.Vector2(scale/src.width, 0) });
    pass(M.blur, dst, { tIn: tex(tmp), uDir: new THREE.Vector2(0, scale/src.height) });
  }

  /* ---------- directeur photo ---------- */
  function chooseLook(seq){
    if(forcedLook) return forcedLook;
    const r = rngOf(SEED + ':look:' + seq), prev = PH.state.lookName;
    const list = Object.keys(LOOKS).filter(k => k !== prev && LOOKS[k].w > 0);
    let s = 0; list.forEach(k => s += LOOKS[k].w); let x = r()*s;
    for(const k of list){ x -= LOOKS[k].w; if(x <= 0) return k; }
    return list[list.length - 1];
  }
  let newShot = false;            /* nouveau plan : l'exposition est réglée d'emblée (pas d'iris visible sur une coupe) */
  let queued;                     /* ambiance en attente : appliquée sur la prochaine coupe (nouveau plan ou nouveau système) */
  function direct(meta){
    const st = PH.state;
    if(queued !== undefined && (meta.seq !== st.seq || meta.shot !== st.shot || meta.seq !== st.seqShot)){
      forcedLook = queued; queued = undefined; st.pending = false;
      if(meta.seq === st.seq && forcedLook){ st.lookName = forcedLook; st.look = LOOKS[forcedLook]; }
    }
    if(meta.seq !== st.seq){
      st.seq = meta.seq; st.lookName = chooseLook(meta.seq); st.look = LOOKS[st.lookName];
      const r = rngOf(SEED + ':crt:' + meta.seq);
      if(meta.seq > 0 && r() < PH.crtChance){ crtStart = time; crtUntil = time + 1.6; }
    }
    if(meta.shot !== st.shot || meta.seq !== st.seqShot){
      st.shot = meta.shot; st.seqShot = meta.seq; newShot = true;
      const r = rngOf(SEED + ':plan:' + meta.seq + ':' + meta.shot), cfg = SHOT[meta.type] || { ap: [0, .1], flare: 1 };
      st.aperture = lerp(cfg.ap[0], cfg.ap[1], r()); st.flare = cfg.flare*lerp(.85, 1.1, r());
    }
  }
  PH.setLook = name => { forcedLook = name && name !== 'auto' && LOOKS[name] ? name : null; queued = undefined; PH.state.pending = false;
    if(forcedLook){ PH.state.lookName = forcedLook; PH.state.look = LOOKS[forcedLook]; } else PH.state.seq = -1; };   /* tout de suite, sans coupe */
  /* ambiance pour la prochaine coupe (sans effet si c'est déjà la bonne) ; PH.state.pending tant qu'elle attend */
  PH.queueLook = name => { const n = name && name !== 'auto' && LOOKS[name] ? name : null;
    if(n === forcedLook && n === PH.state.lookName){ queued = undefined; PH.state.pending = false; return false; }
    queued = n; PH.state.pending = true; return true; };
  PH.setLetterbox = ratio => { forcedBar = ratio; };
  PH.forceCRT = (dur) => { crtStart = time; crtUntil = time + (dur || 1.6); };
  /* calques : [{ x0, y0, x1, y1, k }] en coordonnées d'image (0..1, y vers le haut), k = assombrissement ; fondu 0..1 */
  let veils = [], veilF = 0;
  PH.setVeil = (list, fade) => { veils = (list || []).slice(0, 3); veilF = veils.length ? clamp(fade === undefined ? 1 : fade, 0, 1) : 0; PH.state.veil = veilF; PH.state.veils = veils; };

  /* ---------- réglages de l'image (sans rendu : utilisable quand l'image n'est pas dessinée) ---------- */
  const DEF_META = { fade: 0, seq: 0, shot: 0, type: 'survol', focus: 1e20, near: null, star: { ndc: [0, 0], onScreen: false, vis: 0 } };
  PH.update = function(meta, dt){
    time += dt || 0; meta = meta || DEF_META;
    direct(meta);
    const st = PH.state, L = st.look;
    st.K = st.aperture*(meta.near !== null && meta.near !== undefined ? 1 : .55);       /* sans premier plan : fond seul, flou moindre */
    const star = meta.star || DEF_META.star;
    const edge = star.onScreen ? clamp(1.25 - Math.max(Math.abs(star.ndc[0]), Math.abs(star.ndc[1])), 0, 1) : 0;
    st.flareK = st.flare*Math.pow(clamp(star.vis, 0, 1), .7)*smooth(edge*1.6);
    st.streak = L.streak*st.flareK; st.ghost = L.ghost*st.flareK;
    const ct = time - crtStart, crtOn = time < crtUntil && ct >= 0, cd = crtUntil - crtStart;
    st.crt = crtOn ? 1 - smooth((ct - .45*cd)/(.55*cd)) : 0;
    st.crtOpen = crtOn ? smooth(ct/.3) : 1;
    st.fade = (meta.fade || 0)*(crtOn ? 1 - smooth(ct/.12) : 1);      /* la mise sous tension tient lieu de fondu d'ouverture */
    st.letter = forcedBar === null ? 0 : (forcedBar || L.letter);
    /* bandes : fraction de la hauteur, qui glisse d'un format à l'autre (≈ 0,4 s) */
    const bf = st.letter ? Math.max(0, (1 - PH.aspect/st.letter)/2) : 0;
    st.barF = st.barF === undefined || !(dt > 0) ? bf : st.barF + (bf - st.barF)*(1 - Math.exp(-dt*9));   /* dt nul : sans glissement */
    if(Math.abs(st.barF - bf) < 1e-4) st.barF = bf;
    return st;
  };

  /* ---------- image ---------- */
  const _buf = new THREE.Vector2(), _q = new THREE.Quaternion();
  PH.render = function(W, camera, meta, dt){
    PH.passes = 0;
    renderer.getDrawingBufferSize(_buf);
    const w = _buf.x | 0, h = _buf.y | 0;
    if(w !== size.w || h !== size.h || msaaOn !== !!(gl2 && THREE.WebGLMultisampleRenderTarget && PH.quality.msaa)) alloc(w, h);
    PH.aspect = w/h;
    meta = meta || DEF_META;
    const st = PH.update(meta, dt), L = st.look;
    /* 1) le monde, à l'identique de l'écran */
    renderer.setRenderTarget(T.scene); W.render(renderer, camera); PH.passes++;
    const C = M.comp.uniforms;
    C.uRes.value.set(w, h); C.uTime.value = time; C.uFade.value = st.fade; C.tScene.value = tex(T.scene);
    if(!PH.enabled){ C.uOn.value = 0; pass(M.comp, null); return; }
    C.uOn.value = 1; C.uDebug.value = PH.debug === 'coc' ? 1 : 0; C.uWipe.value = PH.wipe || 0;
    /* 2) carte de flou (profondeur de champ) */
    const K = PH.quality.dof ? st.K : 0;
    C.uDof.value = K > .08 || PH.debug === 'coc' ? 1 : 0;
    if(C.uDof.value){
      const cu = M.coc.uniforms, inf = !(meta.focus < 1e15), scale = inf ? 1e9 : Math.max(meta.focus, 1);
      camera.getWorldQuaternion(_q);
      cu.uR.value.set(1, 0, 0).applyQuaternion(_q); cu.uU.value.set(0, 1, 0).applyQuaternion(_q); cu.uF.value.set(0, 0, -1).applyQuaternion(_q);
      const tY = Math.tan(camera.fov*Math.PI/360); cu.uTan.value.set(tY*camera.aspect, tY);
      const B = W.depthBodies(); let n = 0;
      B.sph.forEach(s => { if(n >= 40) return; cu.uSph.value[n++].set((s[0].x - camera.position.x)/scale, (s[0].y - camera.position.y)/scale, (s[0].z - camera.position.z)/scale, s[1]/scale); });
      cu.uN.value = n; let nr = 0;
      B.rings.forEach(rg => { if(nr >= 3) return; cu.uRc.value[nr].set((rg[0].x - camera.position.x)/scale, (rg[0].y - camera.position.y)/scale, (rg[0].z - camera.position.z)/scale, rg[2]/scale);
        cu.uRn.value[nr].set(rg[1].x, rg[1].y, rg[1].z, rg[3]/scale); nr++; });
      cu.uNr.value = nr; cu.uFocus.value = inf ? 1 : meta.focus/scale; cu.uK.value = PH.debug === 'coc' ? 1 : K; cu.uInf.value = inf ? 1 : 0;
      pass(M.coc, T.coc);
      pass(M.prep, T.prep, { tIn: tex(T.scene), tCoc: tex(T.coc), uTexel: texel(T.scene) });
      blur2(T.prep, T.tmp2, T.dofA, 1.6);
      pass(M.down, T.dofB, { tIn: tex(T.dofA), uTexel: texel(T.dofA) });
      blur2(T.dofB, T.tmp4, T.dofB, 2.2);
      pass(M.fgdown, T.cf, { tIn: tex(T.coc), uTexel: texel(T.coc) });
      blur2(T.cf, T.tmp4, T.cf, 2.4);
      C.tCoc.value = tex(T.coc); C.tCf.value = tex(T.cf); C.tDofA.value = tex(T.dofA); C.tDofB.value = tex(T.dofB);
    }
    /* 3) bloom : hautes lumières, 4 niveaux */
    pass(M.bright, T.bright, { tIn: tex(T.scene), uTexel: texel(T.scene), uTh: .72, uKnee: .18, uNorm: 1, uMask: new V3(0, 0, 0), uAspect: w/h });
    pass(M.down, T.b1, { tIn: tex(T.bright), uTexel: texel(T.bright) }); blur2(T.b1, T.t1, T.b1, 1);
    pass(M.down, T.b2, { tIn: tex(T.b1), uTexel: texel(T.b1) }); blur2(T.b2, T.t2, T.b2, 1);
    pass(M.down, T.b3, { tIn: tex(T.b2), uTexel: texel(T.b2) }); blur2(T.b3, T.t3, T.b3, 1);
    pass(M.down, T.b4, { tIn: tex(T.b3), uTexel: texel(T.b3) }); blur2(T.b4, T.t4, T.b4, 1);
    /* 4) flare anamorphique : seuil haut, étalement horizontal croissant */
    const star = meta.star || DEF_META.star;
    /* une traînée est une ligne : atténuée quand l'étoile est grande à l'écran (rayon apparent / demi-hauteur) */
    const rad = W.leg && W.leg.Rs ? W.leg.Rs/Math.max(camera.position.length(), 1)/Math.tan(camera.fov*Math.PI/360) : 0;
    st.streak *= (1 - smooth((rad - .03)/.12))*(PH.quality.flare ? 1 : 0); C.uStreak.value = st.streak;
    if(C.uStreak.value > .01){
      /* source : les hautes lumières au voisinage de l'étoile (pas le limbe éclairé d'une planète) ; ¼ : 4 prises bilinéaires = 16 texels */
      pass(M.bright, T.sA, { tIn: tex(T.scene), uTexel: texel(T.bright), uTh: .9, uKnee: .05, uNorm: 10, uAspect: w/h,
        uMask: new V3(star.ndc[0]*.5 + .5, star.ndc[1]*.5 + .5, Math.max(.06, rad*1.25)) });
      const step = Math.max(1, T.sA.width/240)/T.sA.width;      /* longueur proportionnelle à la largeur de l'image */
      pass(M.streak, T.sB, { tIn: tex(T.sA), uDir: new THREE.Vector2(step, 0), uB: 1 });
      pass(M.streak, T.sA, { tIn: tex(T.sB), uB: 4 });
      pass(M.streak, T.sB, { tIn: tex(T.sA), uB: 16 });
      C.tStreak.value = tex(T.sB);
    } else C.tStreak.value = tex(T.b4);
    /* 5) exposition : moyenne 16×16 puis 1×1 lissée */
    pass(M.lum, T.lum, { tIn: tex(T.scene) });
    const prev = adaptPing ? T.ad1 : T.ad0, next = adaptPing ? T.ad0 : T.ad1; adaptPing ^= 1;
    pass(M.adapt, next, { tIn: tex(T.lum), tPrev: tex(prev), uRate: adaptInit && !newShot ? 1 - Math.exp(-(dt || 0)*1.2) : 1 }); adaptInit = true; newShot = false;
    /* 6) calques : image très floutée au quart */
    C.uNv.value = veilF > .001 ? veils.length : 0; C.uVeilF.value = veilF;
    if(C.uNv.value){
      pass(M.down, T.v2, { tIn: tex(T.scene), uTexel: texel(T.scene) });
      pass(M.down, T.v4, { tIn: tex(T.v2), uTexel: texel(T.v2) });
      blur2(T.v4, T.tv, T.v4, 2.5); blur2(T.v4, T.tv, T.v4, 5);
      veils.forEach((v, i) => { C.uVeil.value[i].set(v.x0, v.y0, v.x1, v.y1); C.uVeilK.value[i] = v.k; });
      C.tVeil.value = tex(T.v4);
    }
    /* 7) composition */
    const bar = st.letter, g = L.grade;
    C.tB1.value = tex(T.b1); C.tB2.value = tex(T.b2); C.tB3.value = tex(T.b3); C.tB4.value = tex(T.b4); C.tAdapt.value = tex(next);
    C.uBloom.value = L.bloom; C.uHal.value = L.halation; C.uGhost.value = st.ghost; C.uStreakTint.value.set(...L.streakTint);
    C.uStar.value.set(star.ndc[0], star.ndc[1], 0); C.uAberr.value = L.aberr; C.uVig.value = L.vignette; C.uGrain.value = L.grain*PH.grainScale;
    C.uBar.value = st.barF || 0;
    C.uSat.value = g.sat; C.uContrast.value = g.contrast; C.uGamma.value = g.gamma; C.uSplit.value = g.split;
    C.uLift.value.set(...g.lift); C.uGain.value.set(...g.gain); C.uShadows.value.set(...g.shadows); C.uHigh.value.set(...g.highlights);
    C.uCRT.value = Math.max(st.crt, L.crt || 0); C.uCrtOpen.value = st.crtOpen;
    C.uMono.value = L.mono || 0; C.uDye.value = L.dye || 0; C.uExpo.value = L.expo || 1; C.uGrainSize.value = L.grainSize || 1;
    C.uWeave.value = L.weave || 0; C.uFlicker.value = L.flicker || 0; C.uGate.value = L.gate || 0; C.uDust.value = L.dust || 0;
    C.uScratch.value = L.scratch || 0; C.uVhs.value = L.vhs || 0; C.uTube.value = L.tube || 0;
    C.uTone.value.set(...(L.tone || [1, 1, 1])); C.uToneHi.value.set(...(L.toneHi || L.tone || [1, 1, 1]));
    st.bar = C.uBar.value; st.dof = C.uDof.value ? K : 0;
    pass(M.comp, null);
  };
  PH.dispose = function(){ Object.values(T).forEach(t => t.dispose()); Object.values(TA).forEach(t => t.dispose()); Object.values(M).forEach(m => m.dispose()); quad.geometry.dispose(); };
  return PH;
};
})();
