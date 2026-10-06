/* =====================================================================
   DÉMONSTRATION DE LA DIRECTION PHOTO (lot P3) — réalisateur + effets « Cinéma », plein écran
   ?seed=XXX : univers (défaut COSMOS) · ?rz=YYY : réalisateur et directeur photo (défaut : au hasard)
   ?look=denis|imax|kodak|kubrick : look imposé · ?crt=0..1 : probabilité du CRT à l'ouverture d'un système
   ?fx=0 : sans effet au départ · ?quality=fixed : résolution figée (tests) · exposé pour les tests : window.__TEST
   ===================================================================== */
(function(){
'use strict';
const PARAMS = new URLSearchParams(location.search);
const SEED = PARAMS.get('seed') || 'COSMOS', FIXED = PARAMS.get('quality') === 'fixed';
const canvas = document.getElementById('scene');
/* pas d'antialiasing sur le canevas : la scène est rendue dans une cible MSAA ×4, l'écran ne reçoit qu'un quad */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(FIXED ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
const camera = new THREE.PerspectiveCamera(40, window.innerWidth/window.innerHeight, 1, 1e20);
window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight); camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); });

const RZ = PARAMS.get('rz') || String(Math.floor(Math.random()*1e9));
const W = __COSMOS.create({ seed: SEED, starDensity: PARAMS.get('density') ? +PARAMS.get('density') : 1 });
const D = __REALISATEUR.create(W, camera, { seed: RZ, systems: 6 });
const PH = __PHOTO.create(renderer, { seed: RZ, look: PARAMS.get('look') || 'auto', crtChance: PARAMS.get('crt') !== null ? +PARAMS.get('crt') : undefined });
if(PARAMS.get('fx') === '0') PH.enabled = false;

const hud = document.getElementById('hud'), zone = document.getElementById('textzone');
const SIDES = ['auto', 'left', 'right', 'center'], LOOKS = ['auto', ...Object.keys(__PHOTO.LOOKS)], BARS = [undefined, null, 2.39, 1.85];
let lookI = Math.max(0, LOOKS.indexOf(PARAMS.get('look') || 'auto')), barI = 0;
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
  else if(k === 'p') PH.enabled = !PH.enabled;
  else if(k === 'v') PH.wipe = PH.wipe ? 0 : .5;
  else if(k === 'l'){ lookI = (lookI + 1) % LOOKS.length; PH.setLook(LOOKS[lookI]); }
  else if(k === 'b'){ barI = (barI + 1) % BARS.length; PH.setLetterbox(BARS[barI]); }
  else if(k === 'd') PH.debug = PH.debug ? null : 'coc';
  else if(k === 'c') PH.forceCRT(1.6);
  else if(k === 'h') document.body.classList.toggle('nohud');
});
const fmtD = m => m > 1e15 ? '∞' : m < 1e4 ? Math.round(m) + ' m' : m < 1e9 ? Math.round(m/1e3).toLocaleString('fr-FR') + ' km' : (m/__COSMOS.UNITS.AU).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' ua';
let hudT = 0, fps = 60;
function drawHud(dt){
  hudT += dt; if(hudT < .2) return; hudT = 0;
  const m = D.meta, s = PH.state; if(!m.type) return;
  const fx = !PH.enabled ? '<span class="amb">sans effet (image du jeu)</span>' :
    `<b>${s.look ? s.look.label : '—'}</b>${lookI ? ' <span class="dim">(imposé)</span>' : ''} · <span class="dim">ouverture</span> ${Math.round(s.dof*100)} %` +
    ` · <span class="dim">flare</span> ${(s.streak + s.ghost).toFixed(2)}${s.crt > 0 ? ' · <span class="amb">CRT</span>' : ''}${PH.wipe ? ' · <span class="amb">avant | après</span>' : ''}${PH.debug ? ' · <span class="amb">carte de flou</span>' : ''}`;
  hud.innerHTML = `<b>DIRECTION PHOTO</b> <span class="dim">univers</span> ${SEED} · <span class="dim">réalisateur</span> ${RZ}<br>` +
    `<b>${m.system}</b> <span class="dim">· système ${D.sysIdx + 1}/${D.systems.length} · plan ${m.shot + 1}/${m.shots}</span><br>` +
    `<span class="amb">${m.label}</span> — ${m.subject} · <span class="dim">${m.focal} mm · point</span> ${fmtD(m.focus)}<br>` +
    `${fx}<br><span class="dim">${PH.passes} passes · ${Math.round(fps)} i/s</span>`;
}
let last = performance.now();
function frame(){
  requestAnimationFrame(frame);
  const now = performance.now(), dt = Math.min((now - last)/1000, .1); last = now;
  if(dt > 0) fps = fps*.9 + (1/dt)*.1;
  D.update(dt);
  W.update(dt, camera, renderer);
  if(!window.__SKIP_RENDER) PH.render(W, camera, D.meta, dt); else PH.update(D.meta, dt);
  drawHud(dt);
}
requestAnimationFrame(frame);
window.__TEST = { W, D, PH, camera, renderer, ready: true };
})();
