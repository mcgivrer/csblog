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
const ACC = { e18:.9, e140:.55, p10:1, p44:.8, g1:.7, tS:3, tM:2.4, tL:1.8, l20:1.4, x1:2.8, shuttle:2 };   // poussée en g
const HERO_POOL = [['e18',1],['e140',1],['p10',1],['p44',1.2],['g1',1],['tM',.45],['tL',.5],['l20',1.2],['x1',1.3]];
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
const AGE_BIAS = { tS:.15, tM:.14, tL:.12, e18:.05, e140:.06, p10:.06, p44:.04, g1:.08, x1:-.05, l20:-.3, shuttle:0 };
function shipAge(model){
  const f = PARAMS.get('age');
  if(f !== null && f !== '' && !isNaN(+f)) return clamp(+f, 0, 1);
  const r = clamp(R() + (AGE_BIAS[model] || 0), 0, .999);
  return r < .3 ? rr(0, .12) : (r < .75 ? rr(.32, .6) : rr(.68, 1));
}
function makeShip(model, leg){
  const ftl = !!FTL[model], age = shipAge(model);
  const b = SHIPGEN.build(model, { warp: ftl, jump: ftl, age, ageSeed: Math.floor(R()*1e9) });   // option de vieillissement du générateur (shipwear.js)
  const thr = { value: 0 }, charge = { value: 0 }, field = { value: .15 }, phase = { value: 0 };
  patchUniforms(b.group, thr, charge, field, phase);
  b.lights.forEach(l => l.parent && l.parent.remove(l));      // une seule lumière de tuyère partagée (pas de recompilation de shaders)
  const root = new THREE.Group();
  b.group.scale.setScalar(SCALE); root.add(b.group); shipWorld.add(root);
  const rcs = buildRcs(b, b.dims.z*SCALE);
  const hull = { box: b.box.clone(), drive: b.group.userData.driveCenter ? b.group.userData.driveCenter.clone() : null, rcs: (b.rcs || []).slice(), docks: (b.docks || []).slice() };   // repères pour les gros plans
  const geode = findGeode(b.group, charge);
  const sh = { model, type: TYPE_EN[model], name: genShipName(), root, inner: b.group, len: b.dims.z*SCALE, thr, charge, field, phase, ftl, traj: null, leg, rcs, age, drive: b.drive || null, hull, geode,
    acc: (ACC[model] || 1)*G0*rr(.85, 1.15),
    dispose(){ (sh.bays || []).forEach(op => op.c.dispose()); disposeRcs(rcs); if(geode){ geode.spark.parent && geode.spark.parent.remove(geode.spark); geode.spark.material.dispose(); } root.parent && root.parent.remove(root); SHIPGEN.dispose(b.group); ships.delete(sh); } };
  ships.add(sh);
  setupBays(sh);
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
function makeShuttle(leg){
  const s = buildShuttle(), age = shipAge('shuttle');
  if(window.__SHIPWEAR) __SHIPWEAR.apply(s.group, age, Math.floor(R()*1e9), 12);      // navette : même usure (unités de coque ×12 = mètres)
  const root = new THREE.Group(); s.group.scale.setScalar(12); root.add(s.group); shipWorld.add(root);   // navette de ~25 m
  const hull = { box: new THREE.Box3().setFromObject(root), drive: null, rcs: [], docks: [] };
  const sh = { model:'shuttle', type: TYPE_EN.shuttle, name: genShipName(), root, inner: s.group, len: 25, thr:{value:0}, charge:{value:0}, nav: s.navLights, glow: s.glow, traj: null, leg, acc: 2*G0, age, hull,
    dispose(){ root.parent && root.parent.remove(root); s.group.traverse(o => { o.geometry && o.geometry.dispose(); }); ships.delete(sh); } };
  ships.add(sh);
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
  const age = shipAge(kind), c = __CRAFT.build(kind, { variant: o.variant, slim: o.slim, age, seed: Math.floor(R()*1e9) + 1, containers: o.containers });
  const root = new THREE.Group(); root.add(c.group); (o.parent || shipWorld).add(root);
  const rcs = buildRcs({ group: c.group, hullBox: c.box, rcs: c.rcs, rcsLen: c.rcsLen }, c.len);
  const sh = { model: kind, type: c.name, name: genShipName(), root, inner: c.group, len: c.len, thr: c.thr, charge: { value: 0 }, nav: c.nav, lamps: c.lamps, traj: null, leg, rcs, age, craft: c,
    acc: (ACC[kind] || 1)*G0*rr(.85, 1.15), hull: { box: c.box.clone(), drive: null, rcs: c.rcs.slice(), docks: [] },
    dispose(){ disposeRcs(rcs); c.dispose(); root.parent && root.parent.remove(root); ships.delete(sh); crafts.delete(sh); } };
  if(o.parent){ crafts.add(sh); sh.carrier = o.carrier; } else ships.add(sh);
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
    const kind = d.mode === 'belly' ? 'maint' : (d.hy >= 2.5 ? 'crew' : 'drone');
    const c = makeCraft(kind, sh.leg, { parent: sh.inner, carrier: sh, variant: 'inspect', slim: kind === 'maint' && 2*d.hy < 6.5 });
    const box = c.craft.box, sz = box.getSize(new V3()), cb = box.getCenter(new V3());
    const op = { d, c, kind, carrier: sh, sz, cb, plan: [], lastRip: -9, idx: 0 };
    if(d.mode === 'belly'){ op.qPark = quatNose(d.T.clone().negate(), d.N.clone().negate()); op.cPark = d.C.clone().addScaledVector(d.N, -(d.D - .7 - sz.y/2)); op.ext = sz.y/2; }
    else { op.qPark = quatNose(d.N.clone().negate(), d.B); op.cPark = d.C.clone().addScaledVector(d.N, -(sz.z/2 + 1.2)).addScaledVector(d.B, -d.hy + sz.y/2 + .3); op.ext = sz.z/2; }
    op.pPark = op.cPark.clone().sub(cb.clone().applyQuaternion(op.qPark));            // position de l'origine de l'engin
    c.local = t => opPose(op, t);
    const t0 = T + rr(0, 20);
    op.plan.push({ s: R() < .7 ? 'parked' : 'away0', t0: -1e9, t1: t0, f: segHold(op.pPark, op.qPark, { thr: 0, vis: true }) });
    if(op.plan[0].s === 'away0'){ op.plan[0].f = segHold(op.pPark, op.qPark, { thr: 0, vis: false }); op.plan[0].s = 'away'; }
    return op;
  });
}
function calmAt(op, t){ const tr = op.carrier.traj; return rateAt(t) < 3 && (!tr || !(tr(t).throttle > .05)); }
function opNext(op){                          // ajoute l'état suivant au plan
  const last = op.plan[op.plan.length - 1], d = op.d, sz = op.sz, N = d.N;
  let t = last.t1; while(!calmAt(op, t) && t < last.t1 + 600) t += 3;           // les manœuvres attendent le temps réel
  if(t > last.t1){ op.plan.push({ s: last.s, t0: last.t1, t1: t, f: last.f.hold || segHold(last.end ? last.end.p : op.pPark, last.end ? last.end.q : op.qPark, { thr: 0, vis: last.s !== 'away' || op.kind !== 'crew' }) }); }
  const add = (s, dur, f, end) => { const t0 = op.plan[op.plan.length - 1].t1; op.plan.push({ s, t0, t1: t0 + dur, f, end }); };
  const out = op.pPark.clone().addScaledVector(N, d.mode === 'belly' ? sz.y + 3 : op.ext*2 + 5);   // point de sortie devant la baie
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
      add('away', 9, segBez(e.p, e.p.clone().addScaledVector(N, 6), Wp.clone().add(new V3(sgn*8, 0, 0)), Wp, e.q, qW, easeIO, { thr: .25, vis: true, lamp: .5, rcs: 1 }), { p: Wp, q: qW });
      const hov = rr(14, 22);
      add('away', hov, u => ({ p: Wp.clone().add(new V3(0, .4*Math.sin(u*hov*.7 + bob), .6*Math.sin(u*hov*.4))), q: qW, thr: 0, vis: true, lamp: 1 }), { p: Wp, q: qW });
      add('away', 9, segBez(Wp, Wp.clone().add(new V3(sgn*8, 0, 0)), out.clone().addScaledVector(N, 6), out, qW, op.qPark, easeIO, { thr: .25, vis: true, lamp: .5, rcs: 1 }), { p: out, q: op.qPark });
    } else {                                                                     // drone : tour d'inspection autour du porteur
      const B = op.carrier.hull.box, Cc = B.getCenter(new V3()), rad = Math.max(B.max.x - B.min.x, B.max.y - B.min.y)*.5 + rr(6, 10), a0 = rr(0, 6.28), sg = R() < .5 ? -1 : 1, per = rr(18, 26);
      const ring = a => Cc.clone().add(new V3(Math.cos(a)*rad, Math.sin(a)*rad*.7, 0)).add(new V3(0, 0, (B.max.z - B.min.z)*.25*Math.sin(a*1.5)));
      const P0 = ring(a0), P1 = ring(a0 + sg*6.2832);
      add('away', 5, segBez(e.p, e.p.clone().addScaledVector(N, 5), P0.clone().addScaledVector(P0.clone().sub(Cc).normalize(), 4), P0, e.q, quatNose(Cc.clone().sub(P0), v(0, 0, 1)), easeIO, { thr: .3, vis: true, rcs: 1 }), { p: P0 });
      add('away', per, u => { const a = a0 + sg*6.2832*u, P = ring(a); return { p: P, q: quatNose(Cc.clone().sub(P), v(0, 0, 1)), thr: 0, vis: true }; }, { p: P1 });
      add('away', 5, segBez(P1, P1.clone().addScaledVector(P1.clone().sub(Cc).normalize(), 4), out.clone().addScaledVector(N, 5), out, quatNose(Cc.clone().sub(P1), v(0, 0, 1)), op.qPark, easeIO, { thr: .3, vis: true, rcs: 1 }), { p: out, q: op.qPark });
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
  if(!parked){ const o = op.pPark.clone().addScaledVector(op.d.N, op.d.mode === 'belly' ? op.sz.y + 3 : op.ext*2 + 5); op.plan[0].f = segHold(o, op.qPark, { thr: 0, vis: op.kind !== 'crew' }); op.plan[0].end = { p: o, q: op.qPark }; }
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
  ships.forEach(sh => { if(sh.craft){ if(sh.nav) sh.nav.forEach(nl => { const ph = ((T/nl.period + nl.phase) % 1); nl.mat.opacity = ph < nl.duty ? nl.peak : 0; }); (sh.lamps || []).forEach(l => l.value = .6); } });
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
  return tasks;
}

/* =====================================================================
   PLANIFICATION D'UNE VISITE : arrivée → transfert (flip-and-burn accéléré) → orbite (temps réel)
   → départ (poussée continue, accéléré) → saut quantique ou distorsion sur l'erre
   ===================================================================== */
const JT = { charge: 3.4, fold: 1.25, flash: .32, wave: 1.7 };   // saut plus lent que dans le jeu : la géode bat, puis l'espace se creuse
JT.total = JT.charge + JT.fold + JT.flash + JT.wave;
const WT = { spool: 2.6, engage: .75, decel: .9 };
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
  const Tc = reuse ? reuse.tDec - reuse.tCru : rr(4.5, 7), Vw = reuse ? reuse.Vw/reuse.s*s : rr(260, 380)*s;
  const tEng = tJ + Ts, tCru = tEng + Te, tDec = tCru + Tc, tExit = tDec + Tx;
  const dE = vS*Te + (Vw - vS)*Te*.5, dC = dE + Vw*Tc, D = dC + Vw*Tx + (vEx - Vw)*Tx*.5;
  const dist = T => {                                                     // déplacement « bulle » depuis l'engagement
    if(T <= tEng) return 0;
    if(T <= tCru){ const x = (T - tEng)/Te; return vS*Te*x + (Vw - vS)*Te*sInt(x); }
    if(T <= tDec) return dE + Vw*(T - tCru);
    if(T <= tExit){ const x = (T - tDec)/Tx; return dC + Vw*Tx*x + (vEx - Vw)*Tx*sInt(x); }
    return D + vEx*(T - tExit);
  };
  const speed = T => T < tEng ? vS : (T < tCru ? vS + (Vw - vS)*smooth((T - tEng)/Te) : (T < tDec ? Vw : (T < tExit ? Vw + (vEx - Vw)*smooth((T - tDec)/Tx) : vEx)));
  // durée physique : distance interstellaire réelle parcourue à 1 200–3 000 c
  const Dg = legA.gal.distanceTo(legB.gal)*UNIT_GAL, Vc = reuse ? reuse.Vc : rr(1200, 3000), Dphys = Dg/(Vc*CLIGHT);
  if(!reuse) tlSegment(tEng, tExit, Dphys, 1, 1, .8);
  const tauE = tauAt(tEng);
  const frac = T => clamp((tauAt(T) - tauE)/Dphys, 0, 1);
  const qJ = quatNose(jDir, up), qW = quatNose(wDir, up);
  const fA = T => { const c = coastFn(T), x = clamp((T - tJ)/Ts, 0, 1);
    return { pos: c.pos.addScaledVector(wDir, dist(T)), q: T < tEng ? qJ.clone().slerp(qW, smoother(x*1.15)) : qW.clone(), throttle: T < tEng ? .06*(1 - x) : 0 }; };
  const fB = P0B => T => ({ pos: P0B.clone().addScaledVector(wDir, dist(T) - D), q: qW.clone(), throttle: 0 });
  return { fA, fB, dist, speed, tW0: tJ, tEng, tCru, tDec, tExit, Vw, D, wDir, galA: legA.gal.clone(), galB: legB.gal.clone(), frac, Vc, Dphys, s, vEx };
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
  const TO = rr(18, 26), depStart = tO0 + TO;                           // orbite en temps réel : place pour les plans rasants et les coupes
  // étoile suivante et relais éventuel
  const ps = C.pendingStar; let nextLeg = null; C.pendingStar = null;
  if(ps && ps.cell !== leg.cell){ const c = ps.cell.split(',').map(Number), sd = starDataForCell(c[0], c[1], c[2]);
    if(sd){ nextLeg = legFromStar(sd); if(ps.pi != null) nextLeg.prefTarget = ps.pi; recentCells.push(sd.cell); } }   // choisie sur la carte pendant le départ précédent
  if(!nextLeg) nextLeg = nextStarFrom(leg, arriveDir ? arriveDir.clone() : randUnit());
  const toNext = nextLeg.gal.clone().sub(leg.gal).normalize();
  // relais : 6 fois sur 10 (?relay=), obligatoire après 2 systèmes avec le même héros ; imposé par le sélecteur (C.pending)
  const pend = C.pending; if(pend) C.pending = null;
  const handover = !!pend || (OPT.traffic && !C.followHero && ((hero.heroVisits || 0) >= 2 || R() < RELAY_P));
  let departer = hero, depOrbit = heroOrbit;
  const segsHero = [arriveSeg, { kind:'transfer', t0: tT0, f: transfer }, { kind:'orbit', t0: tO0, f: heroOrbit, blend: 3 }];
  if(handover){
    let m, n = 0; if(pend) m = pend.model; else do { m = pickW(HERO_POOL); n++; } while(n < 30 && (m === hero.model || heroHist.slice(-2).includes(m)));   // modèles variés
    departer = makeShip(m, leg); if(pend && pend.opts) departer.pref = pend.opts;
    const rC = rO + 1.6*(hero.len + departer.len);                        // orbite un peu plus haute, en formation devant le héros
    depOrbit = orbitTraj(Cp, rC, u, w, 3*(hero.len + departer.len)/rC, Math.sqrt(target.GM/rC)/rC, tauO);
    leg.npcs.push(hero);                                                   // l'ancien héros reste en orbite dans ce système
  }
  // départ : poussée continue jusqu'au point de saut (25–45 rayons), dans la direction de l'étoile suivante
  const dJ = Rp*(target.kind.gas ? rr(10, 18) : rr(25, 45));
  const { pathD, upD } = departurePath(leg, target, depOrbit, depStart, toNext, dJ);
  const profD = accelProfile(pathD.L, depOrbit.speed, departer.acc);
  const TD = rr(12, 15), depEnd = depStart + TD, tJ = depEnd + 3.2;      // 3,2 s d'erre en temps réel avant le saut
  const kDep = tlSegment(depStart, depEnd, profD.D, 1, 1, 1.6);
  const depart = pathTraj(pathD, profD, tauAt(depStart), upD);
  const jDir = pathD.d1.clone();
  // mode de départ : saut quantique ou vol supraluminique (réservé aux vaisseaux à anneaux de distorsion)
  const pref = departer.pref;                                                                 // préférences du sélecteur (distorsion / saut)
  const mode = departer.ftl && (pref ? (pref.warp && (!pref.jump || R() < .5)) : (PARAMS.get('ftl') === 'warp' || (PARAMS.get('ftl') !== 'jump' && R() < .5))) ? 'warp' : 'jump';
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
  return Object.assign({ leg, hero, departer, target, tArrive, P0, transfer, tT0, tO0, depStart, depEnd, tJ, tEnd, nextLeg, jDir, toNext, handover, orbitR: rO, vOrb, mode, arrMode, kTr, kDep, profTr: prof, profDep: profD,
    oU: u, oW: w, tauO, segsHero, depOrbit, dJ, userHero: !!pend }, extra);
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
  const sh = makeShip(model, leg); if(opts) sh.pref = opts;
  const rC = vis.orbitR + 1.6*(hero.len + sh.len) + (old === hero ? 0 : 1.6*(old.len + sh.len));
  const depOrbit = orbitTraj(tg.position, rC, vis.oU, vis.oW, -3*(hero.len + sh.len)/rC, Math.sqrt(tg.GM/rC)/rC, vis.tauO);   // juste derrière le héros
  const { pathD, upD } = departurePath(leg, tg, depOrbit, vis.depStart, vis.toNext, vis.dJ);
  const D0 = vis.profDep.D, vs = depOrbit.speed, a = Math.max(.05, 2*(pathD.L - vs*D0)/(D0*D0));
  const profD = accelProfile(pathD.L, vs, a), depart = pathTraj(pathD, profD, tauAt(vis.depStart), upD);
  let jumpSeg;
  if(vis.mode === 'jump'){ jumpSeg = { kind:'jump', t0: vis.tJ, f: depart }; noteJump(sh, vis.tJ); if(old.jumpTs) old.jumpTs = old.jumpTs.filter(t => t !== vis.tJ); }
  else { const W = warpPlan(sh, leg, vis.nextLeg, vis.tJ, depart, pathD.d1.clone(), upD, vis.warp); sh.warps = [W]; vis.warp = W; jumpSeg = { kind:'warp', t0: vis.tJ, f: W.fA }; }
  sh.traj = compositeTraj([{ kind:'orbit', t0: -1e9, f: depOrbit }, { kind:'depart', t0: vis.depStart, f: depart }, jumpSeg]);
  if(old === hero) hero.traj = compositeTraj(vis.segsHero);                                  // l'ancien partant reste en orbite
  else old.traj = compositeTraj([{ kind:'orbit', t0: -1e9, f: vis.depOrbit }]);
  if(!leg.npcs.includes(old)) leg.npcs.push(old);
  Object.assign(vis, { departer: sh, depOrbit, jDir: pathD.d1.clone(), profDep: profD, userHero: true, geodePlan: undefined, handover: true });
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
function warpFX(T){
  let active = null, W = null;
  ships.forEach(sh => (sh.warps || []).forEach(w => { if(T >= w.tW0 && T <= w.tExit + 1.6){ active = sh; W = w; } }));
  ships.forEach(sh => { if(sh !== active && sh.field) sh.field.value = .15; });
  if(!active){ streaks.visible = false; return false; }
  const st = active.traj(T), sp = W.speed(T)/W.s, s = W.s;
  let field = .15, lens = 0, chroma = 0, flash = 0, rip = 0, ripA = 0, stretch = 1, alpha = 0, spin = 1;
  if(T < W.tEng){ const e = (T - W.tW0)/WT.spool; field = .15 + 1.2*e*e; lens = .1*smooth(e); spin = 1 + 7*e; chroma = .01*e; }
  else if(T < W.tCru){ const e = (T - W.tEng)/WT.engage; field = 1.35 + .4*e; flash = .75*Math.sin(Math.min(1, e*1.6)*Math.PI); lens = .1 + .35*Math.sin(e*Math.PI) + .15*e; chroma = .02 + .03*e; stretch = 1 + .45*smooth(e); alpha = smooth(e); spin = 8; }
  else if(T < W.tDec){ field = 1.75; lens = .25; chroma = .018; stretch = 1.45; alpha = 1; spin = 8; }
  else if(T < W.tExit){ const e = (T - W.tDec)/WT.decel; field = 1.75; lens = .25 + .3*e; chroma = .02; stretch = 1.45 - .45*smooth(e); alpha = 1 - smooth(e*1.3); spin = 8 - 4*e; }
  else { const e = clamp((T - W.tExit)/1.6, 0, 1); field = 1.75 - 1.6*smooth(e); flash = e < .2 ? .7*Math.sin(e/.2*Math.PI) : 0; lens = .5*(1 - smooth(e)); rip = .02 + 1.2*e; ripA = .03*(1 - e); chroma = .03*(1 - e); spin = 4 - 3*e; }
  active.field.value = field; active.phase.value += .7*spin/60;
  active.inner.scale.set(SCALE/Math.sqrt(stretch), SCALE/Math.sqrt(stretch), SCALE*stretch);
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
  sh.inner.scale.set(SCALE*s_, SCALE*s_, SCALE*S_);
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
  sh.inner.scale.set(SCALE/(1+.5*str), SCALE/(1+.5*str), SCALE*(1 + 1.3*str));
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
function subjectState(sh, T){ const st = sh.traj(T); if(!st.q) st.q = quatNose(st.nose, st.up); return st; }
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
  warpEngage(sh, t0, d, vis){ // plan fixe (co-mobile avec l'erre) : charge des bobines, bulle, puis le vaisseau file hors champ
    const W = vis.warp, s0 = subjectState(sh, W.tEng), vm = velT(sh, W.tW0 + .3), f = frameOf(s0.q), L = sh.len, side = R()<.5?-1:1;
    const pos = s0.pos.clone().addScaledVector(W.wDir, -rr(2.6, 3.6)*L).addScaledVector(f.right, side*rr(2.2, 3.2)*L).addScaledVector(f.up, rr(.8, 1.4)*L);
    return T => { const st = subjectState(sh, Math.min(T, W.tEng + .15)); return { pos: pos.clone().addScaledVector(vm, T - W.tEng), look: st.pos.clone().addScaledVector(vm, T - Math.min(T, W.tEng + .15)).addScaledVector(W.wDir, 1.2*L), fov: 52, up: f.up }; }; },
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
  arrive(sh, t0, d, vis){ // plan fixe sur le point d'arrivée : l'espace se creuse, éclair, le vaisseau apparaît
    const s0 = subjectState(sh, vis.tArrive + .6), vm = velT(sh, vis.tArrive + 1), f = frameOf(s0.q), L = sh.len, side = R()<.5?-1:1, behind = R() < .6;
    const pos = behind ? s0.pos.clone().addScaledVector(f.fwd, -5.2*L).addScaledVector(f.right, side*3.2*L).addScaledVector(f.up, 2.4*L)
                       : s0.pos.clone().addScaledVector(f.fwd, 7*L).addScaledVector(f.right, side*3.4*L).addScaledVector(f.up, 2.2*L);
    const Tr = vis.tArrive + .6;
    return T => { const st = subjectState(sh, Math.max(T, vis.tArrive)); return { pos: pos.clone().addScaledVector(vm, Math.min(T, vis.tT0) - Tr), look: st.pos.clone().addScaledVector(f.up, -.6*L).addScaledVector(f.fwd, behind ? 2.5*L : 0), fov: 50, up: f.up }; }; }
};
/* ---------- gros plans sur les vaisseaux (détails de coque, moteurs, RCS, géode) ----------
   caméras placées dans le repère du vaisseau, hors de sa boîte englobante (jamais dans la coque) */
const CLOSE = { hullDolly:1, engineClose:1, bowClose:1, rcsClose:1, geodeClose:1, dockClose:1 };
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
    } else if(vis.warp){ const W = vis.warp; if(T > W.tW0 && T < W.tEng) I += aD*.18*smooth((T - W.tW0)/(W.tEng - W.tW0)); else if(T >= W.tEng) I += aD*.9*Math.exp(-(T - W.tEng)/.35); }
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
function hw(st, x, y, z){ return new V3(x, y, z).applyQuaternion(st.q).add(st.pos); }   // repère coque → monde
function sunBody(sh, T){ const st = subjectState(sh, T); return st.pos.clone().negate().normalize().applyQuaternion(st.q.clone().invert()); }   // direction de l'étoile dans le repère coque
function litSide(sh, T){ const d = sunBody(sh, T); return (R() < .85 ? 1 : -1)*(d.x >= 0 ? 1 : -1); }   // 85 % côté éclairé
function closeOpts(sh, phase){
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
function chooseShot(T){
  const vis = visit;
  const dep = vis.departer;
  // 1) arrivée
  if(!vis.userHero && T < vis.tArrive + (vis.arrMode === 'warp' ? 2.6 : 3.4)){
    if(vis.arrMode === 'warp') return makeShot('warpArrive', vis.hero, T, vis.tArrive + rr(2.9, 3.4), vis);
    return makeShot('arrive', vis.hero, Math.min(T, vis.tArrive - 1.8), vis.tArrive + rr(3.7, 4.3), vis);
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
    if(T < vis.tCru + .3) return makeShot('warpEngage', dep, T, vis.tCru + .45, vis);
    const sh2 = makeShot(pick(['warpChase','warpSide','warpFront','warpChase']), dep, T, vis.tEnd + .05, vis);
    sh2.caption.planet = 'Superluminal transit → ' + vis.nextLeg.name + ' · ' + fmtInt(vis.warp.Vc) + ' c'; return sh2;
  }
  // 3) plan courant : type selon la phase, durée bornée pour ne pas chevaucher le plan du saut
  let d = rr(4.8, 8.2); if(T + d > jumpShotStart - 2.4) d = Math.max(3.2, jumpShotStart - 2.4 - T);
  const kWin = rateMax(T, T + d), calm = kWin < 3;             // temps réel (orbite) : plans co-mobiles et coupes sur le trafic possibles
  // travelling de découverte (sans vaisseau) : parfois juste après l'arrivée, parfois en cours de route
  const room = jumpShotStart - 2.4 - T;
  const lastV = shotLog.slice(-3).some(x => /^vista/.test(x));
  if(room > 7 && !lastV && (shotLog[shotLog.length-1] === 'arrive' ? R() < .4 : R() < .26)){
    const vd = Math.min(rr(7.5, 11), room);
    // une éclipse par système quand la géométrie le permet
    if(!(vis.shown && vis.shown.has('eclipse')) && R() < .55){ const ve = makeVista(T, Math.max(vd, Math.min(11, room)), vis, 'eclipse'); if(ve){ vis.shown.add('eclipse'); return ve; } }
    const vs = makeVista(T, vd, vis); if(vs) return vs;
  }
  let subj = (T >= vis.depStart - 1 || vis.userHero) ? dep : vis.hero;
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
  const npcs = (vis.leg.npcs || []).filter(s => s !== subj && s.traj);
  if(calm && R() < .5 && shotLog.slice(-2).indexOf('npc') < 0){ for(const s of npcs){ if(s.bays){ const b = bayShot(s, 'npc'); if(b){ b.type = 'bayOps'; return b; } } } }
  // présentation du prochain héros (relais) pendant l'orbite : le spectateur le voit avant qu'il ne parte
  if(vis.handover && !vis.userHero && !vis.depIntro && calm && T > vis.tO0 + 3 && T < vis.depStart - 6 && dep !== vis.hero){ vis.depIntro = true; return makeShot(pick(['orbitcam','lateral','tripod']), dep, T, T + d, vis, 'npc'); }
  if(calm && npcs.length && R() < .35 && shotLog.slice(-2).indexOf('npc') < 0){
    const s = pick(npcs); const t = pick(['lateral','tripod','orbitcam','chase','hullDolly','bowClose'].concat(s.hull && s.hull.docks && s.hull.docks.length ? ['dockClose'] : []));
    return makeShot(t, s, T, T + d, vis, 'npc');
  }
  // silhouette du vaisseau devant son étoile (si la géométrie s'y prête)
  if((seg === 'transfer' || seg === 'depart') && vis.leg.star3 && R() < .12){
    const mid = subj.traj(T + d*.5).pos, u = mid.clone().normalize(), D = mid.length(), dm = subj.len*D/(1.15*vis.leg.star3.Rs - subj.len), P = mid.clone().addScaledVector(u, dm);
    const clear = dm > 0 && vis.leg.planets.every(p => P.distanceTo(p.position) > p.radius*1.2) && __STARS.occlusion(vis.leg.star3, P, bodiesOf(vis.leg)).vis > .99;
    if(clear){ const sh = makeShot('shipTransit', subj, T, T + Math.max(d, 6), vis); sh.caption.planet = 'Stellar transit'; return sh; }
  }
  let opts;
  if(seg === 'transfer'){
    const tr = subj.traj.segs.find(s => s.kind === 'transfer').f, flipT = T + d*.5;   // retournement : plans latéraux et orbitaux
    const tauM = tauAt(T + d*.5) - tr.tau0, pf = tr.prof;
    const hasFlip = Math.abs(tauM - pf.t1 - pf.tc*.5) < pf.tc*.9 || (pf.tf > 0 && Math.abs(tauM - pf.tm - pf.tf*.4) < pf.tf*.6);   // retournement médian ou final
    opts = hasFlip ? [['lateral',3],['orbitcam',2.2],['wide',.8]].concat(closeOpts(subj, 'flip')) : [['chase',2],['lateral',2],['front',1.5],['wide',2],['orbitcam',1.2]].concat(closeOpts(subj, 'transfer'));   // retournement : plans rapprochés pour voir les RCS
  } else if(seg === 'orbit'){
    const sp = subj.traj(T + d*.5).pos, pl = nearestPlanet(vis.leg, sp);
    const dayside = pl ? sp.clone().sub(pl.position).normalize().dot(pl.position.clone().negate().normalize()) : 1;
    const cities = pl && pl.mesh.material.uniforms.uCities && pl.mesh.material.uniforms.uCities.value > .5;
    const wl = dayside > -.05 ? 4 : (cities ? 1.5 : .3);
    opts = [['limb',wl],['orbitcam',2],['tripod',calm ? 1.6 : 0],['wide',1.5],['lateral',1.2],['front',1]].concat(closeOpts(subj, 'orbit')); }
  else if(seg === 'depart'){ opts = [['chase',3],['front',1.2],['wide',1.4],['lateral',1.5],['orbitcam',1]].concat(closeOpts(subj, 'depart')); }
  else { opts = [['wide',1],['lateral',1],['chase',1]]; }
  let type, n = 0; do { type = pickW(opts); n++; } while(n < 6 && type === shotLog[shotLog.length-1]);
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
    const d0 = Rp*rr(2.3, 3.6), d1 = d0*rr(.78, .92), sweep = rr(.12, .22)*(R()<.5?-1:1), off = rr(.2, .45)*(R()<.5?-1:1), up = axis.clone();
    return { place: pl.properName, focus: () => C, cam: T => { const k = smoother((T - t0)/d), dir = dir0.clone().applyAxisAngle(axis, sweep*k);
      const tan = new V3().crossVectors(axis, dir).normalize();
      return { pos: C.clone().addScaledVector(dir, lerp(d0, d1, k)), look: C.clone().addScaledVector(tan, Rp*off), fov: 46, up }; } };
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
function makeVista(T, d, vis, prefer){
  const sunLike = vis.leg.star3 && __STARS.isSunLike(vis.leg.star);
  const kinds = prefer ? [[prefer, 1]] : [['planet',3],['cloudscape',2.5],['aurora',3],['belt',2],['moon',1.5],['nebula',1.2],
    ['star', sunLike ? 1.6 : 1],['flare', sunLike ? 3 : 1.5],['eclipse', sunLike ? 3.5 : 2],['sunrise', sunLike ? 2.5 : 1.5],['transit', 1.2]];
  vis.shown = vis.shown || new Set();
  for(let tries=0; tries<8; tries++){
    const k = pickW(kinds); if(!prefer && (shotLog[shotLog.length-1] === 'vista_' + k || vis.shown.has(k))) continue;   // pas deux fois le même travelling dans un système
    const vs = VISTAS[k](vis, T, d); if(!vs) { if(prefer) return null; continue; }
    shotLog.push('vista_' + k); if(shotLog.length > 10) shotLog.shift(); vis.shown.add(k);
    return { type: 'vista_' + k, vista: true, gal: !!vs.gal, low: !!vs.low, subj: vistaSubject(vs.focus), t0: T, t1: T + d, cam: vs.cam, vis,
      caption: { vista: true, star: vis.leg.name, cls: vis.leg.designation, place: vs.place } };
  }
  return null;
}
C.forceVista = function(kind, d){ shot = makeVista(T, d || 9, visit, kind) || shot; return shot && shot.type; };
function makeShot(type, subj, t0, t1, vis, tag){
  if(type === 'bayOps' && !(subj.bays && subj.bays.length)) type = subj.hull ? 'hullDolly' : 'chase';
  if(CLOSE[type] && (!subj.hull || (type === 'geodeClose' && !subj.geode) || (type === 'rcsClose' && !subj.hull.rcs.length) || (type === 'dockClose' && !(subj.hull.docks && subj.hull.docks.length)))) type = subj.hull ? 'hullDolly' : 'chase';   // gros plan impossible → repli
  const cam_ = SHOTS[type](subj, t0, t1 - t0, vis);
  shotLog.push(tag || type); if(shotLog.length > 10) shotLog.shift();
  const s0 = subj.traj(Math.max(t0, type === 'arrive' ? vis.tArrive : t0));
  const pl = nearestPlanet(vis.leg, s0.pos);
  return { type, subj, t0, t1, cam: cam_, vis, caption: { type: subj.type, name: subj.name, star: vis.leg.name, cls: vis.leg.designation, planet: pl ? pl.properName : '—' } };
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
C.followHero = false; C.pending = null;
function startVisit(leg, hero, tArrive, arriveDir, arr){
  buildSystem(leg); leg.group.visible = true;
  hero.leg = leg; hero.heroVisits = (hero.heroVisits || 0) + 1; heroHist.push(hero.model); if(heroHist.length > 8) heroHist.shift();
  routeLog.push({ cell: leg.cell, name: leg.name, gal: leg.gal.clone() }); if(routeLog.length > 24) routeLog.shift();
  tlPrune(T);
  const vis = planVisit(leg, hero, tArrive, arriveDir, arr);
  if(!leg.populated){ leg.populated = true; populateSystem(leg).forEach(fn => fn()); }
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
  streaks = buildStreaks();
  if(window.__AST && !__AST.ready) console.log('[cine] asteroids', JSON.stringify(__AST.init(String(SEED))));
};
C.initB = function(){                                                    // premier système et son héros
  // premier système : départ de l'itinéraire du jeu (ou étoile la plus proche)
  const first = ROUTE.legs[0] ? legFromStar({ name: ROUTE.legs[0].name, star: ROUTE.legs[0].star, position: ROUTE.legs[0].starPosition, cell: ROUTE.legs[0].cell })
                              : legFromStar(findNextWaypoint(new V3(), v(0,0,-1), new Set(), -1).data);
  recentCells.push(first.cell);
  const hero = makeShip(pickW(HERO_POOL), first);
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
    if(sh.drive && sh.drive.units && window.__SHIPDRIVE){                    // cardans : suivent le couple demandé, vibration pendant la poussée
      const a = sh.alpha, th = st.throttle || 0, g = sh.gimb || (sh.gimb = { x: 0, y: 0, idle: false });
      const tx = a ? -clamp(a.x/RCS_REF, -1, 1)*GIMBAL : 0, ty = a ? -clamp(a.y/RCS_REF, -1, 1)*GIMBAL : 0, kk = 1 - Math.exp(-dt*5);
      g.x += (tx - g.x)*kk; g.y += (ty - g.y)*kk;
      const idle = Math.abs(g.x) + Math.abs(g.y) < 1e-4 && th < .01;
      if(!(idle && g.idle)) __SHIPDRIVE.gimbal(sh.drive, g.x, g.y, th*.0035, T);
      g.idle = idle;
    }
    if(sh.nav) sh.nav.forEach(nl => { const ph = ((T/nl.period + nl.phase) % 1); nl.mat.opacity = ph < nl.duty ? nl.peak : 0; });
    if(sh.glow) sh.glow.material.opacity = .7;
  });
}

C.step = function(dt, noRender){
  T += dt;
  kNow = rateAt(T);
  cloudT += dt*(.03 + .97*Math.min(kNow, 400)/400);                 // évolution des nuages : quasi figée en temps réel, vive en accéléré
  const vis = visit;
  // bascule vers le système suivant à la fin de l'onde du saut (ou pendant la décélération de distorsion)
  if(T >= vis.tEnd){
    const next = vis.nextLeg;
    if(!next.group) buildSystem(next);
    const hero = vis.departer; hero.charge.value = 0;
    if(vis.mode === 'jump') hero.inner.scale.setScalar(SCALE);
    if(hero.geode) setGeode(hero, 0, 0);
    const oldLeg = vis.leg; oldLeg.group && (oldLeg.group.visible = false);
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
    const noMin = shot.vista || CLOSE[shot.type] || shot.type === 'bayOps' || shot.type === 'arrive' || shot.type === 'jump' || shot.type === 'shipTransit' || shot.type === 'warpArrive';
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
  ships.forEach(sh => sh.root.visible = sh.leg === leg);
  updateShips(dt);
  updateCrafts(dt);
  // effets de saut
  FX.active = false; grid.visible = false; FX.vignette = 0; FX.flashDom = 0;
  if(visit.arrMode !== 'warp') arriveFX(T, visit);
  if(visit.mode === 'jump') jumpOutFX(T, visit);
  warpFX(T);
  if(visit.arrMode !== 'warp' && T < visit.tArrive + .12) visit.hero.root.visible = false;
  if(visit.mode === 'jump' && T > visit.tJ + JT.charge + JT.fold + JT.flash*.5) visit.departer.root.visible = false;
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
  if(T < vis.depStart - 4 && !(vis.mode === 'warp' && !FTL[model])){ relayNow(vis, model, opts); shot = null; return 'now'; }
  C.pending = { model, opts }; return 'next';                                                   // départ déjà engagé : relais au système suivant
};
C.heroInfo = () => { const s = shot && shot.subj && shot.subj.type ? shot.subj : visit.departer; return { model: s.model, type: s.type, name: s.name, follow: C.followHero, pending: C.pending ? C.pending.model : null }; };
C.bayList = () => [...ships].filter(x => x.bays).map(x => x.model + (x.leg === visit.leg ? '*' : '') + ':' + x.bays.map(o => o.kind + '/' + o.d.mode).join(','));
C.forceBay = function(i, npc, dt){ const s = npc === 'dep' ? visit.departer : npc ? ([...ships].find(x => x.model === npc && x.bays && x.leg === visit.leg) || visit.hero) : visit.hero; if(!s.bays || !s.bays[i]) return 'no bay'; const op = s.bays[i]; opSchedule(op, T + (dt || .5)); s.bayShot = op; shot = makeShot('bayOps', s, T, T + 14, visit); return op.kind + ':' + op.d.mode; };
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
C.geodeSpin = (sh, T0, T1, n) => { const out = []; for(let i = 0; i <= n; i++){ const t = T0 + (T1 - T0)*i/n; let a = GEO_W0*t; (sh.jumpTs || []).forEach(tJ => a += geodeExtra(t - tJ)); out.push(a); } return out; };
C.setDof = on => { DOF_ON = !!on; DOF.shot = null; return DOF_ON; };
C.dof = () => ({ k: +DOF.k.toFixed(3), want: DOF.want, focus: DOF.focus && +DOF.focus.toFixed(2), r: +DOF.r.toFixed(4), off: DOF.off, shake: +SHAKE.I.toFixed(3) });
C.debug = () => ({ ships: ships.size, sys: sysWorld.children.length + shipWorld.children.length, gal: scene.children.length, stars: starField.size, nebulae: nebulaField.size, tasks: tasks.length, knots: TLK.length, slices: lastSlices.toString(2), k: Math.round(kNow) });
C.flipWindow = function(){ const tr = visit.transfer, f = x => { let lo = visit.tT0, hi = visit.tO0; for(let i=0;i<50;i++){ const m = (lo + hi)/2; if(tauAt(m) < x) lo = m; else hi = m; } return lo; };
  return [f(tr.tau0 + tr.prof.t1), f(tr.tau0 + tr.prof.t1 + tr.prof.tc)]; };
C.ages = () => [...ships].filter(s => s.root.visible).map(s => s.model + ':' + s.age.toFixed(2));
C.rcsDebug = () => [...ships].filter(s => s.rcs && s.root.visible).map(s => s.model + ':' + s.rcs.map(j => j.lvl.toFixed(2)).join(','));
C.timings = () => ({ tArrive: visit.tArrive, tT0: visit.tT0, tO0: visit.tO0, depStart: visit.depStart, tJ: visit.tJ, tEnd: visit.tEnd, handover: visit.handover, mode: visit.mode, arrMode: visit.arrMode,
  tEng: visit.tEng, tCru: visit.tCru, tExit: visit.tExit, departer: visit.departer.model, kTr: Math.round(visit.kTr), kDep: Math.round(visit.kDep),
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
function regOf(s){ if(s.reg) return s.reg; let h = 2166136261; const k = s.name + '/' + s.model; for(let i = 0; i < k.length; i++){ h ^= k.charCodeAt(i); h = Math.imul(h, 16777619); } h >>>= 0; return (s.reg = REG_P[h % 8] + '-' + (10 + (h >>> 3) % 89)); }
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
  const phase = T < vis.tO0 ? 'arrival' : T < vis.depStart ? 'orbit' : T < vis.tJ ? 'departure' : vis.mode;
  const ps = C.pendingStar, psd = ps ? (c => starDataForCell(c[0], c[1], c[2]))(ps.cell.split(',').map(Number)) : null;
  return { T, gal: galPos.toArray(), cur: li(vis.leg), next: li(vis.nextLeg), toNext: vis.toNext.toArray(), mode: vis.mode, phase,
    progress: vis.mode === 'warp' && W && T > W.tEng ? W.frac(T) : 0, canRetarget: T < vis.depStart - 4, tLeft: Math.max(0, vis.tJ - T),
    pending: psd ? { cell: psd.cell, name: psd.name, gal: psd.position.toArray() } : null,
    route: routeLog.map(r => ({ cell: r.cell, name: r.name, gal: r.gal.toArray() })), hero: { name: vis.departer.name, type: vis.departer.type, reg: regOf(vis.departer) } };
};
/* vaisseaux du système courant (repère du système : étoile à l'origine, mètres) */
C.shipsInfo = function(){
  const vis = visit, out = [], subj = shot && !shot.vista ? shot.subj : null;
  ships.forEach(s => { if(s.leg !== vis.leg || !s.traj || !present(s)) return;
    const st = subjectState(s, T), f = frameOf(st.q);
    out.push({ uid: uidOf(s), name: s.name, type: s.type, model: s.model, reg: regOf(s), len: s.len, pos: st.pos.toArray(), fwd: f.fwd.toArray(), hero: s === vis.departer, subj: s === subj, craft: !!s.craft, seg: st.seg || 'orbit', thr: st.throttle || 0 }); });
  return out;
};
/* radar : contacts autour du sujet filmé, dans son repère (x droite, y avant, z haut) ; engins de baie compris */
C.radarState = function(){
  if(!shot || shot.vista || shot.gal) return null;
  const vis = visit, subj = shot.subj && shot.subj.traj && shot.subj.name ? shot.subj : vis.departer;
  if(!subj || !subj.traj || subj.leg !== vis.leg && !subj.carrier) return null;
  const st = subjectState(subj, T), f = frameOf(st.q), P = st.pos, out = [];
  const add = (s, pos, craft, carrier) => { const rel = pos.clone().sub(P), d = rel.length(); if(d < 1e-3) return;
    out.push({ uid: uidOf(s), name: s.name, type: s.type, reg: regOf(s), d, x: rel.dot(f.right), y: rel.dot(f.fwd), z: rel.dot(f.up), craft, carrier: carrier ? carrier.name : null, hero: s === vis.departer }); };
  const bays = (s, ss) => (s.bays || []).forEach(op => { const r = opPose(op, T); if(r.vis === false || r.s === 'parked') return; add(op.c, r.center.clone().applyQuaternion(ss.q).add(ss.pos), true, s); });
  ships.forEach(s => { if(s.leg !== vis.leg || !s.traj || !present(s)) return; const ss = s === subj ? st : subjectState(s, T); if(s !== subj) add(s, ss.pos, !!s.craft); bays(s, ss); });
  out.sort((a, b) => a.d - b.d);
  return { name: subj.name, type: subj.type, reg: regOf(subj), speed: velT(subj, T).length()/Math.max(1, kNow), contacts: out };
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
