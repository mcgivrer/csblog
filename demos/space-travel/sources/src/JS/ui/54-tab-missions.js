/* =========================================================================
   CAMPAGNE 1. CONSOLE DE BORD — onglet Missions (#missionBoardOverlay, #contractBoardOverlay) (L1.5)
   ========================================================================= */
/* @provides CONSOLE.missions @requires CONSOLE, CONSOLE.view @requires-engine MISSIONS, LOCAL, t */
(function(){
  'use strict';

  const st = document.createElement('style');
  st.textContent = [
    '#sttConsole .con-panel[data-tab="missions"] .con-empty{ padding:18px; text-align:center; opacity:.7; }',
    '#sttConsole .con-panel[data-tab="missions"]:has(.con-hosted[data-con-shown]) .con-empty{ display:none; }'
  ].join('\n');
  document.head.appendChild(st);

  function node(id){ return document.getElementById(id); }
  function missionShown(n){ return n.style.display === 'flex'; }
  function contractShown(n){ return n.classList.contains('visible'); }
  function isUp(id, fn){ const n = node(id); return !!(n && fn(n)); }

  /* #missionBoardOverlay est créé tardivement par MISSIONS (ensureDom) : hôte posé dès qu'il existe */
  let hostedMission = false, hostedContract = false, empty = null;
  function ensureHosts(){
    if(!hostedContract && node('contractBoardOverlay'))
      hostedContract = CONSOLE.view.host('missions', 'contractBoardOverlay', contractShown);
    if(!hostedMission && node('missionBoardOverlay'))
      hostedMission = CONSOLE.view.host('missions', 'missionBoardOverlay', missionShown);
    const p = document.querySelector('#sttConsole .con-panel[data-tab="missions"]');
    if(p){
      if(!empty){ empty = document.createElement('div'); empty.className = 'con-empty'; }
      if(empty.parentNode !== p) p.insertBefore(empty, p.firstChild);
      empty.textContent = t('conEmptyMissions');
    }
  }

  CONSOLE.register({
    id: 'missions',
    order: 30,
    labelKey: 'conTabMissions',
    fkey: 'F3',
    keys: ['KeyJ'],
    visible: function(){ ensureHosts(); return true; },
    onShow: function(){
      ensureHosts();
      if(isUp('missionBoardOverlay', missionShown) || isUp('contractBoardOverlay', contractShown)) return;
      if(typeof MISSIONS !== 'undefined' && MISSIONS.enabled()){ MISSIONS.toggleBoard(); ensureHosts(); }
      else if(typeof LOCAL !== 'undefined' && typeof REAL !== 'undefined' && REAL.leg) LOCAL.openContractBoard();
    },
    onHide: function(reason){
      if(reason === 'legacy') return;
      /* fermeture par le joueur : MISSIONS marque « dismissed » (pas de réouverture avant la prochaine escale) */
      if(isUp('missionBoardOverlay', missionShown) && typeof MISSIONS !== 'undefined') MISSIONS.closeBoard(true);
      if(isUp('contractBoardOverlay', contractShown) && typeof LOCAL !== 'undefined') LOCAL.closeContractBoard();
    }
  });

  ensureHosts();
})();
