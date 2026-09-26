/* =====================================================================
   MOTEURS PRINCIPAUX RÉALISTES — tuyères de torche de fusion (option du générateur, sans modifier le moteur)
   Chaque cloche du générateur est remplacée par un ensemble moteur :
   - chambre convergente, col, cloche de profil Rao (angle initial 32°, sortie 9°), paroi épaisse, lèvre de sortie renforcée
   - tubes de refroidissement régénératif sur la paroi (relief), frettes de renfort, bobines magnétiques autour du col,
     vérins d'orientation (cardan)
   - incandescence physique : le col chauffe quand le moteur pousse (jaune-blanc), la cloche rougit vers la sortie,
     puis refroidit lentement après l'extinction (inertie thermique) ; la paroi extérieure, refroidie, ne rougit qu'au col
   - jet de torche de fusion : cœur blanc aveuglant très collimaté (tuyère magnétique), gaine bleutée, halo violet,
     diamants de choc discrets près de la sortie, jet plus long
   Réglages par vaisseau : b.drive = { uHeat, uThr } (mis à jour par la démo à chaque image).
   ===================================================================== */
(function(){
'use strict';
if(typeof SHIPGEN === 'undefined') return;
const D = window.__SHIPDRIVE = {};
const V3 = THREE.Vector3;
const smooth = x => { x = Math.max(0, Math.min(1, x)); return x*x*(3 - 2*x); };

/* ---------- profil de la tuyère (rayon intérieur selon z, de 0 = entrée de chambre à Lb = sortie) ---------- */
function contour(S, Lb){
  const rt = .36*S, rc = .62*S, ut = .2, zt = ut*Lb, z1 = Lb;
  const tn = Math.tan(32*Math.PI/180), te = Math.tan(9*Math.PI/180);
  let zp = (S - rt - te*z1 + tn*zt)/(tn - te);
  zp = Math.max(zt + .12*Lb, Math.min(z1 - .12*Lb, zp));
  const rp = Math.min(rt + tn*(zp - zt), S - te*(z1 - zp));
  const pts = [];
  for(let i=0;i<=8;i++){ const u = i/8*ut, z = u*Lb; pts.push([rt + (rc - rt)*.5*(1 + Math.cos(Math.PI*u/ut)), z]); }   // chambre convergente → col
  for(let i=1;i<=22;i++){ const s = i/22, a = 1 - s;                                                                   // cloche (Bézier quadratique de Rao)
    pts.push([a*a*rt + 2*a*s*rp + s*s*S, a*a*zt + 2*a*s*zp + s*s*z1]); }
  return { pts, rt, rc, ut, zt };
}
function rAt(C, z){ const p = C.pts; if(z <= p[0][1]) return p[0][0]; for(let i=1;i<p.length;i++){ if(p[i][1] >= z){ const a = p[i-1], b = p[i], t = (z - a[1])/Math.max(1e-6, b[1] - a[1]); return a[0] + (b[0] - a[0])*t; } } return p[p.length-1][0]; }
/* surface de révolution autour de +Z, attribut aDrv = (fraction d'angle, fraction axiale) */
function revolve(profile, Lb, seg){
  const g = new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(p[0], p[1])), seg);
  g.rotateX(Math.PI/2);                                         // l'axe du tour (Y) devient Z
  const pos = g.attributes.position, drv = new Float32Array(pos.count*2);
  for(let i=0;i<pos.count;i++){ const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); drv[i*2] = (Math.atan2(y, x)/(2*Math.PI) + 1) % 1; drv[i*2+1] = z/Lb; }
  g.setAttribute('aDrv', new THREE.BufferAttribute(drv, 2));
  return g;
}

/* ---------- matériaux : métal standard + tubes et incandescence injectés ---------- */
const PARS_V = `
attribute vec2 aDrv;
varying vec2 vDrv;`;
const PARS_F = `
uniform float uHeat; uniform float uThr; uniform float uThroat; uniform float uInner; uniform float uTubes;
varying vec2 vDrv;
vec3 dBody(float k){                                 /* couleur d'incandescence : rouge sombre → orange → jaune → blanc */
  vec3 c = mix(vec3(0.22, 0.015, 0.0), vec3(1.0, 0.26, 0.03), smoothstep(0.0, 0.35, k));
  c = mix(c, vec3(1.0, 0.62, 0.18), smoothstep(0.3, 0.65, k));
  return mix(c, vec3(1.0, 0.94, 0.82), smoothstep(0.62, 1.0, k));
}`;
const TUBES = `
if(uTubes > 0.5){
  float tp = vDrv.x*uTubes;
  float fwt = fwidth(tp);
  float rib = abs(sin(3.14159265*tp));
  float hT = sqrt(rib)*(1.0 - smoothstep(0.35, 0.9, fwt))*(uInner > 0.5 ? 0.35 : 1.0);   /* relief des tubes, effacé quand ils deviennent sous-pixel */
  vec3 ddx = dFdx(-vViewPosition), ddy = dFdy(-vViewPosition);
  float hx = dFdx(hT), hy = dFdy(hT);
  vec3 r1 = cross(ddy, normal), r2 = cross(normal, ddx); float det = dot(ddx, r1);
  normal = normalize(abs(det)*normal - sign(det)*(hx*r1 + hy*r2)*0.06);
}`;
const TINT = `
{ float u = vDrv.y; float nearT = exp(-abs(u - uThroat)*7.0);
  /* revenu thermique permanent autour du col : bronze puis bleu acier */
  vec3 temper = mix(vec3(0.42, 0.26, 0.12), vec3(0.16, 0.18, 0.34), smoothstep(0.0, 1.0, sin(u*38.0)*0.5 + 0.5));
  diffuseColor.rgb = mix(diffuseColor.rgb, temper*0.6, nearT*0.55*(1.0 - uInner*0.4)); }`;
const GLOW = `
{ float u = vDrv.y;
  float prof = u < uThroat ? 1.0 : exp(-(u - uThroat)*2.6);            /* le col est le point le plus chaud, la cloche refroidit vers la sortie */
  float k = uHeat*prof*(uInner > 0.5 ? 1.0 : 0.42);
  totalEmissiveRadiance += dBody(k)*pow(k, 1.7)*(uInner > 0.5 ? 4.2 : 1.6);
  if(uInner > 0.5) totalEmissiveRadiance += vec3(0.35, 0.5, 1.0)*uThr*smoothstep(0.55, 1.0, u)*0.35;   /* reflet du jet sur la paroi intérieure */
}`;
function DRIVE_OBC(shader){
  Object.assign(shader.uniforms, this.userData.drive);
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>' + PARS_V).replace('#include <begin_vertex>', '#include <begin_vertex>\n  vDrv = aDrv;');
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>' + PARS_F)
    .replace('#include <map_fragment>', '#include <map_fragment>' + TINT)
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>' + TUBES)
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>' + GLOW);
}
const DRIVE_KEY = () => 'shipdrive-v1';
function driveMat(U, inner, tubes, color, metal, rough, throatU){
  const m = new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, side: inner ? THREE.BackSide : THREE.FrontSide });
  m.color.convertSRGBToLinear(); m.userData.lin = true;
  m.userData.drive = Object.assign({ uInner:{ value: inner ? 1 : 0 }, uTubes:{ value: tubes }, uThroat:{ value: throatU } }, U);
  m.userData.wearKind = 1;                                   // usure : traitée comme une tuyère (suie, revenu), peu de rouille
  m.onBeforeCompile = DRIVE_OBC; m.customProgramCacheKey = DRIVE_KEY;
  m.extensions = { derivatives: true };
  return m;
}
function capMat(U){
  return new THREE.ShaderMaterial({ uniforms: { uHeat: U.uHeat, uThr: U.uThr },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }',
    fragmentShader: `precision highp float; uniform float uHeat; uniform float uThr; varying vec2 vP;
      vec3 dBody(float k){ vec3 c = mix(vec3(0.22, 0.015, 0.0), vec3(1.0, 0.26, 0.03), smoothstep(0.0, 0.35, k)); c = mix(c, vec3(1.0, 0.62, 0.18), smoothstep(0.3, 0.65, k)); return mix(c, vec3(1.0, 0.94, 0.82), smoothstep(0.62, 1.0, k)); }
      void main(){ float r = length(vP); float k = clamp(uHeat*1.1, 0.0, 1.0);
        vec3 col = dBody(k)*pow(k, 1.4)*3.0 + vec3(0.8, 0.9, 1.0)*uThr*2.5*(1.0 - 0.3*r);   /* réaction : blanc-bleu en poussée, incandescence résiduelle ensuite */
        col += vec3(0.05, 0.05, 0.06);
        gl_FragColor = vec4(vec3(1.0) - exp(-col), 1.0); }`,
    side: THREE.FrontSide });
}
function plainMat(color, metal, rough, kind){
  const m = new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough });
  m.color.convertSRGBToLinear(); m.userData.lin = true; m.userData.wearKind = kind; return m;
}

/* ---------- jet de torche de fusion (remplace le shader de panache du moteur, mêmes attributs) ---------- */
const TORCH_FRAG = `
precision highp float;
uniform float uTime; uniform float uThrottle; uniform float uDiamonds; uniform float uSeed; uniform float uGain;
uniform vec3 uCore; uniform vec3 uSheath; uniform vec3 uHaze;
varying float vAxial; varying float vRadial; varying float vEndOn;
float th(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
float tn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0 - 2.0*f);
  return mix(mix(th(i), th(i + vec2(1.0, 0.0)), u.x), mix(th(i + vec2(0.0, 1.0)), th(i + vec2(1.0, 1.0)), u.x), u.y); }
void main(){
  float z = vAxial, x = vRadial, t = uTime + uSeed*13.7;
  /* x : ±1 = 3,4 rayons de sortie ; la sortie de tuyère est à |x| ≈ 0,29 */
  float n = tn(vec2(x*6.0 + uSeed*3.1, z*10.0 - t*6.0))*0.6 + tn(vec2(x*15.0 - uSeed, z*26.0 - t*13.0))*0.4;
  float neck = smoothstep(0.0, 0.12, z);                                   /* focalisation magnétique : le jet se resserre après la sortie */
  float wc = mix(0.16, 0.045 + 0.035*z, neck);
  float ws = mix(0.24, 0.11 + 0.2*z, neck);
  float wh = 0.3 + 0.45*z;
  float a = x/wc, b = x/ws, c = x/wh;
  float core   = exp(-a*a)*exp(-z*0.85);                                 /* cœur blanc, très long */
  float sheath = exp(-b*b)*exp(-z*1.5)*(0.8 + 0.2*n);
  float halo   = exp(-c*c)*exp(-z*2.3)*(0.7 + 0.3*n);
  float plug   = exp(-(x/0.26)*(x/0.26))*exp(-z*16.0);                  /* bouchon lumineux qui remplit la sortie de tuyère */
  /* diamants de choc discrets près de la sortie */
  float cell = z*uDiamonds, u = fract(cell + 0.5) - 0.5, node = 1.0 - abs(u)*2.0; node *= node;
  float dia = node*exp(-z*3.2)*smoothstep(0.3, 0.9, cell)*exp(-(x/0.07)*(x/0.07))*step(0.5, uDiamonds);
  float flick = 0.95 + 0.05*tn(vec2(t*19.0, uSeed*5.0));
  vec3 col = uCore*(core*1.7 + plug*1.8 + dia*0.9) + vec3(0.55, 0.72, 1.0)*sheath*0.6 + vec3(0.5, 0.38, 1.0)*halo*0.2;
  float fade = (1.0 - smoothstep(0.45, 1.0, z))*smoothstep(0.0, 0.015, z)*(1.0 - smoothstep(0.85, 1.0, abs(x)));
  fade *= 1.0 - smoothstep(0.82, 0.985, vEndOn);                         /* vu dans l'axe : l'éclat de tuyère prend le relais */
  col *= flick*uThrottle*uGain*fade;
  col = vec3(1.0) - exp(-col*1.2);
  gl_FragColor = vec4(col, 1.0);
}`;

/* fusion des pièces d'un même matériau (moins d'appels de dessin : 6 par moteur au lieu de 18) */
function mergeParts(G){
  const groups = new Map();
  G.children.slice().forEach(m => { if(!m.isMesh || m.userData.keep) return; const k = m.material; if(!groups.has(k)) groups.set(k, []); groups.get(k).push(m); });
  groups.forEach((list, mat) => {
    if(list.length < 2) return;
    const pos = [], nor = [];
    list.forEach(m => { m.updateMatrix(); const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); g.applyMatrix4(m.matrix);
      pos.push(g.attributes.position.array); nor.push(g.attributes.normal.array); g.dispose(); m.geometry.dispose(); G.remove(m); });
    const n = pos.reduce((a, p) => a + p.length, 0), P = new Float32Array(n), N = new Float32Array(n); let o = 0;
    pos.forEach((p, i) => { P.set(p, o); N.set(nor[i], o); o += p.length; });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    G.add(new THREE.Mesh(g, mat));
  });
}
/* ---------- remplacement des cloches d'un vaisseau construit ---------- */
function isBell(m){ return m && m.isMeshStandardMaterial && m.emissiveIntensity > 0.1 && m.side === THREE.DoubleSide && m.metalness >= .75; }
D.apply = function(group){
  const U = { uHeat:{ value: 0 }, uThr:{ value: 0 } };
  const coilMat = plainMat(0x6e4a2e, .9, .34, 1), frameMat = plainMat(0x2e3237, .6, .5, 2), rodMat = plainMat(0xb9bec4, .95, .18, 1);
  const bells = [];
  group.traverse(o => { if(o.isMesh && isBell(o.material)) bells.push(o); });
  bells.forEach(bell => {
    const parent = bell.parent; if(!parent) return;
    bell.geometry.computeBoundingBox(); const bb = bell.geometry.boundingBox;
    const Lb = bb.max.z - bb.min.z, S = Math.max(bb.max.x, -bb.min.x, bb.max.y, -bb.min.y); if(!(Lb > 0 && S > 0)) return;
    // anneau d'origine à l'entrée de la cloche
    parent.children.slice().forEach(c => { if(c !== bell && c.isMesh && c.geometry && c.geometry.type === 'TorusGeometry' && Math.hypot(c.position.x - bell.position.x, c.position.y - bell.position.y) < .25*S && Math.abs(c.position.z - bell.position.z - .08*Lb) < .25*Lb){ parent.remove(c); c.geometry.dispose(); } });
    parent.remove(bell); bell.geometry.dispose();
    const C = contour(S, Lb), throatU = C.ut, tubes = Math.max(36, Math.round(S*18/2)*2);
    const inner = driveMat(U, true, tubes, 0x2c2c30, .55, .5, throatU);
    const outer = driveMat(U, false, tubes, 0x3b3d42, .78, .42, throatU);
    const G = new THREE.Group(); G.position.copy(bell.position); G.userData.driveUnit = true; parent.add(G);
    const seg = 56;
    // paroi intérieure (vue depuis l'arrière : col incandescent)
    const mIn = new THREE.Mesh(revolve(C.pts, Lb, seg), inner); mIn.userData.keep = true; G.add(mIn);
    // paroi extérieure : chemise de refroidissement (plus épaisse autour de la chambre)
    const outerPts = C.pts.map(p => { const u = p[1]/Lb; return [p[0] + S*(.045 + .07*Math.max(0, 1 - u/.35)), p[1]]; });
    const mOut = new THREE.Mesh(revolve(outerPts, Lb, seg), outer); mOut.userData.keep = true; G.add(mOut);
    // lèvre de sortie renforcée
    const lip = new THREE.Mesh(new THREE.TorusGeometry(S + .022*S, .03*S, 8, seg), frameMat); lip.position.z = Lb; G.add(lip);
    // frettes de renfort
    [.46, .74].forEach(u => { const z = u*Lb, r = rAt(C, z) + S*.05; const f = new THREE.Mesh(new THREE.TorusGeometry(r, .016*S, 6, seg), frameMat); f.position.z = z; G.add(f); });
    // bobines magnétiques autour du col et de la chambre
    [.05, .13, .21].forEach((u, i) => { const z = u*Lb, r = rAt(C, z) + S*(.12 + .02*i); const c = new THREE.Mesh(new THREE.TorusGeometry(r, .055*S, 10, seg), coilMat); c.position.z = z; G.add(c); });
    // plaque d'injection au fond de la chambre : cœur de la réaction, le point le plus chaud vu depuis l'arrière
    const cap = new THREE.Mesh(new THREE.CircleGeometry(C.rc*1.02, seg), capMat(U)); cap.position.z = .004*Lb; cap.userData.keep = true; G.add(cap);
    // collecteur d'alimentation à l'entrée
    const man = new THREE.Mesh(new THREE.TorusGeometry(C.rc + .16*S, .07*S, 8, seg), frameMat); man.position.z = .01*Lb; G.add(man);
    // vérins d'orientation (cardan) : fourreau + tige chromée
    for(let k=0;k<4;k++){
      const ang = (k + .5)*Math.PI/2, dx = Math.cos(ang), dy = Math.sin(ang);
      const A = new V3(dx*(C.rc + .3*S), dy*(C.rc + .3*S), -.04*Lb), zB = .42*Lb, B = new V3(dx*(rAt(C, zB) + .1*S), dy*(rAt(C, zB) + .1*S), zB);
      const M = A.clone().lerp(B, .55);
      const cyl = (p, q, r, mat) => { const d = q.clone().sub(p), L = d.length(); const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 8), mat); m.position.copy(p).addScaledVector(d, .5); m.quaternion.setFromUnitVectors(new V3(0,1,0), d.normalize()); G.add(m); };
      cyl(A, M, .05*S, frameMat); cyl(M, B, .028*S, rodMat);
    }
    mergeParts(G);
  });
  // jet de torche de fusion
  group.traverse(o => { const m = o.material; if(o.isMesh && m && m.isShaderMaterial && m.uniforms && m.uniforms.uLength && m.uniforms.uRadius){ m.fragmentShader = TORCH_FRAG; m.uniforms.uLength = { value: m.uniforms.uLength.value*1.6 }; m.needsUpdate = true; } });
  return bells.length ? U : null;
};

/* le générateur remplace désormais ses cloches par ces ensembles moteur (désactivable : { realDrive: false }) */
const build0 = SHIPGEN.build;
SHIPGEN.build = function(model, opts){
  const b = build0.call(SHIPGEN, model, opts);
  if(!(opts && opts.realDrive === false)) b.drive = D.apply(b.group);
  return b;
};
})();
