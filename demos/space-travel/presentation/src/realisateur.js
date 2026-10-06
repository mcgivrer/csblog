/* =====================================================================
   RÉALISATEUR CÉLESTE (lot P2) — filme l'univers de cosmos.js sans aucun vaisseau pour sujet
   - onze types de plans dont les sujets sont les astres : étoile, croissant, nébuleuse, survol, terminateur,
     limbe, anneaux, lune, éclipse, ceinture (cf. docs/SPEC-P2-realisateur.md) ;
   - grammaire : un plan d'ensemble pour ouvrir chaque système, jamais deux fois le même type à la suite,
     coupe franche ou creux au noir entre deux plans, fondu au noir entre deux systèmes ;
   - cadrage aux tiers, du côté opposé au texte de la slide (setFraming) ;
   - métadonnées par image pour la direction photo (P3) : focale, mise au point, étoile à l'écran, fondu.
   window.__REALISATEUR.create(W, camera, opts) → D ; appeler D.update(dt) AVANT W.update(dt, camera, renderer).
   ===================================================================== */
(function(){
'use strict';
const V3 = THREE.Vector3;
const RZ = window.__REALISATEUR = {};
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = x => { x = clamp(x, 0, 1); return x*x*(3 - 2*x); };
const smoother = x => { x = clamp(x, 0, 1); return x*x*x*(x*(6*x - 15) + 10); };
const lerp = (a, b, x) => a + (b - a)*x;
const DEG = Math.PI/180;
function xmur3(str){ let h = 1779033703 ^ str.length; for(let i = 0; i < str.length; i++){ h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return h >>> 0; }; }
function mulberry32(a){ return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0)/4294967296; }; }
const rngOf = tag => mulberry32(xmur3(tag)());
/* focale (mm, plein format) ↔ champ vertical (degrés) */
const fovOf = f => 2*Math.atan(12/f)/DEG;
const focalOf = fov => 12/Math.tan(fov*DEG/2);
/* distance pour qu'une sphère de rayon R occupe la fraction `frac` de la hauteur du cadre */
const distFor = (R, fov, frac) => R/Math.sin(clamp(fov*frac, .5, 170)*DEG/2);

const TYPES = {
  etoile:      { label: 'Approche de l’étoile', dur: [9, 12],  center: true,  opener: 1 },
  croissant:   { label: 'Croissant à contre-jour',    dur: [10, 13], center: true,  opener: 1, closer: 1 },
  nebuleuse:   { label: 'Nébuleuse',                  dur: [10, 13], center: true,  opener: 1, closer: 1 },
  survol:      { label: 'Survol',                     dur: [10, 13] },
  terminateur: { label: 'Terminateur',                dur: [9, 12] },
  limbe:       { label: 'Lever d’étoile au limbe', dur: [10, 13] },
  anneaux:     { label: 'Anneaux en rase-mottes',     dur: [9, 12] },
  lune:        { label: 'Lune devant sa planète',     dur: [10, 13], center: true,  closer: 1 },
  eclipse:     { label: 'Éclipse',                    dur: [10, 13], center: true,  closer: 1 },
  ceinture:    { label: 'Ceinture d’astéroïdes',  dur: [9, 12] }
};
RZ.TYPES = TYPES;

RZ.create = function(W, camera, opts){
  opts = opts || {};
  const SEED = String(opts.seed !== undefined ? opts.seed : Math.floor(Math.random()*1e9));
  const D = { seed: SEED, log: [], meta: { fade: 1 }, framing: opts.framing || 'auto', seq: -1, sysIdx: -1 };
  const systems = opts.systemsList || W.pickSystems(opts.systems || 6, opts.radius || 2, opts.center);
  D.systems = systems;
  const S = { plan: [], i: -1, t: 0, shot: null, black: 0, autoSide: 1, cluster: null, exit: null };

  /* ---------- sujets ---------- */
  const pScore = p => (p.ring ? 3 : 0) + Math.min(p.moonPivots.length, 3)*1.2 + (p.kind.gas ? .8 : 0) + (p.isHabitable ? 2 : 0) + (p.hasAtmosphere ? .4 : 0);
  const litOf = p => p.position.clone().negate().normalize();
  const minD = p => Math.max(p.radius*1.02, p.ringOuter ? p.ringOuter*1.08 : 0);
  function perp(a, hint){ const p = hint.clone().sub(a.clone().multiplyScalar(hint.dot(a))); if(p.lengthSq() < 1e-8) return perp(a, Math.abs(a.y) < .9 ? new V3(0, 1, 0) : new V3(1, 0, 0)); return p.normalize(); }
  function bigMoon(p){ let best = null, br = 0; p.moonPivots.forEach(pv => { const m = pv.children[0]; if(m && m.scale.x > br){ br = m.scale.x; best = m; } }); return best; }
  const wpos = o => o.getWorldPosition(new V3());
  /* directions galactiques des nébuleuses (cellules proches et fond lointain), vues depuis le système */
  function nebulae(){
    const out = [];
    W.nebulaField.forEach(o => { if(!o) return; const d = o.center.clone().sub(W.galPos), L = d.length(); out.push({ dir: d.normalize(), size: 600/L }); });
    W.backdrop.children.forEach(c => { if(c.geometry && c.geometry.isInstancedBufferGeometry){ const L = c.position.length(); out.push({ dir: c.position.clone().normalize(), size: .5*1500/L }); } });
    return out;
  }

  /* ---------- sécurité : jamais dans un astre ---------- */
  function guards(){
    const g = [], leg = W.leg; if(!leg) return g;
    g.push({ c: new V3(), r: leg.Rs*1.15 });
    leg.planets.forEach(p => { g.push({ c: p.position, r: p.radius*1.02 }); p.moonPivots.forEach(pv => { const m = pv.children[0]; if(m) g.push({ c: wpos(m), r: m.scale.x*1.3 }); }); });
    if(S.cluster) S.cluster.rocks.forEach(rk => g.push({ c: wpos(rk.mesh), r: Math.max(rk.mesh.scale.x, rk.mesh.scale.y, rk.mesh.scale.z)*2.5 }));
    return g;
  }
  function safe(pos){ guards().forEach(g => { const d = pos.distanceTo(g.c); if(d < g.r) pos.add(pos.clone().sub(g.c).normalize().multiplyScalar(g.r - d)); }); return pos; }
  D.guards = guards;

  /* ---------- constructeurs de plans : { pos(k), look(k), up(k), fov(k), focus(k), near(k)? } ---------- */
  const B = {};
  B.etoile = function(r){
    const leg = W.leg, N = leg.orbitN, Rs = leg.Rs, s = perp(N, new V3(1, 0, 0)), l = new V3().crossVectors(N, s), a = r()*Math.PI*2;
    const dIn = s.clone().multiplyScalar(Math.cos(a)).addScaledVector(l, Math.sin(a));
    const S0 = dIn.clone().multiplyScalar(16*Rs).addScaledVector(N, lerp(2, 4.5, r())*Rs);
    const S1 = S0.clone().applyAxisAngle(N, lerp(.25, .45, r())*(r() < .5 ? -1 : 1)).setLength(10*Rs).addScaledVector(N, 1.5*Rs);
    const fov = fovOf(lerp(38, 55, r()));
    return { subject: 'étoile', pos: k => S0.clone().lerp(S1, smoother(k)), look: () => new V3(), up: () => N, fov: () => fov, focus: k => S0.clone().lerp(S1, smoother(k)).length() };
  };
  B.croissant = function(r, p){
    const N = W.leg.orbitN, L = litOf(p), P = p.position, R = p.radius;
    const Np = perp(L, N), sd = new V3().crossVectors(Np, L), phi = lerp(-.6, .6, r());
    const axis = Np.clone().multiplyScalar(Math.cos(phi)).addScaledVector(sd, Math.sin(phi)).normalize();
    const fov = fovOf(lerp(24, 30, r())), D0 = Math.max(distFor(R, fov, lerp(.42, .55, r())), minD(p)*1.5);
    const alpha = Math.asin(Math.min(1, R/D0)) + lerp(4, 9, r())*DEG, dir = L.clone().negate().applyAxisAngle(axis, alpha);   /* l'étoile juste au-delà du limbe */
    const pos = k => P.clone().addScaledVector(dir, D0*(1 - .12*smooth(k)));
    return { subject: p.properName, pos, up: () => N, fov: () => fov,
      look: k => { const c = pos(k), up = P.clone().sub(c).normalize(), us = c.clone().negate().normalize(); return c.clone().add(up.multiplyScalar(.55).addScaledVector(us, .45).normalize()); },
      focus: k => pos(k).distanceTo(P) };
  };
  B.nebuleuse = function(r, p){
    const N = W.leg.orbitN, L = litOf(p), P = p.position, R = p.radius;
    const list = nebulae().map(n => ({ n, s: n.size*(1 - .6*Math.abs(n.dir.dot(L))) })).sort((a, b) => b.s - a.s);
    const g = (list[Math.min(list.length - 1, Math.floor(r()*Math.min(3, list.length)))] || { n: { dir: perp(L, N) } }).n.dir.clone();
    const upg = perp(g, N), fov = fovOf(lerp(24, 32, r())), half = fov*DEG/2, target = Math.atan(Math.tan(half)/3);
    const dist = Math.max(R*lerp(2.6, 3.4, r()), minD(p)*1.3);
    let lo = 0, hi = 6*R;   /* hauteur telle que le haut de la planète arrive au tiers inférieur du cadre */
    for(let it = 0; it < 40; it++){ const h = (lo + hi)/2, f = Math.atan(h/dist) - Math.asin(Math.min(1, R/Math.hypot(dist, h))) - target; if(f > 0) hi = h; else lo = h; }
    const h0 = (lo + hi)/2, pan = lerp(3, 6, r())*DEG*(r() < .5 ? -1 : 1);
    const pos = k => P.clone().addScaledVector(g, -dist).addScaledVector(upg, h0 + .06*R*smooth(k));
    return { subject: p.properName, pos, up: () => upg, fov: () => fov,
      look: k => pos(k).add(g.clone().applyAxisAngle(upg, pan*(smooth(k) - .5))),
      focus: () => 1e20, near: k => pos(k).distanceTo(P) - R };
  };
  B.survol = function(r, p){
    const N = W.leg.orbitN, L = litOf(p), P = p.position, R = p.radius, sd = perp(new V3().crossVectors(N, L), N).multiplyScalar(r() < .5 ? 1 : -1);
    const fov = fovOf(lerp(28, 40, r())), dist = Math.max(distFor(R, fov, lerp(.55, .7, r())), minD(p)*1.12);
    const rel = L.clone().multiplyScalar(.65).addScaledVector(sd, -.45).addScaledVector(N, .3).normalize().multiplyScalar(dist);
    const sg = rel.clone().applyAxisAngle(N, .1).normalize().dot(L) < rel.clone().normalize().dot(L) ? 1 : -1;   /* vers le terminateur */
    const sweep = lerp(.9, 1.2, r())*sg;
    const pos = k => P.clone().add(rel.clone().applyAxisAngle(N, sweep*smooth(k)));
    return { subject: p.properName, pos, look: () => P.clone(), up: () => N, fov: () => fov, focus: k => pos(k).distanceTo(P) };
  };
  B.terminateur = function(r, p){
    const N = W.leg.orbitN, L = litOf(p), P = p.position, R = p.radius, sd = perp(new V3().crossVectors(N, L), N).multiplyScalar(r() < .5 ? 1 : -1);
    const fov = fovOf(lerp(32, 45, r())), dist = Math.max(distFor(R, fov, lerp(.6, .72, r())), minD(p)*1.12);
    const d0 = sd.clone().multiplyScalar(lerp(.85, 1, r())).addScaledVector(N, lerp(.15, .35, r())).addScaledVector(L, -lerp(.15, .3, r())).normalize();
    const sg = d0.clone().applyAxisAngle(N, .1).dot(L) < d0.dot(L) ? 1 : -1;
    const pos = k => P.clone().addScaledVector(d0.clone().applyAxisAngle(N, sg*.16*smooth(k)), dist);
    return { subject: p.properName, pos, look: () => P.clone().addScaledVector(L, -.22*R), up: () => N, fov: () => fov, focus: k => pos(k).distanceTo(P) };
  };
  B.limbe = function(r, p){
    const N = W.leg.orbitN, L = litOf(p), P = p.position, R = p.radius, Np = perp(L, N), sd = new V3().crossVectors(Np, L);
    const phi = lerp(-.5, .5, r()) + (r() < .5 ? 0 : Math.PI), t0 = sd.clone().multiplyScalar(Math.cos(phi)).addScaledVector(Np, Math.sin(phi)).normalize();
    const e0 = lerp(-3, 1.5, r())*DEG, e1 = e0 + lerp(4, 7, r())*DEG, h = R*lerp(.035, .06, r());
    const fov = fovOf(lerp(24, 28, r())), dip = Math.acos(R/(R + h)), pitch = -dip + Math.atan(Math.tan(fov*DEG/2)/3);
    const u = k => { const e = lerp(e0, e1, smooth(k)); return t0.clone().multiplyScalar(Math.cos(e)).addScaledVector(L, Math.sin(e)).normalize(); };
    const pos = k => P.clone().addScaledVector(u(k), R + h);
    return { subject: p.properName, pos, up: k => u(k), fov: () => fov,
      look: k => { const n = u(k), f = L.clone().sub(n.clone().multiplyScalar(L.dot(n))).normalize(); return pos(k).add(f.multiplyScalar(Math.cos(pitch)).addScaledVector(n, Math.sin(pitch)).multiplyScalar(R)); },
      focus: () => Math.sqrt(Math.pow(R + h, 2) - R*R) };
  };
  B.anneaux = function(r, p){
    const P = p.position, R = p.radius, L = litOf(p), q = p.ring.getWorldQuaternion(new THREE.Quaternion());
    const nr = new V3(0, 0, 1).applyQuaternion(q).normalize(), a = perp(nr, L), b = new V3().crossVectors(nr, a);
    const rc = p.ringOuter*lerp(1.15, 1.35, r()), sg = r() < .5 ? -1 : 1, th0 = lerp(.5, 1.1, r())*sg, sw = lerp(.16, .28, r())*sg;
    const elev = lerp(4, 9, r())*DEG*(r() < .5 ? -1 : 1), fov = fovOf(lerp(26, 32, r()));
    const pos = k => { const th = th0 + sw*smooth(k); return P.clone().addScaledVector(a, Math.cos(th)*rc).addScaledVector(b, Math.sin(th)*rc).addScaledVector(nr, rc*Math.tan(elev)); };
    return { subject: p.properName, pos, look: () => P.clone(), up: () => nr.clone().multiplyScalar(Math.sign(elev)), fov: () => fov,
      focus: k => pos(k).distanceTo(P), near: k => Math.max(1, pos(k).distanceTo(P) - p.ringOuter) };
  };
  /* plan « lune » faisable ? lune côté jour (pleine phase), caméra au-delà de la lune, lune ≈ 0,6 fois la planète,
     focale ≤ 300 mm ; sinon (lune trop lointaine pour une planète tellurique) le type n'est pas proposé */
  function moonPlan(p, kz){
    const P = p.position, R = p.radius, L = litOf(p); let m = null, best = -2;
    p.moonPivots.forEach(pv => { const mm = pv.children[0]; if(!mm) return; const d = wpos(mm).sub(P).normalize().dot(L); if(d > best){ best = d; m = mm; } });
    if(!m) return null;
    const M0 = wpos(m), dm = M0.distanceTo(P), rm = m.scale.x, c0 = dm/Math.max(kz*R - rm, .05*R), Dc = dm + c0*rm;
    const fov = 2*Math.asin(R/Dc)/DEG/.48;
    return focalOf(fov) <= 300 ? { m, dm, rm, Dc, dir: M0.sub(P).normalize() } : null;
  }
  B.lune = function(r, p){
    const P = p.position, R = p.radius, N = W.leg.orbitN, mp = moonPlan(p, lerp(.5, .7, r())) || moonPlan(p, .7); if(!mp) return null;
    const { m, dm, rm, Dc, dir } = mp, w = perp(dir, N.clone().add(new V3(r() - .5, r() - .5, r() - .5).multiplyScalar(.6)));
    const fov = 2*Math.asin(R/Dc)/DEG/lerp(.42, .55, r()), thp = Math.asin(R/Dc), xs = thp*(Dc - dm)*Dc/dm;
    const x0 = -lerp(.75, .95, r())*xs, x1 = lerp(.75, .95, r())*xs;   /* la lune traverse le disque de sa planète */
    const pos = k => P.clone().addScaledVector(dir, Dc).addScaledVector(w, lerp(x0, x1, smooth(k)));
    return { subject: p.properName, moon: m, pos, look: () => P.clone(), up: () => N, fov: () => fov,
      focus: k => pos(k).distanceTo(P), near: k => pos(k).distanceTo(wpos(m)) - rm, rack: [.35, .62] };
  };
  B.eclipse = function(r, p){
    const N = W.leg.orbitN, L = litOf(p), P = p.position, R = p.radius;
    const Dd = Math.max(R*lerp(5, 9, r()), minD(p)*1.5), thp = Math.asin(R/Dd), w = perp(L, N.clone().add(new V3(r() - .5, r() - .5, r() - .5).multiplyScalar(.8)));
    const s0 = lerp(.55, .7, r()), s1 = lerp(1.02, 1.07, r());
    const fov = clamp(2*thp/DEG/lerp(.42, .5, r()), fovOf(135), fovOf(24));
    const pos = k => P.clone().addScaledVector(L, -Dd).addScaledVector(w, Dd*Math.tan(thp*lerp(s0, s1, smoother(k))));
    return { subject: p.properName, pos, look: () => P.clone(), up: () => N, fov: () => fov, focus: () => Dd };
  };
  B.ceinture = function(r){
    if(S.cluster){ W.dropCluster(S.cluster); S.cluster = null; }
    const cl = W.beltCluster(r()*Math.PI*2, { R: lerp(1.5e3, 4e3, r()) }); if(!cl) return null;
    S.cluster = cl;
    const C = cl.position, Rm = cl.R, L = C.clone().negate().normalize(), N = W.leg.orbitN, sd = perp(new V3().crossVectors(N, L), N);
    const dA = sd.clone().multiplyScalar(r() < .5 ? 1 : -1).addScaledVector(L, lerp(.3, .6, r())).addScaledVector(N, lerp(-.3, .3, r())).normalize();
    const dB = dA.clone().applyAxisAngle(N, lerp(.7, 1.1, r())*(r() < .5 ? -1 : 1));
    const rA = Rm*lerp(7, 10, r()), rB = Rm*lerp(4.5, 6.5, r()), fov = fovOf(lerp(28, 42, r()));
    const ax = new V3().crossVectors(dA, dB).normalize(), ang = dA.angleTo(dB);
    const pos = k => { const e = smoother(k); return C.clone().addScaledVector(dA.clone().applyAxisAngle(ax, ang*e), Math.exp(lerp(Math.log(rA), Math.log(rB), e))); };
    /* premier plan : la roche la plus proche qui reste DANS le champ jusqu'à la fin de la bascule (k = 0 à 0,55) ;
       sans elle, pas de bascule (un point sur une roche hors champ rendrait flou tout le cadre) */
    const cosIn = Math.cos(fov*DEG*.42), inView = (rk, k) => { const c = pos(k), u = wpos(rk.mesh).sub(c), l = u.length(); return u.dot(C.clone().sub(c).normalize()) > l*cosIn; };
    let fg = null, dMin = Infinity;
    cl.rocks.forEach((rk, i) => { if(i === 0 || !inView(rk, 0) || !inView(rk, .3) || !inView(rk, .55)) return; const d = pos(0).distanceTo(wpos(rk.mesh)) - rk.r; if(d < dMin){ dMin = d; fg = rk; } });
    const near = fg ? k => Math.max(1, pos(k).distanceTo(wpos(fg.mesh)) - fg.r) : undefined;
    return { subject: 'ceinture', pos, look: () => C.clone(), up: () => N, fov: () => fov, focus: k => pos(k).distanceTo(C) - Rm, near, rack: fg ? [.25, .55] : undefined };
  };

  /* ---------- plan d'un système (grammaire) ---------- */
  function planSystem(){
    const leg = W.leg, r = rngOf(SEED + ':realisateur:' + D.seq);
    const pick = list => { let s = 0; list.forEach(e => s += e.w); let x = r()*s; for(const e of list){ x -= e.w; if(x <= 0) return e; } return list[list.length - 1]; };
    const planets = leg.planets.slice().sort((a, b) => pScore(b) - pScore(a)), nebOK = nebulae().length > 0;
    const n = 5 + (r() < .5 ? 1 : 0), plan = [], used = new Set();
    const plain = planets.find(p => !p.ring) || planets[0];
    const openers = [{ type: 'etoile', w: .4 }, { type: 'croissant', w: .35, p: planets[0] }]; if(nebOK) openers.push({ type: 'nebuleuse', w: .25, p: plain });
    const o = pick(openers); plan.push({ type: o.type, p: o.p || null }); used.add(o.type);
    while(plan.length < n){
      const last = plan[plan.length - 1], prev = plan[plan.length - 2], isLast = plan.length === n - 1, cand = [];
      const add = (type, p, w) => {
        if(w <= 0 || type === last.type || (used.has(type) && type !== 'survol')) return;
        if(p && last.p === p && prev && prev.p === p) w *= .25;          /* pas trois plans de suite sur le même astre */
        if(isLast) w *= TYPES[type].closer ? 2.2 : .6;
        cand.push({ type, p, w });
      };
      planets.forEach((p, i) => { const k = [1, .75, .45][i] || .4;
        add('survol', p, 1*k); add('terminateur', p, (p.isHabitable ? 1.3 : .35)*k); add('limbe', p, .9*k);
        if(p.ring) add('anneaux', p, 2.2*k); if(moonPlan(p, .6)) add('lune', p, 1.6*k);
        add('eclipse', p, (p.hasAtmosphere ? 1.2 : .6)*k); add('croissant', p, .7*k); if(nebOK) add('nebuleuse', p, (p.ring ? .15 : .5)*k); });
      add('ceinture', null, leg.beltInfo ? 1.3 : .5);
      if(!cand.length) break;
      const c = pick(cand); plan.push({ type: c.type, p: c.p }); used.add(c.type);
    }
    plan.forEach((s, i) => { const d = TYPES[s.type].dur; s.dur = lerp(d[0], d[1], r()); s.fadeIn = i === 0 ? .9 : 0; s.fadeOut = i === plan.length - 1 ? .9 : 0; });
    for(let i = 1; i < plan.length; i++) if(r() < .2){ plan[i - 1].fadeOut = .3; plan[i].fadeIn = .3; }   /* creux au noir */
    return plan;
  }

  function startShot(i){
    S.i = i; S.t = 0;
    const spec = S.plan[i], r = rngOf(SEED + ':plan:' + D.seq + ':' + i);
    let shot = B[spec.type](r, spec.p);
    if(!shot){ spec.type = 'survol'; spec.p = W.leg.planets[0]; shot = B.survol(r, spec.p); }
    shot.type = spec.type; shot.spec = spec; shot.dur = spec.dur;
    if(D.framing === 'center' || (TYPES[spec.type].center && D.framing === 'auto')) shot.side = 0;   /* côté imposé (slide) : même les plans centrés passent au tiers */
    else if(D.framing === 'left') shot.side = 1;                                   /* texte à gauche → sujet au tiers droit */
    else if(D.framing === 'right') shot.side = -1;
    else { S.autoSide = -S.autoSide; shot.side = S.autoSide; }
    S.shot = shot;
    D.log.push({ seq: D.seq, i, type: spec.type, subject: shot.subject, dur: +spec.dur.toFixed(2), system: W.leg.name, fadeIn: spec.fadeIn, fadeOut: spec.fadeOut });
  }
  function enterSystem(idx){
    if(S.cluster){ W.dropCluster(S.cluster); S.cluster = null; }
    D.sysIdx = ((idx % systems.length) + systems.length) % systems.length; D.seq++;
    W.enter(systems[D.sysIdx].cell);
    S.plan = planSystem(); S.exit = null;
    startShot(0);
  }

  /* ---------- commandes ---------- */
  D.cut = function(){ if(!S.shot) return; if(S.i < S.plan.length - 1){ S.plan[S.i + 1].fadeIn = 0; startShot(S.i + 1); } else D.nextSystem(); };
  D.nextSystem = function(){ if(!S.shot || S.exit !== null) return; S.exit = S.t; };
  D.setFraming = function(side){ D.framing = side || 'auto'; };
  D.play = function(type, pIdx){
    const leg = W.leg; if(!leg || !B[type] || !S.shot) return false;
    const ok = p => p && (type !== 'anneaux' || p.ring) && (type !== 'lune' || moonPlan(p, .6));
    let p = pIdx !== undefined ? leg.planets[pIdx] : null;
    if(!ok(p)) p = leg.planets.slice().sort((a, b) => pScore(b) - pScore(a)).find(ok) || null;
    if(type === 'nebuleuse' && pIdx === undefined) p = leg.planets.find(q => !q.ring) || p;   /* anneaux : cadre trop chargé */
    if(type !== 'etoile' && type !== 'ceinture' && !p) return false;
    const d = TYPES[type].dur;
    S.plan.splice(S.i + 1, 0, { type, p: type === 'etoile' || type === 'ceinture' ? null : p, dur: (d[0] + d[1])/2, fadeIn: 0, fadeOut: 0 });
    startShot(S.i + 1); return true;
  };

  /* ---------- image ---------- */
  const _v = new V3();
  function applyCamera(k){
    const sh = S.shot, pos = safe(sh.pos(k)), fov = sh.fov(k);
    camera.position.copy(pos); camera.up.copy(sh.up(k)); camera.fov = fov; camera.updateProjectionMatrix();
    camera.lookAt(sh.look(k));
    if(sh.side){ const tH = Math.tan(fov*DEG/2)*camera.aspect; camera.rotateY(sh.side*Math.atan(tH/3)); }
    camera.updateMatrixWorld();
  }
  D.update = function(dt){
    if(D.seq < 0) enterSystem(0);
    if(S.black > 0){                                                     /* noir entre deux systèmes */
      S.black -= dt; D.meta.fade = 1;
      if(S.black <= 0) enterSystem(D.sysIdx + 1);
      else return D.meta;
    }
    const sh = S.shot; S.t += dt;
    let k = clamp(S.t/sh.dur, 0, 1), fade = 0;
    const spec = sh.spec;
    if(spec.fadeIn > 0) fade = Math.max(fade, 1 - smooth(S.t/spec.fadeIn));
    const exitAt = S.exit !== null ? S.exit + .9 : null;
    if(exitAt !== null) fade = Math.max(fade, smooth((S.t - S.exit)/.9));
    else if(spec.fadeOut > 0) fade = Math.max(fade, smooth((S.t - (sh.dur - spec.fadeOut))/spec.fadeOut));
    if((exitAt !== null && S.t >= exitAt) || (exitAt === null && S.t >= sh.dur)){
      if(exitAt !== null || S.i >= S.plan.length - 1){ S.black = .35; D.meta.fade = 1; return D.meta; }
      startShot(S.i + 1); k = 0; fade = S.plan[S.i].fadeIn > 0 ? 1 : 0;
    }
    applyCamera(k);
    const s2 = S.shot, near = s2.near ? s2.near(k) : null, far = s2.focus(k);
    let focus = far, rack = 0;
    if(near !== null && s2.rack){ rack = smoother((k - s2.rack[0])/(s2.rack[1] - s2.rack[0])); focus = Math.exp(lerp(Math.log(Math.max(near, 1)), Math.log(Math.max(far, 1)), rack)); }
    _v.set(0, 0, 0).project(camera);
    const fwd = new V3(0, 0, -1).applyQuaternion(camera.quaternion), front = camera.position.clone().negate().dot(fwd) > 0;
    const occ = W.leg && W.leg.star3 && W.leg.star3.lastOcc;
    D.meta = { type: s2.type, label: TYPES[s2.type].label, subject: s2.subject, focal: +focalOf(camera.fov).toFixed(1), fov: camera.fov,
      focus, near, rack, side: s2.side, k, t: S.t, dur: s2.dur, fade, seq: D.seq, shot: S.i, shots: S.plan.length, system: W.leg.name,
      star: { ndc: [_v.x, _v.y], onScreen: front && Math.abs(_v.x) < 1.15 && Math.abs(_v.y) < 1.15, vis: occ ? occ.vis : 1 } };
    return D.meta;
  };
  return D;
};
})();
