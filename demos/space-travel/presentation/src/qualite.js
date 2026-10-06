/* =====================================================================
   QUALITÉ AUTOMATIQUE (lot P4) — window.__QUALITE.create(renderer, PH, opts) → Q
   Résolution dynamique (50 à 100 % d'une base plafonnée à ~2,2 Mpx), puis paliers d'effets :
   1 sans MSAA ; 2 sans profondeur de champ ni traînée anamorphique. Q.frame(dt) à chaque image.
   Q.lock(w, h) / Q.unlock() : taille de rendu figée (export de clip). Voir docs/SPEC-P4-lecteur.md.
   ===================================================================== */
(function(){
'use strict';
const QU = window.__QUALITE = {};
QU.create = function(renderer, PH, opts){
  opts = opts || {};
  const MIN = opts.min || .5, MAXPX = opts.maxPixels || 2.2e6, SLOW = opts.slow || 1/45.5, FAST = opts.fast || 1/55.5;
  const Q = { scale: 1, tier: 0, fixed: !!opts.fixed, locked: null, state: {} };
  let ema = 1/60, slowT = 0, fastT = 0, cool = 0, probe = 0, holdUp = 0, applied = '';
  const base = () => {
    const w = window.innerWidth, h = window.innerHeight, dpr = opts.pixelRatio || Math.min(window.devicePixelRatio || 1, 1.5);
    return Math.min(dpr, Math.sqrt(MAXPX/Math.max(1, w*h)));
  };
  function tiers(){
    if(!PH) return;
    PH.quality.msaa = Q.tier < 1 && opts.msaa !== false;
    PH.quality.dof = Q.tier < 2; PH.quality.flare = Q.tier < 2;
  }
  /* applique la taille (sans toucher au style CSS : le canevas reste plein écran) */
  function apply(force){
    let w, h, pr;
    if(Q.locked){ w = Q.locked.w; h = Q.locked.h; pr = 1; }
    else { w = window.innerWidth; h = window.innerHeight; pr = Q.fixed ? Math.min(opts.pixelRatio || 1, 1) : base()*Q.scale; }
    const key = w + 'x' + h + '@' + pr.toFixed(3);
    if(key === applied && !force) return;
    applied = key;
    renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
  }
  Q.apply = apply;
  Q.resize = () => apply(true);
  Q.lock = (w, h) => { Q.locked = { w, h }; apply(true); };
  Q.unlock = () => { Q.locked = null; apply(true); ema = 1/60; slowT = fastT = 0; cool = 1; };
  /* une image : dt = intervalle réel entre deux images (s) */
  Q.frame = function(dt){
    if(!(dt > 0)) return;
    ema += (Math.min(dt, .25) - ema)*.1;
    Q.state = { scale: Q.scale, tier: Q.tier, ms: +(ema*1000).toFixed(1), base: +base().toFixed(3) };
    if(Q.fixed || Q.locked) return;
    cool -= dt; holdUp -= dt; if(probe > 0) probe -= dt;
    if(ema > SLOW){ slowT += dt; fastT = 0; } else if(ema < FAST){ fastT += dt; slowT = 0; } else { slowT = Math.max(0, slowT - dt); fastT = Math.max(0, fastT - dt); }
    if(cool > 0) return;
    if(slowT > 1){                                   /* trop lent : résolution, puis paliers */
      if(probe > 0) holdUp = 20;                      /* une hausse vient d'échouer : plus de hausse pendant 20 s */
      if(Q.scale > MIN + 1e-3) Q.scale = Math.max(MIN, Q.scale*.85);
      else if(Q.tier < 2){ Q.tier++; tiers(); }
      apply(); slowT = 0; cool = 1.2; probe = 0;
    } else if(fastT > 4 && holdUp <= 0){             /* marge : paliers rétablis d'abord, puis résolution */
      if(Q.tier > 0){ Q.tier--; tiers(); }
      else if(Q.scale < 1 - 1e-3) Q.scale = Math.min(1, Q.scale*1.07);
      else { fastT = 0; return; }
      apply(); fastT = 0; cool = 1.2; probe = 2;
    }
  };
  tiers(); apply(true);
  return Q;
};
})();
