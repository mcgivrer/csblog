/* =========================================================================
   SURVOL DU SYSTÈME — plan cinématique (suite du lot L5)
   À l'arrivée dans un système par saut ou distorsion (et à la demande, touche G), la
   caméra quitte le vaisseau et visite CHACUNE des planètes du système, puis revient au
   vaisseau. Le vaisseau poursuit son transfert en pilote automatique pendant ce temps :
   l'accélération du temps du transfert est recalculée pour qu'il arrive au couloir
   d'approche juste après la fin du survol (le pilotage manuel n'est jamais pris de court).
   - ordre de visite : du plus proche au plus proche (depuis la caméra), la planète de
     destination du vaisseau en dernier — le survol finit là où le vaisseau arrive ;
   - chaque planète : passage rectiligne et lent à ~3 rayons (5 avec anneaux), côté
     éclairé, un peu au-dessus du plan des orbites ; la caméra fixe la planète ;
   - entre deux planètes : transit rapide (durée selon la distance, échelle logarithmique),
     regard qui pivote progressivement de la planète quittée vers la suivante ;
   - retour : la caméra rejoint sa place derrière le vaisseau ;
   - légende McGivrer à chaque passage (nom, type, rayon, orbite) ;
   - n'importe quelle touche ou un clic : retour au vaisseau.
   ========================================================================= */
const SURVOL = (function(){
const V3 = THREE.Vector3, Q = THREE.Quaternion;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = x => { x = clamp(x, 0, 1); return x*x*(3 - 2*x); };
const smoother = x => { x = clamp(x, 0, 1); return x*x*x*(x*(6*x - 15) + 10); };
const T_FLY = 3.4, T_BACK = 2.6, T_SKIP = 1.0;
const S = { active: false, segs: [], i: 0, t: 0, toured: new Set(), leg: null, capEl: null, headEl: null, skip: false, from: null };
const _m4 = new THREE.Matrix4(), _qa = new Q(), _qb = new Q();

function planeNormal(planets){
  const n = new V3();
  for(let i = 0; i + 1 < planets.length; i++) n.add(new V3().crossVectors(planets[i].position, planets[i + 1].position).normalize());
  if(n.lengthSq() < 1e-6) n.set(0, 1, 0);
  if(n.y < 0) n.negate();
  return n.normalize();
}
function lookQ(pos, target, up){ _m4.lookAt(pos, target, up); return new Q().setFromRotationMatrix(_m4); }

/* segments : { kind: 'transit'|'fly'|'back', dur, p0, p1 (positions), look0, look1 (cibles), planet } */
function plan(leg){
  const P = leg.planets.slice(), N = planeNormal(P), dest = REAL.mission && REAL.mission.target;
  const order = [], rest = P.filter(p => p !== dest);
  let cur = camera.position.clone();
  while(rest.length){ let bi = 0, bd = Infinity; rest.forEach((p, i) => { const d = p.position.distanceTo(cur); if(d < bd){ bd = d; bi = i; } });
    const p = rest.splice(bi, 1)[0]; order.push(p); cur = p.position; }
  if(dest && P.includes(dest)) order.push(dest);
  const segs = []; let A = camera.position.clone(), lookA = camLook.clone();
  order.forEach(p => {
    const R = p.radius, d = R*(p.hasRings ? 5 : 3.2);
    const uIn = p.position.clone().sub(A).normalize();
    const lit = p.position.clone().negate().normalize();                    /* étoile à l'origine */
    let perp = lit.clone().sub(uIn.clone().multiplyScalar(lit.dot(uIn))).addScaledVector(N, .45);
    if(perp.lengthSq() < 1e-8) perp = N.clone(); perp.normalize();
    const C = p.position.clone().addScaledVector(perp, d), half = d*1.1;
    const Sp = C.clone().addScaledVector(uIn, -half), Ep = C.clone().addScaledVector(uIn, half);
    const dist = A.distanceTo(Sp), dur = clamp(1.2 + .55*Math.log10(Math.max(1, dist/1e6)), 1.4, 4.2);
    segs.push({ kind: 'transit', dur: dur, p0: A.clone(), p1: Sp, look0: lookA.clone(), look1: p.position.clone(), planet: p });
    segs.push({ kind: 'fly', dur: T_FLY, p0: Sp, p1: Ep, look0: p.position.clone(), look1: p.position.clone(), planet: p });
    A = Ep; lookA = p.position.clone();
  });
  segs.push({ kind: 'back', dur: T_BACK, p0: A.clone(), p1: null, look0: lookA.clone(), look1: null, planet: null });
  S.N = N;
  return segs;
}
function total(segs){ return segs.reduce((a, s) => a + s.dur, 0); }

/* ---------- légende ---------- */
function ensureDom(){
  if(S.capEl) return;
  const css = document.createElement('style');
  css.textContent = "#survolHead,#survolCap{position:fixed;left:50%;transform:translateX(-50%);z-index:7;pointer-events:none;font-family:'JetBrains Mono',monospace;transition:opacity .45s ease;opacity:0;text-align:center}" +
    "#survolHead{top:58px;font-size:11px;letter-spacing:.14em;color:#8ea0c4}#survolHead b{color:#ffb454;font-weight:700}" +
    "#survolCap{bottom:120px;padding:10px 18px;background:rgba(11,18,32,.78);border:1px solid #25375c;min-width:260px}" +
    "#survolCap .n{font-size:15px;font-weight:700;letter-spacing:.06em;color:#ffb454}#survolCap .m{font-size:11px;color:#c8d2e4;margin-top:4px}";
  document.head.appendChild(css);
  S.headEl = document.createElement('div'); S.headEl.id = 'survolHead'; document.body.appendChild(S.headEl);
  S.capEl = document.createElement('div'); S.capEl.id = 'survolCap'; document.body.appendChild(S.capEl);
}
function caption(p){
  if(!p){ S.capEl.style.opacity = '0'; return; }
  const kind = t('planetKind_' + p.kind.key);
  S.capEl.innerHTML = '<div class="n">' + (p.properName || kind) + '</div><div class="m">' + kind + ' · ' + t('radiusUnit') + REAL.fmt.dist(p.radius) +
    ' · ' + t('survolOrbit') + ' ' + REAL.fmt.dist(p.orbitA || p.position.length()) + (p.isHabitable ? ' · ' + (p.portName || '') : '') + '</div>';
  S.capEl.style.opacity = '1';
}

/* ---------- démarrage, arrêt ---------- */
function start(reason){
  const leg = REAL.leg; if(!leg || !leg.planets.length || S.active) return false;
  if(jumpState || REAL.phase === 'APPROACH' || REAL.phase === 'WARP' || REAL.phase === 'WARPOUT' || REAL.phase === 'HOP' || REAL.camHold) return false;
  ensureDom();
  S.segs = plan(leg); S.i = 0; S.t = 0; S.active = true; S.skip = false; S.leg = leg; S.reason = reason; S.toured.add(leg.cell);
  S.visited = new Set();
  /* le vaisseau arrive au couloir juste après le survol : accélération du temps du transfert recalculée */
  const M = REAL.mission;
  if(REAL.phase === 'TRANSFER' && M && M.tr){
    const left = Math.max(0, M.tr.prof.D - M.t);
    M.tau = Math.max(1, left/(total(S.segs) + 2)); REAL.tau = M.tau;
  }
  S.headEl.innerHTML = t('survolTitle') + ' · <b>' + leg.name + '</b> · ' + t('survolHint');
  S.headEl.style.opacity = '1';
  return true;
}
function stop(){
  S.active = false; S.segs = [];
  if(S.capEl){ S.capEl.style.opacity = '0'; S.headEl.style.opacity = '0'; }
  camera.position.copy(camPos); camera.up.set(0, 1, 0); camera.lookAt(camLook);
}
function skip(){
  if(!S.active || S.skip) return;
  S.skip = true;
  S.segs = [{ kind: 'back', dur: T_SKIP, p0: camera.position.clone(), p1: null, q0: camera.quaternion.clone(), planet: null }]; S.i = 0; S.t = 0;
  caption(null);
}

/* ---------- mise à jour par image (après updateFlight, avant les greffons vaisseau) ---------- */
function update(dt){
  const leg = REAL.leg;
  /* arrivée par saut ou distorsion dans un système jamais survolé : survol automatique pendant le transfert */
  if(!S.active && leg && REAL.hops > 0 && !S.toured.has(leg.cell) && REAL.phase === 'TRANSFER' && !jumpState && !REAL.camHold) start('arrivee');
  if(!S.active) return;
  if(leg !== S.leg || jumpState || REAL.phase === 'APPROACH' && !S.skip && S.segs[S.i] && S.segs[S.i].kind !== 'back'){ skip(); }
  let seg = S.segs[S.i];
  S.t += dt;
  while(seg && S.t >= seg.dur){ S.t -= seg.dur; S.i++; seg = S.segs[S.i]; if(seg && seg.kind === 'fly') caption(seg.planet); else if(seg && seg.kind === 'transit') caption(null); }
  if(!seg){ stop(); return; }
  const k = S.t/seg.dur, up = S.N || new V3(0, 1, 0);
  if(seg.kind === 'fly'){
    camera.position.copy(seg.p0).lerp(seg.p1, k);                        /* passage à vitesse constante */
    camera.up.copy(up); camera.lookAt(seg.planet.position);
  } else if(seg.kind === 'transit'){
    const e = smoother(k);
    /* distances de l'ordre de l'ua : interpolation en échelle logarithmique de la distance à l'arrivée,
       pour un départ vif et une arrivée douce près de la planète */
    const D0 = seg.p0.distanceTo(seg.p1), dl = Math.exp(Math.log(Math.max(D0, 1))*(1 - e));
    camera.position.copy(seg.p1).addScaledVector(seg.p0.clone().sub(seg.p1).normalize(), e >= 1 ? 0 : dl - (1 - e));
    camera.up.copy(up);
    _qa.copy(lookQ(camera.position, seg.look0, up)); _qb.copy(lookQ(camera.position, seg.look1, up));
    camera.quaternion.copy(_qa).slerp(_qb, smooth(k/.45));
  } else {
    /* retour : rejoint la caméra de poursuite (camPos suit le vaisseau pendant tout le survol) */
    const e = smoother(k), target = camPos, D0 = seg.p0.distanceTo(target);
    const dl = Math.exp(Math.log(Math.max(D0, 1))*(1 - e));
    camera.position.copy(target).addScaledVector(seg.p0.clone().sub(target).normalize(), e >= 1 ? 0 : dl - (1 - e));
    _qb.copy(lookQ(camera.position, camLook, new V3(0, 1, 0).applyQuaternion(shipRig.quaternion)));
    if(!seg.q0) seg.q0 = lookQ(seg.p0, seg.look0 || camLook, up);
    camera.quaternion.copy(seg.q0).slerp(_qb, smooth(k));
  }
  /* un transit rectiligne ne doit jamais traverser une planète : la caméra est repoussée à 1,6 rayon du centre
     (au retour, jamais plus loin que le vaisseau lui-même, qui peut être en orbite basse) */
  if(seg.kind !== 'fly') leg.planets.forEach(function(p){
    const v = camera.position.clone().sub(p.position), m = v.length();
    let rmin = p.radius*1.6;
    if(seg.kind === 'back') rmin = Math.min(rmin, camPos.distanceTo(p.position)*.98);
    if(m < rmin && m > 1e-6) camera.position.copy(p.position).addScaledVector(v.multiplyScalar(1/m), rmin);
  });
  camera.updateMatrixWorld();
}

/* commandes : G lance le survol ; pendant le survol, toute touche ou un clic ramène au vaisseau */
window.addEventListener('keydown', function(e){
  if(!gameStarted) return;
  if(S.active){ if(!['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(e.code)){ skip(); e.stopImmediatePropagation(); e.preventDefault(); } return; }
  if(e.code === 'KeyG' && !(window.__STARMAP && __STARMAP.isOpen())){ e.preventDefault(); start('demande'); }
}, true);
window.addEventListener('pointerdown', function(e){ if(S.active && e.target && e.target.tagName === 'CANVAS') skip(); }, true);

return { start, stop, skip, update, isActive: () => S.active, state: S, total: () => total(S.segs) };
})();
