/* =========================================================================
   SÉQUENCE DE TITRE — plans-séquences dans des systèmes réels
   Remplace l'ancienne cinématique (ciel en unités compressées, sans système). Un plan-séquence continu
   par système, les systèmes les plus spectaculaires du voisinage s'enchaînant en boucle :
   - choix : tous les systèmes à ≤ 2 cellules du point de départ sont notés d'après leurs données
     (REAL.systemInfo, sans rien construire) — anneaux, lunes, planète habitable, géantes, étoile
     bleue ou géante ; les 4 meilleurs sont visités de proche en proche, en boucle ;
   - dans chaque système (~30 s) : approche de l'étoile (couronne, éruptions), puis les 2 plus belles
     planètes — avec une lune : on longe la planète côté jour puis on glisse vers la lune, la planète
     passant derrière elle ; sans lune : arc lent du jour vers le terminateur ; transits doux
     (distance interpolée en échelle logarithmique), jamais à travers un astre ;
   - d'un système à l'autre : FONDU AU NOIR (0,8 s + 0,25 s de noir + 0,8 s) ; le système suivant est
     construit pendant le noir, sa prise commence pendant la remontée du fondu (la caméra bouge déjà) ;
   - le titre et ses boutons restent par-dessus ; le jeu démarre comme avant (TITLE.stop).
   ========================================================================= */
const TITLE = (function(){
const V3 = THREE.Vector3, Q = THREE.Quaternion;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = x => { x = clamp(x, 0, 1); return x*x*(3 - 2*x); };
const smoother = x => { x = clamp(x, 0, 1); return x*x*x*(x*(6*x - 15) + 10); };
const T = { STAR: 5, PLANET: 7, EXIT: 2.4, FADE: .8, BLACK: .25 };
const S = { on: false, list: [], idx: 0, segs: [], i: 0, t: 0, leg: null, fade: null, veil: null, chunk: 0, lookQ: new Q(), started: false };
const _m4 = new THREE.Matrix4();
/* interpolation d'orientation SANS « plus court chemin » à chaque image : près d'un demi-tour, le plus court chemin
   change de côté d'une image à l'autre (saut mesuré à 53 rad/s) ; le côté est choisi au départ du segment, puis la
   cible est maintenue dans le même hémisphère que l'image précédente (continuité) */
function steadySlerp(seg, qa, qb, t){
  if(!seg.qbPrev){ if(qa.dot(qb) < 0) qb.set(-qb.x, -qb.y, -qb.z, -qb.w); }
  else if(qb.dot(seg.qbPrev) < 0) qb.set(-qb.x, -qb.y, -qb.z, -qb.w);
  seg.qbPrev = qb.clone();
  const c = clamp(qa.dot(qb), -1, 1), th = Math.acos(c);
  if(th < 1e-5) return qa.clone();
  const sn = Math.sin(th), a = Math.sin((1 - t)*th)/sn, b = Math.sin(t*th)/sn;
  return new Q(qa.x*a + qb.x*b, qa.y*a + qb.y*b, qa.z*a + qb.z*b, qa.w*a + qb.w*b).normalize();
}
function lookQ(pos, target, up){
  const d = target.clone().sub(pos).normalize(); let u = (up || new V3(0, 1, 0)).clone();
  if(Math.abs(u.dot(d)) > .985) u = Math.abs(d.y) < .9 ? new V3(0, 1, 0) : new V3(1, 0, 0);   /* visée presque selon le « haut » : repère de secours */
  _m4.lookAt(pos, target, u); return new Q().setFromRotationMatrix(_m4);
}

/* ---------- choix des systèmes ---------- */
function scoreSystem(info){
  if(!info || !info.planets.length) return -1;
  let s = 0;
  info.planets.forEach(p => { s += (p.rings ? 3 : 0) + Math.min(p.moons, 3)*1.2 + (p.gas ? .8 : 0) + (p.hab ? 2 : 0) + (p.kind === 'ocean' || p.kind === 'continental' ? .6 : 0); });
  if(info.temp > 9000) s += 2; else if(info.temp < 3800) s += .6;
  if(/I/.test(String(info.lumLabel || '')) && !/V/.test(String(info.lumLabel || ''))) s += 2;   /* géante / supergéante */
  if(info.planets.length >= 3) s += 1;
  return s;
}
function pickSystems(){
  const out = [];
  for(let x = -2; x <= 2; x++) for(let y = -2; y <= 2; y++) for(let z = -2; z <= 2; z++){
    const sd = starDataForCell(x, y, z); if(!sd) continue;
    const info = REAL.systemInfo(sd.cell); const sc = scoreSystem(info);
    if(sc > 0) out.push({ sd: sd, info: info, score: sc });
  }
  out.sort((a, b) => b.score - a.score);
  const top = out.slice(0, 4); if(!top.length) return [];
  /* de proche en proche à partir du meilleur : traversées courtes */
  const ord = [top.shift()];
  while(top.length){ const last = ord[ord.length - 1].sd.position; let bi = 0, bd = Infinity;
    top.forEach((c, i) => { const d = c.sd.position.distanceTo(last); if(d < bd){ bd = d; bi = i; } }); ord.push(top.splice(bi, 1)[0]); }
  return ord;
}
function gameLeg(sd){ return { name: sd.name, designation: sd.star.designation, starPosition: sd.position, cell: sd.cell, star: sd.star }; }

/* ---------- plan d'un système ---------- */
/* un transit rectiligne peut frôler l'étoile (planète de l'autre côté) : la caméra, qui la regarde encore, pivoterait
   alors de ~180° en quelques images — courbe de Bézier qui la contourne à ≥ 12 rayons stellaires */
function transitCtrl(p0, p1, Rs, N){
  const d = p1.clone().sub(p0), L2 = d.lengthSq(); if(L2 < 1) return null;
  const t = clamp(-p0.dot(d)/L2, 0, 1), c = p0.clone().addScaledVector(d, t), dmin = c.length(), R = 12*Rs;
  if(dmin >= R) return null;
  let away = dmin > 1 ? c.clone().normalize() : new V3().crossVectors(d, N).normalize();
  if(away.lengthSq() < .5) away = N.clone();
  return p0.clone().add(p1).multiplyScalar(.5).addScaledVector(away, 2*(R - dmin) + R);
}
function planetScore(p){ return (p.hasRings ? 3 : 0) + Math.min(p.moonCount || 0, 3)*1.2 + (p.kind.gas ? .8 : 0) + (p.isHabitable ? 2 : 0); }
function bigMoon(p){ let best = null, br = 0; (p.moonPivots || []).forEach(pv => { const m = pv.children[0]; if(m && m.scale.x > br){ br = m.scale.x; best = m; } }); return best; }
function orbitNormal(leg){
  const n = new V3(); for(let i = 0; i + 1 < leg.planets.length; i++) n.add(new V3().crossVectors(leg.planets[i].position, leg.planets[i + 1].position).normalize());
  if(n.lengthSq() < 1e-6) n.set(0, 1, 0); if(n.y < 0) n.negate(); return n.normalize();
}
function planSystem(leg, dIn, dOut){
  const N = orbitNormal(leg), Rs = leg.Rs, segs = [];
  /* 1) l'étoile : arrivée du côté de l'étoile précédente, léger arc en se rapprochant */
  const side = new V3().crossVectors(dIn, N).normalize();
  const S0 = dIn.clone().multiplyScalar(-16*Rs).addScaledVector(N, 3.5*Rs);
  const S1 = S0.clone().applyAxisAngle(N, .35).setLength(10*Rs).addScaledVector(N, 1.5*Rs);
  segs.push({ kind: 'path', dur: T.STAR, up: N, p: k => S0.clone().lerp(S1, smooth(k)), look: () => new V3() });
  S.entry = S0;
  /* 2) les deux plus belles planètes, de proche en proche */
  const cand = leg.planets.slice().sort((a, b) => planetScore(b) - planetScore(a)).slice(0, 2);
  let A = S1.clone(), lookA = new V3();
  const ordered = []; let cur = A.clone();
  while(cand.length){ let bi = 0, bd = Infinity; cand.forEach((p, i) => { const d = p.position.distanceTo(cur); if(d < bd){ bd = d; bi = i; } }); const p = cand.splice(bi, 1)[0]; ordered.push(p); cur = p.position; }
  ordered.forEach(p => {
    const P = p.position, R = p.radius, lit = P.clone().negate().normalize(), inc = P.clone().sub(A).normalize();
    const Sp = P.clone().addScaledVector(lit.clone().multiplyScalar(.65).addScaledVector(inc, -.45).addScaledVector(N, .3).normalize(), 3.4*R);
    const dist = A.distanceTo(Sp), dur = clamp(1.8 + .55*Math.log10(Math.max(1, dist/1e6)), 2.4, 4);   /* ≥ 2,4 s : un demi-tour de regard reste doux */
    segs.push({ kind: 'transit', dur: dur, up: N, p0: A.clone(), p1: Sp.clone(), c: transitCtrl(A, Sp, Rs, N), look0: lookA.clone(), look1: () => P.clone() });
    const m = bigMoon(p);
    if(m){
      /* planète puis glissement vers la lune, la planète passant derrière elle */
      const M0 = m.getWorldPosition(new V3()), rm = m.scale.x;
      const E = M0.clone().addScaledVector(M0.clone().sub(P).normalize(), 12*rm).addScaledVector(N, 3*rm);   /* assez loin pour que la lune ne défile pas trop vite */
      /* arc AUTOUR de la planète (et non une courbe de Bézier qui pouvait la traverser) : direction interpolée sur la
         sphère, distance interpolée en échelle logarithmique — jamais plus près que min(départ, arrivée) ≥ 3,4 R */
      const us = Sp.clone().sub(P), ue = E.clone().sub(P), rs = us.length(), re = ue.length(); us.normalize(); ue.normalize();
      const opp = us.dot(ue) < -.985, qArc = new Q().setFromUnitVectors(us, ue);
      const arc = k => { const e = smoother(k), q = opp ? new Q().setFromAxisAngle(N, Math.PI*e) : new Q().slerp(qArc, e);
        return P.clone().addScaledVector(us.clone().applyQuaternion(q), Math.exp(Math.log(rs)*(1 - e) + Math.log(re)*e)); };
      segs.push({ kind: 'path', dur: T.PLANET, up: N, p: arc, look: k => { const Mn = m.getWorldPosition(new V3()); return P.clone().lerp(Mn, .35*smooth((k - .3)/.45)); }, moon: m, planet: p });   /* regard vers la planète : la lune passe au premier plan (et ne défile plus en gros plan) */
      A = E.clone(); lookA = M0.clone();
    } else {
      /* arc lent du jour vers le terminateur */
      const axis = new V3().crossVectors(Sp.clone().sub(P), N).normalize().cross(Sp.clone().sub(P).normalize()).normalize();
      const rel = Sp.clone().sub(P);
      segs.push({ kind: 'path', dur: T.PLANET, up: N, p: k => P.clone().add(rel.clone().applyAxisAngle(N, 1.2*smooth(k))), look: () => P.clone(), planet: p });
      A = P.clone().add(rel.clone().applyAxisAngle(N, 1.2)); lookA = P.clone();
    }
  });
  /* 3) sortie : on se tourne vers l'étoile suivante */
  const Aend = A.clone(), la = lookA.clone();
  /* orientation interpolée (et non le point visé : entre un astre proche et un point à l'infini, il partait presque d'un coup) */
  segs.push({ kind: 'turn', dur: T.EXIT, up: N, p: k => Aend.clone().addScaledVector(dOut, Rs*3*smooth(k)), from: la, dir: dOut.clone() });
  return segs;
}

/* ---------- application d'un segment ---------- */
function applySeg(seg, k, leg, dt){
  let pos, look;
  if(seg.kind === 'transit'){
    const e = smoother(k), D0 = seg.p0.distanceTo(seg.p1), dl = Math.exp(Math.log(Math.max(D0, 1))*(1 - e));
    if(seg.c){                                                     /* même loi (distance restante logarithmique), sur la courbe */
      const u = e >= 1 ? 1 : clamp(1 - (dl - 1)/Math.max(D0 - 1, 1), 0, 1), a = 1 - u;
      pos = seg.p0.clone().multiplyScalar(a*a).addScaledVector(seg.c, 2*a*u).addScaledVector(seg.p1, u*u);
    } else pos = seg.p1.clone().addScaledVector(seg.p0.clone().sub(seg.p1).normalize(), e >= 1 ? 0 : dl - (1 - e));
    /* orientation de départ FIGÉE (fin du plan précédent) : recalculée vers l'astre qu'on quitte, de très près et en
       accélérant, elle tournait à ~90 rad/s */
    if(!seg.q0) seg.q0 = camera.quaternion.clone();
    const qa = seg.q0, qb = lookQ(pos, seg.look1(), seg.up);
    camera.position.copy(pos); camera.quaternion.copy(steadySlerp(seg, qa, qb, smoother(k)));   /* pivot réparti sur tout le transit, sens constant */
  } else if(seg.kind === 'turn'){
    pos = seg.p(k);
    if(!seg.q0) seg.q0 = camera.quaternion.clone();
    const qa = seg.q0, qb = lookQ(pos, pos.clone().add(seg.dir), seg.up);
    camera.position.copy(pos); camera.quaternion.copy(steadySlerp(seg, qa, qb, smoother(k)));
  } else {
    pos = seg.p(k); look = seg.look(k);
    const d = look.clone().sub(pos).normalize(), up0 = (seg.up || new V3(0, 1, 0)).clone();
    let up = up0.addScaledVector(d, -up0.dot(d));
    if(up.lengthSq() < .02){ const prev = new V3(0, 1, 0).applyQuaternion(camera.quaternion); up = prev.addScaledVector(d, -prev.dot(d)); }
    camera.position.copy(pos); camera.up.copy(up.normalize()); camera.lookAt(look);
  }
  /* jamais à travers un astre */
  leg.planets.forEach(p => { const v = camera.position.clone().sub(p.position), m = v.length(), rmin = p.radius*1.3;
    if(m < rmin && m > 1e-6) camera.position.copy(p.position).addScaledVector(v.multiplyScalar(1/m), rmin); });
  const vs = camera.position.length(); if(vs < leg.Rs*3) camera.position.setLength(leg.Rs*3);
  camera.updateMatrixWorld();
}

/* ---------- fondu au noir d'un système à l'autre ---------- */
function veil(){
  if(!S.veil){ const v = document.createElement('div'); v.id = 'titleVeil';
    v.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:2';   /* au-dessus de la scène, sous le titre */
    const c = document.getElementById('scene'); c.parentNode.insertBefore(v, c.nextSibling); S.veil = v; }
  return S.veil;
}
function startFade(){ S.fade = { t: 0, swapped: false }; }
function updateFade(dt){
  const F = S.fade; F.t += dt;
  const tin = F.t - T.FADE - T.BLACK;
  veil().style.opacity = String(F.t < T.FADE ? smooth(F.t/T.FADE) : (tin < 0 ? 1 : 1 - smooth(tin/T.FADE)));
  if(!F.swapped && F.t >= T.FADE){                                  /* dans le noir : système suivant construit, sa prise démarre */
    F.swapped = true;
    const from = S.list[S.idx]; S.idx = (S.idx + 1) % S.list.length; const to = S.list[S.idx], next = S.list[(S.idx + 1) % S.list.length];
    let dIn = to.sd.position.clone().sub(from.sd.position); dIn = dIn.lengthSq() > 0 ? dIn.normalize() : new V3(.6, -.2, .77).normalize();
    let dOut = next.sd.position.clone().sub(to.sd.position); dOut = dOut.lengthSq() > 0 ? dOut.normalize() : dIn.clone();
    const leg = REAL.titleEnter(gameLeg(to.sd));
    S.segs = planSystem(leg, dIn, dOut); S.i = 0; S.t = 0; S.leg = leg;
    applySeg(S.segs[0], 0, leg, 0);
  }
  if(tin >= T.FADE){ S.fade = null; veil().style.opacity = '0'; }
}

/* ---------- ciel galactique (hors partie) ---------- */
function updateSky(dt, elapsed){
  const g = REAL.galPos;
  S.chunk += dt; if(S.chunk > .5){ S.chunk = 0; refreshField(STAR_CELL, STAR_RADIUS, starField, buildStarCell); refreshField(NEBULA_CELL, NEBULA_RADIUS, nebulaField, buildNebulaCell); }
  starField.forEach((o, key) => { if(!o) return;
    if(key === REAL.hideCell){ o.mesh.visible = false; if(o.label) o.label.style.display = 'none'; return; }
    o.mesh.visible = true; if(o.label) o.label.style.display = 'none';
    const d = o.mesh.position.distanceTo(g), angular = THREE.MathUtils.clamp(o.baseCore*26/Math.max(d, 1), .3, 9);
    o.core.scale.setScalar(angular); o.core.material.uniforms.time.value = elapsed;
    const mag = apparentMagnitude(o.star.lum, Math.max(d/38, 1e-3)), perceived = THREE.MathUtils.clamp(Math.pow(Math.pow(10, -.4*(mag - 4)), .25), 0, 6);
    o.halo.scale.setScalar(o.baseHalo*(.55 + perceived*.55)); o.halo.material.opacity = THREE.MathUtils.clamp(.25 + perceived*.35, .15, 1);
  });
  nebulaField.forEach(o => { if(!o) return; o.mesh.material.uniforms.uTime.value = elapsed;
    const ud = o.mesh.userData; if(ud && ud.currentFade < ud.targetFade - .001){ ud.currentFade += (ud.targetFade - ud.currentFade)*Math.min(1, dt*.5); o.mesh.material.uniforms.uFade.value = ud.currentFade; } });
  backdrop.position.copy(g);
  backdrop.children.forEach(c => { if(c.material && c.material.uniforms && c.material.uniforms.uTime) c.material.uniforms.uTime.value = elapsed; });
}

/* ---------- par image, tant que la partie n'a pas commencé ---------- */
function start(){
  S.started = true;
  S.list = pickSystems(); if(!S.list.length) return false;
  S.idx = 0;
  const first = S.list[0], next = S.list[1 % S.list.length];
  const leg = REAL.titleEnter(gameLeg(first.sd));
  const dIn = new V3(.6, -.2, .77).normalize(), dOut = next !== first ? next.sd.position.clone().sub(first.sd.position).normalize() : dIn;
  S.segs = planSystem(leg, dIn, dOut); S.i = 0; S.t = 0; S.leg = leg; S.on = true;
  shipRig.visible = false;
  return true;
}
function tick(dt, elapsed){
  if(!S.started && !start()) return false;
  if(!S.on) return false;
  if(S.fade) updateFade(dt);
  let seg = S.segs[S.i]; S.t += dt;
  while(seg && S.t >= seg.dur){ S.t -= seg.dur; S.i++; seg = S.segs[S.i]; }
  if(!seg){ seg = S.segs[S.segs.length - 1]; S.i = S.segs.length - 1; S.t = seg.dur; if(!S.fade) startFade(); }
  else if(!S.fade && S.i === S.segs.length - 1 && seg.dur - S.t <= T.FADE) startFade();   /* fondu pendant le dernier mouvement */
  applySeg(seg, clamp(S.t/seg.dur, 0, 1), S.leg, dt);
  REAL.titleUpdate(dt);
  updateSky(dt, elapsed);
  return true;
}
function stop(){
  if(!S.on) return;
  S.on = false; S.fade = null; if(S.veil) S.veil.style.opacity = '0';
  REAL.titleExit();
}
return { tick, stop, state: S, pickSystems, scoreSystem };
})();
