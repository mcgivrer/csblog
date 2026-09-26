/* Coupe la boucle du jeu et neutralise ses entrées une fois la démo lancée */
(function(){
  var raf = window.requestAnimationFrame.bind(window);
  window.__raf = raf;
  window.requestAnimationFrame = function(cb){ return window.__takeover ? 0 : raf(cb); };
  ['keydown','keyup','click','pointerdown','pointerup','mousedown','mouseup','touchstart','touchend','wheel','contextmenu','dblclick'].forEach(function(ev){
    window.addEventListener(ev, function(e){
      if(e.target && e.target.closest && e.target.closest('#sttStart')) return;
      if(ev === 'keydown' && window.__onKey){ try { window.__onKey(e); } catch(_){} }
      e.stopImmediatePropagation();
    }, {capture:true});
  });
})();
