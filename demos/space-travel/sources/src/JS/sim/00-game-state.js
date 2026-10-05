/* =========================================================================
   CAMPAGNE 1. ÉTAT DE PARTIE — GAME : état SPEC-010 § 2.5, événements, commandes, horloge
   Couche simulation : ni THREE ni DOM. L'état est du JSON pur, sauvegardable tel quel (cf. SAVE).
   ========================================================================= */
/* @provides GAME */
const GAME = (function(){
  const LEDGER_MAX = 200;                   // entrées conservées dans state.ledger (les plus anciennes sont écartées)
  let state = null;                         // null = Partie libre
  const listeners = Object.create(null);    // événement -> [{ fn, off }]

  function warn(msg, err){ if(typeof console !== 'undefined') console.error(msg, err); }

  /* ---- événements ------------------------------------------------------ */
  /* on() renvoie la fonction de désabonnement (idempotente) */
  function on(evt, fn){
    if(typeof fn !== 'function') throw new TypeError('ecouteur_invalide');
    const entry = { fn: fn, off: false };
    (listeners[evt] || (listeners[evt] = [])).push(entry);
    return function(){
      if(entry.off) return;
      entry.off = true;
      const l = listeners[evt], i = l ? l.indexOf(entry) : -1;
      if(i >= 0) l.splice(i, 1);
    };
  }

  /* Une erreur d'écouteur est journalisée, jamais propagée ; un écouteur désabonné en cours d'émission n'est pas appelé */
  function emit(evt, data){
    const l = listeners[evt];
    if(!l) return;
    l.slice().forEach(function(e){
      if(e.off) return;
      try{ e.fn(data); }catch(err){ warn('[GAME] écouteur « ' + evt + ' » :', err); }
    });
  }

  /* ---- cycle de vie de l'état ----------------------------------------- */
  function newCampaign(opts){
    const o = opts || {};
    const credits = (typeof o.startCredits === 'number' && isFinite(o.startCredits)) ? o.startCredits : 0;
    state = {
      v: 1,
      mode: 'campaign',
      seed: String(o.seed == null ? 'STT' : o.seed),
      clock: 0,
      company: { name: 'STT', mark: 'STT', livery_hex: '#2d6cdf', emblem: 'star4', reputation: 0 },
      credits: credits,
      rp: 0,
      ledger: [],
      flagship: 's1',
      ships: [{ id: 's1', name: o.name || 'STT Courlis', comp: o.starter || 'stt-courlis', wear: 0, fuel: 1, at: null, order: null, crew: [] }],
      blueprints: {},
      crew: [],
      tech: { done: [], queue: [] },
      stations: [],
      missions: { active: null, serial: 0 },
      flags: {}
    };
    emit('new', state);
    return state;
  }

  function load(s){
    if(!s || typeof s !== 'object') throw new Error('etat_invalide');
    state = s;
    emit('loaded', state);
    return state;
  }

  function reset(){ state = null; }
  function mode(){ return state ? 'campaign' : 'free'; }

  /* ---- commandes : seul point d'écriture de l'état par les couches du dessus ---- */
  const COMMANDS = {
    /* { credits, reason } : fixe le solde, journalise le delta [clock, raison, delta] */
    'credits.set': function(a){
      if(typeof a.credits !== 'number' || !isFinite(a.credits)) throw new Error('credits_invalide');
      const delta = a.credits - state.credits;
      const reason = String(a.reason || 'divers');
      state.credits = a.credits;
      if(!Array.isArray(state.ledger)) state.ledger = [];
      state.ledger.push([state.clock, reason, delta]);
      if(state.ledger.length > LEDGER_MAX) state.ledger.splice(0, state.ledger.length - LEDGER_MAX);
      emit('credits', { credits: state.credits, delta: delta, reason: reason });
      return state.credits;
    }
  };

  function cmd(name, args){
    const fn = Object.prototype.hasOwnProperty.call(COMMANDS, name) ? COMMANDS[name] : null;
    if(!fn) throw new Error('cmd_inconnue');
    if(!state) throw new Error('pas_de_campagne');
    return fn(args || {});
  }

  /* ---- horloge : secondes de jeu actif (l'appelant ne tique ni en pause ni hors partie) ---- */
  /* clock est arrondie à la milliseconde (pas de dérive 0,1 × 10) ; un événement tick {clock} par seconde entière franchie */
  function tick(dt){
    if(!state || typeof dt !== 'number' || !(dt > 0) || !isFinite(dt)) return null;
    const avant = Math.floor(state.clock);
    state.clock = Math.round((state.clock + dt) * 1000) / 1000;
    const apres = Math.floor(state.clock);
    for(let s = avant + 1; s <= apres; s++) emit('tick', { clock: s });
    return state.clock;
  }

  return {
    get state(){ return state; },
    newCampaign: newCampaign, load: load, reset: reset, mode: mode,
    on: on, emit: emit, cmd: cmd, tick: tick
  };
})();
