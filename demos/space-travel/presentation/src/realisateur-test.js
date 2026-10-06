/* =====================================================================
   DÉMONSTRATION DU RÉALISATEUR CÉLESTE (lot P2) — lecture automatique, plein écran
   ?seed=XXX : graine de l'univers (défaut COSMOS) · ?rz=YYY : graine du réalisateur (défaut : au hasard)
   ?quality=fixed : résolution figée (tests) · exposé pour les tests : window.__TEST
   ===================================================================== */
(function(){
'use strict';
const PARAMS = new URLSearchParams(location.search);
const SEED = PARAMS.get('seed') || 'COSMOS', FIXED = PARAMS.get('quality') === 'fixed';
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(FIXED ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
const camera = new THREE.PerspectiveCamera(40, window.innerWidth/window.innerHeight, 1, 1e20);
window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight); camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); });

const W = __COSMOS.create({ seed: SEED, starDensity: PARAMS.get('density') ? +PARAMS.get('density') : 1 });
const D = __REALISATEUR.create(W, camera, { seed: PARAMS.get('rz') || undefined, systems: 6 });

const fadeEl = document.getElementById('fade'), hud = document.getElementById('hud'), zone = document.getElementById('textzone');
const SIDES = ['auto', 'left', 'right', 'center'];
function placeZone(){
  const f = D.framing; zone.style.left = f === 'right' ? '' : '6%'; zone.style.right = f === 'right' ? '6%' : '';
  if(f === 'center'){ zone.style.left = '35%'; zone.style.right = ''; }
}
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if(k === ' '){ e.preventDefault(); D.cut(); }
  else if(k === 'n') D.nextSystem();
  else if(k === 'f'){ D.setFraming(SIDES[(SIDES.indexOf(D.framing) + 1) % SIDES.length]); placeZone(); }
  else if(k === 't'){ zone.style.display = zone.style.display === 'block' ? 'none' : 'block'; placeZone(); }
  else if(k === 'h') document.body.classList.toggle('nohud');
});
const fmtD = m => m > 1e15 ? '∞' : m < 1e4 ? Math.round(m) + ' m' : m < 1e9 ? Math.round(m/1e3).toLocaleString('fr-FR') + ' km' : (m/__COSMOS.UNITS.AU).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' ua';
let hudT = 0, fps = 60;
function drawHud(dt){
  hudT += dt; if(hudT < .2) return; hudT = 0;
  const m = D.meta; if(!m.type) return;
  hud.innerHTML = `<b>RÉALISATEUR</b> <span class="dim">univers</span> ${SEED} · <span class="dim">réalisateur</span> ${D.seed}<br>` +
    `<b>${m.system}</b> <span class="dim">· système ${D.sysIdx + 1}/${D.systems.length} · plan ${m.shot + 1}/${m.shots}</span><br>` +
    `<span class="amb">${m.label}</span> — ${m.subject} · <span class="dim">${(m.k*100).toFixed(0)} %</span><br>` +
    `<span class="dim">focale</span> ${m.focal} mm · <span class="dim">point</span> ${fmtD(m.focus)}${m.near !== null ? ' <span class="dim">(1er plan ' + fmtD(m.near) + ', bascule ' + Math.round(m.rack*100) + ' %)</span>' : ''}<br>` +
    `<span class="dim">étoile</span> ${m.star.onScreen ? 'à l’écran' : 'hors champ'}, visible ${Math.round(m.star.vis*100)} % · <span class="dim">tiers</span> ${m.side > 0 ? 'droit' : m.side < 0 ? 'gauche' : 'centre'} · <span class="dim">${Math.round(fps)} i/s</span>`;
}
let last = performance.now();
function frame(){
  requestAnimationFrame(frame);
  const now = performance.now(), dt = Math.min((now - last)/1000, .1); last = now;
  if(dt > 0) fps = fps*.9 + (1/dt)*.1;
  D.update(dt);
  W.update(dt, camera, renderer);
  if(!window.__SKIP_RENDER) W.render(renderer, camera);
  fadeEl.style.opacity = D.meta.fade;
  drawHud(dt);
}
requestAnimationFrame(frame);
window.__TEST = { W, D, camera, renderer, ready: true };
})();
