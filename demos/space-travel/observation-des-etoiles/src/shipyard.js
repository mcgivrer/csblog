/* =====================================================================
   CHANTIER — TOUS LES VAISSEAUX (v7.18) — window.__YARD
   Catalogue complet (23 types : 10 modèles du jeu et la navette de fret, 6 petits engins, 4 militaires, 2 porte-vaisseaux),
   vignettes générées au fil de l'eau, aperçu 3D tournant, curseurs ÂGE (temps : peinture passée, crasse, rouille, coulures)
   et USURE (service : éclats, rayures, bosses, suie, tôles remplacées, tuyères bleuies) réglés en direct sur le shader d'usure.
   Pendant l'ouverture, la démo est figée ; l'aperçu est rendu par le moteur de rendu de la démo (mêmes programmes GPU :
   même jeu de lumières — ambiante, directionnelle, ponctuelle —, aucune recompilation) dans un coin de son canevas,
   puis copié dans le canevas du dialogue. « USE THIS SHIP » : le vaisseau rejoint l'orbite avec cet aspect.
   ===================================================================== */
(function(){
'use strict';
const C = window.__CINE; if(!C || !C.catalog || !window.THREE) return;
const V3 = THREE.Vector3;
const FAM = [['civil', 'FREIGHTERS · TUGS · LINERS'], ['craft', 'SMALL CRAFT'], ['mil', 'MILITARY'], ['carrier', 'SHIP CARRIERS']];
const PRESETS = [['NEW', 0, 0], ['IN SERVICE', .38, .42], ['OLD, CARED FOR', .85, .18], ['HARD-WORKED', .25, .9], ['WRECK', 1, 1]];
const FACS = [['coalition', 'COALITION'], ['league', 'LEAGUE'], ['irregular', 'IRREGULARS']];
const DRIVES = [['both', 'JUMP + WARP', null], ['jump', 'JUMP ONLY', { warp: false }], ['warp', 'WARP ONLY', { jump: false }]];
const ageTxt = a => a < .12 ? 'factory new' : a < .32 ? 'seasoned' : a < .6 ? 'weathered' : a < .82 ? 'old' : 'end of life';
const wearTxt = w => w < .1 ? 'pristine' : w < .35 ? 'light use' : w < .65 ? 'worn' : w < .85 ? 'battered' : 'wrecked';
const hash = s => { let h = 7; for(const c of s) h = (h*31 + c.charCodeAt(0)) >>> 0; return h % 99991 + 11; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmtLen = m => m >= 100 ? Math.round(m) + ' m' : (m >= 10 ? m.toFixed(0) + ' m' : m.toFixed(1) + ' m');

const S = { open: false, cat: null, sel: null, look: { age: .35, wear: .35, seed: 7, faction: 'coalition', drive: 'both' }, cur: null, thumbs: {}, lens: {}, queue: [],
  yaw: -.75, pitch: .22, zoom: 1, drag: null, lastT: 0, idleT: 0, cb: null, focusBack: null, ms: 0, frames: 0, dirty: true };
let root, bgC, viewC, listEl, infoEl, ageIn, wearIn, ageOut, wearOut, facEl, drvEl, useBtn;
/* ---------- scène d'aperçu : mêmes types de lumières que la scène de la démo (programmes GPU partagés) ---------- */
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 16/10, 1, 1e5);
const amb = new THREE.AmbientLight(0x2a3450, .9), key = new THREE.DirectionalLight(0xfff0dc, 2.1), rim = new THREE.PointLight(0x8fb8ff, 0, 0, 2);
scene.add(amb, key, key.target, rim);
const stars = (() => { const n = 500, p = new Float32Array(n*3); for(let i = 0; i < n; i++){ const z = Math.random()*2 - 1, a = Math.random()*6.283, r = Math.sqrt(1 - z*z); p.set([Math.cos(a)*r, z, Math.sin(a)*r], i*3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9fb2d6, size: 1.4, sizeAttenuation: false, transparent: true, opacity: .55, depthWrite: false })); })();
scene.add(stars);
let grid = null, gridStep = 10, shipR = 10;
function niceStep(len){ const t = len/10; for(const s of [.5, 1, 2, 5, 10, 20, 50, 100, 200]) if(s >= t) return s; return 200; }
function frameShip(obj){                                                       // cadrage, grille à l'échelle, étoiles, lumière d'appoint
  const bx = new THREE.Box3().setFromObject(obj), sz = bx.getSize(new V3()); shipR = Math.max(1, sz.length()/2);
  if(grid){ scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
  const len = Math.max(sz.x, sz.z); gridStep = niceStep(len); const n = Math.ceil(len*1.6/gridStep/2)*2 + 4;
  grid = new THREE.GridHelper(n*gridStep, n, 0x5eead4, 0x25375c); grid.material.transparent = true; grid.material.opacity = .32; grid.material.depthWrite = false; grid.position.y = bx.min.y - shipR*.06; scene.add(grid);
  stars.scale.setScalar(shipR*60); camera.near = shipR/60; camera.far = shipR*120; camera.updateProjectionMatrix();
  rim.distance = shipR*8; rim.intensity = 3; rim.position.set(-shipR*2.2, shipR*1.2, -shipR*2.4);
  key.position.set(shipR*3, shipR*2.4, shipR*1.8); key.target.position.set(0, 0, 0);
}
function place(yaw, pitch, zoom){ const d = shipR/Math.sin(camera.fov*Math.PI/360)*.74*zoom; camera.position.set(Math.sin(yaw)*Math.cos(pitch)*d, Math.sin(pitch)*d, Math.cos(yaw)*Math.cos(pitch)*d); camera.lookAt(0, 0, 0); }   // vaisseaux allongés vus de trois quarts : cadrage serré
/* rendu dans le coin bas-gauche du canevas de la démo, puis copie dans un canevas 2D (vignette ou vue) */
const _v4a = new THREE.Vector4(), _v4b = new THREE.Vector4(), _cc = new THREE.Color();
function renderTo(dst){
  const R = typeof renderer !== 'undefined' ? renderer : null; if(!R) return false; const cv = R.domElement, pr = R.getPixelRatio(), W = Math.min(dst.width, cv.width), H = Math.min(dst.height, cv.height); if(W < 2 || H < 2) return false;
  camera.aspect = W/H; camera.updateProjectionMatrix();
  R.getViewport(_v4a); R.getScissor(_v4b); const st = R.getScissorTest(), ac = R.autoClear; R.getClearColor(_cc); const ca = R.getClearAlpha(), rt = R.getRenderTarget();
  const GL = window.__SHIPGLASS && __SHIPGLASS.U, H0 = window.__SHIPWEAR && __SHIPWEAR.HOLD, hw = H0 && H0.uHoldH ? H0.uHoldH.value.w : null;
  if(GL){ GL.uSunDir.value.copy(key.position).normalize(); GL.uSunCol.value.setRGB(1, .95, .88); GL.uSunI.value = 1; }   // vitrages : soleil de l'aperçu
  if(hw !== null) H0.uHoldH.value.w = 0;                                          // pas d'ombre de soute d'un porteur de la démo
  R.setRenderTarget(null); R.setViewport(0, 0, W/pr, H/pr); R.setScissor(0, 0, W/pr, H/pr); R.setScissorTest(true); R.setClearColor(0x080e1b, 1); R.autoClear = true;
  try { R.render(scene, camera); dst.getContext('2d').drawImage(cv, 0, cv.height - H, W, H, 0, 0, dst.width, dst.height); }
  finally { R.setViewport(_v4a); R.setScissor(_v4b); R.setScissorTest(st); R.autoClear = ac; R.setClearColor(_cc, ca); R.setRenderTarget(rt); if(hw !== null) H0.uHoldH.value.w = hw; }
  return true;
}
/* ---------- DOM ---------- */
function build(){
  const css = document.createElement('style');
  css.textContent =
  "#sttYard{position:fixed;inset:0;z-index:15;display:none;font-family:'JetBrains Mono',monospace;color:#e8edf5}#sttYard.on{display:block}" +
  "#sttYard .bg{position:absolute;inset:0;width:100%;height:100%;filter:blur(7px) brightness(.4) saturate(1.1);transform:scale(1.03)}" +
  "#sttYard .bx{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(1180px,96vw);height:min(740px,94vh);display:flex;flex-direction:column;background:rgba(11,18,32,.93);border:1px solid #25375c;border-left:2px solid #ffb454}" +
  "#sttYard header{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #25375c;font-size:11px;letter-spacing:.14em;color:#ffb454}#sttYard header .n{color:#8ea0c4}#sttYard header .x{margin-left:auto}" +
  "#sttYard .mn{flex:1;display:flex;min-height:0}#sttYard .ls{width:46%;overflow:auto;padding:10px 12px 16px;border-right:1px solid #25375c}" +
  "#sttYard .fh{font-size:10px;letter-spacing:.14em;color:#5eead4;margin:12px 2px 8px}#sttYard .fh:first-child{margin-top:4px}" +
  "#sttYard .gr{display:grid;grid-template-columns:repeat(auto-fill,minmax(146px,1fr));gap:8px}" +
  "#sttYard .cd{display:block;text-align:left;padding:0 0 7px;background:#0f1a30;border:1px solid #25375c;color:#e8edf5;font:inherit;cursor:pointer;min-width:0}" +
  "#sttYard .cd canvas{display:block;width:100%;aspect-ratio:16/9;background:#080e1b}#sttYard .cd b{display:block;font-size:11px;letter-spacing:.04em;margin:6px 8px 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
  "#sttYard .cd span{display:block;font-size:10px;color:#8ea0c4;margin:0 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
  "#sttYard .cd:hover,#sttYard .cd:focus-visible{border-color:#8ea0c4;outline:none}#sttYard .cd.sel{border-color:#ffb454;box-shadow:inset 0 0 0 1px #ffb454}#sttYard .cd.sel b{color:#ffb454}" +
  "#sttYard .sd{width:54%;display:flex;flex-direction:column;min-height:0;overflow:auto}#sttYard .vw{position:relative;flex:0 0 auto;aspect-ratio:16/10;max-height:52%;background:#080e1b;border-bottom:1px solid #25375c}" +
  "#sttYard .vw canvas{position:absolute;inset:0;width:100%;height:100%;cursor:grab;touch-action:none}#sttYard .vw canvas:active{cursor:grabbing}" +
  "#sttYard .vw .sc,#sttYard .vw .hi{position:absolute;font-size:10px;letter-spacing:.1em;color:#8ea0c4;pointer-events:none}#sttYard .vw .sc{left:10px;bottom:8px;color:#5eead4}#sttYard .vw .hi{right:10px;bottom:8px}" +
  "#sttYard .vw .bz{position:absolute;left:10px;top:8px;font-size:10px;letter-spacing:.1em;color:#ffb454;pointer-events:none}" +
  "#sttYard .in{padding:12px 16px 4px}#sttYard .in .t{font-size:15px;font-weight:700;letter-spacing:.03em}#sttYard .in .c{font-size:11px;color:#8ea0c4;margin-top:4px}" +
  "#sttYard .sl{padding:6px 16px 0}#sttYard .sl label{display:flex;justify-content:space-between;font-size:11px;letter-spacing:.12em;margin-top:10px}#sttYard .sl output{color:#ffb454;letter-spacing:.04em}" +
  "#sttYard .sl input{width:100%;margin:6px 0 2px;accent-color:#ffb454}#sttYard .sl .lg{font-size:10px;color:#5d6f92;line-height:1.4}" +
  "#sttYard .rw{display:flex;flex-wrap:wrap;gap:6px;padding:10px 16px 0}#sttYard .rw .lb{width:100%;font-size:10px;letter-spacing:.12em;color:#8ea0c4}" +
  "#sttYard .rw button{padding:6px 9px;background:#0f1a30;border:1px solid #25375c;color:#e8edf5;font:inherit;font-size:10px;letter-spacing:.08em;cursor:pointer}#sttYard .rw button[aria-pressed=true]{border-color:#5eead4;color:#5eead4}" +
  "#sttYard .rw button:hover,#sttYard .rw button:focus-visible{border-color:#8ea0c4;outline:none}" +
  "#sttYard .ac{display:flex;gap:8px;padding:14px 16px 16px;margin-top:auto;position:sticky;bottom:0;background:rgba(11,18,32,.97)}#sttYard .ac button{flex:1;padding:11px;font:inherit;font-size:12px;letter-spacing:.1em;cursor:pointer;background:#0f1a30;border:1px solid #25375c;color:#8ea0c4}" +
  "#sttYard .ac .use{color:#0b1220;background:#ffb454;border-color:#ffb454;font-weight:700}#sttYard .ac button:focus-visible,#sttYard header .x:focus-visible{outline:2px solid #5eead4;outline-offset:2px}" +
  "#sttYard header .x{background:none;border:1px solid #25375c;color:#8ea0c4;font:inherit;font-size:11px;padding:4px 9px;cursor:pointer}" +
  "@media (max-width:760px){#sttYard .bx{width:100vw;height:100vh;height:100dvh;border-left:0}#sttYard header{font-size:10px;padding:10px 12px}#sttYard .mn{flex-direction:column;overflow:auto;padding-bottom:64px}" +
  "#sttYard .ls{width:auto;flex:0 0 auto;overflow:visible;border-right:0;order:2}#sttYard .sd{width:auto;flex:0 0 auto;overflow:visible;order:1}#sttYard .vw{max-height:none}" +
  "#sttYard .gr{grid-template-columns:repeat(auto-fill,minmax(130px,1fr))}#sttYard .ac{position:fixed;left:0;right:0;bottom:0;z-index:2;padding:10px 12px;border-top:1px solid #25375c}}" +
  "@media (prefers-reduced-motion: reduce){#sttYard .bg{filter:brightness(.35)}}";
  document.head.appendChild(css);
  root = document.createElement('div'); root.id = 'sttYard'; root.className = 'demo-ui'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Shipyard — all ships');
  root.innerHTML = '<canvas class="bg" aria-hidden="true"></canvas><div class="bx"><header>// SHIPYARD · ALL SHIPS <span class="n"></span><button type="button" class="x" data-a="cancel">CLOSE · Esc</button></header>' +
    '<div class="mn"><div class="ls" role="listbox" aria-label="Ship types"></div><div class="sd"><div class="vw"><canvas aria-label="3D preview — drag to rotate"></canvas><div class="bz"></div><div class="sc"></div><div class="hi">DRAG · WHEEL</div></div>' +
    '<div class="in" aria-live="polite"><div class="t"></div><div class="c"></div></div>' +
    '<div class="sl"><label for="ydAge">AGE <output id="ydAgeO"></output></label><input id="ydAge" type="range" min="0" max="100" step="1"><div class="lg">Time: faded, yellowed paint, grime, rust from the plate seams, streaks towards the stern.</div>' +
    '<label for="ydWear">WEAR <output id="ydWearO"></output></label><input id="ydWear" type="range" min="0" max="100" step="1"><div class="lg">Use: paint chips down to bare metal, scratches, dents, soot around the nozzles, replaced plates, heat-blued nozzles.</div></div>' +
    '<div class="rw pr"><span class="lb">PRESETS</span></div><div class="rw fc"><span class="lb">FACTION</span></div><div class="rw dv"><span class="lb">DRIVES</span></div>' +
    '<div class="rw vr"><span class="lb">HULL</span><button type="button" data-a="seed">↻ ANOTHER HULL / LIVERY</button></div>' +
    '<div class="ac"><button type="button" data-a="cancel">CANCEL</button><button type="button" class="use" data-a="use">USE THIS SHIP</button></div></div></div></div>';
  (document.body || document.documentElement).appendChild(root);
  bgC = root.querySelector('canvas.bg'); viewC = root.querySelector('.vw canvas'); listEl = root.querySelector('.ls'); infoEl = root.querySelector('.in');
  ageIn = root.querySelector('#ydAge'); wearIn = root.querySelector('#ydWear'); ageOut = root.querySelector('#ydAgeO'); wearOut = root.querySelector('#ydWearO'); useBtn = root.querySelector('.use');
  facEl = root.querySelector('.rw.fc'); drvEl = root.querySelector('.rw.dv');
  const pr = root.querySelector('.rw.pr'); PRESETS.forEach(([n, a, w]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = n; b.title = 'age ' + Math.round(a*100) + ' % · wear ' + Math.round(w*100) + ' %'; b.addEventListener('click', () => setLook(a, w)); pr.appendChild(b); });
  FACS.forEach(([k, n]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = n; b.dataset.k = k; b.addEventListener('click', () => { S.look.faction = k; syncOpts(); rebuild(); }); facEl.appendChild(b); });
  DRIVES.forEach(([k, n]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = n; b.dataset.k = k; b.addEventListener('click', () => { S.look.drive = k; syncOpts(); rebuild(); }); drvEl.appendChild(b); });
  ageIn.addEventListener('input', () => setLook(+ageIn.value/100, null)); wearIn.addEventListener('input', () => setLook(null, +wearIn.value/100));
  root.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if(!b) return; const a = b.dataset.a;
    if(a === 'cancel') close(null); else if(a === 'use') close(S.sel); else if(a === 'seed'){ S.look.seed = (S.look.seed*48271 + 17) % 99991 + 11; rebuild(); } });
  listEl.addEventListener('keydown', e => { const cards = [...listEl.querySelectorAll('.cd')], i = cards.indexOf(document.activeElement); if(i < 0) return;
    const cols = Math.max(1, Math.round(listEl.querySelector('.gr').clientWidth/(cards[0].offsetWidth + 8)));
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key]; if(!d) return; e.preventDefault(); const j = Math.max(0, Math.min(cards.length - 1, i + d)); cards[j].focus(); pick(cards[j].dataset.id); });
  viewC.addEventListener('pointerdown', e => { S.drag = { x: e.clientX, y: e.clientY, yaw: S.yaw, pitch: S.pitch }; viewC.setPointerCapture && viewC.setPointerCapture(e.pointerId); });
  viewC.addEventListener('pointermove', e => { if(!S.drag) return; S.yaw = S.drag.yaw - (e.clientX - S.drag.x)*.008; S.pitch = Math.max(-1.2, Math.min(1.35, S.drag.pitch + (e.clientY - S.drag.y)*.006)); S.idleT = 0; });
  ['pointerup', 'pointercancel'].forEach(ev => viewC.addEventListener(ev, () => { S.drag = null; S.idleT = 0; }));
  viewC.addEventListener('wheel', e => { e.preventDefault(); S.zoom = Math.max(.45, Math.min(2.6, S.zoom*Math.exp(e.deltaY*.0012))); S.idleT = 0; }, { passive: false });
}
function list(){
  S.cat = C.catalog(); root.querySelector('header .n').textContent = S.cat.length + ' TYPES';
  listEl.innerHTML = FAM.map(([f, name]) => '<div class="fh">' + name + '</div><div class="gr">' + S.cat.filter(e => e.fam === f).map(e =>
    '<button type="button" class="cd" role="option" aria-selected="false" data-id="' + e.id + '"><canvas width="256" height="144"></canvas><b>' + esc(e.type) + '</b><span>' + esc(e.cls) + ' · <i data-len>—</i></span></button>').join('') + '</div>').join('');
  listEl.querySelectorAll('.cd').forEach(b => b.addEventListener('click', () => pick(b.dataset.id)));
  S.queue = S.cat.map(e => e.id).filter(id => !S.thumbs[id]);
  Object.keys(S.thumbs).forEach(id => { const c = card(id); if(c){ c.querySelector('canvas').getContext('2d').drawImage(S.thumbs[id], 0, 0); c.querySelector('[data-len]').textContent = fmtLen(S.lens[id]); } });
}
const card = id => listEl.querySelector('.cd[data-id="' + id + '"]');
const entry = id => S.cat.find(e => e.id === id);
function syncOpts(){
  const e = entry(S.sel); facEl.style.display = e && e.faction ? '' : 'none'; drvEl.style.display = e && e.ftl && e.fam === 'civil' ? '' : 'none';
  facEl.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === S.look.faction ? 'true' : 'false'));
  drvEl.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === S.look.drive ? 'true' : 'false'));
}
function setLook(a, w){
  if(a != null) S.look.age = a; if(w != null) S.look.wear = w;
  ageIn.value = Math.round(S.look.age*100); wearIn.value = Math.round(S.look.wear*100);
  ageOut.textContent = Math.round(S.look.age*100) + ' % · ' + ageTxt(S.look.age); wearOut.textContent = Math.round(S.look.wear*100) + ' % · ' + wearTxt(S.look.wear);
  const U = S.cur && S.cur.U; if(U){ U.uAge.value = S.look.age; if(U.uWear) U.uWear.value = S.look.wear; } S.dirty = true;
}
function pick(id){
  if(!entry(id)) return; if(S.sel !== id){ S.look.seed = hash(id); S.look.drive = 'both'; }
  S.sel = id; listEl.querySelectorAll('.cd').forEach(b => { const on = b.dataset.id === id; b.classList.toggle('sel', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
  syncOpts(); rebuild();
}
function lookArg(){ const d = DRIVES.find(x => x[0] === S.look.drive); return { age: S.look.age, wear: S.look.wear, seed: S.look.seed, faction: S.look.faction, drive: d ? d[2] : null }; }
function rebuild(){
  const e = entry(S.sel); if(!e) return;
  if(S.cur){ scene.remove(S.cur.root); S.cur.dispose(); S.cur = null; }
  const t0 = performance.now(); let P = null; try { P = C.previewBuild(e.id, lookArg()); } catch(err){ console.error(err); }
  S.buildMs = performance.now() - t0; if(!P) return;
  S.cur = P; scene.add(P.root); frameShip(P.root); S.zoom = 1; S.lens[e.id] = P.len; const c = card(e.id); if(c) c.querySelector('[data-len]').textContent = fmtLen(P.len);
  infoEl.querySelector('.t').textContent = e.type; infoEl.querySelector('.c').textContent = e.cls + ' · ' + fmtLen(P.len) + ' · ' + e.drives + (e.faction ? ' · ' + FACS.find(f => f[0] === S.look.faction)[1].toLowerCase() : '');
  root.querySelector('.vw .sc').textContent = 'GRID ' + (gridStep < 1 ? gridStep.toFixed(1) : gridStep) + ' M'; root.querySelector('.vw .bz').textContent = '';
  setLook(null, null);
}
function thumbStep(){                                                          // une vignette par passage (≈ 1 à 120 ms de construction)
  const id = S.queue.shift(); if(!id) return; const e = entry(id); if(!e) return;
  const keep = S.cur; if(keep) keep.root.visible = false;
  let P = null; try { P = C.previewBuild(id, { age: .38, wear: .42, seed: hash(id), faction: 'coalition' }); } catch(err){ console.error(err); }
  if(P){ scene.add(P.root); frameShip(P.root); place(-.75, .2, .95); const cv = document.createElement('canvas'); cv.width = 256; cv.height = 144;
    if(renderTo(cv)){ S.thumbs[id] = cv; S.lens[id] = P.len; const c = card(id); if(c){ c.querySelector('canvas').getContext('2d').drawImage(cv, 0, 0); c.querySelector('[data-len]').textContent = fmtLen(P.len); } }
    scene.remove(P.root); P.dispose(); }
  if(keep){ keep.root.visible = true; frameShip(keep.root); }
}
/* ---------- boucle (appelée par live2.js pendant l'ouverture, démo figée) ---------- */
function frame(now){
  if(!S.open) return; const dt = S.lastT ? Math.min(.1, (now - S.lastT)/1000) : 0; S.lastT = now; S.idleT += dt;
  if(S.queue.length && !S.drag && S.frames % 2 === 1) thumbStep();
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!S.drag && S.idleT > 1.5 && !reduce) S.yaw += dt*.16;
  const r = viewC.getBoundingClientRect(), dpr = Math.min(1.5, window.devicePixelRatio || 1), w = Math.max(2, Math.round(r.width*dpr)), h = Math.max(2, Math.round(r.height*dpr));
  if(viewC.width !== w || viewC.height !== h){ viewC.width = w; viewC.height = h; }
  if(S.cur){ place(S.yaw, S.pitch, S.zoom); const t0 = performance.now(); renderTo(viewC); S.ms += performance.now() - t0; }
  S.frames++;
}
function open(cb){
  if(S.open) return false; if(!root) build(); S.cb = cb || null; S.focusBack = document.activeElement;
  try { C.step(0); const R = typeof renderer !== 'undefined' ? renderer : null; if(R){ bgC.width = Math.round(innerWidth/2); bgC.height = Math.round(innerHeight/2); bgC.getContext('2d').drawImage(R.domElement, 0, 0, bgC.width, bgC.height); } } catch(e){}   // la scène figée en fond flouté
  list(); S.open = true; root.classList.add('on'); window.__uiOpen = '#sttYard'; S.lastT = 0; S.idleT = 0; S.frames = 0; S.ms = 0;
  const sub = C.subject && C.subject(), L = sub && C.lookOf ? C.lookOf(sub) : null; if(L){ S.look.age = L.age; S.look.wear = L.wear != null ? L.wear : L.age; }   // aspect du vaisseau filmé comme point de départ
  const want = S.sel || (sub && S.cat.some(e => e.id === sub.model) ? sub.model : S.cat[0].id); S.sel = null; pick(want);
  const c = card(want); if(c){ c.focus({ preventScroll: true }); if(listEl.scrollHeight > listEl.clientHeight + 4) c.scrollIntoView({ block: 'nearest' }); }   // téléphone : l'aperçu reste en haut
  return true;
}
function close(id){
  if(!S.open) return; S.open = false; root.classList.remove('on'); window.__uiOpen = null;
  if(S.cur){ scene.remove(S.cur.root); S.cur.dispose(); S.cur = null; }
  const e = id ? entry(id) : null, look = lookArg(), cb = S.cb; S.cb = null;
  if(S.focusBack && S.focusBack.focus) try { S.focusBack.focus(); } catch(_){}
  if(cb) cb(e ? { id: e.id, name: e.type, look } : null);
}
window.__YARD = { open, close, frame, isOpen: () => S.open, pick, setLook, view(y, p, z){ S.yaw = y; S.pitch = p; S.zoom = z; S.idleT = -1e9; }, state: () => ({ open: S.open, sel: S.sel, look: Object.assign({}, S.look), thumbs: Object.keys(S.thumbs).length, queue: S.queue.length, cat: S.cat ? S.cat.length : 0, frames: S.frames, msPerFrame: S.frames ? +(S.ms/S.frames).toFixed(2) : 0, buildMs: +(S.buildMs || 0).toFixed(1), uniforms: S.cur && S.cur.U ? { age: S.cur.U.uAge.value, wear: S.cur.U.uWear ? S.cur.U.uWear.value : null } : null }) };
})();
