/* =====================================================================
   SPACE TRAVEL & TRANSPORT — « Observation des étoiles »  (v6 — échelle réelle)
   Démo cinématique infinie pilotant le moteur du jeu (v2.15).
   - échelle réelle : 1 unité = 1 m dans les systèmes (étoiles en R☉, planètes en R⊕, orbites en UA,
     lunes et astéroïdes à leur taille), étoiles séparées de plusieurs parsecs dans le champ du jeu
   - rendu en deux couches : champ galactique du moteur (unités du jeu) + système en mètres,
     origine flottante (caméra à l'origine) et tranches de profondeur (précision du z-buffer de 0,2 m à 10¹⁶ m)
   - temps physique τ : accéléré pendant les transferts (facteur affiché ⏱ ×N), temps réel en orbite et aux sauts
   - itinéraires infinis : système → transfert → orbite → départ → saut quantique ou distorsion → système suivant
   (c) 2026 Frédéric Delorme & claude.ai
   ===================================================================== */
(function(){
'use strict';
const V3 = THREE.Vector3, Q = THREE.Quaternion;
const PARAMS = new URLSearchParams(location.search);
const OPT = { traffic: PARAMS.get('traffic') !== '0', music: PARAMS.get('music') !== '0' };
const C = window.__CINE = { OPT };

/* ---------- constantes physiques ---------- */
const RSUN = 6.957e8, REARTH = 6.371e6, AU = 1.496e11, GRAV = 6.674e-11, G0 = 9.81, CLIGHT = 2.998e8;
const UNIT_GAL = 3.0857e16/38;                         // 1 unité du champ d'étoiles du jeu = 1/38 pc (cf. apparentMagnitude du moteur)
C.UNITS = { RSUN, REARTH, AU, UNIT_GAL };

/* ---------- utilitaires ---------- */
const clamp = (x,a,b) => Math.max(a, Math.min(b, x));
const smooth = x => { x = clamp(x,0,1); return x*x*(3-2*x); };
const smoother = x => { x = clamp(x,0,1); return x*x*x*(x*(x*6-15)+10); };
const lerp = (a,b,x) => a + (b-a)*x;
const v = (x,y,z) => new V3(x,y,z);
let R = Math.random;                                   // remplacé par un PRNG déterministe (graine du monde) à l'init
const rr = (a,b) => a + (b-a)*R();
const pick = arr => arr[Math.floor(R()*arr.length)];
function pickW(list){ let s = 0; list.forEach(e => s += e[1]); let x = R()*s; for(const e of list){ x -= e[1]; if(x <= 0) return e[0]; } return list[list.length-1][0]; }
function randUnit(){ const z = rr(-1,1), a = rr(0, Math.PI*2), s = Math.sqrt(1-z*z); return v(Math.cos(a)*s, z, Math.sin(a)*s); }
function perpTo(a, hint){ const h = hint || randUnit(); const p = h.clone().sub(a.clone().multiplyScalar(h.dot(a))); if(p.lengthSq() < 1e-6) return perpTo(a, v(0,1,0).cross(a).lengthSq() > 1e-6 ? v(0,1,0) : v(1,0,0)); return p.normalize(); }
function bez(P, s){ const a = 1-s; return P[0].clone().multiplyScalar(a*a*a).addScaledVector(P[1],3*a*a*s).addScaledVector(P[2],3*a*s*s).addScaledVector(P[3],s*s*s); }
function bezD(P, s){ const a = 1-s; return P[1].clone().sub(P[0]).multiplyScalar(3*a*a).addScaledVector(P[2].clone().sub(P[1]),6*a*s).addScaledVector(P[3].clone().sub(P[2]),3*s*s); }
const _m4 = new THREE.Matrix4();
/* orientation : nez du vaisseau (-Z local) vers `nose`, dos (+Y local) vers `up` — les tuyères sont en +Z */
function quatNose(nose, up){ _m4.lookAt(new V3(0,0,0), nose, up || v(0,1,0)); return new Q().setFromRotationMatrix(_m4); }
function frameOf(q){ return { fwd: v(0,0,-1).applyQuaternion(q), up: v(0,1,0).applyQuaternion(q), right: v(1,0,0).applyQuaternion(q) }; }
function fmtInt(n){ return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
function fmt2(k){ const e = Math.floor(Math.log10(Math.max(k, 1))), p = Math.pow(10, Math.max(0, e - 1)); return fmtInt(Math.round(k/p)*p); }

/* =====================================================================
   TEMPS : T = temps « cinéma » (secondes à l'écran), τ = temps physique (secondes réelles)
   dτ/dT = k(T), facteur d'accélération défini par nœuds (interpolation lissée, intégrale exacte)
   ===================================================================== */
const TLK = [{ T: 0, k: 1, tau: 0 }];
function tlAdd(T, k){ const a = TLK[TLK.length-1]; if(T <= a.T + 1e-4) return; TLK.push({ T, k, tau: a.tau + (T - a.T)*(a.k + k)*.5 }); }
function tlFind(T){ let i = TLK.length - 1; while(i > 0 && TLK[i].T > T) i--; return i; }
function tauAt(T){
  const i = tlFind(T), a = TLK[i], b = TLK[i+1];
  if(T <= a.T || !b) return a.tau + (T - a.T)*a.k;
  const d = b.T - a.T, x = (T - a.T)/d;
  return a.tau + d*(a.k*x + (b.k - a.k)*(x*x*x - .5*x*x*x*x));   // ∫ smoothstep
}
function rateAt(T){ const i = tlFind(T), a = TLK[i], b = TLK[i+1]; if(!b || T <= a.T) return a.k; return a.k + (b.k - a.k)*smooth((T - a.T)/(b.T - a.T)); }
function rateMax(T0, T1){ let m = 0; for(let i=0;i<=10;i++) m = Math.max(m, rateAt(lerp(T0, T1, i/10))); return m; }
function tlPrune(T){ while(TLK.length > 3 && TLK[1].T < T - 150) TLK.shift(); }
/* segment [Ta, Tb] : ∫k dT = D (durée physique), rampes lissées aux extrémités */
function tlSegment(Ta, Tb, D, ka, kb, r){
  const Tt = Tb - Ta; r = Math.min(r, Tt*.3);
  tlAdd(Ta, ka);
  const km = Math.max((D - r*(ka + kb)*.5)/(Tt - r), ka, kb);
  tlAdd(Ta + r, km); tlAdd(Tb - r, km); tlAdd(Tb, kb);
  return km;
}

/* v7.12 : segment à rampes différentes (départ r1, arrivée r2), temps réel aux deux bouts */
function tlSegment2(Ta, Tb, D, r1, r2){
  const Tt = Tb - Ta; r1 = Math.min(r1, Tt*.3); r2 = Math.min(r2, Tt*.3);
  const km = Math.max((D - (r1 + r2)*.5)/(Tt - (r1 + r2)*.5), 1);
  tlAdd(Ta, 1); tlAdd(Ta + r1, km); tlAdd(Tb - r2, km); tlAdd(Tb, 1);
  return km;
}
/* ---------- profils de poussée (temps physique) ----------
   flip-and-burn : accélération vs → vm, retournement pendant une courte croisière, freinage vm → ve (moteur Epstein, ~1 g) */
function flipProfile(L, vs, ve, a, coastFrac, Lf){
  // Lf : erre finale (freinage terminé avant l'arrivée) pendant laquelle le vaisseau se retourne nez en avant (v6.7)
  Lf = Lf && ve > 1 ? Math.min(Lf, L*.3) : 0; const Lm = L - Lf;
  const tc = coastFrac*Math.sqrt(Lm/a);
  const A = 1/a, B = tc, Cc = -(vs*vs + ve*ve)/(2*a) - Lm;
  const vm = Math.max((-B + Math.sqrt(B*B - 4*A*Cc))/(2*A), vs, ve);
  const t1 = (vm - vs)/a, t2 = (vm - ve)/a, tm = t1 + tc + t2, tf = Lf > 0 ? Lf/ve : 0, D = tm + tf, s1 = vs*t1 + .5*a*t1*t1, sc = vm*tc;
  const f = t => {
    if(t <= 0) return { s: vs*t, v: vs };
    if(t < t1) return { s: vs*t + .5*a*t*t, v: vs + a*t };
    if(t < t1 + tc) return { s: s1 + vm*(t - t1), v: vm };
    if(t < tm){ const u = t - t1 - tc; return { s: s1 + sc + vm*u - .5*a*u*u, v: vm - a*u }; }
    if(t < D) return { s: Lm + ve*(t - tm), v: ve };
    return { s: L + ve*(t - D), v: ve };
  };
  return { f, D, vm, t1, tc, t2, tm, tf, L, a, flip: true };
}
/* poussée continue (départ vers le point de saut) : on arrive lancé, le saut se fait sur l'erre */
function accelProfile(L, vs, a){
  const D = (-vs + Math.sqrt(vs*vs + 2*a*L))/a, ve = vs + a*D;
  const f = t => t <= 0 ? { s: vs*t, v: vs } : (t < D ? { s: vs*t + .5*a*t*t, v: vs + a*t } : { s: L + ve*(t - D), v: ve });
  return { f, D, ve, L, a, flip: false };
}
/* chemin de Bézier paramétré par l'abscisse curviligne, prolongé en ligne droite aux deux bouts */
function arcPath(P){
  const N = 128, acc = [0]; let prev = P[0].clone();
  for(let i=1;i<=N;i++){ const p = bez(P, i/N); acc.push(acc[i-1] + p.distanceTo(prev)); prev = p; }
  const L = acc[N], d0 = bezD(P, 0).normalize(), d1 = bezD(P, 1).normalize();
  const tOf = s => { let lo = 0, hi = N; while(hi - lo > 1){ const m = (lo + hi) >> 1; if(acc[m] < s) lo = m; else hi = m; } return (lo + (s - acc[lo])/Math.max(1e-9, acc[hi] - acc[lo]))/N; };
  return { P, L, d0, d1,
    at: s => s <= 0 ? P[0].clone().addScaledVector(d0, s) : (s >= L ? P[3].clone().addScaledVector(d1, s - L) : bez(P, tOf(s))),
    dir: s => s <= 0 ? d0.clone() : (s >= L ? d1.clone() : bezD(P, tOf(s)).normalize()) };
}
/* état d'un vaisseau sur un chemin à l'instant physique t (depuis le début de la poussée) */
const XAX = new V3(1,0,0);
function pathState(path, prof, t, up){
  const st = prof.f(t), dir = path.dir(st.s), qf = quatNose(dir, up);
  let q = qf, thr = 0; const e = prof.D*.012 + 1e-6;
  if(prof.flip){
    const x = (t - prof.t1)/Math.max(prof.tc, 1e-6);
    let ang = Math.PI*smoother((x - .06)/.88);                                                   // retournement en tangage autour de l'axe transversal (sens constant) : couple RCS avant/arrière
    if(prof.tf > 0) ang += Math.PI*smoother(((t - prof.tm)/prof.tf - .02)/.45);                  // retournement final : freinage terminé, le vaisseau arrive nez en avant
    q = qf.clone().multiply(new Q().setFromAxisAngle(XAX, ang));
    const tm = prof.tm !== undefined ? prof.tm : prof.D;
    if(t > 0 && t < prof.t1) thr = smooth(t/e)*smooth((prof.t1 - t)/e);
    else if(t > prof.t1 + prof.tc && t < tm) thr = smooth((t - prof.t1 - prof.tc)/e)*smooth((tm - t)/(e*.5));
  } else if(t > 0 && t < prof.D) thr = smooth(t/e)*smooth((prof.D - t)/(e*.4));
  return { pos: path.at(st.s), q, throttle: thr, speed: st.v };
}
function pathTraj(path, prof, tau0, up){ const f = T => pathState(path, prof, tauAt(T) - tau0, up); f.path = path; f.prof = prof; f.tau0 = tau0; return f; }

/* ---------- vaisseaux (dimensions réelles du générateur, en mètres) ---------- */
const TYPE_EN = { e18:'Warehouse freighter', e140:'Warehouse bulk carrier', p10:'Spine freighter', p44:'Long spine freighter', g1:'Ice tanker', tS:'Light tug', tM:'Medium tug', tL:'Heavy tug', l20:'Liner', x1:'Fast light freighter', shuttle:'Cargo shuttle' };
const FTL = { e140:1, p44:1, g1:1, l20:1 };
const ACC = { e18:.9, e140:.55, p10:1, p44:.8, g1:.7, tS:3, tM:2.4, tL:1.8, l20:1.4, x1:2.8, shuttle:2, fighter:6, corvette:2.5, destroyer:1.2, carrier:.3, carrierMil:.35 };   // poussée en g
const HERO_POOL = [['e18',1],['e140',1],['p10',1],['p44',1.2],['g1',1],['tM',.45],['tL',.5],['l20',1.2],['x1',1.3]];
const DEP_POOL = HERO_POOL.filter(([m]) => FTL[m]);                   // v7.2.2 : seuls les vaisseaux à géode ou anneaux quittent un système
const NPC_BIG = [['e18',1],['p10',1],['g1',.7],['x1',1],['e140',.5],['tL',.6]];
const NPC_TUG = [['tS',1],['tM',1],['tL',.6]];
const PREFIX = ['R.S.C.','C.S.V.','T.S.S.','M.V.','S.T.T.','I.C.V.','F.T.V.'];
const ENDS = ['is','a','ar','on','ia','us','or','','','e'];
const usedNames = new Set();
function genShipName(){
  const banks = Object.values(LANG_BANKS);
  for(let k=0;k<12;k++){
    let w = pick(pick(banks));
    if(w.length < 6 || R() < .5){ const w2 = pick(pick(banks)); w += w2.slice(0, 2 + Math.floor(R()*2)); }
    w = w.slice(0, 9) + pick(ENDS);
    const n = pick(PREFIX) + ' ' + cap(w.toLowerCase());
    if(!usedNames.has(n)){ usedNames.add(n); return n; }
  }
  return pick(PREFIX) + ' ' + cap(pick(pick(banks))) + ' ' + (100 + Math.floor(R()*899));
}
const SCALE = 1;                                       // SHIPGEN produit des coques en mètres : taille réelle
const ships = new Set();
const TRACK = [];                                                              // v7.19 : suivi des vaisseaux construits (références faibles) — diagnostic mémoire
function track(sh, kind){ const d0 = sh.dispose, W = typeof WeakRef !== 'undefined', rec = W ? { ref: new WeakRef(sh), root: new WeakRef(sh.root), kind, model: sh.model, T0: T, leg: sh.leg && sh.leg.name, disp: null, crafted: !!sh.carrier } : null;
  sh.dispose = function(){ if(sh.disposed) return; sh.disposed = true; if(rec) rec.disp = T; forgetShip(sh); return d0.apply(this, arguments); };   // v7.19 : libération complète, une seule fois
  if(rec){ TRACK.push(rec); if(TRACK.length > 4000) TRACK.splice(0, 1000); } return sh; }
/* v7.19 : fuite mémoire — les tampons circulaires d'effets (étincelles, fumée, traçantes) gardaient des références vers les vaisseaux
   libérés, et à travers eux leurs trajectoires, la visite et le système entier (planètes comprises) : tout restait en mémoire */
function forgetShip(sh){
  IMP.parts.forEach(p => { if(p.sh === sh){ p.sh = null; p.t0 = -99; } });
  SMK.parts.forEach(p => { if(p.sh === sh){ p.sh = null; p.t0 = -99; } });
  CBT.pool.forEach(t => { if(t.sh === sh) t.sh = null; if(t.tg === sh){ t.tg = null; t.hit = false; } });
  GUN.pool.forEach(t => { for(const k in t) if(t[k] === sh) t[k] = null; }); if(GUN.shooter === sh) GUN.shooter = null;
  (sh.bays || []).forEach(op => { if(op.c && op.c.dispose) op.c.dispose(); }); sh.bays = null;   // engins des baies (chasseurs du destroyer) : libérés avec leur porteur
  if(sh.hp){ sh.hp.spots = []; sh.hp.split = null; }
}
function patchUniforms(group, thr, charge, field, phase){
  group.traverse(o => {
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    ms.forEach(m => {
      if(!m.isShaderMaterial || !m.uniforms) return;
      const rep = {};
      if(m.uniforms.uThrottle === SHIPGEN.DRIVE_U.uThrottle) rep.uThrottle = thr;
      if(m.uniforms.uCharge === SHIPGEN.JUMP_U.uCharge) rep.uCharge = charge;
      if(field && m.uniforms.uField === SHIPGEN.FTL_U.uField) rep.uField = field;
      if(phase && m.uniforms.uPhase === SHIPGEN.FTL_U.uPhase) rep.uPhase = phase;
      if(Object.keys(rep).length) m.uniforms = Object.assign({}, m.uniforms, rep);
    });
  });
}
/* ---------- propulseurs d'attitude (RCS) ----------
   Les blocs RCS du générateur de coques (6 à 10 par vaisseau) tirent selon le couple nécessaire : l'accélération angulaire
   du vaisseau (dérivée seconde de son attitude, dans son repère) est projetée sur le couple que produit chaque buse (r × F).
   Un retournement allume un couple avant/arrière pour lancer la rotation, puis le couple opposé pour l'arrêter.
   Bouffées pulsées (modulation de largeur d'impulsion) quand la demande est partielle, jet continu au plus fort. */
const RCS_GEO = (() => { const g = new THREE.ConeGeometry(1, 1, 14, 1, true); g.translate(0, -.5, 0); g.rotateX(Math.PI); return g; })();   // sommet sur la buse, évasé vers +Y
const RCS_TIME = { value: 0 }, RCS_REF = .35, RCS_DEAD = .03, GIMBAL = .06;   // cardans : ±3,4° au couple maximal          // rad/s² : demande pleine, zone morte
const RCS_VERT = `varying float vL; varying vec3 vN; varying vec3 vV;
void main(){ vL = position.y; vec4 mv = modelViewMatrix*vec4(position, 1.0); vN = normalize(normalMatrix*normal); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }`;
const RCS_FRAG = `precision highp float;
uniform float uLevel; uniform float uTime; uniform float uSeed;
varying float vL; varying vec3 vN; varying vec3 vV;
void main(){
  float soft = pow(abs(dot(normalize(vN), normalize(vV))), 1.4);   /* bords du panache adoucis */
  float l = clamp(vL, 0.0, 1.0);
  float along = pow(1.0 - l, 1.7), core = exp(-l*7.0);
  float fl = 0.82 + 0.18*sin(uTime*61.0 + uSeed*7.3 + l*11.0);
  vec3 col = mix(vec3(0.42, 0.64, 1.0), vec3(0.93, 0.97, 1.0), core);
  gl_FragColor = vec4(col*uLevel*fl*soft*(1.25*along + 1.4*core), 1.0);
}`;
function buildRcs(b, len){
  const com = b.hullBox.getCenter(new V3()), Lj = b.rcsLen || clamp(len*.15, 11, 34);         // panache : 15 % de la longueur de coque
  return (b.rcs || []).map((e, i) => {
    const n = new V3(e.nx, e.ny, 0).normalize(), pos = new V3(e.x, e.y, e.z);
    const tq = new V3().crossVectors(pos.clone().sub(com), n.clone().negate());   // couple de la buse : la poussée s'oppose à l'éjection
    if(tq.lengthSq() < 1e-6) return null;
    const jet = new THREE.Mesh(RCS_GEO, new THREE.ShaderMaterial({ uniforms: { uLevel:{value:0}, uTime: RCS_TIME, uSeed:{value:i} }, vertexShader: RCS_VERT, fragmentShader: RCS_FRAG,
      transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide }));
    jet.quaternion.setFromUnitVectors(v(0,1,0), n); jet.position.copy(pos); jet.visible = false; jet.renderOrder = 7; jet.userData.noFrame = true;
    const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xcfe6ff, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, opacity:0 }));
    spark.position.copy(pos).addScaledVector(n, Lj*.04); spark.visible = false; spark.renderOrder = 7; spark.userData.noFrame = true;
    b.group.add(jet); b.group.add(spark);
    return { jet, spark, tq: tq.normalize(), n, lvl: 0, ph: (i*.618) % 1, Lj };
  }).filter(Boolean);
}
/* bouffées de gaz : éjectées par la buse, elles suivent la translation du vaisseau mais pas sa rotation
   (on voit le gaz rester en arrière pendant le retournement), s'étalent et se dissipent en ~1 s */
const PUFFS = { group: null, list: [], i: 0 };
function initPuffs(){
  PUFFS.group = new THREE.Group(); shipWorld.add(PUFFS.group);
  for(let k=0;k<72;k++){ const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xb8d4ff, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, opacity:0 }));
    s.visible = false; s.renderOrder = 7; PUFFS.group.add(s); PUFFS.list.push({ s, t0: -1 }); }
}
function spawnPuff(sh, j, T, k){
  const P = PUFFS.list[PUFFS.i++ % PUFFS.list.length];
  P.sh = sh; P.off = j.jet.getWorldPosition(new V3()).sub(sh.root.getWorldPosition(new V3())); P.dir = v(0,1,0).applyQuaternion(j.jet.getWorldQuaternion(new Q()));
  P.t0 = T; P.Lj = j.Lj; P.lvl = j.lvl; P.life = .75 + .35*((k*.618 + T*3.7) % 1); P.v = j.Lj*1.7;
}
function updatePuffs(T){
  PUFFS.list.forEach(P => {
    if(P.t0 < 0) return;
    const age = T - P.t0;
    if(age < 0 || age > P.life || !P.sh.root.parent || !P.sh.root.visible){ P.s.visible = false; P.t0 = -1; return; }
    const x = age/P.life; P.s.visible = true;
    P.sh.root.getWorldPosition(P.s.position).add(P.off).addScaledVector(P.dir, P.v*age*(1 - .35*x));
    P.s.scale.setScalar(P.Lj*(.22 + 1.15*x)); P.s.material.opacity = .3*P.lvl*Math.pow(1 - x, 1.6);
  });
}
function disposeRcs(rcs){ (rcs || []).forEach(j => { [j.jet, j.spark].forEach(o => { o.parent && o.parent.remove(o); o.material.dispose(); }); }); }
function bodyOmega(qa, qb, h){   // vitesse angulaire moyenne entre deux attitudes, dans le repère du vaisseau
  const d = qa.clone().invert().multiply(qb); if(d.w < 0){ d.x = -d.x; d.y = -d.y; d.z = -d.z; d.w = -d.w; }
  const s = Math.sqrt(d.x*d.x + d.y*d.y + d.z*d.z); if(s < 1e-12) return new V3();
  return new V3(d.x, d.y, d.z).multiplyScalar(2*Math.atan2(s, d.w)/(s*h));
}
function updateRcs(sh, T, dt){
  if(!sh.rcs || !sh.rcs.length) return;
  let alpha = null, am = 0; sh.aB = null; sh.alpha = null; const d2 = (sh.local ? sh.root.getWorldPosition(new V3()) : sh.root.position).distanceToSquared(cam.position);
  if(sh.root.visible && d2 < 9e8){   // au-delà de 30 km, les panaches sont sous le pixel
    const h = .08, qa = t => sh.local ? sh.local(t).q : subjectState(sh, t).q, q0 = qa(T - h), q1 = qa(T), q2 = qa(T + h);
    alpha = bodyOmega(q1, q2, h).sub(bodyOmega(q0, q1, h)).divideScalar(h); am = alpha.length(); sh.alpha = alpha;
    if(sh.local){ const p0 = sh.local(T - h).p, p1 = sh.local(T).p, p2 = sh.local(T + h).p;       // engins de baie : translations aussi (buses radiales)
      sh.aB = p2.add(p0).addScaledVector(p1, -2).divideScalar(h*h).applyQuaternion(q1.clone().invert()); }
  }
  const ka = 1 - Math.exp(-38*dt), kd = 1 - Math.exp(-13*dt);
  sh.rcs.forEach(j => {
    let dem = am > RCS_DEAD ? clamp(j.tq.dot(alpha)/RCS_REF, 0, 1) : 0;
    if(sh.aB && sh.local) dem = Math.max(dem, clamp(-j.n.dot(sh.aB)/.25 - .1, 0, 1));
    const on = dem > .82 ? 1 : (dem > .04 && ((T*7.5 + j.ph) % 1) < .15 + .8*dem ? 1 : 0);
    j.lvl += (on - j.lvl)*(on > j.lvl ? ka : kd);
    const vis = j.lvl > .015; j.jet.visible = j.spark.visible = vis;
    if(j.lvl > .25 && d2 < 2.5e7 && dt > 0){ j.pa = (j.pa || 0) + dt*20*j.lvl; while(j.pa >= 1){ j.pa -= 1; spawnPuff(sh, j, T, j.ph*97 + j.pa); } }   // bouffées à moins de 5 km
    if(vis){ const Lx = j.Lj*(.55 + .45*j.lvl); j.jet.material.uniforms.uLevel.value = j.lvl; j.jet.scale.set(Lx*.36, Lx, Lx*.36);
      j.spark.material.opacity = .9*j.lvl; j.spark.scale.setScalar(j.Lj*(.3 + .28*j.lvl)); }
  });
}
/* ---------- âge des vaisseaux : mélange réaliste (≈ 30 % neufs, 45 % usés, 25 % très vieux) ----------
   remorqueurs et cargos plus souvent fatigués, paquebots entretenus ; ?age=0…1 impose un âge à toute la flotte */
const AGE_BIAS = { tS:.15, tM:.14, tL:.12, e18:.05, e140:.06, p10:.06, p44:.04, g1:.08, x1:-.05, l20:-.3, shuttle:0, fighter:-.3, corvette:-.25, destroyer:-.25 };   // militaires : bien entretenus
function shipAge(model){
  const f = PARAMS.get('age');
  if(f !== null && f !== '' && !isNaN(+f)) return clamp(+f, 0, 1);
  const r = clamp(R() + (AGE_BIAS[model] || 0), 0, .999);
  return r < .3 ? rr(0, .12) : (r < .75 ? rr(.32, .6) : rr(.68, 1));
}
/* v7.2.2 : un vaisseau n'emploie que les moyens dont il est équipé — cœur de saut (géode) et/ou anneaux de distorsion ;
   les modèles non supraluminiques du jeu n'en ont aucun, et le sélecteur du jeu peut retirer l'un ou l'autre */
function equipOf(model, opts){ const f = !!FTL[model]; return { warp: f && !(opts && opts.warp === false), jump: f && !(opts && opts.jump === false) }; }
const canLeave = (model, opts) => { const e = equipOf(model, opts); return e.warp || e.jump; };
/* v7.10 : fusion des pièces statiques d'un vaisseau du jeu (vaisseaux à bord d'un porteur : garé, en escale) — 90 à 210 appels de dessin
   → 25 à 40. Mêmes matériaux (usure, livrée : attribut aShip déjà en repère vaisseau), géométrie cuite dans le repère du groupe.
   Restent à part : matériaux de shader (vitrages, intérieurs, jets), transparents, objets marqués (userData) et groupes animés
   (cardans, ensembles moteur). SHIPGEN.tick ne déplace aucune pièce (vérifié sur e18, p10, tS, tM, tL, x1). */
function mergeStatic(G){
  G.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(G.matrixWorld).invert(), bins = new Map();
  const walk = o => o.children.forEach(c => {
    if(c.isMesh){ const m = c.material; if(Array.isArray(m) || !m.isMeshStandardMaterial || m.transparent || c.isInstancedMesh || !c.visible || c.frustumCulled === false || Object.keys(c.userData).length || c.geometry.morphAttributes && Object.keys(c.geometry.morphAttributes).length) return;
      const keys = Object.keys(c.geometry.attributes).sort().join(','); if(keys.indexOf('position') < 0 || keys.indexOf('normal') < 0) return;
      const k = m.uuid + '|' + c.renderOrder + '|' + keys; if(!bins.has(k)) bins.set(k, []); bins.get(k).push(c); return; }
    if(!c.isLight && !Object.keys(c.userData).length && c.children.length) walk(c); });                // sous-groupes neutres seulement
  walk(G);
  let n0 = 0, n1 = 0;
  bins.forEach(list => { if(list.length < 2) return; n0 += list.length; n1++;
    const keys = Object.keys(list[0].geometry.attributes), parts = {}; keys.forEach(k => parts[k] = []);
    list.forEach(c => { const g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone(), M = new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld);
      g.applyMatrix4(M);                                                       // position, normale (aShip, déjà en repère vaisseau, n'est pas touché)
      keys.forEach(k => parts[k].push(g.attributes[k])); c.parent.remove(c); c.geometry.dispose(); });
    const out = new THREE.BufferGeometry();
    keys.forEach(k => { const a0 = parts[k][0], n = parts[k].reduce((s, a) => s + a.array.length, 0), arr = new a0.array.constructor(n); let o = 0; parts[k].forEach(a => { arr.set(a.array, o); o += a.array.length; }); out.setAttribute(k, new THREE.BufferAttribute(arr, a0.itemSize, a0.normalized)); });
    out.computeBoundingSphere(); out.computeBoundingBox();
    const mesh = new THREE.Mesh(out, list[0].material); mesh.renderOrder = list[0].renderOrder; G.add(mesh); });
  return { from: n0, to: n1 };
}
C.mergeStatic = mergeStatic;                                                   // test (comparaison avant / après)
function makeShip(model, leg, opts){
  const eq = equipOf(model, opts), ftl = eq.warp || eq.jump, age = opts && opts.age != null ? clamp(+opts.age, 0, 1) : shipAge(model);   // v7.18 : âge et usure choisis au chantier
  const b = SHIPGEN.build(model, { warp: eq.warp, jump: eq.jump, age, ageSeed: opts && opts.seed != null ? opts.seed : Math.floor(R()*1e9), wearAmt: opts && opts.wearAmt != null ? opts.wearAmt : undefined });   // option de vieillissement du générateur (shipwear.js)
  if(opts && opts.merge) b.merged = mergeStatic(b.group);
  const thr = { value: 0 }, charge = { value: 0 }, field = { value: .15 }, phase = { value: 0 };
  patchUniforms(b.group, thr, charge, field, phase);
  b.lights.forEach(l => l.parent && l.parent.remove(l));      // une seule lumière de tuyère partagée (pas de recompilation de shaders)
  const root = new THREE.Group();
  // v7.2.2 : la racine du vaisseau est son centre de gravité (centre de la coque, comme pour le couple des RCS) : les
  // retournements, roulis et lacets tournent autour de lui (avant : autour de l'origine du modèle, près de la proue)
  const com = b.hullBox.getCenter(new V3());
  b.group.scale.setScalar(SCALE); b.group.position.copy(com).multiplyScalar(-SCALE); root.add(b.group); shipWorld.add(root);
  const rcs = buildRcs(b, b.dims.z*SCALE);
  const hull = { box: b.box.clone(), drive: b.group.userData.driveCenter ? b.group.userData.driveCenter.clone() : null, rcs: (b.rcs || []).slice(), docks: (b.docks || []).slice() };   // repères pour les gros plans
  const geode = findGeode(b.group, charge);
  const sh = { model, type: TYPE_EN[model], name: genShipName(), root, inner: b.group, com, equip: eq, rings: b.rings || null, ringU: b.wear && b.wear.uRingI, len: b.dims.z*SCALE, thr, charge, field, phase, ftl, traj: null, leg, rcs, age, drive: b.drive || null, hull, geode,
    acc: (ACC[model] || 1)*G0*rr(.85, 1.15),
    dispose(){ (sh.bays || []).forEach(op => op.c.dispose()); disposeRcs(rcs); if(geode){ geode.spark.parent && geode.spark.parent.remove(geode.spark); geode.spark.material.dispose(); } root.parent && root.parent.remove(root); SHIPGEN.dispose(b.group); ships.delete(sh); } };
  sh.wearU = b.wear || null; ships.add(sh); track(sh, 'ship');
  if(!(opts && opts.noBays)) setupBays(sh);                                   // v7.6 : garé dans un porte-vaisseaux : baies au repos
  return sh;
}
/* ---------- géode du cœur de saut quantique (mât au-dessus du réacteur, vaisseaux équipés) ----------
   avant le saut, elle bat : impulsions de plus en plus rapprochées (0,8 s → 0,07 s), chacune gonfle la géode,
   l'illumine et envoie une onde dans le quadrillage d'espace-temps */
function findGeode(group, charge){
  let core = null, halo = null, wire = null;
  group.traverse(o => { const m = o.material; if(o.isMesh && m && m.isShaderMaterial && m.uniforms && m.uniforms.uCharge === charge){ if(m.transparent) halo = o; else core = o; } });
  if(!core) return null;
  group.traverse(o => { if(o.isLineSegments && o.position.distanceTo(core.position) < 1e-3) wire = o; });
  core.geometry.computeBoundingSphere(); const r = core.geometry.boundingSphere.radius;
  const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xcdb8ff, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, opacity:0 }));
  spark.position.copy(core.position); spark.visible = false; spark.renderOrder = 12; spark.userData.noFrame = true; core.parent.add(spark);
  return { core, halo, wire, spark, r, pos: core.position.clone(), wireCol: wire ? wire.material.color.clone() : null };
}
function geodePulse(u){                       // enveloppe des battements depuis le début de la charge (u en s)
  let t = .15, I = .8, p = 0, age = 9;
  while(t < JT.charge && t <= u){ const a = u - t; p = Math.max(p, smooth(a/.035)*Math.exp(-a/(.32*I))); age = a; t += I; I = Math.max(.07, I*.74); }
  return { p, age };
}
function setGeode(sh, p, ch){
  const G = sh.geode; if(!G) return;
  if(G.wire){ G.wire.scale.setScalar(1 + .16*p + .08*ch); G.wire.material.color.copy(G.wireCol).multiplyScalar(1 + 2.6*p + .8*ch); }
  G.core.scale.setScalar(1 + .12*p); if(G.halo) G.halo.scale.setScalar(1 + .25*p + .1*ch);
  G.spark.visible = p + ch > .02; G.spark.material.opacity = Math.min(1, .95*p + .2*ch); G.spark.scale.setScalar(G.r*(3.2 + 6*p + 2*ch));
}
/* ---------- cadre blanc de la géode (v7.0) ----------
   rotation lente sur l'axe vertical du vaisseau (un tour en 40 s) ; pendant la charge d'un saut, chaque battement donne une impulsion
   et la vitesse monte par paliers jusqu'à ≈ 3 tours/s au repli, puis retombe après le saut (τ = 1,2 s).
   L'angle est calculé depuis le temps (juste aussi pour les plans qui anticipent) ; les sauts de chaque vaisseau sont notés dans sh.jumpTs. */
const GEO_W0 = 2*Math.PI/40, GEO_WMAX = 6*Math.PI, GEO_TAU = 1.2;
let GEO_BEATS = null;                                    // instants des battements (mêmes que geodePulse), calculés au premier usage (JT est déclaré plus bas)
const geoBeats = () => GEO_BEATS || (GEO_BEATS = (() => { const b = []; let t = .15, I = .8; while(t < JT.charge){ b.push(t); t += I; I = Math.max(.07, I*.74); } return b; })());
function geodeExtra(u){                                  // angle ajouté par un saut, u = temps depuis le début de la charge (s)
  if(u <= 0) return 0;
  const GB = geoBeats(), N = GB.length, dW = GEO_WMAX - GEO_W0, w = k => dW*Math.pow(k/N, 1.6), tc = Math.min(u, JT.charge);
  let a = 0;
  for(let k = 0; k < N && GB[k] < tc; k++){
    const t0 = GB[k], t1 = Math.min(k + 1 < N ? GB[k + 1] : JT.charge, tc), sp = .6*(w(k + 1) - w(k)) + 1.5;   // palier + impulsion qui s'amortit en 0,12 s
    a += w(k + 1)*(t1 - t0) + sp*.12*(1 - Math.exp(-(t1 - t0)/.12));
  }
  if(u <= JT.charge) return a;
  a += dW*(Math.min(u, JT.charge + JT.fold) - JT.charge);
  if(u <= JT.charge + JT.fold) return a;
  return a + dW*GEO_TAU*(1 - Math.exp(-(u - JT.charge - JT.fold)/GEO_TAU));
}
const _qGeo = new Q(), _yAxis = new V3(0, 1, 0);
function spinGeode(sh, T){
  const G = sh.geode; if(!G || !G.wire) return;
  if(!G.q0) G.q0 = G.wire.quaternion.clone();
  let a = GEO_W0*T; (sh.jumpTs || []).forEach(tJ => a += geodeExtra(T - tJ));
  G.wire.quaternion.copy(_qGeo.setFromAxisAngle(_yAxis, a % (2*Math.PI))).multiply(G.q0);
}
function noteJump(sh, tJ){ sh.jumpTs = (sh.jumpTs || []).filter(t => T - t < 120 && t !== tJ).concat([tJ]); }
/* ---------- anneaux de distorsion (v7.2, warpring.js) ----------
   Rotation lente au repos (un tour en 50 s) ; pré-charge de 3 s avant la charge du jeu (visuelle : trajectoires inchangées),
   pendant laquelle la vitesse monte vers un tour en 6 s ; charge : montée linéaire jusqu'à 1,2 tour/s, tenue pendant la
   distorsion, puis décroissance (τ = 2 s). Deux anneaux tournent en sens contraires. Angle calculé depuis le temps. */
const RING = { W0: 2*Math.PI/50, W1: 2*Math.PI/6, WM: 2*Math.PI*1.2, PRE: 3, TAU: 2 };
function ringExtra(u, w){                               // angle ajouté par une distorsion, u = temps depuis le début de la pré-charge
  if(u <= 0) return 0;
  const P = RING.PRE, SP = w.tEng - w.tW0, UE = P + (w.tExit - w.tW0), d1 = RING.W1 - RING.W0, dM = RING.WM - RING.W0;
  if(u <= P) return d1*u*u*u/(3*P*P);
  let a = d1*P/3; const v = Math.min(u - P, SP);
  a += d1*v + (dM - d1)*v*v/(2*SP); if(u <= P + SP) return a;
  a += dM*(Math.min(u, UE) - P - SP); if(u <= UE) return a;
  return a + dM*RING.TAU*(1 - Math.exp(-(u - UE)/RING.TAU));
}
function ringAngle(sh, T){ let a = RING.W0*T; (sh.warps || []).forEach(w => a += ringExtra(T - (w.tW0 - RING.PRE), w)); return a; }
function spinRings(sh, T){
  const Rg = sh.rings; if(!Rg) return;
  const a = ringAngle(sh, T) % (2*Math.PI), f = Math.max(0, sh.field.value - .15);
  Rg.list.forEach(r => { r.pivot.rotation.z = r.dir*a; if(r.halo) r.halo.visible = f > .01; });
  Rg.padMesh().forEach(m => { if(m.material) m.material.emissiveIntensity = .06 + 1.8*f; });
  if(sh.ringU) sh.ringU.value = sh.field.value;
}
function makeShuttle(leg, L){
  const s = buildShuttle(), age = L && L.age != null ? clamp(+L.age, 0, 1) : shipAge('shuttle');
  const wU = window.__SHIPWEAR ? __SHIPWEAR.apply(s.group, age, L && L.seed != null ? L.seed : Math.floor(R()*1e9), 12, L && L.wearAmt) : null;      // navette : même usure (unités de coque ×12 = mètres)
  const root = new THREE.Group(); s.group.scale.setScalar(12); root.add(s.group); shipWorld.add(root);   // navette de ~25 m
  const hull = { box: new THREE.Box3().setFromObject(root), drive: null, rcs: [], docks: [] };
  const sh = { model:'shuttle', type: TYPE_EN.shuttle, name: genShipName(), root, inner: s.group, len: 25, thr:{value:0}, charge:{value:0}, nav: s.navLights, glow: s.glow, traj: null, leg, acc: 2*G0, age, hull,
    dispose(){ root.parent && root.parent.remove(root); s.group.traverse(o => { o.geometry && o.geometry.dispose(); }); ships.delete(sh); } };
  sh.wearU = wU; ships.add(sh); track(sh, 'shuttle');
  return sh;
}

/* =====================================================================
   PETITS ENGINS (smallcraft.js) ET BAIES À CHAMP DE FORCE (shipglass.js)
   - engins libres (navette de transport, gabare) : trajectoires comme les autres vaisseaux
   - engins de baie : attachés à leur porteur, animés dans son repère (co-mobiles) par un plan
     d'états parked → out → away → in, étendu à la demande (le réalisateur lit l'avenir) ;
     ils traversent le champ de force (onde), sont éclairés en bleu dans le hangar (shader)
   - drones d'inspection en patrouille autour des coques
   ===================================================================== */
Object.assign(TYPE_EN, { maint: 'Maintenance tender', crew: 'Crew shuttle', lighter: 'Container lighter', drone: 'Inspection drone' });
Object.assign(ACC, { maint: 1.2, crew: 2.2, lighter: 1, drone: .5 });
Object.assign(AGE_BIAS, { maint: .14, crew: -.1, lighter: .1, drone: 0 });
const crafts = new Set();                         // engins attachés (baies, patrouilles) : hors de « ships » (positions locales)
function makeCraft(kind, leg, o){
  o = o || {};
  const milK = !!(__CRAFT.MIL && __CRAFT.MIL[kind]), fac = o.faction || (milK && leg ? legFaction(leg) : null), F = fac ? FACTIONS[fac] : null, seed = o.seed != null ? o.seed : Math.floor(R()*1e9) + 1;   // v7.18 : graine du chantier (même coque, même livrée que l'aperçu)   // v7.13 : factions
  const age = o.age != null ? clamp(+o.age, 0, 1) : shipAge(kind), c = __CRAFT.build(kind, { variant: o.variant, slim: o.slim, age, wearAmt: o.wearAmt, seed, containers: o.containers,
    paint: F && kind !== 'target' ? F.paint[seed % F.paint.length] : undefined, accent: F && kind !== 'target' ? F.accent : undefined });
  const root = new THREE.Group(); root.add(c.group); (o.parent || shipWorld).add(root);
  const rcs = buildRcs({ group: c.group, hullBox: c.box, rcs: c.rcs, rcsLen: c.rcsLen }, c.len);
  const sh = { model: kind, type: c.name, name: genShipName(), root, inner: c.group, len: c.len, thr: c.thr, charge: { value: 0 }, nav: c.nav, lamps: c.lamps, traj: null, leg, rcs, age, craft: c, mil: !!c.mil,
    acc: (ACC[kind] || 1)*G0*rr(.85, 1.15), hull: { box: c.box.clone(), drive: null, rcs: c.rcs.slice(), docks: (c.docks || []).slice() },
    dispose(){ disposeRcs(rcs); c.dispose(); root.parent && root.parent.remove(root); ships.delete(sh); crafts.delete(sh); } };
  if(c.extra && c.extra.drive){ sh.drive = c.extra.drive; patchUniforms(c.group, sh.thr, sh.charge); }   // v7.8 : moteurs du jeu (chauffe, cardans, torche)
  const rad = []; c.group.traverse(m => { const mt = m.material; if(mt && mt.userData && mt.userData.radiator && rad.indexOf(mt) < 0) rad.push(mt); }); if(rad.length) sh.radiators = rad;
  if(fac){ sh.faction = fac; sh.name = ((kind === 'target' ? 'TGT' : FACTIONS[fac].pre) + ' ' + sh.name.replace(/^\S+\s+/, '')).trim(); }   // v7.13 : préfixe de faction (CNV, LWS ; aucun pour les irréguliers)
  if(o.parent){ crafts.add(sh); sh.carrier = o.carrier; } else ships.add(sh); track(sh, 'craft');
  if(!o.parent && sh.hull.docks.length) setupBays(sh);                    // v7.5 : hangars du destroyer (chasseurs catapultés)
  return sh;
}
/* ---------- segments de mouvement (repère du porteur) ---------- */
const easeIO = smoother, easeOut = x => 1 - Math.pow(1 - clamp(x, 0, 1), 3), easeIn = x => Math.pow(clamp(x, 0, 1), 2);
function bez3(a, b, c, d, u){ const w = 1 - u; return a.clone().multiplyScalar(w*w*w).addScaledVector(b, 3*w*w*u).addScaledVector(c, 3*w*u*u).addScaledVector(d, u*u*u); }
function segHold(p, q, x){ return () => Object.assign({ p, q }, x); }
function segLin(pA, pB, qA, qB, ease, x){ return u => { const k = ease(u); return Object.assign({ p: pA.clone().lerp(pB, k), q: qA.clone().slerp(qB, k) }, x); }; }
function segBez(P0, P1, P2, P3, qA, qB, ease, x){ return u => { const k = ease(u); return Object.assign({ p: bez3(P0, P1, P2, P3, k), q: qA.clone().slerp(qB, smooth(u*1.4)) }, x); }; }
/* ---------- plan d'une baie ---------- */
function setupBays(sh){
  const docks = sh.hull && sh.hull.docks; if(!docks || !docks.length || !window.__CRAFT) return;
  sh.bays = docks.map((d, i) => {
    const kind = sh.mil ? 'fighter' : (d.mode === 'belly' ? 'maint' : (d.hy >= 2.5 ? 'crew' : 'drone'));
    const c = makeCraft(kind, sh.leg, { parent: sh.inner, carrier: sh, variant: 'inspect', slim: kind === 'maint' && 2*d.hy < 6.5 });
    const box = c.craft.box, sz = box.getSize(new V3()), cb = box.getCenter(new V3());
    const op = { d, c, kind, carrier: sh, sz, cb, plan: [], lastRip: -9, idx: 0 };
    if(d.mode === 'belly'){ op.qPark = quatNose(d.T.clone().negate(), d.N.clone().negate()); op.cPark = d.C.clone().addScaledVector(d.N, -(d.D - .7 - sz.y/2)); op.ext = sz.y/2; }
    else if(kind === 'fighter'){ op.qPark = quatNose(d.N.clone(), d.B); op.cPark = d.C.clone().addScaledVector(d.N, -(sz.z/2 + 3)).addScaledVector(d.B, -d.hy + sz.y/2 + .6); op.ext = sz.z/2; }   // nez vers la sortie (catapulte)
    else { op.qPark = quatNose(d.N.clone().negate(), d.B); op.cPark = d.C.clone().addScaledVector(d.N, -(sz.z/2 + 1.2)).addScaledVector(d.B, -d.hy + sz.y/2 + .3); op.ext = sz.z/2; }
    op.pPark = op.cPark.clone().sub(cb.clone().applyQuaternion(op.qPark));            // position de l'origine de l'engin
    c.local = t => opPose(op, t);
    const t0 = T + rr(0, 20);
    op.plan.push({ s: R() < .7 ? 'parked' : 'away0', t0: -1e9, t1: t0, f: segHold(op.pPark, op.qPark, { thr: 0, vis: true }) });
    if(op.plan[0].s === 'away0'){ op.plan[0].f = segHold(op.pPark, op.qPark, { thr: 0, vis: false }); op.plan[0].s = 'away'; }
    return op;
  });
}
/* v7.2.2 : point de sortie franchement dehors — l'engin quitte l'embrasure dans l'axe avant tout virage (baies ventrales :
   la profondeur du hangar comptait pour moitié, l'engin tournait encore à moitié dedans) */
function outDist(op){ return op.d.mode === 'belly' ? op.d.D + 3.5 : op.ext*2 + 5; }
function calmAt(op, t){ const tr = op.carrier.traj; return rateAt(t) < 3 && (!tr || !(tr(t).throttle > .05)); }
function opNext(op){                          // ajoute l'état suivant au plan
  const last = op.plan[op.plan.length - 1], d = op.d, sz = op.sz, N = d.N;
  let t = last.t1; while(!calmAt(op, t) && t < last.t1 + 600) t += 3;           // les manœuvres attendent le temps réel
  if(t > last.t1){ op.plan.push({ s: last.s, t0: last.t1, t1: t, f: last.f.hold || segHold(last.end ? last.end.p : op.pPark, last.end ? last.end.q : op.qPark, { thr: 0, vis: last.s !== 'away' || op.kind !== 'crew' }) }); }
  const add = (s, dur, f, end) => { const t0 = op.plan[op.plan.length - 1].t1; op.plan.push({ s, t0, t1: t0 + dur, f, end }); };
  const out = op.pPark.clone().addScaledVector(N, outDist(op));                // point de sortie devant la baie (engin entièrement dehors)
  if(op.kind === 'fighter'){ fighterNext(op, last, add, out); return; }       // v7.5 : chasseur catapulté
  if(last.s === 'parked'){
    add('out', d.mode === 'belly' ? 7 : (op.kind === 'crew' ? 8 : 5), segLin(op.pPark, out, op.qPark, op.qPark, easeIO, { thr: 0, vis: true, rcs: 1 }), { p: out, q: op.qPark });
    if(op.kind === 'crew'){                                                      // demi-tour puis poussée vers la planète
      const dir = d.T.clone().multiplyScalar(R() < .5 ? 1 : -1).addScaledVector(N, .6).normalize(), qD = quatNose(dir, d.B), o2 = out.clone().addScaledVector(N, 4);
      add('out', 3.5, segLin(out, o2, op.qPark, qD, easeIO, { thr: 0, vis: true, rcs: 1 }), { p: o2, q: qD });
      const a = 6, v0 = 0;
      add('out', 14, u => { const tt = u*14; return { p: o2.clone().addScaledVector(dir, v0*tt + .5*a*tt*tt), q: qD, thr: smooth(u*6), vis: true }; }, { p: o2.clone().addScaledVector(dir, .5*a*196), q: qD });
    }
  } else if(last.s === 'out'){
    const e = last.end;
    if(op.kind === 'crew'){ add('away', rr(25, 45), segHold(e.p, e.q, { thr: 0, vis: false }), e); }
    else if(op.kind === 'maint'){                                                // travail au ras de la coque, projecteurs allumés
      const B = op.carrier.hull.box, sgn = R() < .5 ? -1 : 1, H = new V3(sgn*B.max.x*.8, lerp(B.min.y, B.max.y, rr(.3, .8)), lerp(B.min.z, B.max.z, rr(.35, .85)));
      const Wp = H.clone().add(new V3(sgn*rr(7, 10), rr(-2, 3), 0)); Wp.x = sgn*Math.max(Math.abs(Wp.x), B.max.x + 6);
      const qW = quatNose(H.clone().sub(Wp).normalize(), v(0, 1, 0)), bob = rr(0, 6);
      add('away', 9, segBez(e.p, e.p.clone().addScaledVector(N, 12), Wp.clone().add(new V3(sgn*8, 0, 0)), Wp, e.q, qW, easeIO, { thr: .25, vis: true, lamp: .5, rcs: 1 }), { p: Wp, q: qW });
      const hov = rr(14, 22);
      add('away', hov, u => ({ p: Wp.clone().add(new V3(0, .4*Math.sin(u*hov*.7 + bob), .6*Math.sin(u*hov*.4))), q: qW, thr: 0, vis: true, lamp: 1 }), { p: Wp, q: qW });
      add('away', 9, segBez(Wp, Wp.clone().add(new V3(sgn*8, 0, 0)), out.clone().addScaledVector(N, 12), out, qW, op.qPark, easeIO, { thr: .25, vis: true, lamp: .5, rcs: 1 }), { p: out, q: op.qPark });
    } else {                                                                     // drone : tour d'inspection autour du porteur
      // v7.2.2 : la boucle commence et finit devant la porte (avant : point de départ tiré au hasard, parfois de l'autre côté
      // du porteur — le drone longeait ou traversait la coque en sortant)
      const B = op.carrier.hull.box, Cc = B.getCenter(new V3()), rad = Math.max(B.max.x - B.min.x, B.max.y - B.min.y)*.5 + rr(6, 10), a0 = Math.atan2(N.y/.7, N.x) + rr(-.2, .2), sg = R() < .5 ? -1 : 1, per = rr(18, 26);
      const dz = d.C.z - Cc.z, ring = a => Cc.clone().add(new V3(Math.cos(a)*rad, Math.sin(a)*rad*.7, dz + (B.max.z - B.min.z)*.25*Math.sin((a - a0)*1.5)));
      const P0 = ring(a0), P1 = ring(a0 + sg*6.2832);
      add('away', 6, segBez(e.p, e.p.clone().addScaledVector(N, 12), P0.clone().addScaledVector(P0.clone().sub(Cc).normalize(), 4), P0, e.q, quatNose(Cc.clone().sub(P0), v(0, 0, 1)), easeIO, { thr: .3, vis: true, rcs: 1 }), { p: P0 });
      add('away', per, u => { const a = a0 + sg*6.2832*u, P = ring(a); return { p: P, q: quatNose(Cc.clone().sub(P), v(0, 0, 1)), thr: 0, vis: true }; }, { p: P1 });
      add('away', 6, segBez(P1, P1.clone().addScaledVector(P1.clone().sub(Cc).normalize(), 4), out.clone().addScaledVector(N, 12), out, quatNose(Cc.clone().sub(P1), v(0, 0, 1)), op.qPark, easeIO, { thr: .3, vis: true, rcs: 1 }), { p: out, q: op.qPark });
    }
  } else if(last.s === 'away'){
    let from = last.end ? last.end.p : out;
    if(op.kind === 'crew'){                                                      // retour de loin, nez vers la baie, freinage
      const far = out.clone().addScaledVector(N, rr(380, 520)).addScaledVector(d.T, rr(-160, 160)).addScaledVector(d.B, rr(-50, 80));
      add('in', 14, segBez(far, far.clone().lerp(out, .5).addScaledVector(d.T, rr(-40, 40)), out.clone().addScaledVector(N, 40), out, op.qPark, op.qPark, easeOut, { thr: 0, vis: true, rcs: 1 }), { p: out, q: op.qPark });
      add('in', 1.6, segHold(out, op.qPark, { thr: 0, vis: true }), { p: out, q: op.qPark });
      from = out;
    }
    add('in', d.mode === 'belly' ? 7 : (op.kind === 'crew' ? 8 : 5), segLin(from, op.pPark, op.qPark, op.qPark, easeIO, { thr: 0, vis: true, rcs: 1 }), { p: op.pPark, q: op.qPark });
  } else {                                                                       // in → parked
    add('parked', rr(18, 40), segHold(op.pPark, op.qPark, { thr: 0, vis: true }), { p: op.pPark, q: op.qPark });
  }
}
/* chasseur d'un hangar militaire (v7.5) : catapulte (accélération dans l'axe, allumage en sortie), dégagement, ronde autour du
   porteur, retour face à la baie, entrée lente nez en avant, plateau tournant (le chasseur repart nez vers la sortie) */
function fighterNext(op, last, add, out){
  const d = op.d, N = d.N, qIn = quatNose(N.clone().negate(), d.B), pIn = op.cPark.clone().sub(op.cb.clone().applyQuaternion(qIn));
  if(last.s === 'parked'){
    const far = out.clone().addScaledVector(N, 40);
    add('out', 2.6, u => ({ p: op.pPark.clone().lerp(far, u*u), q: op.qPark, thr: smooth((u - .55)/.45), vis: true, rcs: 0 }), { p: far, q: op.qPark });
  } else if(last.s === 'out'){
    const e = last.end, B = op.carrier.hull.box, Cc = B.getCenter(new V3()), sz = B.getSize(new V3());
    const rad = Math.max(sz.x, sz.y)*.5 + rr(90, 150), a0 = Math.atan2(N.y/.6, N.x), sg = R() < .5 ? -1 : 1, per = rr(26, 36), dz = d.C.z - Cc.z;
    const ring = a => Cc.clone().add(new V3(Math.cos(a)*rad, Math.sin(a)*rad*.6, dz + sz.z*.35*Math.sin(a - a0)));
    const tan = a => ring(a + sg*.01).sub(ring(a)).normalize();
    const P0 = ring(a0), P1 = ring(a0 + sg*6.2832), q0 = quatNose(tan(a0), v(0, 0, 1));
    add('away', 6, segBez(e.p, e.p.clone().addScaledVector(N, 160), P0.clone().addScaledVector(tan(a0), -120), P0, e.q, q0, easeIO, { thr: .9, vis: true, rcs: 1 }), { p: P0, q: q0 });
    add('away', per, u => { const a = a0 + sg*6.2832*u; return { p: ring(a), q: quatNose(tan(a), v(0, 0, 1)), thr: .55, vis: true }; }, { p: P1 });
    const app = out.clone().addScaledVector(N, 50);
    add('away', 9, segBez(P1, P1.clone().addScaledVector(tan(a0), 140), app.clone().addScaledVector(N, 160), app, q0, qIn, easeOut, { thr: .15, vis: true, rcs: 1 }), { p: app, q: qIn });
  } else if(last.s === 'away'){
    const from = last.end ? last.end.p : out.clone().addScaledVector(N, 50);
    add('in', 7, segLin(from, pIn, qIn, qIn, easeOut, { thr: 0, vis: true, rcs: 1 }), { p: pIn, q: qIn });
    add('in', 3.5, u => ({ p: pIn.clone().lerp(op.pPark, smooth(u)), q: qIn.clone().slerp(op.qPark, smooth(u)), thr: 0, vis: true }), { p: op.pPark, q: op.qPark });   // plateau tournant
  } else add('parked', rr(20, 40), segHold(op.pPark, op.qPark, { thr: 0, vis: true }), { p: op.pPark, q: op.qPark });
}
function opEnsure(op, t){ let n = 0; while(op.plan[op.plan.length - 1].t1 <= t && n++ < 40) opNext(op); }
function opPose(op, t){
  opEnsure(op, t);
  let i = Math.min(op.idx, op.plan.length - 1); while(i > 0 && op.plan[i].t0 > t) i--; while(i < op.plan.length - 1 && op.plan[i].t1 <= t) i++;
  const sg = op.plan[i], u = sg.t1 > sg.t0 + 1e-6 && sg.t0 > -1e8 ? clamp((t - sg.t0)/(sg.t1 - sg.t0), 0, 1) : 0, r = sg.f(u);
  r.s = sg.s; r.seg = sg; if(t === T) op.idx = i;
  r.center = op.cb.clone().applyQuaternion(r.q).add(r.p);
  return r;
}
/* force une manœuvre visible (héros en orbite) : repart d'un état calme et lance sortie ou retour à tS */
function opSchedule(op, tS){
  const cur = opPose(op, T);
  op.plan.length = 0; op.idx = 0;
  const parked = cur.s === 'parked' || cur.s === 'in' || (cur.s === 'out' && R() < .5) || R() < .55;
  op.plan.push({ s: parked ? 'parked' : 'away', t0: -1e9, t1: tS, f: segHold(op.pPark, op.qPark, { thr: 0, vis: parked || op.kind !== 'crew' }),
    end: parked ? { p: op.pPark, q: op.qPark } : null });
  if(!parked){ const o = op.pPark.clone().addScaledVector(op.d.N, outDist(op)); op.plan[0].f = segHold(o, op.qPark, { thr: 0, vis: op.kind !== 'crew' }); op.plan[0].end = { p: o, q: op.qPark }; }
}
function opActive(op, t0, t1){ opEnsure(op, t1); return op.plan.some(sg => sg.t1 > t0 && sg.t0 < t1 && (sg.s === 'out' || sg.s === 'in')); }
/* mise à jour des engins attachés : pose, ondes du champ, ombrage de hangar, feux, RCS */
function updateCrafts(dt){
  CRAFT_TIME && (CRAFT_TIME.value = T);
  ships.forEach(sh => { if(!sh.bays) return;
    sh.bays.forEach(op => {
      const c = op.c, r = opPose(op, T), d = op.d;
      c.root.position.copy(r.p); c.root.quaternion.copy(r.q); c.root.visible = r.vis !== false && sh.root.visible;
      c.thr.value = r.thr || 0;
      (c.lamps || []).forEach(l => l.value = r.lamp || (r.s === 'parked' ? 0 : .35));
      const sN = d.N.dot(r.center) - d.N.dot(d.C);
      if(Math.abs(sN) < op.ext + .4 && T - op.lastRip > .9 && (r.s === 'out' || r.s === 'in')){       // traversée du champ : onde
        op.lastRip = T; const rel = r.center.clone().sub(d.C); d.rip.set(rel.dot(d.T), rel.dot(d.B), T, .9);
      }
      const bay = c.craft.bay, qi = r.q.clone().invert(), n = d.N.clone().applyQuaternion(qi);
      bay.uBayP.value.set(n.x, n.y, n.z, d.N.dot(r.p) - d.N.dot(d.C)); bay.uBayOn.value = Math.abs(sN) < op.ext + 30 ? 1 : 0;
      if(c.nav) c.nav.forEach(nl => { const ph = ((T/nl.period + nl.phase) % 1); nl.mat.opacity = ph < nl.duty ? nl.peak : 0; });
      if(c.root.visible && r.rcs) updateRcs(c, T, dt); else if(c.rcs) c.rcs.forEach(j => { j.lvl = 0; j.jet.visible = j.spark.visible = false; });
    });
  });
  ships.forEach(sh => { if(sh.craft){ if(sh.nav) sh.nav.forEach(nl => { const ph = ((T/nl.period + nl.phase) % 1); nl.mat.opacity = ph < nl.duty ? nl.peak : 0; }); (sh.lamps || []).forEach(l => l.value = .6);
    if(sh.craft.turrets && sh.craft.turrets.length && sh.root.visible && !gunActive(sh) && !(sh.eng && T < sh.eng.tB + 5)) __CRAFT.aimTurrets(sh.craft, T, sh.name.length*3.7 + sh.name.charCodeAt(0)); } });   // v7.4 : tourelles qui balaient (v7.5 : sauf en exercice)
}
const CRAFT_TIME = window.__CRAFT ? __CRAFT.TIME : null;

/* ---------- trajectoires (fonctions du temps cinéma T, via τ(T)) ---------- */
// Orbite képlérienne circulaire : pos = C + u·cosθ·r + w·sinθ·r, θ = θ0 + ω·τ ; nez prograde, dos vers la normale du plan orbital
function orbitTraj(center, r, u, w, theta0, omega, tau0){
  const n = new V3().crossVectors(u, w).normalize();
  const f = T => {
    const a = theta0 + omega*(tauAt(T) - tau0);
    const pos = center.clone().addScaledVector(u, Math.cos(a)*r).addScaledVector(w, Math.sin(a)*r);
    const vel = u.clone().multiplyScalar(-Math.sin(a)).addScaledVector(w, Math.cos(a)).multiplyScalar(Math.sign(omega) || 1);
    return { pos, nose: vel, up: n, throttle: 0 };
  };
  f.speed = Math.abs(omega)*r; f.center = center; f.r = r; f.u = u; f.w = w; f.theta0 = theta0; f.omega = omega; f.tau0 = tau0;
  return f;
}
function linearTraj(p0, dir, speed, t0, up, throttle){
  const q = quatNose(dir, up);
  return T => ({ pos: p0.clone().addScaledVector(dir, speed*(T - t0)), q, throttle: throttle || 0 });
}
// Enchaînement de segments avec fondu d'attitude à chaque transition (durée propre à chaque segment)
function compositeTraj(segs){
  const f = T => {
    let i = 0; while(i+1 < segs.length && T >= segs[i+1].t0) i++;
    const s = segs[i], st = s.f(T);
    if(!st.q) st.q = quatNose(st.nose, st.up);
    const bl = s.blend || .9;
    if(i > 0 && T - s.t0 < bl){
      // écart d'attitude à la transition, exprimé dans le repère du vaisseau, résorbé autour d'un axe fixe (sens de rotation constant, même à 180°)
      const p = segs[i-1].f(s.t0), pq = p.q || quatNose(p.nose, p.up), b0 = s.f(s.t0), bq = b0.q || quatNose(b0.nose, b0.up);
      const off = bq.clone().invert().multiply(pq);
      st.q = st.q.clone().multiply(off.slerp(new Q(), smoother((T - s.t0)/bl)));
    }
    st.seg = s.kind; st.segObj = s;
    return st;
  };
  f.segs = segs;
  return f;
}

/* =====================================================================
   SCÈNES : champ galactique du moteur (unités du jeu) + système stellaire en mètres
   ===================================================================== */
const sysScene = new THREE.Scene();
const sysWorld = new THREE.Group(); sysScene.add(sysWorld);          // corps célestes — origine flottante : décalé de −caméra (et réduit) au rendu
const shipWorld = new THREE.Group(); sysScene.add(shipWorld);        // vaisseaux et effets : tranches proches uniquement (≤ 800 km)
const sysAmb = new THREE.AmbientLight(0x141c2e, .55);                 // mêmes lumières que la scène du jeu
const sunLight = new THREE.DirectionalLight(0xdfe7ff, 1.65);
sysScene.add(sysAmb); sysScene.add(sunLight); sysScene.add(sunLight.target);
const cam = new THREE.PerspectiveCamera(50, 1, 1, 10);               // caméra logique (position absolue en mètres, jamais rendue)
const rcam = new THREE.PerspectiveCamera(50, 1, 1, 10);              // caméra de rendu du système (à l'origine)
const galCam = new THREE.PerspectiveCamera(50, 1, .1, 3e4);           // caméra de rendu du champ d'étoiles
const galPos = new V3();                                              // position galactique courante (unités du jeu)

/* ---------- systèmes stellaires ---------- */
function legFromStar(sd){ return { name: sd.name, designation: sd.star.designation, gal: sd.position.clone(), position: new V3(), starPosition: new V3(), cell: sd.cell, star: sd.star }; }
/* Conversion à l'échelle réelle des données produites par le moteur (positions et rayons en unités de jeu)
   - étoile : rayon du moteur (R☉) ; zone habitable à √L UA ; planètes espacées d'un facteur 1,5–2,2 (loi de Titius-Bode)
   - planètes : rayons en R⊕ (rocheuses 0,45–1,65, géantes 3,8–11,8) ; directions orbitales du moteur conservées */
function realizeSystem(leg){
  const sys = leg.system, st = leg.star, r = rngFor(SEED + ':real:' + leg.cell);
  leg.Rs = Math.max(.008, st.radius || 1)*RSUN;
  leg.lum = Math.max(1e-4, st.lum || 1);
  const n = sys.planets.length, hi = sys.habIdx, aHZ = Math.sqrt(leg.lum)*AU;
  const engD = sys.planets.map(p => p.position.length());
  const a = new Array(n); a[hi] = aHZ*(.95 + .25*r());
  for(let i = hi + 1; i < n; i++) a[i] = a[i-1]*(1.5 + .7*r());
  for(let i = hi - 1; i >= 0; i--) a[i] = a[i+1]/(1.5 + .7*r());
  const off = Math.max(1, (leg.Rs*8)/a[0]); for(let i=0;i<n;i++) a[i] *= off;   // aucune planète dans la couronne
  sys.planets.forEach((p, i) => {
    const dir = p.position.clone().normalize();
    p.engineRadius = p.radius;
    p.radius = p.kind.gas ? REARTH*(3.8 + (p.radius - 200)/120*8) : REARTH*(.45 + (p.radius - 100)/100*1.2);
    p.position.copy(dir).multiplyScalar(a[i]); p.orbitA = a[i];
    p.mass = (p.kind.gas ? 1300 : 5500)*4/3*Math.PI*Math.pow(p.radius, 3);
    p.GM = GRAV*p.mass;
    p.dayLen = (p.kind.gas ? 9 + 8*r() : 16 + 28*r())*3600*(r() < .12 ? -1 : 1);
  });
  // ceinture : bornes du moteur transposées entre les orbites réelles (interpolation logarithmique)
  if(sys.asteroidBelt){
    const map = d => { let i = 0; while(i < n - 2 && engD[i+1] < d) i++; const x = clamp((d - engD[i])/Math.max(1, engD[i+1] - engD[i]), 0, 1); return a[i]*Math.pow(a[i+1]/a[i], x); };
    leg.beltInfo = { inner: map(sys.asteroidBelt.inner), outer: map(sys.asteroidBelt.outer) };
  }
  leg.realized = true;
}
function ensureSystemData(leg){
  if(!leg.system){ leg.system = generateSystemData(leg); leg.planets = leg.system.planets; leg.hab = leg.planets[leg.system.habIdx]; realizeSystem(leg); }
  return leg;
}
function stripBelt(leg){   // les instances du moteur, étalées sur des UA, seraient sous-pixel et imprécises en float32
  leg.group.children.slice().forEach(c => { let belt = false; c.traverse(o => { if(o.isInstancedMesh && o.material === ASTEROID_MAT) belt = true; }); if(belt){ leg.group.remove(c); c.traverse(o => o.isInstancedMesh && o.dispose && o.dispose()); } });
}
/* lunes : rayons réels (0,18–0,3 R pour une planète rocheuse, ~0,03 R pour une géante), orbites képlériennes à 18–60 R (6–30 R autour des géantes) */
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
function buildSystem(leg){
  if(leg.group) return leg;
  ensureSystemData(leg);
  leg.group = buildPlanetSystemMeshes(leg);
  stripBelt(leg);
  leg.group.visible = false; sysWorld.add(leg.group);
  leg.npcs = [];
  leg.sunColor = new THREE.Color(leg.star.color.r, leg.star.color.g, leg.star.color.b);
  leg.planets.forEach(p => { if(window.__PLANETS) __PLANETS.enhance(p); if(p.beaconSprite) p.beaconSprite.visible = false; });
  if(window.__AST) __AST.apply(leg);                                        // roches texturées (lunes)
  realizeMoons(leg);
  if(window.__STARS){ leg.star3 = __STARS.create(leg, __PLANETS.PIX, leg.group); leg.group.add(leg.star3.root); }
  return leg;
}
function disposeSystem(leg){
  if(!leg || !leg.group) return;
  if(window.__AST) __AST.detachShared(leg.group);   // géométries et matériaux partagés : on ne les détruit pas
  if(leg.star3){ __STARS.dispose(leg.star3); leg.star3 = null; }
  leg.group.parent && leg.group.parent.remove(leg.group); disposePlanetGroup(leg.group); leg.group = null;
  (leg.npcs || []).forEach(s => s.dispose()); leg.npcs = [];
  if(leg.beltInfo) leg.beltInfo.cluster = null;
}
function planetClearance(p){ return p.isStar ? p.radius : (p.hasRings ? p.radius*3.25 : p.radius*1.03); }
function obstacles(leg){ return (leg.planets || []).concat([{ position: new V3(), radius: (leg.Rs || RSUN)*1.6, isStar: true }]); }
/* écarte un chemin des corps (points de contrôle intérieurs repoussés) ; skip(pl, s) ignore la cible près de l'orbite */
function clearPath(P, bodies, skip){
  for(let it=0; it<10; it++){
    let moved = false;
    for(let i=1;i<40;i++){
      const s = i/40, pt = bez(P, s);
      bodies.forEach(pl => {
        if(skip && skip(pl, s)) return;
        const need = planetClearance(pl)*1.12, d = pt.distanceTo(pl.position);
        if(d < need){ const push = pt.clone().sub(pl.position).normalize().multiplyScalar((need - d)*1.8); P[1].add(push); P[2].add(push); moved = true; }
      });
    }
    if(!moved) break;
  }
  return P;
}
const recentCells = [];
function nextStarFrom(leg, dirHint){
  const used = new Set(recentCells);
  let dir = dirHint.clone().normalize();
  dir.x += rr(-.4,.4); dir.y += rr(-.25,.25); dir.z += rr(-.4,.4); dir.normalize();
  let w = findNextWaypoint(leg.gal, dir, used, .35) || findNextWaypoint(leg.gal, dir, used, 0) || findNextWaypoint(leg.gal, dir, used, -.6) || findNextWaypoint(leg.gal, randUnit(), new Set(), -1);
  recentCells.push(w.data.cell); if(recentCells.length > 40) recentCells.shift();
  return legFromStar(w.data);
}

/* ---------- trafic ambiant d'un système (orbites réelles) ---------- */
// aller-retour perpétuel entre deux orbites (flip-and-burn, arrêt aux extrémités)
function pingPongTraj(PA, PB, up, acc, tau0, body){
  const d = PB.clone().sub(PA), Ld = d.length(), side = perpTo(d.clone().normalize(), up);
  const skip = (pl, s) => s < .06 || s > .94;
  const Pf = arcPath(clearPath([PA.clone(), PA.clone().addScaledVector(d, .3).addScaledVector(side, Ld*.06), PA.clone().addScaledVector(d, .7).addScaledVector(side, Ld*.06), PB.clone()], [body], skip));
  const Pb = arcPath(Pf.P.slice().reverse().map(p => p.clone()));      // retour par le même chemin : direction continue au demi-tour
  const prof = flipProfile(Pf.L, 0, 0, acc, .3), per = 2*prof.D;
  const upB = up.clone().negate();                                   // après le retournement, le cargo est « à l'envers » : le retour repart ainsi (attitude continue)
  return T => { const t = ((tauAt(T) - tau0) % per + per) % per; return t < prof.D ? pathState(Pf, prof, t, up) : pathState(Pb, prof, t - prof.D, upB); };
}
/* ---------- formations militaires (v7.4) ----------
   formTraj : position décalée dans le repère du chef (nez, dos), petite ondulation propre à chaque ailier ;
   loopTraj : ronde inclinée autour d'un vaisseau, dans son repère, en temps réel (chasseurs d'escorte d'un destroyer) ;
   sideTraj : escorte parallèle à décalage fixe (la corvette se retourne en même temps que le cargo qu'elle escorte) */
function formTraj(lead, off, wob){ return T => { const st = lead(T), q = st.q || quatNose(st.nose, st.up), o = off.clone();
  if(wob){ o.x += wob*Math.sin(T*.37 + off.x); o.y += wob*.6*Math.sin(T*.29 + off.z); }
  return { pos: st.pos.clone().add(o.applyQuaternion(q)), nose: st.nose, up: st.up, q, throttle: st.throttle || 0, seg: st.seg }; }; }
function loopTraj(lead, rad, per, tilt, ph){ return T => { const st = lead(T), q = st.q || quatNose(st.nose, st.up), a = ph + 2*Math.PI*T/per;
  const lp = new V3(Math.cos(a)*rad, Math.sin(a)*rad*tilt, Math.sin(a)*rad), tg = new V3(-Math.sin(a), Math.cos(a)*tilt, Math.cos(a)).normalize();
  return { pos: st.pos.clone().add(lp.applyQuaternion(q)), nose: tg.applyQuaternion(q), up: new V3(0, 1, 0).applyQuaternion(q), throttle: .12, seg: 'orbit' }; }; }
function sideTraj(lead, offW){ return T => { const st = lead(T); return Object.assign({}, st, { pos: st.pos.clone().add(offW) }); }; }
const FINGER = [new V3(0, 0, 0), new V3(24, -3, 26), new V3(-24, -3, 26), new V3(48, -6, 52)];   // formation « quatre doigts » (m, repère du chef)
function wingOf(leg, lead, n, wob){ const grp = [lead]; for(let i = 1; i < n; i++){ const f = makeCraft('fighter', leg); f.traj = formTraj(lead.traj, FINGER[i], wob); grp.push(f); leg.npcs.push(f); }
  grp.forEach(f => f.formation = grp); return grp; }
/* ---------- exercices de tir (v7.5) ----------
   Le destroyer s'exerce sur son drone-cible : fenêtres de 12–16 s toutes les 40–55 s, en temps réel seulement. Les tourelles
   pointent la cible (avec anticipation), les tourelles de défense rapprochée tirent des rafales de traçantes orangées,
   les tourelles principales des obus électromagnétiques bleutés ; ~70 % des coups touchent : éclat et bouclier
   d'entraînement qui s'illumine. Aucune destruction. Traçantes et éclats dans un groupe ancré sur le tireur (précision). */
const GUN = { N: 320, pool: [], grp: null, pos: null, col: null, flashes: [], fi: 0, shooter: null };
function buildGunFx(){
  const g = new THREE.BufferGeometry(); GUN.pos = new Float32Array(GUN.N*6); GUN.col = new Float32Array(GUN.N*6);
  g.setAttribute('position', new THREE.BufferAttribute(GUN.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(GUN.col, 3));
  const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  lines.frustumCulled = false; lines.renderOrder = 9;
  GUN.grp = new THREE.Group(); GUN.grp.visible = false; GUN.grp.add(lines); GUN.lines = lines; shipWorld.add(GUN.grp);
  const hg = new THREE.BufferGeometry(); GUN.hpos = new Float32Array(GUN.N*3); GUN.hcol = new Float32Array(GUN.N*3);
  hg.setAttribute('position', new THREE.BufferAttribute(GUN.hpos, 3)); hg.setAttribute('color', new THREE.BufferAttribute(GUN.hcol, 3));
  GUN.heads = new THREE.Points(hg, new THREE.PointsMaterial({ map: glowTex, size: 7, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  GUN.heads.frustumCulled = false; GUN.heads.renderOrder = 10; GUN.grp.add(GUN.heads);
  for(let i = 0; i < 24; i++){ const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc080, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    sp.visible = false; sp.renderOrder = 10; GUN.grp.add(sp); GUN.flashes.push({ sp, t0: -9, dur: .4, size: 10, rel: new V3() }); }
  GUN.grp.userData.center = new V3(); GUN.grp.userData.r = 1;
}
function gunActive(sh){ const g = sh.gun; return !!g && g.target && g.target.traj && rateAt(T) < 3 && ((T + g.ph) % g.per) < g.on && !(g.target.hp && g.target.hp.disabled); }   // v7.13 : cessez-le-feu quand la cible est désemparée
function gunFlash(rel, size, dur, color){ const f = GUN.flashes[GUN.fi++ % GUN.flashes.length]; f.rel.copy(rel); f.t0 = T; f.dur = dur; f.size = size; f.sp.material.color.setHex(color); f.sp.visible = true; }
const _gq = new Q(), _gv = new V3(), _gw = new V3();
function updateGunnery(dt){
  if(!GUN.grp) return;
  const leg = visit && visit.leg; let sh = null;
  if(leg) ships.forEach(x => { if(!sh && x.gun && x.leg === leg && x.root.visible && gunActive(x)) sh = x; });
  const live = GUN.pool.some(t => T - t.t0 < t.life + .05) || GUN.flashes.some(f => T - f.t0 < f.dur);
  if(!sh && !live){ GUN.grp.visible = false; GUN.shooter = null; return; }
  if(sh) GUN.shooter = sh;
  const S = GUN.shooter; if(!S || !S.traj){ GUN.grp.visible = false; return; }
  const P = S.traj(T).pos; GUN.grp.position.copy(P); GUN.grp.visible = true;
  if(sh && dt > 0 && dt < .2){
    const tg = sh.gun.target, g = sh.gun; sh.root.updateMatrixWorld(true);
    sh.craft.turrets.forEach((u, i) => {
      // pointage : cible (avec anticipation) dans le repère du socle de la tourelle
      const speed = u.main ? 1300 : 1900, tp = tg.traj(T).pos, flight = tp.distanceTo(P)/speed, tpl = tg.traj(T + flight).pos.sub(sh.traj(T + flight).pos).add(P);   // anticipation dans le repère co-mobile du tireur (le destroyer file à plusieurs km/s)
      const loc = sh.inner.worldToLocal(tpl.clone()).sub(u.pos); if(u.ventral){ loc.x = -loc.x; loc.y = -loc.y; }
      const yawT = Math.atan2(-loc.x, -loc.z), pitT = Math.atan2(loc.y - u.pitch.position.y, Math.hypot(loc.x, loc.z));
      const k = Math.min(1, dt*(u.main ? 1.6 : 4)), dy = Math.atan2(Math.sin(yawT - u.yaw.rotation.y), Math.cos(yawT - u.yaw.rotation.y));
      u.yaw.rotation.y += dy*k; u.pitch.rotation.x += (clamp(pitT, -.2, 1.2) - u.pitch.rotation.x)*k;
      if(Math.abs(dy) > .08) return;                                           // pas encore en ligne : on ne tire pas
      // cadence : rafales pour la défense rapprochée, coups isolés pour les pièces principales
      const key = 'u' + i, rate = u.main ? 1/2.8 : 13, inBurst = u.main ? true : ((T + i*.37) % 1.7) < .55, n = Math.floor(T*rate), last = g.last[key];
      g.last[key] = n; if(!inBurst || last === undefined || n === last) return;
      u.pitch.updateMatrixWorld(true);
      const side = (n % 2 ? 1 : -1)*(u.main ? .95 : .42)*u.s/2, mz = u.pitch.localToWorld(_gv.set(side, 0, -u.len)).clone(), rel0 = mz.clone().sub(P);
      const hit = Math.random() < .7, aim = tpl.clone().sub(P), dir = aim.sub(rel0).normalize();
      const spr = hit ? .0015 : .012; dir.x += (Math.random() - .5)*spr*2; dir.y += (Math.random() - .5)*spr*2; dir.z += (Math.random() - .5)*spr*2; dir.normalize();
      const life = tpl.distanceTo(mz)/speed*(hit ? 1 : 1.6);
      let tr = GUN.pool.find(t => T - t.t0 > t.life + .05); if(!tr){ if(GUN.pool.length >= GUN.N) return; tr = {}; GUN.pool.push(tr); }
      Object.assign(tr, { t0: T, rel0, dir, speed, life, len: u.main ? 45 : 16, main: u.main, hit, tg }); const eh = hpOf(sh); eh.energy = Math.max(0, eh.energy - (u.main ? .012 : .0015));   // v7.13 : le tir coûte de l'énergie
      gunFlash(rel0, (u.main ? 9 : 2.6)*u.s/1.4, .06, u.main ? 0xbfe0ff : 0xffd090);
    });
  }
  // traçantes (repère co-mobile du tireur) ; plan large : traçantes et éclats allongés avec la distance caméra (lisibilité)
  const pa = GUN.pos, ca = GUN.col, kd = clamp(cam.position.distanceTo(P)/320, 1, 3.5); let j = 0;
  GUN.pool.forEach(t => { const a = T - t.t0; if(a < 0 || a > t.life){ if(t.hit && t.tg && t.done !== t.t0 && a > t.life && a < t.life + .1){ t.done = t.t0;
        const sh0 = hpOf(t.tg).shield > .02, j = randUnitM().multiplyScalar(t.tg.len*.12), pt = hullEntry(t.tg, t.tg.root.position.clone().add(j).addScaledVector(t.dir, -t.tg.len*2), t.dir);   // v7.13 : point d'impact sur la coque (boîte), ou sur le bouclier
        gunFlash(pt.clone().sub(P), (t.main ? 16 : 7)*kd*(sh0 ? 1 : .6), t.main ? .6 : .35, sh0 ? 0xcfe8ff : (t.main ? 0xffe0b0 : 0xffb070));
        hitShip(t.tg, t.main ? .09 : .012, pt, t.dir); }
      return; }
    const hd = t.rel0.clone().addScaledVector(t.dir, t.speed*a), tl = hd.clone().addScaledVector(t.dir, -Math.min(t.len*kd, t.speed*a));
    const c = t.main ? [.55, .8, 1.3] : [1.4, .8, .3];
    pa.set([tl.x, tl.y, tl.z, hd.x, hd.y, hd.z], j*6); ca.set([c[0]*.15, c[1]*.15, c[2]*.15, c[0], c[1], c[2]], j*6);
    GUN.hpos.set([hd.x, hd.y, hd.z], j*3); const hk = t.main ? 1.0 : .6; GUN.hcol.set([c[0]*hk, c[1]*hk, c[2]*hk], j*3); j++; });
  for(let k = j; k < GUN.N; k++){ pa.fill(0, k*6, k*6 + 6); }
  GUN.lines.geometry.attributes.position.needsUpdate = true; GUN.lines.geometry.attributes.color.needsUpdate = true; GUN.lines.geometry.setDrawRange(0, j*2);
  GUN.heads.geometry.attributes.position.needsUpdate = true; GUN.heads.geometry.attributes.color.needsUpdate = true; GUN.heads.geometry.setDrawRange(0, j);
  GUN.flashes.forEach(f => { const a = (T - f.t0)/f.dur; if(a < 0 || a > 1){ f.sp.visible = false; return; }
    f.sp.visible = true; f.sp.position.copy(f.rel); f.sp.scale.setScalar(f.size*(.4 + .6*Math.sqrt(a))); f.sp.material.opacity = (1 - a)*(1 - a); });
  // boucliers des cibles : décroissance
  ships.forEach(x => { if(x.craft && x.craft.extra && x.craft.extra.shield) x.craft.extra.shield.value *= Math.exp(-dt*3.5); });
  if(S.gun && S.gun.target && S.gun.target.traj){ const tp = S.gun.target.traj(T).pos; GUN.grp.userData.center.copy(P).lerp(tp, .5); GUN.grp.userData.r = tp.distanceTo(P)*.5 + 60; }
}
function militaryTasks(leg, tasks, force){
  if(!window.__CRAFT || !__CRAFT.MIL) return;
  const pm = force || PARAMS.get('military'); if(pm === '0') return;
  const all = pm === 'all', kinds = ['station', 'patrol', 'escort'];
  if(!(pm || R() < .6)) return;                                             // présence militaire dans ≈ 6 systèmes sur 10 (?military= pour forcer)
  const pickK = kinds.includes(pm) ? pm : pickW([['station', 1], ['patrol', 1.1], ['escort', .9]]), hab = leg.hab;
  if(all || pickK === 'station') tasks.push(() => {                         // destroyer en orbite haute et sa ronde de deux chasseurs
    const d = makeCraft('destroyer', leg), u = randUnit(), w = perpTo(u), r = hab.radius*rr(1.18, 1.4);
    d.traj = orbitTraj(hab.position, r, u, w, rr(0, 6.28), Math.sqrt(hab.GM/r)/r*(R() < .5 ? -1 : 1), 0); leg.npcs.push(d);
    const f0 = makeCraft('fighter', leg); f0.traj = loopTraj(d.traj, d.len*rr(1.2, 1.6), rr(34, 46), .35, rr(0, 6.28)); leg.npcs.push(f0);
    d.escorts = wingOf(leg, f0, 2, 2);
    const tg = makeCraft('target', leg); tg.traj = loopTraj(d.traj, rr(700, 1100), rr(55, 75), .25, rr(0, 6.28)); leg.npcs.push(tg);   // v7.5 : drone-cible
    d.gun = { target: tg, per: rr(40, 55), on: rr(12, 16), ph: rr(0, 40), last: {} };
  });
  if(all || pickK === 'patrol') tasks.push(() => {                          // patrouille de 3 ou 4 chasseurs en orbite basse
    const f0 = makeCraft('fighter', leg), u = randUnit(), w = perpTo(u), r = hab.radius*rr(1.04, 1.1);
    f0.traj = orbitTraj(hab.position, r, u, w, rr(0, 6.28), Math.sqrt(hab.GM/r)/r*(R() < .5 ? -1 : 1), 0); leg.npcs.push(f0);
    wingOf(leg, f0, R() < .5 ? 3 : 4, 2.5); f0.patrol = true;
  });
  if(all || pickK === 'escort') tasks.push(() => {                          // corvette d'escorte le long d'un cargo (même route, se retourne avec lui)
    const cargo = leg.npcs.find(x => !x.craft && NPC_BIG.some(([m]) => m === x.model) && x.traj);
    const c = makeCraft('corvette', leg);
    if(cargo){ const st = cargo.traj(T), f = frameOf(st.q || quatNose(st.nose, st.up)), side = R() < .5 ? -1 : 1;
      c.traj = sideTraj(cargo.traj, f.right.clone().multiplyScalar(side*(cargo.len*.35 + c.len*.8 + 30)).addScaledVector(f.up, 12)); c.escortOf = cargo; }
    else { const u = randUnit(), w = perpTo(u), r = hab.radius*rr(1.1, 1.3); c.traj = orbitTraj(hab.position, r, u, w, rr(0, 6.28), Math.sqrt(hab.GM/r)/r, 0); }
    leg.npcs.push(c);
  });
}
/* =====================================================================
   COMBAT I (v7.13, lot 17) — factions, état des vaisseaux, impacts, désemparé
   Chaque vaisseau a une énergie (réacteur), un bouclier (militaires) et une coque. Un coup est d'abord absorbé par le
   bouclier, qui se recharge sur l'énergie, puis il entame la coque : étincelles, point chaud qui refroidit, parfois un jet
   de gaz. Sous 22 % de coque, le vaisseau est désemparé : propulsion coupée, feux éteints (quelques sursauts), dérive en
   rotation lente, fuites de gaz. La destruction viendra au lot 20. Étiquettes et jauges : shiplabels.js (__CINE.labelsState).
   Effets : un seul nuage de points additif (étincelles, points chauds, gaz ; 1 appel de dessin), une bulle de bouclier
   par militaire touché (créée au premier coup, visible 1,4 s après chaque impact).
   ===================================================================== */
const FACTIONS = {
  coalition: { name: 'Coalition', pre: 'CNV', paint: [0x5c646e, 0x4b535d], accent: 0x2f7dff, css: '#5aa2ff' },
  league: { name: 'League', pre: 'LWS', paint: [0x8c6c3b, 0x7a5d32], accent: 0xff7a1a, css: '#ff9a3c' },
  irregular: { name: 'Irregulars', pre: '', paint: [0x1e2024, 0x28292d], accent: 0xff2a1a, css: '#ff5a4a' } };
const OWNERS = ['Helion Freight', 'Kestrel Lines', 'Arden Haulage', 'Meridian Tankers', 'Solace Transit', 'Corvid Salvage', 'Northreach Cargo', 'Vela Mining Co.', 'Tessaract Logistics', 'Lumen Shipping'];
function ownerOf(sh){ if(sh.faction) return FACTIONS[sh.faction].name; let h = 0; for(const c of String(sh.name)) h = (h*31 + c.charCodeAt(0)) >>> 0; return OWNERS[h % OWNERS.length]; }   // armateur (civils)
function legFaction(leg){ return leg.faction || (leg.faction = pickW([['coalition', .6], ['league', .4]])); }                 // garnison du système
const DISABLE_AT = .22;
function hpOf(sh){
  if(sh.hp) return sh.hp;
  const mil = !!sh.mil || sh.model === 'target', h0 = clamp(1 - .3*(sh.age || 0), .62, 1);                 // les vieilles coques partent un peu entamées
  return (sh.hp = { hull: h0, hull0: h0, shield: mil ? 1 : 0, shMax: mil ? 1 : 0, energy: 1, disabled: false, tDis: -1, lastHit: -9, spots: [], tumble: null });
}
const IMP = { N: 1400, parts: [], i: 0, grp: null, pts: null, pos: null, col: null, size: null };
function buildImpactFx(){
  const g = new THREE.BufferGeometry(); IMP.pos = new Float32Array(IMP.N*3); IMP.col = new Float32Array(IMP.N*3); IMP.size = new Float32Array(IMP.N);
  g.setAttribute('position', new THREE.BufferAttribute(IMP.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(IMP.col, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(IMP.size, 1));
  const m = new THREE.ShaderMaterial({ uniforms: { uPx: { value: 500 }, map: { value: glowTex } }, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute float aSize; uniform float uPx; varying vec3 vC; void main(){ vC = color; vec4 mv = modelViewMatrix*vec4(position, 1.0); gl_PointSize = aSize > 0.0 ? clamp(aSize*uPx/max(-mv.z, 0.1), 1.6, 240.0) : 0.0; gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'uniform sampler2D map; varying vec3 vC; void main(){ float a = texture2D(map, gl_PointCoord).a; gl_FragColor = vec4(vC*a, 1.0); }' });
  IMP.pts = new THREE.Points(g, m); IMP.pts.frustumCulled = false; IMP.pts.renderOrder = 11; IMP.pts.userData.noFrame = true;
  IMP.grp = new THREE.Group(); IMP.grp.add(IMP.pts); IMP.grp.visible = false; IMP.grp.userData.center = new V3(); IMP.grp.userData.r = 1; shipWorld.add(IMP.grp);
  for(let k = 0; k < IMP.N; k++) IMP.parts.push({ t0: -99, life: 0 });
}
function impPart(o){ const p = IMP.parts[IMP.i++ % IMP.N]; for(const k in p) delete p[k]; return Object.assign(p, o); }
const _iq = new Q(), _iv = new V3();
function bodyLocal(sh, pAbs){ return pAbs.clone().sub(sh.root.position).applyQuaternion(_iq.copy(sh.root.quaternion).invert()); }
function sparks(sh, pAbs, n, dirN, speed, hot){                                // gerbe d'étincelles (repère co-mobile du vaisseau touché)
  const rel = pAbs.clone().sub(sh.root.position);
  for(let k = 0; k < n; k++){ const v = dirN.clone().multiplyScalar(.6).add(randUnitM()).normalize().multiplyScalar(speed*(.35 + Math.random()));
    impPart({ k: 0, sh, rel: rel.clone(), vel: v, t0: T, life: .35 + .6*Math.random(), sz: (hot ? .5 : .3)*Math.max(.6, sh.len/40)*(.6 + Math.random()) }); }
}
function randUnitM(){ const z = Math.random()*2 - 1, a = Math.random()*6.2832, r = Math.sqrt(1 - z*z); return new V3(Math.cos(a)*r, z, Math.sin(a)*r); }   // hors graine : effets seulement
function hullHit(sh, pAbs, dir, dmg){
  const hp = hpOf(sh), c = sh.root.position, nrm = pAbs.clone().sub(c).normalize(), L = sh.len;
  sparks(sh, pAbs, Math.min(40, 8 + Math.round(dmg*260)), nrm, Math.max(12, L*.35), true);
  const spot = impPart({ k: 1, sh, loc: bodyLocal(sh, pAbs.clone().addScaledVector(nrm, L*.01)), nl: nrm.clone().applyQuaternion(_iq.copy(sh.root.quaternion).invert()), t0: T, life: rr0(7, 10), sz: clamp(L*.025 + dmg*22, .8, L*.09),
    vent: dmg > .03 && Math.random() < .45 ? rr0(3, 7) : 0 });
  hp.spots = hp.spots.filter(q => q.k === 1 && q.sh === sh && T - q.t0 < q.life); hp.spots.push(spot);
  while(hp.spots.length > 8){ const old = hp.spots.shift(); old.t0 = -99; }            // au plus 8 points chauds par vaisseau
}
/* point d'entrée d'un tir sur la boîte de la coque (repère du vaisseau) ; repli : devant le centre */
function hullEntry(sh, from, dir){
  const b = sh.craft ? sh.craft.box : sh.hull.box, off = sh.craft ? new V3() : (sh.com || new V3()), qi = _iq.copy(sh.root.quaternion).invert();
  const o = from.clone().sub(sh.root.position).applyQuaternion(qi).add(off), d = dir.clone().applyQuaternion(qi);
  let t0 = -Infinity, t1 = Infinity; for(const k of ['x', 'y', 'z']){ const inv = 1/(d[k] || 1e-9), a = (b.min[k] - o[k])*inv, c = (b.max[k] - o[k])*inv; t0 = Math.max(t0, Math.min(a, c)); t1 = Math.min(t1, Math.max(a, c)); }
  if(t1 < Math.max(t0, 0)) return sh.root.position.clone().addScaledVector(dir, -sh.len*.3);
  return o.addScaledVector(d, Math.max(t0, 0)).sub(off).applyQuaternion(sh.root.quaternion).add(sh.root.position);
}
function rr0(a, b){ return a + (b - a)*Math.random(); }
function segBox(sh, aW, bW, pad){                                              // v7.15 : le segment [aW, bW] (monde) traverse-t-il la boîte de la coque (élargie de pad) ?
  const bx = sh.craft ? sh.craft.box : sh.hull.box, off = sh.craft ? new V3() : (sh.com || new V3()), qi = _iq.copy(sh.root.quaternion).invert();
  const o = aW.clone().sub(sh.root.position).applyQuaternion(qi).add(off), d = bW.clone().sub(aW).applyQuaternion(qi); let t0 = 0, t1 = 1;
  for(const k of ['x', 'y', 'z']){ const lo = bx.min[k] - pad, hi = bx.max[k] + pad; if(Math.abs(d[k]) < 1e-9){ if(o[k] < lo || o[k] > hi) return false; continue; }
    const a = (lo - o[k])/d[k], c = (hi - o[k])/d[k]; t0 = Math.max(t0, Math.min(a, c)); t1 = Math.min(t1, Math.max(a, c)); if(t0 > t1) return false; }
  return true;
}
function ensureBubble(sh){
  if(sh.bubble) return sh.bubble;
  const b = sh.craft ? sh.craft.box : sh.hull.box, c = b.getCenter(new V3()), sz = b.getSize(new V3()).multiplyScalar(.64), F = sh.faction ? FACTIONS[sh.faction] : null;
  const col = new THREE.Color(F ? F.accent : 0x5aa8ff).lerp(new THREE.Color(0xa8d4ff), .5);
  const U = { uCol: { value: col }, uHitDir: { value: new V3(0, 0, 1) }, uHitT: { value: -9 }, uT: { value: 0 }, uAmp: { value: 1 }, uLvl: { value: 1 } };
  const m = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = normalize(position); vec4 mv = modelViewMatrix*vec4(position, 1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: `uniform vec3 uCol; uniform vec3 uHitDir; uniform float uHitT; uniform float uT; uniform float uAmp; uniform float uLvl; varying vec3 vP; varying vec3 vN; varying vec3 vV;
void main(){ float a = max(uT - uHitT, 0.0), d = acos(clamp(dot(vP, uHitDir), -1.0, 1.0));
  vec2 q = vec2(atan(vP.z, vP.x)*6.0, asin(clamp(vP.y, -1.0, 1.0))*7.0); q.x *= 0.866; float odd = step(1.0, mod(floor(q.x), 2.0)); vec2 cc = vec2(fract(q.x), fract(q.y + 0.5*odd)) - 0.5;
  float hex = smoothstep(0.38, 0.48, max(abs(cc.x)*1.155 + abs(cc.y)*0.5, abs(cc.y)));
  float ring = exp(-pow((d - a*2.4)/0.2, 2.0))*exp(-a*2.2), spot = exp(-d*d*16.0)*exp(-a*6.0), rim = pow(1.0 - abs(dot(vN, vV)), 3.0)*exp(-a*2.5)*0.3;
  float k = uAmp*((ring*(0.8 + 0.9*hex) + spot*1.8 + rim*1.5)*(0.4 + 0.6*uLvl)); gl_FragColor = vec4(uCol*k, 1.0); }` });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), m); mesh.scale.copy(sz); mesh.position.copy(c); mesh.renderOrder = 12; mesh.userData.noFrame = true; mesh.visible = false;
  sh.inner.add(mesh); sh.bubble = { mesh, U }; return sh.bubble;
}
function shieldHit(sh, pAbs, amt){
  const x = sh.craft && sh.craft.extra; if(x && x.shield){ x.shield.value = Math.min(1.2, x.shield.value + .35 + amt*4); return; }   // drone-cible : son propre bouclier d'entraînement
  const B = ensureBubble(sh), b = sh.craft ? sh.craft.box : sh.hull.box, c = b.getCenter(new V3());
  const loc = bodyLocal(sh, pAbs).sub(c.clone().multiply(sh.inner.scale)); B.U.uHitDir.value.copy(loc.divide(B.mesh.scale).normalize()); B.U.uHitT.value = T; B.U.uAmp.value = clamp(.5 + amt*9, .5, 1.4); B.U.uLvl.value = hpOf(sh).shield;
}
function hitShip(sh, dmg, pAbs, dir){                                            // v7.13 : un coup (énergie → bouclier → coque)
  const hp = hpOf(sh); hp.lastHit = T; if(sh.armor) dmg /= sh.armor;               // v7.15 : blindage (porte-vaisseaux)
  if(hp.shield > .02){ const a = Math.min(hp.shield, dmg*1.4); hp.shield -= a; dmg -= a/1.4; shieldHit(sh, pAbs, a); }
  if(dmg > 1e-5){ hp.hull = Math.max(0, hp.hull - dmg); hullHit(sh, pAbs, dir, dmg); }
  if(sh.noDisable) hp.hull = Math.max(hp.hull, DISABLE_AT + .04); else if(sh.civ) hp.hull = Math.max(hp.hull, .12);   // civils : désemparés au pire, jamais détruits
  if(!hp.disabled && hp.hull < DISABLE_AT) disableShip(sh);
}
function disableShip(sh){
  const hp = hpOf(sh); hp.disabled = true; hp.tDis = T; hp.shield = 0; hp.tumble = { axis: randUnitM(), w: rr0(.05, .13)*(sh.len > 120 ? .4 : 1) };
  sparks(sh, sh.root.position.clone().add(randUnitM().multiplyScalar(sh.len*.3)), 40, randUnitM(), Math.max(15, sh.len*.5), true);
  if(hp.spots.length) hp.spots[hp.spots.length - 1].vent = 999;                    // fuite continue
  if(sh.eng) engDoom(sh.eng, sh);                                                 // v7.16 : l'épave explosera-t-elle ?
}
function repairShip(sh){ const hp = hpOf(sh); Object.assign(hp, { disabled: false, tDis: -1, tumble: null, hull: hp.hull0, shield: hp.shMax*.4, energy: .6 }); hp.spots.forEach(p => p.vent = 0); }
/* après la pose des vaisseaux : désemparés (dérive en rotation, moteurs coupés, feux), recharge, jets de gaz */
function updateCombat(dt){
  ships.forEach(sh => { const hp = sh.hp; if(!hp || !sh.root.visible) return;
    const thr = sh.thr ? sh.thr.value : 0;
    if(hp.disabled){
      if(hp.tumble) sh.root.quaternion.multiply(_iq.setFromAxisAngle(hp.tumble.axis, hp.tumble.w*(T - hp.tDis)));
      if(sh.thr) sh.thr.value = 0; if(sh.drive) sh.drive.uThr.value = 0;
      hp.energy = Math.max(.04, hp.energy - dt*.08); hp.shield = 0;
      const fl = Math.sin(T*23.7 + sh.len) > .985; if(sh.nav) sh.nav.forEach(nl => nl.mat.opacity = fl ? nl.peak*.6 : 0); (sh.lamps || []).forEach(l => l.value = 0);
      hp.spots = hp.spots.filter(p => p.k === 1 && p.sh === sh);                // points chauds encore vivants (tampon circulaire)
      if(dt > 0 && Math.random() < dt*1.2 && hp.spots.length){ const sp = hp.spots[Math.floor(Math.random()*hp.spots.length)], pa = sh.root.position.clone().add(sp.loc.clone().applyQuaternion(sh.root.quaternion));
        sparks(sh, pa, 10, sp.nl.clone().applyQuaternion(sh.root.quaternion), Math.max(8, sh.len*.2), false); }   // arcs électriques
      if(sh.model === 'target' && T - hp.tDis > 18 && !(GUN.shooter && gunActive(GUN.shooter))) repairShip(sh);   // drone-cible : redémarrage après l'exercice
    } else {
      const cap = 1 - .3*thr; hp.energy = Math.min(cap, hp.energy + dt*.07);
      const inC = sh.eng && T < sh.eng.tB, rg = inC ? .04 : .1;                    // en combat : recharge plus lente (réacteur sollicité)
      if(hp.shMax && hp.shield < hp.shMax && T - hp.lastHit > (inC ? 3 : 1.5) && hp.energy > .12){ const s_ = Math.min(hp.shMax - hp.shield, dt*rg); hp.shield += s_; hp.energy -= s_*.6; }
      if(sh.model === 'target' && T - hp.lastHit > 6) hp.hull = Math.min(hp.hull0, hp.hull + dt*.02);      // réparation lente entre deux exercices
    }
    if(sh.bubble){ const B = sh.bubble; B.U.uT.value = T; B.mesh.visible = T - B.U.uHitT.value < 1.4; } });
}
/* nuage d'effets : ancré sur le sujet filmé (coordonnées relatives, précision flottante) */
function fxAnchor(){ const s_ = shot && shot.subj; if(!s_ || !s_.root) return cam.position; if(s_.root.visible || !s_.traj) return s_.root.position; return (FXA.t === T ? FXA.p : (FXA.t = T, FXA.p.copy(s_.traj(T).pos))); }   // v7.17 : sujet caché (vaisseau détruit) → sa trajectoire, pas sa racine figée
const FXA = { t: -1, p: new V3() };
/* v7.16 : fumée des explosions — mélange normal (visible sur une planète claire, là où l'additif disparaît), rendue avant le feu */
const SMK = { N: 320, parts: [], i: 0, grp: null, pts: null, pos: null, col: null, size: null, al: null };
function buildSmokeFx(){
  const g = new THREE.BufferGeometry(); SMK.pos = new Float32Array(SMK.N*3); SMK.col = new Float32Array(SMK.N*3); SMK.size = new Float32Array(SMK.N); SMK.al = new Float32Array(SMK.N);
  g.setAttribute('position', new THREE.BufferAttribute(SMK.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(SMK.col, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(SMK.size, 1)); g.setAttribute('aA', new THREE.BufferAttribute(SMK.al, 1));
  const m = new THREE.ShaderMaterial({ uniforms: { uPx: { value: 500 }, map: { value: glowTex } }, vertexColors: true, transparent: true, depthWrite: false,
    vertexShader: 'attribute float aSize; attribute float aA; uniform float uPx; varying vec3 vC; varying float vA; void main(){ vC = color; vA = aA; vec4 mv = modelViewMatrix*vec4(position, 1.0); gl_PointSize = aSize > 0.0 ? clamp(aSize*uPx/max(-mv.z, 0.1), 1.6, 240.0) : 0.0; gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'uniform sampler2D map; varying vec3 vC; varying float vA; void main(){ float a = texture2D(map, gl_PointCoord).a; a = smoothstep(0.0, 0.8, a)*vA; if(a < 0.01) discard; gl_FragColor = vec4(vC, a); }' });
  SMK.pts = new THREE.Points(g, m); SMK.pts.frustumCulled = false; SMK.pts.renderOrder = 10; SMK.pts.userData.noFrame = true;
  SMK.grp = new THREE.Group(); SMK.grp.add(SMK.pts); SMK.grp.visible = false; SMK.grp.userData.center = new V3(); SMK.grp.userData.r = 1; shipWorld.add(SMK.grp);
  for(let k = 0; k < SMK.N; k++) SMK.parts.push({ t0: -99, life: 0 });
}
function smoke(E, pW, vW, R, n){ if(!SMK.grp) buildSmokeFx(); const A = E.anchor, rel0 = pW.clone().sub(A.root.position);
  for(let i = 0; i < n; i++){ const p = SMK.parts[SMK.i++ % SMK.N], d = randUnitM(); Object.assign(p, { sh: A, rel: rel0.clone().addScaledVector(d, R*.2*Math.random()), vel: vW.clone().addScaledVector(d, R*(.15 + .5*Math.random())),
    t0: T + .05 + Math.random()*.25, life: 3 + Math.random()*2.5, sz: R*(.25 + .3*Math.random()), grow: 1.6 + Math.random()*1.4, sh0: .6 + .4*Math.random() }); } }
function updateSmoke(){
  if(!SMK.grp) return; const A = fxAnchor(), P = SMK.pos, Cc = SMK.col, S = SMK.size, Al = SMK.al; let n = 0, rmax = 1;
  SMK.parts.forEach(p => { const age = T - p.t0; if(!p.sh || age < 0 || age > p.life || !p.sh.root.parent) return; const x = age/p.life;
    _iv.copy(p.sh.root.position).add(p.rel).addScaledVector(p.vel, age*(1 - .4*x)).sub(A); const warm = clamp(1 - x*4, 0, 1)*p.sh0;
    P[n*3] = _iv.x; P[n*3 + 1] = _iv.y; P[n*3 + 2] = _iv.z; Cc[n*3] = .09 + .3*warm; Cc[n*3 + 1] = .085 + .12*warm; Cc[n*3 + 2] = .08 + .03*warm;
    S[n] = p.sz*(.5 + p.grow*Math.sqrt(x)); Al[n] = .72*Math.min(1, x/.1)*Math.pow(1 - x, 1.4); rmax = Math.max(rmax, _iv.length() + S[n]); n++; });
  for(let k = n; k < SMK.N; k++) S[k] = 0;
  const g_ = SMK.pts.geometry; ['position', 'color', 'aSize', 'aA'].forEach(a => g_.attributes[a].needsUpdate = true); g_.setDrawRange(0, n);
  SMK.grp.position.copy(A); SMK.grp.visible = n > 0; SMK.grp.userData.center.copy(A); SMK.grp.userData.r = rmax; SMK.pts.material.uniforms.uPx.value = IMP.pts ? IMP.pts.material.uniforms.uPx.value : 500;
}
function updateImpacts(dt){
  if(!IMP.grp) buildImpactFx();
  const A = fxAnchor(), P = IMP.pos, Cc = IMP.col, S = IMP.size;
  let n = 0, rmax = 1; const q = new Q();
  IMP.parts.forEach(p => {                                                          // fuites de gaz : émission continue depuis les points chauds
    if(p.k !== 1 || !(p.vent > 0) || dt <= 0 || !p.sh) return; const sh = p.sh, age = T - p.t0;
    if(!sh.root.visible || age > p.life + (p.vent === 999 ? 1e9 : 0) || (p.vent !== 999 && age > p.vent)) return;
    if(Math.random() < dt*22){ q.copy(sh.root.quaternion); const nw = p.nl.clone().applyQuaternion(q), rel = p.loc.clone().applyQuaternion(q);
      impPart({ k: 2, sh, rel, vel: nw.multiplyScalar(Math.max(6, sh.len*.18)*(.7 + .6*Math.random())).add(randUnitM().multiplyScalar(Math.max(1.5, sh.len*.03))), t0: T, life: 1.4 + Math.random(), sz: Math.max(.5, sh.len*.02) }); } });
  IMP.parts.forEach(p => {
    const age = T - p.t0; if(!p.sh || age < 0 || (age > p.life && !(p.k === 1 && p.vent === 999))) return;
    const sh = p.sh; if(!sh.root.visible || !sh.root.parent) return;
    const x = clamp(age/p.life, 0, 1); let px, r, g, b, sz;
    if(p.k === 1){ _iv.copy(p.loc).applyQuaternion(sh.root.quaternion).add(sh.root.position); const heat = p.vent === 999 ? Math.max(.25, 1 - x) : 1 - x;
      r = 1.7*Math.pow(heat, .8); g = .95*Math.pow(heat, 2.2); b = .35*Math.pow(heat, 4); sz = p.sz*(.55 + .45*heat); }
    else { _iv.copy(sh.root.position).add(p.rel).addScaledVector(p.vel, p.k === 3 ? age*(1 - .45*x) : age);
      if(p.k === 3){ const hot = clamp(1 - x/.16, 0, 1), mid = clamp(1 - Math.abs(x - .32)/.3, 0, 1), f = Math.pow(1 - x, 1.3);   // v7.16 : boule de feu — blanc, orange, rouge sombre
        r = (1.5*hot + 1.15*mid + .42)*f; g = (1.25*hot + .5*mid + .07)*f; b = (.9*hot + .1*mid + .02)*f; sz = p.sz*(.55 + p.grow*Math.sqrt(x)); }
      else if(p.k === 0){ const f = (1 - x)*(1 - x); r = 1.8*f; g = (1.3 - .9*x)*f; b = (.8 - .75*x)*f; sz = p.sz*(1 - .5*x); }
      else { const f = (1 - x)*.5; r = .42*f; g = .46*f; b = .52*f; sz = p.sz*(1 + 3.5*x); } }
    _iv.sub(A); P[n*3] = _iv.x; P[n*3 + 1] = _iv.y; P[n*3 + 2] = _iv.z; Cc[n*3] = r; Cc[n*3 + 1] = g; Cc[n*3 + 2] = b; S[n] = sz; rmax = Math.max(rmax, _iv.length() + sz); n++; });
  for(let k = n; k < IMP.N; k++) S[k] = 0;
  const g_ = IMP.pts.geometry; g_.attributes.position.needsUpdate = true; g_.attributes.color.needsUpdate = true; g_.attributes.aSize.needsUpdate = true; g_.setDrawRange(0, n);
  IMP.grp.position.copy(A); IMP.grp.visible = n > 0; IMP.grp.userData.center.copy(A); IMP.grp.userData.r = rmax;
  const sz = renderer.getDrawingBufferSize(_v2); IMP.pts.material.uniforms.uPx.value = sz.y/(2*Math.tan(cam.fov*Math.PI/360));
  IMP.n = n;
}
/* =====================================================================
   COMBAT II (v7.14, lot 18) — moteur d'engagement
   Un engagement vit dans un repère co-mobile (une orbite autour de la planète habitée) : toutes les positions des
   combattants, obus, traçantes et missiles y sont exprimées ; le groupe d'effets est placé sur ce repère à chaque image.
   Scénarios : 'skirmish' (escarmouche : deux patrouilles de 3 chasseurs, paires qui se poursuivent le long d'une courbe de
   Lissajous, le poursuivant et le poursuivi échangent leurs rôles par dépassement) et 'duel' (duel de ligne : deux destroyers
   parallèles à 3–4,5 km, tourelles principales, salves de missiles, défense rapprochée qui intercepte).
   Arrivée des deux camps (6 s), combat (≈ 40 s), fin : quand un camp est entièrement désemparé, ou à la fin de la fenêtre
   (repli). Un vaisseau désemparé dérive en ligne droite dans le repère. Destruction : lot 20.
   ===================================================================== */
const CBT = { N: 560, pool: [], grp: null, lines: null, heads: null, pos: null, col: null, hpos: null, hcol: null, MN: 40, TR: 14, mLines: null, mPos: null, mCol: null, mHeads: null, mhPos: null, mhCol: null, flashes: [], fi: 0, rings: [], ri: 0, deb: null, debs: [], di: 0, DN: 200, hulks: [] };
const COMBAT_P = PARAMS.get('combat');                                      // ?combat=0 (jamais) · 1 · skirmish · duel · convoy · raid · assault ; défaut : ≈ 1 système sur 5
const COMBAT_KINDS = ['skirmish', 'duel', 'convoy', 'raid', 'assault'];
function buildCombatFx(){
  const G = new THREE.Group(); G.visible = false; G.userData.center = new V3(); G.userData.r = 1; shipWorld.add(G); CBT.grp = G;
  const mkLines = (n, order) => { const g = new THREE.BufferGeometry(), p = new Float32Array(n*6), c = new Float32Array(n*6); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); l.frustumCulled = false; l.renderOrder = order; G.add(l); return [l, p, c]; };
  const mkPts = (n, size, order) => { const g = new THREE.BufferGeometry(), p = new Float32Array(n*3), c = new Float32Array(n*3); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const pt = new THREE.Points(g, new THREE.PointsMaterial({ map: glowTex, size, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); pt.frustumCulled = false; pt.renderOrder = order; G.add(pt); return [pt, p, c]; };
  [CBT.lines, CBT.pos, CBT.col] = mkLines(CBT.N, 9); [CBT.heads, CBT.hpos, CBT.hcol] = mkPts(CBT.N, 6, 10);
  [CBT.mLines, CBT.mPos, CBT.mCol] = mkLines(CBT.MN*(CBT.TR - 1), 9); [CBT.mHeads, CBT.mhPos, CBT.mhCol] = mkPts(CBT.MN, 11, 10);
  for(let i = 0; i < 20; i++){ const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc080, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    sp.visible = false; sp.renderOrder = 10; G.add(sp); CBT.flashes.push({ sp, t0: -9, dur: .4, size: 10, loc: new V3() }); }
  const ringM = () => new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 }, uCol: { value: new THREE.Color(.75, .88, 1.25) } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,   // v7.16 : onde de choc
    vertexShader: 'varying float vR; void main(){ vR = length(position.xy); gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }',
    fragmentShader: 'uniform float uA; uniform vec3 uCol; varying float vR; void main(){ float e = smoothstep(.84, .95, vR)*(1.0 - smoothstep(.965, 1.0, vR)) + .07*smoothstep(.6, .96, vR)*(1.0 - smoothstep(.96, 1.0, vR)); gl_FragColor = vec4(uCol*e*uA, 1.0); }' });
  for(let i = 0; i < 4; i++){ const m = new THREE.Mesh(new THREE.RingGeometry(.55, 1, 96, 1), ringM()); m.visible = false; m.renderOrder = 10; m.frustumCulled = false; G.add(m); CBT.rings.push({ m, t0: -9, dur: 1, R: 1 }); }
  const dm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .72, metalness: .55 }), di = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), dm, CBT.DN);   // v7.16 : débris (un seul appel)
  di.instanceMatrix.setUsage(THREE.DynamicDrawUsage); di.frustumCulled = false; di.count = 0; di.setColorAt(0, new THREE.Color(1, 1, 1)); G.add(di); CBT.deb = di;
  for(let i = 0; i < CBT.DN; i++) CBT.debs.push({ t0: -1e9, life: 0, p: new V3(), v: new V3(), ax: new V3(0, 1, 0), w: 0, s: new V3(), q0: new Q() });
}
function cbFlash(loc, size, dur, color){ const f = CBT.flashes[CBT.fi++ % CBT.flashes.length]; f.loc.copy(loc); f.t0 = T; f.dur = dur; f.size = size; f.sp.material.color.setHex(color); f.sp.visible = true; }
/* repère et poses */
function engFrame(E, t){ const st = E.orbit(t); st.q = quatNose(st.nose, st.up); return st; }
function toLocal(E, F, pW){ return pW.clone().sub(F.pos).applyQuaternion(F.q.clone().invert()); }
function toWorld(F, pL){ return pL.clone().applyQuaternion(F.q).add(F.pos); }
function cbPose(sh, t){                                                     // pose dans le repère (après désemparé : dérive en ligne droite)
  const hp = sh.hp;
  if(hp && hp.disabled && t >= hp.tDis){ if(!sh.cbDrift){ const a = sh.cbPoseRaw(hp.tDis - .05), b = sh.cbPoseRaw(hp.tDis + .05); sh.cbDrift = { p: b.p.clone(), v: b.p.clone().sub(a.p).multiplyScalar(10*.6), q: b.q.clone() }; }
    const D = sh.cbDrift; return { p: D.p.clone().addScaledVector(D.v, t - hp.tDis), q: D.q, thr: 0 }; }
  return sh.cbPoseRaw(t);
}
function velPose(fn, t){ const a = fn(t - .05), b = fn(t + .05); return b.sub(a).multiplyScalar(10); }
function bankQ(vel, acc){ const f = vel.clone().normalize(), aP = acc.clone().addScaledVector(f, -acc.dot(f)); return quatNose(f, v(0, 1, 0).multiplyScalar(9.8*2.5).add(aP).normalize()); }
function engAdd(E, sh, side, poseRaw, o){                                     // v7.15 : un vaisseau (militaire ou civil) rejoint l'engagement
  o = o || {}; sh.eng = E; sh.side = side; sh.cbPoseRaw = poseRaw; hpOf(sh);
  sh.traj = t => { const F = engFrame(E, t), L = cbPose(sh, t), q = F.q.clone().multiply(L.q); return { pos: F.pos.clone().add(L.p.clone().applyQuaternion(F.q)), q, nose: v(0, 0, -1).applyQuaternion(q), up: v(0, 1, 0).applyQuaternion(q), throttle: L.thr, seg: 'combat' }; };
  const tIn = o.tIn != null ? o.tIn : E.tA - 3, tOut = o.tOut != null ? o.tOut : 1e9; sh.hideAt = t => t < tIn || t > tOut;
  E.ships.push(sh); E.sides[side].push(sh); E.leg.npcs.push(sh); return sh;
}
function engShip(E, kind, side, poseRaw, o){ return engAdd(E, makeCraft(kind, E.leg, { faction: (o && o.fac) || E.facs[side] }), side, poseRaw, o); }
function engCiv(E, side, poseRaw){ const s = makeShip(pick(['e18', 'p10', 'g1', 'x1', 'p44']), E.leg, { noBays: true, merge: true }); s.civ = true; return engAdd(E, s, side, poseRaw); }   // cargo civil (jamais armé)
/* v7.15 : briques de trajectoire, dans le repère de l'engagement */
function engEntry(pathFn, tS, t1, E0){                                        // arrivée : de E0 (au loin) jusqu'à la trajectoire, rejointe à t1 (Bézier sur [tS, t1], ligne droite avant)
  const P1 = pathFn(t1), V1 = pathFn(t1 + .05).sub(pathFn(t1 - .05)).multiplyScalar(10), dIn = P1.clone().sub(E0).normalize(), L = P1.distanceTo(E0), In = t1 - tS;
  return t => { if(t >= t1) return pathFn(t); if(t < tS) return E0.clone().addScaledVector(dIn, (t - tS)*L/In*1.5); return bez3(E0, E0.clone().addScaledVector(dIn, L/2), P1.clone().addScaledVector(V1, -In/3), P1, (t - tS)/In); };
}
function engExit(fn, tX, dF, acc){                                             // repli : pleine poussée vers dF (droit devant par défaut)
  acc = acc || 30; return t => { if(t <= tX) return fn(t); const V = fn(tX).sub(fn(tX - .1)).multiplyScalar(10), x = t - tX; return fn(tX).addScaledVector(V, x).addScaledVector(dF || V.clone().normalize(), acc*x*x); };
}
function fighterPose(fn){ return t => { const p = fn(t), vel = fn(t + .05).sub(fn(t - .05)).multiplyScalar(10), acc = fn(t + .1).add(fn(t - .1)).addScaledVector(p, -2).multiplyScalar(100);
  return { p, q: bankQ(vel.lengthSq() > 1 ? vel : v(0, 0, -1), acc), thr: clamp(.55 + acc.dot(vel.clone().normalize())/60, .3, 1), vel }; }; }
function hullPose(fn, hold, thrFn){                                             // gros vaisseau : nez dans la vitesse quand il manœuvre, sinon vers `hold`
  return t => { const p = fn(t), vel = fn(t + .5).sub(fn(t - .5)), n = vel.clone().addScaledVector(hold, 20).normalize(); return { p, q: quatNose(n, v(0, 1, 0)), thr: thrFn ? thrFn(t, vel.length()) : .1 }; }; }
function strafeAxes(a){                                                        // passes de mitraillage : grand axe a (horizontal par défaut), petit axe incliné
  if(!a){ const th = rr(0, 6.28); a = new V3(Math.cos(th), rr(-.25, .25), Math.sin(th)).normalize(); }
  const s1 = new V3().crossVectors(a, v(0, 1, 0)).normalize(), u1 = new V3().crossVectors(s1, a).normalize(), ro = rr(-1.1, 1.1);
  return [a, u1.multiplyScalar(Math.cos(ro)).addScaledVector(s1, Math.sin(ro)).normalize()];
}
function strafeB(tg){ const b = tg.craft ? tg.craft.box : tg.hull.box, s = b.getSize(new V3()); return Math.max(170, .5*Math.hypot(s.x, s.y) + 80); }   // passage au ras, sans toucher la coque
function strafePath(tgtFn, A, B, per, ph, axA, axB){                           // ellipse allongée centrée sur la cible : piqué dans l'axe, passage au ras, ressource aux extrémités
  const w = 2*Math.PI/per, axC = new V3().crossVectors(axA, axB).normalize();
  return t => { const a = w*t + ph; return tgtFn(t).addScaledVector(axA, A*Math.cos(a)).addScaledVector(axB, B*Math.sin(a)).addScaledVector(axC, B*.35*Math.sin(2*a)); };
}
function chasePath(a, D0, ph){ return t => a.cbPoseRaw(t - D0*(1 + .3*Math.sin(.4*t + ph))).p; }   // poursuite : la trajectoire de l'adversaire, avec un retard qui respire
function blendPath(f1, f2, tA, tB, back){                                      // f1 → f2 sur [tA, tA+4], retour vers f1 après `back`
  return t => { const k = smooth(clamp((t - tA)/4, 0, 1))*(back ? 1 - smooth(clamp((t - back)/7, 0, 1)) : 1); return k <= 0 ? f1(t) : (k >= 1 ? f2(t) : f1(t).lerp(f2(t), k)); };
}
function makeEngagement(leg, kind, tA, dur, facs){
  if(!window.__CRAFT || !__CRAFT.MIL) return null;
  let car = null;                                                              // v7.15 : assaut d'un porte-vaisseaux militaire (sinon : attaque de convoi)
  if(kind === 'assault'){ const c0 = leg.npcs.find(x => x.isCarrier);
    if(c0) car = c0.model === 'carrierMil' && c0.traj === c0.orbitF && !(c0.eng && T < c0.eng.tB + 5) ? c0 : null;
    else if(__CRAFT.CARRIER && PARAMS.get('carrier') !== '0') car = 'new';
    if(!car) kind = 'convoy'; }
  const hab = leg.hab, u = hab.position.clone().negate().normalize(), w = perpTo(u), r = hab.radius*rr(1.15, 1.4), om = Math.sqrt(hab.GM/r)/r*(R() < .5 ? -1 : 1);
  const th0 = -om*tauAt(tA) + rr(-.55, .55);                                   // côté jour au début de l'engagement (près du point subsolaire) : combat éclairé
  if(car === 'new'){ const rc = hab.radius*rr(1.3, 1.5), oc = Math.sqrt(hab.GM/rc)/rc*(R() < .5 ? -1 : 1); car = ensureCarrier(leg, 'mil', { u, w, r: rc, om: oc, th0: -oc*tauAt(tA) + rr(-.5, .5) }); if(!car || car.model !== 'carrierMil'){ car = null; kind = 'convoy'; } }
  if(kind === 'convoy' || kind === 'raid') facs = [legFaction(leg), 'irregular'];
  if(car){ const a = car.faction || legFaction(leg); facs = [a, R() < .3 ? 'irregular' : (a === 'coalition' ? 'league' : 'coalition')]; }
  const E = { kind, leg, orbit: car ? car.orbitF : orbitTraj(hab.position, r, u, w, th0, om, 0), tA, tB: tA + dur, facs, ships: [], sides: [[], []], missiles: [], over: false, winner: -1, msg: {}, R0: 900, ev: [] };
  const In = 6;
  if(kind === 'skirmish'){
    for(let k = 0; k < 3; k++){
      const C0 = new V3(rr(-250, 250), rr(-120, 120), rr(-250, 250)), A = new V3(rr(380, 620), rr(110, 240), rr(380, 620)), Wv = [2*Math.PI/rr(22, 30), 2*Math.PI/rr(26, 36), 2*Math.PI/rr(18, 26)], ph = [rr(0, 6.3), rr(0, 6.3), rr(0, 6.3)];
      const P = t => new V3(C0.x + A.x*Math.sin(Wv[0]*t + ph[0]), C0.y + A.y*Math.sin(Wv[1]*t + ph[1]), C0.z + A.z*Math.cos(Wv[2]*t + ph[2]));
      const Ts = rr(14, 18), D0 = rr(1.4, 2), dl = t => D0*Math.cos(Math.PI*(t - tA - In)/Ts);                 // décalage le long de la courbe : > 0 → B poursuit A ; dépassement quand il change de signe
      const side = t => { const vv = P(t + .05).sub(P(t - .05)).normalize(); return new V3().crossVectors(vv, v(0, 1, 0)).normalize(); };
      const pA = t => P(t), pB = t => { const d_ = dl(t); return P(t - d_).addScaledVector(side(t), 70*Math.exp(-d_*d_*3)); };
      const entry = (sgn, pathFn) => { const t1 = tA + In, P1 = pathFn(t1), V1 = pathFn(t1 + .05).sub(pathFn(t1 - .05)).multiplyScalar(10), E0 = new V3(sgn*rr(2500, 3000), rr(-150, 150) + k*60, rr(-300, 300)), dIn = P1.clone().sub(E0).normalize(), L = P1.distanceTo(E0);
        return t => { if(t >= t1) return pathFn(t); if(t < tA) return E0.clone().addScaledVector(dIn, (t - tA)*L/In*1.5); const x = (t - tA)/In; return bez3(E0, E0.clone().addScaledVector(dIn, L/2), P1.clone().addScaledVector(V1, -In/3), P1, x); }; };
      const exit = (fn) => t => { if(t <= E.tB) return fn(t); const V = fn(E.tB).sub(fn(E.tB - .1)).multiplyScalar(10), x = t - E.tB; return fn(E.tB).addScaledVector(V, x).addScaledVector(V.clone().normalize(), 30*x*x); };   // repli : pleine poussée droit devant
      const fa = entry(-1, pA), fb = entry(1, pB), ga = exit(fa), gb = exit(fb);
      const poseOf = fn => t => { const p = fn(t), vel = fn(t + .05).sub(fn(t - .05)).multiplyScalar(10), acc = fn(t + .1).add(fn(t - .1)).addScaledVector(p, -2).multiplyScalar(100); return { p, q: bankQ(vel.lengthSq() > 1 ? vel : v(0, 0, -1), acc), thr: clamp(.55 + acc.dot(vel.clone().normalize())/60, .3, 1), vel }; };
      const a = engShip(E, 'fighter', 0, poseOf(ga)), b = engShip(E, 'fighter', 1, poseOf(gb)); a.cbOpp = b; b.cbOpp = a; a.cbMis = R() < .6 ? tA + rr(8, 14) : -1; b.cbMis = R() < .6 ? tA + rr(8, 14) : -1;
    }
    E.R0 = 800;
  } else if(kind === 'duel'){
    const D = rr(2200, 3000), weak = R() < .5 ? 0 : 1;
    [-1, 1].forEach((sg, sd) => {
      const base = new V3(sg*D/2, rr(-80, 80), rr(-200, 200)), E0 = base.clone().add(new V3(sg*rr(2500, 3200), rr(-200, 200), rr(1500, 2500))), f1 = rr(.05, .09), f2 = rr(.04, .07), yA = rr(.06, .12);
      const hold = t => base.clone().add(new V3(60*Math.sin(f1*t), 25*Math.sin(f2*t + sd), 80*Math.sin(.035*t + sd*2)));
      const pos = t => { const t1 = tA + In; if(t >= t1) return hold(t); const P1 = hold(t1), x = clamp((t - tA)/In, -3, 1); return x < 0 ? E0.clone().addScaledVector(P1.clone().sub(E0).normalize(), x*P1.distanceTo(E0)/3) : bez3(E0, E0.clone().lerp(P1, .45), P1.clone().add(new V3(0, 0, 300)), P1, smooth(x)); };
      const s = engShip(E, 'destroyer', sd, t => ({ p: pos(t), q: new Q().setFromAxisAngle(v(0, 1, 0), yA*Math.sin(.045*t + sd*1.7)), thr: t < tA + In ? .45 : .08 }));
      if(sd === weak){ const h = s.hp; h.hull = h.hull0 = h.hull0*.85; h.shMax = h.shield = .75; }   // un camp un peu moins bien armé : l'issue ne se joue pas à pile ou face
      s.cbSalvo = tA + In + rr(3, 6);
    });
    E.sides[0][0].cbOpp = E.sides[1][0]; E.sides[1][0].cbOpp = E.sides[0][0]; E.R0 = D*.6;
  }

  else if(kind === 'convoy'){                                                  // v7.15 : convoi de 3 cargos, corvette et 2 chasseurs d'escorte ; 4 chasseurs irréguliers en passes de mitraillage
    const dC = new V3(rr(-.35, .35), rr(-.06, .06), -1).normalize(), lat = new V3().crossVectors(dC, v(0, 1, 0)).normalize(), up = new V3().crossVectors(lat, dC).normalize();
    const Vc = rr(55, 75), tM = tA + dur*.5, sp = rr(330, 430), sg = R() < .5 ? -1 : 1, lead = t => dC.clone().multiplyScalar(Vc*(t - tM));
    const civ = []; for(let i = 0; i < 3; i++){ const off = dC.clone().multiplyScalar(-(i - 1)*sp).addScaledVector(lat, rr(-70, 70)).addScaledVector(up, rr(-35, 35)), ph = rr(0, 6.3);
      civ.push(engCiv(E, 0, hullPose(t => lead(t).add(off).addScaledVector(up, 6*Math.sin(.11*t + ph)), dC, () => .2))); }
    const oC = lat.clone().multiplyScalar(sg*rr(260, 320)).addScaledVector(up, rr(50, 90)).addScaledVector(dC, rr(-.3, .3)*sp);
    const cv = engShip(E, 'corvette', 0, hullPose(t => lead(t).add(oC).addScaledVector(up, 5*Math.sin(.09*t)), dC, () => .25)); cv.cbSalvo = tA + rr(8, 12); cv.cbSalvoN = 1; cv.cbEvery = [10, 14];
    const att = []; for(let k = 0; k < 4; k++){ const tg = civ[[0, 1, 2, 1][k]], ax = strafeAxes(), path = strafePath(t => cbPose(tg, t).p, rr(1000, 1300), strafeB(tg), rr(21, 27), rr(0, 6.3), ax[0], ax[1]);
      const t1 = tA + 6 + k*1.3, E0 = lead(t1).addScaledVector(lat, sg*rr(2600, 3200)).addScaledVector(dC, rr(-600, 600)).addScaledVector(up, rr(-150, 350)), fl = lat.clone().multiplyScalar(sg).addScaledVector(up, rr(0, .4)).normalize();
      const f = engShip(E, 'fighter', 1, fighterPose(engExit(engEntry(path, t1 - 6, t1, E0), E.tB + k*.4, fl, 40)), { tOut: E.tB + 26 }); f.cbOpp = tg; f.cbMis = R() < .7 ? tA + rr(9, 18) : -1; att.push(f); }
    cv.cbOpp = att[2];
    for(let j = 0; j < 2; j++){ const oF = dC.clone().multiplyScalar(-sp*1.6 - j*60).addScaledVector(lat, (j ? 1 : -1)*90).addScaledVector(up, 40);
      const e = engShip(E, 'fighter', 0, fighterPose(blendPath(t => lead(t).add(oF), chasePath(att[j], rr(1.3, 1.9), rr(0, 6.3)), tA + 7 + j*1.5, 0, E.tB + 1))); e.cbOpp = att[j]; e.cbMis = R() < .5 ? tA + rr(12, 20) : -1; }
    E.R0 = 1200; E.civMul = .3; E.retreat = 1;
  } else if(kind === 'raid'){                                                  // v7.15 : pirates sur un cargo isolé ; la patrouille surgit (saut), les pirates décrochent
    const dC = new V3(rr(-.35, .35), rr(-.06, .06), -1).normalize(), lat = new V3().crossVectors(dC, v(0, 1, 0)).normalize(), up = new V3().crossVectors(lat, dC).normalize();
    const Vc = rr(28, 40), tM = tA + dur*.5, sg = R() < .5 ? -1 : 1, lead = t => dC.clone().multiplyScalar(Vc*(t - tM)), tP = tA + dur*.33, tF = tA + dur*.66 + rr(-1, 1.5); E.tP = tP; E.tF = tF;
    const civ = [], nV = R() < .4 ? 2 : 1; for(let i = 0; i < nV; i++){ const off = dC.clone().multiplyScalar(-i*rr(300, 380)).addScaledVector(lat, i ? rr(-80, 80) : 0).addScaledVector(up, i ? rr(-30, 30) : 0), ph = rr(0, 6.3);
      civ.push(engCiv(E, 0, hullPose(t => lead(t).add(off).addScaledVector(up, 5*Math.sin(.1*t + ph)), dC, () => .15))); }
    const dirP = lat.clone().multiplyScalar(-sg), flee = lat.clone().multiplyScalar(sg).addScaledVector(up, rr(.1, .4)).addScaledVector(dC, rr(-.3, .3)).normalize();
    const oPc = lat.clone().multiplyScalar(sg*rr(480, 600)).addScaledVector(up, rr(60, 140)).addScaledVector(dC, rr(-100, 100)), pcP = t => lead(t).add(oPc), pcE0 = lead(tA + 6).add(oPc).addScaledVector(flee, rr(2400, 2900));
    const pc = engShip(E, 'corvette', 1, hullPose(engExit(engEntry(pcP, tA - 2, tA + 6, pcE0), tF + .6, flee, 22), lat.clone().multiplyScalar(-sg), t => (t < tA + 6 || t > tF) ? .8 : .15), { tOut: tF + 26 });
    pc.cbOpp = civ[0]; pc.cbSalvo = tA + rr(7, 10); pc.cbSalvoN = 1; pc.cbEvery = [9, 13]; pc.cbStop = tF;
    const pf = []; for(let k = 0; k < 3; k++){ const tg = civ[k % nV], ax = strafeAxes(), path = strafePath(t => cbPose(tg, t).p, rr(900, 1200), strafeB(tg), rr(20, 26), rr(0, 6.3), ax[0], ax[1]);
      const t1 = tA + 4 + k*1.1, E0 = lead(t1).add(oPc).addScaledVector(flee, rr(1800, 2400)).add(new V3(rr(-300, 300), rr(-200, 200), rr(-300, 300)));
      const fl = flee.clone().add(new V3(rr(-.3, .3), rr(-.2, .3), rr(-.3, .3))).normalize();
      const f = engShip(E, 'fighter', 1, fighterPose(engExit(engEntry(path, t1 - 5, t1, E0), tF + k*.3, fl, 45)), { tOut: tF + 22 }); f.cbOpp = tg; f.cbStop = tF; f.cbMis = R() < .5 ? tA + rr(6, 12) : -1; pf.push(f); }
    const oD = dirP.clone().multiplyScalar(rr(1100, 1400)).addScaledVector(up, rr(80, 200)).addScaledVector(dC, rr(-200, 200)), dE0 = lead(tP).add(oD).addScaledVector(dirP, rr(2600, 3200)).addScaledVector(up, rr(100, 300));
    const ds = engShip(E, 'destroyer', 0, hullPose(engEntry(t => lead(t).add(oD).addScaledVector(up, 8*Math.sin(.07*t)), tP, tP + 6.5, dE0), dC, () => .08), { tIn: tP - .1 });
    ds.cbOpp = pc; ds.cbSalvo = tP + rr(4, 6); ds.cbSalvoN = 2; E.patrolLead = ds; E.arrP = dE0;
    for(let j = 0; j < 3; j++){ const e0 = dE0.clone().add(new V3(rr(-220, 220), rr(-140, 140), rr(-220, 220)));
      const e = engShip(E, 'fighter', 0, fighterPose(engEntry(chasePath(pf[j], rr(1.2, 1.8), rr(0, 6.3)), tP, tP + 4.5 + j*.8, e0)), { tIn: tP - .1, tOut: tF + 24 }); e.cbOpp = pf[j]; e.cbMis = R() < .6 ? tP + rr(5, 10) : -1; }
    E.ev.push({ t: tP, fn: () => { cbFlash(dE0, 420, 1.4, 0xa8ccff); if(window.__DEMO) __DEMO.toast('<span class="a">PATROL INBOUND</span> · ' + FACTIONS[facs[0]].name + ' destroyer and fighters <span class="c">— answering the distress call</span>'); } });
    E.ev.push({ t: tF, fn: () => { if(window.__DEMO && !E.over) __DEMO.toast('<span class="a">PIRATES WITHDRAWING</span> · <span class="c">breaking off at full thrust</span>'); } });
    E.R0 = 1300; E.civMul = .22;                                              // les pirates visent les moteurs : ils veulent le cargo, pas une épave
  } else if(kind === 'assault'){                                               // v7.15 : destroyer et 4 chasseurs contre un porte-vaisseaux militaire (défense rapprochée, pièce principale, 2 chasseurs)
    const c = car; c.eng = E; c.side = 0; c.armor = 5; c.noDisable = true; E.ships.push(c); E.sides[0].push(c); const h = hpOf(c); if(!h.shMax){ h.shMax = h.shield = 1; }
    const cT = t => toLocal(E, engFrame(E, t), c.traj(t).pos), sg = R() < .5 ? -1 : 1, fw = v(0, 0, -1);
    const D = rr(2600, 3200), base = new V3(sg*D, rr(-150, 250), rr(-300, 300)), dE0 = base.clone().add(new V3(sg*rr(2500, 3000), rr(-200, 200), rr(1500, 2500)));
    const hold = t => base.clone().add(new V3(50*Math.sin(.06*t), 20*Math.sin(.05*t + 1), 70*Math.sin(.035*t)));
    const ds = engShip(E, 'destroyer', 1, hullPose(engExit(engEntry(hold, tA, tA + 7, dE0), E.tB, new V3(sg, .15, .3).normalize(), 12), fw, t => t > E.tB ? .9 : .1), { tOut: E.tB + 40 });
    ds.cbOpp = c; ds.cbSalvo = tA + 7 + rr(2, 4); ds.cbSalvoN = 2; c.cbOpp = ds;
    const att = [], B = strafeB(c); for(let k = 0; k < 4; k++){ const ax = strafeAxes(new V3(rr(-.35, .35), rr(-.15, .15), 1).normalize()), path = strafePath(cT, rr(1100, 1400), B, rr(22, 28), rr(0, 6.3), ax[0], ax[1]);
      const t1 = tA + 5 + k*1.4, E0 = base.clone().add(new V3(-sg*rr(300, 800), rr(-250, 250), rr(-500, 500)));
      const f = engShip(E, 'fighter', 1, fighterPose(engExit(engEntry(path, t1 - 5, t1, E0), E.tB + k*.4, new V3(sg, rr(0, .3), rr(-.3, .3)).normalize(), 40)), { tOut: E.tB + 26 }); f.cbOpp = c; f.cbMis = R() < .8 ? tA + rr(9, 20) : -1; att.push(f); }
    for(let j = 0; j < 2; j++){ const ph = rr(0, 6.3), rx = rr(380, 460), rz = rr(480, 560), hy = rr(110, 170)*(j ? -1 : 1);
      const cap = t => cT(t).add(new V3(Math.cos(.24*t + ph)*rx, hy + 25*Math.sin(.3*t + ph), Math.sin(.24*t + ph)*rz));
      const e = engShip(E, 'fighter', 0, fighterPose(blendPath(cap, chasePath(att[j], rr(1.2, 1.8), rr(0, 6.3)), tA + 6 + j, 0, E.tB + 1))); e.cbOpp = att[j]; e.cbMis = R() < .5 ? tA + rr(12, 20) : -1; }
    E.R0 = D*.6; E.retreat = 1;
  }
  return E;
}
/* tir : traçante dans le repère (depuis la bouche, avec anticipation) ; touche décidée au départ, appliquée à l'arrivée */
function cbShoot(E, F, fromW, shooter, target, speed, len, col, hitP, dmg, spreadMiss){
  const T0 = T, tl = toLocal(E, F, target.traj(T).pos), fl = toLocal(E, F, fromW), flight = tl.distanceTo(fl)/speed, tpl = toLocal(E, F, target.traj(T + flight).pos);
  const hit = Math.random() < hitP, dir = tpl.sub(fl).normalize(); if(!hit){ const j = randUnitM().multiplyScalar(spreadMiss); dir.add(j).normalize(); }
  let tr = CBT.pool.find(t => T - t.t0 > t.life + .05); if(!tr){ if(CBT.pool.length >= CBT.N) return; tr = {}; CBT.pool.push(tr); }
  Object.assign(tr, { t0: T0, p0: fl, dir, speed, life: flight*(hit ? 1 : 1.5), len, col, hit, tg: target, dmg, done: false, sh: shooter });
}
function cbAim(sh, u, pW, dt){                                               // tourelle : pointage vers un point (monde) ; vrai si alignée
  const loc = sh.inner.worldToLocal(pW.clone()).sub(u.pos); if(u.ventral){ loc.x = -loc.x; loc.y = -loc.y; }
  const yawT = Math.atan2(-loc.x, -loc.z), pitT = Math.atan2(loc.y - u.pitch.position.y, Math.hypot(loc.x, loc.z));
  const k = Math.min(1, dt*(u.main ? 1.4 : 4)), dy = Math.atan2(Math.sin(yawT - u.yaw.rotation.y), Math.cos(yawT - u.yaw.rotation.y));
  u.yaw.rotation.y += dy*k; u.pitch.rotation.x += (clamp(pitT, -.2, 1.2) - u.pitch.rotation.x)*k;
  return Math.abs(dy) < .06 && pitT > -.25;
}
function cbMuzzle(u, n){ u.pitch.updateMatrixWorld(true); return u.pitch.localToWorld(new V3((n % 2 ? 1 : -1)*(u.main ? .95 : .42)*u.s/2, 0, -u.len)); }
function launchMissile(E, F, sh, target){
  const m = E.missiles.find(x => x.dead && T - x.tDead > 2) || (E.missiles.length < CBT.MN ? (E.missiles[E.missiles.length] = {}) : null); if(!m) return;
  const L = cbPose(sh, T), up = v(0, 1, 0).applyQuaternion(L.q), p0 = L.p.clone().addScaledVector(up, sh.len*(sh.model === 'fighter' ? -.05 : .08)).addScaledVector(v(1, 0, 0).applyQuaternion(L.q), (Math.random() - .5)*sh.len*.3);
  const v0 = (sh.model === 'fighter' ? velPose(t => cbPose(sh, t).p, T) : new V3()).add(up.multiplyScalar(sh.model === 'fighter' ? -20 : 70));
  Object.assign(m, { sh, tg: target, t0: T, p: p0, v: v0, dead: false, tDead: -9, trail: [], tLast: -9, killed: false, fuel: 16 });
  cbFlash(p0, sh.model === 'fighter' ? 4 : 14, .25, 0xffe0b0);
}
/* v7.16 : destruction — l'épave désemparée explose parfois (rupture du réacteur) : explosions secondaires, éclair, boule de feu,
   onde de choc, 20 à 40 débris, braises ; ralenti bref si c'est à l'image, puis la caméra change de sujet. Jamais : civils, porteur, drone-cible. */
const DESTROY_P = PARAMS.get('destroy'), SLOWMO = PARAMS.get('slowmo') !== '0', SLOW = { t0: -9, t1: -9, k: .3 }, HULLBREAK_P = PARAMS.get('hullbreak');
const _dm4 = new THREE.Matrix4(), _dq = new Q(), _dv = new V3(), _ds = new V3();
function slowK(t){ if(t < SLOW.t0 || t >= SLOW.t1) return 1; const x = (t - SLOW.t0)/(SLOW.t1 - SLOW.t0); return 1 - (1 - SLOW.k)*smooth(clamp(Math.min(x/.12, (1 - x)/.35), 0, 1)); }
function engDoom(E, sh){
  const hp = sh.hp; if(sh.civ || sh.noDisable || sh.isCarrier || sh.model === 'target' || DESTROY_P === '0' || hp.boom || (visit && (sh === visit.hero || sh === visit.departer))) return;
  const p = DESTROY_P === '1' ? 1 : ({ fighter: .6, corvette: .5, destroyer: .5 }[sh.model] || 0); if(Math.random() >= p) return;
  const big = sh.len > 60; hp.boom = T + rr0(big ? 4.5 : 2.5, big ? 8 : 5);
  if(big) hp.pre = [0, 1, 2, 3].slice(0, sh.len > 150 ? 4 : 2).map(i => ({ t: hp.boom - 1.5 + i*.36 + rr0(0, .15) }));      // explosions secondaires le long de la coque
  if(big && sh.craft && HULLBREAK_P !== '0' && (HULLBREAK_P === '1' || Math.random() < (sh.model === 'destroyer' ? .7 : .55))) hp.split = splitPrep(sh);   // v7.17 : la coque se brisera en tronçons
  if(shot && shot.subj !== sh && !shot.gal && (shot.subj && shot.subj.eng === E || big) && visit && T < visit.depStart - 6 && shot.t1 > hp.boom - 3) shot.t1 = Math.max(T + 1.2, hp.boom - 3.2);   // laisser le réalisateur venir sur l'épave (v7.17 : même hors plan d'engagement pour un gros vaisseau)
}
function fireball(E, pW, vW, R, n, grow){                                       // boule de feu : particules additives dans le repère co-mobile (ancre de l'engagement)
  const A = E.anchor, rel0 = pW.clone().sub(A.root.position);
  for(let i = 0; i < n; i++){ const d = randUnitM(), sp = R*(.35 + Math.random()*1.15);
    impPart({ k: 3, sh: A, rel: rel0.clone().addScaledVector(d, R*.12*Math.random()), vel: vW.clone().addScaledVector(d, sp), t0: T + Math.random()*.1, life: 1.0 + Math.random()*1.6, sz: R*(.14 + .26*Math.random()), grow: grow || (1.8 + Math.random()*1.4) }); }
}
function preBlast(E, F, sh){ const b = sh.craft ? sh.craft.box : sh.hull.box, off = sh.craft ? new V3() : (sh.com || new V3()), q = new V3(rr0(b.min.x, b.max.x), rr0(b.min.y, b.max.y), rr0(b.min.z, b.max.z)).sub(off);
  const pW = q.applyQuaternion(sh.root.quaternion).add(sh.root.position), vW = sh.cbDrift ? sh.cbDrift.v.clone().applyQuaternion(F.q) : new V3();
  fireball(E, pW, vW, sh.len*.14, 26, 1.6); smoke(E, pW, vW, sh.len*.15, 6); sparks(E.anchor, pW, 18, randUnitM(), Math.max(20, sh.len*.3), true); cbFlash(toLocal(E, F, pW), sh.len*.5, .3, 0xffd9a0); }
function debrisBurst(pL, vL, qL, sh, n, S0, box, r0){                    // débris : depuis toute la coque (box) ou autour d'un point (rayon r0)
  const len = sh.len, base = len*.05, F_ = sh.faction ? FACTIONS[sh.faction] : null, c0 = new THREE.Color(F_ ? F_.paint[0] : 0x555a60).multiplyScalar(.85), c1 = new THREE.Color(0x3a3632);
  const bx = sh.craft ? sh.craft.box : sh.hull.box, bo = sh.craft ? new V3() : (sh.com || new V3());
  for(let i = 0; i < n; i++){ const j = CBT.di++ % CBT.DN, d = CBT.debs[j], dir = randUnitM(), beam = Math.random() < .3;
    const hp_ = box ? new V3(rr0(bx.min.x, bx.max.x), rr0(bx.min.y, bx.max.y), rr0(bx.min.z, bx.max.z)).sub(bo).multiplyScalar(.8).applyQuaternion(qL) : dir.clone().multiplyScalar(r0*Math.random());
    d.t0 = T; d.life = rr0(30, 45); d.p.copy(pL).add(hp_); d.v.copy(vL).addScaledVector(hp_.lengthSq() > 1 ? hp_.clone().normalize().lerp(dir, .5).normalize() : dir, S0*(.25 + Math.random()*.9));
    d.ax.copy(randUnitM()); d.w = rr0(.3, 2.6)*(len > 150 ? .45 : 1); d.q0.setFromUnitVectors(v(0, 0, 1), randUnitM());
    const k = Math.random() < .15 ? 1.8 : (Math.random() < .5 ? .45 : 1); d.s.set(base*(beam ? .22 : rr0(.4, 1.5))*k, base*(beam ? .22 : rr0(.08, .3))*k, base*(beam ? rr0(1, 2.6) : rr0(.4, 1.6))*k);
    CBT.deb.setColorAt(j, c0.clone().lerp(c1, Math.random())); }
}
function explode(E, F, sh, fx){
  const hp = sh.hp; hp.dead = true; hp.tDead = T; const h0 = sh.hideAt; sh.hideAt = t => t >= hp.tDead || (h0 ? h0(t) : false);
  const brk = hp.split ? breakHull(E, F, sh) : null;                         // v7.17 : la coque se brise en tronçons (créés même sans effets)
  if(!fx) return;                                                             // image sautée (accéléré, test sans rendu) : disparition sèche
  const L = cbPose(sh, T), pL = L.p.clone(), vL = sh.cbDrift ? sh.cbDrift.v.clone() : new V3(), pW = toWorld(F, pL), vW = vL.clone().applyQuaternion(F.q), len = sh.len;
  const r = CBT.rings[CBT.ri++ % CBT.rings.length]; r.t0 = T; r.loc = pL.clone(); r.m.quaternion.setFromUnitVectors(v(0, 0, 1), randUnitM());
  if(brk){ brk.cuts.forEach(c => { const Rf = Math.max(c.r*1.2, len*.26); fireball(E, c.pW, vW, Rf, 80, 2.2); smoke(E, c.pW, vW, Rf*1.1, 16); sparks(E.anchor, c.pW, 40, c.nW, Math.max(25, len*.35), true);   // rupture : feu et débris à chaque cassure
      cbFlash(c.pL, len*1.9 + 40, .55, 0xfff0d0); debrisBurst(c.pL, vL, L.q, sh, 12, len > 150 ? 30 : 36, false, c.r); });
    r.dur = 1.1 + len/320; r.R = Math.max(70, len*1.7); }
  else { fireball(E, pW, vW, Math.max(5, len*.55), Math.round(clamp(40 + len*.4, 50, 160))); smoke(E, pW, vW, Math.max(5, len*.6), len > 150 ? 36 : (len > 60 ? 28 : 18));
    sparks(E.anchor, pW, Math.round(clamp(20 + len*.2, 24, 70)), randUnitM(), Math.max(30, len*.9), true);   // braises
    cbFlash(pL, len*3.2 + 40, .6, 0xfff2d8); r.dur = 1.3 + len/260; r.R = Math.max(80, len*2.8);
    debrisBurst(pL, vL, L.q, sh, len > 150 ? 40 : (len > 60 ? 30 : 22), len > 150 ? 38 : (len > 60 ? 34 : 45), true, 0); }
  if(window.__DEMO && len > 60) __DEMO.toast('<span class="a">DESTROYED</span> · ' + String(sh.name).replace(/[&<>]/g, '') + ' <span class="c">— ' + sh.model + (brk ? ', hull broken in ' + (brk.n === 3 ? 'three' : 'two') : ', reactor breach') + '</span>');
  const inView = (() => { const d = pW.clone().sub(cam.position), dd = d.length(); if(dd > len*30 + 1500) return false; const f = new V3(); cam.getWorldDirection(f); return d.normalize().dot(f) > Math.cos(cam.fov*.55*Math.PI/180*1.4); })();
  if(shot && (shot.subj === sh || inView)){ if(SLOWMO){ SLOW.t0 = T; SLOW.t1 = T + (len > 60 ? 1.5 : 1.0); SLOW.k = .28; }
    if(shot.subj === sh || (shot.subj && shot.subj.cbOpp === sh)) shot.t1 = Math.min(shot.t1, T + (len > 60 ? 3.2 : 2.2)); }   // on reste sur l'explosion, puis la caméra change de sujet
}
/* v7.17 : coque brisée — découpe des triangles (repère du modèle) selon 1 ou 2 plans de cassure inclinés et bruités, préparée pendant la
   phase d'épave ; à l'explosion, chaque tronçon (un maillage par matériau) dérive et tourne autour de son propre centre ; cassure
   incandescente (fond sombre + halo) qui fume et crache des étincelles, puis couve. Les tronçons restent jusqu'au départ du système. */
function splitPrep(sh){
  const G = sh.craft.group, b = sh.craft.box, zs = b.max.z - b.min.z, two = sh.len > 150 && Math.random() < .45;
  const us = two ? [rr0(.28, .42), rr0(.58, .72)] : [rr0(.36, .64)];
  const cuts = us.map(u => ({ z: b.min.z + zs*u, n: new V3(rr0(-.35, .35), rr0(-.3, .3), 1).normalize(), x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, cnt: 0 }));
  const amp = Math.max(b.max.x - b.min.x, b.max.y - b.min.y)*.28, ph = Math.random()*10, band = Math.max(4, zs*.035);
  const dist = (c, x, y, z) => x*c.n.x + y*c.n.y + (z - c.z)*c.n.z;
  const secOf = (x, y, z) => { const j = amp*(.5*Math.sin(x*.21 + y*.33 + ph) + .35*Math.sin(y*.17 - z*.11 + 1.3*ph) + .3*Math.sin(x*.07 + z*.41 + 2*ph)); let k = 0; cuts.forEach(c => { if(dist(c, x, y, z) + j > 0) k++; }); return k; };
  G.updateMatrixWorld(true); const gi = new THREE.Matrix4().copy(G.matrixWorld).invert(), jobs = [];
  G.traverse(o => { if(!o.isMesh || !o.geometry || !o.geometry.attributes.position) return; const u = o.userData; if(u.portal || (u.noFrame && !u.glass) || Array.isArray(o.material)) return; jobs.push({ m: o, rel: new THREE.Matrix4().multiplyMatrices(gi, o.matrixWorld) }); });
  return { cuts, dist, secOf, band, jobs, i: 0, n: cuts.length + 1, acc: new Map(), cen: us.concat([0]).map(() => ({ x: 0, y: 0, z: 0, w: 0 })), ready: false, tris: 0, ms: 0, meshes: null };
}
function splitStep(S, budget){
  const t0 = performance.now(), v_ = new V3();
  while(S.i < S.jobs.length && budget > 0){ const { m, rel } = S.jobs[S.i++], g0 = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry, pos = g0.attributes.position, nT = Math.floor(pos.count/3);
    const side = new Uint8Array(nT), cnt = new Array(S.n).fill(0);
    for(let t = 0; t < nT; t++){ let cx = 0, cy = 0, cz = 0; for(let k = 0; k < 3; k++){ v_.fromBufferAttribute(pos, t*3 + k).applyMatrix4(rel); cx += v_.x; cy += v_.y; cz += v_.z; } cx /= 3; cy /= 3; cz /= 3;
      const sc = S.secOf(cx, cy, cz); side[t] = sc; cnt[sc]++; const C = S.cen[sc]; C.x += cx; C.y += cy; C.z += cz; C.w++;
      S.cuts.forEach(c => { if(Math.abs(S.dist(c, cx, cy, cz)) < S.band){ c.x0 = Math.min(c.x0, cx); c.x1 = Math.max(c.x1, cx); c.y0 = Math.min(c.y0, cy); c.y1 = Math.max(c.y1, cy); c.cnt++; } }); }
    const keys = Object.keys(g0.attributes).sort(), sig = m.material.uuid + '|' + m.renderOrder + '|' + keys.map(k => k + g0.attributes[k].itemSize).join(',');
    for(let sc = 0; sc < S.n; sc++){ if(!cnt[sc]) continue; const g = new THREE.BufferGeometry();
      keys.forEach(k => { const A = g0.attributes[k], is = A.itemSize, out = new A.array.constructor(cnt[sc]*3*is); let o = 0; for(let t = 0; t < nT; t++){ if(side[t] !== sc) continue; out.set(A.array.subarray(t*3*is, (t + 1)*3*is), o); o += 3*is; } g.setAttribute(k, new THREE.BufferAttribute(out, is, A.normalized)); });
      g.applyMatrix4(rel); const key = sc + '|' + sig; if(!S.acc.has(key)) S.acc.set(key, { sc, mat: m.material, ro: m.renderOrder, keys, list: [] }); S.acc.get(key).list.push(g); }
    if(g0 !== m.geometry) g0.dispose(); budget -= nT; S.tris += nT; }
  if(S.i >= S.jobs.length && !S.ready){                                      // fusion par tronçon et par matériau : moins d'appels que le vaisseau intact
    S.meshes = []; S.acc.forEach(A => { const g = new THREE.BufferGeometry();
      A.keys.forEach(k => { const L = A.list.map(x => x.attributes[k]), n = L.reduce((a, x) => a + x.array.length, 0), out = new L[0].array.constructor(n); let o = 0; L.forEach(x => { out.set(x.array, o); o += x.array.length; }); g.setAttribute(k, new THREE.BufferAttribute(out, L[0].itemSize, L[0].normalized)); });
      A.list.forEach(x => x.dispose()); g.computeBoundingSphere(); S.meshes.push({ sc: A.sc, g, mat: A.mat, ro: A.ro }); });
    S.acc.clear(); S.ready = true; }
  S.ms += performance.now() - t0;
}
const HULK = { capM: null, _q: new Q(), _v: new V3() };
function breakHull(E, F, sh){
  const S = sh.hp.split; if(!S.ready) splitStep(S, 1e9);
  const inner = sh.inner, qi = F.q.clone().invert(); sh.root.updateMatrixWorld(true);
  const posL = toLocal(E, F, sh.root.position), qL = qi.multiply(sh.root.quaternion), vL = sh.cbDrift ? sh.cbDrift.v.clone() : new V3(), tb = sh.hp.tumble;
  const toR = pG => pG.clone().multiply(inner.scale).applyQuaternion(inner.quaternion).add(inner.position);   // repère modèle → repère du vaisseau
  const wL = tb ? tb.axis.clone().applyQuaternion(qL).multiplyScalar(tb.w) : new V3();                        // rotation de l'épave (repère de l'engagement)
  if(!HULK.capM) HULK.capM = new THREE.MeshBasicMaterial({ color: 0x060504, side: THREE.DoubleSide });
  const b = sh.craft.box, cutsInfo = S.cuts.map(c => { const has = c.cnt > 3, cx = has ? (c.x0 + c.x1)/2 : (b.min.x + b.max.x)/2, cy = has ? (c.y0 + c.y1)/2 : (b.min.y + b.max.y)/2;
    const hx = Math.max(2, has ? (c.x1 - c.x0)/2 : (b.max.x - b.min.x)/2), hy = Math.max(2, has ? (c.y1 - c.y0)/2 : (b.max.y - b.min.y)/2), cz = c.z - (c.n.x*cx + c.n.y*cy)/c.n.z;
    return { cG: new V3(cx, cy, cz), n: c.n, hx, hy }; });
  const H = { E, sh, t0: T, secs: [], n: S.n, shown: 0, nextOk: -9 }, cutsOut = [];
  for(let sc = 0; sc < S.n; sc++){ const C = S.cen[sc]; if(!C.w) continue;
    const cG = new V3(C.x/C.w, C.y/C.w, C.z/C.w), cR = toR(cG), pivot = new THREE.Group(), cont = new THREE.Group();
    cont.position.copy(inner.position).sub(cR); cont.quaternion.copy(inner.quaternion); cont.scale.copy(inner.scale); pivot.add(cont);
    S.meshes.filter(x => x.sc === sc).forEach(x => { const m = new THREE.Mesh(x.g, x.mat); m.renderOrder = x.ro; cont.add(m); });
    const glows = [];
    [sc - 1, sc].forEach((ci, side) => { const ct = cutsInfo[ci]; if(!ct) return; const sg = side === 0 ? 1 : -1;   // cassure avant (côté +n = intérieur) ou arrière
      const cap = new THREE.Mesh(new THREE.CircleGeometry(1, 22), HULK.capM); cap.position.copy(ct.cG).addScaledVector(ct.n, sg*1.5); cap.quaternion.setFromUnitVectors(v(0, 0, 1), ct.n); cap.scale.set(ct.hx*.9, ct.hy*.9, 1); cont.add(cap);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff8a3a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 1 }));
      sp.position.copy(ct.cG).addScaledVector(ct.n, -sg*.6); sp.scale.setScalar(Math.max(ct.hx, ct.hy)*2.5); sp.renderOrder = 10; cont.add(sp);
      glows.push({ sp, ph: Math.random()*6.3, r: Math.max(ct.hx, ct.hy), nG: ct.n.clone().multiplyScalar(-sg) }); sp.scale.setScalar(Math.max(ct.hx, ct.hy, sh.len*.06)*2.6);
      if(side === 0){ const pR = toR(ct.cG), pLc = posL.clone().add(pR.applyQuaternion(qL)), nL = ct.n.clone().applyQuaternion(inner.quaternion).applyQuaternion(qL);
        cutsOut.push({ pL: pLc, pW: toWorld(F, pLc), nW: nL.clone().applyQuaternion(F.q), r: Math.max(ct.hx, ct.hy) }); } });
    const k = sc - (S.n - 1)/2, nAx = S.cuts[0].n.clone().applyQuaternion(inner.quaternion).applyQuaternion(qL), rL = cR.clone().applyQuaternion(qL);
    const vS = vL.clone().add(new V3().crossVectors(wL, rL)).addScaledVector(nAx, k*(sh.len > 150 ? rr0(5, 9) : rr0(6, 11))).add(randUnitM().multiplyScalar(1.2));   // les tronçons s'écartent
    const ax = new V3(rr0(-1, 1), rr0(-1, 1), rr0(-.25, .25)).normalize(), w = rr0(.025, .07)*(k < 0 ? -1 : 1)*(sh.len > 150 ? .8 : 1.2);
    pivot.position.copy(posL).add(rL); pivot.quaternion.copy(qL); CBT.grp.add(pivot);
    H.secs.push({ pivot, cont, p0: pivot.position.clone(), q0: qL.clone(), v: vS, ax, w, tAx: tb ? tb.axis.clone() : null, tw: tb ? tb.w : 0, glows }); }
  H.axisL = v(0, 0, 1).applyQuaternion(inner.quaternion).applyQuaternion(qL);
  H.centerL = t => { const c = new V3(); H.secs.forEach(x => c.add(x.p0).addScaledVector(x.v, t - H.t0)); return c.multiplyScalar(1/H.secs.length); };
  H.spread = t => { let m = 0; H.secs.forEach(a => H.secs.forEach(b2 => { m = Math.max(m, a.p0.clone().addScaledVector(a.v, t - H.t0).distanceTo(b2.p0.clone().addScaledVector(b2.v, t - H.t0))); })); return m; };
  H.subj = { name: sh.name, type: 'Wreck · ' + (sh.type || sh.model), model: 'hulk', len: sh.len, eng: E, leg: sh.leg, hk: H, faction: sh.faction, root: new THREE.Object3D(), thr: { value: 0 }, mil: true,
    traj: t => { const F2 = engFrame(E, t); return { pos: toWorld(F2, H.centerL(t)), q: F2.q.clone(), nose: v(0, 0, -1).applyQuaternion(F2.q), up: v(0, 1, 0).applyQuaternion(F2.q), throttle: 0, seg: 'hulk' }; } };
  H.subj.root.position.copy(toWorld(F, H.centerL(T))); CBT.hulks.push(H);
  return { n: H.secs.length, cuts: cutsOut };
}
function updateHulks(E, F, dt){                                               // tronçons : dérive, rotation, cassure incandescente puis couvante, fumée et étincelles les 9 premières secondes
  let emit = false;
  CBT.hulks.forEach(H => { if(H.E !== E) return; const a = T - H.t0;
    H.secs.forEach(S_ => { S_.pivot.position.copy(S_.p0).addScaledVector(S_.v, a); S_.pivot.quaternion.copy(S_.q0); if(S_.tw) S_.pivot.quaternion.multiply(HULK._q.setFromAxisAngle(S_.tAx, S_.tw*a)); S_.pivot.quaternion.multiply(HULK._q.setFromAxisAngle(S_.ax, S_.w*a));
      S_.glows.forEach(g => { const x = Math.min(1, a/20), k = 1 - .62*smooth(x), fl = .78 + .22*Math.sin(T*17 + g.ph)*Math.sin(T*5.3 + g.ph*2);   // incandescente puis couvante
        g.sp.material.opacity = k*fl*.8; g.sp.material.color.setRGB(.95, .5 - .26*x, .17 - .12*x); }); });
    if(a < 9 && dt > 0 && dt < .2 && Math.random() < dt*7) emit = H; H.subj.root.position.copy(toWorld(F, H.centerL(T))); });
  if(emit){ CBT.grp.updateMatrixWorld(true); const S_ = emit.secs[Math.floor(Math.random()*emit.secs.length)], g = S_.glows[Math.floor(Math.random()*S_.glows.length)];
    if(g){ const pW = g.sp.getWorldPosition(new V3()), nW = g.nG.clone().transformDirection(S_.cont.matrixWorld), vW = S_.v.clone().applyQuaternion(F.q);
      sparks(E.anchor, pW, 5, nW, Math.max(12, g.r*1.5), true); if(Math.random() < .55) smoke(E, pW.clone().addScaledVector(nW, g.r*.3), vW.addScaledVector(nW, g.r*.25), g.r*.55, 1); } }
}
function clearHulks(keepE){ CBT.hulks = CBT.hulks.filter(H => { if(H.E === keepE) return true;
  H.secs.forEach(S_ => { S_.cont.traverse(o => { if(o.isMesh && o.geometry) o.geometry.dispose(); if(o.isSprite) o.material.dispose(); }); S_.pivot.parent && S_.pivot.parent.remove(S_.pivot); }); return false; }); }
function engOver(E){ if(E.over) return; const dn = s => s.hp && s.hp.disabled;
  for(let sd = 0; sd < 2; sd++){ const m = E.sides[sd].filter(s => !s.civ && !s.noDisable); if(m.length && m.every(dn) && !(sd === 0 && E.sides[0].some(s => s.noDisable))){ E.over = true; E.winner = 1 - sd; E.tOver = T; return; } }
  if(E.kind === 'raid' && T >= E.tF + 5){ E.over = true; E.winner = 0; E.tOver = T; E.fled = true; return; }            // v7.15 : pirates en fuite
  if(E.retreat != null && T >= E.tB){ E.over = true; E.winner = 1 - E.retreat; E.tOver = T; E.withdrawn = true; } }   // v7.15 : les assaillants se replient
/* v7.15 : cibles — l'adversaire désigné, sinon le plus proche (même catégorie civil / militaire de préférence) ; tir de barrage */
function cbAlive(s){ return !!s && s.root.visible && !(s.hp && s.hp.disabled) && !(s.hideAt && s.hideAt(T)); }
function cbTarget(E, sh){ const o = sh.cbOpp; if(cbAlive(o)) return o; const P = sh.root.position; let best = null, bd = Infinity;
  E.sides[1 - sh.side].forEach(s => { if(!cbAlive(s)) return; const d = s.root.position.distanceToSquared(P)*(o && !!s.civ !== !!o.civ ? 4 : 1); if(d < bd){ bd = d; best = s; } }); return best; }
function cbFlak(E, sh){ const P = sh.root.position; let best = null, bd = 1100*1100; E.sides[1 - sh.side].forEach(s => { if(!cbAlive(s)) return; const d = s.root.position.distanceToSquared(P)*(s.model === 'fighter' ? 1 : 2.5); if(d < bd){ bd = d; best = s; } }); return best; }
const ENG_NAMES = { skirmish: 'fighter skirmish', duel: 'line duel', convoy: 'convoy attack', raid: 'pirate raid', assault: 'carrier assault' };
function engTitle(E){ const a = FACTIONS[E.facs[0]].name, b = FACTIONS[E.facs[1]].name;
  const t = E.kind === 'convoy' ? 'Convoy attack · ' + b + ' raiders vs ' + a + ' escort' : E.kind === 'raid' ? 'Pirate raid · ' + (T >= E.tP ? a + ' patrol engaging' : 'freighter under attack')
    : E.kind === 'assault' ? 'Carrier assault · ' + b + ' strike on a ' + a + ' carrier' : 'Engagement · ' + a + ' vs ' + b;
  return t + (E.over ? ' — ' + (E.fled ? 'pirates driven off' : E.withdrawn ? b + ' withdraw' : FACTIONS[E.facs[E.winner]].name + ' prevails') : ''); }
function engOverMsg(E){ const a = FACTIONS[E.facs[E.winner]].name, l = FACTIONS[E.facs[1 - E.winner]].name;
  if(E.fled) return '<span class="a">PIRATES DRIVEN OFF</span> · <span class="c">' + FACTIONS[E.facs[0]].name + ' patrol secures the freighter</span>';
  if(E.withdrawn) return '<span class="a">ENGAGEMENT OVER</span> · <span class="c">' + l + ' withdraw — ' + a + ' holds</span>';
  return '<span class="a">ENGAGEMENT OVER</span> · <span class="c">' + a + ' prevails</span>'; }
/* une image d'engagement : pointage, tirs, missiles, défense rapprochée, traçantes, rendu */
function updateEngagement(E, dt){
  if(!CBT.grp) buildCombatFx();
  const F = engFrame(E, T), live = E.leg === (visit && visit.leg) && ((T >= E.tA - 3 && T < E.tB + 30) || CBT.hulks.some(H => H.E === E));   // v7.17 : les épaves brisées restent
  E.anchor.root.position.copy(F.pos); E.anchor.root.quaternion.copy(F.q);        // pseudo-vaisseau des éclats en espace libre (co-mobile)
  const fire = T >= E.tA + 2 && T < E.tB && !E.over && rateAt(T) < 3 && dt > 0 && dt < .2;
  if(fire) E.ships.forEach(sh => { if(!sh.root.visible || sh.civ) return; const hp = hpOf(sh); if(hp.disabled || (sh.cbStop && T > sh.cbStop) || (sh.hideAt && sh.hideAt(T))) return;
    const tgt = cbTarget(E, sh); if(!tgt) return;
    if(sh.model === 'fighter'){                                             // canons fixes : dans l'axe et à portée
      const st = sh.traj(T), f = frameOf(st.q), rel = tgt.root.position.clone().sub(st.pos), d = rel.length(), big = tgt.len > 90;
      if(d < 1150 + tgt.len*.5 && rel.normalize().dot(f.fwd) > .94 && ((T + sh.len*.37 + sh.side) % 1.4) < .7){ const n = Math.floor(T*14); if(sh.cbLast !== n){ sh.cbLast = n;
        const mz = st.pos.clone().addScaledVector(f.fwd, sh.len*.5).addScaledVector(f.right, (n % 2 ? 1 : -1)*1.4);
        cbShoot(E, F, mz, sh, tgt, 1700, 22, sh.side ? [1.5, .7, .3] : [1.4, 1, .45], big ? .7 : .45, .05*(tgt.civ ? (E.civMul || 1) : 1), .05); hp.energy = Math.max(0, hp.energy - .0012); } }
      if(sh.cbMis > 0 && T > sh.cbMis){ sh.cbMis = -1; if(d < 1800 + tgt.len) launchMissile(E, F, sh, tgt); }
    } else {                                                                // destroyer, corvette, porteur : pièces principales vers l'ennemi, défense rapprochée vers les missiles (sinon barrage)
      sh.root.updateMatrixWorld(true);
      const inbound = E.missiles.filter(m => !m.dead && m.tg === sh).map(m => ({ m, w: toWorld(F, m.p) })).filter(x => x.w.distanceTo(sh.root.position) < 2200), flk = inbound.length ? null : cbFlak(E, sh);
      sh.craft.turrets.forEach((u, i) => {
        if(u.main){ if(tgt.model === 'fighter') return; const flight = tgt.root.position.distanceTo(sh.root.position)/1300, aimP = tgt.traj(T + flight).pos;
          if(cbAim(sh, u, aimP, dt)){ const n = Math.floor((T + i*1.3)/(sh.isCarrier ? 2.2 : 2.8)), key = 'm' + i; if(sh.cbFired && sh.cbFired[key] !== n){ cbShoot(E, F, cbMuzzle(u, n), sh, tgt, 1300, 60, [.55, .8, 1.3], .6, (sh.isCarrier ? .08 : .05)*(tgt.civ ? (E.civMul || 1) : 1), .012);
            cbFlash(toLocal(E, F, cbMuzzle(u, n)), 9*u.s/1.4, .07, 0xbfe0ff); hp.energy = Math.max(0, hp.energy - .012); } (sh.cbFired = sh.cbFired || {})[key] = n; } }
        else { const x = inbound[i % Math.max(1, inbound.length)];
          if(x && cbAim(sh, u, x.w, dt) && ((T + i*.37) % 1.1) < .6){ const n = Math.floor(T*13), key = 'p' + i; if(!sh.cbFired || sh.cbFired[key] !== n){ (sh.cbFired = sh.cbFired || {})[key] = n;
              const mz = cbMuzzle(u, n), fl = toLocal(E, F, mz), dir = x.m.p.clone().sub(fl).normalize().add(randUnitM().multiplyScalar(.02)).normalize();
              let tr = CBT.pool.find(t => T - t.t0 > t.life + .05); if(!tr && CBT.pool.length < CBT.N){ tr = {}; CBT.pool.push(tr); }
              if(tr) Object.assign(tr, { t0: T, p0: fl, dir, speed: 1900, life: x.m.p.distanceTo(fl)/1900, len: 16, col: [1.4, .8, .3], hit: false, tg: null, dmg: 0, done: true, sh });
              if(Math.random() < dt*.18) x.m.killed = true; } }       // ≈ 1 missile sur 2 intercepté par deux tourelles engagées
          else if(!x && flk && ((T + i*.37) % 1.1) < .55 && cbAim(sh, u, flk.traj(T + flk.root.position.distanceTo(sh.root.position)/1900).pos, dt)){ const n = Math.floor(T*9), key = 'f' + i;   // v7.15 : barrage
            if(!sh.cbFired || sh.cbFired[key] !== n){ (sh.cbFired = sh.cbFired || {})[key] = n; cbShoot(E, F, cbMuzzle(u, n), sh, flk, 1900, 16, [1.4, .8, .3], flk.model === 'fighter' ? .1 : .5, .02*(flk.civ ? (E.civMul || 1) : 1), .04); } } } });
      if(sh.cbSalvo > 0 && T > sh.cbSalvo){ const ev = sh.cbEvery || [8, 12]; sh.cbSalvo = T + rr0(ev[0], ev[1]); for(let k = 0; k < (sh.cbSalvoN || 2); k++) launchMissile(E, F, sh, tgt); }
    } });
  // missiles : guidage, traînée, impact, interception
  E.missiles.forEach(m => { if(m.dead || !m.sh) return; const age = T - m.t0;
    if(dt > 0){ const tg = m.tg, tp = toLocal(E, F, tg.traj(T).pos), tv = velPose(t => toLocal(E, engFrame(E, t), tg.traj(t).pos), T), sp = m.v.length(), tgo = tp.distanceTo(m.p)/Math.max(200, sp);
      const want = tp.clone().addScaledVector(tv, tgo).sub(m.p).normalize(), cur = sp > 1 ? m.v.clone().normalize() : want, turn = Math.min(1, dt*(age < .6 ? .6 : 3.2));
      const nd = cur.lerp(want, turn).normalize(), ns = Math.min(820, sp + dt*(age < .5 ? 60 : 300)), p0 = m.p.clone(); m.v.copy(nd.multiplyScalar(ns)); m.p.addScaledVector(m.v, dt);
      if(T - m.tLast > .1){ m.tLast = T; m.trail.unshift(m.p.clone()); if(m.trail.length > CBT.TR) m.trail.pop(); }
      const seg = m.p.clone().sub(p0), sl = seg.lengthSq(), tt = sl > 0 ? clamp(tp.clone().sub(p0).dot(seg)/sl, 0, 1) : 1, dHit = p0.clone().addScaledVector(seg, tt).distanceTo(tp);   // test balayé (700 m/s : 23 m par image)
      if(m.killed){ m.dead = true; m.tDead = T; cbFlash(m.p, 18, .35, 0xffd090); sparks(E.anchor, toWorld(F, m.p), 14, randUnitM(), 40, false); }
      else if(!(tg.hp && tg.hp.dead) && (tg.len > 60 ? segBox(tg, toWorld(F, p0), toWorld(F, m.p), 6) : dHit < Math.max(8, tg.len*.45)) && !(tg.hp && tg.hp.disabled && Math.random() < .5)){ m.dead = true; m.tDead = T; const pw = toWorld(F, m.p), dw = m.v.clone().normalize().applyQuaternion(F.q);
        hitShip(tg, (m.sh.model === 'fighter' ? .3 : .12)*(tg.civ ? (E.civMul || 1) : 1), hullEntry(tg, pw.clone().addScaledVector(dw, -tg.len), dw), dw); cbFlash(m.p, tg.len*.5 + 20, .5, 0xffe6c0); }
      else if(age > m.fuel){ m.dead = true; m.tDead = T; cbFlash(m.p, 14, .3, 0xffd090); } } });
  E.ships.forEach(sh => { const hp = sh.hp; if(!hp || !hp.boom || hp.dead || sh.leg !== (visit && visit.leg)) return;   // v7.16 : explosions en chaîne puis destruction
    if(hp.split && !hp.split.ready) splitStep(hp.split, 2500);                // v7.17 : découpe étalée sur plusieurs images (aucun à-coup)
    if(hp.pre) hp.pre.forEach(q => { if(!q.done && T >= q.t){ q.done = true; if(dt > 0 && dt < .2) preBlast(E, F, sh); } });
    if(T >= hp.boom) explode(E, F, sh, dt > 0 && dt < .2 && T - hp.boom < 1); });
  engOver(E);
  E.ev.forEach(e => { if(!e.done && T >= e.t){ e.done = true; if(T - e.t < 2) e.fn(); } });           // v7.15 : jalons (arrivée de la patrouille, fuite)
  if(E.over && !E.msg.over && window.__DEMO){ E.msg.over = true; __DEMO.toast(engOverMsg(E)); }
  // rendu (repère local)
  CBT.grp.visible = live; if(!live) return;
  CBT.grp.position.copy(F.pos); CBT.grp.quaternion.copy(F.q); CBT.grp.userData.center.copy(F.pos); CBT.grp.userData.r = E.R0*2 + 3000 + (CBT.hulks.length ? 12*(T - E.tA) : 0);
  updateHulks(E, F, dt);                                                      // v7.17
  const pa = CBT.pos, ca = CBT.col, ha = CBT.hpos, hc = CBT.hcol; let j = 0;
  CBT.pool.forEach(t => { const a = T - t.t0; if(a < 0 || a > t.life){ if(t.hit && !t.done && a > t.life){ t.done = true;
        if(t.tg && t.tg.root.visible){ const pw = toWorld(F, t.p0.clone().addScaledVector(t.dir, t.speed*t.life)), dw = t.dir.clone().applyQuaternion(F.q), sh0 = hpOf(t.tg).shield > .02;
          hitShip(t.tg, t.dmg, hullEntry(t.tg, t.tg.root.position.clone().addScaledVector(dw, -t.tg.len*2).add(randUnitM().multiplyScalar(t.tg.len*.12)), dw), dw);
          cbFlash(toLocal(E, F, t.tg.root.position).addScaledVector(t.dir, -t.tg.len*.3), (t.len > 40 ? 18 : 6)*(sh0 ? 1.2 : .7), .3, sh0 ? 0xcfe8ff : 0xffc080); } }
      return; }
    const hd = t.p0.clone().addScaledVector(t.dir, t.speed*a), tl = hd.clone().addScaledVector(t.dir, -Math.min(t.len, t.speed*a)), c = t.col;
    pa.set([tl.x, tl.y, tl.z, hd.x, hd.y, hd.z], j*6); ca.set([c[0]*.12, c[1]*.12, c[2]*.12, c[0], c[1], c[2]], j*6); ha.set([hd.x, hd.y, hd.z], j*3); hc.set([c[0]*.7, c[1]*.7, c[2]*.7], j*3); j++; });
  for(let k = j; k < CBT.N; k++) pa.fill(0, k*6, k*6 + 6);
  [CBT.lines, CBT.heads].forEach((o, i) => { o.geometry.attributes.position.needsUpdate = true; o.geometry.attributes.color.needsUpdate = true; o.geometry.setDrawRange(0, i ? j : j*2); });
  let mi = 0, hi = 0; const mp = CBT.mPos, mc = CBT.mCol;
  E.missiles.forEach(m => { if(!m.sh || (m.dead && T - m.tDead > 1.2)) return; const fade = m.dead ? clamp(1 - (T - m.tDead)/1.2, 0, 1) : 1, tr = m.dead ? m.trail : [m.p].concat(m.trail);
    for(let k = 0; k < tr.length - 1 && mi < CBT.MN*(CBT.TR - 1); k++){ const a = tr[k], b = tr[k + 1], f0 = fade*(1 - k/CBT.TR)*.5, f1 = fade*(1 - (k + 1)/CBT.TR)*.5;
      mp.set([a.x, a.y, a.z, b.x, b.y, b.z], mi*6); mc.set([.9*f0, .85*f0, .8*f0, .9*f1, .85*f1, .8*f1], mi*6); mi++; }
    if(!m.dead){ CBT.mhPos.set([m.p.x, m.p.y, m.p.z], hi*3); CBT.mhCol.set([1.6, 1.2, .8], hi*3); hi++; } });
  for(let k = mi; k < CBT.MN*(CBT.TR - 1); k++) mp.fill(0, k*6, k*6 + 6);
  CBT.mLines.geometry.attributes.position.needsUpdate = true; CBT.mLines.geometry.attributes.color.needsUpdate = true; CBT.mLines.geometry.setDrawRange(0, mi*2);
  CBT.mHeads.geometry.attributes.position.needsUpdate = true; CBT.mHeads.geometry.attributes.color.needsUpdate = true; CBT.mHeads.geometry.setDrawRange(0, hi);
  CBT.flashes.forEach(f => { const a = (T - f.t0)/f.dur; if(a < 0 || a > 1){ f.sp.visible = false; return; } f.sp.visible = true; f.sp.position.copy(f.loc); f.sp.scale.setScalar(f.size*(.4 + .6*Math.sqrt(a))); f.sp.material.opacity = (1 - a)*(1 - a); });
  CBT.rings.forEach(r => { const a = (T - r.t0)/r.dur; if(a < 0 || a > 1){ r.m.visible = false; return; } r.m.visible = true; r.m.position.copy(r.loc); r.m.scale.setScalar(Math.max(.01, r.R*(1 - Math.pow(1 - a, 3))));   // v7.16
    r.m.material.uniforms.uA.value = 1.0*Math.pow(1 - a, 2.0); });
  const D = CBT.deb, M4 = _dm4, qd = _dq; let top = 0;                           // v7.16 : débris — trajectoire libre, rotation, disparition en fondu d'échelle
  CBT.debs.forEach((d, i) => { const a = T - d.t0; if(a < 0 || a > d.life){ if(i < D.count){ M4.makeScale(0, 0, 0); D.setMatrixAt(i, M4); } return; } top = i + 1;
    qd.setFromAxisAngle(d.ax, d.w*a).premultiply(d.q0); const k = a > d.life - 3 ? (d.life - a)/3 : 1; M4.compose(_dv.copy(d.p).addScaledVector(d.v, a), qd, _ds.copy(d.s).multiplyScalar(k)); D.setMatrixAt(i, M4); });
  if(top || D.count){ D.count = top; D.instanceMatrix.needsUpdate = true; if(D.instanceColor) D.instanceColor.needsUpdate = true; }
}
function engCenter(E, T){ const c = new V3(); let n = 0; E.ships.forEach(s => { if(T < E.tA - 3 || (s.hideAt && s.hideAt(T))) return; c.add(s.traj(T).pos); n++; }); return n ? c.multiplyScalar(1/n) : engFrame(E, T).pos; }
function engFactions(leg){ const a = legFaction(leg), b = R() < .35 ? 'irregular' : (a === 'coalition' ? 'league' : 'coalition'); return [a, b]; }
function startEngagement(vis, kind, tA, dur){
  const leg = vis.leg, E = makeEngagement(leg, kind, tA, dur, engFactions(leg)); if(!E) return null;
  E.anchor = { root: new THREE.Object3D(), len: 60, isAnchor: true };
  IMP.parts.forEach(p => { if(p.sh && p.sh.isAnchor) p.t0 = -99; }); SMK.parts.forEach(p => { if(p.sh && p.sh.isAnchor) p.t0 = -99; });   // v7.16 : rien ne reste de l'engagement précédent
  CBT.debs.forEach(d => d.t0 = -1e9); CBT.rings.forEach(r => r.t0 = -9); clearHulks(null);   // v7.17 : épaves brisées de l'engagement précédent
  E.anchor.root.visible = true; E.anchor.root.parent = shipWorld;   // pseudo-vaisseau pour les éclats en espace libre
  vis.eng = E; return E;
}
/* ---------- porte-vaisseaux (v7.6) ----------
   En orbite haute dans ≈ 1 système sur 3 (?carrier=0|1|civil|mil) : un vaisseau sans moyen supraluminique garé au poste 2,
   deux drones d'inspection dans le poste libre, portique roulant, anneaux au repos. Tout ce qui est à bord suit le porteur
   (trajectoires dans son repère). L'ombre de la soute du porteur le plus proche de la caméra est mise à jour à chaque image. */
const NOFTL = ['e18', 'p10', 'tS', 'tM', 'tL', 'x1'];
function dockTraj(car, lp, lq, x){ return T => { const st = car.traj(T), q = st.q || quatNose(st.nose, st.up), p = typeof lp === 'function' ? lp(T) : lp;
  const qq = lq ? q.clone().multiply(typeof lq === 'function' ? lq(T) : lq) : q.clone();
  return Object.assign({ pos: st.pos.clone().add(p.clone().applyQuaternion(q)), nose: v(0, 0, -1).applyQuaternion(qq), up: v(0, 1, 0).applyQuaternion(qq), q: qq, throttle: 0, seg: 'docked' }, x || {}); }; }
function carrierTasks(leg, tasks, force){
  if(!window.__CRAFT || !__CRAFT.CARRIER) return;
  const pc = force || PARAMS.get('carrier'); if(pc === '0') return;
  if(!(pc || R() < .34)) return;
  tasks.push(() => ensureCarrier(leg, pc));
}
function ensureCarrier(leg, pc, orb){                                            // orb (v7.15) : orbite imposée { u, w, r, om, th0 }
  if(!window.__CRAFT || !__CRAFT.CARRIER) return null;
  let c = leg.npcs.find(x => x.isCarrier); if(c) return c;
  const kind = pc === 'mil' ? 'carrierMil' : (pc === 'civil' ? 'carrier' : (R() < .5 ? 'carrierMil' : 'carrier'));
  c = makeCraft(kind, leg); const hab = leg.hab, u = orb ? orb.u : randUnit(), w = orb ? orb.w : perpTo(u), r = orb ? orb.r : hab.radius*rr(1.3, 1.6);
  c.traj = c.orbitF = orbitTraj(hab.position, r, u, w, orb ? orb.th0 : rr(0, 6.28), orb ? orb.om : Math.sqrt(hab.GM/r)/r*(R() < .5 ? -1 : 1), 0); leg.npcs.push(c);   // v7.11 : orbite gardée pour un départ
  const X = c.craft.extra; c.isCarrier = true; c.dock = X; c.rings = X.rings; c.field = X.ring.uField; c.phase = X.ring.uPhase;
  if(c.craft.wear && X.rings){ const L = X.rings.list; c.craft.wear.uRing.value.set(L[0].z, L[1].z, L[0].Rin, 2); c.ringU = c.craft.wear.uRingI; }
  patchUniforms(c.craft.group, c.thr, c.charge, X.ring.uField, X.ring.uPhase);    // halos des anneaux et géode : champ et charge propres au porteur
  c.drive = X.drive || null;                                                 // v7.6.2 : moteurs du jeu (chauffe, cardans)
  c.geode = findGeode(c.craft.group, c.charge); c.equip = { warp: !!X.rings, jump: !!c.geode }; c.ftl = true;   // v7.6.1 : saut quantique (raison d'être du porteur) et distorsion
  const m = pick(NOFTL), s = makeShip(m, leg, { noBays: true, merge: true }), hb = s.hull.box, B = X.berths[1];   // vaisseau garé au poste 2
  const lp = new V3(B.C.x - ((hb.min.x + hb.max.x)/2 - s.com.x), B.C.y - (hb.min.y - s.com.y), B.C.z - ((hb.min.z + hb.max.z)/2 - s.com.z));
  s.traj = dockTraj(c, lp); s.docked = c; leg.npcs.push(s); c.berthed = [null, s];
  X.clamps && X.clamps[1] && X.clamps[1].forEach(k => k.g.rotation.z = k.sx*clampAng((hb.max.x - hb.min.x)/2));   // v7.10 : pinces fermées sur le vaisseau garé
  const op = berthSetup(c, leg);                                             // v7.10 : escale au poste 1 (approche, glissement latéral, pinces, sortie par l'autre bord)
  for(let i = 0; i < 2; i++){                                                // drones d'inspection dans le poste libre : échelle humaine
    const d = makeCraft('drone', leg, { variant: 'inspect' }), zc = X.berths[0].C.z, ph = i*Math.PI + rr(0, 1), per = rr(55, 75), sd = i ? 1 : -1;
    const at = T => ph + 2*Math.PI*T/per, occ = T => op ? berthPose(op, T).occ || 0 : 0;
    const post = T => new V3(sd*38, 18 + .8*Math.sin(T*.7 + i*2), X.dock.ZA + 7);   // v7.10 : poste occupé → en faction dans les coins avant, en hauteur
    d.traj = dockTraj(c, T => { const a = at(T), o = new V3(Math.cos(a)*24, 4 + 7*Math.sin(2*a), zc + Math.sin(a)*46); return o.lerp(post(T), smooth(occ(T))); },
      T => { const a = at(T), q0 = quatNose(new V3(-Math.sin(a)*24, 0, Math.cos(a)*46).normalize(), v(0, 1, 0)), k = smooth(occ(T)); if(k <= 0) return q0;
        return q0.slerp(quatNose(new V3(-sd*.6, -.25, 1).normalize(), v(0, 1, 0)), k); }, { throttle: .12 });
    d.docked = c; leg.npcs.push(d); }
  return c;
}
/* ---------- escale au poste 1 (v7.10) ----------
   Un vaisseau sans moyen supraluminique vient se ranger « à couple » : approche depuis l'arrière du porteur (freinage aux RCS),
   alignement face à l'ouverture, glissement latéral à travers le champ de force (onde, champ abaissé localement), pinces qui se
   referment, portique qui vient au-dessus du poste ; puis pinces ouvertes, sortie par l'ouverture opposée (dock traversant),
   dégagement latéral aux RCS et allumage de la torche à distance. Positions dans le repère du porteur (racine du vaisseau = centre
   de gravité). Les manœuvres ne démarrent qu'en temps réel ; entre deux escales, le vaisseau est hors champ. */
const clampAng = hw => clamp(Math.asin(clamp((28.7 - hw)/16, -1, 1)), -.42, .62);   // bras de 16 m pivotant à |x| = 33 m : patin au contact de la coque
const BERTH_MOVE = { approach: 1, align: 1, slide: 1, exit: 1, depart: 1 };
const BERTH_SHOTS = { berthApproach: 1, berthDepart: 1, fieldCross: 1, controlRoom: 1, deckLevel: 1 };
const COMBAT_SHOTS = { battleWide: 1, dogfight: 1, missileCam: 1, duelSide: 1, strafeRun: 1, convoyPass: 1, patrolArrival: 1, wreckDrift: 1, hulkPass: 1 };
function berthSetup(c, leg){
  const X = c.dock, B = X.berths[0]; if(!B || !X.fields) return null;
  const op = { c, K: X.dock, plan: [], idx: 0, inF: {}, clA: 0 }; c.berthOp = op;
  berthAssign(op, makeShip(pick(NOFTL), leg, { noBays: true, merge: true }), leg);
  const sx = R() < .5 ? -1 : 1;
  op.plan.push(R() < .4 ? berthDockedSeg(op, -1e9, T + rr(8, 30), sx, -1e9) : berthGoneSeg(op, -1e9, T + rr(3, 18), sx));
  return op;
}
/* v7.11 : met un vaisseau au poste 1 (visiteur ou passager) : pose d'amarrage, trajectoire dans le repère du porteur */
function berthAssign(op, s, leg){
  const c = op.c, B = c.dock.berths[0], hb = s.hull.box;
  op.s = s; op.Bc = new V3(B.C.x - ((hb.min.x + hb.max.x)/2 - s.com.x), B.C.y - (hb.min.y - s.com.y), B.C.z - ((hb.min.z + hb.max.z)/2 - s.com.z));
  Object.assign(op, { hw: (hb.max.x - hb.min.x)/2, ht: hb.max.y - hb.min.y, len: hb.max.z - hb.min.z, cOff: hb.getCenter(new V3()).sub(s.com) }); op.clA = clampAng(op.hw);
  s.local = t => { const r = berthPose(op, t); return { p: r.p, q: r.q }; };   // RCS : translations dans le repère du porteur
  s.traj = t => { const r = berthPose(op, t), st = c.traj(t), q = st.q || quatNose(st.nose, st.up), qq = q.clone().multiply(r.q);
    return { pos: st.pos.clone().add(r.p.clone().applyQuaternion(q)), nose: v(0, 0, -1).applyQuaternion(qq), up: v(0, 1, 0).applyQuaternion(qq), q: qq, throttle: r.thr || 0, seg: r.s === 'docked' ? 'docked' : 'berth' }; };
  s.hideAt = t => berthPose(op, t).vis === false;
  s.docked = c; s.berthOp = op; s.leg = leg || s.leg; if(!s.leg.npcs.includes(s)) s.leg.npcs.push(s); c.berthed[0] = s;
}
/* à bord (repère du porteur, poste occupé) : passager, vaisseau garé, drones */
function isAboard(s){ if(!s.docked) return false; if(!s.berthOp) return true; const ph = berthPose(s.berthOp, T).s; return ph === 'docked' || ph === 'clamp' || ph === 'release'; }
function berthDockedEver(op, t0, sx, tc){ const g = berthDockedSeg(op, t0, t0 + 1e6, sx, tc); g.now = true; return g; }
/* v7.11 : escale d'un passager (voyage à bord) — débarquement dans la fenêtre d'orbite : pinces, sortie par l'autre bord, tour libre
   le long du porteur (en avant puis retour, nez parallèle au porteur : translations aux RCS), puis réembarquement (alignement,
   glissement, pinces) ou départ par ses propres moyens (relais : il reste dans le système) */
function berthTripPlan(op, tRel, reembark){
  const sx = R() < .5 ? -1 : 1, I = new Q(), Bc = op.Bc, o = op.K.W/2 + op.hw + 45, s2 = -sx, A2 = new V3(s2*o, Bc.y, Bc.z);
  op.plan.length = 0; op.idx = 0; op.inF = {};
  op.plan.push(berthDockedSeg(op, -1e9, tRel, sx, -1e9)); op.plan[0].now = true;
  const add = (s, dur, f, x) => { const t0 = op.plan[op.plan.length - 1].t1, g = Object.assign({ s, t0, t1: t0 + dur, f, sx }, x || {}); op.plan.push(g); return g; };
  const g = add('release', 3, u => ({ p: Bc, q: I, occ: 1, cl: 1 - smooth(u) })); g.tr = g.t0; const tr = g.t0;
  add('exit', 10, u => ({ p: Bc.clone().lerp(A2, smoother(u)), q: I, occ: 1 }), { tr });
  const D = new V3(s2*rr(60, 90), rr(18, 32), -rr(230, 290)), yaw = s2*rr(.08, .14);
  add('roam', 20, u => { const k = Math.pow(Math.sin(Math.PI*u), 2); return { p: A2.clone().addScaledVector(D, k), q: new Q().setFromAxisAngle(v(0, 1, 0), yaw*Math.sin(2*Math.PI*u)), thr: .12*smooth(1 - Math.abs(u - .12)/.12), occ: 1 - smooth(Math.min(u, 1 - u)/.06) }; }, { tr });
  if(reembark){
    add('align', 2, () => ({ p: A2, q: I, occ: 1 }), { sx: s2 });              // retour par le même bord (côté entrée : s2)
    add('slide', 10, u => ({ p: A2.clone().lerp(Bc, smoother(u)), q: I, occ: 1 }), { sx: s2 });
    const c = add('clamp', 3, u => ({ p: Bc, q: I, occ: 1, cl: smooth(u) }), { sx: s2 }); c.tc = c.t0;
    op.plan.push(berthDockedEver(op, c.t1, s2, c.t0));
  } else berthDepartSegs(op, A2, sx, tr);
}
function berthDepartSegs(op, A2, sx, tr){                             // dégagement (RCS puis torche) et absence, depuis A2 (bord −sx)
  const I = new Q(), DT = 24, e = t => t - 1.5*(1 - Math.exp(-t/1.5)), t0 = op.plan[op.plan.length - 1].t1;
  const fd = u => { const t = u*DT, tb = Math.max(0, t - 8); return { p: A2.clone().add(new V3(-sx*6*e(t), .6*e(t), -1.2*e(t) - 6*tb*tb)), q: I, thr: .85*smooth(tb/1.5), occ: 1 - smooth(u/.25) }; };
  op.plan.push({ s: 'depart', t0, t1: t0 + DT, f: fd, sx, tr });
  const gs = berthGoneSeg(op, t0 + DT, t0 + DT + rr(25, 50), sx, fd(1).p); op.plan.push(gs);
}
function berthGoneSeg(op, t0, t1, sx, p){ const P = p || op.Bc.clone().add(new V3(sx*900, 200, -3000)); return { s: 'gone', t0, t1, sx, f: () => ({ p: P, q: new Q(), vis: false, occ: 0 }) }; }
function berthDockedSeg(op, t0, t1, sx, tc){ return { s: 'docked', t0, t1, sx, tc, f: () => ({ p: op.Bc, q: new Q(), occ: 1, cl: 1 }) }; }
function berthCalm(op, t){ const tr = op.c.traj; return rateAt(t) < 3 && !(tr(t).throttle > .05); }
function berthNext(op){
  const last = op.plan[op.plan.length - 1], I = new Q(), Bc = op.Bc, K = op.K, o = K.W/2 + op.hw + 45;
  let t = last.t1;
  if((last.s === 'gone' || last.s === 'docked') && !last.now){ while(!berthCalm(op, t) && t < last.t1 + 600) t += 3; if(t > last.t1) op.plan.push(Object.assign({}, last, { t0: last.t1, t1: t })); }
  const add = (s, dur, f, sx, x) => { const t0 = op.plan[op.plan.length - 1].t1, g = Object.assign({ s, t0, t1: t0 + dur, f, sx }, x || {}); op.plan.push(g); return g; };
  if(last.s === 'gone'){
    const sx = R() < .5 ? -1 : 1, A = new V3(sx*o, Bc.y, Bc.z), S0 = new V3(sx*(o + 215), Bc.y + 120, Bc.z + 950);
    const P1 = S0.clone().add(new V3(0, -20, -380)), P2 = A.clone().add(new V3(sx*70, 25, 260));
    add('approach', 30, u => ({ p: bez3(S0, P1, P2, A, easeOut(u)), q: I, thr: 0, occ: smooth((u - .5)/.4) }), sx);
    add('align', 3, () => ({ p: A, q: I, thr: 0, occ: 1 }), sx);
    add('slide', 16, u => ({ p: A.clone().lerp(Bc, smoother(u)), q: I, thr: 0, occ: 1 }), sx);
    const g = add('clamp', 4, u => ({ p: Bc, q: I, occ: 1, cl: smooth(u) }), sx); g.tc = g.t0;
    const dk = berthDockedSeg(op, g.t1, g.t1 + rr(24, 40), sx, g.t0); op.plan.push(dk);
  } else if(last.s === 'docked'){
    const sx = last.sx, A2 = new V3(-sx*o, Bc.y, Bc.z);
    const g = add('release', 3, u => ({ p: Bc, q: I, occ: 1, cl: 1 - smooth(u) }), sx); g.tr = g.t0; const tr = g.t0;
    add('exit', 16, u => ({ p: Bc.clone().lerp(A2, smoother(u)), q: I, occ: 1 }), sx, { tr });
    berthDepartSegs(op, A2, sx, tr);
  } else {                                                                     // état imprévu : on repart d'une absence
    op.plan.push(berthGoneSeg(op, last.t1, last.t1 + 10, last.sx));
  }
}
function berthEnsure(op, t){ let n = 0; while(op.plan[op.plan.length - 1].t1 <= t && n++ < 40) berthNext(op); }
function berthPose(op, t){
  berthEnsure(op, t);
  let i = Math.min(op.idx, op.plan.length - 1); while(i > 0 && op.plan[i].t0 > t) i--; while(i < op.plan.length - 1 && op.plan[i].t1 <= t) i++;
  const sg = op.plan[i], u = sg.t1 > sg.t0 + 1e-6 && sg.t0 > -1e8 ? clamp((t - sg.t0)/(sg.t1 - sg.t0), 0, 1) : 0, r = sg.f(u);
  r.p = r.p.clone(); r.s = sg.s; r.sx = sg.sx; r.seg = sg; if(t === T) op.idx = i;   // copie : les RCS modifient les vecteurs reçus
  return r;
}
function berthGantry(op, t){ const r = berthPose(op, t), g = r.seg;                // portique au-dessus du poste pendant l'amarrage (transitions de 12 s)
  if(g.tc !== undefined) return g.tc < -1e8 ? 1 : smooth((t - g.tc)/12);
  if(g.tr !== undefined) return 1 - smooth((t - g.tr)/12);
  return 0; }
function berthBusy(op, t0, t1){                                              // le poste 1 est-il occupé (ou traversé) entre t0 et t1 ?
  berthEnsure(op, t1 + 2);
  return op.plan.some(g => g.t1 > t0 && g.t0 < t1 + 2 && g.s !== 'gone' && !(g.s === 'approach' && g.t1 > t1 + 14)); }
/* calage sur la fenêtre d'orbite en temps réel (≈ 20 s par système) : sans lui, une escale de 2 min passerait presque toujours en accéléré.
   mode 'arrive' : le glissement commence à tS (approche lancée 33 s avant) ; 'depart' : les pinces s'ouvrent à tS. ph/u (tests) : phase et
   avancement imposés à l'instant T. */
const BERTH_ARR = { approach: 0, align: 30, slide: 33, clamp: 49, docked: 53 }, BERTH_DEP = { release: 0, exit: 3, depart: 19, gone: 43 };
function berthSchedule(op, mode, tS){
  const sx = R() < .5 ? -1 : 1; op.plan.length = 0; op.idx = 0; op.inF = {};
  if(mode === 'arrive'){ const g = berthGoneSeg(op, -1e9, tS - BERTH_ARR.slide, sx); g.now = true; op.plan.push(g); }
  else { const g = berthDockedSeg(op, -1e9, tS, sx, -1e9); g.now = true; op.plan.push(g); }
  berthEnsure(op, tS + 60);
}
function berthScheduleVisit(leg, vis){
  const car = (leg.npcs || []).find(x => x.isCarrier && x.berthOp && !(x.berthOp.lock > T)); if(!car) return;   // v7.11 : pas un porteur engagé dans un voyage
  if(R() < .55) berthSchedule(car.berthOp, 'arrive', vis.tO0 + rr(1, 12)); else berthSchedule(car.berthOp, 'depart', vis.tO0 + rr(1, 5));
}
/* =====================================================================
   VOYAGE À BORD D'UN PORTE-VAISSEAUX (v7.11, lot 15)
   Un vaisseau sans moyen supraluminique voyage au poste 1 d'un porteur : le porteur part (poussée, saut quantique ou
   distorsion avec ?ftl=warp) avec son passager, son vaisseau garé et ses drones ; au système suivant, le porteur arrive,
   rejoint l'orbite, et le passager débarque (pinces, sortie par l'autre bord, tour libre le long du porteur) : il redevient
   le vaisseau suivi. Au départ, il réembarque (mode Suivre : toujours ; Auto : une fois sur deux, sinon relais habituel).
   ===================================================================== */
const TRIP_P = PARAMS.get('trip');                                         // ?trip=0 (jamais) · 1 (dès qu'un porteur est là) ; défaut : Auto, 1 relais sur 2 quand un porteur est là
function tripAllowed(){ return !!(window.__CRAFT && __CRAFT.CARRIER) && TRIP_P !== '0' && PARAMS.get('carrier') !== '0' && OPT.traffic; }
function heroOf(vis){ return vis.trip ? vis.trip.X : (vis.tripOut && vis.tripOut.user ? vis.tripOut.X : vis.departer); }   // vaisseau « suivi » (carte, radar)
/* le porteur devient le partant en pleine orbite (même durée physique de départ : la carte du temps reste valable) */
function carrierDepart(vis, K){
  const leg = vis.leg, tg = vis.target, old = vis.departer, hero = vis.hero, depOrbit = K.orbitF || K.traj;
  if(old === K) return K;
  const { pathD, upD } = departurePath(leg, tg, depOrbit, vis.depStart, vis.toNext, vis.dJ);
  const D0 = vis.profDep.D, vs = depOrbit.speed || vis.depOrbit.speed, a = Math.max(.05, 2*(pathD.L - vs*D0)/(D0*D0));
  const profD = accelProfile(pathD.L, vs, a), depart = pathTraj(pathD, profD, tauAt(vis.depStart), upD);
  let jumpSeg;
  if(vis.mode === 'jump'){ jumpSeg = { kind:'jump', t0: vis.tJ, f: depart }; noteJump(K, vis.tJ); if(old.jumpTs) old.jumpTs = old.jumpTs.filter(t => t !== vis.tJ); }
  else { const W = warpPlan(K, leg, vis.nextLeg, vis.tJ, depart, pathD.d1.clone(), upD, vis.warp); K.warps = [W]; vis.warp = W; jumpSeg = { kind:'warp', t0: vis.tJ, f: W.fA }; }
  K.traj = compositeTraj([{ kind:'orbit', t0: -1e9, f: depOrbit }, { kind:'depart', t0: vis.depStart, f: depart }, jumpSeg]);
  if(old === hero) hero.traj = compositeTraj(vis.segsHero); else old.traj = compositeTraj([{ kind:'orbit', t0: -1e9, f: vis.depOrbit }]);   // l'ancien partant reste en orbite
  if(!leg.npcs.includes(old)) leg.npcs.push(old);
  Object.assign(vis, { departer: K, depOrbit, jDir: pathD.d1.clone(), profDep: profD, geodePlan: undefined, ringPlan: undefined, handover: true, showcase: null });
  return K;
}
/* passager à bord pour tout le départ (poste verrouillé jusqu'à la fin de la visite) */
function boardNow(K, X, leg, tEnd){
  const op = K.berthOp, V = op.s;
  if(V !== X){ if(V){ const i = leg.npcs.indexOf(V); if(i >= 0) leg.npcs.splice(i, 1); V.dispose(); } berthAssign(op, X, leg); }
  op.plan.length = 0; op.idx = 0; op.inF = {}; op.plan.push(berthDockedEver(op, -1e9, R() < .5 ? -1 : 1, -1e9)); op.lock = tEnd;
  K.passenger = X; return X;
}
/* sélecteur (mode Suivre, ou Auto une fois sur deux) : vaisseau sans moyen de saut → il part à bord d'un porteur (déjà là, ou qui arrive) */
function tripNow(vis, model, opts){
  const leg = vis.leg, K = ensureCarrier(leg, PARAMS.get('carrier')); if(!K || !K.berthOp) return null;
  const X = makeShip(model, leg, Object.assign({ noBays: true }, opts || {})); if(opts) X.pref = opts;
  if(vis.trip && vis.trip.K !== K) vis.trip.K.passenger = null;                  // un voyage en cours s'arrête ici (le porteur reste en orbite)
  boardNow(K, X, leg, vis.tEnd + 1); carrierDepart(vis, K);
  Object.assign(vis, { tripOut: { K, X, user: true }, trip: null, userHero: true, tripMsg: false });
  return X;
}
/* bascule de système : le porteur emmène ce qui est à bord (passager amarré, vaisseau garé, drones) */
function carryOver(K, oldLeg, next){
  const op = K.berthOp, take = s => s === K || (s.docked === K && (s !== (op && op.s) || isAboard(s)));
  const moving = oldLeg.npcs.filter(take); oldLeg.npcs = oldLeg.npcs.filter(s => !take(s));
  moving.forEach(s => { if(s === K) return; s.leg = next; next.npcs.push(s); });
  if(op && op.s && op.s.leg !== next){ const V = op.s; berthAssign(op, makeShip(pick(NOFTL), next, { noBays: true, merge: true }), next);   // visiteur resté dehors : un autre prend sa place
    op.plan.length = 0; op.idx = 0; op.plan.push(berthGoneSeg(op, -1e9, T + rr(20, 40), R() < .5 ? -1 : 1)); if(V.docked === K) V.docked = null; K.passenger = null; }
  K.leg = next;
}
/* les vaisseaux à bord suivent l'étirement du porteur (saut, distorsion) et disparaissent avec lui */
function syncDocked(){
  ships.forEach(K => { if(!K.isCarrier || !K.root.parent) return;
    const sc = K.inner.scale, unit = Math.abs(sc.x - 1) + Math.abs(sc.y - 1) + Math.abs(sc.z - 1) < 1e-4; let st = null;
    ships.forEach(s => { if(s.docked !== K || !s.root.visible) return;
      if(!K.root.visible){ s.root.visible = false; return; }
      if(unit){ if(s._scaled){ setInnerScale(s, SCALE, SCALE, SCALE); s._scaled = false; } return; }
      st = st || K.traj(T); const q = K.root.quaternion, qi = q.clone().invert();
      const rel = s.root.position.clone().sub(st.pos).applyQuaternion(qi).multiply(sc);
      s.root.position.copy(K.root.position).add(rel.applyQuaternion(q)); setInnerScale(s, SCALE*sc.x, SCALE*sc.y, SCALE*sc.z); s._scaled = true; }); });
}
/* champ de force abaissé là où la coque le traverse, onde au contact et à la sortie ; feux d'approche plus vifs pendant la manœuvre */
function updateBerth(sh){
  const op = sh.berthOp; if(!op) return;
  const X = sh.dock, K = op.K, r = berthPose(op, T), cx = r.p.x + op.cOff.x, edge = K.W/2 + .35, zc = X.berths[0].C.z;
  if(X.clamps && X.clamps[0]) X.clamps[0].forEach(k => k.g.rotation.z = lerp(k.open, k.sx*op.clA, r.cl || 0));
  [-1, 1].forEach(sd => { const F = X.fields[sd]; if(!F) return;
    const gap = Math.abs(sd*edge - cx) - op.hw, inside = r.vis !== false && gap < 0;
    F.uField.value = .8*(1 - .6*(r.vis === false ? 0 : smooth(1 - gap/12)));
    if(inside !== !!op.inF[sd]){ op.inF[sd] = inside; F.uRip.value.set(F.zSign*(zc - K.ZC), op.Bc.y + op.cOff.y, inside ? 1.6 : .9, T); } });
  if(X.chase) X.chase.uOn.value = BERTH_MOVE[r.s] && r.s !== 'depart' ? 1.8 : 1;
}
function updateCarriers(){
  let best = null, bd = 6000;
  ships.forEach(sh => { if(!sh.isCarrier || !sh.root.visible) return; const X = sh.dock, g = X.gantry;
    g.group.position.z = lerp(lerp(g.z0, g.z1, .5 + .5*Math.sin(T*2*Math.PI/150 + sh.len)), X.berths[0].C.z, sh.berthOp ? berthGantry(sh.berthOp, T) : 0);   // portique : un aller-retour en 2,5 min (v7.10 : au-dessus du poste 1 pendant une escale)
    updateBerth(sh);
    if(!sh.warps) sh.phase.value = T*.35;
    const dd = sh.root.position.distanceTo(cam.position); if(dd < bd){ bd = dd; best = sh; } });
  if(!window.__CRAFT || !__CRAFT.setHold) return;
  if(best) __CRAFT.setHold(best.root.position, best.root.quaternion, best.dock.hold, cam.position, cam.quaternion, best.dock.civil);
  else __CRAFT.setHold(null, null, null);
}
function ensureMil(leg, kind){                                               // groupe militaire du système (créé s'il manque)
  const find = () => kind === 'station' ? leg.npcs.find(x => x.model === 'destroyer') : (kind === 'escort' ? leg.npcs.find(x => x.model === 'corvette') : leg.npcs.find(x => x.patrol));
  let s = find(); if(s) return s;
  const tasks = []; militaryTasks(leg, tasks, kind); tasks.forEach(f => f()); return find();
}
function populateSystem(leg){
  if(!OPT.traffic) return [];
  const tasks = [], hab = leg.hab;
  // petits engins libres en orbite basse autour de la planète habitée : navettes de transport, gabares, remorqueurs de maintenance
  const smalls = window.__CRAFT ? ['crew', 'lighter', pick(['crew', 'lighter', 'maint'])] : [];
  smalls.forEach(kind => tasks.push(() => {
    const s = makeCraft(kind, leg); const u = randUnit(), w = perpTo(u), r = hab.radius*rr(1.03, 1.07);
    s.traj = orbitTraj(hab.position, r, u, w, rr(0,6.28), Math.sqrt(hab.GM/r)/r*(R()<.5?-1:1), 0);
    leg.npcs.push(s);
  }));
  if(!window.__CRAFT) for(let i=0;i<3;i++) tasks.push(() => {
    const s = makeShuttle(leg); const u = randUnit(), w = perpTo(u), r = hab.radius*rr(1.03, 1.07);
    s.traj = orbitTraj(hab.position, r, u, w, rr(0,6.28), Math.sqrt(hab.GM/r)/r*(R()<.5?-1:1), 0);
    leg.npcs.push(s);
  });
  // remorqueurs en orbite autour de planètes du système
  const nTug = 1 + (R() < .5 ? 1 : 0);
  for(let i=0;i<nTug;i++) tasks.push(() => {
    const pl = i === 0 ? hab : pick(leg.planets), s = makeShip(pickW(NPC_TUG), leg); const u = randUnit(), w = perpTo(u);
    const r = pl.hasRings ? pl.radius*rr(1.15, 1.3) : pl.radius*rr(1.08, 1.5);
    s.traj = orbitTraj(pl.position, r, u, w, rr(0,6.28), Math.sqrt(pl.GM/r)/r*(R()<.5?-1:1), 0);
    leg.npcs.push(s);
  });
  // cargos en navette entre l'orbite basse et une station haute (flip-and-burn)
  const nBig = 1 + (R() < .45 ? 1 : 0);
  for(let i=0;i<nBig;i++) tasks.push(() => {
    const pl = R() < .75 ? hab : pick(leg.planets), s = makeShip(pickW(NPC_BIG), leg);
    const dA = randUnit(), dB = perpTo(dA).lerp(dA, rr(-.3, .3)).normalize();
    const PA = pl.position.clone().addScaledVector(dA, pl.radius*(pl.hasRings ? 1.25 : 1.08)), PB = pl.position.clone().addScaledVector(dB, pl.radius*rr(3.5, 7));
    s.traj = pingPongTraj(PA, PB, perpTo(PB.clone().sub(PA).normalize()), s.acc, rr(0, 1e5), pl);
    leg.npcs.push(s);
  });
  militaryTasks(leg, tasks);                                                 // v7.4
  carrierTasks(leg, tasks);                                                  // v7.6
  return tasks;
}

/* =====================================================================
   PLANIFICATION D'UNE VISITE : arrivée → transfert (flip-and-burn accéléré) → orbite (temps réel)
   → départ (poussée continue, accéléré) → saut quantique ou distorsion sur l'erre
   ===================================================================== */
const JT = { charge: 3.4, fold: 1.25, flash: .32, wave: 1.7 };   // saut plus lent que dans le jeu : la géode bat, puis l'espace se creuse
JT.total = JT.charge + JT.fold + JT.flash + JT.wave;
const WT = { spool: 2.6, engage: 2.2, decel: .9 };                // v7.2.1 : engagement 0,75 → 2,2 s (on voit le vaisseau démarrer)
const WARP_V_EXIT = 30;                                           // vitesses « écran » de la distorsion, en L/40 par seconde
let visit = null;

function arrivalPlan(leg){
  ensureSystemData(leg);
  const planets = leg.planets;
  const pt = leg.prefTarget != null ? planets[leg.prefTarget] : null;           // planète d'arrivée choisie sur la carte
  const target = pt || ((R() < .72 || planets.length < 2) ? leg.hab : pick(planets));
  const Cp = target.position, toStar = Cp.clone().negate().normalize();
  const flank = perpTo(toStar), up = new V3().crossVectors(toStar, flank).normalize();
  // arrivée par le flanc, légèrement côté nuit, à 32–60 rayons (≈ distance Terre-Lune) : la planète n'est qu'un disque de 2°
  const dA = target.radius*(target.kind.gas ? rr(12, 22) : rr(32, 60));
  const dir = flank.clone().addScaledVector(toStar, -rr(.1, .45)).addScaledVector(up, rr(-.3, .3)).normalize();
  return { target, P0: Cp.clone().addScaledVector(dir, dA) };
}

/* ---------- vol supraluminique (bulle de distorsion) ----------
   repère A : le vaisseau file sur son erre, s'aligne sur l'étoile suivante, la bulle se forme, il accélère ;
   repère B : il sort de distorsion au point d'arrivée. Entre les deux, le champ d'étoiles défile réellement (caméra galactique A → B). */
function warpPlan(dep, legA, legB, tJ, coastFn, jDir, up, reuse){
  const s = dep.len/40, vS = 5*s, vEx = WARP_V_EXIT*s, Ts = WT.spool, Te = WT.engage, Tx = WT.decel;
  const sInt = x => x*x*x - x*x*x*x/2;                                    // ∫ smoothstep
  const wDir = legB.gal.clone().sub(legA.gal).normalize();
  const Tc = reuse ? reuse.tDec - reuse.tCru : rr(7, 9.5), Vw = reuse ? reuse.Vw/reuse.s*s : rr(260, 380)*s;   // croisière allongée : le plan de départ dure jusqu'à la dispersion
  const tEng = tJ + Ts, tCru = tEng + Te, tDec = tCru + Tc, tExit = tDec + Tx;
  // engagement : vitesse vS + (Vw − vS)·x³ — départ lent (≈ 0,2 L la première seconde), puis le vaisseau s'arrache
  const dE = vS*Te + (Vw - vS)*Te*.25, dC = dE + Vw*Tc, D = dC + Vw*Tx + (vEx - Vw)*Tx*.5;
  const dist = T => {                                                     // déplacement « bulle » depuis l'engagement
    if(T <= tEng) return 0;
    if(T <= tCru){ const x = (T - tEng)/Te; return vS*Te*x + (Vw - vS)*Te*x*x*x*x*.25; }
    if(T <= tDec) return dE + Vw*(T - tCru);
    if(T <= tExit){ const x = (T - tDec)/Tx; return dC + Vw*Tx*x + (vEx - Vw)*Tx*sInt(x); }
    return D + vEx*(T - tExit);
  };
  const speed = T => T < tEng ? vS : (T < tCru ? vS + (Vw - vS)*Math.pow((T - tEng)/Te, 3) : (T < tDec ? Vw : (T < tExit ? Vw + (vEx - Vw)*smooth((T - tDec)/Tx) : vEx)));
  // durée physique : distance interstellaire réelle parcourue à 1 200–3 000 c
  const Dg = legA.gal.distanceTo(legB.gal)*UNIT_GAL, Vc = reuse ? reuse.Vc : rr(1200, 3000), Dphys = Dg/(Vc*CLIGHT);
  if(!reuse) tlSegment(tCru, tExit, Dphys, 1, 1, .8);                  // le voyage commence quand le vaisseau disparaît
  const tauE = tauAt(tCru);
  const frac = T => clamp((tauAt(T) - tauE)/Dphys, 0, 1);
  const qJ = quatNose(jDir, up), qW = quatNose(wDir, up);
  const fA = T => { const c = coastFn(T), x = clamp((T - tJ)/Ts, 0, 1);
    return { pos: c.pos.addScaledVector(wDir, dist(T)), q: T < tEng ? qJ.clone().slerp(qW, smoother(x*1.15)) : qW.clone(), throttle: T < tEng ? .06*(1 - x) : 0 }; };
  const fB = P0B => T => ({ pos: P0B.clone().addScaledVector(wDir, dist(T) - D), q: qW.clone(), throttle: 0 });
  return { fA, fB, dist, speed, tW0: tJ, tEng, tCru, tDec, tExit, Vw, D, dE, wDir, galA: legA.gal.clone(), galB: legB.gal.clone(), frac, Vc, Dphys, s, vEx };
}

/* v7.12 : planète d'escale — une voisine d'orbite (rapport des demi-grands axes le plus proche de 1), de préférence rocheuse,
   habitable ou à anneaux ; jamais au-delà d'un rapport 6 ni de 8 UA (transfert de plusieurs semaines), ni de l'autre côté de l'étoile (écart < 100°) */
function stopTarget(leg, A){
  const c = (leg.planets || []).filter(p => p !== A && p.position && p.radius && p.position.distanceTo(A.position) < 8*AU && p.position.angleTo(A.position) < 1.75).map(p => [p, Math.abs(Math.log(p.orbitA/A.orbitA))]).filter(x => x[1] < Math.log(6)).sort((a, b) => a[1] - b[1]).slice(0, 3);   // ≤ 8 UA : au plus une dizaine de jours à 1 g
  if(!c.length) return null;
  return pickW(c.map(([p, dl], i) => [p, (3 - i)*(1 + (p.isHabitable ? .8 : 0) + (p.hasRings ? .8 : 0) + (p.kind.gas ? 0 : .3))]));
}
function planVisit(leg, hero, tArrive, arriveDir, arr){
  const ap = arr || arrivalPlan(leg);
  const target = ap.target, Cp = target.position, Rp = target.radius;
  const toStar = Cp.clone().negate().normalize();
  const arrMode = arr && arr.mode === 'warp' ? 'warp' : 'jump';
  const vEx = WARP_V_EXIT*hero.len/40;
  // sortie de distorsion : le vaisseau file encore sur son erre avant le transfert
  const P0 = arrMode === 'warp' ? ap.P0.clone().addScaledVector(arr.dir, vEx*1.8) : ap.P0.clone();
  const a0 = Cp.clone().sub(P0).normalize();
  let u = toStar.clone().addScaledVector(a0, -toStar.dot(a0));
  u = u.lengthSq() > 1e-4 ? u.normalize().addScaledVector(perpTo(a0), .25) : perpTo(a0);
  u.addScaledVector(a0, -u.dot(a0)).normalize();                          // orbite commencée côté étoile (face éclairée)
  const w = a0.clone();
  const rO = target.hasRings ? Rp*rr(1.2, 1.3) : Rp*rr(1.05, 1.1);       // orbite basse (300–600 km pour une Terre), sous les anneaux
  const E = Cp.clone().addScaledVector(u, rO), upT = new V3().crossVectors(u, w).normalize();
  const vOrb = Math.sqrt(target.GM/rO), omega = vOrb/rO;                  // vitesse orbitale réelle (~7,7 km/s)
  const dirIn = arrMode === 'warp' ? arr.dir.clone() : (arriveDir ? arriveDir.clone().lerp(a0, .6).normalize() : a0.clone());
  const L0 = P0.distanceTo(E);
  const skipT = (pl, s) => pl === target && s > (target.hasRings ? .6 : .88);
  const path = arcPath(clearPath([P0.clone(), P0.clone().addScaledVector(dirIn, L0*.3), E.clone().addScaledVector(w, -L0*.3), E.clone()], obstacles(leg), skipT));
  const v0 = arrMode === 'warp' ? vEx : .3*hero.len;
  const prof = flipProfile(path.L, v0, vOrb, hero.acc, .3, 4*Rp);   // erre finale sur 4 rayons : retournement nez en avant avant l'orbite              // insertion en orbite à la vitesse orbitale ; croisière de retournement ≈ 3 s à l'écran
  const tT0 = tArrive + (arrMode === 'warp' ? 1.8 : 2.6);
  const Ttr = rr(19, 25) + (target.kind.gas ? 2 : 0), tO0 = tT0 + Ttr;
  const kTr = tlSegment(tT0, tO0, prof.D, 1, 1, 1.8);
  const transfer = pathTraj(path, prof, tauAt(tT0), upT);
  const arriveSeg = { kind:'arrive', t0: -1e9, f: arrMode === 'warp' ? arr.W.fB(ap.P0) : transfer };
  // orbite en temps réel
  const tauO = tauAt(tO0);
  const heroOrbit = orbitTraj(Cp, rO, u, w, 0, omega, tauO);
  let TO = rr(18, 26), depStart = tO0 + TO;                             // orbite en temps réel : place pour les plans rasants et les coupes
  // étoile suivante et relais éventuel
  const ps = C.pendingStar; let nextLeg = null; C.pendingStar = null;
  if(ps && ps.cell !== leg.cell){ const c = ps.cell.split(',').map(Number), sd = starDataForCell(c[0], c[1], c[2]);
    if(sd){ nextLeg = legFromStar(sd); if(ps.pi != null) nextLeg.prefTarget = ps.pi; recentCells.push(sd.cell); } }   // choisie sur la carte pendant le départ précédent
  if(!nextLeg) nextLeg = nextStarFrom(leg, arriveDir ? arriveDir.clone() : randUnit());
  const toNext = nextLeg.gal.clone().sub(leg.gal).normalize();
  // relais : 6 fois sur 10 (?relay=), obligatoire après 2 systèmes avec le même héros ; imposé par le sélecteur (C.pending)
  const pend = C.pending; if(pend) C.pending = null;
  const pendCap = !pend || canLeave(pend.model, pend.opts);
  // v7.11 : voyage à bord d'un porteur — arrivée avec un passager (il débarque, puis réembarque ou reste), ou départ d'un porteur
  const tripIn = tripAllowed() && hero.isCarrier && hero.passenger && hero.berthOp && hero.berthOp.s === hero.passenger ? { K: hero, X: hero.passenger } : null;
  if(tripIn){ hero.tripN = (hero.tripN || 0) + 1; tripIn.reembark = !pend && (C.followHero || TRIP_P === '1' || (R() < .5 && hero.tripN < 4)); }   // Auto : 1 fois sur 2, au plus 4 systèmes de suite
  let handover = !!pend || !hero.ftl || (tripIn ? !tripIn.reembark : (OPT.traffic && !C.followHero && ((hero.heroVisits || 0) >= 2 || R() < RELAY_P)));
  let departer = hero, depOrbit = heroOrbit, tripOut = null, lockOp = null;
  if(tripIn){ const op = hero.berthOp; berthTripPlan(op, tO0 + 1, tripIn.reembark); lockOp = op; TO = tripIn.reembark ? 52 : 36;
    if(tripIn.reembark) tripOut = { K: hero, X: tripIn.X, user: true }; else hero.passenger = null; }
  const carL = (leg.npcs || []).find(x => x.isCarrier && x.berthOp && x.traj && !(x.berthOp.lock > T));
  const pendTrip = pend && !pendCap && tripAllowed() && (C.followHero || R() < .5);                     // sélecteur : vaisseau sans moyen de saut → à bord d'un porteur
  if(!tripIn && tripAllowed() && (pendTrip || (handover && !pend && !C.followHero && !hero.isCarrier && carL && (TRIP_P === '1' || R() < .5)))){
    const K = pendTrip ? ensureCarrier(leg, PARAMS.get('carrier')) : carL;
    if(K && K.berthOp){ const op = K.berthOp;
      if(pendTrip){ const X = makeShip(pend.model, leg, Object.assign({ noBays: true }, pend.opts || {})); if(pend.opts) X.pref = pend.opts; const V = op.s;
        if(V && V !== X){ const i = leg.npcs.indexOf(V); if(i >= 0) leg.npcs.splice(i, 1); V.dispose(); } berthAssign(op, X, leg); }
      const tS = tO0 + rr(1, 4); berthSchedule(op, 'arrive', tS);                                      // embarquement pendant l'orbite (glissement puis pinces)
      const dk = op.plan.find(g => g.s === 'docked' && g.t0 > tS); if(dk){ op.plan.length = op.plan.indexOf(dk) + 1; dk.t1 = dk.t0 + 1e6; dk.now = true; }
      lockOp = op; TO = Math.max(TO, tS - tO0 + 23); K.passenger = op.s; handover = true;
      tripOut = { K, X: op.s, user: !!pendTrip }; departer = K; depOrbit = K.orbitF || K.traj; } }
  depStart = tO0 + TO;
  const segsHero = [arriveSeg, { kind:'transfer', t0: tT0, f: transfer, dest: target, up: upT }, { kind:'orbit', t0: tO0, f: heroOrbit, blend: 3 }];
  // v7.12 : escale interplanétaire — orbite A écourtée, transfert flip-and-burn vers une planète voisine B, orbite B, départ depuis B
  let stop = null, dT = target, dCp = Cp, dR = rO, dU = u, dW = w, dTau = tauO;
  // v7.14 : engagement dans ce système (≈ 1 sur 5 ; ?combat= ; FLEET) — fenêtre d'orbite allongée, exclusif avec voyage et escale
  let combatPlan = null;
  if(!tripIn && !tripOut && !pend && COMBAT_P !== '0' && window.__CRAFT && __CRAFT.MIL && OPT.traffic && (C.pendingCombat || COMBAT_P === '1' || COMBAT_KINDS.indexOf(COMBAT_P) >= 0 || R() < .2)){
    const kind = C.pendingCombat || (COMBAT_KINDS.indexOf(COMBAT_P) >= 0 ? COMBAT_P : pickW([['skirmish', .28], ['duel', .22], ['convoy', .2], ['raid', .18], ['assault', .12]])); C.pendingCombat = null;   // v7.15 : cinq scénarios
    combatPlan = { kind, tA: tO0 + 1.5, dur: 42 }; TO = Math.max(TO, 46); depStart = tO0 + TO; }
  const STOP_P = PARAMS.get('stopover');
  if(!combatPlan && !tripIn && !tripOut && !pend && !C.pendingMil && !C.pendingCar && (leg.planets || []).length >= 2 && STOP_P !== '0' && (STOP_P === '1' || R() < .3)){
    const B = stopTarget(leg, target);
    if(B){
      const tA1 = tO0 + rr(13, 17), sA = heroOrbit(tA1), PA = sA.pos.clone(), tanA = sA.nose.clone().normalize(), CpB = B.position, RpB = B.radius;
      const toStarB = CpB.clone().negate().normalize(), a0B = CpB.clone().sub(PA).normalize();
      let uB = toStarB.clone().addScaledVector(a0B, -toStarB.dot(a0B)); uB = uB.lengthSq() > 1e-4 ? uB.normalize().addScaledVector(perpTo(a0B), .25) : perpTo(a0B); uB.addScaledVector(a0B, -uB.dot(a0B)).normalize();
      const wB = a0B.clone(), rOB = B.hasRings ? RpB*rr(1.2, 1.3) : RpB*rr(1.05, 1.1), EB = CpB.clone().addScaledVector(uB, rOB), upB = new V3().crossVectors(uB, wB).normalize();
      const vOB = Math.sqrt(B.GM/rOB), LAB = PA.distanceTo(EB);
      const pathAB = arcPath(clearPath([PA.clone(), PA.clone().addScaledVector(tanA, LAB*.3), EB.clone().addScaledVector(wB, -LAB*.3), EB.clone()], obstacles(leg), (pl, sp) => (pl === target && sp < .1) || (pl === B && sp > (B.hasRings ? .6 : .88))));
      const profAB = flipProfile(pathAB.L, vOrb, vOB, hero.acc, .3, 4*RpB);
      const tB0 = tA1 + rr(21, 27) + (B.kind.gas ? 2 : 0);
      const kAB = tlSegment2(tA1, tB0, profAB.D, 3, 4.5);                 // rampes longues : la planète quittée recule, la planète d'escale grossit à l'écran
      const trAB = pathTraj(pathAB, profAB, tauAt(tA1), upB), tauB = tauAt(tB0), orbitB = orbitTraj(CpB, rOB, uB, wB, 0, vOB/rOB, tauB);
      segsHero.push({ kind:'transfer', t0: tA1, f: trAB, dest: B, from: target, up: upB }, { kind:'orbit', t0: tB0, f: orbitB, blend: 3 });
      stop = { A: target, B, tA1, tB0, kAB, L: pathAB.L, D: profAB.D };
      dT = B; dCp = CpB; dR = rOB; dU = uB; dW = wB; dTau = tauB;
      depStart = tB0 + rr(16, 22); if(departer === hero) depOrbit = orbitB;
    }
  }
  if(handover && !tripOut){
    let m, n = 0; if(pend && pendCap) m = pend.model; else do { m = pickW(DEP_POOL); n++; } while(n < 30 && (m === hero.model || heroHist.slice(-2).includes(m)));   // modèles variés, capables de partir
    const po = pend && pendCap ? pend.opts : null;
    departer = makeShip(m, leg, po); if(po) departer.pref = po;
    const rC = dR + 1.6*(hero.len + departer.len);                        // orbite un peu plus haute, en formation devant le héros (planète de départ : B en cas d'escale)
    depOrbit = orbitTraj(dCp, rC, dU, dW, 3*(hero.len + departer.len)/rC, Math.sqrt(dT.GM/rC)/rC, dTau);
  }
  if(handover && !leg.npcs.includes(hero)) leg.npcs.push(hero);             // l'ancien héros reste en orbite dans ce système
  // vaisseau choisi au sélecteur mais sans moyen de quitter le système : vedette de l'orbite, un autre vaisseau assure le départ
  let showcase = null;
  if(pend && !pendCap && !(tripOut && tripOut.user)){ showcase = makeShip(pend.model, leg, pend.opts); showcase.pref = pend.opts;
    const rS = rO + 1.6*(hero.len + showcase.len) + 1.6*(departer.len + showcase.len);
    showcase.traj = compositeTraj([{ kind:'orbit', t0: -1e9, f: orbitTraj(Cp, rS, u, w, -3*(hero.len + showcase.len)/rS, Math.sqrt(target.GM/rS)/rS, tauO) }]);
    leg.npcs.push(showcase); }
  if(C.pendingMil){ const k = C.pendingMil; C.pendingMil = null; showcase = ensureMil(leg, k) || showcase; }
  if(C.pendingShow){ const P = C.pendingShow; C.pendingShow = null; const sc = makeAny(P.id, leg, P.L);   // v7.18 : vaisseau du chantier choisi pendant le départ précédent
    if(sc){ showcase = sc; const rS = rO + 1.6*(hero.len + sc.len) + 1.6*(departer.len + sc.len);
      sc.traj = compositeTraj([{ kind:'orbit', t0: -1e9, f: orbitTraj(Cp, rS, u, w, -3*(hero.len + sc.len)/rS, Math.sqrt(target.GM/rS)/rS, tauO) }]); leg.npcs.push(sc); } }
  if(C.pendingCar){ const pc = C.pendingCar; C.pendingCar = false; showcase = ensureCarrier(leg, pc && pc.kind ? (pc.kind === 'carrierMil' ? 'mil' : 'civil') : PARAMS.get('carrier')) || showcase; if(pc && pc.look && showcase && showcase.isCarrier) applyLook(showcase, pc.look); }   // v7.6 : porte-vaisseaux choisi pendant le départ précédent   // v7.5 : flotte choisie pendant le départ précédent
  // départ : poussée continue jusqu'au point de saut (25–45 rayons), dans la direction de l'étoile suivante
  const dJ = dT.radius*(dT.kind.gas ? rr(10, 18) : rr(25, 45));
  const { pathD, upD } = departurePath(leg, dT, depOrbit, depStart, toNext, dJ);
  const profD = accelProfile(pathD.L, depOrbit.speed, departer.acc);
  const TD = rr(12, 15), depEnd = depStart + TD, tJ = depEnd + 3.2;      // 3,2 s d'erre en temps réel avant le saut
  const kDep = tlSegment(depStart, depEnd, profD.D, 1, 1, 1.6);
  const depart = pathTraj(pathD, profD, tauAt(depStart), upD);
  const jDir = pathD.d1.clone();
  // mode de départ : saut quantique ou vol supraluminique (réservé aux vaisseaux à anneaux de distorsion)
  const pref = departer.pref;                                                                 // préférences du sélecteur (distorsion / saut)
  const eqD = departer.equip || {};
  const mode = eqD.warp && eqD.jump ? ((pref ? (pref.warp && (!pref.jump || R() < .5)) : (PARAMS.get('ftl') === 'warp' || (PARAMS.get('ftl') !== 'jump' && R() < .5))) ? 'warp' : 'jump')
                                    : (eqD.warp ? 'warp' : 'jump');   // un seul moyen : celui-là (le partant en a toujours au moins un)
  let jumpSeg, extra = {};
  if(mode === 'jump'){ jumpSeg = { kind:'jump', t0: tJ, f: depart }; noteJump(departer, tJ); }
  else {
    const arrB = arrivalPlan(nextLeg);
    const W = warpPlan(departer, leg, nextLeg, tJ, depart, jDir, upD);
    departer.warps = (departer.warps || []).concat([W]).slice(-2);
    jumpSeg = { kind:'warp', t0: tJ, f: W.fA };
    extra = { arrB, wDir: W.wDir, tExit: W.tExit, tCru: W.tCru, tEng: W.tEng, warp: W };
  }
  const depSegs = [{ kind:'depart', t0: depStart, f: depart }, jumpSeg];
  if(handover){ hero.traj = compositeTraj(segsHero); departer.traj = compositeTraj([{ kind:'orbit', t0: -1e9, f: depOrbit }].concat(depSegs)); }
  else hero.traj = compositeTraj(segsHero.concat(depSegs));
  const tEnd = mode === 'jump' ? tJ + JT.total : extra.tExit - .8;
  if(lockOp) lockOp.lock = tEnd + 1;
  return Object.assign({ leg, hero, departer, target: dT, arrTarget: target, tArrive, P0, transfer, tT0, tO0, depStart, depEnd, tJ, tEnd, nextLeg, jDir, toNext, handover, orbitR: dR, vOrb, mode, arrMode, kTr, kDep, profTr: prof, profDep: profD,
    oU: dU, oW: dW, tauO: dTau, segsHero, depOrbit, dJ, userHero: !!pend || !!showcase, showcase, trip: tripIn, tripOut, stop, combatPlan }, extra);
}
/* chemin de départ depuis une orbite jusqu'au point de saut (commun au plan de visite et au relais immédiat) */
function departurePath(leg, target, depOrbit, depStart, toNext, dJ){
  const Cp = target.position, d0s = depOrbit(depStart), Dp = d0s.pos, tan = d0s.nose.clone().normalize(), outward = Dp.clone().sub(Cp).normalize();
  const Jd = tan.clone().addScaledVector(toNext, 1.1).addScaledVector(outward, .7).normalize();
  const J = Dp.clone().addScaledVector(Jd, dJ);
  const PD = clearPath([Dp.clone(), Dp.clone().addScaledVector(tan, dJ*.3), J.clone().addScaledVector(Jd, -dJ*.25), J], obstacles(leg), (pl, s) => pl === target && s < .06);
  return { pathD: arcPath(PD), upD: new V3().crossVectors(outward, tan).normalize() };
}
/* relais immédiat (sélecteur) : le vaisseau choisi rejoint l'orbite en formation, devient le sujet et repart à la place du partant.
   Le départ garde la même durée physique (poussée ajustée) : la carte du temps déjà planifiée reste valable. */
function relayNow(vis, model, opts){
  const leg = vis.leg, old = vis.departer, hero = vis.hero, tg = vis.target;
  const sh = makeShip(model, leg, opts); if(opts) sh.pref = opts;
  const rC = vis.orbitR + 1.6*(hero.len + sh.len) + (old === hero ? 0 : 1.6*(old.len + sh.len));
  const depOrbit = orbitTraj(tg.position, rC, vis.oU, vis.oW, -3*(hero.len + sh.len)/rC, Math.sqrt(tg.GM/rC)/rC, vis.tauO);   // juste derrière le héros
  const { pathD, upD } = departurePath(leg, tg, depOrbit, vis.depStart, vis.toNext, vis.dJ);
  const D0 = vis.profDep.D, vs = depOrbit.speed, a = Math.max(.05, 2*(pathD.L - vs*D0)/(D0*D0));
  const profD = accelProfile(pathD.L, vs, a), depart = pathTraj(pathD, profD, tauAt(vis.depStart), upD);
  let jumpSeg;
  if(vis.mode === 'jump' && sh.equip.jump){ jumpSeg = { kind:'jump', t0: vis.tJ, f: depart }; noteJump(sh, vis.tJ); if(old.jumpTs) old.jumpTs = old.jumpTs.filter(t => t !== vis.tJ); }
  else {                                                                     // distorsion (déjà prévue, ou bascule : le nouveau n'a que ses anneaux)
    const sw = vis.mode === 'jump', W = warpPlan(sh, leg, vis.nextLeg, vis.tJ, depart, pathD.d1.clone(), upD, sw ? undefined : vis.warp);
    if(sw){ if(old.jumpTs) old.jumpTs = old.jumpTs.filter(t => t !== vis.tJ);
      Object.assign(vis, { mode: 'warp', arrB: arrivalPlan(vis.nextLeg), wDir: W.wDir, tExit: W.tExit, tCru: W.tCru, tEng: W.tEng, tEnd: W.tExit - .8, ringPlan: undefined }); }
    sh.warps = [W]; vis.warp = W; jumpSeg = { kind:'warp', t0: vis.tJ, f: W.fA }; }
  sh.traj = compositeTraj([{ kind:'orbit', t0: -1e9, f: depOrbit }, { kind:'depart', t0: vis.depStart, f: depart }, jumpSeg]);
  if(old === hero) hero.traj = compositeTraj(vis.segsHero);                                  // l'ancien partant reste en orbite
  else old.traj = compositeTraj([{ kind:'orbit', t0: -1e9, f: vis.depOrbit }]);
  if(!leg.npcs.includes(old)) leg.npcs.push(old);
  if(vis.tripOut){ vis.tripOut.K.passenger = null; vis.tripOut = null; }           // v7.11 : le porteur ne part plus (le passager reste à bord, en orbite)
  Object.assign(vis, { departer: sh, depOrbit, jDir: pathD.d1.clone(), profDep: profD, userHero: true, geodePlan: undefined, handover: true, showcase: null });
  if(sh.bays) sh.bays.forEach((op, i) => opSchedule(op, Math.max(T, vis.tO0) + rr(2, 5) + i*rr(4, 7)));
  return sh;
}

/* vaisseau choisi sans cœur de saut ni anneaux (v7.2.2) : il rejoint l'orbite et devient le sujet ; le partant prévu assure le départ */
function showcaseNow(vis, model, opts, pre){                                 // v7.18 : pre = vaisseau déjà construit (chantier : engin, navette, militaire)
  const leg = vis.leg, hero = vis.hero, tg = vis.target;
  const sh = pre || makeShip(model, leg, opts); if(opts && !pre) sh.pref = opts;
  const rS = vis.orbitR + 1.6*(hero.len + sh.len) + 1.6*(vis.departer.len + sh.len);
  sh.traj = compositeTraj([{ kind:'orbit', t0: -1e9, f: orbitTraj(tg.position, rS, vis.oU, vis.oW, -3*(hero.len + sh.len)/rS, Math.sqrt(tg.GM/rS)/rS, vis.tauO) }]);
  leg.npcs.push(sh);
  Object.assign(vis, { showcase: sh, userHero: true, showcaseMsg: false });
  if(sh.bays) sh.bays.forEach((op, i) => opSchedule(op, Math.max(T, vis.tO0) + rr(2, 5) + i*rr(4, 7)));
  return sh;
}

/* ---------- quadrillage d'espace-temps (façon banc d'essai des maquettes) ---------- */
function buildWellGrid(){
  const N = 46, M = 96, pos = [];
  for(let i=0;i<=N;i++){
    const c = -1 + 2*i/N;
    for(let j=0;j<M;j++){
      const a = -1 + 2*j/M, b = -1 + 2*(j+1)/M;
      pos.push(c,0,a, c,0,b);   // lignes parallèles à Z
      pos.push(a,0,c, b,0,c);   // lignes parallèles à X
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uDepth:{value:0}, uSigma:{value:.16}, uTwist:{value:0}, uRip:{value:0}, uRipAmp:{value:0}, uOpacity:{value:0}, uTime:{value:0},
      uColA:{value:new THREE.Color(0x3f86c0)}, uColB:{value:new THREE.Color(0xc2a8ff)}, uColC:{value:new THREE.Color(0x5eead4)} },
    vertexShader: `
      uniform float uDepth; uniform float uSigma; uniform float uTwist; uniform float uRip; uniform float uRipAmp; uniform float uTime;
      varying float vFade; varying float vDeep; varying float vWave;
      void main(){
        vec2 p = position.xz;
        float r = length(p);
        /* torsion : le tissu s'enroule autour du puits */
        float ang = uTwist * exp(-r/(uSigma*2.2));
        float c = cos(ang), s = sin(ang);
        p = vec2(c*p.x - s*p.y, s*p.x + c*p.y);
        /* puits : profil lorentzien (entonnoir de type gravitationnel) */
        float well = uDepth / (1.0 + (r*r)/(uSigma*uSigma));
        /* onde de choc qui se propage après l'éclair */
        float dr = r - uRip;
        float wave = uRipAmp * sin(dr*34.0) * exp(-dr*dr*26.0);
        /* légère respiration du tissu */
        float breath = 0.004 * sin(r*18.0 - uTime*3.0) * step(0.001, uDepth);
        float y = -well + wave + breath;
        vDeep = uDepth > 0.001 ? clamp(well/uDepth, 0.0, 1.0) : 0.0;
        vWave = uRipAmp > 0.0001 ? clamp(abs(wave)/uRipAmp, 0.0, 1.0) : 0.0;
        vFade = 1.0 - smoothstep(0.52, 1.0, r);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p.x, y, p.y, 1.0);
      }`,
    fragmentShader: `
      precision highp float;
      uniform float uOpacity; uniform vec3 uColA; uniform vec3 uColB; uniform vec3 uColC;
      varying float vFade; varying float vDeep; varying float vWave;
      void main(){
        vec3 col = mix(uColA, uColB, clamp(vDeep*1.25, 0.0, 1.0));
        col = mix(col, uColC, vWave*0.7);
        float a = uOpacity * vFade * (0.38 + 0.9*vDeep + 0.6*vWave);
        gl_FragColor = vec4(col * a, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  const mesh = new THREE.LineSegments(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 9; mesh.visible = false;
  shipWorld.add(mesh);
  return mesh;
}
let grid = null;
/* traînées d'étoiles (poussière interstellaire) autour du vaisseau en distorsion : étirées par la vitesse, à l'échelle du vaisseau */
function buildStreaks(){
  const N = 900, pos = new Float32Array(N*2*3), base = new Float32Array(N*2*3), seg = new Float32Array(N*2), col = new Float32Array(N*2*3);
  for(let i=0;i<N;i++){
    const ax = Math.random(), rad = 12 + Math.pow(Math.random(), .6)*520, ang = Math.random()*Math.PI*2, hue = Math.random();
    for(let k=0;k<2;k++){ base.set([ax, rad, ang], (i*2+k)*3); seg[i*2+k] = k;
      col.set(hue < .2 ? [1, .82, .7] : (hue < .6 ? [.72, .84, 1] : [.9, .94, 1]), (i*2+k)*3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aBase', new THREE.BufferAttribute(base, 3));
  g.setAttribute('aSeg', new THREE.BufferAttribute(seg, 1)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  const m = new THREE.ShaderMaterial({
    uniforms: { uCenter:{value:new V3()}, uDir:{value:new V3(0,0,1)}, uU:{value:new V3(1,0,0)}, uW:{value:new V3(0,1,0)}, uOff:{value:0}, uLen:{value:1}, uAlpha:{value:0}, uSpan:{value:1400}, uS:{value:1} },
    vertexShader: `
      attribute vec3 aBase; attribute float aSeg; attribute vec3 aCol;
      uniform vec3 uCenter; uniform vec3 uDir; uniform vec3 uU; uniform vec3 uW; uniform float uOff; uniform float uLen; uniform float uSpan; uniform float uS;
      varying vec3 vCol; varying float vA;
      void main(){
        float ax = mod(aBase.x*uSpan - uOff, uSpan) - uSpan*0.5;          /* position le long de l'axe, bouclée */
        vec3 p = uCenter + uDir*(ax + aSeg*uLen) + (uU*cos(aBase.z) + uW*sin(aBase.z))*aBase.y*uS;   /* uCenter relatif à la caméra */
        vCol = aCol; vA = (1.0 - smoothstep(0.32, 0.5, abs(ax)/uSpan)) * mix(1.0, 0.25, aSeg);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `precision highp float; uniform float uAlpha; varying vec3 vCol; varying float vA; void main(){ float a = uAlpha*vA; gl_FragColor = vec4(vCol*a, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  const mesh = new THREE.LineSegments(g, m); mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 8; shipWorld.add(mesh);
  mesh.userData.center = new V3(); mesh.userData.r = 1;
  return mesh;
}
let streaks = null;
/* ---------- départ en distorsion (v7.2.1) : traînée et gerbe violettes ----------
   Le vaisseau démarre lentement (engagement de 2,2 s) en laissant une traînée lumineuse violette ; quand il disparaît
   (fin de l'engagement : éclair, repli dans le plan de départ), une gerbe de particules se disperse là où il était, et la
   traînée s'égrène en particules qui dérivent. Tout est dans le repère co-mobile de l'erre (celui du plan de départ) :
   le groupe est posé au point d'engagement et suit la vitesse d'erre ; formes calculées dans les shaders (aucun calcul
   par particule côté JavaScript). */
const DEPFX = { NB: 1500, NT: 900, LIFE: 6 };
function buildDepFX(){
  const G = new THREE.Group(); G.visible = false; G.userData.center = new V3(); G.userData.r = 1;
  // particules : gerbe (sphère + anneau de choc perpendiculaire à la route) puis égrenage de la traînée
  const N = DEPFX.NB + DEPFX.NT, P = new Float32Array(N*4), Qa = new Float32Array(N*4), pos = new Float32Array(N*3);
  for(let i = 0; i < N; i++){
    const u = Math.random()*2 - 1, a = Math.random()*Math.PI*2, r = Math.sqrt(1 - u*u), burst = i < DEPFX.NB;
    const sp = burst ? (Math.random() < .12 ? rr(1.4, 2.4) : .15 + 1.15*Math.pow(Math.random(), .7)) : .02 + .14*Math.random();
    P.set([r*Math.cos(a), r*Math.sin(a), u, sp], i*4);
    Qa.set([burst ? (i < DEPFX.NB*.62 ? -1 : -2) : Math.random(), 0, burst ? rr(2.8, 5.5) : rr(2.4, 4.6), Math.random()], i*4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aP', new THREE.BufferAttribute(P, 4)); g.setAttribute('aQ', new THREE.BufferAttribute(Qa, 4));
  const U = { uT: { value: 0 }, uL: { value: 100 }, uW: { value: new V3(0, 0, 1) }, uDE: { value: 1 }, uTc: { value: 2.2 }, uPx: { value: 600 }, uHead: { value: 0 }, uWid: { value: 10 }, uFade: { value: 1 } };
  const pm = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute vec4 aP; attribute vec4 aQ;
      uniform float uT, uL, uDE, uTc, uPx; uniform vec3 uW;
      varying float vA; varying vec3 vC;
      void main(){
        float t0 = aQ.x < 0.0 ? uTc : aQ.y, t = uT - t0;                       /* gerbe : à la disparition ; traînée : au passage du vaisseau */
        if(t < 0.0 || t > aQ.z){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; vC = vec3(0.0); return; }
        vec3 d = aP.xyz;
        if(aQ.x < -1.5 || aQ.x >= 0.0) d = normalize(d - uW*dot(d, uW) + 1e-4);  /* anneau de choc, dérive latérale de la traînée */
        float tau = aQ.x < 0.0 ? 1.1 : 1.8, r = aP.w*uL*tau*(1.0 - exp(-t/tau));
        vec3 p = aQ.x < 0.0 ? uW*(uDE + uL*0.35*(1.0 - exp(-t/0.6))) : uW*(aQ.x*uDE);
        p += d*r;
        vec4 mv = modelViewMatrix*vec4(p, 1.0);
        float life = t/aQ.z, fade = (1.0 - life)*(1.0 - life)*smoothstep(0.0, 0.06, t);
        float tw = 0.65 + 0.35*sin(uT*(9.0 + aQ.w*13.0) + aQ.w*40.0);
        vA = fade*tw*(aQ.x < 0.0 ? 1.0 : 0.55);
        float h = fract(aQ.w*7.31);
        vC = h < 0.6 ? vec3(0.62, 0.3, 1.0) : (h < 0.86 ? vec3(0.92, 0.55, 1.0) : vec3(0.55, 0.72, 1.0));
        float sz = uL*(aQ.x < 0.0 ? 0.04 : 0.024)*(0.6 + 0.8*fract(aQ.w*3.7));
        gl_PointSize = clamp(sz*uPx/max(-mv.z, 1e-3), 1.5, 22.0);
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: `precision highp float; varying float vA; varying vec3 vC;
      void main(){ vec2 q = gl_PointCoord*2.0 - 1.0; float d = dot(q, q); if(d > 1.0) discard; gl_FragColor = vec4(vC*vA*exp(-d*3.0)*1.7, 1.0); }` });
  const pts = new THREE.Points(g, pm); pts.frustumCulled = false; pts.renderOrder = 9; G.add(pts);
  // traînée : ruban face caméra le long de la route, étroit au départ, large derrière le vaisseau
  const NS = 48, uv = new Float32Array((NS + 1)*2*2), rp = new Float32Array((NS + 1)*2*3), idx = [];
  for(let i = 0; i <= NS; i++){ uv.set([i/NS, -1, i/NS, 1], i*4); if(i < NS){ const k = i*2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3)); rg.setAttribute('aUV', new THREE.BufferAttribute(uv, 2)); rg.setIndex(idx);
  const rm = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `
      attribute vec2 aUV; uniform float uHead, uWid; uniform vec3 uW; varying vec2 vUV;
      void main(){
        vec4 mv = modelViewMatrix*vec4(uW*(aUV.x*uHead), 1.0);
        vec3 dv = normalize(mat3(modelViewMatrix)*uW), sd = cross(dv, normalize(mv.xyz));
        sd = length(sd) > 1e-4 ? normalize(sd) : vec3(1.0, 0.0, 0.0);
        mv.xyz += sd*aUV.y*uWid*(0.3 + 0.7*smoothstep(0.0, 0.85, aUV.x));
        vUV = aUV; gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: `precision highp float; uniform float uFade, uT, uHead, uL; varying vec2 vUV;
      void main(){
        float across = exp(-vUV.y*vUV.y*3.2), along = pow(vUV.x, 1.3);
        float ripple = 0.75 + 0.25*sin(vUV.x*uHead/(uL*0.35) - uT*14.0);
        float k = across*along*ripple*uFade*smoothstep(0.0, uL*0.3, uHead);
        vec3 col = mix(vec3(0.5, 0.24, 1.0), vec3(0.95, 0.82, 1.0), across*across*along*0.6);
        gl_FragColor = vec4(col*k*1.2, 1.0);
      }` });
  const rib = new THREE.Mesh(rg, rm); rib.frustumCulled = false; rib.renderOrder = 9; G.add(rib);
  G.userData.U = U; G.userData.pts = g; shipWorld.add(G);
  return G;
}
let depFX = null;
function updateDepFX(sh, W, T){
  const G = depFX; if(!G) return;
  if(!sh || !W || T < W.tEng || T > W.tCru + DEPFX.LIFE){ G.visible = false; return; }
  const U = G.userData.U, L = sh.len;
  if(G.userData.W !== W){                                   // nouvelle distorsion : repère co-mobile et instants de passage de la traînée
    G.userData.W = W; G.userData.P0 = subjectState(sh, W.tEng).pos.clone(); G.userData.vm = velT(sh, W.tW0 + .3);
    const Qa = G.userData.pts.attributes.aQ, Te = W.tCru - W.tEng;
    for(let i = DEPFX.NB; i < DEPFX.NB + DEPFX.NT; i++){
      const d = Qa.getX(i)*W.dE; let lo = 0, hi = Te;           // instant où le vaisseau passe à la distance d (bissection)
      for(let k = 0; k < 24; k++){ const m = (lo + hi)/2; if(W.dist(W.tEng + m) < d) lo = m; else hi = m; }
      Qa.setY(i, lo + .05);
    }
    Qa.needsUpdate = true;
  }
  const tl = T - W.tEng, Te = W.tCru - W.tEng;
  G.position.copy(G.userData.P0).addScaledVector(G.userData.vm, tl); G.updateMatrixWorld();
  U.uT.value = tl; U.uL.value = L; U.uW.value.copy(W.wDir); U.uDE.value = W.dE; U.uTc.value = Te;
  U.uHead.value = Math.max(0, Math.min(W.dist(T), W.dE) - .45*L); U.uWid.value = .14*L;
  U.uFade.value = T < W.tCru ? 1 : Math.exp(-(T - W.tCru)/1.5);
  const sz = renderer.getDrawingBufferSize(_v2d); U.uPx.value = sz.y/(2*Math.tan(cam.fov*Math.PI/360));
  G.userData.center.copy(G.position).addScaledVector(W.wDir, W.dE*.5); G.userData.r = W.dE*.5 + 3*L;
  G.visible = true;
}
const _v2d = new THREE.Vector2();
function warpFX(T){
  let active = null, W = null;
  ships.forEach(sh => (sh.warps || []).forEach(w => { if(T >= w.tW0 - RING.PRE && T <= w.tExit + 1.6){ active = sh; W = w; } }));
  ships.forEach(sh => { if(sh !== active && sh.field) sh.field.value = .15; });
  updateDepFX(active, W, T);
  if(!active){ streaks.visible = false; return false; }
  const st = active.traj(T), sp = W.speed(T)/W.s, s = W.s;
  let field = .15, lens = 0, chroma = 0, flash = 0, rip = 0, ripA = 0, stretch = 1, alpha = 0, spin = 1;
  if(T < W.tW0){ const e = (T - W.tW0 + RING.PRE)/RING.PRE; field = .15 + .45*smooth(e); spin = 1 + 1.5*e; }            // pré-charge (v7.2)
  else if(T < W.tEng){ const e = (T - W.tW0)/WT.spool; field = .6 + .75*e + .05*e*Math.sin(T*41); lens = .1*smooth(e); spin = 2.5 + 5.5*e; chroma = .01*e; }
  else if(T < W.tCru){ const e = (T - W.tEng)/(W.tCru - W.tEng), e2 = smooth(clamp((e - .55)/.45, 0, 1)); field = 1.35 + .4*e; flash = .25*Math.sin(Math.min(1, e*5)*Math.PI); lens = .1 + .1*e + .3*e2; chroma = .02 + .03*e; stretch = 1 + .45*e2; alpha = e2; spin = 8; }   // v7.2.1 : démarrage lent, étirement à la fin
  else if(T < W.tDec){ field = 1.75; lens = .25; chroma = .018; stretch = 1.45; alpha = 1; spin = 8; }
  else if(T < W.tExit){ const e = (T - W.tDec)/WT.decel; field = 1.75; lens = .25 + .3*e; chroma = .02; stretch = 1.45 - .45*smooth(e); alpha = 1 - smooth(e*1.3); spin = 8 - 4*e; }
  else { const e = clamp((T - W.tExit)/1.6, 0, 1); field = 1.75 - 1.6*smooth(e); flash = e < .2 ? .7*Math.sin(e/.2*Math.PI) : 0; lens = .5*(1 - smooth(e)); rip = .02 + 1.2*e; ripA = .03*(1 - e); chroma = .03*(1 - e); spin = 4 - 3*e; }
  if(T >= W.tCru - .15 && T < W.tCru + .5) flash = Math.max(flash, .9*Math.exp(-Math.pow((T - W.tCru)/.09, 2)));   // v7.2.1 : éclair à la disparition
  // plan de départ : le vaisseau se replie en un trait et disparaît (dans les plans de poursuite, on reste dans la bulle : il reste visible)
  const vanish = shot && shot.type === 'warpEngage' && T > W.tCru ? clamp((T - W.tCru)/.14, 0, 1) : 0;
  if(vanish > 0){ lens *= 1 - vanish; chroma *= 1 - vanish; alpha *= 1 - vanish; }
  active.field.value = field; active.phase.value += .7*spin/60;
  const sxy = Math.max(1e-4, SCALE/Math.sqrt(stretch)*(1 - vanish));
  setInnerScale(active, sxy, sxy, SCALE*stretch*(1 + 1.5*vanish));
  FX.active = true; FX.center.copy(st.pos); FX.len = active.len; FX.lens = lens; FX.rip = rip; FX.ripA = ripA; FX.flash = flash; FX.chroma = chroma;
  FX.vignette = .25*alpha; FX.flashDom = .35*flash;
  // traînées (centre relatif à la caméra : origine flottante)
  const u = streaks.material.uniforms, dir = st.q ? frameOf(st.q).fwd : W.wDir, span = 1400*s;
  streaks.visible = alpha > .01;
  u.uCenter.value.copy(st.pos).sub(cam.position); u.uDir.value.copy(dir); u.uU.value.copy(perpTo(dir, v(0,1,0))); u.uW.value.crossVectors(dir, u.uU.value);
  u.uSpan.value = span; u.uS.value = s; u.uOff.value = W.dist(T) % span; u.uLen.value = -(Math.min(sp*.09, 170) + 2)*s; u.uAlpha.value = alpha*.9;
  streaks.userData.center.copy(st.pos); streaks.userData.r = span*.6 + 540*s;
  return true;
}

/* ---------- effets de saut : sortie (vaisseau → éclair) et arrivée (éclair → vaisseau) ---------- */
const FX = { active:false, center: new V3(), len: 40, lens:0, rip:0, ripA:0, flash:0, chroma:0 };
function placeGrid(ship, st, halfL){
  const f = frameOf(st.q);
  grid.position.copy(st.pos).addScaledVector(f.up, -ship.len*.55);
  grid.quaternion.copy(st.q);
  grid.scale.setScalar(ship.len*halfL);
  grid.visible = true;
}
function jumpOutFX(T, vis){
  const sh = vis.departer, u = T - vis.tJ;
  if(u < 0 || u > JT.total) return false;
  const st = sh.traj(T);                               // le vaisseau file sur son erre : le puits le suit (repère co-mobile)
  const a = JT.charge, o = a + JT.fold, r = o + JT.flash;
  let ch=0, lens=0, str=0, flash=0, rip=0, ripA=0, chroma=0, thr=.05, depth=0, twist=0, op=0, gRip=0, gRipA=0, gone=false;
  if(u < a){ const e = warpSmooth(u/a); ch = e; lens = .1*warpSmooth((u-1.2)/(a-1.2)); thr = .05 + .3*(1-e); depth = .55*e*e; twist = .5*e; op = smooth(u/.8); }
  else if(u < o){ const e = Math.pow((u-a)/JT.fold, 2); ch = 1 + .8*e; lens = .1 + .9*e; str = e; chroma = .015 + .05*e; depth = .55 + .75*e; twist = .5 + 2.6*e; op = 1; }
  else if(u < r){ const e = (u-o)/JT.flash; flash = Math.sin(e*Math.PI); gone = e >= .5; str = gone ? 0 : 1 + e; lens = gone ? .8 : 1; ch = gone ? .6 : 1.8; rip = gone ? .02 : 0; ripA = .03; chroma = .06;
    depth = gone ? -.12*Math.sin(e*Math.PI) : 1.3 + .3*e; twist = gone ? 0 : 3.1; op = 1; gRip = gone ? .05 : 0; gRipA = gone ? .07 : 0; }
  else { const e = (u-r)/JT.wave; gone = true; lens = .8*(1-warpSmooth(e)); rip = .02 + 1.3*e; ripA = .03*(1-e); chroma = .04*(1-e); ch = .6*(1-e);
    depth = -.1*Math.exp(-e*3)*Math.cos(e*9); gRip = .05 + 1.05*e; gRipA = .07*(1-e); op = 1 - smooth((e-.45)/.55); }
  // géode : battements accélérés pendant la charge, puis éclat continu pendant le repli
  const gp = u < a ? geodePulse(u) : { p: u < r ? 1 - smooth((u - a)/(JT.fold + JT.flash)) : 0, age: 9 };
  if(sh.geode && !gone){ setGeode(sh, gp.p, ch); if(u < a){ depth += .1*gp.p; gRip = gp.age*.9; gRipA = .05*Math.exp(-gp.age*3.2)*(gp.age < 8 ? 1 : 0); } }
  sh.charge.value = sh.geode && u < a ? .3*ch + 1.25*gp.p : ch; sh.thr.value = thr;   // entre deux battements la géode retombe : les pulsations se lisent
  const S_ = 1 + 1.3*str, s_ = 1/(1 + .5*str);
  setInnerScale(sh, SCALE*s_, SCALE*s_, SCALE*S_);
  if(gone) sh.root.visible = false;
  else if(u >= a){ const e = (u - a)/(JT.fold + JT.flash*.5); sh.root.position.addScaledVector(frameOf(st.q).up, -sh.len*.3*e*e); } // le vaisseau glisse dans le puits
  placeGrid(sh, st, 6.5);
  const gu = grid.material.uniforms;
  gu.uDepth.value = depth; gu.uTwist.value = twist; gu.uOpacity.value = op; gu.uRip.value = gRip; gu.uRipAmp.value = gRipA;
  FX.active = true; FX.center.copy(st.pos); FX.len = sh.len;
  FX.lens = lens; FX.rip = rip; FX.ripA = ripA; FX.flash = .9*flash; FX.chroma = chroma;
  FX.vignette = .45*(u < a ? warpSmooth(u/a) : (u < r ? 1 : 1 - warpSmooth((u-r)/JT.wave)))*.7; FX.flashDom = .5*flash;
  return true;
}
function arriveFX(T, vis){
  const sh = vis.hero, u = T - vis.tArrive;
  if(u < -1.8 || u > 3.2){ return false; }
  const st = sh.traj(T);
  if(u < 0){ sh.root.visible = false; // l'espace se creuse avant l'apparition : le puits se forme vide
    const e = smooth((u+1.8)/1.8); placeGrid(sh, st, 6.5); const gu = grid.material.uniforms;
    gu.uDepth.value = .9*e*e; gu.uTwist.value = -2.2*e; gu.uOpacity.value = smooth((u+1.8)/.6); gu.uRip.value = 0; gu.uRipAmp.value = 0;
    FX.active = true; FX.center.copy(st.pos); FX.len = sh.len; FX.lens = .55*e*e; FX.rip = 0; FX.ripA = 0; FX.flash = 0; FX.chroma = .03*e; FX.vignette = .3*e; FX.flashDom = 0;
    sh.charge.value = .8*e; return true; }
  const flash = u < .32 ? Math.sin(u/.32*Math.PI) : 0;
  sh.root.visible = u >= .12;
  const str = u < .12 ? 1 : Math.max(0, 1 - (u-.12)/.55);
  setInnerScale(sh, SCALE/(1+.5*str), SCALE/(1+.5*str), SCALE*(1 + 1.3*str));
  sh.charge.value = Math.max(0, .9*(1 - u/2.2)); sh.thr.value = Math.min(sh.thr.value, .08 + u*.1);
  const e = clamp(u/3.2, 0, 1);
  placeGrid(sh, st, 6.5); const gu = grid.material.uniforms;
  gu.uDepth.value = .9*Math.exp(-u*3.2)*Math.cos(u*5.5); gu.uTwist.value = -2.2*Math.exp(-u*2.5); gu.uOpacity.value = 1 - smooth((u - 1.4)/1.8);
  gu.uRip.value = .04 + 1.0*e; gu.uRipAmp.value = .07*(1 - e);
  FX.active = true; FX.center.copy(st.pos); FX.len = sh.len; FX.lens = .55*Math.exp(-u*2.2); FX.rip = .02 + 1.2*e; FX.ripA = .03*(1-e); FX.flash = .9*flash; FX.chroma = .04*(1-e);
  FX.vignette = .3*(1-e); FX.flashDom = .5*flash;
  return true;
}

/* =====================================================================
   RENDU : champ galactique, puis système en tranches de profondeur (loin → près), origine flottante
   ===================================================================== */
const SLB = [.2, 400, 8e5, 1.6e9, 3.2e12, 6.4e15, 1.3e19];                // bornes des tranches (rapport ≤ 2 000 : z-buffer 24 bits précis partout)
const SLS = [1, 1, 800, 1.6e6, 3.2e9, 6.4e12];                            // réduction du monde par tranche : profondeurs de vue w ≤ 2·10⁶ (interpolation perspective fiable)
const _v2 = new THREE.Vector2();
let galView = null, sysHidden = false, lastSlices = 0;
const LAST = { near: .2, far: 400, s: 1 };                                      // dernière tranche rendue : sa profondeur reste dans le tampon (flou optique)
function sliceUnits(){
  const out = [], leg = visit && visit.leg;
  ships.forEach(sh => { if(sh.root.visible) out.push([sh.root.position, sh.len*1.6]); });
  if(leg && leg.group && leg.group.visible){
    leg.planets.forEach(p => { out.push([p.position, p.radius*(p.hasRings ? 3.4 : 1.12)]);
      (p.moonPivots || []).forEach(pv => { const m = pv.children[0]; if(m) out.push([m.getWorldPosition(new V3()), m.scale.x*1.4]); }); });
    if(leg.star3){ const S = leg.star3; out.push([S.root.position, Math.max(S.Rs*8, S.glare.scale.x*.75, S.glare2.scale.x*.75) + S.glare.position.length()]); }
    if(leg.beltInfo && leg.beltInfo.cluster) out.push([leg.beltInfo.cluster.P, leg.beltInfo.cluster.Rm*14]);
  }
  if(grid.visible) out.push([grid.position, grid.scale.x*2.2]);
  if(streaks.visible) out.push([streaks.userData.center, streaks.userData.r]);
  if(depFX && depFX.visible) out.push([depFX.userData.center, depFX.userData.r]);
  if(GUN.grp && GUN.grp.visible) out.push([GUN.grp.userData.center, GUN.grp.userData.r]);
  if(IMP.grp && IMP.grp.visible) out.push([IMP.grp.userData.center, IMP.grp.userData.r]);
  if(SMK.grp && SMK.grp.visible) out.push([SMK.grp.userData.center, SMK.grp.userData.r]);   // v7.16
  if(CBT.grp && CBT.grp.visible) out.push([CBT.grp.userData.center, CBT.grp.userData.r]);
  return out;
}
function renderLayers(){
  const Rn = renderer, sz = Rn.getDrawingBufferSize(_v2), aspect = sz.x/Math.max(1, sz.y);
  Rn.autoClear = false; Rn.clear(true, true, true);
  // 1) champ d'étoiles, nébuleuses et fond du moteur (unités du jeu)
  galCam.position.copy(galView ? galView.pos : galPos); galCam.quaternion.copy(galView ? galView.q : cam.quaternion);
  galCam.fov = galView ? galView.fov : cam.fov; galCam.aspect = aspect; galCam.updateProjectionMatrix();
  Rn.render(scene, galCam);
  if(sysHidden) return;
  // 2) système en mètres : tranches utilisées, de la plus lointaine à la plus proche
  const cp = cam.position; let used = 0;
  sliceUnits().forEach(([p, r]) => { const d = p.distanceTo(cp), lo = Math.max(d - r, SLB[0]), hi = d + r; for(let i=0;i<SLB.length-1;i++) if(hi > SLB[i] && lo < SLB[i+1]) used |= 1 << i; });
  lastSlices = used;
  rcam.position.set(0,0,0); rcam.quaternion.copy(cam.quaternion); rcam.fov = cam.fov; rcam.aspect = aspect;
  sunLight.updateMatrixWorld(); sunLight.target.updateMatrixWorld();
  let shipsReady = false, curS = -1;
  for(let i = SLB.length - 2; i >= 0; i--){
    if(!(used & (1 << i))) continue;
    const s = SLS[i];
    if(s !== curS){ curS = s; sysWorld.scale.setScalar(1/s); sysWorld.position.copy(cp).multiplyScalar(-1/s); sysWorld.updateMatrixWorld(); }
    shipWorld.visible = s === 1;
    if(s === 1 && !shipsReady){ shipsReady = true; shipWorld.position.copy(cp).negate(); shipWorld.updateMatrixWorld(); }
    rcam.near = SLB[i]/s; rcam.far = SLB[i+1]*1.00002/s; rcam.updateProjectionMatrix();
    Rn.clearDepth(); Rn.render(sysScene, rcam);
    LAST.near = rcam.near; LAST.far = rcam.far; LAST.s = s;
  }
  // retour aux coordonnées absolues pour la logique
  sysWorld.scale.setScalar(1); sysWorld.position.set(0,0,0); sysWorld.updateMatrixWorld();
  shipWorld.visible = true; if(shipsReady){ shipWorld.position.set(0,0,0); shipWorld.updateMatrixWorld(); }
}
/* passe écran du jeu (lentille gravitationnelle), dimensionnée sur le vaisseau filmé */
function renderFrame(){
  const lens = !(sysHidden || !FX.active || FX.lens + FX.rip + FX.flash < 1e-3);
  const dof = !sysHidden && DOF.k > .01 && window.__POSTFX && __POSTFX.available(renderer);   // profondeur de champ (postfx.js)
  if(!lens && !dof){ renderer.setRenderTarget(null); renderLayers(); return; }
  const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
  let tex;
  if(dof){
    LAST.near = .2; LAST.far = 400; LAST.s = 1; __POSTFX.begin(renderer, sz.x, sz.y); renderLayers();
    tex = __POSTFX.finish(renderer, { near: LAST.near, far: LAST.far, scale: LAST.s, focus: DOF.focus, k: DOF.k, maxR: DOF.r*sz.y, toTexture: lens });
    if(!lens) return;
  } else {
    if(!(WARP.rt && WARP.rt.width === sz.x && WARP.rt.height === sz.y)){ WARP.rt && WARP.rt.dispose(); WARP.rt = new THREE.WebGLRenderTarget(sz.x, sz.y, { stencilBuffer: true /* portails des baies */ }); WARP.rt.texture.encoding = renderer.outputEncoding; }
    renderer.setRenderTarget(WARP.rt); renderLayers(); tex = WARP.rt.texture;
  }
  renderer.setRenderTarget(null);
  const U = WARP.mat.uniforms, rel = FX.center.clone().sub(cam.position), front = rel.dot(frameOf(cam.quaternion).fwd) > 0;
  rcam.updateMatrixWorld(); const n = rel.clone().project(rcam);
  U.uCenter.value.set(.5*n.x + .5, .5*n.y + .5); U.uAspect.value = rcam.aspect;
  U.uR.value = .38*FX.len/(2*Math.tan(cam.fov*Math.PI/360)*Math.max(1, rel.length()));
  U.uLens.value = front ? FX.lens : 0; U.uRipple.value = FX.rip; U.uRippleAmp.value = FX.ripA; U.uFlash.value = FX.flash; U.uChroma.value = FX.chroma;
  U.tScene.value = tex; renderer.clear(); renderer.render(WARP.scene, WARP.cam);
}

/* =====================================================================
   RÉALISATEUR : choix automatique des plans
   À l'échelle réelle, un vaisseau en orbite file à 7–8 km/s (≈ 80 longueurs par seconde) et bien plus en accéléré :
   les plans « fixes » sont donc tenus dans le repère co-mobile du vaisseau (caméra qui vole en formation).
   ===================================================================== */
let shot = null;
const shotLog = [];
function subjectState(sh, T){ const st = sh.traj(T); if(!st.q) st.q = quatNose(st.nose, st.up); st.com = sh.com || null; return st; }
function setInnerScale(sh, sx, sy, sz){ sh.inner.scale.set(sx, sy, sz); if(sh.com) sh.inner.position.set(-sh.com.x*sx, -sh.com.y*sy, -sh.com.z*sz); }   // étirement centré sur le centre de gravité
function velT(sh, T){ const a = sh.traj(T - .05).pos, b = sh.traj(T + .05).pos; return b.sub(a).multiplyScalar(10); }   // m par seconde « écran »
/* près d'une planète, place la caméra du côté extérieur (la planète en fond plutôt que le vide) */
function outwardSide(vis, st, axis){ const pl = vis && nearestPlanet(vis.leg, st.pos); if(!pl) return R()<.5?-1:1; const rad = st.pos.clone().sub(pl.position); if(rad.length() > pl.radius*3) return R()<.5?-1:1; return axis.dot(rad) >= 0 ? 1 : -1; }
function nearestPlanet(leg, pos){ let best = null, bd = Infinity; (leg.planets || []).forEach(p => { const d = pos.distanceTo(p.position) - p.radius; if(d < bd){ bd = d; best = p; } }); return best; }
function safeCam(pos, leg, subjPos, minD, low){
  if(leg.star3){ const d = pos.length(), need = leg.star3.Rs*1.12; if(d < need) pos.multiplyScalar(need/Math.max(d, 1)); }
  (leg.planets || []).forEach(p => {
    const d = pos.distanceTo(p.position), need = p.radius*(low ? 1.0012 : 1.004);
    if(d < need) pos.add(pos.clone().sub(p.position).normalize().multiplyScalar(need - d));
    (p.moonPivots || []).forEach(pv => { const m = pv.children[0]; if(!m) return; const mp = m.getWorldPosition(new V3()), dm = pos.distanceTo(mp), nm = m.scale.x*1.3; if(dm < nm) pos.add(pos.clone().sub(mp).normalize().multiplyScalar(nm - dm)); });
  });
  if(subjPos && minD){ const d = pos.distanceTo(subjPos); if(d < minD) pos.add(pos.clone().sub(subjPos).normalize().multiplyScalar(minD - d)); }
  return pos;
}
// Chaque constructeur renvoie cam(T) → { pos, look, fov, up }
const SHOTS = {
  chase(sh, t0, d){ const side = R()<.5?-1:1, k1 = rr(2.2,3.6), k2 = rr(.5,1.1), k3 = side*rr(.3,1.1), fov = rr(48,58);
    return T => { const st = subjectState(sh, T), f = frameOf(st.q), L = sh.len;
      return { pos: st.pos.clone().addScaledVector(f.fwd, -k1*L).addScaledVector(f.up, k2*L).addScaledVector(f.right, k3*L), look: st.pos.clone().addScaledVector(f.fwd, 2.5*L), fov, up: f.up }; }; },
  lateral(sh, t0, d, vis){ const s0 = subjectState(sh, t0 + d*.5), f = frameOf(s0.q), L = sh.len, side = R() < .8 ? outwardSide(vis, s0, f.right) : (R()<.5?-1:1);
    const off = f.right.clone().multiplyScalar(side*rr(2.6,4.8)*L).addScaledVector(f.up, rr(-.6,1.2)*L), drift = rr(-.25,.25)*L, fov = rr(40,52);
    return T => { const st = subjectState(sh, T); return { pos: st.pos.clone().add(off).addScaledVector(f.fwd, drift*(T - t0)), look: st.pos.clone().addScaledVector(f.fwd, .4*L), fov, up: f.up }; }; },
  tripod(sh, t0, d, vis){ // plan fixe dans le repère co-mobile : le vaisseau dérive lentement dans le cadre
    const Tm = t0 + d*rr(.45,.65), sm = subjectState(sh, Tm), vm = velT(sh, Tm), f = frameOf(sm.q), L = sh.len, side = R() < .8 ? outwardSide(vis, sm, f.right) : (R()<.5?-1:1);
    const pos = sm.pos.clone().addScaledVector(f.right, side*rr(2.2,4.5)*L).addScaledVector(f.up, rr(-.8,1.4)*L).addScaledVector(f.fwd, rr(.2,1.5)*L), fov = rr(34,46);
    return T => { const st = subjectState(sh, T); return { pos: pos.clone().addScaledVector(vm, T - Tm), look: st.pos, fov, up: f.up }; }; },
  front(sh, t0, d){ const L = sh.len, k = rr(3.5,5.5), side = R()<.5?-1:1, h = rr(.2,.8), fov = rr(42,52);
    return T => { const st = subjectState(sh, T), f = frameOf(st.q);
      return { pos: st.pos.clone().addScaledVector(f.fwd, k*L - .08*L*(T - t0)).addScaledVector(f.up, h*L).addScaledVector(f.right, side*.7*L), look: st.pos, fov, up: f.up }; }; },
  orbitcam(sh, t0, d, vis){ const s0 = subjectState(sh, t0), f = frameOf(s0.q), L = sh.len, w = rr(.08,.16)*(R()<.5?-1:1), rad = rr(2.4,3.6)*L, h = rr(-.4,1)*L, fov = rr(46,55);
    const out = outwardSide(vis, s0, f.right), a0 = (out > 0 ? 0 : Math.PI) + rr(-.9, .9) - w*d*.5;          // départ côté extérieur
    return T => { const st = subjectState(sh, T), a = a0 + w*(T - t0);
      return { pos: st.pos.clone().addScaledVector(f.right, Math.cos(a)*rad).addScaledVector(f.fwd, Math.sin(a)*rad).addScaledVector(f.up, h), look: st.pos, fov, up: f.up }; }; },
  wide(sh, t0, d, vis){ // plan large en formation : le vaisseau devant sa planète (ou son étoile) qui grossit en accéléré
    const s0 = subjectState(sh, t0 + d*.5), L = sh.len;
    const bgPl = R() < .65 ? (nearestPlanet(vis.leg, s0.pos) || vis.target) : null, bg = bgPl ? bgPl.position : new V3();
    const dir = s0.pos.clone().sub(bg).normalize().add(randUnit().multiplyScalar(.3)).normalize(), dist = rr(12, 20)*L, fov = rr(40,50), upW = frameOf(s0.q).up;
    return T => { const st = subjectState(sh, T), tb = bg.clone().sub(st.pos).normalize(); return { pos: st.pos.clone().addScaledVector(dir, dist), look: st.pos.clone().addScaledVector(tb, dist*.12), fov, up: upW }; }; },
  limb(sh, t0, d, vis){ // plongée par-dessus l'épaule : la ligne d'horizon traverse le cadre, la planète (nuages, côtes) sert de fond
    const pl = nearestPlanet(vis.leg, subjectState(sh, t0).pos), L = sh.len, a = rr(1.8, 2.9)*L, side = (R()<.5?-1:1)*rr(.4, 1.3)*L, pitchOff = rr(-.06, .16), fov = rr(52,62);
    return T => { const st = subjectState(sh, T), f = frameOf(st.q);
      const radial = st.pos.clone().sub(pl.position); const rS = radial.length(); radial.normalize();
      let fwdT = f.fwd.clone().sub(radial.clone().multiplyScalar(f.fwd.dot(radial))); if(fwdT.lengthSq() < 1e-6) fwdT = perpTo(radial); fwdT.normalize();
      const rightT = new V3().crossVectors(fwdT, radial);
      const pitch = clamp(Math.acos(clamp(pl.radius/rS, 0, 1)) + pitchOff, .2, 1.25);
      const pos = st.pos.clone().addScaledVector(fwdT, -a).addScaledVector(radial, a*Math.tan(pitch)).addScaledVector(rightT, side);
      return { pos, look: st.pos, fov, up: radial }; }; },
  gunnery(sh, t0, d){ // v7.5 : exercice de tir — 2 cadrages : large de profil (tireur, traçantes et cible) ou depuis la cible (les traçantes arrivent vers nous)
    const ts = sh.craft.turrets, tg = sh.gun.target, side = R()<.5?-1:1, fov = rr(42, 48), wide = C.gunVar ? C.gunVar === 'wide' : R() < .6;
    return T => { const st = subjectState(sh, T), f = frameOf(st.q), tw = hw(st, 0, 0, 0), tp = tg.traj(T).pos, D = tp.distanceTo(tw), dir = tp.clone().sub(tw).normalize(), up = f.up;
      const right = new V3().crossVectors(dir, up).normalize();
      if(wide){ const M = tw.clone().addScaledVector(dir, D*.5); return { pos: M.clone().addScaledVector(right, side*D*.9).addScaledVector(up, D*.14), look: M, fov, up }; }
      return { pos: tp.clone().addScaledVector(dir, 34).addScaledVector(right, side*26).addScaledVector(up, 12), look: tw.clone().lerp(tp, .12), fov: fov*.58, up }; }; },   // téléobjectif : le destroyer remplit le cadre, les traçantes filent vers nous
  torchClose(sh, t0, d){ // v7.8 : gros plan sur la torche de fusion du porteur — 3/4 arrière, orbite lente autour de la cloche
    const X = sh.dock && sh.dock.torch; if(!X) return SHOTS.lateral(sh, t0, d);
    const side = R()<.5?-1:1, a0 = rr(-.5, .5), sw = rr(.12, .22)*side, rad = rr(95, 130), zc = X.z0 + X.len + rr(25, 60), fov = rr(44, 54);
    return T => { const st = subjectState(sh, T), k = smoother((T - t0)/d), a = a0 + sw*k, up = frameOf(st.q).up;
      return { pos: hw(st, Math.cos(a)*rad*side, Math.sin(a)*rad*.7, zc - 12*k), look: hw(st, 0, 0, X.z0 + X.len*.45), fov, up }; }; },
  radiatorPass(sh, t0, d){ // v7.8 : travelling au ras d'une aile de radiateurs, caloducs qui défilent, torche et coque en fond
    const X = sh.dock && sh.dock.wings; if(!X) return SHOTS.lateral(sh, t0, d);
    const a = Math.floor(R()*4)*Math.PI/2, rv = new V3(Math.cos(a), Math.sin(a), 0), nv = new V3(-Math.sin(a), Math.cos(a), 0), side = R()<.5?-1:1;
    const r = rr(.55, .85)*X.r1, h = rr(9, 16), zA = X.z1 + rr(20, 40), zB = X.z0 - rr(10, 30), fov = rr(56, 66);
    return T => { const st = subjectState(sh, T), k = smoother((T - t0)/d), z = lerp(zA, zB, k);
      const P = rv.clone().multiplyScalar(r).addScaledVector(nv, side*h), L = rv.clone().multiplyScalar(r*.55).addScaledVector(nv, -side*h*.4);
      return { pos: hw(st, P.x, P.y, z), look: hw(st, L.x, L.y, z - 90), fov, up: nv.clone().multiplyScalar(side).applyQuaternion(st.q) }; }; },
  dockPass(sh, t0, d){ // v7.6 : passage latéral devant le porte-vaisseaux, dans l'axe du dock : on voit les étoiles à travers
    const K = __CRAFT.CARRIER, side = R()<.5?-1:1, D = rr(430, 560), y0 = rr(-25, 55), z0 = rr(170, 260)*(R()<.5?-1:1), z1 = -z0*rr(.5, .9), fov = rr(34, 42);
    return T => { const st = subjectState(sh, T), k = smoother((T - t0)/d), z = lerp(z0, z1, k) + K.ZC;
      return { pos: hw(st, side*D, y0, z), look: hw(st, 0, y0*.1, K.ZC + (z - K.ZC)*.3), fov, up: frameOf(st.q).up }; }; },
  dockInterior(sh, t0, d){ // v7.6 : dans le poste libre, au ras du pont : le vaisseau garé derrière le treillis, drones, portique
    const K = __CRAFT.CARRIER, side = R()<.5?-1:1, x0 = side*rr(16, 30), y0 = rr(-20, -8), zA = K.BERTHS[0] - rr(40, 55), zB = zA + rr(25, 40), fov = rr(60, 70);
    const tgt = new V3(rr(-6, 6), rr(-10, 2), K.BERTHS[1]);
    return T => { const st = subjectState(sh, T), k = smoother((T - t0)/d);
      return { pos: hw(st, x0*(1 - .25*k), y0 + 3*k, lerp(zA, zB, k)), look: hw(st, tgt.x, tgt.y, tgt.z), fov, up: frameOf(st.q).up }; }; },
  dockBerth(sh, t0, d){ // v7.6 : juste devant une ouverture, le vaisseau garé encadré par les lèvres du dock et le champ de force
    const K = __CRAFT.CARRIER, side = R()<.5?-1:1, sz = R()<.5?-1:1, D = rr(80, 115), y0 = rr(-12, 18), zc = K.BERTHS[1], fov = rr(46, 54);
    return T => { const st = subjectState(sh, T), k = smoother((T - t0)/d);
      return { pos: hw(st, side*D, y0 - 6*k, zc + sz*lerp(85, 45, k)), look: hw(st, 0, -6, zc - sz*10), fov, up: frameOf(st.q).up }; }; },
  /* v7.14 : plans de combat (sh.eng : engagement) */
  battleWide(sh, t0, d, vis){ // vue d'ensemble co-mobile : tout l'engagement dans le cadre, lent déplacement latéral
    const E = sh.eng; if(!E) return SHOTS.lateral(sh, t0, d, vis);
    const pair = (E.kind === 'skirmish' || (E.kind !== 'duel' && sh.cbOpp && sh.cbOpp.root.visible)) && sh.cbOpp, side = R() < .5 ? -1 : 1, el = rr(.12, .38), az = rr(-.7, .7)*(pair ? 1 : .45), sw = rr(.05, .12)*(R() < .5 ? -1 : 1), fov = rr(40, 48);
    const dist = pair ? (E.kind === 'skirmish' ? rr(260, 420) : clamp(sh.traj(t0).pos.distanceTo(sh.cbOpp.traj(t0).pos)*1.1 + rr(150, 300), 280, 2400)) : E.R0*1.5 + 250;   // v7.15 : la paire, quelle que soit sa taille                            // duel : de côté, les deux destroyers dans le cadre                          // escarmouche : la paire du sujet (un chasseur de 15 m se perd à 2 km)
    const ctr = T => pair ? sh.traj(T).pos.lerp(sh.cbOpp.traj(T).pos, .5) : engCenter(E, T);
    return T => { const F = engFrame(E, T), c = ctr(T), a = az + sw*(T - t0)/d, dL = new V3(side*Math.sin(a)*Math.cos(el), Math.sin(el), Math.cos(a)*Math.cos(el));
      return { pos: c.clone().add(dL.applyQuaternion(F.q).multiplyScalar(dist)), look: c, fov, up: v(0, 1, 0).applyQuaternion(F.q) }; }; },
  dogfight(sh, t0, d){ // derrière le poursuivant, cadré sur le poursuivi : traçantes qui partent vers lui
    const k = rr(2.6, 3.6), h = rr(1.4, 2), fov = rr(50, 58);
    return T => { const st = subjectState(sh, T), f = frameOf(st.q), o = sh.cbOpp, fp = st.pos.clone().addScaledVector(f.fwd, 300), tp = o && o.root.visible ? o.traj(T).pos : fp;
      const wv = smooth(clamp((tp.clone().sub(st.pos).normalize().dot(f.fwd) - .2)/.5, 0, 1));             // v7.15 : adversaire derrière → on regarde devant
      return { pos: st.pos.clone().addScaledVector(f.fwd, -sh.len*k).addScaledVector(f.up, sh.len*h), look: fp.lerp(st.pos.clone().lerp(tp, .35), wv), fov, up: f.up }; }; },   // poursuivant en bas du cadre, poursuivi devant
  missileCam(sh, t0, d){ // derrière un missile en vol, jusqu'à l'impact (ou l'interception) — puis on reste sur le point d'arrivée
    const E = sh.eng, m = E && (E.missiles.find(x => !x.dead && x.sh === sh) || E.missiles.find(x => !x.dead)); if(!m) return SHOTS.battleWide(sh, t0, d);
    const fov = rr(50, 56); let dl = new V3(0, 0, -1);
    return T => { const F = engFrame(E, T), pw = toWorld(F, m.p); if(!m.dead && m.v.lengthSq() > 1) dl = m.v.clone().normalize(); const dw = dl.clone().applyQuaternion(F.q), up = v(0, 1, 0).applyQuaternion(F.q);
      return { pos: pw.clone().addScaledVector(dw, -48).addScaledVector(up, 11), look: pw.clone().addScaledVector(dw, 260), fov, up }; }; },
  duelSide(sh, t0, d){ // par-dessus l'épaule d'un destroyer, l'adversaire au loin : obus et missiles qui traversent
    const E = sh.eng, hg = rr(.22, .55), bk = rr(.7, 1.3)*(R() < .5 ? -1 : 1), fov = rr(42, 50);
    return T => { const st = subjectState(sh, T), op = sh.cbOpp.traj(T).pos, dir = op.clone().sub(st.pos).normalize(), up = v(0, 1, 0).applyQuaternion(engFrame(E, T).q), sd = new V3().crossVectors(dir, up).normalize();
      return { pos: st.pos.clone().addScaledVector(dir, -sh.len*1.5).addScaledVector(up, sh.len*(hg + .1)).addScaledVector(sd, sh.len*bk*.5), look: st.pos.clone().lerp(op, .22), fov, up }; }; },
  strafeRun(sh, t0, d){ // v7.15 : en aval, à hauteur de coque : l'assaillant arrive au ras de la cible, canons en action, et passe tout près de la caméra
    const tg = sh.cbOpp, run = sh.cbRun || { tp: t0 + d - 1.5 }, b = tg.craft ? tg.craft.box : tg.hull.box, bc = b.getCenter(new V3()), hs = b.getSize(new V3()).multiplyScalar(.5), com = tg.com || new V3(), fov = rr(46, 54);
    const sT = subjectState(tg, run.tp), qi = sT.q.clone().invert(), pw = sh.traj(run.tp).pos, rp = t => sh.traj(t).pos.sub(tg.traj(t).pos), vw = rp(run.tp + .1).sub(rp(run.tp - .1));   // vitesse relative (hors orbite)
    const dB = pw.clone().sub(sT.pos).applyQuaternion(qi).add(com).sub(bc), hP = dB.length(); dB.normalize();                 // direction et hauteur du passage (repère coque)
    let k = Infinity; ['x', 'y', 'z'].forEach(a => { if(Math.abs(dB[a]) > 1e-4) k = Math.min(k, hs[a]/Math.abs(dB[a])); }); k = Math.min(k, hP - 10);
    const vB = vw.applyQuaternion(qi); vB.addScaledVector(dB, -vB.dot(dB)).normalize(); const lB = new V3().crossVectors(dB, vB).normalize(), sd = R() < .5 ? -1 : 1, h = Math.max(25, hP - k);
    const cp = bc.clone().addScaledVector(dB, k + h*.45).addScaledVector(vB, clamp(tg.len*.35, 40, 220) + h*.25).addScaledVector(lB, sd*h*.38);   // en aval du passage, un peu au-dessus de la coque, décalé
    return T => { const st = subjectState(tg, T), c = hw(st, cp.x, cp.y, cp.z), up = dB.clone().applyQuaternion(st.q), a = rp(T - .1).add(st.pos), hc = hw(st, bc.x, bc.y, bc.z);   // léger retard, relatif à la cible (le repère file à ~5 km/s)
      return { pos: c, look: a.lerp(hc, .18), fov, up }; }; },                 // la coque reste dans le bas du cadre
  hulkPass(sh, t0, d){ // v7.17 : travelling latéral lent le long d'une épave brisée — les tronçons s'écartent, cassures incandescentes
    const H = sh.hk, E = H.E, L = sh.len, tm = t0 + d*.5, ax = H.axisL.clone(), s1 = new V3().crossVectors(ax, v(0, 1, 0)).normalize(), u1 = new V3().crossVectors(s1, ax).normalize(), ro = rr(-.8, .8);
    const side = s1.clone().multiplyScalar(Math.cos(ro)).addScaledVector(u1, Math.sin(ro)).multiplyScalar(R() < .5 ? -1 : 1), dist = Math.max(L*1.05, H.spread(tm)*1.15) + 50, sw = rr(.22, .38)*(R() < .5 ? -1 : 1), fov = rr(42, 50);
    return T => { const F = engFrame(E, T), cc = H.centerL(T), dir = side.clone().applyAxisAngle(u1, sw*((T - t0)/d - .5));
      return { pos: toWorld(F, cc.clone().addScaledVector(dir, dist)), look: toWorld(F, cc), fov, up: u1.clone().applyQuaternion(F.q) }; }; },
  wreckDrift(sh, t0, d){ // v7.16 : lent tour autour d'une épave désemparée — rotation, arcs, fuites de gaz — jusqu'à la rupture du réacteur
    const E = sh.eng, L = sh.len, dist = L*(L > 150 ? rr(2.3, 3) : rr(3.4, 4.6)) + 40, el = rr(.1, .35), a0 = rr(0, 6.28), sw = rr(.1, .2)*(R() < .5 ? -1 : 1), fov = rr(40, 48);
    return T => { const F = engFrame(E, T), c = sh.traj(T).pos, a = a0 + sw*(T - t0), dl = new V3(Math.sin(a)*Math.cos(el), Math.sin(el), Math.cos(a)*Math.cos(el)).applyQuaternion(F.q);
      return { pos: c.clone().addScaledVector(dl, dist), look: c, fov, up: v(0, 1, 0).applyQuaternion(F.q) }; }; },
  convoyPass(sh, t0, d){ // v7.15 : le convoi (ou le cargo attaqué) défile devant un point fixe du repère ; assaillants et escorte le traversent
    const E = sh.eng, civ = E.ships.filter(s => s.civ), cc = t => { const c = new V3(); civ.forEach(s => c.add(cbPose(s, t).p)); return c.multiplyScalar(1/civ.length); };
    const tm = t0 + d*.55, cM = cc(tm), vel = cc(tm + .5).sub(cc(tm - .5)), dir = vel.lengthSq() > 1 ? vel.normalize() : v(0, 0, -1), lat = new V3().crossVectors(dir, v(0, 1, 0)).normalize();
    const n = civ.length, camL = cM.clone().addScaledVector(lat, (R() < .5 ? -1 : 1)*(n > 1 ? rr(560, 720) : rr(380, 500))).addScaledVector(v(0, 1, 0), rr(40, 150)).addScaledVector(dir, rr(-80, 220)), fov = rr(40, 48);
    return T => { const F = engFrame(E, T), c = cc(T); return { pos: toWorld(F, camL), look: toWorld(F, c.lerp(cM, .35)), fov, up: v(0, 1, 0).applyQuaternion(F.q) }; }; },
  patrolArrival(sh, t0, d){ // v7.15 : derrière le cargo attaqué, face à l'horizon d'où surgit la patrouille (éclair de saut, décélération)
    const E = sh.eng, vic = E.ships.find(s => s.civ), tP = E.tP, e0 = E.arrP, fov = rr(40, 46);
    const vL = cbPose(vic, tP).p, dirP = e0.clone().sub(vL).normalize(), lat = new V3().crossVectors(dirP, v(0, 1, 0)).normalize(), sd = R() < .5 ? -1 : 1;
    const off = dirP.clone().multiplyScalar(-rr(260, 360) - vic.len*.5).addScaledVector(v(0, 1, 0), rr(50, 110) + vic.len*.15).addScaledVector(lat, sd*(rr(90, 160) + vic.len*.3));
    return T => { const F = engFrame(E, T), vp = cbPose(vic, T).p, k = smooth(clamp((T - tP - .3)/2.5, 0, 1)), dp = cbPose(sh, T).p, tg = e0.clone().lerp(dp, k), cL = vp.clone().add(off);
      const fz = clamp(2*Math.atan(sh.len*1.6/Math.max(1, cL.distanceTo(k > 0 ? dp : e0)))*57.3, 9, fov);   // téléobjectif : le destroyer garde sa taille à l'image pendant qu'il approche
      return { pos: toWorld(F, cL), look: toWorld(F, tg.lerp(vp, .06)), fov: fz, up: v(0, 1, 0).applyQuaternion(F.q) }; }; },
  planetApproach(sh, t0, d, vis){ // v7.12 : le vaisseau file vers sa planète d'arrivée, qui grossit droit devant (temps accéléré)
    const seg = sh.traj.segs ? sh.traj.segs.filter(s => s.kind === 'transfer' && s.t0 <= t0 + d*.5).pop() : null, pl = seg && seg.dest ? seg.dest : vis.target, L = sh.len;
    const k = rr(2.6, 3.8), h = rr(.6, 1.2), sd = (R()<.5?-1:1)*rr(1.4, 2.2), fov = rr(42, 50), up0 = seg && seg.up;   // trois-quarts arrière : le vaisseau de profil, la planète devant
    return T => { const st = subjectState(sh, T), D = pl.position.clone().sub(st.pos).normalize(), upR = up0 || frameOf(st.q).up, side = new V3().crossVectors(D, upR).normalize(), up = new V3().crossVectors(side, D).normalize();
      return { pos: st.pos.clone().addScaledVector(D, -k*L).addScaledVector(up, h*L).addScaledVector(side, sd*L), look: st.pos.clone().addScaledVector(D, 6*L), fov, up }; }; },
  leaveOrbit(sh, t0, d, vis){ // v7.12 : départ vers l'escale — caméra devant, la planète quittée recule derrière le vaisseau
    const seg = sh.traj.segs ? sh.traj.segs.filter(s => s.kind === 'transfer' && s.t0 <= t0 + d*.5).pop() : null, pl = seg && seg.from ? seg.from : nearestPlanet(vis.leg, subjectState(sh, t0).pos), L = sh.len;
    const k = rr(2.6, 3.8), h = rr(.4, 1), sd = (R()<.5?-1:1)*rr(1.4, 2.2), fov = rr(44, 52), up0 = seg && seg.up;
    return T => { const st = subjectState(sh, T), Bk = st.pos.clone().sub(pl.position).normalize(), upR = up0 || frameOf(st.q).up, side = new V3().crossVectors(Bk, upR).normalize(), up = new V3().crossVectors(side, Bk).normalize();
      return { pos: st.pos.clone().addScaledVector(Bk, k*L).addScaledVector(up, h*L).addScaledVector(side, sd*L), look: st.pos.clone().addScaledVector(Bk, -4*L), fov, up }; }; },
  /* v7.10 : escale au poste 1 — sh = porteur (sh.berthOp) ; bord filmé selon la phase (entrée : bord d'arrivée, sortie : bord de départ) */
  berthApproach(sh, t0, d){ // sur l'échine du porteur, au-dessus de la lèvre : le vaisseau arrive de l'arrière, freine aux RCS, s'aligne
    const op = sh.berthOp, K = op.K, r0 = berthPose(op, t0 + d*.5), out = /release|exit|depart/.test(r0.s), cs = out ? -r0.sx : r0.sx;
    const P = new V3(cs*(K.W/2 + rr(4, 12)), K.HD/2 + 22.5 + rr(7, 14), op.Bc.z + op.cOff.z - rr(50, 90)), fov = rr(38, 46);
    return T => { const st = subjectState(sh, T), c = berthPose(op, T).p.clone().add(op.cOff), k = smoother((T - t0)/d);
      return { pos: hw(st, P.x, P.y - 4*k, P.z), look: hw(st, c.x, c.y, c.z), fov, up: frameOf(st.q).up }; }; },
  fieldCross(sh, t0, d){ // hors du dock, devant la proue, au ras de l'ouverture : la coque traverse le champ de force (onde, champ abaissé)
    const op = sh.berthOp, K = op.K, r0 = berthPose(op, t0 + d*.5), out = /release|exit|depart/.test(r0.s), cs = out ? -r0.sx : r0.sx;
    const zf = op.Bc.z + op.cOff.z - op.len/2 - rr(28, 45), P = new V3(cs*(K.W/2 + rr(18, 30)), rr(-16, 6), zf), fov = rr(44, 52), dz = rr(6, 12);
    return T => { const st = subjectState(sh, T), k = smoother((T - t0)/d), c = berthPose(op, T).p.clone().add(op.cOff), o = new V3(cs*K.W/2, c.y, c.z);
      const lk = o.clone().lerp(c, .35*Math.min(1, 150/Math.max(1, c.distanceTo(o))));
      return { pos: hw(st, P.x, P.y, P.z - dz*k), look: hw(st, lk.x, lk.y, lk.z), fov, up: frameOf(st.q).up }; }; },
  controlRoom(sh, t0, d){ // devant le vitrage de la salle de contrôle avant, en hauteur : tout le dock en enfilade, le vaisseau qui se range
    const op = sh.berthOp, K = op.K, P = new V3(rr(-10, 10), rr(17, 21), K.ZA + rr(4, 6)), fov = rr(58, 68), dx = rr(-4, 4);
    return T => { const st = subjectState(sh, T), c = berthPose(op, T).p.clone().add(op.cOff), k = smoother((T - t0)/d);
      const tg = new V3(clamp(c.x, -K.W/2 - 40, K.W/2 + 40)*.7, lerp(c.y, -K.HD/4, .3), op.Bc.z + op.cOff.z + 25);
      return { pos: hw(st, P.x + dx*k, P.y, P.z), look: hw(st, tg.x, tg.y, tg.z), fov, up: frameOf(st.q).up }; }; },
  deckLevel(sh, t0, d){ // au ras du pont, au bord du poste (côté que la coque ne balaie pas) : contre-plongée sur la coque, les pinces, le plafond
    const op = sh.berthOp, K = op.K, r0 = berthPose(op, t0 + d*.5), out = /release|exit|depart/.test(r0.s), cs = out ? r0.sx : -r0.sx;
    const zc = op.Bc.z + op.cOff.z, P = new V3(cs*44, -K.HD/2 + rr(6, 9), zc + (R() < .5 ? -1 : 1)*rr(11, 19)), fov = rr(54, 64), dz = rr(-6, 6);   // au-dessus des berceaux (3,8 m), entre le berceau central et une pince (z ± 11…19)
    return T => { const st = subjectState(sh, T), c = berthPose(op, T).p.clone().add(op.cOff), k = smoother((T - t0)/d), lx = clamp(c.x, -K.W/2 - 30, K.W/2 + 30);
      return { pos: hw(st, P.x, P.y, P.z + dz*k), look: hw(st, lerp(lx, cs*10, .25), c.y + op.ht*.25, lerp(zc, P.z, .15)), fov, up: frameOf(st.q).up }; }; },
  formation(sh, t0, d){ // v7.4 : patrouille en formation — caméra co-mobile avec le chef, sur le flanc, cadrée sur le centre du groupe
    const grp = sh.formation || [sh], lead = grp[0], side = R()<.5?-1:1, E = 45 + 8*grp.length, a = rr(.9, 1.4), up = rr(.2, .5), fw = rr(-.2, .5), fov = rr(40, 50);
    return T => { const st = subjectState(lead, T), f = frameOf(st.q), c = grp.reduce((acc, m) => acc.add(m.traj(T).pos), new V3()).multiplyScalar(1/grp.length);
      return { pos: c.clone().addScaledVector(f.right, side*E*a).addScaledVector(f.up, E*up).addScaledVector(f.fwd, E*fw), look: c, fov, up: f.up }; }; },
  turretClose(sh, t0, d){ // v7.4 : gros plan sur une tourelle qui balaie (destroyer, corvette)
    const ts = sh.craft.turrets, u = ts[Math.floor(R()*ts.length)], s = u.s, side = R()<.5?-1:1, dv = u.ventral ? -1 : 1, fov = rr(42, 50);
    const cp = u.pos.clone().add(v(side*s*rr(4.5, 6.5), dv*s*rr(2.2, 3.4), -s*rr(3, 6))), lk = u.pos.clone().add(v(0, dv*s*1.0, -s*1.5));
    return T => { const st = subjectState(sh, T); return { pos: hw(st, cp.x, cp.y, cp.z), look: hw(st, lk.x, lk.y, lk.z), fov, up: frameOf(st.q).up.multiplyScalar(dv) }; }; },
  warpRings(sh, t0, d, vis){ // v7.2 : gros plan co-mobile sur un anneau pendant la pré-charge et la charge (émetteurs, halo, lueur)
    // trois-quarts arrière (les anneaux entourent le réacteur, près de la poupe ; la cage ou les réservoirs masqueraient l'avant)
    const Rg = sh.rings, zs = Rg.list.map(r => r.z), zb = Math.max(...zs), zm = (Math.min(...zs) + zb)/2, side = R()<.5?-1:1, Rr = Rg.list[0].R;
    const cp = v(side*Rr*rr(1.1, 1.4), Rr*rr(.4, .7), zb + Rr*rr(1.5, 1.9)), lk = v(side*Rr*.15, Rr*.05, zm), fov = rr(50, 56);
    return T => { const st = subjectState(sh, T); return { pos: hw(st, cp.x, cp.y, cp.z), look: hw(st, lk.x, lk.y, lk.z), fov, up: frameOf(st.q).up }; }; },
  warpEngage(sh, t0, d, vis){ // plan fixe (co-mobile avec l'erre) : charge des bobines, bulle, puis le vaisseau file hors champ
    const W = vis.warp, s0 = subjectState(sh, W.tEng), vm = velT(sh, W.tW0 + .3), f = frameOf(s0.q), L = sh.len, side = R()<.5?-1:1;
    const pos = s0.pos.clone().addScaledVector(W.wDir, -rr(1.9, 2.6)*L).addScaledVector(f.right, side*rr(1.5, 2.2)*L).addScaledVector(f.up, rr(.6, 1.0)*L);   // v7.2.1 : plus près
    const P0 = s0.pos.clone();
    return T => { if(T <= W.tEng){ const st = subjectState(sh, T); return { pos: pos.clone().addScaledVector(vm, T - W.tEng), look: st.pos.clone().addScaledVector(W.wDir, 1.2*L), fov: 52, up: f.up }; }
      const a = P0.clone().addScaledVector(vm, T - W.tEng), dd = Math.min(W.dist(T), W.dE);        // v7.2.1 : le regard accompagne le démarrage
      return { pos: pos.clone().addScaledVector(vm, T - W.tEng), look: a.addScaledVector(W.wDir, 1.2*L + .5*dd), fov: 52, up: f.up }; }; },
  warpChase(sh, t0, d){ const L = sh.len, side = R()<.5?-1:1, a = rr(2.6, 3.6), h = rr(.6, 1.1), fov = rr(56, 64);
    return T => { const st = subjectState(sh, T), f = frameOf(st.q); return { pos: st.pos.clone().addScaledVector(f.fwd, -a*L).addScaledVector(f.up, h*L).addScaledVector(f.right, side*.7*L), look: st.pos.clone().addScaledVector(f.fwd, 3*L), fov, up: f.up }; }; },
  warpSide(sh, t0, d){ const L = sh.len, side = R()<.5?-1:1, k = rr(2.6, 3.6), fov = rr(50, 58);
    return T => { const st = subjectState(sh, T), f = frameOf(st.q); return { pos: st.pos.clone().addScaledVector(f.right, side*k*L).addScaledVector(f.up, .4*L).addScaledVector(f.fwd, -.4*L), look: st.pos.clone().addScaledVector(f.fwd, .5*L), fov, up: f.up }; }; },
  warpFront(sh, t0, d){ const L = sh.len, side = R()<.5?-1:1, k = rr(4, 5.5), fov = rr(52, 60);
    return T => { const st = subjectState(sh, T), f = frameOf(st.q); return { pos: st.pos.clone().addScaledVector(f.fwd, k*L).addScaledVector(f.up, .6*L).addScaledVector(f.right, side*.9*L), look: st.pos, fov, up: f.up }; }; },
  warpArrive(sh, t0, d, vis){ // plan fixe au point de sortie : la traînée se contracte, éclair, le vaisseau apparaît
    const dir = vis.arrDir, P0 = vis.arrP0, L = sh.len, s1 = subjectState(sh, vis.tArrive + .5), f = frameOf(s1.q), side = R()<.5?-1:1;
    const pos = P0.clone().addScaledVector(dir, rr(4, 6.5)*L).addScaledVector(f.right, side*rr(2.8, 4.2)*L).addScaledVector(f.up, rr(1, 1.8)*L);
    return T => ({ pos: pos.clone(), look: P0.clone().addScaledVector(dir, -.8*L), fov: 54, up: f.up }); },
  shipTransit(sh, t0, d, vis){ // la silhouette du vaisseau devant le disque de l'étoile (caméra en formation très loin derrière, longue focale)
    const S3 = vis.leg.star3, Rs = S3.Rs, st = subjectState(sh, t0 + d*.5), L = sh.len;
    const u = st.pos.clone().normalize(), D = st.pos.length();
    const dm = L*D/(1.15*Rs - L), theta = Rs/(D + dm), fov = clamp(theta*57.3*5, 1.2, 30), up = perpTo(u);
    return T => { const s = subjectState(sh, T); return { pos: s.pos.clone().addScaledVector(u, dm), look: s.pos.clone().addScaledVector(u, -D*.5), fov, up }; }; },
  jump(sh, t0, d, vis){ // plan fixe (co-mobile) en surplomb latéral : on voit le quadrillage se creuser sous le vaisseau
    const s0 = subjectState(sh, vis.tJ), vm = velT(sh, vis.tJ + .5), f = frameOf(s0.q), L = sh.len, side = R()<.5?-1:1;
    const pos = s0.pos.clone().addScaledVector(f.right, side*rr(3.0,3.8)*L).addScaledVector(f.up, rr(1.7,2.3)*L).addScaledVector(f.fwd, rr(-1.8,.4)*L);
    return T => { const st = subjectState(sh, T); return { pos: pos.clone().addScaledVector(vm, T - vis.tJ), look: st.pos.clone().addScaledVector(f.up, -.75*L).addScaledVector(f.fwd, .3*L), fov: 52, up: f.up }; }; },
  arriveFront(sh, t0, d, vis){ // v7.7 : contre-champ — la caméra attend devant le point d'arrivée, regard vers l'arrière : éclair au fond de l'image, le vaisseau vient vers nous
    const s0 = subjectState(sh, vis.tArrive + .6), vm = velT(sh, vis.tArrive + 1), f = frameOf(s0.q), L = sh.len, side = R()<.5?-1:1, Tr = vis.tArrive + .6;
    const fw = vm.lengthSq() > 1 ? vm.clone().normalize() : f.fwd.clone(), rt = new V3().crossVectors(fw, f.up).normalize();
    const D0 = rr(16, 22)*L, D1 = rr(5, 7)*L, lat = side*rr(2.2, 3.4)*L, upo = rr(-.6, 1.4)*L, t1 = vis.tT0 + .3, fov = rr(34, 40);
    return T => { const k = smoother(clamp((T - vis.tArrive)/Math.max(1, t1 - vis.tArrive), 0, 1)), base = s0.pos.clone().addScaledVector(vm, Math.min(T, vis.tT0) - Tr);
      const st = subjectState(sh, Math.max(T, vis.tArrive));
      return { pos: base.clone().addScaledVector(fw, lerp(D0, D1, k)).addScaledVector(rt, lat).addScaledVector(f.up, upo), look: st.pos.clone().addScaledVector(fw, -1.5*L*(1 - k)), fov, up: f.up }; }; },
  reveal(sh, t0, d, vis){ // v7.9 : plan-séquence de révélation — au ras de la coque, puis recul et grue : la planète apparaît derrière le vaisseau
    const s0 = subjectState(sh, t0), pl = nearestPlanet(vis.leg, s0.pos); if(!pl || !sh.hull || s0.pos.distanceTo(pl.position) > pl.radius*8) return SHOTS.orbitcam(sh, t0, d, vis);
    if(s0.pos.clone().sub(pl.position).normalize().dot(pl.position.clone().negate().normalize()) < 0) return SHOTS.orbitcam(sh, t0, d, vis);   // côté nuit : vaisseau en contre-jour invisible
    const B = sh.hull.box, L = sh.len, side = litSide(sh, t0), ctr = B.getCenter(new V3()), qi = s0.q.clone().invert();
    const toP = pl.position.clone().sub(s0.pos).normalize().applyQuaternion(qi), com = sh.com ? ctr.clone() : ctr;
    const m = rr(.08, .14)*L, x0 = side > 0 ? B.max.x + m : B.min.x - m, y0 = lerp(B.min.y, B.max.y, rr(.55, .95)), z0 = lerp(B.min.z, B.max.z, rr(.55, .75));
    const P0 = new V3(x0, y0, z0), E = com.clone().addScaledVector(toP, -rr(5.5, 7.5)*L).add(new V3(side*rr(.6, 1.6)*L, 0, rr(-.5, .5)*L));
    const P1 = P0.clone().add(new V3(side*.9*L, .35*L, .25*L)), P2 = E.clone().lerp(com, .3).add(new V3(side*.4*L, .6*L, 0));
    const lookA = new V3(x0*.25, y0, B.min.z - .15*L), lookB = com.clone().addScaledVector(toP, 2.2*L);
    return T => { const st = subjectState(sh, T), k = smoother((T - t0)/d), p = bez3(P0, P1, P2, E, k), lk = lookA.clone().lerp(lookB, smoother(Math.min(1, k*1.35)));
      return { pos: hw(st, p.x, p.y, p.z), look: hw(st, lk.x, lk.y, lk.z), fov: lerp(58, 42, k), up: frameOf(st.q).up }; }; },
  planetDrift(sh, t0, d, vis){ // v7.7 : travelling lent — la planète en grand sous l'horizon, le vaisseau petit au premier tiers, dérive latérale co-mobile
    const s0 = subjectState(sh, t0), pl = nearestPlanet(vis.leg, s0.pos);
    if(!pl || s0.pos.distanceTo(pl.position) > pl.radius*6) return SHOTS.wide(sh, t0, d, vis);
    const L = sh.len, side = R()<.5?-1:1, D0 = rr(14, 24)*L, D1 = D0*rr(.8, .92), lat0 = side*rr(4, 8)*L, lat1 = lat0*rr(1.4, 1.9), h = rr(1.5, 3.5)*L, fov = rr(52, 62);
    return T => { const st = subjectState(sh, T), C = pl.position, r = st.pos.clone().sub(C), alt = r.length() - pl.radius; r.normalize();
      let t = velT(sh, T); t.sub(r.clone().multiplyScalar(t.dot(r))); if(t.lengthSq() < 1e-9) t = perpTo(r, v(0, 1, 0)); t.normalize();
      const sd = new V3().crossVectors(t, r).normalize(), k = smoother((T - t0)/d), dip = Math.acos(clamp(pl.radius/(pl.radius + Math.max(alt, 1)), -1, 1));
      const pos = st.pos.clone().addScaledVector(t, -lerp(D0, D1, k)).addScaledVector(sd, lerp(lat0, lat1, k)).addScaledVector(r, h);
      const fw = t.clone().multiplyScalar(Math.cos(dip*.55)).addScaledVector(r, -Math.sin(dip*.55));
      return { pos, look: pos.clone().addScaledVector(fw, 1e5), fov, up: r }; }; },
  arrive(sh, t0, d, vis){ // plan fixe sur le point d'arrivée : l'espace se creuse, éclair, le vaisseau apparaît
    const s0 = subjectState(sh, vis.tArrive + .6), vm = velT(sh, vis.tArrive + 1), f = frameOf(s0.q), L = sh.len, side = R()<.5?-1:1, behind = R() < .6;
    const pos = behind ? s0.pos.clone().addScaledVector(f.fwd, -5.2*L).addScaledVector(f.right, side*3.2*L).addScaledVector(f.up, 2.4*L)
                       : s0.pos.clone().addScaledVector(f.fwd, 7*L).addScaledVector(f.right, side*3.4*L).addScaledVector(f.up, 2.2*L);
    const Tr = vis.tArrive + .6;
    return T => { const st = subjectState(sh, Math.max(T, vis.tArrive)); return { pos: pos.clone().addScaledVector(vm, Math.min(T, vis.tT0) - Tr), look: st.pos.clone().addScaledVector(f.up, -.6*L).addScaledVector(f.fwd, behind ? 2.5*L : 0), fov: 50, up: f.up }; }; }
};
/* ---------- gros plans sur les vaisseaux (détails de coque, moteurs, RCS, géode) ----------
   caméras placées dans le repère du vaisseau, hors de sa boîte englobante (jamais dans la coque) */
const CLOSE = { hullDolly:1, engineClose:1, bowClose:1, rcsClose:1, geodeClose:1, dockClose:1, warpRings:1, turretClose:1 };
/* ---------- profondeur de champ (lot 3) : gros plans et manœuvres de baie ----------
   ouverture fixée au début du plan (0,45–0,75 % de la hauteur d'image, plus forte en longue focale), mise au point sur le point visé,
   lissée (pas de « pompage »), ouverture progressive en 0,4 s ; coupée si la résolution dynamique descend sous 0,7 */
let DOF_ON = PARAMS.get('dof') !== '0';
const DOF_FORCE = PARAMS.get('dof') === '1';                               // ?dof=1 : sans la coupure liée à la résolution
const DOF = { k: 0, want: 0, focus: 50, r: .006, shot: null, off: false };
function updateDof(dt, c){
  if(shot !== DOF.shot){
    DOF.shot = shot; const pr = renderer.getPixelRatio(); if(pr < .7 && !DOF_FORCE) DOF.off = true; else if(pr >= .85 || DOF_FORCE) DOF.off = false;
    DOF.want = DOF_ON && !DOF.off && !shot.vista && !shot.gal && (CLOSE[shot.type] || shot.type === 'bayOps') ? 1 : 0;
    const h = Math.abs(Math.sin(shot.t0*12.9898 + 4.1)*43758.5453) % 1;                   // tirage propre au plan, sans toucher au hasard du réalisateur
    DOF.r = (.0045 + .003*h)*clamp(50/c.fov, .85, 1.3); DOF.focus = null; if(!DOF.want) DOF.k = 0;
  }
  if(!DOF.want){ DOF.k = 0; return; }
  const f = Math.max(.3, c.look.clone().sub(c.pos).dot(frameOf(cam.quaternion).fwd));
  DOF.focus = DOF.focus == null ? f : DOF.focus*Math.pow(f/DOF.focus, 1 - Math.exp(-dt/.15));
  DOF.k += (1 - DOF.k)*(1 - Math.exp(-dt/.13));
}
/* ---------- tremblement de caméra (lot 3) ----------
   allumage (front montant de la poussée, puis vibration fine), battements de la géode, repli, éclair et onde du saut,
   engagement de la distorsion, sortie de saut ; nul au-delà de 3 longueurs de vaisseau, ≤ 0,6°, coupé si mouvement réduit */
const SHAKE = { on: PARAMS.get('shake') !== '0', ev: [], lastThr: 0, subj: null, I: 0 };
const REDUCED = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
const shakeNoise = (t, s) => Math.sin(t*11.3 + s)*.5 + Math.sin(t*17.9 + s*2.1)*.3 + Math.sin(t*27.1 + s*3.7)*.2;
function shakeIntensity(T, dt){
  const vis = visit, sh = shot.subj; if(!sh || !sh.traj || !sh.len || shot.vista || shot.gal) return 0;
  const att = src => { if(!src || !src.traj) return 0; const d = subjectState(src, T).pos.distanceTo(cam.position)/src.len; return clamp(1 - (d - .6)/2.4, 0, 1); };
  let I = 0;
  const thr = sh.traj(T).throttle || 0;
  if(SHAKE.subj !== sh){ SHAKE.subj = sh; SHAKE.lastThr = thr; SHAKE.ev.length = 0; }
  if(thr > .08 && SHAKE.lastThr <= .08 && dt > 0) SHAKE.ev.push({ t0: T, a: .55, tau: .32 });                          // allumage
  SHAKE.lastThr = thr;
  if(SHAKE.ev.length && T - SHAKE.ev[0].t0 > 2.5) SHAKE.ev.shift();
  const aS = att(sh); if(aS > 0){ let e = .07*thr; SHAKE.ev.forEach(x => e += x.a*Math.exp(-(T - x.t0)/x.tau)); I += aS*e; }
  const dep = vis.departer, aD = T > vis.tJ - 3 ? att(dep) : 0;
  if(aD > 0){
    if(vis.mode === 'jump'){ const u = T - vis.tJ;
      if(u > 0 && u < JT.charge) I += aD*(.1*(u/JT.charge) + .42*geodePulse(u).p);                                         // battements de la géode
      else if(u >= JT.charge && u < JT.charge + JT.fold) I += aD*.6*smooth((u - JT.charge)/JT.fold);                     // l'espace se replie
      else if(u >= JT.charge + JT.fold) I += aD*Math.exp(-(u - JT.charge - JT.fold)/.35);                                  // éclair et onde
    } else if(vis.warp){ const W = vis.warp; if(T > W.tW0 && T < W.tEng) I += aD*.18*smooth((T - W.tW0)/(W.tEng - W.tW0)); else if(T >= W.tEng){ I += aD*.25*Math.exp(-(T - W.tEng)/.35); if(T >= W.tCru) I += aD*.9*Math.exp(-(T - W.tCru)/.35); } }   // v7.2.1 : secousse à la disparition
  }
  if(vis.arrMode !== 'warp'){ const u = T - vis.tArrive; if(u > 0 && u < 2) I += att(vis.hero)*.7*Math.exp(-u/.3); }     // sortie de saut
  return Math.min(1, I);
}
function applyShake(T, dt, fov){
  if(!SHAKE.on || (REDUCED && REDUCED.matches)){ SHAKE.I = 0; return; }
  const I = shakeIntensity(T, dt); SHAKE.I = I; if(I < .003) return;
  const a = .011*I*clamp(fov/50, .5, 1.3);
  cam.rotateX(a*shakeNoise(T, 1.3)); cam.rotateY(a*shakeNoise(T, 4.1)); cam.rotateZ(.6*a*shakeNoise(T, 7.7));
}
function hw(st, x, y, z){ const v_ = new V3(x, y, z); if(st.com) v_.sub(st.com); return v_.applyQuaternion(st.q).add(st.pos); }   // repère coque → monde (racine = centre de gravité)
function sunBody(sh, T){ const st = subjectState(sh, T); return st.pos.clone().negate().normalize().applyQuaternion(st.q.clone().invert()); }   // direction de l'étoile dans le repère coque
function litSide(sh, T){ const d = sunBody(sh, T); return (R() < .85 ? 1 : -1)*(d.x >= 0 ? 1 : -1); }   // 85 % côté éclairé
function closeOpts(sh, phase){
  if(sh.isCarrier) return [['torchClose', 1.6], ['dockPass', 1], ['radiatorPass', 1]];   // v7.11 : porteur héros ou partant
  if(!sh.hull) return [];
  const eng = sh.hull.drive ? 1 : 0, rcs = sh.hull.rcs.length ? 1 : 0, dock = sh.hull.docks && sh.hull.docks.length ? 1 : 0;
  if(phase === 'flip') return [['rcsClose', 2.4*rcs], ['engineClose', 1*eng], ['hullDolly', 1]];
  if(phase === 'transfer') return [['engineClose', 1.8*eng], ['hullDolly', 1.3], ['bowClose', .8], ['dockClose', .6*dock]];
  if(phase === 'orbit') return [['hullDolly', 2.2], ['bowClose', 1.3], ['engineClose', .8*eng], ['geodeClose', sh.geode ? .6 : 0], ['dockClose', 1.4*dock]];
  return [['engineClose', 2*eng], ['hullDolly', 1.2], ['bowClose', .6], ['dockClose', .7*dock]];
}
Object.assign(SHOTS, {
  hullDolly(sh, t0, d){ // travelling au ras de la coque : on longe les tôles, l'usure, les conteneurs
    const B = sh.hull.box, L = sh.len, side = litSide(sh, t0), m = rr(.07, .15)*L, dir = R()<.5?1:-1, fov = rr(38, 48);
    const x = side > 0 ? B.max.x + m : B.min.x - m, y = lerp(B.min.y, B.max.y, rr(.35, 1.05));
    const za = lerp(B.min.z, B.max.z, dir > 0 ? .12 : .88), zb = lerp(B.min.z, B.max.z, dir > 0 ? .62 : .38);
    return T => { const st = subjectState(sh, T), z = lerp(za, zb, smoother((T - t0)/d));
      return { pos: hw(st, x, y, z), look: hw(st, x*.15, (B.min.y + B.max.y)*.5, z + dir*.2*L), fov, up: frameOf(st.q).up }; }; },
  engineClose(sh, t0, d){ // autour des tuyères : tubes, bobines, incandescence du col, départ du jet
    const B = sh.hull.box, L = sh.len, dc = sh.hull.drive || new V3(0, 0, B.max.z);
    const sd = sunBody(sh, t0), R0 = Math.max(B.max.x - B.min.x, B.max.y - B.min.y)*.5, a0 = Math.atan2(sd.y, sd.x) + rr(-1.1, 1.1), w = rr(.05, .1)*(R()<.5?-1:1), rad = R0*rr(1.1, 1.4), back = rr(-.02, .2)*L, fov = rr(40, 50);
    return T => { const st = subjectState(sh, T), a = a0 + w*(T - t0);
      return { pos: hw(st, Math.cos(a)*rad, Math.sin(a)*rad, dc.z + back), look: hw(st, 0, 0, dc.z - .07*L), fov, up: frameOf(st.q).up }; }; },
  bowClose(sh, t0, d){ // proue en contre-plongée légère, lente avancée
    const B = sh.hull.box, L = sh.len, side = litSide(sh, t0), fov = rr(40, 50);
    const p0 = new V3(side*(Math.max(B.max.x, -B.min.x)*.9 + .1*L), B.max.y*.6 + .05*L, B.min.z - rr(.12, .22)*L), p1 = p0.clone().add(new V3(-side*.04*L, 0, .06*L));
    return T => { const st = subjectState(sh, T), p = p0.clone().lerp(p1, smoother((T - t0)/d));
      return { pos: hw(st, p.x, p.y, p.z), look: hw(st, 0, B.max.y*.2, B.min.z + .22*L), fov, up: frameOf(st.q).up }; }; },
  rcsClose(sh, t0, d){ // bloc RCS en gros plan pendant un retournement : bouffées, gaz qui reste en arrière
    const H = sh.hull, L = sh.len, pods = H.rcs.slice().sort((a, b) => a.z - b.z), pod = R() < .6 ? pods[0] : pick(pods);
    const P = new V3(pod.x, pod.y, pod.z), n = new V3(pod.nx, pod.ny, 0).normalize(), s = new V3().crossVectors(n, v(0,0,1)).normalize(), side = R()<.5?-1:1, fov = rr(44, 54);
    const zc = (H.box.min.z + H.box.max.z)/2, cp = P.clone().addScaledVector(n, .22*L).addScaledVector(s, side*.2*L).add(v(0, 0, (P.z < zc ? -1 : 1)*.12*L));
    const lk = P.clone().addScaledVector(n, .05*L);
    return T => { const st = subjectState(sh, T); return { pos: hw(st, cp.x, cp.y, cp.z), look: hw(st, lk.x, lk.y, lk.z), fov, up: frameOf(st.q).up }; }; },
  dockClose(sh, t0, d){ // plongée dans une baie de hangar : volume intérieur, nacelle arrimée, balisage du seuil
    const list = sh.hull.docks, sd = sunBody(sh, t0);
    const bay = list.length > 1 ? list.slice().sort((a, b) => b.N.dot(sd) - a.N.dot(sd))[R() < .8 ? 0 : 1] : list[0];
    const C = bay.C, N = bay.N, Ta = bay.T, Bv = bay.B, side = R()<.5?-1:1, fov = rr(48, 58);
    let p0;
    if(bay.ventral) p0 = C.clone().addScaledVector(N, Math.max(bay.hx, bay.hy)*rr(1.05, 1.45)).addScaledVector(Ta, side*bay.hx*rr(.9, 1.4)).addScaledVector(Bv, (R()<.5?-1:1)*bay.hy*rr(.4, 1.1));   // en biais : profondeur lisible
    else p0 = C.clone().addScaledVector(N, rr(4, 5.4)).addScaledVector(Bv, (R() < .65 ? 1 : -1)*rr(3, 4.5)).addScaledVector(Ta, side*bay.hx*rr(.3, .8));   // entre coque et nacelles
    const p1 = p0.clone().addScaledVector(Ta, -side*bay.hx*.3).lerp(C, .08);
    const lk = C.clone().addScaledVector(N, -bay.D*.45);
    const upK = bay.ventral ? (R() < .5 ? 'fwd' : 'right') : 'up';            // vue en contre-plongée : le haut de l'image suit l'axe du vaisseau
    return T => { const st = subjectState(sh, T), p = p0.clone().lerp(p1, smoother((T - t0)/d));
      return { pos: hw(st, p.x, p.y, p.z), look: hw(st, lk.x, lk.y, lk.z), fov, up: frameOf(st.q)[upK] }; }; },
  berthDepart(sh, t0, d){ return SHOTS.berthApproach(sh, t0, d); },   // v7.10 : même poste d'observation, bord de sortie (dégagement, allumage de la torche)
  bayOps(sh, t0, d){ // un engin sort ou rentre par le champ de force d'une baie (repère du porteur)
    const op = sh.bayShot || sh.bays[0], D = op.d, side = R() < .5 ? -1 : 1;
    opEnsure(op, t0 + d + 2);
    const crew = op.kind === 'crew', belly = D.mode === 'belly', small = D.hy < 2;
    const far = belly ? rr(22, 32) : (crew ? rr(34, 48) : rr(17, 22));
    const P = D.C.clone().addScaledVector(D.N, far).addScaledVector(D.T, side*far*rr(.45, .75)).addScaledVector(D.B, belly ? rr(-5, 5) : (small ? rr(9, 12) : rr(2, 8)));
    const fov = rr(46, 54);
    return T => { const st = subjectState(sh, T), r = opPose(op, T); let cp = r.center.clone(); const rel = cp.clone().sub(D.C); if(rel.length() > 70) cp = D.C.clone().addScaledVector(rel.normalize(), 70);
      const lk = D.C.clone().lerp(cp, r.vis === false ? 0 : .5);
      return { pos: hw(st, P.x, P.y, P.z), look: hw(st, lk.x, lk.y, lk.z), fov, up: frameOf(st.q).up }; }; },
  geodeClose(sh, t0, d){ // géode du cœur de saut sur son mât : elle bat de plus en plus vite avant le saut
    const G = sh.geode, B = sh.hull.box, L = sh.len, side = R()<.5?-1:1, c = G.pos, r = G.r*1.6;
    const cp = c.clone().add(v(side*r*rr(4.5, 6), r*rr(1.4, 2.4), -r*rr(3, 5))), fov = rr(40, 46);
    return T => { const st = subjectState(sh, T); return { pos: hw(st, cp.x, cp.y, cp.z), look: hw(st, c.x*.8, c.y - r*.15, c.z + r*.2), fov, up: frameOf(st.q).up }; }; }
});
function segAt(vis, sh, T){ const st = sh.traj(T); return st.seg; }
function carPickFor(car, T, d){                                              // plans du porteur (poste 1 occupé → caméra hors de la coque du visiteur)
  const CAR = ['dockPass', 'dockPass', 'dockInterior', 'dockInterior', 'dockBerth', 'torchClose', 'radiatorPass', 'lateral', 'tripod'];
  let t, n = 0; do { t = pick(CAR); n++; } while(n < 5 && t === shotLog[shotLog.length - 1]);
  if(t === 'dockInterior' && car.berthOp && berthBusy(car.berthOp, T, T + Math.max(d, 6.5))) t = 'deckLevel';
  return t;
}
function carrierOpts(seg, calm){                                             // v7.11 : porteur héros (voyage) — pas de gros plans de vaisseau du jeu
  if(seg === 'transfer') return [['wide', 2], ['lateral', 2], ['chase', 1.5], ['front', 1], ['orbitcam', 1.2], ['torchClose', 1.2], ['radiatorPass', .6]];
  if(seg === 'orbit') return [['dockPass', 2], ['dockInterior', 1.2], ['dockBerth', 1], ['torchClose', 1], ['radiatorPass', .8], ['limb', 1.2], ['orbitcam', 1], ['wide', 1], ['lateral', 1], ['tripod', calm ? 1 : 0]];
  if(seg === 'depart') return [['chase', 2], ['torchClose', 2], ['radiatorPass', 1], ['wide', 1.2], ['lateral', 1]];
  return [['wide', 1], ['lateral', 1], ['chase', 1]];
}
function berthShotFor(vis, car, T, d, jumpShotStart, tag){                    // v7.10 : escale en cours au poste 1 → plans dédiés
  const op = car.berthOp; if(!op) return null;
  const r = berthPose(op, T + 1), g = r.seg, ph = r.s;
  if(ph === 'gone' || ph === 'docked' || ph === 'roam' || (ph === 'approach' && g.t1 - T > 22) || (ph === 'depart' && T - g.t0 > 9)) return null;
  const segEnd = n => { const x = op.plan.find(h => h.s === n && h.t1 > T); return x ? x.t1 : T + d; };
  const C_ = ph === 'approach' ? [['berthApproach', 1.4], ['deckLevel', .6], ['controlRoom', .5]] : (ph === 'align' || ph === 'slide' || ph === 'exit') ? [['fieldCross', 1.2], ['deckLevel', 1], ['controlRoom', .8]]
    : (ph === 'clamp' || ph === 'release') ? [['deckLevel', 1], ['controlRoom', 1]] : [['berthDepart', 1.3], ['fieldCross', .6]];
  const cand = C_.filter(c => c[0] !== shotLog[shotLog.length - 1] || C_.length === 1); const type = pickW(cand.length ? cand : C_);
  const end = ph === 'approach' ? segEnd('align') + 3 : (ph === 'depart' ? g.t0 + 18 : (ph === 'align' ? segEnd('slide') + 1 : g.t1 + (ph === 'clamp' || ph === 'release' ? rr(2, 4) : 1)));
  let d2 = clamp(end - T, 5, 14); if(T + d2 > jumpShotStart - 2.4) d2 = Math.max(3.2, jumpShotStart - 2.4 - T);
  return makeShot(type, car, T, T + d2, vis, tag);
}
function strafeIn(s, T){                                                      // v7.15 : assaillant en piqué sur une grande coque, passage dans 2 à 8 s
  const o = s.cbOpp, a = s.traj(T), rel = o.traj(T).pos.sub(a.pos), dd = rel.length(); if(dd < 650 || dd > 1700) return false;
  if(rel.normalize().dot(frameOf(a.q).fwd) < .8) return false;
  let tp = T, best = dd; for(let x = .5; x <= 8; x += .5){ const q = s.traj(T + x).pos.distanceTo(o.traj(T + x).pos); if(q < best){ best = q; tp = T + x; } }
  if(tp - T < 2 || best > 700) return false; s.cbRun = { tp, dMin: best }; return true;
}
function combatShot(vis, E, T, d, jss){                                      // v7.14 : plan d'engagement (v7.15 : convoi, raid, assaut)
  const pres = s => s.leg === vis.leg && !(s.hideAt && s.hideAt(T));            // présence (la visibilité de l'image précédente peut être coupée par un travelling)
  const alive = E.ships.filter(s => pres(s) && !(s.hp && s.hp.disabled)), vis_ = E.ships.filter(pres); if(!vis_.length) return null;
  const clip = x => T + x > jss - 2.4 ? Math.max(3.2, jss - 2.4 - T) : x, cap = sh => { sh.caption.planet = engTitle(E); return sh; };
  if(E.kind === 'raid' && !E.arrShown && E.patrolLead && T >= E.tP - 2.6 && T < E.tP + 1.5){ E.arrShown = true; E.lastType = 'patrolArrival';   // v7.15 : la patrouille surgit — plan réservé
    return cap(makeShot('patrolArrival', E.patrolLead, T, T + clip(Math.max(6.5, E.tP + 6.5 - T)), vis, 'combat')); }
  const doom = vis_.filter(s => s.hp && s.hp.boom && !s.hp.dead && s.hp.boom > T + 1.2 && s.hp.boom < T + 7).sort((a, b) => b.len - a.len)[0];   // v7.16 : une épave va exploser
  if(doom && (doom.len > 60 || R() < .8)){ E.lastType = 'wreckDrift'; return cap(makeShot('wreckDrift', doom, T, T + clip(doom.hp.boom - T + (doom.len > 60 ? 3.4 : 2.4)), vis, 'combat')); }
  const hk = CBT.hulks.find(H => H.E === E && T - H.t0 > 2.5 && H.shown < 2 && T > H.nextOk);   // v7.17 : une épave brisée à filmer
  if(hk && R() < .6){ hk.shown++; hk.nextOk = T + 20; E.lastType = 'hulkPass'; return cap(makeShot('hulkPass', hk.subj, T, T + clip(rr(7, 9.5)), vis, 'combat')); }
  const mis = E.missiles.find(m => !m.dead && T - m.t0 < 4 && pres(m.sh));
  const chasers = alive.filter(s => { if(!s.cbOpp || !pres(s.cbOpp)) return false; const st = s.traj(T), rel = s.cbOpp.traj(T).pos.sub(st.pos), dd = rel.length(); return dd < 1400 && rel.normalize().dot(frameOf(st.q).fwd) > .6; });
  let opts, civ = [], bigs = [], turr = [], runs = [];
  if(E.kind === 'skirmish') opts = [['battleWide', 1.2], ['dogfight', chasers.length ? 2.4 : 0], ['missileCam', mis ? 2.6 : 0], ['lateral', .9], ['orbitcam', .7], ['chase', .6]];
  else if(E.kind === 'duel') opts = [['battleWide', 1.5], ['duelSide', 2], ['missileCam', mis ? 2.3 : 0], ['turretClose', alive.length ? 1.2 : 0], ['lateral', .5]];
  else { civ = vis_.filter(s => s.civ); bigs = alive.filter(s => !s.civ && s.model !== 'fighter' && s.cbOpp && pres(s.cbOpp)); turr = bigs.filter(s => s.craft && s.craft.turrets && s.craft.turrets.length);
    runs = alive.filter(s => s.model === 'fighter' && s.side === 1 && s.cbOpp && s.cbOpp.len > 90 && pres(s.cbOpp) && !(s.cbStop && T > s.cbStop) && strafeIn(s, T));
    opts = [['battleWide', 1.1], ['dogfight', chasers.length ? 1.8 : 0], ['missileCam', mis ? 1.8 : 0], ['strafeRun', runs.length ? 2.8 : 0], ['convoyPass', civ.length ? 1.2 : 0], ['duelSide', bigs.length ? .8 : 0], ['turretClose', turr.length ? .5 : 0], ['lateral', .4]]; }
  let type, n = 0; do { type = pickW(opts); n++; } while(n < 5 && type === E.lastType); E.lastType = type;
  const pool = alive.length ? alive : vis_, duel = E.kind === 'duel' || E.kind === 'skirmish';
  const subj = type === 'dogfight' ? pick(chasers) : type === 'missileCam' ? mis.sh : type === 'strafeRun' ? pick(runs) : type === 'convoyPass' ? pick(civ)
    : (type === 'duelSide' || type === 'turretClose') ? (duel ? pick(pool.filter(s => s.model === 'destroyer')) || pick(pool) : pick(type === 'duelSide' ? bigs : turr))
    : (type === 'battleWide' && !duel) ? pick(pool.filter(s => s.cbOpp && pres(s.cbOpp))) || pick(pool) : pick(pool);   // v7.15 : plan large sur une paire d'adversaires
  if(!subj) return null;
  let d2 = type === 'battleWide' ? rr(6.5, 9) : type === 'missileCam' ? rr(4.5, 6) : type === 'strafeRun' ? clamp(subj.cbRun.tp - T + rr(1.4, 2), 3.5, 8.5) : type === 'convoyPass' ? rr(7, 9) : rr(4.5, 6.5); d2 = clip(d2);
  if(E.kind === 'raid' && !E.arrShown && T < E.tP - 2.6 && T + d2 > E.tP - 2.5) d2 = Math.max(1.5, E.tP - 2.5 - T);   // le plan s'arrête avant l'arrivée de la patrouille
  return cap(makeShot(type, subj, T, T + d2, vis, 'combat'));
}
function chooseShot(T){
  const vis = visit;
  const dep = vis.departer;
  // 1) arrivée
  if(!vis.userHero && T < vis.tArrive + (vis.arrMode === 'warp' ? 2.6 : (vis.arrFront ? 2.9 : 3.4))){
    if(vis.arrMode === 'warp') return makeShot('warpArrive', vis.hero, T, vis.tArrive + rr(2.9, 3.4), vis);
    if(vis.arrFront === undefined) vis.arrFront = R() < .35;                  // v7.7 : contre-champ d'arrivée une fois sur trois
    return makeShot(vis.arrFront ? 'arriveFront' : 'arrive', vis.hero, Math.min(T, vis.tArrive - 1.8), vis.arrFront ? vis.tT0 + .3 : vis.tArrive + rr(3.7, 4.3), vis);   // contre-champ : coupé au début du transfert
  }
  // 2) départ imminent : saut quantique ou passage en distorsion, plans dédiés
  const jumpShotStart = vis.tJ - rr(1.6, 2.6);
  if(T >= jumpShotStart - 2.4){
    if(vis.mode === 'jump'){
      if(vis.geodePlan === undefined) vis.geodePlan = !!(dep.geode && R() < .7);
      if(vis.geodePlan && T < vis.tJ - .8) return makeShot(pickW(closeOpts(dep, 'depart')), dep, T, vis.tJ - .8, vis);        // approche en gros plan
      if(vis.geodePlan && T < vis.tJ + JT.charge - .35) return makeShot('geodeClose', dep, T, vis.tJ + JT.charge - .35, vis);  // la géode bat
      return makeShot('jump', dep, T, vis.tEnd + .05, vis);
    }
    if(vis.ringPlan === undefined) vis.ringPlan = !!(dep.rings && vis.warp && R() < .7);                     // v7.2 : anneaux en gros plan
    if(vis.ringPlan && T < vis.warp.tEng - .2) return makeShot('warpRings', dep, T, vis.warp.tEng - .15, vis);
    if(T < vis.tCru + 2.8) return makeShot('warpEngage', dep, T, vis.tCru + 3.0, vis);                          // v7.2.1 : on reste pour la dispersion
    const sh2 = makeShot(pick(['warpChase','warpSide','warpFront','warpChase']), dep, T, vis.tEnd + .05, vis);
    sh2.caption.planet = 'Superluminal transit → ' + vis.nextLeg.name + ' · ' + fmtInt(vis.warp.Vc) + ' c'; return sh2;
  }
  // 3) plan courant : type selon la phase, durée bornée pour ne pas chevaucher le plan du saut
  // v7.12 : escale — deux raccords filmés : la planète quittée qui recule (fin d'orbite A), la planète d'escale qui grossit jusqu'à la mise en orbite
  const sp = vis.stop, W1 = sp ? [sp.tA1 - 4, sp.tA1 + 1] : null, W2 = sp ? [sp.tB0 - 6, sp.tB0 - 1.5] : null;
  if(sp && !sp.leftShown && T >= W1[0] && T < W1[1]){ sp.leftShown = true; return makeShot('leaveOrbit', vis.hero, T, sp.tA1 + rr(3.5, 4.5), vis); }
  if(sp && !sp.appShown && T >= W2[0] && T < W2[1]){ sp.appShown = true; return makeShot('planetApproach', vis.hero, T, sp.tB0 + rr(2, 3), vis); }
  const nextMs = sp ? [W1[0], W2[0]].filter(x => x > T + .05 && !(x === W1[0] ? sp.leftShown : sp.appShown)).sort((a, b) => a - b)[0] : undefined;
  let d = rr(4.8, 8.2); if(T + d > jumpShotStart - 2.4) d = Math.max(3.2, jumpShotStart - 2.4 - T);
  if(nextMs !== undefined && T + d > nextMs) d = Math.max(1.5, nextMs - T);          // le plan courant s'arrête au raccord
  const kWin = rateMax(T, T + d), calm = kWin < 3;             // temps réel (orbite) : plans co-mobiles et coupes sur le trafic possibles
  if(vis.carFresh && vis.showcase && vis.showcase.isCarrier && calm && T < vis.depStart - 1){ vis.carFresh = false; return makeShot('dockPass', vis.showcase, T, T + Math.max(d, 7), vis); }   // v7.6 : premier plan après le choix FLEET
  const Eg = vis.eng;                                                        // v7.14 : engagement en cours — il passe avant le reste (sauf l'arrivée et le départ)
  if(Eg && calm && Eg.leg === vis.leg && T >= Eg.tA - .5 && T < Eg.tB + 6 && (R() < .9 || (Eg.kind === 'raid' && !Eg.arrShown && T >= Eg.tP - 2.6) || Eg.ships.some(s => s.hp && s.hp.boom && !s.hp.dead && s.hp.boom < T + 7))){ const b = combatShot(vis, Eg, T, d, jumpShotStart); if(b) return b; }
  const Hk = Eg && Eg.leg === vis.leg && CBT.hulks.find(H => H.E === Eg && T - H.t0 > 2.5 && H.shown < 3 && T > H.nextOk);   // v7.17 : épave brisée, après l'engagement
  if(Hk && calm && T >= Eg.tB + 6 && T < vis.depStart - 3 && R() < .45){ Hk.shown++; Hk.nextOk = T + 25; const sh3 = makeShot('hulkPass', Hk.subj, T, T + Math.max(d, 6.5), vis, 'combat'); sh3.caption.planet = 'Wreck of ' + Hk.sh.name + ' · ' + (Hk.n === 3 ? 'three' : 'two') + ' sections adrift'; return sh3; }
  // v7.11 : voyage à bord — débarquement, tour libre du passager, réembarquement : la fenêtre d'orbite leur est réservée
  if(vis.trip && calm && T >= vis.tO0 - .5 && T < vis.depStart - 1){
    const K = vis.trip.K, X = vis.trip.X, r = berthPose(K.berthOp, T + 1);
    if(r.s === 'roam' || r.s === 'depart'){ let t, n = 0; do { t = pickW([['lateral', 1.5], ['orbitcam', 1.1], ['tripod', 1.2], ['chase', .7], ['front', .7], ['hullDolly', .5]]); n++; } while(n < 5 && t === shotLog[shotLog.length - 1]);
      let d2 = clamp(Math.min((r.s === 'roam' ? r.seg.t1 + .5 : T + d) - T, rr(5.5, 8)), 4, 9); if(T + d2 > jumpShotStart - 2.4) d2 = Math.max(3.2, jumpShotStart - 2.4 - T);
      return makeShot(t, X, T, T + d2, vis); }
    if(R() < .9){ const b = berthShotFor(vis, K, T, d, jumpShotStart, null); if(b) return b; }
    return makeShot(carPickFor(K, T, d), K, T, T + Math.max(d, 6.5), vis);
  }
  if(vis.tripOut && calm && T < vis.depStart - 1 && R() < .8){ const b = berthShotFor(vis, vis.tripOut.K, T, d, jumpShotStart, vis.tripOut.user ? null : 'npc'); if(b){ vis.berthShown = true; return b; } }   // embarquement filmé
  const carV = (vis.leg.npcs || []).find(x => x.isCarrier && x.berthOp && x.traj);   // v7.10 : une escale en cours passe avant les travellings (une fois par système)
  if(calm && carV && !vis.berthShown && R() < .75){ const b = berthShotFor(vis, carV, T, d, jumpShotStart, carV === vis.showcase ? null : 'npc'); if(b){ vis.berthShown = true; return b; } }
  // travelling de découverte (sans vaisseau) : parfois juste après l'arrivée, parfois en cours de route
  const room = Math.min(jumpShotStart - 2.4 - T, nextMs !== undefined ? nextMs - T : Infinity);
  const lastV = shotLog.slice(-3).some(x => /^vista/.test(x));
  if(vis.eclOK === undefined) vis.eclOK = ECL_P >= 1 || (ECL_P > 0 && !eclPrev && R() < ECL_P);   // v7.7 : ce système aura-t-il droit à une éclipse ?
  let roomV = carV && !vis.berthShown && T < vis.tO0 && berthBusy(carV.berthOp, vis.tO0, vis.depStart) ? Math.min(room, vis.tO0 + 1 - T) : room;   // v7.10 : un travelling ne mange pas l'escale
  if(vis.eng && T < vis.eng.tB) roomV = Math.min(roomV, vis.eng.tA + .5 - T);   // v7.14 : ni l'engagement
  if(roomV > 7 && !lastV && (/^arrive/.test(shotLog[shotLog.length-1]) ? R() < .45 : R() < .32)){      // v7.7 : un peu plus de travellings
    const vd = Math.min(rr(7.5, 11), roomV);
    if(vis.eclOK && !(vis.shown && vis.shown.has('eclipse')) && R() < .55){ const ve = makeVista(T, Math.max(vd, Math.min(11, roomV)), vis, 'eclipse'); if(ve){ vis.shown.add('eclipse'); vis.hadEcl = true; return ve; } }
    const vs = makeVista(T, vd, vis, null, roomV); if(vs) return vs;
  }
  let subj = T >= vis.depStart - 1 ? dep : (vis.showcase || (vis.userHero ? dep : vis.hero));
  const seg = segAt(vis, subj, T + d*.5);
  // manœuvre de baie (un engin sort ou rentre par le champ de force) : plan dédié, prioritaire
  const bayShot = (who, tag) => {
    const op = (who.bays || []).find(o => opActive(o, T + .3, T + d)); if(!op) return null;
    const segs = op.plan.filter(sg => sg.t1 > T && (sg.s === 'out' || sg.s === 'in'));
    let d2 = clamp((segs.length ? Math.min(segs[segs.length-1].t1, segs[0].t0 + 14) : T + d) + .8 - T, 4.5, 13);
    if(T + d2 > jumpShotStart - 2.4) d2 = Math.max(3.2, jumpShotStart - 2.4 - T);
    who.bayShot = op; const sh = makeShot('bayOps', who, T, T + d2, vis, tag); sh.caption.type = op.c.type; sh.caption.name = op.c.name; return sh;
  };
  if(calm && shotLog[shotLog.length-1] !== 'bayOps' && R() < .8){ const b = bayShot(subj); if(b) return b; }
  // plan de coupe sur le trafic (en temps réel uniquement : en accéléré, les orbites basses défilent en quelques secondes)
  const npcs = (vis.leg.npcs || []).filter(s => s !== subj && s.traj && !s.docked && !(s.hideAt && s.hideAt(T)));   // v7.6 : pas de coupe sur un engin à bord d'un porteur
  if(calm && R() < .5 && shotLog.slice(-2).indexOf('npc') < 0){ for(const s of npcs){ if(s.bays){ const b = bayShot(s, 'npc'); if(b){ b.type = 'bayOps'; return b; } } } }
  // présentation du prochain héros (relais) pendant l'orbite : le spectateur le voit avant qu'il ne parte
  if(vis.handover && !vis.userHero && !vis.depIntro && calm && T > vis.tO0 + 3 && T < vis.depStart - 6 && dep !== vis.hero){ vis.depIntro = true; return makeShot(pick(['orbitcam','lateral','tripod']), dep, T, T + d, vis, 'npc'); }
  const gunS = (vis.leg.npcs || []).find(x => x.gun && x.traj && gunActive(x));   // v7.5 : un exercice de tir en cours se filme
  if(calm && gunS && shotLog[shotLog.length - 1] !== 'gunnery' && R() < .6) return makeShot('gunnery', gunS, T, T + Math.min(Math.max(d, 6), 9), vis, 'gunnery');
  const CAR_SHOTS = ['dockPass', 'dockPass', 'dockInterior', 'dockInterior', 'dockBerth', 'torchClose', 'radiatorPass', 'lateral', 'tripod'];   // v7.8 : torche, radiateurs
  const lastT = () => shotLog[shotLog.length - 1];
  const berthShot = (car, tag) => berthShotFor(vis, car, T, d, jumpShotStart, tag);
  const carPick = car => carPickFor(car, T, d);
  if(calm && subj.isCarrier && R() < .85){ const b = berthShot(subj); if(b) return b; }
  if(calm && subj.isCarrier && R() < .8){ return makeShot(carPick(subj), subj, T, T + Math.max(d, 6.5), vis); }   // v7.6 : vedette porte-vaisseaux
  if(calm && subj.mil && R() < .6){                                          // vedette militaire (sélecteur FLEET)
    const t = subj.gun && gunActive(subj) ? 'gunnery' : pick((subj.formation ? ['formation', 'formation'] : []).concat(subj.craft && subj.craft.turrets.length ? ['turretClose'] : []).concat(['lateral', 'chase', 'tripod']));
    return makeShot(t, subj, T, T + d, vis); }
  const carN = npcs.find(x => x.isCarrier);                                 // v7.6 : un porte-vaisseaux se montre souvent
  if(calm && carN && R() < .5 && shotLog.slice(-2).indexOf('npc') < 0){ const b = berthShot(carN, 'npc'); if(b) return b; }   // v7.10 : une escale se filme
  if(calm && carN && R() < .3 && shotLog.slice(-2).indexOf('npc') < 0) return makeShot(carPick(carN), carN, T, T + Math.max(d, 6.5), vis, 'npc');
  const milN = npcs.filter(x => x.mil && !x.isCarrier);                    // v7.4 : la flotte militaire, quand elle est là, se montre plus souvent
  if(calm && npcs.length && R() < (milN.length ? .5 : .35) && shotLog.slice(-2).indexOf('npc') < 0){
    const s = milN.length && R() < .6 ? pick(milN) : pick(npcs);
    const t = s.mil ? (s.gun && gunActive(s) ? 'gunnery' : pick((s.formation ? ['formation', 'formation'] : []).concat(s.craft && s.craft.turrets && s.craft.turrets.length ? ['turretClose', 'turretClose'] : []).concat(['lateral', 'chase', 'tripod'])))
                    : pick(['lateral','tripod','orbitcam','chase','hullDolly','bowClose'].concat(s.hull && s.hull.docks && s.hull.docks.length ? ['dockClose'] : []));
    return makeShot(t, s, T, T + d, vis, 'npc');
  }
  // silhouette du vaisseau devant son étoile (si la géométrie s'y prête)
  if((seg === 'transfer' || seg === 'depart') && vis.leg.star3 && R() < .12){
    const mid = subj.traj(T + d*.5).pos, u = mid.clone().normalize(), D = mid.length(), dm = subj.len*D/(1.15*vis.leg.star3.Rs - subj.len), P = mid.clone().addScaledVector(u, dm);
    const clear = dm > 0 && vis.leg.planets.every(p => P.distanceTo(p.position) > p.radius*1.2) && __STARS.occlusion(vis.leg.star3, P, bodiesOf(vis.leg)).vis > .99;
    if(clear){ const sh = makeShot('shipTransit', subj, T, T + Math.max(d, 6), vis); sh.caption.planet = 'Stellar transit'; return sh; }
  }
  let opts;
  if(subj.isCarrier) opts = carrierOpts(seg, calm);                          // v7.11 : porteur héros ou partant
  else if(seg === 'transfer'){
    const trS = subj.traj.segs.filter(s => s.kind === 'transfer' && s.t0 <= T + d*.5).pop() || subj.traj.segs.find(s => s.kind === 'transfer'), tr = trS.f, flipT = T + d*.5;   // v7.12 : transfert en cours (arrivée ou escale)
    const tauM = tauAt(T + d*.5) - tr.tau0, pf = tr.prof, frac = tauM/Math.max(1e-6, pf.D);
    const hasFlip = Math.abs(tauM - pf.t1 - pf.tc*.5) < pf.tc*.9 || (pf.tf > 0 && Math.abs(tauM - pf.tm - pf.tf*.4) < pf.tf*.6);   // retournement médian ou final
    const nav = [];                                                          // v7.12 : les plans d'escale sont calés sur les raccords (voir plus haut)
    opts = (hasFlip ? [['lateral',3],['orbitcam',2.2],['wide',.8]].concat(closeOpts(subj, 'flip')) : [['chase',2],['lateral',2],['front',1.5],['wide',2],['orbitcam',1.2]].concat(closeOpts(subj, 'transfer'))).concat(nav);   // retournement : plans rapprochés pour voir les RCS
  } else if(seg === 'orbit'){
    const sp = subj.traj(T + d*.5).pos, pl = nearestPlanet(vis.leg, sp);
    const dayside = pl ? sp.clone().sub(pl.position).normalize().dot(pl.position.clone().negate().normalize()) : 1;
    const cities = pl && pl.mesh.material.uniforms.uCities && pl.mesh.material.uniforms.uCities.value > .5;
    const wl = dayside > -.05 ? 4 : (cities ? 1.5 : .3);
    opts = [['limb',wl],['orbitcam',2],['tripod',calm ? 1.6 : 0],['wide',1.5],['lateral',1.2],['front',1],['planetDrift', 2.2],['reveal', calm && dayside > .1 ? 2.6 : 0]].concat(closeOpts(subj, 'orbit')); }   // v7.7 : dérive planétaire ; v7.9 : révélation
  else if(seg === 'depart'){ opts = [['chase',3],['front',1.2],['wide',1.4],['lateral',1.5],['orbitcam',1]].concat(closeOpts(subj, 'depart')); }
  else { opts = [['wide',1],['lateral',1],['chase',1]]; }
  let type, n = 0; do { type = pickW(opts); n++; } while(n < 6 && type === shotLog[shotLog.length-1]);
  if(type === 'dockInterior' && subj.berthOp && berthBusy(subj.berthOp, T, T + d)) type = 'deckLevel';
  if(type === 'planetDrift'){ const dd = Math.min(rr(12, 18), jumpShotStart - 2.4 - T); if(dd >= 8) d = dd; else type = 'wide'; }   // v7.7 : plan long
  if(type === 'reveal'){ const dd = Math.min(rr(20, 30), jumpShotStart - 2.4 - T); if(dd >= 14) d = dd; else type = 'orbitcam'; }   // v7.9 : plan-séquence
  return makeShot(type, subj, T, T + d, vis);
}
/* ---------- travellings de découverte, sans vaisseau ---------- */
function vistaSubject(focusFn){ return { traj: T => ({ pos: focusFn(T), q: new Q() }), len: 100, thr: { value: 0 }, type: '', name: '' }; }
const VISTAS = {
  planet(vis, t0, d){ // lent travelling orbital autour d'une planète : terminateur, anneaux, nuages (rotation visible en accéléré)
    const pls = vis.leg.planets.filter(p => p.mesh); if(!pls.length) return null;
    const pl = (FOCUS.planet && FOCUS.planet.mesh ? FOCUS.planet : null) || pickW(pls.map(p => [p, 1 + (p.hasRings ? 1.5 : 0) + (p.fx && p.fx.clouds.length ? 1 : 0)])), C = pl.position, Rp = pl.radius;
    const Ls = C.clone().negate().normalize(), side = perpTo(Ls), a = rr(.9, 1.9);
    const dir0 = Ls.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a)).normalize(), axis = new V3().crossVectors(dir0, side).normalize();
    const d0 = Rp*rr(2.3, 3.6), d1 = d0*rr(.8, .92), sweep = rr(.1, .18)*(R()<.5?-1:1),   /* v7.7 : 15–25 s */ off = rr(.2, .45)*(R()<.5?-1:1), up = axis.clone();
    return { place: pl.properName, focus: () => C, cam: T => { const k = smoother((T - t0)/d), dir = dir0.clone().applyAxisAngle(axis, sweep*k);
      const tan = new V3().crossVectors(axis, dir).normalize();
      return { pos: C.clone().addScaledVector(dir, lerp(d0, d1, k)), look: C.clone().addScaledVector(tan, Rp*off), fov: 46, up }; } };
  },
  planetrise(vis, t0, d){ // v7.7 : lever de planète — au-dessus d'une lune, la planète monte lentement au-dessus de son horizon
    const cands = []; vis.leg.planets.forEach(p => p.mesh && (p.moonPivots || []).forEach(pv => { const m = pv.children[0]; if(m) cands.push({ p, m, name: pv.userData.moonName }); }));
    if(!cands.length) return null;
    const S = new V3(), lit = it => { const M = it.m.getWorldPosition(new V3()); return M.sub(it.p.position).normalize().dot(S.clone().sub(it.p.position).normalize()); };
    const good = cands.filter(it => lit(it) > .15), it = pick(good.length ? good : cands), Rp = it.p.radius;
    if(!it.m.geometry.boundingSphere) it.m.geometry.computeBoundingSphere();
    const Rbs = it.m.geometry.boundingSphere.radius*it.m.scale.x, hA = rr(1.7, 2.6), dp = Rbs*hA, e0 = randUnit();
    const geo = () => { const M = it.m.getWorldPosition(new V3()), B = it.p.position, u = M.clone().sub(B).normalize(), e = perpTo(u, e0); return { M, B, u, e }; };
    const at = (g, b) => g.M.clone().addScaledVector(g.u, dp*Math.cos(b)).addScaledVector(g.e, dp*Math.sin(b));
    const sepOf = (g, p) => Math.acos(clamp(g.B.clone().sub(p).normalize().dot(g.M.clone().sub(p).normalize()), -1, 1));
    const solve = (g, target) => { let lo = 0, hi = 3.0; for(let i=0;i<30;i++){ const m = (lo + hi)/2; if(sepOf(g, at(g, m)) < target) lo = m; else hi = m; } return (lo + hi)/2; };
    // lunes irrégulières : le limbe réel est mesuré (rayons) depuis la position de mi-plan, dans la direction de la planète
    const g0 = geo(), th = Math.asin(clamp(Rp/g0.M.distanceTo(g0.B), 0, 1)), a0 = Math.asin(1/hA), pm = at(g0, solve(g0, a0));
    it.m.updateWorldMatrix(true, false);
    const dM = g0.M.clone().sub(pm).normalize(), dP = g0.B.clone().sub(pm).normalize(), ax = new V3().crossVectors(dM, dP).normalize(), rc = new THREE.Raycaster();
    let lo = 0, hi = a0*1.2; for(let i=0;i<16;i++){ const m = (lo + hi)/2; rc.set(pm, dM.clone().applyAxisAngle(ax, m)); if(rc.intersectObject(it.m, false).length) lo = m; else hi = m; }
    const edge = lo > .01 ? lo : a0, s0 = edge - 1.3*th, s1 = edge + 1.5*th, half = (s1 - edge)/2 + 1.7*th, fov = clamp(2*half*57.3*1.15, 16, 55), dl = (s1 - edge)/2;
    return { place: 'Planetrise — ' + it.p.properName + (it.name ? ' over ' + it.name : ''), focus: () => it.p.position, cam: T => {
      const g = geo(), k = smoother((T - t0)/d), pos = at(g, solve(g, lerp(s0, s1, k))), vv = g.B.clone().sub(pos).normalize(), w = g.M.clone().sub(pos).normalize();
      const axis = new V3().crossVectors(vv, w).normalize(), dc = vv.clone().applyAxisAngle(axis, dl*.9);    // centre du cadre entre la planète et le limbe
      let up = vv.clone().sub(w); up.sub(dc.clone().multiplyScalar(up.dot(dc))).normalize();
      return { pos, look: pos.clone().addScaledVector(dc, 1e6), fov, up }; } };
  },
  ringParallax(vis, t0, d){ // v7.9 : survol rasant des anneaux — à quelques centaines de km du plan, les bandes défilent sous la caméra (parallaxe), la planète géante derrière
    const pls = vis.leg.planets.filter(p => p.hasRings && p.mesh && p.mesh.parent); if(!pls.length) return null;
    const pl = pick(pls), rg = pl.mesh.parent.children.find(o => o.isMesh && o !== pl.mesh && o.material && o.material.isMeshBasicMaterial && o.geometry && o.geometry.type === 'BufferGeometry'); if(!rg) return null;
    const Rp = pl.radius, C = pl.position, N = new V3(0, 0, 1).applyQuaternion(rg.getWorldQuaternion(new Q())).normalize(), Ls = C.clone().negate().normalize();
    let rad = Ls.clone().sub(N.clone().multiplyScalar(Ls.dot(N))); if(rad.lengthSq() < 1e-6) rad = perpTo(N, v(1, 0, 0)); rad.normalize().applyAxisAngle(N, rr(-.7, .7));
    const tan = new V3().crossVectors(N, rad).normalize(), sN = Ls.dot(N) >= 0 ? 1 : -1, up = N.clone().multiplyScalar(sN);   // face éclairée des anneaux
    const r0 = Rp*rr(2.15, 2.4), r1 = Rp*rr(1.6, 1.8), h = Rp*rr(.004, .009), side = R()<.5?-1:1, pitch = rr(.1, .2), fov = rr(56, 64);   // vers l'intérieur : les bandes défilent
    return { place: pl.properName + ' — rings', low: true, focus: () => C, cam: T => { const k = smoother((T - t0)/d), r = lerp(r0, r1, k), a = side*.12*k;
      const rd = rad.clone().applyAxisAngle(N, a), pos = C.clone().addScaledVector(rd, r).addScaledVector(up, h), toC = rd.clone().negate().applyAxisAngle(up, side*.35);
      return { pos, look: pos.clone().addScaledVector(toC, Math.cos(pitch)*1e7).addScaledVector(up, -Math.sin(pitch)*1e7), fov, up }; } };
  },
  tour(vis, t0, d){ // v7.9 : tour du système — vol documentaire accéléré : survol d'une planète, traversée, survol d'une autre
    const pls = vis.leg.planets.filter(p => p.mesh); if(pls.length < 2) return null;
    const a = pick(pls), b = pickW(pls.filter(p => p !== a).map(p => [p, 1/Math.max(1, p.position.distanceTo(a.position)/5e10)]));
    const u = b.position.clone().sub(a.position).normalize(), La = a.position.clone().negate().normalize(), Lb = b.position.clone().negate().normalize(), n = perpTo(u, La);
    const dirs = (L, s0, s1) => [u.clone().multiplyScalar(s0).addScaledVector(L, .8).addScaledVector(n, .3).normalize(), u.clone().multiplyScalar(s1).addScaledVector(L, .7).addScaledVector(n, -.2).normalize()];
    const [a0, a1] = dirs(La, -.7, .6), [b0, b1] = dirs(Lb, -.7, .55), ra = a.radius*rr(2.2, 2.8), rb = b.radius*rr(2.2, 2.8);
    const arc = (C, R0, R1, d0, d1, t) => { const q = new Q().setFromUnitVectors(d0, d1), qt = new Q().slerp(q, t); return C.clone().addScaledVector(d0.clone().applyQuaternion(qt), lerp(R0, R1, t)); };
    const A1 = arc(a.position, ra, ra, a0, a1, 1), B0 = arc(b.position, rb, rb, b0, b1, 0);
    return { place: 'System tour — ' + a.properName + ' → ' + b.properName, focus: () => b.position, cam: T => { const k = clamp((T - t0)/d, 0, 1); let pos, look;
      if(k < .38){ const t = smoother(k/.38); pos = arc(a.position, ra*1.05, ra, a0, a1, t); look = a.position.clone().addScaledVector(u, a.radius*.4*t); }
      else if(k < .58){ const t = smoother((k - .38)/.2); pos = A1.clone().lerp(B0, t);
        const da = a.position.clone().sub(pos).normalize(), db = b.position.clone().sub(pos).normalize(); look = pos.clone().addScaledVector(da.lerp(db, smoother(t*1.2)).normalize(), 1e9); }
      else { const t = smoother((k - .58)/.42); pos = arc(b.position, rb, rb*.9, b0, b1, t); look = b.position.clone(); }
      return { pos, look, fov: 50, up: n }; } };
  },
  terminator(vis, t0, d){ // v7.7 : du jour vers la nuit — long panoramique au-dessus du terminateur : lumières des villes, arc de l'atmosphère
    const pls = vis.leg.planets.filter(p => p.mesh); if(!pls.length) return null;
    const pl = pickW(pls.map(p => [p, (p.mesh.material.uniforms.uCities && p.mesh.material.uniforms.uCities.value > .5 ? 4 : 0) + (p.hasAtmosphere ? 2 : .5)])), C = pl.position, Rp = pl.radius;
    const Ls = C.clone().negate().normalize(), n = perpTo(Ls), e = new V3().crossVectors(n, Ls).normalize();
    const h = rr(1.35, 1.75), b0 = rr(1.05, 1.2), b1 = rr(1.95, 2.15), lead = rr(.28, .42), fov = rr(48, 56);
    const g = b => Ls.clone().multiplyScalar(Math.cos(b)).addScaledVector(e, Math.sin(b));
    return { place: pl.properName + ' — terminator', focus: () => C.clone().addScaledVector(g((b0 + b1)/2), Rp), cam: T => { const k = smoother((T - t0)/d), b = lerp(b0, b1, k), gr = g(b);
      return { pos: C.clone().addScaledVector(gr, Rp*h), look: C.clone().addScaledVector(g(b + lead), Rp*.92), fov, up: gr }; } };
  },
  cloudscape(vis, t0, d){ // rase-nuages matinal à 60–95 km d'altitude : l'horizon défile, lever d'étoile sur la mer de nuages
    if(rateMax(t0, t0 + d) > 3) return null;
    const pls = vis.leg.planets.filter(p => p.fx && p.fx.clouds.length); if(!pls.length) return null;
    const pl = pick(pls), C = pl.position, Rp = pl.radius, Ls = C.clone().negate().normalize();
    const side = perpTo(Ls), g0 = Ls.clone().multiplyScalar(rr(.25, .5)).addScaledVector(side, 1).normalize();
    const travel = Ls.clone().sub(g0.clone().multiplyScalar(Ls.dot(g0))).normalize();       // on avance vers l'étoile
    const axis = new V3().crossVectors(g0, travel).normalize(), alt = rr(1.009, 1.015), ang = rr(.006, .011), pitch = -rr(.14, .22);
    return { place: pl.properName, low: true, focus: T => C.clone().addScaledVector(g0, Rp), cam: T => { const k = (T - t0)/d, g = g0.clone().applyAxisAngle(axis, ang*k);
      const fw = travel.clone().applyAxisAngle(axis, ang*k), pos = C.clone().addScaledVector(g, Rp*alt);
      return { pos, look: pos.clone().addScaledVector(fw, Math.cos(pitch)*1e4).addScaledVector(g, Math.sin(pitch)*1e4), fov: 62, up: g }; } };
  },
  belt(vis, t0, d){ // survol d'un astéroïde de la ceinture (amas local : 6–28 km, fragments à quelques dizaines de km)
    const B = vis.leg.beltInfo; if(!B || !window.__AST || !__AST.ready) return null;
    if(!B.cluster){
      const ang = rr(0, 6.28), rb = rr(B.inner, B.outer), P = new V3(Math.cos(ang)*rb, rr(-.015, .015)*rb, Math.sin(ang)*rb), Rm = rr(6e3, 28e3);
      const cl = __AST.cluster(Math.floor(R()*1e9), Rm); if(!cl) return null;
      cl.group.position.copy(P); vis.leg.group.add(cl.group); B.cluster = { P, Rm, cl };
    }
    const P = B.cluster.P, rad = B.cluster.Rm*1.15;
    const radial = P.clone().normalize(), tan = new V3().crossVectors(v(0,1,0), radial).normalize();
    const off = radial.clone().multiplyScalar(-rr(1.8, 2.8)*rad).add(v(0, rr(.4, 1.6)*rad*(R()<.5?-1:1), 0));   // côté étoile : roches éclairées de trois quarts
    const p0 = P.clone().addScaledVector(tan, -rr(5, 7)*rad).add(off), p1 = P.clone().addScaledVector(tan, rr(4, 6)*rad).add(off);
    return { place: 'Asteroid belt', focus: () => P, cam: T => { const k = smoother((T - t0)/d); return { pos: p0.clone().lerp(p1, k), look: P.clone().addScaledVector(tan, rad*(k - .5)*1.5), fov: 50, up: v(0,1,0) }; } };
  },
  moon(vis, t0, d){ // une lune cratérisée devant sa planète
    const list = []; vis.leg.planets.forEach(p => (p.moonPivots || []).forEach(pv => pv.children[0] && list.push({ p, m: pv.children[0], name: pv.userData.moonName }))); if(!list.length) return null;
    const it = FOCUS.moon || pick(list), mR = it.m.scale.x*1.1, side = randUnit(), sweep = rr(.25, .45)*(R()<.5?-1:1);
    const mp = () => it.m.getWorldPosition(new V3());
    return { place: it.name || it.p.properName, focus: mp, cam: T => { const k = smoother((T - t0)/d), M = mp(), toM = M.clone().sub(it.p.position).normalize();
      const s2 = perpTo(toM, side), axis = new V3().crossVectors(toM, s2).normalize();
      const dir = toM.clone().multiplyScalar(.75).addScaledVector(s2, .66).normalize().applyAxisAngle(axis, sweep*k);
      return { pos: M.clone().addScaledVector(dir, mR*lerp(4.2, 3.2, k)), look: M.clone().addScaledVector(toM, -mR*.9), fov: 48, up: axis }; } };
  },
  aurora(vis, t0, d){ // de nuit, sous les rideaux d'aurore (95–290 km), caméra à ~50 km, regard vers le pôle
    if(rateMax(t0, t0 + d) > 3) return null;
    const cands = [];
    vis.leg.planets.forEach(p => p.fx && (p.fx.aurora || []).forEach(a => {
      if(a.mesh.material.uniforms.uIntensity.value < .8) return;
      const qm = a.mesh.getWorldQuaternion(new Q()), pole = v(0, a.pole, 0).applyQuaternion(qm), e1 = v(1,0,0).applyQuaternion(qm), e2 = v(0,0,1).applyQuaternion(qm);
      const Ls = p.position.clone().negate().normalize();
      const dirAt = (col, ph) => e1.clone().multiplyScalar(Math.sin(col)*Math.cos(ph)).addScaledVector(e2, Math.sin(col)*Math.sin(ph)).addScaledVector(pole, Math.cos(col)).normalize();
      let ph0 = 0, best = 9; for(let i=0;i<36;i++){ const ph = i/36*6.2832, dd = dirAt(a.colat + .08, ph).dot(Ls); if(dd < best){ best = dd; ph0 = ph; } }
      cands.push({ p, a, pole, dirAt, ph0, dark: best });
    }));
    const night = cands.filter(c => c.dark < -.12); if(!night.length) return null;   // il faut la nuit pour voir les aurores
    night.sort((x, y) => x.dark - y.dark); const it = pick(night.slice(0, 2)), pl = it.p, C = pl.position, Rp = pl.radius;
    const outer = Math.max(...pl.fx.aurora.filter(a => a.pole === it.a.pole).map(a => a.colat));   // au-delà du rideau extérieur : on regarde l'ovale de l'extérieur
    const c = it.a.colat, dc = outer - c + rr(.05, .08), alt = rr(1.007, 1.0095), sweep = rr(.02, .035)*(R()<.5?-1:1), pitch = rr(.12, .22);
    return { place: pl.properName + ' — aurora ' + (it.a.pole > 0 ? 'borealis' : 'australis'), low: true, focus: () => C.clone().addScaledVector(it.dirAt(c, it.ph0), Rp),
      cam: T => { const k = (T - t0)/d, ph = it.ph0 + sweep*(k - .5), g = it.dirAt(c + dc, ph), pos = C.clone().addScaledVector(g, Rp*alt);
        const tp = it.pole.clone().sub(g.clone().multiplyScalar(it.pole.dot(g))).normalize();
        return { pos, look: pos.clone().addScaledVector(tp, Math.cos(pitch)*1e4).addScaledVector(g, Math.sin(pitch)*1e4), fov: 64, up: g }; } };
  },
  star(vis, t0, d){ // approche de la photosphère : granulation, taches, protubérances au limbe
    const S3 = vis.leg.star3; if(!S3) return null;
    const S = new V3(), Rs = S3.Rs, dir = randUnit(), side = perpTo(dir), up = new V3().crossVectors(side, dir).normalize();
    return { place: '', focus: () => S, cam: T => { const k = smoother((T - t0)/d);
      return { pos: S.clone().addScaledVector(dir, Rs*lerp(7, 2.3, k)).addScaledVector(side, Rs*lerp(1.2, .5, k)), look: S.clone().addScaledVector(side, -Rs*lerp(.4, .7, k)), fov: 50, up }; } };
  },
  flare(vis, t0, d){ // éruption vue de profil au limbe : flash, arche arrachée, éjection coronale
    const S3 = vis.leg.star3; if(!S3) return null;
    const S = new V3(), Rs = S3.Rs, view = randUnit(), side = perpTo(view), D0 = Rs*rr(2.4, 3.0), D1 = D0*rr(.86, .94);
    const ratio = Rs/((D0 + D1)/2), limb = view.clone().multiplyScalar(ratio).addScaledVector(side, Math.sqrt(1 - ratio*ratio)).normalize();
    __STARS.flare(S3, t0 + 1.2, limb.clone().addScaledVector(view, .12).normalize());
    const w = new V3().crossVectors(view, side).normalize(), drift = rr(-.25, .25);
    return { place: 'Stellar flare', focus: () => S.clone().addScaledVector(limb, Rs), cam: T => { const k = smoother((T - t0)/d);
      const pos = S.clone().addScaledVector(view, lerp(D0, D1, k)).addScaledVector(w, Rs*drift*k);
      return { pos, look: S.clone().addScaledVector(limb, Rs*lerp(1.35, 1.6, k)), fov: 52, up: limb }; } };
  },
  eclipse(vis, t0, d){ // éclipse totale : la lune glisse devant le disque (anneau de diamant, totalité, couronne)
    const S3 = vis.leg.star3; if(!S3) return null;
    const S = new V3(), Rs = S3.Rs, kk = 1.035, cands = [];
    vis.leg.planets.forEach(p => (p.moonPivots || []).forEach(pv => { const m = pv.children[0]; if(m) cands.push({ p, m, name: pv.userData.moonName }); }));
    const geom = it => { const M = it.m.getWorldPosition(new V3()), rm = it.m.scale.x*1.05, u = M.clone().sub(S), D = u.length(); u.normalize(); return { M, u, D, rm, dm: rm*D/(kk*Rs - rm) }; };
    const ok = cands.filter(it => { const g = geom(it), P = g.M.clone().addScaledVector(g.u, g.dm);
      if(!(g.dm > 0) || g.dm > g.D*.5 || P.distanceTo(it.p.position) < it.p.radius*1.15) return false;
      return __STARS.occlusion(S3, P, [{ pos: it.p.position, r: it.p.radius }]).vis > .99; });
    if(!ok.length) return null;
    const it = pick(ok), g0 = geom(it), e0 = perpTo(g0.u), theta = Rs/(g0.D + g0.dm), fov = clamp(theta*57.3*11, 1.5, 38);
    return { place: 'Total eclipse — ' + (it.name || it.p.properName), focus: () => it.m.getWorldPosition(new V3()), cam: T => {
      const g = geom(it), e = perpTo(g.u, e0), c = 1 - 2*clamp((T - t0)/d, 0, 1);
      const sep = 2.4*theta*Math.sign(c)*Math.pow(Math.abs(c), 1.7);
      const x = sep*g.dm*(g.D + g.dm)/g.D;
      return { pos: g.M.clone().addScaledVector(g.u, g.dm).addScaledVector(e, x), look: S.clone(), fov, up: new V3().crossVectors(e, g.u).normalize() }; } };
  },
  sunrise(vis, t0, d){ // lever d'étoile derrière une planète : l'atmosphère s'embrase au limbe, couronne au-dessus de l'horizon
    const S3 = vis.leg.star3; if(!S3) return null;
    const S = new V3(), Rs = S3.Rs, pls = vis.leg.planets.filter(p => p.mesh); if(!pls.length) return null;
    const pl = pickW(pls.map(p => [p, p.hasAtmosphere ? 3 : 1])), C = pl.position, Rp = pl.radius;
    const u = C.clone().sub(S).normalize(), e = perpTo(u), dp = Rp*rr(2.6, 4.2);
    const P = b => C.clone().addScaledVector(u, dp*Math.cos(b)).addScaledVector(e, dp*Math.sin(b));
    const sepAt = b => { const p = P(b); return Math.acos(clamp(S.clone().sub(p).normalize().dot(C.clone().sub(p).normalize()), -1, 1)); };
    const alpha = Math.asin(Rp/dp), thetaAt = b => Math.asin(Rs/S.distanceTo(P(b)));
    const solve = target => { let lo = 0, hi = 1.4; for(let i=0;i<28;i++){ const m = (lo + hi)/2; if(sepAt(m) < target) lo = m; else hi = m; } return (lo + hi)/2; };
    const th = thetaAt(0), s0 = alpha - 1.3*th, s1 = alpha + 1.8*th, fov = clamp(th*57.3*16, 8, 48);
    return { place: 'Starrise — ' + pl.properName, focus: () => C.clone().addScaledVector(u, -Rp), cam: T => {
      const k = smoother((T - t0)/d), b = solve(lerp(s0, s1, k)), pos = P(b);
      const vv = S.clone().sub(pos).normalize(), w = C.clone().sub(pos).normalize();
      let up = vv.clone().sub(w); up.sub(vv.clone().multiplyScalar(up.dot(vv))).normalize();
      return { pos, look: pos.clone().addScaledVector(vv, 1e6).addScaledVector(up, -1e6*Math.tan(fov*Math.PI/360)*.35), fov, up }; } };
  },
  transit(vis, t0, d){ // transit d'une lune devant le disque granuleux
    const S3 = vis.leg.star3; if(!S3) return null;
    const S = new V3(), Rs = S3.Rs, kk = .38, cands = [];
    vis.leg.planets.forEach(p => (p.moonPivots || []).forEach(pv => { const m = pv.children[0]; if(m) cands.push({ p, m, name: pv.userData.moonName }); }));
    const geom = it => { const M = it.m.getWorldPosition(new V3()), rm = it.m.scale.x*1.05, u = M.clone().sub(S), D = u.length(); u.normalize(); return { M, u, D, dm: rm*D/(kk*Rs - rm) }; };
    const ok = cands.filter(it => { const g = geom(it), P = g.M.clone().addScaledVector(g.u, g.dm); return g.dm > 0 && g.dm < g.D*.5 && P.distanceTo(it.p.position) > it.p.radius*1.15 && __STARS.occlusion(S3, P, [{ pos: it.p.position, r: it.p.radius }]).vis > .99; });
    if(!ok.length) return null;
    const it = pick(ok), g0 = geom(it), e0 = perpTo(g0.u), theta = Rs/(g0.D + g0.dm), fov = clamp(theta*57.3*5.5, 1.2, 30);
    return { place: 'Transit — ' + (it.name || it.p.properName), focus: () => it.m.getWorldPosition(new V3()), cam: T => {
      const g = geom(it), e = perpTo(g.u, e0), sep = 1.25*theta*(1 - 2*clamp((T - t0)/d, 0, 1)), x = sep*g.dm*(g.D + g.dm)/g.D;
      return { pos: g.M.clone().addScaledVector(g.u, g.dm).addScaledVector(e, x), look: S.clone(), fov, up: new V3().crossVectors(e, g.u).normalize() }; } };
  },
  nebula(vis, t0, d){ // dérive au bord d'une nébuleuse : plan purement galactique (le système est à des centaines de parsecs)
    let best = FOCUS.nebula || null, bd = 4200; if(!best) nebulaField.forEach(e => { if(!e) return; const dd = e.mesh.position.distanceTo(vis.leg.gal); if(dd < bd){ bd = dd; best = e; } }); if(!best) return null;
    const N = best.mesh.position.clone(), dir = vis.leg.gal.clone().sub(N).normalize().add(randUnit().multiplyScalar(.5)).normalize(), side = perpTo(dir), up = new V3().crossVectors(side, dir).normalize();
    return { place: (best.name || 'Uncharted') + ' Nebula', gal: true, focus: () => new V3(), cam: T => { const k = smoother((T - t0)/d);
      return { pos: N.clone().addScaledVector(dir, lerp(1500, 950, k)).addScaledVector(side, lerp(-180, 180, k)), look: N.clone().addScaledVector(side, lerp(60, -60, k)), fov: 55, up }; } };
  }
};
const LONG_V = { planet: [15, 25], planetrise: [15, 25], terminator: [15, 25], ringParallax: [15, 22], tour: [20, 28] };   // v7.7–7.9 : travellings longs
function makeVista(T, d, vis, prefer, room){
  const sunLike = vis.leg.star3 && __STARS.isSunLike(vis.leg.star);
  const kinds = prefer ? [[prefer, 1]] : [['planet',6],['planetrise',2.2],['terminator',2],['ringParallax',2.5],['tour',1.2],['cloudscape',2.5],['aurora',3],['belt',2],['moon',1.5],['nebula',1.2],
    ['star', sunLike ? 1.6 : 1],['flare', sunLike ? 3 : 1.5],['eclipse', vis.eclOK ? (sunLike ? 3.5 : 2) : 0],['sunrise', sunLike ? 2.5 : 1.5],['transit', 1.2]];
  vis.shown = vis.shown || new Set();
  for(let tries=0; tries<8; tries++){
    const k = pickW(kinds); if(!prefer && (shotLog[shotLog.length-1] === 'vista_' + k || vis.shown.has(k))) continue;   // pas deux fois le même travelling dans un système
    let dd = d; if(!prefer && LONG_V[k]){ dd = Math.min(rr(LONG_V[k][0], LONG_V[k][1]), room || d); if(dd < 11) continue; }        // plans longs : seulement s'il reste du temps
    const vs = VISTAS[k](vis, T, dd); if(!vs) { if(prefer) return null; continue; }
    shotLog.push('vista_' + k); if(shotLog.length > 10) shotLog.shift(); vis.shown.add(k); if(k === 'eclipse') vis.hadEcl = true;
    return { type: 'vista_' + k, vista: true, gal: !!vs.gal, low: !!vs.low, subj: vistaSubject(vs.focus), t0: T, t1: T + dd, cam: vs.cam, vis,
      caption: { vista: true, star: vis.leg.name, cls: vis.leg.designation, place: vs.place } };
  }
  return null;
}
C.forceVista = function(kind, d){ shot = makeVista(T, d || 9, visit, kind) || shot; return shot && shot.type; };
function makeShot(type, subj, t0, t1, vis, tag){
  if(type === 'bayOps' && !(subj.bays && subj.bays.length)) type = subj.hull ? 'hullDolly' : 'chase';
  if(type === 'formation' && !subj.formation) type = 'chase';
  if(BERTH_SHOTS[type] && !subj.berthOp) type = subj.isCarrier ? 'dockPass' : 'lateral';   // v7.10
  if(type === 'gunnery' && !(subj.gun && subj.craft && subj.craft.turrets.length)) type = subj.craft && subj.craft.turrets && subj.craft.turrets.length ? 'turretClose' : 'chase';
  if(CLOSE[type] && (!subj.hull || (type === 'geodeClose' && !subj.geode) || (type === 'warpRings' && !subj.rings) || (type === 'turretClose' && !(subj.craft && subj.craft.turrets && subj.craft.turrets.length)) || (type === 'rcsClose' && !subj.hull.rcs.length) || (type === 'dockClose' && !(subj.hull.docks && subj.hull.docks.length)))) type = subj.hull ? 'hullDolly' : 'chase';   // gros plan impossible → repli
  const cam_ = SHOTS[type](subj, t0, t1 - t0, vis);
  shotLog.push(tag || type); if(shotLog.length > 10) shotLog.shift();
  const s0 = subj.traj(Math.max(t0, type === 'arrive' ? vis.tArrive : t0));
  const pl = nearestPlanet(vis.leg, s0.pos);
  const cs = BERTH_SHOTS[type] && subj.berthOp ? subj.berthOp.s : subj;              // v7.10 : plans d'escale → légende du visiteur
  const px = cs.isCarrier && cs.passenger && cs.passenger.docked === cs && isAboard(cs.passenger) ? cs.passenger : null;   // v7.11 : porteur avec passager
  const stp = vis.stop && subj === vis.hero && t0 >= vis.stop.tA1 - .5 && t0 < vis.stop.tB0 ? 'Stopover → ' + vis.stop.B.properName : null;   // v7.12 : transfert d'escale
  return { type, subj, t0, t1, cam: cam_, vis, caption: { type: cs.type, name: px ? cs.name + ' · ' + px.name + ' aboard' : cs.name, star: vis.leg.name, cls: vis.leg.designation, planet: stp || (pl ? pl.properName : '—') } };
}

/* =====================================================================
   SIMULATION
   ===================================================================== */
const tasks = [];
let T = 0, lastRefresh = -1, lastCellKey = '', cloudT = 0, kNow = 1;
const driveLight = new THREE.PointLight(0x9fd0ff, 0, 200, 2);

const heroHist = [];
const routeLog = [];                                   // systèmes visités (carte : trajet parcouru)
const FOCUS = {};                                      // cible imposée par la carte aux travellings (planète, lune, nébuleuse)
const RELAY_P = (p => p !== null && p !== '' && !isNaN(+p) ? clamp(+p, 0, 1) : .6)(PARAMS.get('relay'));
const ECL_P = (p => p !== null && p !== '' && !isNaN(+p) ? clamp(+p, 0, 1) : .15)(PARAMS.get('eclipse'));   // v7.7 : éclipses rares (≈ 1 système sur 6–7, jamais deux de suite ; ?eclipse=0|1|p)
let eclPrev = false;
C.followHero = false; C.pending = null;
function startVisit(leg, hero, tArrive, arriveDir, arr){
  buildSystem(leg); leg.group.visible = true;
  hero.leg = leg; hero.heroVisits = (hero.heroVisits || 0) + 1; heroHist.push(hero.model); if(heroHist.length > 8) heroHist.shift();
  routeLog.push({ cell: leg.cell, name: leg.name, gal: leg.gal.clone() }); if(routeLog.length > 24) routeLog.shift();
  tlPrune(T);
  eclPrev = !!(visit && visit.hadEcl);                                     // v7.7 : pas deux systèmes de suite avec une éclipse
  const vis = planVisit(leg, hero, tArrive, arriveDir, arr);
  if(!leg.populated){ leg.populated = true; populateSystem(leg).forEach(fn => fn()); }
  berthScheduleVisit(leg, vis);                                            // v7.10 : escale du porteur calée sur l'orbite
  if(vis.combatPlan) startEngagement(vis, vis.combatPlan.kind, vis.combatPlan.tA, vis.combatPlan.dur);   // v7.14
  [vis.hero, vis.departer].forEach((sh, k) => { if(sh && sh.bays && (k === 0 || sh !== vis.hero)) sh.bays.forEach((op, i) => opSchedule(op, vis.tO0 + rr(.5, 3.5) + i*rr(4, 7))); });
  if(arr && arr.mode === 'warp'){ vis.arrDir = arr.dir.clone(); vis.arrP0 = arr.P0.clone(); }
  else hero.root.visible = false;
  // préparation du système suivant, étalée sur plusieurs images
  tasks.push(() => buildSystem(vis.nextLeg));
  tasks.push(() => { if(!vis.nextLeg.populated){ vis.nextLeg.populated = true; populateSystem(vis.nextLeg).forEach(fn => tasks.push(fn)); } });
  return vis;
}

C.init = function(){ C.initA(); return C.initB(); };
C.initA = function(){                                                    // nettoyage de l'écran-titre, textures d'astéroïdes
  R = rngFor(SEED + ':cine');
  // nettoyage de ce que l'écran-titre a construit
  ROUTE.gates && (scene.remove(ROUTE.gates), ROUTE.gates = null);
  ROUTE.builtSystems.forEach(g => { scene.remove(g); disposePlanetGroup(g); }); ROUTE.builtSystems.clear();
  shipMesh.visible = false;
  sysScene.autoUpdate = false;
  [sysAmb, sunLight, driveLight].forEach(l => l.layers.enableAll());
  shipWorld.add(driveLight);
  renderer.autoClear = false;
  grid = buildWellGrid();
  streaks = buildStreaks(); depFX = buildDepFX(); buildGunFx();
  if(window.__AST && !__AST.ready) console.log('[cine] asteroids', JSON.stringify(__AST.init(String(SEED))));
};
C.initB = function(){                                                    // premier système et son héros
  // premier système : départ de l'itinéraire du jeu (ou étoile la plus proche)
  const first = ROUTE.legs[0] ? legFromStar({ name: ROUTE.legs[0].name, star: ROUTE.legs[0].star, position: ROUTE.legs[0].starPosition, cell: ROUTE.legs[0].cell })
                              : legFromStar(findNextWaypoint(new V3(), v(0,0,-1), new Set(), -1).data);
  recentCells.push(first.cell);
  const hero = makeShip(pickW(DEP_POOL), first);                            // il arrive par saut : cœur de saut requis
  visit = startVisit(first, hero, 2.2, null);
  galPos.copy(first.gal);
  T = 0; shot = null;
  return { hero: hero.type + ' / ' + hero.name, star: first.name, Rs: first.Rs, habA_AU: first.hab.orbitA/AU, habR_km: first.hab.radius/1e3 };
};

function bodiesOf(leg){   // corps susceptibles d'éclipser l'étoile : planètes et lunes
  const out = [];
  (leg.planets || []).forEach(p => { out.push({ pos: p.position, r: p.radius }); (p.moonPivots || []).forEach(pv => { const m = pv.children[0]; if(m) out.push({ pos: m.getWorldPosition(new V3()), r: m.scale.x*1.02 }); }); });
  return out;
}
/* ombre des planètes sur un point (pénombre selon le diamètre apparent de l'étoile) */
function sunShadow(leg, pos){
  let f = 1; const toS = pos.clone().negate(), dS = toS.length(); if(dS < 1) return 1; toS.divideScalar(dS);
  (leg.planets || []).forEach(p => { const rel = p.position.clone().sub(pos), along = rel.dot(toS); if(along <= 0 || along > dS) return;
    const perp = rel.addScaledVector(toS, -along).length(), pen = along*(leg.Rs || RSUN)/dS + p.radius*.01;
    f = Math.min(f, smooth((perp - p.radius)/pen*.5 + .5)); });
  return f;
}
const _cStar = new THREE.Color(), _white = new THREE.Color(1,1,1);
function updateGalaxy(gp){
  shipRig.position.copy(gp);
  const key = [190,1600].map(s => [gp.x, gp.y, gp.z].map(x => Math.round(x/s)).join(',')).join('|');
  if(key !== lastCellKey || T - lastRefresh > 2){ refreshField(190,3,starField,buildStarCell); refreshField(1600,1,nebulaField,buildNebulaCell); lastCellKey = key; lastRefresh = T; }
  backdrop.position.copy(gp);
  backdrop.children.forEach(e => { e.material && e.material.uniforms && e.material.uniforms.uTime && (e.material.uniforms.uTime.value = T); });
  const hideCell = galView ? null : visit.leg.cell;                      // l'étoile du système courant est rendue en taille réelle dans la couche système
  starField.forEach((e, k) => { if(!e) return;
    if(k === hideCell){ e.mesh.visible = false; return; }
    e.mesh.visible = true;
    const a = Math.max(e.mesh.position.distanceTo(gp), 1e-3);
    // étoiles lointaines : points lumineux (taille angulaire bornée), éclat selon la magnitude apparente réelle
    const o = Math.min(THREE.MathUtils.clamp(26*e.baseCore/Math.max(a,1), .3, 9), a*.0025/e.baseCore);
    e.core.scale.setScalar(Math.max(o, 1e-4)); e.core.material.uniforms.time.value = T;
    const i = apparentMagnitude(e.star.lum, Math.max(a/38, .001)), l = THREE.MathUtils.clamp(Math.pow(Math.pow(10, -.4*(i-4)), .25), 0, 6);
    e.halo.scale.setScalar(Math.min(e.baseHalo*(.55 + .55*l), a*.05)); e.halo.material.opacity = THREE.MathUtils.clamp(.25 + .35*l, .15, 1); });
  nebulaField.forEach(e => { if(!e) return; const u = e.mesh.material.uniforms; u.uTime.value = T; const d = e.mesh.userData; if(d && d.currentFade < d.targetFade){ d.currentFade = Math.min(d.targetFade, d.currentFade + .016*.5); u.uFade.value = d.currentFade; } });
}
function updateWorld(dt, k){
  const leg = visit.leg;
  if(leg.star3) leg.star3.lastOcc = __STARS.update(leg.star3, T, dt, cam, bodiesOf(leg));
  // planètes : rotation propre réelle (jour de 9 à 44 h) accélérée par τ (bornée), éclairage par leur étoile, lunes képlériennes
  const kSpin = Math.min(k, 400), kMoon = Math.min(k, 3000);
  leg.planets.forEach(p => { if(!p.mesh) return; p.mesh.rotation.y += 2*Math.PI/p.dayLen*dt*kSpin;
    if(p.fx) __PLANETS.update(p, new V3(), leg.sunColor, T, cam.position, cloudT);
    (p.moonPivots || []).forEach(m => m.rotation.y += (m.userData.n || 0)*dt*kMoon); });
}

function updateShips(dt){
  SHIPGEN.tick(T, dt, 1); RCS_TIME.value = T;
  if(!PUFFS.group) initPuffs();
  ships.forEach(sh => {
    if(!sh.traj || !sh.root.visible) return;
    const st = sh.traj(T);
    sh.root.position.copy(st.pos);
    sh.root.quaternion.copy(st.q || quatNose(st.nose, st.up));
    sh.thr.value = st.throttle;
    if(sh.drive){ const th = st.throttle, h = sh.drive.uHeat; sh.drive.uThr.value = th;   // inertie thermique des tuyères : chauffe en ~1 s, refroidit en ~5 s
      h.value += (th - h.value)*(th > h.value ? 1 - Math.exp(-dt*.9) : 1 - Math.exp(-dt*.2)); }
    updateRcs(sh, T, dt);
    if(sh.geode) spinGeode(sh, T);
    if(sh.rings) spinRings(sh, T);
    if(sh.drive && sh.drive.units && window.__SHIPDRIVE){                    // cardans : suivent le couple demandé, vibration pendant la poussée
      const a = sh.alpha, th = st.throttle || 0, g = sh.gimb || (sh.gimb = { x: 0, y: 0, idle: false });
      const tx = a ? -clamp(a.x/RCS_REF, -1, 1)*GIMBAL : 0, ty = a ? -clamp(a.y/RCS_REF, -1, 1)*GIMBAL : 0, kk = 1 - Math.exp(-dt*5);
      g.x += (tx - g.x)*kk; g.y += (ty - g.y)*kk;
      const idle = Math.abs(g.x) + Math.abs(g.y) < 1e-4 && th < .01;
      if(!(idle && g.idle)) __SHIPDRIVE.gimbal(sh.drive, g.x, g.y, th*.0035, T);
      g.idle = idle;
    }
    if(sh.nav) sh.nav.forEach(nl => { const ph = ((T/nl.period + nl.phase) % 1); nl.mat.opacity = ph < nl.duty ? nl.peak : 0; });
    if(sh.radiators && sh.drive){ const k = .28 + 1.1*sh.drive.uHeat.value; sh.radiators.forEach(m => m.emissiveIntensity = k); }   // v7.8 : radiateurs qui rougeoient avec la poussée
    if(sh.glow) sh.glow.material.opacity = .7;
  });
}

C.step = function(dt, noRender){
  if(!noRender && SLOW.t1 > T) dt *= slowK(T);                               // v7.16 : ralenti bref sur une destruction filmée
  T += dt;
  kNow = rateAt(T);
  cloudT += dt*(.03 + .97*Math.min(kNow, 400)/400);                 // évolution des nuages : quasi figée en temps réel, vive en accéléré
  const vis = visit;
  // bascule vers le système suivant à la fin de l'onde du saut (ou pendant la décélération de distorsion)
  if(T >= vis.tEnd){
    const next = vis.nextLeg;
    if(!next.group) buildSystem(next);
    const hero = vis.departer; hero.charge.value = 0;
    if(vis.mode === 'jump') setInnerScale(hero, SCALE, SCALE, SCALE);
    if(hero.geode) setGeode(hero, 0, 0);
    const oldLeg = vis.leg; oldLeg.group && (oldLeg.group.visible = false);
    if(hero.isCarrier) carryOver(hero, oldLeg, next);                 // v7.11 : le porteur emmène ce qui est à bord
    tasks.unshift(() => disposeSystem(oldLeg));                       // l'ancien système (et son trafic) est libéré
    if(vis.mode === 'warp') visit = startVisit(next, hero, vis.tExit, vis.wDir, { mode:'warp', target: vis.arrB.target, P0: vis.arrB.P0, dir: vis.wDir, W: vis.warp });
    else visit = startVisit(next, hero, T + 1.9, vis.toNext);
    shot = null;
  }
  // tâches différées (construction / libération) : une par image
  if(tasks.length) { try { tasks.shift()(); } catch(e){ console.error(e); } }
  if(!shot || T >= shot.t1) shot = chooseShot(T);
  const leg = visit.leg;
  // caméra
  const c = shot.cam(T);
  galView = null; sysHidden = false;
  if(shot.gal){ galView = { pos: c.pos, fov: c.fov, q: new Q() }; const m = new THREE.Matrix4().lookAt(c.pos, c.look, c.up || v(0,1,0)); galView.q.setFromRotationMatrix(m); sysHidden = true; cam.fov = c.fov; }
  else {
    const subjPos = shot.subj.traj(T).pos;
    const noMin = shot.vista || CLOSE[shot.type] || shot.type === 'bayOps' || shot.type === 'gunnery' || shot.type === 'formation' || shot.type === 'dockPass' || shot.type === 'dockInterior' || shot.type === 'dockBerth' || shot.type === 'torchClose' || shot.type === 'radiatorPass' || BERTH_SHOTS[shot.type] || COMBAT_SHOTS[shot.type] || (shot.subj && shot.subj.eng) || shot.type === 'arrive' || shot.type === 'arriveFront' || shot.type === 'reveal' || shot.type === 'jump' || shot.type === 'shipTransit' || shot.type === 'warpArrive';
    safeCam(c.pos, leg, noMin ? null : subjPos, shot.subj.len*1.4, !!shot.low);
    cam.position.copy(c.pos); if(c.up) cam.up.copy(c.up); else cam.up.set(0,1,0); cam.lookAt(c.look); cam.fov = c.fov;
    updateDof(dt, c); applyShake(T, dt, c.fov);
  }
  if(shot.gal){ DOF.k = 0; DOF.shot = shot; }
  // position galactique : étoile du système, ou défilement réel pendant la distorsion
  const W = visit.warp;
  if(visit.mode === 'warp' && W && T > W.tEng) galPos.copy(W.galA).lerp(W.galB, W.frac(T)); else galPos.copy(leg.gal);
  updateGalaxy(galView ? galView.pos : galPos);
  updateWorld(dt, kNow);
  // visibilité : vaisseaux du système affiché
  ships.forEach(sh => sh.root.visible = sh.leg === leg && !(sh.hideAt && sh.hideAt(T)));   // v7.10 : vaisseau en escale hors champ entre deux passages
  updateShips(dt);
  updateGunnery(dt);                                                         // v7.5 : exercices de tir
  updateCrafts(dt);
  updateCarriers();                                                          // v7.6 : portique, anneaux, ombre de soute
  if(visit.eng) updateEngagement(visit.eng, dt); else if(CBT.grp){ CBT.grp.visible = false; if(CBT.hulks.length) clearHulks(null); }   // v7.14 : engagement en cours
  updateCombat(dt);                                                          // v7.13 : désemparés, recharge des boucliers
  // effets de saut
  FX.active = false; grid.visible = false; FX.vignette = 0; FX.flashDom = 0;
  if(visit.arrMode !== 'warp') arriveFX(T, visit);
  if(visit.mode === 'jump') jumpOutFX(T, visit);
  warpFX(T);
  if(visit.showcase && !visit.showcaseMsg && T >= visit.depStart - 1.5 && window.__DEMO){       // v7.2.2 : la vedette ne peut pas partir
    visit.showcaseMsg = true; const a = visit.showcase, d = visit.departer, e = s => String(s).replace(/[&<>]/g, '');
    if(a.isCarrier) __DEMO.toast('<span class="a">RELAY</span> · ' + e(a.type) + ' <span class="c">stays in orbit, loading — the journey continues aboard</span> ' + e(d.type) + ' / ' + e(d.name)); else
    __DEMO.toast('<span class="a">RELAY</span> · ' + e(a.type) + ' <span class="c">has no jump core or warp rings — the journey continues aboard</span> ' + e(d.type) + ' / ' + e(d.name)); }
  if(window.__DEMO && visit.eng && !visit.eng.msg.start && T >= visit.eng.tA){ const E = visit.eng; E.msg.start = true;   // v7.14 : début d'engagement
    __DEMO.toast(E.kind === 'raid' ? '<span class="a">DISTRESS CALL</span> · freighter under pirate attack <span class="c">— ' + FACTIONS[E.facs[0]].name + ' patrol alerted</span>'
      : '<span class="a">ENGAGEMENT</span> · ' + FACTIONS[E.facs[E.kind === 'convoy' || E.kind === 'assault' ? 1 : 0]].name + ' vs ' + FACTIONS[E.facs[E.kind === 'convoy' || E.kind === 'assault' ? 0 : 1]].name + ' <span class="c">— ' + ENG_NAMES[E.kind] + '</span>'); }
  if(window.__DEMO){ const e = s => String(s).replace(/[&<>]/g, '');                 // v7.11 : voyage à bord d'un porteur
    if(visit.trip && !visit.tripInMsg && T >= visit.tO0 + 1){ visit.tripInMsg = true; const o = visit.trip; __DEMO.toast('<span class="a">DISEMBARK</span> · ' + e(o.X.type) + ' / ' + e(o.X.name) + ' <span class="c">leaves</span> ' + e(o.K.name) + (o.reembark ? ' <span class="c">— back aboard before departure</span>' : '')); }
    if(visit.tripOut && !visit.tripMsg && T >= visit.depStart - 1.5){ visit.tripMsg = true; const o = visit.tripOut; __DEMO.toast('<span class="a">CARRIER</span> · ' + e(o.X.type) + ' / ' + e(o.X.name) + ' <span class="c">travels on aboard</span> ' + e(o.K.type) + ' / ' + e(o.K.name)); } }
  if(visit.arrMode !== 'warp' && T < visit.tArrive + .12) visit.hero.root.visible = false;
  if(visit.mode === 'jump' && T > visit.tJ + JT.charge + JT.fold + JT.flash*.5) visit.departer.root.visible = false;
  syncDocked();                                                              // v7.11 : ce qui est à bord suit le porteur (étirement, disparition)
  updateImpacts(dt);                                                         // v7.13 : étincelles, points chauds, gaz
  updateSmoke();                                                             // v7.16 : fumée des explosions
  updatePuffs(T);
  PUFFS.group.visible = !shot.vista;
  if(shot.vista){ ships.forEach(sh => sh.root.visible = false); grid.visible = false; streaks.visible = false; FX.active = false; FX.vignette = 0; FX.flashDom = 0; }
  grid.material.uniforms.uTime.value = T;
  // lumières : étoile du système (directionnelle, ombre des planètes) + lueur de tuyère du vaisseau filmé
  const sp = shot.subj.traj(T);
  const toSun = sp.pos.clone().negate().normalize();
  sunLight.position.copy(toSun); sunLight.target.position.set(0,0,0);
  sunLight.color.copy(leg.sunColor).lerp(_white, .45); sunLight.intensity = 1.65*sunShadow(leg, sp.pos);
  if(window.__SHIPGLASS){ const GU = __SHIPGLASS.U; GU.uSunDir.value.copy(toSun); GU.uSunCol.value.copy(sunLight.color); GU.uSunI.value = sunLight.intensity/1.65; GU.uTime.value = T; }   // vitrages et hangars (shipglass.js)
  const f = frameOf(sp.q || quatNose(sp.nose, sp.up));
  driveLight.position.copy(sp.pos).addScaledVector(f.fwd, -shot.subj.len*.62);
  driveLight.distance = shot.subj.len*1.8; driveLight.intensity = 2.2*shot.subj.thr.value;
  // légende : facteur d'accélération du temps
  if(shot.caption) shot.caption.tl = fmtRate(kNow);
  // DOM (vignette / éclair du jeu)
  const vg = document.getElementById('jumpVignette'), fl = document.getElementById('jumpFlash');
  vg && (vg.style.opacity = String(FX.vignette || 0)); fl && (fl.style.opacity = String(FX.flashDom || 0));
  if(window.__PLANETS) __PLANETS.setPixelAngle(cam.fov, renderer.getDrawingBufferSize(new THREE.Vector2()).y);
  if(!noRender) renderFrame();
  return { T, shot: shot.type, cap: shot.caption, seg: sp.seg, k: kNow };
};
function fmtRate(k){ return k < 1.95 ? '' : '×' + fmt2(k); }
C.caption = () => shot && shot.caption;
C.shotStart = () => shot && shot.t0;
C.time = () => T;
C.tau = () => tauAt(T);
C.rate = () => kNow;
C.visit = () => visit;
/* ---------- sélecteur de vaisseaux (lot 1) ---------- */
C.setFollow = f => { C.followHero = !!f; return C.followHero; };
C.setHero = function(model, opts, follow){
  if(follow !== undefined) C.followHero = !!follow;
  const vis = visit; if(!vis || !SHIPGEN.MODELS.some(m => m.id === model)) return 'invalid';
  if(T < vis.depStart - 4){
    if(!canLeave(model, opts)){ if(tripAllowed() && (C.followHero || R() < .5) && tripNow(vis, model, opts)){ shot = null; return 'trip'; }   // v7.11 : il part à bord d'un porteur
      showcaseNow(vis, model, opts); shot = null; return 'now'; }                  // v7.2.2 : vedette, départ par un autre
    const eq = equipOf(model, opts);
    if(vis.mode === 'warp' ? eq.warp : true){ relayNow(vis, model, opts); shot = null; return 'now'; }       // saut prévu : bascule en distorsion si besoin
  }
  C.pending = { model, opts }; return 'next';                                                   // départ déjà engagé : relais au système suivant
};
C.heroInfo = () => { const s = shot && shot.subj && shot.subj.type ? shot.subj : visit.departer; return { model: s.model, type: s.type, name: s.name, follow: C.followHero, pending: C.pending ? C.pending.model : null }; };
C.bayList = () => [...ships].filter(x => x.bays).map(x => x.model + (x.leg === visit.leg ? '*' : '') + ':' + x.bays.map(o => o.kind + '/' + o.d.mode).join(','));
C.forceBay = function(i, npc, dt){ const s = npc === 'dep' ? visit.departer : npc ? ([...ships].find(x => x.model === npc && x.bays && x.leg === visit.leg) || visit.hero) : visit.hero; if(!s.bays || !s.bays[i]) return 'no bay'; const op = s.bays[i]; opSchedule(op, T + (dt || .5)); s.bayShot = op; shot = makeShot('bayOps', s, T, T + 14, visit); return op.kind + ':' + op.d.mode; };
C.forceShotOn = function(type, subj, dur){ shot = makeShot(type, subj, T, T + (dur || 6), visit); return shot.type; };   // test v7.11
C.forceShot = function(type, npc){ const subj = npc ? (visit.leg.npcs.find(s => s.model === npc) || visit.hero) : (T >= visit.depStart - 1 ? visit.departer : visit.hero); shot = makeShot(type, subj, T, T + 6, visit); };
C.debugView = function(leg, camPos, look, fov, up){
  cam.position.copy(camPos); cam.up.copy(up || v(0,1,0)); cam.lookAt(look); cam.fov = fov || 50;
  galView = null; sysHidden = false; galPos.copy(leg.gal); updateGalaxy(galPos);
  ships.forEach(sh => sh.root.visible = false); grid.visible = false; FX.active = false;
  leg.planets.forEach(p => { if(p.fx) __PLANETS.update(p, new V3(), leg.sunColor, T, camPos, cloudT); });
  __PLANETS.setPixelAngle(cam.fov, renderer.getDrawingBufferSize(new THREE.Vector2()).y);
  renderer.setRenderTarget(null); renderLayers();
};
C.buildLeg = function(cellStr){ const c = cellStr.split(',').map(Number); const sd = starDataForCell(c[0], c[1], c[2]); if(!sd) return null; return buildSystem(legFromStar(sd)); };
C.legFromCell = function(x,y,z){ const sd = starDataForCell(x,y,z); return sd ? legFromStar(sd) : null; };
C.bayAxisDbg = function(t1){                          // test : écart des engins à l'axe de leur baie pendant qu'ils la franchissent
  const out = [];
  ships.forEach(sh => (sh.bays || []).forEach((op, i) => {
    const d = op.d, N = d.N, ax0 = op.cPark.clone(); let worst = 0, wt = null, wseg = null, n = 0;
    for(let t = T; t < T + (t1 || 400); t += .25){
      const r = opPose(op, t); if(!r.vis || (r.s !== 'out' && r.s !== 'in' && r.s !== 'away')) continue;
      if(r.s === 'away'){ const k = op.plan.indexOf(r.seg), pv = op.plan[k - 1], nx = op.plan[k + 1];
        if(!((pv && pv.s === 'out' && t - r.seg.t0 < 3) || (nx && nx.s === 'in' && r.seg.t1 - t < 3))) continue; }
      const c = r.center, sAx = c.clone().sub(ax0).dot(N), depthOut = c.clone().sub(d.C).dot(N);
      if(depthOut > op.ext + 3 || depthOut < -op.ext*2) continue;           // seulement quand l'engin est dans l'embrasure ou juste devant
      const lat = c.clone().sub(ax0).addScaledVector(N, -sAx).length(); n++;
      if(lat > worst){ worst = lat; wt = +(t - T).toFixed(2); wseg = r.s; }
    }
    out.push({ ship: sh.model, bay: i, mode: d.mode, kind: op.kind, n, worst: +worst.toFixed(2), at: wt, seg: wseg, cb: op.cb.toArray().map(x => +x.toFixed(2)), ext: +op.ext.toFixed(1) });
  }));
  return out;
};
C.pendingMil = null; C.pendingCar = false; C.pendingShow = null;
/* ---------- v7.18 : chantier — catalogue complet, aperçu, vaisseau choisi ----------
   23 types : les 10 modèles du jeu et sa navette de fret, 6 petits engins, 4 militaires, 2 porte-vaisseaux. Âge (temps) et usure
   (service) sont deux uniformes du shader d'usure : ils se règlent en direct sur l'aperçu, puis sur le vaisseau qui rejoint la scène. */
const CAT_EXTRA = [['shuttle', 'civil'], ['maint', 'craft'], ['crew', 'craft'], ['drone:inspect', 'craft'], ['drone:relay', 'craft'], ['drone:cargo', 'craft'], ['lighter', 'craft'],
  ['fighter', 'mil'], ['corvette', 'mil'], ['destroyer', 'mil'], ['target', 'mil'], ['carrier', 'carrier'], ['carrierMil', 'carrier']];
function craftName(kind, variant){ const N = window.__CRAFT && __CRAFT.NAMES ? __CRAFT.NAMES[kind] : null; return (N && typeof N === 'object') ? N[variant] : (N || kind); }
function applyLook(sh, L){ const U = sh.wearU || (sh.craft && sh.craft.wear); if(!U || !L) return; if(L.age != null){ U.uAge.value = clamp(+L.age, 0, 1); sh.age = U.uAge.value; } if(L.wearAmt != null && U.uWear) U.uWear.value = clamp(+L.wearAmt, 0, 1); }
function makeAny(id, leg, L){                                                // vaisseau du catalogue (hors modèles du jeu) avec l'aspect choisi
  const [kind, variant] = id.split(':'), look = { age: L.age, wearAmt: L.wear, seed: L.seed };
  if(kind === 'shuttle') return makeShuttle(leg, look);
  if(!window.__CRAFT) return null; const mil = !!(__CRAFT.MIL && __CRAFT.MIL[kind]) && kind !== 'target';
  const sh = makeCraft(kind, leg, Object.assign({ variant, faction: mil ? (L.faction || legFaction(leg)) : undefined }, look));
  if(kind === 'drone') sh.type = craftName(kind, variant);
  return sh;
}
C.catalog = function(){
  const out = SHIPGEN.MODELS.map(m => ({ id: m.id, fam: 'civil', type: TYPE_EN[m.id] || m.name, cls: m.name, ftl: !!FTL[m.id], drives: FTL[m.id] ? 'quantum jump · warp' : 'sublight only' }));
  CAT_EXTRA.forEach(([id, fam]) => { const [k, v] = id.split(':');
    out.push({ id, fam, type: k === 'shuttle' ? TYPE_EN.shuttle : craftName(k, v), cls: k === 'shuttle' ? 'Traffic' : (fam === 'mil' ? 'Military' : (fam === 'carrier' ? (k === 'carrierMil' ? 'Military' : 'Civil') : 'Small craft')),
      ftl: fam === 'carrier', drives: fam === 'carrier' ? 'quantum jump · warp' : (k === 'fighter' || k === 'corvette' || k === 'destroyer' ? 'sublight (combat)' : 'sublight only'), faction: fam === 'mil' && k !== 'target' }); });
  return out;
};
C.previewBuild = function(id, L){                                             // aperçu du chantier : vaisseau isolé, centré, en mètres (non ajouté à la scène)
  L = L || {}; const [kind, variant] = id.split(':'), seed = L.seed || 7, root = new THREE.Group();
  if(SHIPGEN.MODELS.some(m => m.id === kind)){
    const eq = equipOf(kind, L.drive), b = SHIPGEN.build(kind, { warp: eq.warp, jump: eq.jump, age: L.age || 0, ageSeed: seed, wearAmt: L.wear });
    patchUniforms(b.group, { value: 0 }, { value: 0 }, { value: .15 }, { value: 0 }); b.lights.forEach(l => l.parent && l.parent.remove(l));
    const com = b.hullBox.getCenter(new V3()); b.group.scale.setScalar(SCALE); b.group.position.copy(com).multiplyScalar(-SCALE); root.add(b.group);
    return { root, len: b.dims.z*SCALE, U: b.wear, dispose(){ SHIPGEN.dispose(b.group); } };
  }
  if(kind === 'shuttle'){ const s = buildShuttle(), U = window.__SHIPWEAR ? __SHIPWEAR.apply(s.group, L.age || 0, seed, 12, L.wear) : null; s.group.scale.setScalar(12);
    const bx = new THREE.Box3().setFromObject(s.group), c = bx.getCenter(new V3()); s.group.position.sub(c); root.add(s.group);
    return { root, len: 25, U, dispose(){ s.group.traverse(o => { o.geometry && o.geometry.dispose(); }); } }; }
  if(!window.__CRAFT) return null;
  const F = L.faction && FACTIONS[L.faction] && kind !== 'target' && __CRAFT.MIL && __CRAFT.MIL[kind] ? FACTIONS[L.faction] : null;
  const c = __CRAFT.build(kind, { variant, seed, age: L.age || 0, wearAmt: L.wear, paint: F ? F.paint[seed % F.paint.length] : undefined, accent: F ? F.accent : undefined });
  if(c.extra && c.extra.drive) patchUniforms(c.group, { value: 0 }, { value: 0 });   // moteurs du jeu (militaires, porteurs) au repos : pas de torche dans l'aperçu
  const cc = c.box.getCenter(new V3()); c.group.position.copy(cc).negate(); root.add(c.group);
  return { root, len: c.len, U: c.wear, dispose(){ c.dispose(); } };
};
C.useShip = function(id, L){                                                  // « USE THIS SHIP » : le vaisseau rejoint l'orbite, la caméra le suit
  const vis = visit; if(!vis) return 'invalid'; L = L || {}; const [kind] = id.split(':'), look = { age: L.age, wearAmt: L.wear, seed: L.seed };
  if(SHIPGEN.MODELS.some(m => m.id === kind)) return C.setHero(kind, Object.assign({}, L.drive || {}, look));
  if(kind === 'carrier' || kind === 'carrierMil') return C.showCarrier(kind, look);
  if(T >= vis.depStart - 4){ C.pendingShow = { id, L }; return 'next'; }
  const sh = makeAny(id, vis.leg, L); if(!sh) return 'invalid'; showcaseNow(vis, null, null, sh); shot = null; return 'now';
};
C.lookOf = sh => { const U = sh && (sh.wearU || (sh.craft && sh.craft.wear)); return U ? { age: +U.uAge.value.toFixed(3), wear: U.uWear ? +U.uWear.value.toFixed(3) : null } : null; };   // tests
C.subject = () => shot && shot.subj;
C.showMilitary = function(kind){                                             // v7.5 : panneau FLEET — la flotte choisie devient le sujet de l'orbite
  const vis = visit; if(!vis || !['station', 'patrol', 'escort'].includes(kind)) return 'invalid';
  if(T >= vis.depStart - 4){ C.pendingMil = kind; return 'next'; }
  const s = ensureMil(vis.leg, kind); if(!s) return 'invalid';
  Object.assign(vis, { showcase: s, userHero: true, showcaseMsg: false }); shot = null; return 'now';
};
C.prewarm = function(){                                                     // v7.6 : shaders des engins tardifs (porte-vaisseaux, flotte militaire) compilés au chargement
  if(!window.__CRAFT || !__CRAFT.CARRIER || !renderer.compile) return 0;
  const kinds = ['carrier', 'carrierMil', 'destroyer', 'corvette', 'fighter', 'target'], built = [];
  kinds.forEach((k, i) => { try { const c = __CRAFT.build(k, { seed: 11 + i, age: .2 }); c.group.position.set(i*900, 0, -5e4); shipWorld.add(c.group); built.push(c); } catch(e){ console.error(e); } });
  const t0 = performance.now(); renderer.compile(sysScene, cam);
  built.forEach(c => { c.group.visible = false; });                          // gardés (cachés) : les programmes restent en cache
  C.prewarmMs = Math.round(performance.now() - t0); return built.length;
};
C.showCarrier = function(kind, look){                                        // v7.6 : panneau FLEET — le porte-vaisseaux devient le sujet de l'orbite (v7.18 : type et aspect choisis au chantier)
  const vis = visit; if(!vis) return 'invalid'; const want = kind === 'carrierMil' ? 'mil' : (kind === 'carrier' ? 'civil' : null), ex = vis.leg.npcs.find(x => x.isCarrier);
  if(T >= vis.depStart - 4 || (want && ex && ex.model !== kind)){ C.pendingCar = want ? { kind, look } : true; return 'next'; }   // un seul porteur par système : l'autre type au système suivant
  const had = !!ex, s = ensureCarrier(vis.leg, want || PARAMS.get('carrier')); if(!s) return 'invalid'; if(look) applyLook(s, look);
  if(C.followHero && tripAllowed() && s.berthOp){ const X = s.berthOp.s, dk = isAboard(X); if(dk) boardNow(s, X, vis.leg, vis.tEnd + 1); else s.passenger = null;   // v7.11 : mode Suivre → le porteur part, avec son visiteur s'il est à bord
    if(vis.trip && vis.trip.K !== s) vis.trip.K.passenger = null;
    carrierDepart(vis, s); Object.assign(vis, { tripOut: dk ? { K: s, X, user: false } : null, trip: vis.trip && vis.trip.K === s ? vis.trip : null, userHero: true, carFresh: true, tripMsg: false, showcase: s, showcaseMsg: true }); shot = null; return 'now'; }
  if(!had && s.berthOp) berthSchedule(s.berthOp, 'depart', T + rr(6, 9));   // v7.10 : nouveau porteur en pleine orbite → départ du visiteur après le premier plan
  Object.assign(vis, { showcase: s, userHero: true, showcaseMsg: false, carFresh: true }); shot = null; return 'now';
};
C.carrierDbg = () => { const c = ((visit && visit.leg.npcs) || []).find(x => x.isCarrier); if(!c) return null; const H = window.__SHIPWEAR && __SHIPWEAR.HOLD;
  return { kind: c.model, name: c.name, type: c.type, parked: c.berthed && c.berthed[1] ? c.berthed[1].model : null, shot: shot && shot.type, subj: shot && shot.subj && shot.subj.model,
    camD: Math.round(cam.position.distanceTo(c.root.position)), hold: H ? H.uHoldH.value.w : null, geode: !!c.geode, equip: c.equip, drones: visit.leg.npcs.filter(x => x.docked === c && x.craft).length }; };
const _lc = new THREE.PerspectiveCamera(50, 1, 1, 1e13);
C.labelsState = function(max){                                                // v7.13 : étiquettes et jauges des vaisseaux proches (shiplabels.js)
  if(!shot || shot.vista || shot.gal || !visit || galView) return null;
  const el = renderer.domElement, W = el.clientWidth || 960, H = el.clientHeight || 540;
  _lc.quaternion.copy(cam.quaternion); _lc.fov = cam.fov; _lc.aspect = W/H; _lc.position.set(0, 0, 0); _lc.updateProjectionMatrix(); _lc.updateMatrixWorld();
  const f = frameOf(cam.quaternion), cp = cam.position, hero = heroOf(visit), out = [];
  ships.forEach(s => { if(!s.root.visible || s.leg !== visit.leg || !s.traj || (s.docked && isAboard(s)) || !s.name) return;
    const rel = s.root.position.clone().sub(cp), d = rel.length(); if(d < 1 || d > Math.max(4000, s.len*45) || rel.dot(f.fwd) <= 0) return;
    const a = rel.clone().project(_lc), b = rel.clone().addScaledVector(f.up, s.len*.55).project(_lc), rpx = Math.abs(b.y - a.y)*.5*H;
    if(rpx < (s.mil || s.model === 'target' ? 2.5 : 6) || rpx > H*.4) return;   // trop petit (sauf militaires et cibles), ou gros plan (l'étiquette gênerait)
    const x = (b.x*.5 + .5)*W, y = (.5 - b.y*.5)*H; if(x < 30 || x > W - 30 || y < 34 || y > H - 40) return;
    const hp = hpOf(s), F = s.faction ? FACTIONS[s.faction] : null;
    out.push({ uid: uidOf(s), name: s.name, owner: ownerOf(s), col: F ? F.css : (s.mil ? '#ff6b5e' : '#5eead4'), hull: +hp.hull.toFixed(3), shield: hp.shMax ? +hp.shield.toFixed(3) : null, energy: +hp.energy.toFixed(3),
      dis: hp.disabled, d: Math.round(d), x: Math.round(x), y: Math.round(y), hero: s === hero, subj: s === shot.subj }); });
  out.sort((p, q) => (q.subj - p.subj) || p.d - q.d); return out.slice(0, max || 8);
};
C.combatDbg = () => { const v = visit, l = (v.leg.npcs || []).filter(x => x.hp || x.mil); return { faction: v.leg.faction || null, imp: IMP.n || 0, ships: l.map(x => { const h = hpOf(x); return x.model + ':' + (x.faction || '-') + ':' + h.hull.toFixed(2) + '/' + h.shield.toFixed(2) + '/' + h.energy.toFixed(2) + (h.disabled ? ':DIS' : ''); }) }; };
C.hitTest = (model, n, dmg) => { const s = visit.leg.npcs.find(x => x.model === model); if(!s) return null; for(let i = 0; i < (n || 1); i++){ const d = randUnitM(); hitShip(s, dmg || .05, hullEntry(s, s.root.position.clone().addScaledVector(d, s.len*2), d.clone().negate()), d.negate()); } C.hitLast = s; return C.combatDbg(); };
C.pendingCombat = null;
C.strafeIn = s => strafeIn(s, T);
C.boomDbg = () => { const E = visit.eng; return E ? E.ships.filter(s => s.hp && s.hp.boom).map(s => ({ n: s.name, m: s.model, boom: +s.hp.boom.toFixed(2), dead: !!s.hp.dead })) : []; };   // tests v7.16
C.slow = () => ({ t0: SLOW.t0, t1: SLOW.t1, k: slowK(T) });
C.leakDbg = () => { const g = {}; let alive = 0, aliveDisp = 0; TRACK.forEach(r => { const a = !!r.root.deref(); if(!a) return; alive++; const k = r.kind + ':' + r.model + (r.disp !== null ? ':DISPOSED' : (r.crafted ? ':bay' : '')); g[k] = (g[k] || 0) + 1; if(r.disp !== null) aliveDisp++; });
  const det = TRACK.filter(r => { const o = r.root.deref(); if(!o) return false; let q = o; while(q.parent) q = q.parent; return !q.isScene; }).map(r => { const sh = r.ref.deref(); return r.kind + ':' + r.model + '@' + Math.round(r.T0) + (r.disp !== null ? ' disp@' + Math.round(r.disp) : '') + (sh && ships.has(sh) ? ' inShips' : '') + (sh && crafts.has(sh) ? ' inCrafts' : '') + ' ' + r.leg; });
  return { tracked: TRACK.length, alive, aliveDisposed: aliveDisp, ships: ships.size, crafts: crafts.size, byKind: g, detached: det }; };   // tests v7.19
C.isTracked = o => { const r = TRACK.find(x => x.root.deref() === o); return r ? (r.kind + ':' + r.model + '@' + Math.round(r.T0) + (r.disp !== null ? ' disp@' + Math.round(r.disp) : '')) : null; };
C.markDead = (Cls) => { const out = []; TRACK.forEach(r => { if(r.disp === null) return; const sh = r.ref.deref(); if(!sh) return; sh.__leakMark = new Cls(r.kind + ':' + r.model + '@' + Math.round(r.T0) + ' disp@' + Math.round(r.disp)); out.push(sh.__leakMark.s); }); return out; };   // tests v7.19
C.leakRefs = () => {                                                           // tests v7.19 : structures qui pointent encore vers des vaisseaux libérés
  const dead = new Set(TRACK.filter(r => r.disp !== null).map(r => r.ref.deref()).filter(Boolean)), hit = {}, add = (k, o) => { if(o && dead.has(o)) hit[k] = (hit[k] || 0) + 1; };
  IMP.parts.forEach(p => add('IMP.parts', p.sh)); SMK.parts.forEach(p => add('SMK.parts', p.sh)); CBT.pool.forEach(t => { add('CBT.pool.sh', t.sh); add('CBT.pool.tg', t.tg); });
  GUN.pool.forEach(t => { for(const k in t) add('GUN.pool.' + k, t[k]); }); add('GUN.shooter', GUN.shooter);
  ships.forEach(x => add('ships', x)); crafts.forEach(x => { add('crafts', x); add('crafts.carrier', x.carrier); });
  const v = visit; for(const k in v) add('visit.' + k, v[k]); if(v.eng) v.eng.ships.forEach(x => add('visit.eng.ships', x));
  if(shot){ add('shot.subj', shot.subj); } (v.leg.npcs || []).forEach(x => add('leg.npcs', x)); (v.nextLeg && v.nextLeg.npcs || []).forEach(x => add('nextLeg.npcs', x));
  return { dead: dead.size, hit };
};
C.debris = () => CBT.deb ? CBT.deb.count : 0;
C.smk = () => ({ n: SMK.pts ? SMK.pts.geometry.drawRange.count : 0, vis: !!(SMK.grp && SMK.grp.visible), r: SMK.grp ? +SMK.grp.userData.r.toFixed(0) : 0, imp: IMP.n || 0 });
C.hulkSubj = name => { const H = CBT.hulks.find(x => x.sh.name === name); return H ? H.subj : null; };
C.hulkDbg = () => CBT.hulks.map(H => ({ n: H.secs.length, age: +(T - H.t0).toFixed(1), shown: H.shown, spread: +H.spread(T).toFixed(0), meshes: H.secs.map(x => x.cont.children.filter(o => o.isMesh).length), name: H.sh.name, model: H.sh.model }));   // tests v7.17
C.splitDbg = () => { const E = visit.eng; return E ? E.ships.filter(s => s.hp && s.hp.split).map(s => ({ n: s.name, m: s.model, ready: s.hp.split.ready, tris: s.hp.split.tris, ms: +s.hp.split.ms.toFixed(1), jobs: s.hp.split.jobs.length, cuts: s.hp.split.cuts.length })) : []; };
C.camDbg = () => { const s = shot && shot.subj; if(!s) return null; const c = shot.cam(T), p = s.traj(T).pos, d = c.look.clone().sub(c.pos).normalize(), r = p.clone().sub(c.pos); return { type: shot.type, dist: +r.length().toFixed(1), ang: +(Math.acos(clamp(r.normalize().dot(d), -1, 1))*57.3).toFixed(1), fov: c.fov, vis: s.root ? s.root.visible : null }; };   // tests v7.15                                              // v7.15 : tests (passe de mitraillage imminente ?)
C.startCombat = function(kind){                                               // v7.14 : panneau FLEET — engagement maintenant (s'il reste ≥ 26 s d'orbite) ou au système suivant
  const vis = visit; if(!vis || !window.__CRAFT || !__CRAFT.MIL) return 'invalid'; kind = COMBAT_KINDS.indexOf(kind) >= 0 ? kind : 'skirmish'; C.lastCombatKind = kind;
  if(vis.eng && T < vis.eng.tB) return 'busy';
  if(T >= vis.tO0 - 2 && T < vis.depStart - 26){ const E = startEngagement(vis, kind, T + 2, Math.min(42, vis.depStart - T - 4)); if(!E) return 'invalid'; C.lastCombatKind = E.kind; shot = null; return 'now'; }   // assaut sans porteur militaire possible → convoi
  C.pendingCombat = kind; return 'next'; };
C.engDbg = () => { const E = visit.eng; if(!E) return null; return { kind: E.kind, facs: E.facs, tA: +E.tA.toFixed(1), tB: +E.tB.toFixed(1), T: +T.toFixed(1), over: E.over, winner: E.winner, tr: CBT.pool.filter(t => T - t.t0 <= t.life).length, mis: E.missiles.filter(m => !m.dead).length, misAll: E.missiles.length,
  tP: E.tP, tF: E.tF, fled: !!E.fled, withdrawn: !!E.withdrawn, ships: E.ships.map(s => (s.civ ? 'v' : s.isCarrier ? 'K' : s.model[0]) + s.side + ':' + hpOf(s).hull.toFixed(2) + '/' + hpOf(s).shield.toFixed(2) + (s.hp.disabled ? 'D' : '') + (s.root.visible ? '' : 'h')), shot: shot && shot.type, cap: shot && shot.caption && shot.caption.planet }; };
C.tripDbg = () => { const v = visit, o = v.trip || v.tripOut, K = o ? o.K : null, r = K && K.berthOp ? berthPose(K.berthOp, T) : null;
  return { trip: !!v.trip, tripOut: !!v.tripOut, reembark: v.trip ? v.trip.reembark : null, K: K ? K.name : null, X: o ? o.X.model + ' ' + o.X.name : null, ph: r ? r.s : null, u: r ? +((T - r.seg.t0)/(r.seg.t1 - r.seg.t0)).toFixed(2) : null,
    aboard: o ? isAboard(o.X) : null, hero: v.hero.model, departer: v.departer.model, depStart: +v.depStart.toFixed(1), tO0: +v.tO0.toFixed(1), tEnd: +v.tEnd.toFixed(1), T: +T.toFixed(1), shot: shot && shot.type, cap: shot && shot.caption && shot.caption.name,
    Xvis: o ? o.X.root.visible : null, Kvis: K ? K.root.visible : null, legOK: o ? o.X.leg === v.leg : null, npcs: v.leg.npcs.length }; };
C.forceBerth = function(ph, u){                                               // test v7.10 : impose la phase ph, avancée u (0…1), à l'instant T
  const c = ((visit && visit.leg.npcs) || []).find(x => x.isCarrier); if(!c || !c.berthOp) return null; const op = c.berthOp; u = u || 0;
  const DUR = { approach: 30, align: 3, slide: 16, clamp: 4, docked: 30, release: 3, exit: 16, depart: 24, gone: 30 };
  if(ph in BERTH_ARR) berthSchedule(op, 'arrive', T - (BERTH_ARR[ph] - BERTH_ARR.slide) - u*DUR[ph]); else berthSchedule(op, 'depart', T - (BERTH_DEP[ph] || 0) - u*DUR[ph]);
  return op.plan.map(g => g.s + '@' + (g.t0 > -1e8 ? +(g.t0 - T).toFixed(1) : '-')).join(' '); };
C.berthDbg = () => { const c = ((visit && visit.leg.npcs) || []).find(x => x.isCarrier); if(!c || !c.berthOp) return null; const op = c.berthOp, r = berthPose(op, T), X = c.dock;
  return { ship: op.s.model, name: op.s.name, ph: r.s, sx: r.sx, u: +((T - r.seg.t0)/(r.seg.t1 - r.seg.t0)).toFixed(2), p: r.p.toArray().map(Math.round), vis: op.s.root.visible, thr: +(r.thr || 0).toFixed(2),
    cl: +X.clamps[0][0].g.rotation.z.toFixed(2), clP: +X.clamps[1][0].g.rotation.z.toFixed(2), fL: +X.fields[-1].uField.value.toFixed(2), fR: +X.fields[1].uField.value.toFixed(2), rip: [X.fields[-1].uRip.value.w, X.fields[1].uRip.value.w].map(x => +x.toFixed(1)),
    gz: Math.round(X.gantry.group.position.z), occ: +(r.occ || 0).toFixed(2), shot: shot && shot.type, cap: shot && shot.caption && shot.caption.name, puffs: PUFFS.list.filter(P => P.t0 >= 0 && P.sh === op.s).length }; };
C.gunNow = () => { const d = (visit.leg.npcs || []).find(x => x.gun); if(!d) return null; d.gun.ph = ((d.gun.per - T % d.gun.per) + d.gun.per) % d.gun.per; return { rate: rateAt(T), active: gunActive(d) }; };   // test : ouvre une fenêtre de tir maintenant
C.gunDbg = () => { const d = (visit.leg.npcs || []).find(x => x.gun); return d ? { active: gunActive(d), tracers: GUN.pool.filter(t => T - t.t0 <= t.life).length, visible: GUN.grp.visible, shot: shot && shot.type, camD: Math.round(cam.position.distanceTo(d.root.position)), tgD: Math.round(d.gun.target.root.position.distanceTo(d.root.position)), subj: shot && shot.subj && shot.subj.model, dr: GUN.heads.geometry.drawRange.count } : null; };
C.warpDbg = () => { const d = visit.departer; return { shot: shot && shot.type, model: d.model, rings: d.rings ? d.rings.list.length : 0, a: d.rings ? +(ringAngle(d, T) % 6.2832).toFixed(3) : null, field: +d.field.value.toFixed(2), pad: d.rings ? +d.rings.padMesh()[0].material.emissiveIntensity.toFixed(2) : null, ringU: d.ringU ? +d.ringU.value.toFixed(2) : null }; };
C.ringSpin = (sh, T0, T1, n) => { const out = []; for(let i = 0; i <= n; i++) out.push(ringAngle(sh, T0 + (T1 - T0)*i/n)); return out; };
C.geodeSpin = (sh, T0, T1, n) => { const out = []; for(let i = 0; i <= n; i++){ const t = T0 + (T1 - T0)*i/n; let a = GEO_W0*t; (sh.jumpTs || []).forEach(tJ => a += geodeExtra(t - tJ)); out.push(a); } return out; };
C.setDof = on => { DOF_ON = !!on; DOF.shot = null; return DOF_ON; };
C.dof = () => ({ k: +DOF.k.toFixed(3), want: DOF.want, focus: DOF.focus && +DOF.focus.toFixed(2), r: +DOF.r.toFixed(4), off: DOF.off, shake: +SHAKE.I.toFixed(3) });
C.debug = () => ({ ships: ships.size, sys: sysWorld.children.length + shipWorld.children.length, gal: scene.children.length, stars: starField.size, nebulae: nebulaField.size, tasks: tasks.length, knots: TLK.length, slices: lastSlices.toString(2), k: Math.round(kNow) });
C.flipWindow = function(){ const tr = visit.transfer, f = x => { let lo = visit.tT0, hi = visit.tO0; for(let i=0;i<50;i++){ const m = (lo + hi)/2; if(tauAt(m) < x) lo = m; else hi = m; } return lo; };
  return [f(tr.tau0 + tr.prof.t1), f(tr.tau0 + tr.prof.t1 + tr.prof.tc)]; };
C.ages = () => [...ships].filter(s => s.root.visible).map(s => s.model + ':' + s.age.toFixed(2));
C.rcsDebug = () => [...ships].filter(s => s.rcs && s.root.visible).map(s => s.model + ':' + s.rcs.map(j => j.lvl.toFixed(2)).join(','));
C.timings = () => ({ stop: visit.stop ? { A: visit.stop.A.properName, B: visit.stop.B.properName, tA1: visit.stop.tA1, tB0: visit.stop.tB0, kAB: Math.round(visit.stop.kAB), L_AU: +(visit.stop.L/AU).toFixed(3), D_h: +(visit.stop.D/3600).toFixed(1) } : null, tArrive: visit.tArrive, tT0: visit.tT0, tO0: visit.tO0, depStart: visit.depStart, tJ: visit.tJ, tEnd: visit.tEnd, handover: visit.handover, mode: visit.mode, arrMode: visit.arrMode,
  tEng: visit.tEng, tCru: visit.tCru, tExit: visit.tExit, departer: visit.departer.model, depEquip: visit.departer.equip, depGeode: !!visit.departer.geode, depRings: !!visit.departer.rings, showcase: visit.showcase ? visit.showcase.model : null, kTr: Math.round(visit.kTr), kDep: Math.round(visit.kDep),
  trD_h: +(visit.profTr.D/3600).toFixed(2), trVmax_kms: +(visit.profTr.vm/1e3).toFixed(1), depD_h: +(visit.profDep.D/3600).toFixed(2), vJ_kms: +(visit.profDep.ve/1e3).toFixed(1), vOrb_kms: +(visit.vOrb/1e3).toFixed(2),
  target: visit.target.properName, R_km: Math.round(visit.target.radius/1e3), a_AU: +(visit.target.orbitA/AU).toFixed(3), Rs_Rsun: +(visit.leg.Rs/RSUN).toFixed(3), warpC: visit.warp ? Math.round(visit.warp.Vc) : 0 });
C.scale = () => { const leg = visit.leg; return { star: leg.name, cls: leg.designation, Rs_km: Math.round(leg.Rs/1e3), lum: leg.lum,
  planets: leg.planets.map(p => ({ name: p.properName, kind: p.kind.key, R_km: Math.round(p.radius/1e3), a_AU: +(p.orbitA/AU).toFixed(3), day_h: +(p.dayLen/3600).toFixed(1),
    moons: (p.moonPivots || []).map(pv => pv.children[0] ? { R_km: Math.round(pv.children[0].scale.x/1e3), d_Rp: +(pv.userData.dist/p.radius).toFixed(1), period_d: +(2*Math.PI/Math.abs(pv.userData.n)/86400).toFixed(2) } : null) })),
  belt: leg.beltInfo ? { inner_AU: +(leg.beltInfo.inner/AU).toFixed(2), outer_AU: +(leg.beltInfo.outer/AU).toFixed(2) } : null,
  ships: [...ships].filter(s => s.leg === leg).map(s => s.model + ':' + Math.round(s.len) + 'm') }; };

/* =====================================================================
   CARTE DE L'UNIVERS ET RADAR (lot 2) : données pour starmap.js et radar.js
   1 u = 1 m (affiché en u, ku, Mu, Gu, Tu) ; distances galactiques en années-lumière
   ===================================================================== */
let UID = 0;
const uidOf = s => s.uid || (s.uid = ++UID);
const REG_P = ['MIR','KAI','VEGA','ORIN','TALA','NOVA','SUR','HELI'];         // immatriculations du jeu : préfixe-NN
function regOf(s){ if(s.reg) return s.reg; if(s.mil){ let hm = 0; for(let i = 0; i < s.name.length; i++) hm = (hm*31 + s.name.charCodeAt(i)) >>> 0; return (s.reg = 'MIL-' + (100 + hm % 900)); } let h = 2166136261; const k = s.name + '/' + s.model; for(let i = 0; i < k.length; i++){ h ^= k.charCodeAt(i); h = Math.imul(h, 16777619); } h >>>= 0; return (s.reg = REG_P[h % 8] + '-' + (10 + (h >>> 3) % 89)); }
C.fmtU = function(m){ const a = Math.abs(m); for(const [k, u] of [[1e12, 'Tu'], [1e9, 'Gu'], [1e6, 'Mu'], [1e3, 'ku']]) if(a >= k*.9995){ const x = m/k; return (Math.abs(x) >= 99.95 ? x.toFixed(0) : Math.abs(x) >= 9.995 ? x.toFixed(1) : x.toFixed(2)) + ' ' + u; } return Math.round(m) + ' u'; };
C.UNIT_GAL = UNIT_GAL; C.AU = AU;
function present(s){ const vis = visit;                                       // hors champ : héros pas encore sorti du saut, partant déjà replié
  if(s === vis.hero && vis.arrMode !== 'warp' && T < vis.tArrive) return false;
  if(s === vis.departer && vis.mode === 'jump' && T > vis.tJ + JT.charge + JT.fold + JT.flash*.5) return false;
  return true; }
/* plan orbital d'un système (base du moteur, rejouée depuis sa graine) : vue de dessus de la carte */
function planeBasis(cell){ const n = rngFor(SEED + ':system:' + cell), a = 2 + Math.floor(2*n()); Math.floor(n()*a);
  const r = new V3(n() - .5, .35*(n() - .5), n() - .5).normalize(), i = Math.abs(r.y) < .9 ? v(0, 1, 0) : v(1, 0, 0);
  const s = new V3().crossVectors(i, r).normalize(), l = new V3().crossVectors(r, s).normalize(); return { s, l, n: r }; }
const SYS_CACHE = new Map();
C.systemInfo = function(cell){
  let e = SYS_CACHE.get(cell); if(e) return e;
  const vis = visit; let leg = vis.leg.cell === cell ? vis.leg : (vis.nextLeg.cell === cell ? vis.nextLeg : null);
  if(!leg){ const c = String(cell).split(',').map(Number), sd = starDataForCell(c[0], c[1], c[2]); if(!sd) return null; leg = legFromStar(sd); }
  ensureSystemData(leg);                                                   // données pures (graine) : aucun maillage construit
  const B = planeBasis(cell), st = leg.star, aHZ = Math.sqrt(leg.lum)*AU;
  e = { cell, name: leg.name, designation: leg.designation, color: [st.color.r, st.color.g, st.color.b], lum: leg.lum, Rs: leg.Rs, temp: st.temp, mass: st.mass, lumLabel: st.lumLabel, gal: leg.gal.toArray(),
    basis: { s: B.s.toArray(), l: B.l.toArray() }, hz: [aHZ*.8, aHZ*1.4], belt: leg.beltInfo ? [leg.beltInfo.inner, leg.beltInfo.outer] : null,
    planets: leg.planets.map((p, i) => ({ i, name: p.properName, kind: p.kind.key, gas: !!p.kind.gas, R: p.radius, a: p.orbitA, ang: Math.atan2(p.position.dot(B.l), p.position.dot(B.s)),
      moons: p.moonCount || 0, rings: !!p.hasRings, hab: !!p.isHabitable, atmo: !!p.hasAtmosphere, day: p.dayLen })) };
  SYS_CACHE.set(cell, e); if(SYS_CACHE.size > 80) SYS_CACHE.delete(SYS_CACHE.keys().next().value);
  return e;
};
/* lunes réelles d'une planète du système courant (position relative, rayon, distance) */
C.moonsInfo = function(pi){ const p = visit.leg.planets[pi]; if(!p) return [];
  return (p.moonPivots || []).map((pv, k) => { const m = pv.children[0]; if(!m) return null; const rel = m.getWorldPosition(new V3()).sub(p.position);
    return { k, name: pv.userData.moonName || (p.properName + ' ' + 'abcdef'[k]), R: m.scale.x, d: pv.userData.dist || rel.length(), rel: rel.toArray() }; }).filter(Boolean); };
C.mapState = function(){
  const vis = visit, W = vis.warp, li = l => ({ cell: l.cell, name: l.name, designation: l.designation, gal: l.gal.toArray() });
  const phase = T < vis.tO0 ? 'arrival' : (vis.stop && T >= vis.stop.tA1 && T < vis.stop.tB0) ? 'stopover' : T < vis.depStart ? 'orbit' : T < vis.tJ ? 'departure' : vis.mode;   // v7.12 : transfert d'escale
  const ps = C.pendingStar, psd = ps ? (c => starDataForCell(c[0], c[1], c[2]))(ps.cell.split(',').map(Number)) : null;
  const st = vis.stop, pi = p => vis.leg.planets.indexOf(p);
  if(st && !st.samples){ st.samples = []; for(let i = 0; i <= 24; i++) st.samples.push(vis.hero.traj(lerp(st.tA1, st.tB0, i/24)).pos.toArray().map(x => Math.round(x))); }   // trajet réel (une fois)
  return { T, gal: galPos.toArray(), cur: li(vis.leg), next: li(vis.nextLeg), toNext: vis.toNext.toArray(), mode: vis.mode, phase, stop: st ? { from: pi(st.A), to: pi(st.B), fromName: st.A.properName, toName: st.B.properName, active: T < st.tB0, done: T >= st.tB0, path: st.samples, frac: clamp((T - st.tA1)/(st.tB0 - st.tA1), 0, 1) } : null,
    progress: vis.mode === 'warp' && W && T > W.tEng ? W.frac(T) : 0, canRetarget: T < vis.depStart - 4, tLeft: Math.max(0, vis.tJ - T),
    pending: psd ? { cell: psd.cell, name: psd.name, gal: psd.position.toArray() } : null,
    route: routeLog.map(r => ({ cell: r.cell, name: r.name, gal: r.gal.toArray() })), hero: (h => ({ name: h.name + (isAboard(h) && h.docked ? ' (aboard ' + h.docked.name + ')' : ''), type: h.type, reg: regOf(h), aboard: isAboard(h) && h.docked ? h.docked.name : null }))(heroOf(vis)) };   // v7.11 : « à bord de … »
};
/* vaisseaux du système courant (repère du système : étoile à l'origine, mètres) */
C.shipsInfo = function(){
  const vis = visit, out = [], subj = shot && !shot.vista ? shot.subj : null;
  const hero = heroOf(vis), carry = new Map();                              // v7.11 : ce qui est à bord d'un porteur est rangé sous lui (même position)
  ships.forEach(s => { if(s.leg === vis.leg && s.docked && isAboard(s) && !s.craft){ if(!carry.has(s.docked)) carry.set(s.docked, []); carry.get(s.docked).push(s); } });
  ships.forEach(s => { if(s.leg !== vis.leg || !s.traj || !present(s)) return;
    if(s.docked && isAboard(s) && !s.craft) return;
    const st = subjectState(s, T), f = frameOf(st.q), cs = carry.get(s) || [], hx = cs.find(x => x === hero);
    out.push({ uid: uidOf(s), name: hx ? hx.name + ' · aboard ' + s.name : s.name, type: s.type, model: s.model, reg: regOf(s), len: s.len, pos: st.pos.toArray(), fwd: f.fwd.toArray(), hero: s === hero || !!hx, subj: s === subj || (!!subj && cs.includes(subj)), craft: !!s.craft && !s.mil && !s.isCarrier, mil: !!s.mil, seg: st.seg || 'orbit', thr: st.throttle || 0,
      carrying: cs.map(x => x.name) }); });
  return out;
};
/* radar : contacts autour du sujet filmé, dans son repère (x droite, y avant, z haut) ; engins de baie compris */
C.radarState = function(){
  if(!shot || shot.vista || shot.gal) return null;
  const vis = visit, subj = shot.subj && shot.subj.traj && shot.subj.name ? shot.subj : vis.departer;
  if(!subj || !subj.traj || subj.leg !== vis.leg && !subj.carrier) return null;
  const st = subjectState(subj, T), f = frameOf(st.q), P = st.pos, out = [], hero = heroOf(vis), ab = isAboard(subj) && subj.docked;   // v7.11 : à bord → rangé sous le porteur
  const add = (s, pos, craft, carrier) => { const rel = pos.clone().sub(P), d = rel.length(); if(d < 1e-3) return;
    out.push({ uid: uidOf(s), name: s.name, type: s.type, reg: regOf(s), d, x: rel.dot(f.right), y: rel.dot(f.fwd), z: rel.dot(f.up), craft: craft && !s.mil, mil: !!s.mil, carrier: carrier ? carrier.name : null, hero: s === hero || (s.isCarrier && hero.docked === s && isAboard(hero)) }); };
  const bays = (s, ss) => (s.bays || []).forEach(op => { const r = opPose(op, T); if(r.vis === false || r.s === 'parked') return; add(op.c, r.center.clone().sub(s.com || new V3()).applyQuaternion(ss.q).add(ss.pos), true, s); });
  ships.forEach(s => { if(s.leg !== vis.leg || !s.traj || !present(s)) return; if(s !== subj && s.docked && isAboard(s)) return; if(ab && s === subj.docked) return;
    const ss = s === subj ? st : subjectState(s, T); if(s !== subj) add(s, ss.pos, !!s.craft && !s.isCarrier); bays(s, ss); });
  out.sort((a, b) => a.d - b.d);
  return { name: subj.name, type: subj.type, reg: regOf(subj) + (ab ? ' · ABOARD ' + regOf(subj.docked) : ''), aboard: ab ? subj.docked.name : null, speed: velT(ab ? subj.docked : subj, T).length()/Math.max(1, kNow), contacts: out };
};
/* ---------- action de la carte : envoyer la caméra, ou choisir le prochain saut ---------- */
C.nebulaLoaded = key => !!nebulaField.get(key);                         // nébuleuse chargée autour de la position galactique : travelling possible
C.pendingStar = null;
function dropLeg(l){ if(!l || l === visit.leg || l === visit.nextLeg) return;
  if(l.group){ l.group.visible = false; disposeSystem(l); } else { (l.npcs || []).forEach(s => s.dispose()); l.npcs = []; } }
function retarget(vis, nl){
  const old = vis.nextLeg, leg = vis.leg, dep = vis.departer;
  recentCells.push(nl.cell); if(recentCells.length > 40) recentCells.shift();
  const toNext = nl.gal.clone().sub(leg.gal).normalize();
  const { pathD, upD } = departurePath(leg, vis.target, vis.depOrbit, vis.depStart, toNext, vis.dJ);
  const D0 = vis.profDep.D, vs = vis.depOrbit.speed, a = Math.max(.05, 2*(pathD.L - vs*D0)/(D0*D0));   // même durée physique : la carte du temps reste valable
  const profD = accelProfile(pathD.L, vs, a), depart = pathTraj(pathD, profD, tauAt(vis.depStart), upD);
  let jumpSeg;
  if(vis.mode === 'jump') jumpSeg = { kind:'jump', t0: vis.tJ, f: depart };
  else {                                                                     // distorsion : même durée, vitesse ajustée à la nouvelle distance
    const Dg = leg.gal.distanceTo(nl.gal)*UNIT_GAL, reuse = Object.assign({}, vis.warp, { Vc: Dg/(vis.warp.Dphys*CLIGHT) });
    const W = warpPlan(dep, leg, nl, vis.tJ, depart, pathD.d1.clone(), upD, reuse);
    dep.warps = (dep.warps || []).filter(w => w !== vis.warp).concat([W]).slice(-2);
    Object.assign(vis, { warp: W, wDir: W.wDir, arrB: arrivalPlan(nl) });
    jumpSeg = { kind:'warp', t0: vis.tJ, f: W.fA };
  }
  const depSegs = [{ kind:'depart', t0: vis.depStart, f: depart }, jumpSeg];
  dep.traj = compositeTraj(dep === vis.hero ? vis.segsHero.concat(depSegs) : [{ kind:'orbit', t0: -1e9, f: vis.depOrbit }].concat(depSegs));
  Object.assign(vis, { nextLeg: nl, toNext, jDir: pathD.d1.clone(), profDep: profD });
  tasks.push(() => dropLeg(old));                                            // l'ancien système suivant est libéré, le nouveau préparé en tâche de fond
  tasks.push(() => buildSystem(nl));
  tasks.push(() => { if(!nl.populated && visit.nextLeg === nl){ nl.populated = true; populateSystem(nl).forEach(fn => tasks.push(fn)); } });
}
C.setNextStar = function(cell, pi){
  const vis = visit, c = String(cell).split(',').map(Number), sd = starDataForCell(c[0], c[1], c[2]); if(!sd) return 'invalid';
  if(sd.cell === vis.leg.cell) return 'current';
  if(sd.cell === vis.nextLeg.cell){                                          // même étoile : seule la planète d'arrivée change
    if(pi != null && T < vis.tEnd - .5){ vis.nextLeg.prefTarget = pi; if(vis.mode === 'warp') vis.arrB = arrivalPlan(vis.nextLeg); }
    return 'same';
  }
  if(T < vis.depStart - 4){ const nl = legFromStar(sd); if(pi != null) nl.prefTarget = pi; retarget(vis, nl); return 'now'; }
  C.pendingStar = { cell: sd.cell, pi }; return 'next';                     // départ engagé : au saut suivant
};
function nearestStarTo(P){ const cx = Math.round(P.x/190), cy = Math.round(P.y/190), cz = Math.round(P.z/190); let best = null, bd = Infinity;
  for(let i=-2;i<=2;i++) for(let j=-2;j<=2;j++) for(let k=-2;k<=2;k++){ const sd = starDataForCell(cx+i, cy+j, cz+k); if(!sd || sd.cell === visit.leg.cell) continue; const d = sd.position.distanceTo(P); if(d < bd){ bd = d; best = sd; } }
  return best; }
/* cible : { kind: star|planet|moon|belt|nebula|ship, cell, i, k, key, gal, uid } → 'vista' | 'shot' | 'next:now|next|same|current' | 'busy' | 'none' */
C.focus = function(t){
  const vis = visit; if(!t) return 'none';
  const room = vis.tJ - 2.6 - 2.4 - T, cur = t.cell === vis.leg.cell;       // le plan du saut garde sa place
  if(['star', 'planet', 'moon', 'belt'].includes(t.kind) && !cur) return 'next:' + C.setNextStar(t.cell, t.kind === 'planet' ? t.i : null);
  if(t.kind === 'nebula'){
    const e = t.key && nebulaField.get(t.key);
    if(!e){ const sd = nearestStarTo(new V3().fromArray(t.gal)); return sd ? 'next:' + C.setNextStar(sd.cell) + ':' + sd.name : 'none'; }   // lointaine : saut vers l'étoile la plus proche
    if(room < 5) return 'busy';
    FOCUS.nebula = e; const vs = makeVista(T, Math.min(rr(9, 11), room), vis, 'nebula'); FOCUS.nebula = null;
    if(vs){ shot = vs; return 'vista'; } return 'none';
  }
  if(room < 4) return 'busy';
  const d = Math.min(rr(8.5, 11), room);
  const vista = kind => { const vs = makeVista(T, d, vis, kind); FOCUS.planet = FOCUS.moon = null; if(vs){ shot = vs; return 'vista'; } return 'none'; };
  if(t.kind === 'star') return vista(R() < .35 && window.__STARS && __STARS.isSunLike(vis.leg.star) ? 'flare' : 'star');
  if(t.kind === 'belt') return vista('belt');
  if(t.kind === 'planet'){ FOCUS.planet = vis.leg.planets[t.i]; return vista('planet'); }
  if(t.kind === 'moon'){ const p = vis.leg.planets[t.i], pv = p && (p.moonPivots || [])[t.k], m = pv && pv.children[0]; if(!m) return 'none';
    FOCUS.moon = { p, m, name: pv.userData.moonName }; return vista('moon'); }
  if(t.kind === 'ship'){
    let s = null; ships.forEach(x => { if(x.uid === t.uid && x.leg === vis.leg) s = x; });
    if(s && s.traj && present(s)){
      const seg = s.traj(T + d*.5).seg, calm = rateMax(T, T + d) < 3;
      const opts = seg === 'orbit' || !seg ? [['orbitcam', 2], ['lateral', 1.5], ['tripod', calm ? 1 : 0], ['wide', .8]].concat(closeOpts(s, 'orbit')) : [['chase', 2], ['lateral', 1.5], ['orbitcam', 1], ['front', .8]];
      shot = makeShot(pickW(opts), s, T, T + d, vis, s === vis.departer ? undefined : 'npc'); return 'shot';
    }
    let op = null; ships.forEach(x => (x.bays || []).forEach(o => { if(o.c.uid === t.uid && x.leg === vis.leg) op = o; }));   // engin de baie : plan sur la manœuvre
    if(op){ op.carrier.bayShot = op; shot = makeShot('bayOps', op.carrier, T, T + d, vis, 'npc'); shot.caption.type = op.c.type; shot.caption.name = op.c.name; return 'shot'; }
    return 'none';
  }
  return 'none';
};
})();
