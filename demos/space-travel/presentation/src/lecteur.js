/* =====================================================================
   LECTEUR DE SLIDES (lots P4, P5) — fond cinématique temps réel, slides en HTML par-dessus
   Moteur (__COSMOS) → réalisateur (__REALISATEUR) → direction photo (__PHOTO, look IMAX) → écran ;
   qualité automatique (__QUALITE), export de clips (__CLIP). Voir docs/SPEC-P4-lecteur.md.
   ?seed=XXX univers · ?rz=YYY réalisateur · ?look=… · ?crt=0..1 · ?quality=fixed (tests) · ?webgl=0 · #n : slide n
   Sans WebGL : slides sur un fond fixe à la charte (moteur remplacé par des bouchons inertes).
   Exposé pour les tests : window.__TEST = { W, D, PH, Q, CL, L, camera, renderer, ready }
   ===================================================================== */
(function(){
'use strict';
const P = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const deck = $('deck'), slides = Array.from(deck.querySelectorAll('section.slide'));
const SEED = P.get('seed') || 'COSMOS', FIXED = P.get('quality') === 'fixed';
const LOOK = P.get('look') || deck.dataset.look || 'imax';
const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), smooth = x => { x = clamp(x, 0, 1); return x*x*(3 - 2*x); };

/* ---------- moteur, réalisateur, direction photo, qualité (ou bouchons inertes sans WebGL) ---------- */
const canvas = $('scene');
const RZ = P.get('rz') || String(Math.floor(Math.random()*1e9));
function inert(){
  const noop = () => {}, meta = { fade: 0, t: 0 };
  return { renderer: null, camera: { aspect: 1, updateProjectionMatrix: noop }, W: { update: noop },
    D: { meta, framing: 'auto', seq: 0, update: () => meta, cut: noop, nextSystem: noop, play: () => false, setFraming(f){ this.framing = f || 'auto'; } },
    PH: { enabled: false, state: { letter: 0 }, quality: {}, grainScale: 1, crtChance: 0, setVeil: noop, setLetterbox: noop, update: noop, render: noop },
    Q: { locked: null, scale: 1, resize: noop, frame: noop, lock: noop, unlock: noop },
    CL: { supported: false, offline: false, live: { supported: false }, ready: Promise.resolve() } };
}
let renderer, camera, W, D, PH, Q, CL, GL = true;
try{
  if(P.get('webgl') === '0') throw new Error('désactivé (?webgl=0)');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  camera = new THREE.PerspectiveCamera(40, window.innerWidth/window.innerHeight, 1, 1e20);
  W = __COSMOS.create({ seed: SEED, starDensity: P.get('density') ? +P.get('density') : 1 });
  D = __REALISATEUR.create(W, camera, { seed: RZ, systems: +(deck.dataset.systemes || 6) });
  PH = __PHOTO.create(renderer, { seed: RZ, look: LOOK, crtChance: P.get('crt') !== null ? +P.get('crt') : undefined });
  Q = __QUALITE.create(renderer, PH, { fixed: FIXED });
  CL = __CLIP.create(canvas);
}catch(e){
  GL = false; console.warn('Voyage Spatial : fond animé indisponible (WebGL ' + (e && e.message || e) + ')');
  ({ renderer, camera, W, D, PH, Q, CL } = inert());
  document.body.classList.add('sans-webgl');
}
const TYPES = __REALISATEUR.TYPES;
/* contexte WebGL perdu (pilote, veille) : image figée ; rétabli : rechargement, à la même slide (#n) */
let lost = false;
if(GL){
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; toast('Fond animé interrompu (WebGL) : reprise dès que possible…'); }, false);
  canvas.addEventListener('webglcontextrestored', () => location.reload(), false);
}

const L = { idx: -1, n: slides.length, slides, clock: 0, ui: 0, showAt: 0, cuts: 0 };   /* clock : simulation ; ui : temps réel (texte, calques) */
const LEVEL = { leger: .38, normal: .55, fort: .72 };
const SIDE = { gauche: 'left', droite: 'right', centre: 'center' };
const MIN_SHOT = 2.5;                    /* pas de coupe si le plan a moins de 2,5 s (pas de rafale de coupes) */

/* ---------- bandes et format ---------- */
let narrow = null, barPx = -1;
function layout(){
  const r = window.innerWidth/window.innerHeight, n = r < 1.2;
  if(n !== narrow){ narrow = n; document.body.classList.toggle('etroit', n); if(!rec.active) PH.setLetterbox(n ? null : undefined); }
  if(!Q.locked){ camera.aspect = r; camera.updateProjectionMatrix(); }
}
function bars(){
  const letter = PH.state.letter || 0, f = letter ? Math.max(0, (1 - (window.innerWidth/window.innerHeight)/letter)/2) : 0;
  const px = Math.round(f*window.innerHeight);
  if(px !== barPx){ barPx = px; document.documentElement.style.setProperty('--bar', px + 'px'); document.body.classList.toggle('barres-texte', px >= 22); }
}
window.addEventListener('resize', () => { Q.resize(); layout(); });

/* ---------- navigation ---------- */
function titleOf(s){ return s.dataset.titreCourt || (s.querySelector('h1, h2') || {}).textContent || ''; }
const pad = n => String(n).padStart(2, '0');
function go(i, opts){
  opts = opts || {};
  i = clamp(i | 0, 0, L.n - 1);
  if(rec.active || (i === L.idx && !opts.force)) return false;
  const prev = slides[L.idx]; if(prev) prev.classList.remove('active', 'visible');
  L.idx = i; const s = slides[i];
  s.classList.add('active');
  D.setFraming(SIDE[s.dataset.cote] || 'auto');
  if(!opts.initial){                                       /* la slide pilote le réalisateur */
    if(s.dataset.systeme === 'suivant') D.nextSystem();
    else if(s.dataset.plan && D.meta.type !== s.dataset.plan){ if(D.play(s.dataset.plan)) L.cuts++; else maybeCut(); }
    else maybeCut();
  }
  L.showAt = L.ui + (opts.initial ? 1.4 : .35);            /* le texte arrive juste après la coupe, même si la machine rend lentement */
  try{ history.replaceState(null, '', '#' + (i + 1)); }catch(e){}
  $('hud-slide').textContent = (deck.dataset.titre || '') + ' // ' + pad(i + 1) + ' — ' + titleOf(s);
  $('hud-num').textContent = pad(i + 1) + ' / ' + pad(L.n);
  $('progression').style.width = ((i + 1)/L.n*100).toFixed(2) + '%';
  presRender();
  return true;
}
function maybeCut(){ const m = D.meta; if(m.type && m.t >= MIN_SHOT && m.fade < .5){ D.cut(); L.cuts++; } }
L.go = go; L.next = () => go(L.idx + 1); L.prev = () => go(L.idx - 1);

/* ---------- calques : rectangles des .calque de la slide, rendus par la direction photo ---------- */
let veilF = 0, veilSlide = null;
function veils(dt){
  const s = slides[L.idx];
  if(veilSlide !== s){ veilF = Math.max(0, veilF - dt/.25); if(veilF <= 0) veilSlide = s; }
  else { const on = s && s.classList.contains('visible') && !rec.active && PH.enabled ? 1 : 0; veilF = on ? Math.min(1, veilF + dt/.45) : Math.max(0, veilF - dt/.25); }
  if(veilF <= 0 || !veilSlide){ PH.setVeil(null); return; }
  const w = window.innerWidth, h = window.innerHeight;
  const list = Array.from(veilSlide.querySelectorAll('.calque')).slice(0, 3).map(el => {
    const r = el.getBoundingClientRect();
    return { x0: r.left/w, x1: r.right/w, y0: 1 - r.bottom/h, y1: 1 - r.top/h, k: LEVEL[el.dataset.calque] || LEVEL.normal };
  });
  PH.setVeil(list, smooth(veilF));
}

/* ---------- export de clip ----------
   Image par image (WebCodecs) quand le navigateur le permet : la simulation avance de 1/30 s par image, quel que soit
   le temps de rendu (clip fluide même si la machine est lente). Sinon, temps réel (MediaRecorder). */
const rec = { active: false };
const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plan';
const pause = () => new Promise(r => setTimeout(r, 0));
L.recordClip = async function(o){
  if(rec.active) throw new Error('enregistrement déjà en cours');
  await CL.ready;
  o = Object.assign({ plan: 'suivant', max: 30, height: 720, bars: true, download: true, mode: 'auto' }, o || {});
  const offline = o.mode !== 'reel' && CL.offline;
  if(!offline && !CL.live.supported) throw new Error('export vidéo non pris en charge par ce navigateur');
  const h = o.height, w = Math.round(h*16/9), bitrate = h >= 1080 ? 9e6 : 5e6;
  Object.assign(rec, { active: true, offline, phase: 'attente', opts: o, t: 0, cancel: false, key0: D.meta.seq + ':' + D.meta.shot, keyOn: null,
    grain: PH.grainScale, crt: PH.crtChance });
  document.body.classList.add('rec'); closePanels();
  Q.lock(w, h); camera.aspect = w/h; camera.updateProjectionMatrix();
  PH.grainScale = .6; PH.crtChance = 0; PH.setLetterbox(o.bars ? undefined : null); PH.setVeil(null);
  let enc = null;
  try{
    if(offline) enc = await CL.encoder({ width: w, height: h, bitrate, fps: 30 });
    else CL.live.start({ bitrate });
  }catch(e){ endRec(); throw e; }
  if(!(o.plan !== 'suivant' && D.play(o.plan))) D.cut();
  if(!offline) return new Promise((resolve, reject) => { rec.resolve = resolve; rec.reject = reject; });
  /* image par image : la boucle d'affichage est suspendue (frame() ne fait rien pendant l'enregistrement) */
  const dt = 1/30;
  try{
    for(let guard = 0; guard < 30*120; guard++){
      if(rec.cancel){ enc.abort(); endRec(); toast('Export annulé'); return null; }
      L.clock += dt; D.update(dt); W.update(dt, camera, renderer); PH.render(W, camera, D.meta, dt);
      if(!recStep()){ break; }
      if(rec.phase === 'prise'){ enc.add(canvas); rec.t += dt; }
      if(guard % 3 === 0 || enc.queue > 4){ $('rec').textContent = 'REC ' + rec.t.toFixed(1) + ' s — ' + (rec.label || '…'); await pause(); }
      while(enc.queue > 8) await pause();
    }
    const res = await enc.finish();
    return finishRec(res);
  }catch(e){ if(enc) enc.abort(); endRec(); toast('Échec de l’export : ' + (e.message || e)); throw e; }
};
/* une image : false quand la prise est finie (changement de plan, durée atteinte, fin au noir) */
function recStep(){
  const m = D.meta, key = m.seq + ':' + m.shot;
  if(rec.phase === 'attente'){
    if(key === rec.key0 || !m.type || m.fade >= 1) return true;     /* le plan demandé n'a pas encore commencé */
    rec.phase = 'prise'; rec.keyOn = key; rec.label = m.label; rec.system = m.system; rec.type = m.type;
  }
  return !(key !== rec.keyOn || rec.t >= rec.opts.max - 1e-6 || (m.fade >= 1 && rec.t > 1));
}
function liveFrame(dt){                                  /* temps réel : après chaque rendu */
  if(!rec.active || rec.offline || rec.phase === 'fin') return;
  if(rec.cancel){ rec.phase = 'fin'; CL.live.stop().catch(() => {}).then(() => { endRec(); toast('Export annulé'); rec.resolve(null); }); return; }
  if(!recStep()){ rec.phase = 'fin'; CL.live.stop().then(finishRec).then(rec.resolve, e => { endRec(); toast('Échec de l’export : ' + (e.message || e)); rec.reject(e); }); return; }
  if(rec.phase === 'prise'){ CL.live.frame(); rec.t += dt; $('rec').textContent = 'REC ' + rec.t.toFixed(1) + ' s — ' + rec.label; }
}
function endRec(){
  Q.unlock(); layout();
  PH.grainScale = rec.grain; PH.crtChance = rec.crt; PH.setLetterbox(narrow ? null : undefined);
  document.body.classList.remove('rec'); rec.active = false; rec.phase = null;
}
function finishRec(res){
  const name = 'voyage-spatial_' + slug(rec.system) + '_' + slug(rec.type) + '.webm';
  const out = { name, bytes: res.bytes, mime: res.mime, frames: res.frames, seconds: +(rec.offline ? res.ms/1000 : rec.t).toFixed(2), blob: res.blob, label: rec.label,
    mode: rec.offline ? 'image par image' : 'temps réel' };
  endRec();
  const what = name + ' — ' + (res.bytes/1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Mo, ' + out.seconds.toLocaleString('fr-FR') + ' s';
  if(rec.opts.download) saveFile(res.blob, name).then(st => toast(st === 'saved' ? 'Clip enregistré : ' + what : st === 'declined' ? 'Enregistrement du clip refusé' : 'Le clip n’a pas pu être enregistré ici'));
  else toast('Clip prêt : ' + what);
  return out;
}
/* enregistrement du fichier : dans une page Claude, par la capacité « downloads » (le visiteur confirme) ; ailleurs, lien de téléchargement */
const IN_CLAUDE = !!(window.claude && window.claude.use);
const downloadsP = IN_CLAUDE ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);
async function saveFile(blob, name){
  const dl = await downloadsP;
  if(dl){ try{ await dl.save({ filename: name, data: blob }); return 'saved'; }catch(e){ return e && e.code === 'declined' ? 'declined' : 'error'; } }
  if(IN_CLAUDE) return 'error';
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  a.addEventListener('click', e => e.stopPropagation());        /* pas de slide suivante sur ce clic */
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return 'saved';
}

/* ---------- interface ---------- */
let toastT = null;
function toast(msg){ const t = $('toast'); t.textContent = msg; t.classList.add('vu'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('vu'), 5000); }
/* écran noir (B ou .) : comme dans les logiciels de présentation ; le moteur se met en pause une fois le noir fait */
let noirAt = 0;
function noir(on){ const b = document.body; on = on === undefined ? !b.classList.contains('noir') : on; b.classList.toggle('noir', on); noirAt = performance.now(); }
L.noir = noir;
function closePanels(){ $('panneau-clip').hidden = true; $('aide').hidden = true; }
function togglePanel(id){ const p = $(id), open = p.hidden; closePanels(); p.hidden = !open; if(open){ const f = p.querySelector('select, button'); if(f) f.focus(); } }
const cPlan = $('c-plan');
cPlan.innerHTML = '<option value="suivant">plan suivant</option>' + Object.keys(TYPES).map(k => '<option value="' + k + '">' + TYPES[k].label + '</option>').join('');
function clipNote(){
  const h = +$('c-format').value, max = +$('c-max').value, mbps = h >= 1080 ? 9 : 5, sec = Math.min(max, 13);
  $('c-note').textContent = 'Le fond seul : ni texte ni calque, du début à la fin du plan (≈ ' + Math.round(mbps*sec/8) + ' Mo pour ' + sec + ' s). ' +
    (CL.offline ? 'Rendu image par image à 30 i/s : fluide quelle que soit la machine.' : CL.live.supported ? 'Enregistrement en temps réel.' : 'Export non pris en charge par ce navigateur.');
}
['c-format', 'c-max'].forEach(id => $(id).addEventListener('change', clipNote)); clipNote(); CL.ready.then(clipNote);
$('c-go').addEventListener('click', () => {
  L.recordClip({ plan: cPlan.value, height: +$('c-format').value, max: +$('c-max').value, bars: $('c-bandes').checked }).catch(e => toast('Export impossible : ' + (e.message || e)));
});
$('c-fermer').addEventListener('click', closePanels);
$('b-prec').addEventListener('click', e => { e.stopPropagation(); L.prev(); });
$('b-suiv').addEventListener('click', e => { e.stopPropagation(); L.next(); });
$('b-clip').addEventListener('click', e => { e.stopPropagation(); togglePanel('panneau-clip'); });
$('b-aide').addEventListener('click', e => { e.stopPropagation(); togglePanel('aide'); });
$('b-plein').addEventListener('click', e => { e.stopPropagation(); fullscreen(); });
function fullscreen(){ if(document.fullscreenElement) document.exitFullscreen(); else if(document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); }
const inPanel = el => el && el.closest && el.closest('.panneau, #commandes');
function onKey(e){
  if(e.ctrlKey || e.metaKey || e.altKey) return;
  if(rec.active){ if(e.key === 'Escape') rec.cancel = true; e.preventDefault(); return; }   /* enregistrement : Échap annule, le reste est ignoré */
  const k = e.key, inForm = /^(SELECT|INPUT|BUTTON)$/.test((document.activeElement || {}).tagName || '') && inPanel(document.activeElement);
  if(k === 'Escape'){ closePanels(); noir(false); return; }
  if(k === 'b' || k === 'B' || k === '.'){ noir(); return; }
  if(document.body.classList.contains('noir')){ noir(false); if(!/^(ArrowRight|ArrowLeft|PageDown|PageUp| )$/.test(k)) return; }
  if(inForm && /^(ArrowUp|ArrowDown|ArrowLeft|ArrowRight| |Enter)$/.test(k)) return;
  if(k === 'ArrowRight' || k === 'PageDown' || k === ' '){ e.preventDefault(); L.next(); }
  else if(k === 'ArrowLeft' || k === 'PageUp'){ e.preventDefault(); L.prev(); }
  else if(k === 'Home') go(0); else if(k === 'End') go(L.n - 1);
  else if(/^[fF]$/.test(k)) fullscreen();
  else if(/^[hH]$/.test(k)) document.body.classList.toggle('sans-ui');
  else if(/^[eE]$/.test(k)){ if($('b-clip').hidden) toast('Export de clip indisponible ici'); else togglePanel('panneau-clip'); }
  else if(/^[nN]$/.test(k)) D.nextSystem();
  else if(/^[pP]$/.test(k)) PH.enabled = !PH.enabled;
  else if(/^[sS]$/.test(k)) L.togglePresenter();
  else if(k === '?') togglePanel('aide');
}
window.addEventListener('keydown', onKey);
document.addEventListener('click', e => { if(inPanel(e.target) || e.button !== 0 || (e.target.closest && e.target.closest('a'))) return; closePanels();
  if(document.body.classList.contains('noir')){ noir(false); return; } if(e.shiftKey) L.prev(); else L.next(); });
let tx = null, ty = null;
document.addEventListener('touchstart', e => { if(inPanel(e.target)) return; tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
document.addEventListener('touchend', e => {
  if(tx === null) return; const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty; tx = null;
  if(Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)){ if(dx < 0) L.next(); else L.prev(); }
}, { passive: true });
let idle = null;
document.addEventListener('mousemove', () => { document.body.classList.add('souris'); clearTimeout(idle); idle = setTimeout(() => document.body.classList.remove('souris'), 2500); });
const fmtLook = () => (PH.state.look ? PH.state.look.label : '');
let hudT = 0;
function hud(dt){
  hudT += dt; if(hudT < .25) return; hudT = 0;
  const m = D.meta; if(!m.type) return;
  $('hud-systeme').textContent = 'En direct · ' + m.system;
  $('hud-plan').textContent = m.label + ' · ' + Math.round(m.focal) + ' mm · ' + fmtLook();
}

/* ---------- vue présentateur (S) : fenêtre séparée pour l'écran du portable, sinon incrustée ---------- */
const PRES_HTML = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Voyage Spatial · présentateur</title>' +
  '<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;600&display=swap" rel="stylesheet"><style>' +
  ':root{color-scheme:dark}body{margin:0;background:#0b1220;color:#e8edf5;font:18px/1.6 Inter,system-ui,sans-serif;display:flex;flex-direction:column;height:100vh}' +
  'header,footer{display:flex;align-items:center;gap:12px;padding:12px 22px;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:14px;letter-spacing:.06em}' +
  'header{justify-content:space-between;border-bottom:1px solid #25375c;color:#8ea0c4}footer{border-top:1px solid #25375c}' +
  '.p-num{color:#ffb454}.p-temps{color:#5eead4;font-variant-numeric:tabular-nums}main{flex:1;overflow:auto;padding:18px 22px}' +
  '.p-titre{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:24px;margin:0 0 14px}.p-notes{font-size:clamp(18px,2.4vw,26px);line-height:1.55;color:#c9d3e6;max-width:62ch}' +
  '.p-suivante{flex:1;margin:0;color:#8ea0c4}button{font:inherit;color:#e8edf5;background:#0f1a30;border:1px solid #25375c;padding:8px 14px;cursor:pointer}' +
  'button:hover,button:focus-visible{border-color:#ffb454;color:#ffb454;outline:none}</style></head><body>' +
  '<header><span class="p-num"></span><span class="p-temps"></span></header><main><h1 class="p-titre"></h1><div class="p-notes"></div></main>' +
  '<footer><p class="p-suivante"></p><button class="p-zero" type="button">Minuteur à zéro</button><button class="p-prec" type="button">←</button><button class="p-suiv" type="button">→</button></footer></body></html>';
let pres = null;
const mmss = ms => { const t = Math.max(0, Math.floor(ms/1000)); return String(Math.floor(t/60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
function presRoot(){ return pres ? (pres.mode === 'fenetre' ? pres.win.document : $('presentateur')) : null; }
function presRender(){
  if(!pres) return;
  if(pres.mode === 'fenetre' && pres.win.closed){ closePresenter(); return; }
  const r = presRoot(), s = slides[L.idx], nx = slides[L.idx + 1], q = c => r.querySelector(c), n = s && s.querySelector('.notes');
  q('.p-num').textContent = pad(L.idx + 1) + ' / ' + pad(L.n);
  q('.p-titre').textContent = titleOf(s);
  q('.p-notes').innerHTML = n ? n.innerHTML : '<em>Pas de note pour cette slide.</em>';
  q('.p-suivante').textContent = nx ? 'Suivante : ' + pad(L.idx + 2) + ' — ' + titleOf(nx) : 'Dernière slide';
  presTick();
}
function presTick(){
  const r = presRoot(); if(!r) return;
  r.querySelector('.p-temps').textContent = mmss(Date.now() - pres.t0) + ' · ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
function wirePresenter(r){
  r.querySelector('.p-prec').addEventListener('click', e => { e.stopPropagation(); L.prev(); });
  r.querySelector('.p-suiv').addEventListener('click', e => { e.stopPropagation(); L.next(); });
  r.querySelector('.p-zero').addEventListener('click', e => { e.stopPropagation(); if(pres){ pres.t0 = Date.now(); presTick(); } });
}
function openPresenter(){
  let w = null;
  try{ w = window.open('', 'voyage-presentateur', 'popup,width=980,height=640'); }catch(e){ w = null; }
  if(w && w.document){
    w.document.open(); w.document.write(PRES_HTML); w.document.close();
    pres = { mode: 'fenetre', win: w, t0: Date.now() };
    wirePresenter(w.document); w.document.addEventListener('keydown', onKey);
    w.addEventListener('pagehide', () => { if(pres && pres.win === w){ clearInterval(pres.timer); pres = null; } });
  } else {
    pres = { mode: 'incruste', t0: Date.now() }; $('presentateur').hidden = false;
  }
  pres.timer = setInterval(presTick, 1000);
  presRender();
}
function closePresenter(){
  if(!pres) return; const p = pres; pres = null; clearInterval(p.timer);
  if(p.mode === 'fenetre'){ try{ if(!p.win.closed) p.win.close(); }catch(e){} } else $('presentateur').hidden = true;
}
wirePresenter($('presentateur'));
L.togglePresenter = () => { if(pres) closePresenter(); else openPresenter(); };
L.presenter = () => pres && { mode: pres.mode, root: presRoot() };

/* ---------- boucle ---------- */
let last = performance.now();
function frame(){
  requestAnimationFrame(frame);
  const now = performance.now(), raw = (now - last)/1000; last = now;
  if(rec.active && rec.offline) return;                    /* l'enregistrement image par image pilote la simulation */
  if(document.body.classList.contains('noir') && now - noirAt > 700){ last = now; return; }   /* écran noir : pause */
  const dt = Math.min(raw, rec.active ? .5 : .1);          /* temps réel : la simulation suit l'horloge du clip */
  L.clock += dt; const uiDt = Math.min(raw, 1); L.ui += uiDt;
  D.update(dt);
  W.update(dt, camera, renderer);
  const s = slides[L.idx];
  if(s && !s.classList.contains('visible') && L.ui >= L.showAt) s.classList.add('visible');
  document.body.classList.toggle('voile-gl', PH.enabled);
  veils(uiDt);
  if(!window.__SKIP_RENDER && !lost){ PH.render(W, camera, D.meta, dt); liveFrame(dt); }
  else PH.update(D.meta, dt);
  bars();
  Q.frame(raw);
  hud(dt);
}
layout();
const start = parseInt((location.hash || '').slice(1), 10);
go(Number.isFinite(start) ? start - 1 : 0, { initial: true, force: true });
requestAnimationFrame(frame);
if(!GL){ const h = $('hud-systeme'); h.classList.remove('direct'); h.textContent = 'Fond animé indisponible (WebGL)'; }
CL.ready.then(() => downloadsP).then(dl => { if(!CL.supported || (IN_CLAUDE && !dl)) $('b-clip').hidden = true; });   /* export impossible : bouton masqué */
window.__TEST = { W, D, PH, Q, CL, L, camera, renderer, GL, ready: true };
})();
