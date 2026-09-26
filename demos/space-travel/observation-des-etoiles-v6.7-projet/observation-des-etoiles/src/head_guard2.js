/* Coupe la boucle du jeu et neutralise ses entrées une fois la démo lancée.
   Exceptions : l'écran d'accueil (#sttStart), les éléments d'interface de la démo (.demo-ui)
   et, pendant qu'une interface du jeu est ouverte par la démo (window.__uiOpen : sélecteur de vaisseaux),
   ses entrées clavier/souris et ses images d'animation. */
(function(){
  var raf = window.requestAnimationFrame.bind(window);
  window.__raf = raf;
  window.requestAnimationFrame = function(cb){ return (window.__takeover && !window.__uiOpen) ? 0 : raf(cb); };
  var UI_KEYS = { ArrowLeft:1, ArrowRight:1, ArrowUp:1, ArrowDown:1, Enter:1, NumpadEnter:1, Space:1, Tab:1 };
  ['keydown','keyup','click','pointerdown','pointerup','mousedown','mouseup','touchstart','touchend','wheel','contextmenu','dblclick'].forEach(function(ev){
    window.addEventListener(ev, function(e){
      if(e.target && e.target.closest && e.target.closest('#sttStart, .demo-ui')) return;
      if(window.__uiOpen){
        if(ev === 'keydown' && window.__onKey && !UI_KEYS[e.code]) { try { window.__onKey(e); } catch(_){} }
        if(ev.indexOf('key') === 0 ? UI_KEYS[e.code] : (e.target && e.target.closest && e.target.closest(window.__uiOpen))) return;
        e.stopImmediatePropagation(); return;
      }
      if(ev === 'keydown' && window.__onKey){ try { window.__onKey(e); } catch(_){} }
      e.stopImmediatePropagation();
    }, {capture:true});
  });
})();
