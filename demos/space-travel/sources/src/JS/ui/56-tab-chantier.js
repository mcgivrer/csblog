/* =========================================================================
   CAMPAGNE 1. CONSOLE DE BORD — onglet Chantier naval (#shipyardOverlay) (L1.6)
   ========================================================================= */
/* @provides CONSOLE.yard @requires CONSOLE, CONSOLE.view @requires-engine isNearPortService, LOCAL */
(function(){
  'use strict';

  function shown(n){ return n.classList.contains('visible'); }

  let hosted = false;
  function ensureHost(){
    if(!hosted && document.getElementById('shipyardOverlay'))
      hosted = CONSOLE.view.host('yard', 'shipyardOverlay', shown);
  }

  CONSOLE.register({
    id: 'yard',
    order: 50,
    labelKey: 'conTabYard',
    fkey: 'F5',
    keys: [],
    visible: function(){ ensureHost(); return isNearPortService(); },
    onShow: function(){
      ensureHost();
      const el = document.getElementById('shipyardOverlay');
      if(el && !shown(el) && typeof LOCAL !== 'undefined') LOCAL.openShipyard();
    },
    onHide: function(reason){
      if(reason === 'legacy') return;
      if(typeof LOCAL !== 'undefined') LOCAL.closeShipyard();
    }
  });

  ensureHost();
})();
