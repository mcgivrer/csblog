/* =========================================================================
   CAMPAGNE 1. CONSOLE DE BORD — onglet Aide · Réglages (#helpOverlay puis #audioOverlay) (L1.3)
   ========================================================================= */
/* @provides CONSOLE.help @requires CONSOLE, CONSOLE.view */
(function(){
  'use strict';

  function node(id){ return document.getElementById(id); }
  function shown(n){ return n.classList.contains('visible'); }
  function isOn(id){ const n = node(id); return !!(n && shown(n)); }

  CONSOLE.register({
    id: 'help',
    order: 90,
    labelKey: 'conTabHelp',
    fkey: null,
    keys: ['KeyH', 'KeyV'],
    visible: function(){ return true; },
    onShow: function(){
      const n = node('helpOverlay');
      if(n) n.classList.add('visible');
    },
    onHide: function(reason){
      if(reason === 'legacy') return;
      const h = node('helpOverlay'), a = node('audioOverlay');
      if(h) h.classList.remove('visible');
      if(a) a.classList.remove('visible');
    }
  });

  CONSOLE.view.host('help', 'helpOverlay', shown);
  CONSOLE.view.host('help', 'audioOverlay', shown);

  /* V : ouvre l'aide, affiche les volumes et y fait défiler ; seconde pression :
     retire les volumes, et ferme la console si l'aide n'est plus affichée. */
  function toggleAudio(){
    const a = node('audioOverlay');
    if(!a) return;
    if(CONSOLE.isOpen('help') && shown(a)){
      a.classList.remove('visible');
      if(!isOn('helpOverlay')) CONSOLE.close('user');
      return;
    }
    CONSOLE.open('help');
    a.classList.add('visible');
    /* #audioOverlay reste display:none tant que l'observateur n'a pas posé data-con-shown (microtâche) */
    if(typeof a.scrollIntoView === 'function'){
      const go = function(){ a.scrollIntoView({ block: 'nearest' }); };
      if(typeof requestAnimationFrame === 'function') requestAnimationFrame(go); else setTimeout(go, 0);
    }
  }

  CONSOLE.help = { toggleAudio: toggleAudio };
})();
