/* =========================================================================
   L4 — CARTE 2D DE LA DÉMO + CIBLAGE DE SAUT DU JEU (échelle réelle)
   La carte de la démo (src/JS/demo/starmap.js) lit ses données par l'API
   window.__CINE que fournit cine.js dans la démo ; le jeu n'ayant pas cine.js,
   ce module fournit la même API à partir du jeu :
   - systemInfo / moonsInfo : REAL (données rejouées depuis la graine) ;
   - mapState : système courant, prochain saut (cible de la carte, sinon
     l'itinéraire), mode (saut, distorsion, commerce local), phase du vol ;
   - shipsInfo : le vaisseau du joueur (le trafic arrive avec L9) ;
   - focus / setNextStar : RÈGLES DU JEU (§23) — cibler une étoile exige le
     générateur de saut acheté, une étoile parmi les 24 plus proches à moins
     de 5 cellules, et le carburant du saut ; les objets du système courant
     n'ont pas d'action (la démo y envoie sa caméra, le jeu n'a pas de
     réalisateur) — ils restent consultables.
   Hors échelle réelle, la carte 3D du §23 reste celle de la v2.16.
   ========================================================================= */
const MAP2D = (function(){
  const C = window.__CINE = {};
  C.UNIT_GAL = REAL.UNITS.UNIT_GAL; C.AU = REAL.UNITS.AU;
  C.fmtU = m => REAL.fmt.dist(m);
  C.systemInfo = cell => REAL.systemInfo(cell);
  C.moonsInfo = pi => REAL.moonsInfo(pi);
  C.nebulaLoaded = key => !!nebulaField.get(key);
  C.pendingStar = null;
  const PHASE = { TRANSFER: 'arrival', APPROACH: 'arrival', ORBIT: 'orbit', DEPART: 'departure', COAST: 'departure', HOP: 'departure',
                  JUMP: 'jump', WARP: 'warp', WARPOUT: 'warp' };
  const IN_PASSAGE = { JUMP: 1, WARP: 1, WARPOUT: 1, HOP: 1 };
  const li = l => ({ cell: l.cell, name: l.name, designation: l.designation, gal: (l.gal || l.starPosition).toArray() });
  function model(){ return SHIPGEN.MODELS.find(m => m.id === SHIP_ID) || { name: '—', arch: '', reg: '' }; }
  C.mapState = function(){
    const leg = REAL.leg; if(!leg) return null;
    const nx = REAL.nextTarget() || leg, M = REAL.mission, P = M && M.pass, md = model();
    const toNext = nx.starPosition ? nx.starPosition.clone().sub(leg.gal) : new THREE.Vector3(0, 0, -1);
    return { T: performance.now()/1000, gal: REAL.galPos.toArray(), cur: li(leg), next: li(nx), toNext: toNext.normalize().toArray(),
      mode: hasQuantumJump ? 'jump' : SHIP_WARP ? 'warp' : 'local', phase: PHASE[REAL.phase] || 'arrival',
      progress: REAL.phase === 'WARP' && P && P.t > REAL.FLIGHT.WARP_SPOOL ? Math.min(1, (P.t - REAL.FLIGHT.WARP_SPOOL)/P.cruise) : 0,
      canRetarget: !IN_PASSAGE[REAL.phase], tLeft: null,
      pending: REAL.pendingNext ? li(REAL.pendingNext) : null,
      route: REAL.visited.map(li), hero: { name: md.name, type: md.arch, reg: md.reg } };
  };
  C.shipsInfo = function(){
    const md = model(), f = new THREE.Vector3(0, 0, -1).applyQuaternion(shipRig.quaternion);
    return [{ uid: 1, name: md.name, type: md.arch, model: SHIP_ID, reg: md.reg, len: SHIP_GAME_LEN, pos: shipRig.position.toArray(), fwd: f.toArray(),
      hero: true, subj: true, craft: false, seg: PHASE[REAL.phase] || 'orbit', thr: REAL.throttle || 0 }];
  };
  /* portée du §23 : les 24 étoiles les plus proches, dans un cube de 5 cellules autour de la position galactique */
  function inRange(cell){
    const p = REAL.galPos, cx = Math.round(p.x/STAR_CELL), cy = Math.round(p.y/STAR_CELL), cz = Math.round(p.z/STAR_CELL), list = [];
    for(let dx = -STAR_MAP_RADIUS; dx <= STAR_MAP_RADIUS; dx++) for(let dy = -STAR_MAP_RADIUS; dy <= STAR_MAP_RADIUS; dy++) for(let dz = -STAR_MAP_RADIUS; dz <= STAR_MAP_RADIUS; dz++){
      const d = starDataForCell(cx + dx, cy + dy, cz + dz); if(d && d.cell !== REAL.leg.cell) list.push([d.position.distanceTo(p), d.cell]); }
    list.sort((a, b) => a[0] - b[0]);
    return list.slice(0, STAR_MAP_MAX_CANDIDATES).some(e => e[1] === cell);
  }
  C.setNextStar = function(cell){
    const c = String(cell).split(',').map(Number), sd = starDataForCell(c[0], c[1], c[2]); if(!sd) return 'invalid';
    if(sd.cell === REAL.leg.cell) return 'current';
    if(!hasQuantumJump) return 'locked';
    if(!inRange(sd.cell)) return 'range';
    const cost = quantumJumpFuelCost(sd.position.distanceTo(REAL.leg.gal));
    if(fuel < cost) return 'fuel';
    const cur = REAL.nextTarget(); if(cur && cur.cell === sd.cell) return 'same';
    const g = { name: sd.name, designation: sd.star.designation, starPosition: sd.position.clone(), cell: sd.cell, star: sd.star };
    if(IN_PASSAGE[REAL.phase]){ REAL.pendingNext = g; C.pendingStar = { cell: sd.cell }; return 'next'; }
    REAL.nextOverride = g; C.pendingStar = null; return 'now';
  };
  function nearestStarTo(P){ const cx = Math.round(P.x/STAR_CELL), cy = Math.round(P.y/STAR_CELL), cz = Math.round(P.z/STAR_CELL); let best = null, bd = Infinity;
    for(let i = -2; i <= 2; i++) for(let j = -2; j <= 2; j++) for(let k = -2; k <= 2; k++){ const sd = starDataForCell(cx + i, cy + j, cz + k);
      if(!sd || sd.cell === REAL.leg.cell) continue; const d = sd.position.distanceTo(P); if(d < bd){ bd = d; best = sd; } }
    return best; }
  C.focus = function(t){
    if(!t || !REAL.leg) return 'none';
    const cur = t.cell === REAL.leg.cell;
    if(['star', 'planet', 'moon', 'belt'].includes(t.kind) && !cur) return 'next:' + C.setNextStar(t.cell);
    if(t.kind === 'nebula'){ const sd = nearestStarTo(new THREE.Vector3().fromArray(t.gal)); return sd ? 'next:' + C.setNextStar(sd.cell) + ':' + sd.name : 'none'; }
    return 'none';
  };
  /* bandeau de confirmation (la démo affiche ses retours par __DEMO.toast) */
  let toastEl = null, toastT = 0;
  window.__DEMO = window.__DEMO || {};
  window.__DEMO.toast = function(html){
    if(!toastEl){ toastEl = document.createElement('div'); toastEl.className = 'mono';
      toastEl.style.cssText = 'position:fixed;left:50%;top:64px;transform:translateX(-50%);z-index:13;padding:9px 16px;font-size:12px;letter-spacing:.04em;color:#e8edf5;background:rgba(15,26,48,.94);border:1px solid #25375c;border-left:2px solid #ffb454;pointer-events:none;opacity:0;transition:opacity .25s ease';
      document.body.appendChild(toastEl); }
    toastEl.innerHTML = html; toastEl.style.opacity = '1'; clearTimeout(toastT); toastT = setTimeout(() => { toastEl.style.opacity = '0'; }, 3200);
  };
  /* clavier : la carte ouverte capte ses touches avant le pilotage */
  window.addEventListener('keydown', function(e){
    if(window.__STARMAP && __STARMAP.isOpen() && __STARMAP.key(e)){ e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  return { C: C };
})();
