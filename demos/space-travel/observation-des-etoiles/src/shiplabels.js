/* =====================================================================
   ÉTIQUETTES ET JAUGES (v7.13, lot 17) — window.__LABELS
   Au-dessus de chaque vaisseau proche à l'écran : nom, faction (militaires) ou armateur (civils), jauge de coque (santé,
   avec le bouclier en liseré pour les militaires) et jauge d'énergie. Désemparé : mention DISABLED.
   Bouton DATA / touche H (choix mémorisé). Mise à jour 15 fois par seconde, au plus 8 étiquettes, DOM réutilisé
   (aucune création d'élément en régime établi) ; les étiquettes qui se chevauchent sont décalées vers le haut.
   ===================================================================== */
(function(){
'use strict';
const C = window.__CINE; if(!C) return;
const St = { on: true, pool: [], last: 0, cost: 0, n: 0, shown: 0 };
try { const v = localStorage.getItem('ode.data'); if(v === '0' || v === '1') St.on = v === '1'; } catch(e){}
const css = document.createElement('style');
css.textContent =
  '#sttLabels{position:fixed;inset:0;z-index:8;pointer-events:none;overflow:hidden;font-family:"JetBrains Mono",monospace}' +
  '#sttLabels .lb{position:absolute;left:0;top:0;min-width:74px;padding:3px 6px 4px;background:rgba(11,18,32,.58);border-left:2px solid #5eead4;color:#e8edf5;white-space:nowrap;will-change:transform;opacity:0;transition:opacity .25s}' +
  '#sttLabels .lb.on{opacity:1}#sttLabels .lb.sj{background:rgba(11,18,32,.72)}' +
  '#sttLabels .nm{font-size:10px;font-weight:700;letter-spacing:.04em;text-shadow:0 1px 3px rgba(0,0,0,.9)}' +
  '#sttLabels .ow{font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;color:#8ea0c4;margin:1px 0 3px}#sttLabels .ow b{font-weight:400;color:#ff5a4a;margin-left:6px}' +
  '#sttLabels .g{position:relative;height:3px;background:rgba(37,55,92,.9);margin-top:2px}#sttLabels .g i{position:absolute;left:0;top:0;bottom:0;background:#5eead4}' +
  '#sttLabels .g s{position:absolute;left:0;top:-2px;height:1px;background:#7fb8ff}#sttLabels .g.e i{background:#ffd27a}' +
  '@media (prefers-reduced-motion: reduce){#sttLabels .lb{transition:none}}';
document.head.appendChild(css);
const root = document.createElement('div'); root.id = 'sttLabels'; root.className = 'demo-ui'; root.setAttribute('aria-hidden', 'true');
function mount(){ document.body.appendChild(root); }
if(document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
function make(){ const d = document.createElement('div'); d.className = 'lb'; d.innerHTML = '<div class="nm"></div><div class="ow"></div><div class="g"><i></i><s></s></div><div class="g e"><i></i></div>'; root.appendChild(d);
  const o = { d, nm: d.children[0], ow: d.children[1], h: d.children[2].children[0], sh: d.children[2].children[1], e: d.children[3].children[0], key: '', w: 80, hgt: 34 }; St.pool.push(o); return o; }
const hullCol = v => v > .6 ? '#5eead4' : (v > .3 ? '#ffb454' : '#ff5a4a');
function hideAll(){ St.pool.forEach(o => o.d.classList.remove('on')); St.shown = 0; }
function frame(now, allowed){
  if(!St.on || !allowed){ if(St.shown) hideAll(); return; }
  if(now - St.last < 66) return; St.last = now;
  const t0 = performance.now(), L = C.labelsState(8);
  if(!L || !L.length){ if(St.shown) hideAll(); return; }
  const placed = [];
  L.forEach((l, i) => {
    const o = St.pool[i] || make(), key = l.uid + '|' + l.name + '|' + l.owner + '|' + l.dis;
    if(o.key !== key){ o.key = key; o.nm.textContent = l.name; o.ow.innerHTML = ''; o.ow.appendChild(document.createTextNode(l.owner)); if(l.dis){ const b = document.createElement('b'); b.textContent = 'DISABLED'; o.ow.appendChild(b); }
      o.d.style.borderLeftColor = l.col; o.nm.style.color = l.hero ? '#ffb454' : '#e8edf5'; o.w = o.d.offsetWidth || 80; o.hgt = o.d.offsetHeight || 34; }
    o.h.style.width = (l.hull*100).toFixed(1) + '%'; o.h.style.background = hullCol(l.hull);
    o.sh.style.width = l.shield == null ? '0' : (l.shield*100).toFixed(1) + '%'; o.e.style.width = (l.energy*100).toFixed(1) + '%';
    o.d.classList.toggle('sj', !!l.subj);
    let x = Math.round(l.x - o.w/2), y = Math.round(l.y - o.hgt - 8);                  // au-dessus du vaisseau, décalé si une autre étiquette occupe la place
    for(let k = 0; k < 6; k++){ const hit = placed.find(r => x < r[0] + r[2] && x + o.w > r[0] && y < r[1] + r[3] && y + o.hgt > r[1]); if(!hit) break; y = hit[1] - o.hgt - 3; }
    placed.push([x, y, o.w, o.hgt]);
    o.d.style.transform = 'translate(' + x + 'px,' + y + 'px)'; o.d.classList.add('on');
  });
  for(let i = L.length; i < St.pool.length; i++) St.pool[i].d.classList.remove('on');
  St.shown = L.length; St.cost += performance.now() - t0; St.n++;
}
function set(on){ St.on = !!on; try { localStorage.setItem('ode.data', St.on ? '1' : '0'); } catch(e){} if(!St.on) hideAll(); return St.on; }
window.__LABELS = { frame, toggle(){ return set(!St.on); }, set, isOn: () => St.on,
  stats: () => ({ on: St.on, shown: St.shown, pool: St.pool.length, ms: St.n ? +(St.cost/St.n).toFixed(3) : 0 }), _reset(){ St.cost = 0; St.n = 0; } };
})();
