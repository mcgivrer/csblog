/* =========================================================================
   CAMPAGNE 1. CONSOLE DE BORD — onglet Navigation (#stmMap, carte de l'univers) (L1.4)
   ========================================================================= */
/* @provides CONSOLE.nav @requires CONSOLE, CONSOLE.view @requires-engine gameStarted, openStarMap, closeStarMap */
(function(){
  'use strict';

  /* Dans le panneau, la carte épouse l'espace du corps de la console (le module partagé la dimensionne
     sur la fenêtre : 95vw × 92vh) ; son canevas mesure .view, d'où le resize après ouverture. */
  const st = document.createElement('style');
  st.textContent = [
    '#sttConsole .con-panel[data-tab="nav"]{ padding:0; height:100%; }',
    '#sttConsole #stmMap.con-hosted{ height:100% !important; }',
    '#sttConsole #stmMap.con-hosted.on{ display:block; }',
    '#sttConsole #stmMap .p{ width:100%; height:100%; border:0; }'
  ].join('\n');
  document.head.appendChild(st);

  let hosted = false;
  function shown(n){ return n.classList.contains('on'); }
  /* #stmMap est créé par shared/starmap.js : l'hôte est posé dès que le nœud existe */
  function ensureHost(){
    if(hosted) return true;
    if(!document.getElementById('stmMap')) return false;
    hosted = CONSOLE.view.host('nav', 'stmMap', shown);
    return hosted;
  }

  CONSOLE.register({
    id: 'nav',
    order: 20,
    labelKey: 'conTabNav',
    fkey: 'F2',
    keys: ['KeyM', 'Semicolon'],
    visible: function(){ ensureHost(); return !!gameStarted && !!window.__STARMAP; },
    onShow: function(){
      ensureHost();
      openStarMap();
      /* le panneau n'est affiché qu'après onShow : une seconde mesure suit la mise en page */
      const fit = function(){ window.dispatchEvent(new Event('resize')); };
      fit();
      if(typeof requestAnimationFrame === 'function') requestAnimationFrame(fit);
      setTimeout(fit, 60);
    },
    onHide: function(reason){
      if(reason === 'legacy') return;
      closeStarMap();
    }
  });

  ensureHost();
})();
