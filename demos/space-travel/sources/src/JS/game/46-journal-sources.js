/* =========================================================================
   CAMPAGNE 1b. SOURCES DU JOURNAL — adaptateur : radio, finances (avec motif) et événements de bord
   Branche JOURNAL (sim/04) sur le moteur sans modifier celui-ci, hors le 2e argument « reason » des addCredits.
   ========================================================================= */
/* @provides JOURNAL.sources @requires JOURNAL, GAME @requires-engine addCredits, credits, appendRadioLine, REAL, MISSIONS, fuel, FUEL_CAPACITY, FUEL_WARN_RATIO, FUEL_CRIT_RATIO, jumpState, isNearPortService, gameStarted, gamePaused */
(function(){
  const PERIOD = 250;                       // ms entre deux instantanés
  let prev = null;                          // instantané précédent (null : premier ou reprise -> aucun événement)

  /* ---- radio : enveloppe de appendRadioLine, texte brut, mémoire seule ---- */
  if(typeof appendRadioLine === 'function'){
    const radio0 = appendRadioLine;
    appendRadioLine = function(entry){
      const r = radio0.apply(this, arguments);
      try{
        if(entry) JOURNAL.add({ kind: 'radio', from: entry.from === 'tower' ? 'tower' : 'ship', who: entry.label, text: String(entry.text == null ? '' : entry.text) });
      }catch(err){ console.error('[JOURNAL] radio :', err); }
      return r;
    };
  }

  /* ---- finances : en libre, delta réel et solde ; en campagne le grand livre (state.ledger) fait foi (cf. 45) ---- */
  if(typeof addCredits === 'function'){
    const credits0 = addCredits;
    addCredits = function(amount, reason){
      const before = credits;
      const r = credits0.apply(this, arguments);
      try{
        if(!GAME.state){
          const delta = credits - before;
          JOURNAL.add({ kind: 'fin', reason: reason || 'jeu', delta: delta, bal: credits });
        }
      }catch(err){ console.error('[JOURNAL] finances :', err); }
      return r;
    };
  }

  /* ---- événements : instantané du moteur ---- */
  function snapshot(){
    const s = { phase: null, legName: null, missionTarget: null, active: null, doneCount: 0, jump: false, nearPort: false,
                fuelRatio: 1, fuelWarn: 0.25, fuelCrit: 0.10 };
    try{ s.phase = REAL.phase || null; }catch(e){}
    try{ s.legName = (REAL.leg && REAL.leg.name) || null; }catch(e){}
    try{ s.missionTarget = (REAL.mission && REAL.mission.target && REAL.mission.target.name) || null; }catch(e){}
    try{
      const a = MISSIONS.state.active;
      s.active = a ? { id: a.id, dest: a.dest ? a.dest.name : null, reward: a.reward } : null;
    }catch(e){}
    try{ s.doneCount = MISSIONS.state.done.length; }catch(e){}
    try{ s.jump = !!jumpState; }catch(e){}
    try{ s.nearPort = isNearPortService() || false; }catch(e){}
    try{ s.fuelRatio = fuel / FUEL_CAPACITY; }catch(e){}
    try{ s.fuelWarn = FUEL_WARN_RATIO; s.fuelCrit = FUEL_CRIT_RATIO; }catch(e){}
    return s;
  }

  function sample(){
    let on = false;
    try{ on = gameStarted && !gamePaused; }catch(e){}
    if(!on) return;
    if(!GAME.state) JOURNAL.tickFree(PERIOD / 1000);
    const snap = snapshot();
    const evts = JOURNAL.detect(prev, snap);
    prev = snap;
    evts.forEach(function(evt){
      const e = JOURNAL.add(evt);
      if(GAME.state){
        try{ GAME.cmd('journal.push', { e: [e.t, e.code, e.a, e.b] }); }catch(err){ console.error('[JOURNAL] push :', err); }
      }
    });
  }

  /* reprise / nouvelle campagne : journal sauvegardé restauré, puis instantané neuf (aucun événement fantôme) */
  function reset(){
    JOURNAL.restore((GAME.state && GAME.state.journal) || []);
    prev = null;
  }
  GAME.on('new', reset);
  GAME.on('loaded', reset);

  setInterval(sample, PERIOD);
})();
