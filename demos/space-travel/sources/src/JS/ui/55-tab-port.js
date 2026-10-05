/* =========================================================================
   CAMPAGNE 1. CONSOLE DE BORD — onglet Port (#portPanel) (L1.6)
   ========================================================================= */
/* @provides CONSOLE.port @requires CONSOLE, CONSOLE.view @requires-engine isNearPortService, refreshPortPanel */
(function(){
  'use strict';

  /* le `top` posé en ligne par repositionPortPanel est neutralisé par la CSS de la vue (.con-hosted) */
  function panel(){ return document.getElementById('portPanel'); }
  function shown(n){ return n.classList.contains('visible'); }

  let hosted = false;
  function ensureHost(){
    if(!hosted && panel()) hosted = CONSOLE.view.host('port', 'portPanel', shown);
  }

  CONSOLE.register({
    id: 'port',
    order: 40,
    labelKey: 'conTabPort',
    fkey: 'F4',
    keys: [],
    visible: function(){ ensureHost(); return isNearPortService(); },
    onShow: function(){
      ensureHost();
      const el = panel();
      if(!el) return;
      el.classList.add('visible');
      if(typeof refreshPortPanel === 'function') refreshPortPanel();
    },
    onHide: function(reason){
      if(reason === 'legacy') return;
      const el = panel();
      if(el) el.classList.remove('visible');
    }
  });

  ensureHost();
})();
