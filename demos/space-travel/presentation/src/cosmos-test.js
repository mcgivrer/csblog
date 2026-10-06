/* =====================================================================
   VISIONNEUSE DE TEST DU MOTEUR ALLÉGÉ (lot P1)
   Un système complet de shared/cosmos.js, caméra libre en orbite autour de l'astre choisi.
   ?seed=XXX : graine (même univers que le jeu) · ?quality=fixed : résolution figée (tests, captures)
   Exposé pour les tests : window.__TEST
   ===================================================================== */
(function(){
'use strict';
const V3 = THREE.Vector3, CO = window.__COSMOS, U = CO.UNITS;
const PARAMS = new URLSearchParams(location.search);
const SEED = PARAMS.get('seed') || 'COSMOS';
const FIXED = PARAMS.get('quality') === 'fixed';
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smoother = x => { x = clamp(x, 0, 1); return x*x*x*(x*(6*x - 15) + 10); };

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(FIXED ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const camera = new THREE.PerspectiveCamera(50, window.innerWidth/window.innerHeight, 1, 1e20);
window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight); camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); });

const W = CO.create({ seed: SEED, starDensity: PARAMS.get('density') ? +PARAMS.get('density') : 1 });
const systems = W.pickSystems(6, 2);
const S = { sys: 0, focus: null, from: null, t: 1, dur: 2.6, yaw: .6, pitch: .22, dist: 1, idle: 0, cluster: null, moonIdx: -1, fps: 60 };

/* ---------- cibles ---------- */
function targetOf(key){
  const leg = W.leg; if(!leg) return null;
  if(key === 'star') return { key, label: leg.name + ' (' + leg.designation + ')', pos: () => new V3(), r: leg.Rs, dist: 14*leg.Rs };
  if(key.startsWith('planet:')){
    const p = leg.planets[+key.split(':')[1]]; if(!p) return null;
    return { key, label: p.properName + ' — ' + p.kind.name + (p.hasRings ? ', anneaux' : '') + (p.moonPivots.length ? ', ' + p.moonPivots.length + ' lune(s)' : ''),
             pos: () => p.position.clone(), r: p.radius, dist: p.radius*(p.hasRings ? 7 : 3.6) };
  }
  if(key.startsWith('moon:')){
    const [, pi, mi] = key.split(':').map(Number), p = leg.planets[pi], pv = p && p.moonPivots[mi], m = pv && pv.children[0]; if(!m) return null;
    return { key, label: pv.userData.moonName + ' (lune)', pos: () => m.getWorldPosition(new V3()), r: m.scale.x, dist: m.scale.x*7 };
  }
  if(key === 'belt' && S.cluster){ const c = S.cluster; return { key, label: 'Amas d’astéroïdes' + (W.leg.beltInfo ? ' de la ceinture' : ''), pos: () => c.position.clone(), r: c.R, dist: c.R*9 }; }
  return null;
}
function focus(key, instant){
  const tg = targetOf(key); if(!tg) return false;
  S.from = S.focus ? { pos: camera.position.clone(), look: S.focus.pos(), dist: S.dist } : null;
  S.focus = tg; S.t = instant ? 1 : 0; S.dist = tg.dist;
  /* éclairage de trois quarts : la caméra se place du côté de l'étoile, décalée de ~40° (jamais à contre-jour par défaut) */
  const c = tg.pos();
  if(key !== 'star' && c.lengthSq() > 1){
    const B = basis(), toSun = c.clone().negate().normalize();
    S.yaw = Math.atan2(toSun.dot(B.l), toSun.dot(B.s)) + .7; S.pitch = .18;
  }
  return true;
}
function basis(){
  const N = W.leg.orbitN, ref = Math.abs(N.y) < .9 ? new V3(0, 1, 0) : new V3(1, 0, 0);
  const s = new V3().crossVectors(ref, N).normalize(); return { s, l: new V3().crossVectors(N, s), N };
}
function enter(i){
  S.sys = (i + systems.length) % systems.length;
  W.enter(systems[S.sys].cell);
  S.cluster = null; S.moonIdx = -1; S.focus = null;
  focus('star', true);
}

/* ---------- caméra en orbite autour de la cible, transitions en distance logarithmique ---------- */
function orbitPos(center, dist){
  const { s, l, N } = basis(), cp = Math.cos(S.pitch);
  return center.clone().addScaledVector(s, Math.cos(S.yaw)*cp*dist).addScaledVector(l, Math.sin(S.yaw)*cp*dist).addScaledVector(N, Math.sin(S.pitch)*dist);
}
function updateCamera(dt){
  if(!S.focus) return;
  S.idle += dt; if(S.idle > 2.5) S.yaw += dt*.035;
  const c = S.focus.pos(), want = orbitPos(c, S.dist);
  if(S.t < 1 && S.from){
    S.t = Math.min(1, S.t + dt/S.dur); const e = smoother(S.t);
    const d0 = Math.max(S.from.pos.distanceTo(want), 1), dl = Math.exp(Math.log(d0)*(1 - e));          /* distance restante en échelle logarithmique */
    camera.position.copy(want).addScaledVector(S.from.pos.clone().sub(want).normalize(), e >= 1 ? 0 : dl - (1 - e));
    camera.up.copy(W.leg.orbitN); camera.lookAt(S.from.look.clone().lerp(c, smoother(clamp(S.t*1.6, 0, 1))));
  } else {
    camera.position.copy(want); camera.up.copy(W.leg.orbitN); camera.lookAt(c);
  }
}

/* ---------- commandes ---------- */
let drag = null;
canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; S.idle = 0; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => { if(!drag) return; S.yaw -= (e.clientX - drag.x)*.005; S.pitch = clamp(S.pitch + (e.clientY - drag.y)*.004, -1.45, 1.45); drag = { x: e.clientX, y: e.clientY }; S.idle = 0; });
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('wheel', e => { e.preventDefault(); if(!S.focus) return; S.dist = clamp(S.dist*Math.exp(e.deltaY*.0012), S.focus.r*1.15, S.focus.r*4e4); S.idle = 0; }, { passive: false });
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase(), leg = W.leg; if(!leg) return;
  if(k === '0') focus('star');
  else if(k >= '1' && k <= '9') focus('planet:' + (+k - 1));
  else if(k === 'l'){
    const pi = S.focus && S.focus.key.startsWith('planet:') ? +S.focus.key.split(':')[1] : S.focus && S.focus.key.startsWith('moon:') ? +S.focus.key.split(':')[1] : leg.planets.findIndex(p => p.moonPivots.length);
    const p = leg.planets[pi]; if(p && p.moonPivots.length){ S.moonIdx = (S.moonIdx + 1) % p.moonPivots.length; focus('moon:' + pi + ':' + S.moonIdx); }
  }
  else if(k === 'a'){ if(!S.cluster) S.cluster = W.beltCluster(.7); focus('belt'); }
  else if(k === 'n') enter(S.sys + 1);
  else if(k === 'p') enter(S.sys - 1);
  else if(k === 'f'){ const f = [24, 35, 50, 85, 135]; camera.fov = f[(f.indexOf(camera.fov) + 1) % f.length] || 50; camera.updateProjectionMatrix(); }
  else if(k === 'h') document.body.classList.toggle('nohud');
});

/* ---------- HUD ---------- */
const hud = document.getElementById('hud');
const fmtD = m => m < 1e9 ? Math.round(m/1e3).toLocaleString('fr-FR') + ' km' : (m/U.AU).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' ua';
let hudT = 0;
function drawHud(dt){
  hudT += dt; if(hudT < .25) return; hudT = 0;
  const leg = W.leg, sys = systems[S.sys];
  hud.innerHTML = `<b>COSMOS</b> <span class="dim">graine</span> ${SEED} · <span class="dim">système ${S.sys + 1}/${systems.length}, score</span> ${sys.score.toFixed(1)}<br>` +
    `<b>${leg.name}</b> <span class="dim">${leg.designation} · ${Math.round(leg.star.temp)} K · ${leg.planets.length} planètes${leg.beltInfo ? ' · ceinture' : ''}</span><br>` +
    `<span class="dim">cible</span> ${S.focus ? S.focus.label : '—'} · <span class="dim">distance</span> ${S.focus ? fmtD(camera.position.distanceTo(S.focus.pos())) : '—'}<br>` +
    `<span class="dim">${Math.round(S.fps)} i/s · ${W.stats.calls} appels · ${W.stats.slices} tranches · focale ${camera.fov}°</span>`;
}

/* ---------- boucle ---------- */
let last = performance.now();
function frame(){
  requestAnimationFrame(frame);
  const now = performance.now(), dt = Math.min((now - last)/1000, .1); last = now;
  if(dt > 0) S.fps = S.fps*.9 + (1/dt)*.1;
  updateCamera(dt);
  W.update(dt, camera, renderer);
  W.render(renderer, camera);
  drawHud(dt);
}
enter(0);
document.getElementById('boot').classList.add('off');
requestAnimationFrame(frame);
window.__TEST = { W, camera, renderer, systems, state: S, focus, enter, ready: true };
})();
