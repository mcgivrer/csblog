/* =====================================================================
   VIEILLISSEMENT DES VAISSEAUX — option du générateur : SHIPGEN.build(modèle, { age, ageSeed })
   age ∈ [0, 1] : 0 = sortie de chantier, 0,5 = usé, 1 = épave en fin de vie.
   Sans modifier le moteur : la démo enveloppe SHIPGEN.build et patche les matériaux standard du vaisseau.
   - coordonnées « vaisseau » précalculées par sommet (attribut aShip, en mètres) : l'usure ne glisse pas quand le vaisseau bouge
   - peinture passée et jaunie, crasse en grandes plaques, éclats de peinture (métal nu),
     rouille qui gagne les joints de tôles puis s'étend, coulures étirées vers la poupe (fuites tirées par l'accélération),
     tôles remplacées (apprêt rouge, gris, blanc neuf), suie autour des tuyères, tuyères bleuies par la chaleur,
     rugosité et relief (cloques de rouille, bosses)
   - un seul programme GPU par variante de matériau pour toute la flotte ; les valeurs (âge, graine, dimensions) sont par vaisseau
   ===================================================================== */
(function(){
'use strict';
if(typeof SHIPGEN === 'undefined') return;
const W = window.__SHIPWEAR = {};
const clamp = (x,a,b) => Math.max(a, Math.min(b, x));

const PARS_V = `
attribute vec3 aShip;
varying vec3 vShip;`;
const PARS_F = `
uniform float uAge; uniform float uWSeed; uniform vec2 uZr; uniform float uWLen; uniform float uWKind;
varying vec3 vShip;
float wRust = 0.0, wSoot = 0.0, wChip = 0.0, wGrime = 0.0, wH = 0.0, wScr = 0.0, wGrain = 0.0;
float wh(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x + p.y + p.z)); }
float wn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0 - 2.0*f);
  return mix(mix(mix(wh(i), wh(i + vec3(1,0,0)), f.x), mix(wh(i + vec3(0,1,0)), wh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(wh(i + vec3(0,0,1)), wh(i + vec3(1,0,1)), f.x), mix(wh(i + vec3(0,1,1)), wh(i + vec3(1,1,1)), f.x), f.y), f.z); }
float wfbm(vec3 p){ float v = 0.0, a = 0.5; for(int i = 0; i < 4; i++){ v += a*wn(p); p = p*2.07 + 17.3; a *= 0.5; } return v; }
vec3 wLin(vec3 c){ return pow(c, vec3(2.2)); }
/* micro-relief (v7.1) : grain de laminage (période 1,8 cm, étiré le long du vaisseau), léger martelage des tôles, rayures fines
   (courbes de niveau d'un bruit étiré, métal plus clair et plus lisse) ; chaque couche s'efface quand elle devient plus fine
   qu'un pixel (pas de scintillement) : ce détail n'apparaît que dans les gros plans. Hauteur en unités de wH (× 0,08 m). */
float wDetail(inout vec3 col){
  if(uWKind > 0.5 && uWKind < 1.5) return 0.0;                       /* tuyères : relief propre (tubes) */
  float fw = length(fwidth(vShip));
  float f1 = 1.0 - smoothstep(0.004, 0.012, fw), f2 = 1.0 - smoothstep(0.02, 0.07, fw);
  if(f2 <= 0.0) return 0.0;
  vec3 p = vShip + vec3(uWSeed*7.31, uWSeed*3.17, uWSeed*5.53);
  float h = (wn(p*7.0) - 0.5)*0.024*f2;                               /* martelage */
  if(f1 > 0.0){ wGrain = (wn(vec3(p.x*55.0, p.y*55.0, p.z*6.0)) - 0.5)*f1; h += wGrain*0.01; }
  float sc = abs(wn(vec3(p.x*2.2, p.y*2.2, p.z*0.35) + 31.0) - 0.5);
  wScr = (1.0 - smoothstep(0.0, 0.012 + fw*3.0, sc))*step(0.55, wn(p*0.9 + 7.0))*f2*(uWKind > 1.5 && uWKind < 2.5 ? 0.5 : 1.0);
  h -= wScr*0.012;
  col *= 1.0 + 0.09*wScr + 0.08*wGrain;
  return h;
}
/* kinds : 0 coque peinte (tôles), 1 tuyères, 2 structure métallique, 4 pièces peintes / conteneurs */
void wearColor(inout vec3 col, float seam){
  float A = uAge;
  if(A < 0.004) return;
  vec3 p = vShip + vec3(uWSeed*7.31, uWSeed*3.17, uWSeed*5.53);
  float fw = length(fwidth(vShip));                                   /* taille d'un pixel sur la coque (m) */
  float fine = 1.0 - smoothstep(0.08, 0.35, fw);                      /* le détail fin s'efface au loin (pas de scintillement) */
  bool hull = uWKind < 0.5, engine = uWKind > 0.5 && uWKind < 1.5, frame = uWKind > 1.5 && uWKind < 2.5;
  /* crasse : grandes plaques, davantage dans les joints */
  float g = wfbm(p*0.11);
  float g2 = wfbm(p*0.07 + 9.0) + 0.3*wfbm(p*0.6);
  wGrime = A*(0.35 + 0.65*smoothstep(0.52, 0.66, g2 + 0.12*seam));   /* voile général + taches franches */
  /* peinture passée : désaturée et jaunie */
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, lum*vec3(1.05, 0.92, 0.72), (engine ? 0.15 : 0.7)*A);
  /* tôles remplacées (coque) : apprêt rouge, gris neutre ou blanc neuf */
  if(hull){
    vec3 cell = floor(p/vec3(4.2, 4.2, 5.6));
    if(wh(cell + 3.7) < 0.14*A){
      float t = wh(cell + 11.1);
      vec3 pc = t < 0.35 ? wLin(vec3(0.47, 0.29, 0.23)) : (t < 0.7 ? wLin(vec3(0.5, 0.52, 0.54)) : wLin(vec3(0.9, 0.9, 0.87)));
      col = mix(col, pc*(0.85 + 0.3*wh(cell + 5.0)), 0.88);
    }
  }
  /* rouille : naît dans les joints de tôles, s'étend en plaques avec l'âge */
  float r = wfbm(p*0.32) + 0.4*wfbm(p*1.3) + 0.35*seam*fine;
  float th = 1.26 - 0.5*A - (frame ? 0.12 : 0.0) + (engine ? 0.2 : 0.0);
  wRust = smoothstep(th, th + max(0.07, 1.5*fwidth(r)), r);                /* bord anticrénelé (v7.1) : pas de pixels durs */
  float rf = mix(0.5, wn(p*4.3), fine);
  vec3 rustC = mix(wLin(vec3(0.24, 0.12, 0.07)), wLin(vec3(0.52, 0.27, 0.12)), rf);
  rustC = mix(rustC, wLin(vec3(0.16, 0.09, 0.06)), smoothstep(0.08, 0.35, r - th - 0.07)*0.6);   /* cœur des plaques plus sombre */
  /* coulures étirées vers la poupe (+Z) : fuites entraînées par l'accélération des moteurs — crasse, et rouille près des plaques */
  float s = wfbm(vec3(p.x*1.6, p.y*1.6, p.z*0.09));
  float sm = smoothstep(0.44, 0.6, s)*A*(0.45 + 0.55*smoothstep(0.3, 0.7, wfbm(p*0.2 + 4.0)));
  col = mix(col, col*vec3(0.5, 0.45, 0.4), sm*0.6);
  col = mix(col, rustC, sm*smoothstep(th - 0.2, th, r)*0.6);
  col = mix(col, rustC, wRust);
  /* suie autour des tuyères (poupe) et crasse */
  float soot = engine ? 0.6 + 0.4*g : smoothstep(uZr.y - 0.2*uWLen, uZr.y, vShip.z)*(0.5 + 0.5*g);
  wSoot = A*soot;
  col *= (1.0 - 0.55*wGrime)*(1.0 - 0.6*wSoot);
  col = mix(col, col*vec3(0.9, 0.8, 0.66), wGrime*0.7);
  /* éclats de peinture : métal nu */
  float ch = wn(p*2.7)*wn(p*9.0 + 3.0);
  float chw = max(0.05, 1.5*fwidth(ch));                              /* éclats : bord adouci à l'échelle du pixel (v7.1) */
  wChip = smoothstep(0.55 - 0.18*A, 0.55 - 0.18*A + chw, ch)*A*(1.0 - wRust)*(frame ? 0.3 : 1.0)*fine*(0.05/chw);
  col = mix(col, mix(wLin(vec3(0.22, 0.23, 0.25)), wLin(vec3(0.62, 0.63, 0.65)), wn(p*5.0)), wChip*0.8);   /* apprêt sombre ou métal nu */
  /* tuyères : bleuissement et bronze de revenu thermique */
  if(engine){ float band = sin(vShip.z*1.7 + wn(p*0.8)*3.0)*0.5 + 0.5; col = mix(col, mix(wLin(vec3(0.45, 0.30, 0.18)), wLin(vec3(0.25, 0.22, 0.42)), band), 0.55*A); }
  /* relief : cloques de rouille, éclats, bosses */
  wH = wRust*(0.6 + 0.4*rf) - wChip*0.4 + A*0.3*wfbm(p*0.5);
}`;
const AFTER_MAP = `
{
  float wSeam = 0.0;
#ifdef USE_MAP
  wSeam = 1.0 - smoothstep(0.30, 0.55, dot(texelColor.rgb, vec3(0.3333)));   /* joints de tôles (texture de panneaux du jeu) */
#endif
  vec3 wc = diffuseColor.rgb; wearColor(wc, wSeam); wH += wDetail(wc); diffuseColor.rgb = wc;
}`;
const AFTER_METAL = `
  roughnessFactor = clamp(mix(mix(roughnessFactor, 0.93, wRust) + 0.12*wGrime + 0.08*uAge, 0.35, wChip*0.6), 0.04, 1.0);
  metalnessFactor = mix(mix(metalnessFactor, 0.08, wRust), 0.85, wChip*0.7);
  roughnessFactor = clamp(roughnessFactor*(1.0 - 0.35*wScr) + 0.06*wGrain, 0.04, 1.0);          /* rayures polies, grain */`;
const AFTER_NORMAL = `
{                                                                   /* toujours évalué : dérivées en flot uniforme (détail fin même sur une coque neuve) */
  vec3 wdx = dFdx(-vViewPosition), wdy = dFdy(-vViewPosition);
  float whx = dFdx(wH), why = dFdy(wH);
  vec3 wr1 = cross(wdy, normal), wr2 = cross(normal, wdx); float wdet = dot(wdx, wr1);
  vec3 wgrad = sign(wdet)*(whx*wr1 + why*wr2)*0.08;
  normal = normalize(abs(wdet)*normal - wgrad);
}`;
function WEAR_OBC(shader){
  Object.assign(shader.uniforms, this.userData.wear);
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>' + PARS_V).replace('#include <begin_vertex>', '#include <begin_vertex>\n  vShip = aShip;');
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>' + PARS_F)
    .replace('#include <map_fragment>', '#include <map_fragment>' + AFTER_MAP)
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>' + AFTER_METAL)
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>' + AFTER_NORMAL);
}
const WEAR_KEY = () => 'shipwear-v1';
function kindOf(m){
  if(m.userData && m.userData.wearKind !== undefined) return m.userData.wearKind;   // pièce qui déclare sa nature (ex. moteurs de shipdrive.js)
  if(m.bumpMap) return 0;                                                            // coque à tôles
  if(m.emissiveIntensity > 0 || (m.side === THREE.DoubleSide && m.metalness >= .65)) return 1;   // tuyères
  if(m.map) return 4;                                                                // pièces peintes, conteneurs, radiateurs
  return 2;                                                                          // structure métallique
}

/* applique l'usure à un vaisseau construit ; unit = mètres par unité locale du groupe */
W.apply = function(group, age, seed, unit){
  unit = unit || 1; age = clamp(+age || 0, 0, 1);
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const U = { uAge:{ value: age }, uWSeed:{ value: ((seed >>> 0) % 997)*.113 + .37 }, uZr:{ value: new THREE.Vector2() }, uWLen:{ value: 1 } };
  const mats = new Map(), v = new THREE.Vector3(); let zmin = Infinity, zmax = -Infinity;
  group.traverse(o => {
    if(!o.isMesh || o.isInstancedMesh || !o.geometry || !o.geometry.attributes.position) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    if(!list.some(m => m && m.isMeshStandardMaterial)) return;
    const rel = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    let g = o.geometry;
    if(g.userData.wearOwner && (g.userData.wearOwner !== U || !g.userData.wearRel.equals(rel))){ g = g.clone(); o.geometry = g; }   // géométrie partagée : copie propre
    g.userData.wearOwner = U; g.userData.wearRel = rel;
    const pos = g.attributes.position, arr = new Float32Array(pos.count*3);
    for(let i=0;i<pos.count;i++){ v.fromBufferAttribute(pos, i).applyMatrix4(rel).multiplyScalar(unit); arr[i*3] = v.x; arr[i*3+1] = v.y; arr[i*3+2] = v.z; if(v.z < zmin) zmin = v.z; if(v.z > zmax) zmax = v.z; }
    g.setAttribute('aShip', new THREE.BufferAttribute(arr, 3));
    const out = list.map(m => {
      if(!m || !m.isMeshStandardMaterial) return m;
      if(mats.has(m)) return mats.get(m);
      const mm = m.clone();                                   // copie par vaisseau : aucun matériau partagé n'est modifié
      mm.userData = Object.assign({}, m.userData);            // copie superficielle : les uniformes d'autres modules restent liés
      mm.userData.wear = Object.assign({ uWKind:{ value: kindOf(m) } }, U);
      const pre = m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile ? m.onBeforeCompile : null;   // injection existante (moteurs) : enchaînée
      if(pre){ const preKey = m.customProgramCacheKey ? m.customProgramCacheKey() : ''; mm.onBeforeCompile = function(sh, r){ pre.call(this, sh, r); WEAR_OBC.call(this, sh, r); }; mm.customProgramCacheKey = () => 'shipwear-v1+' + preKey; }
      else { mm.onBeforeCompile = WEAR_OBC; mm.customProgramCacheKey = WEAR_KEY; }
      mm.extensions = Object.assign({}, mm.extensions || {}, { derivatives: true });
      mats.set(m, mm); return mm;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
  if(zmin < zmax){ U.uZr.value.set(zmin, zmax); U.uWLen.value = zmax - zmin; }
  return U;
};

/* le générateur accepte désormais { age, ageSeed } */
const build0 = SHIPGEN.build;
SHIPGEN.build = function(model, opts){
  const b = build0.call(SHIPGEN, model, opts);
  const age = opts && opts.age ? +opts.age : 0;
  b.age = age;
  if(!(opts && opts.wear === false)) b.wear = W.apply(b.group, age, (opts && opts.ageSeed) || 0, 1);   // v7.1 : aussi à l'âge 0 (micro-relief des gros plans)
  return b;
};
W.label = a => a < .2 ? 'new' : (a < .62 ? 'used' : 'old');
})();
