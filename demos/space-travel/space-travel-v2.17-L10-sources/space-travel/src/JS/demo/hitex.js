/* Copie de la démo « Observation des étoiles » v7.2.2 (src/hitex.js), inchangée — enveloppe SHIPGEN.build ; pilotée à chaque image par 20f-greffons-vaisseau.js (lot L6). */
/* =====================================================================
   TEXTURES HAUTE RÉSOLUTION (v7.1) — window.__HITEX
   Les textures partagées du générateur de vaisseaux (tôles 512 px pour ~7 m de coque, bandes de danger 128 × 32,
   rainures 64 × 8, radiateurs 16 × 256) sont agrandies 3 à 5 fois en gros plan : relief en escalier, rivets carrés.
   Sans toucher au moteur, la démo rejoue leurs recettes (même générateur pseudo-aléatoire, même graine, mêmes tracés)
   sur un canevas 4 fois plus grand (2 fois avec ?quality=low), puis remplace l'image des textures existantes :
   le dessin est identique, seulement net. Filtrage anisotrope maximal (vues rasantes le long des coques).
   Mémoire GPU : ≈ +25 Mo (4×), ≈ +7 Mo (2×).
   ===================================================================== */
(function(){
  if(typeof SHIPGEN === 'undefined' || !window.THREE) return;
  const HX = window.__HITEX = { patched: 0, info: [] };
  const Q = new URLSearchParams(location.search).get('quality'), K = Q === 'low' ? 2 : 4;
  // générateur du moteur (mulberry32)
  function prng(seed){ let t = seed >>> 0; return function(){ t |= 0; t = t + 1831565813 | 0; let e = Math.imul(t ^ t >>> 15, 1 | t); e = e + Math.imul(e ^ e >>> 7, 61 | e) ^ e; return ((e ^ e >>> 14) >>> 0)/4294967296; }; }
  function canvas(w, h, k){ const c = document.createElement('canvas'); c.width = w*k; c.height = h*k; const g = c.getContext('2d'); g.scale(k, k); return { c, g }; }
  /* tôles : subdivision récursive du moteur, bord de 2 unités, rivets (ronds ici, carrés de 2 unités à l'origine), 320 salissures */
  function hull(k){
    const { c, g: t } = canvas(512, 512, k), n = prng(7);
    t.fillStyle = '#c3c8cf'; t.fillRect(0, 0, 512, 512);
    const dot = (x, y) => { t.beginPath(); t.arc(x, y, 1.05, 0, 6.2832); t.fill(); };
    (function e(a, o, r, i, s){
      if(s > 0 && (r > 70 || i > 70) && n() < .88){
        if(r > i){ const q = Math.round(r*(.3 + .4*n())); e(a, o, q, i, s - 1); e(a + q, o, r - q, i, s - 1); }
        else { const q = Math.round(i*(.3 + .4*n())); e(a, o, r, q, s - 1); e(a, o + q, r, i - q, s - 1); }
        return;
      }
      const l = 186 + Math.floor(34*n());
      t.fillStyle = 'rgb(' + l + ',' + (l + 3) + ',' + (l + 8) + ')'; t.fillRect(a + 1, o + 1, r - 2, i - 2);
      t.strokeStyle = 'rgba(38,43,52,0.6)'; t.lineWidth = 2; t.strokeRect(a + 1, o + 1, r - 2, i - 2);
      if(n() < .16){ t.strokeStyle = 'rgba(38,43,52,0.35)'; t.lineWidth = 1; t.strokeRect(a + .3*r, o + .3*i, .4*r, .4*i); }
      if(n() < .3){ t.fillStyle = 'rgba(55,60,70,0.45)'; for(let x = 7; x < r - 7; x += 11){ dot(a + x + 1, o + 5); dot(a + x + 1, o + i - 5); } }
    })(0, 0, 512, 512, 7);
    for(let e = 0; e < 320; e++){ t.fillStyle = 'rgba(28,32,38,' + .07*n() + ')'; const w = 4 + 30*n(); t.fillRect(512*n(), 512*n(), w, .35*w); }
    return c;
  }
  function hazard(k){ const { c, g: t } = canvas(128, 32, k); t.fillStyle = '#1c1e22'; t.fillRect(0, 0, 128, 32); t.fillStyle = '#e3ae3c';
    for(let e = -32; e < 160; e += 32){ t.beginPath(); t.moveTo(e, 32); t.lineTo(e + 16, 32); t.lineTo(e + 32, 0); t.lineTo(e + 16, 0); t.closePath(); t.fill(); } return c; }
  function ribs(k){ const { c, g: t } = canvas(64, 8, k), n = t.createLinearGradient(0, 0, 64, 0); for(let e = 0; e <= 8; e++) n.addColorStop(e/8, e % 2 ? '#8d8d8d' : '#ffffff'); t.fillStyle = n; t.fillRect(0, 0, 64, 8); return c; }
  function fins(k){ const { c, g: t } = canvas(16, 256, k); t.fillStyle = '#3a4352'; t.fillRect(0, 0, 16, 256); t.fillStyle = '#1d222b'; for(let e = 0; e < 256; e += 16) t.fillRect(0, e, 16, 5); return c; }
  const RECIPES = [                                  // reconnaissance par taille d'image (textures partagées du générateur)
    { w: 512, h: 512, name: 'hull', make: hull },
    { w: 128, h: 32, name: 'hazard', make: hazard },
    { w: 64, h: 8, name: 'ribs', make: ribs },
    { w: 16, h: 256, name: 'fins', make: fins }];
  const done = new WeakSet(), byImage = new Map();
  function upgrade(t, rep){
    if(!t || done.has(t) || !t.image || t.image.tagName !== 'CANVAS') return;
    done.add(t);
    const img = t.image, R = RECIPES.find(r => r.w === img.width && r.h === img.height); if(!R) return;
    // la texture clonée des réservoirs (répétée 5 × 3) a déjà une densité élevée : 2× suffit
    const k = R.name === 'hull' && rep > 1.5 ? Math.min(K, 2) : K, key = R.name + ':' + k;
    let cv = byImage.get(key); if(!cv){ cv = R.make(k); byImage.set(key, cv); HX.info.push(key + ' ' + cv.width + '×' + cv.height); }
    t.image = cv; t.anisotropy = Math.max(t.anisotropy, typeof renderer !== 'undefined' ? renderer.capabilities.getMaxAnisotropy() : 8);
    t.needsUpdate = true; HX.patched++;
  }
  HX.apply = function(group){
    group.traverse(o => { if(!o.isMesh || !o.material) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
      if(!m) return; ['map', 'bumpMap'].forEach(s => { const t = m[s]; if(t) upgrade(t, Math.max(t.repeat.x, t.repeat.y)); }); }); });
  };
  const build0 = SHIPGEN.build;
  SHIPGEN.build = function(model, opts){ const b = build0.call(SHIPGEN, model, opts); if(!(opts && opts.hiTex === false)) HX.apply(b.group); return b; };
  HX.K = K;
})();
