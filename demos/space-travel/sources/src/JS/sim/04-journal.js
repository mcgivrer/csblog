/* =========================================================================
   CAMPAGNE 1b. JOURNAL — radio, grand livre et événements de bord : anneau de 300 entrées, lecture fusionnée, détection
   Couche simulation : ni THREE ni DOM. Détails (entrées, instantanés de detect, codes) plus bas.
   ========================================================================= */
/* @provides JOURNAL @requires GAME */
/* Entrées { seq, t, kind, ... }, t = secondes de jeu actif.
     radio { from:'ship'|'tower', who, text }   fin { reason, delta, bal }   evt { code, a, b, imp }
   En campagne, les « fin » ne sont pas stockées ici : la source est state.ledger (cf. ledgerRows) ; les « evt » sont
   aussi sauvegardés par GAME.cmd('journal.push') (state.journal) et réinjectés par restore(). La radio reste en mémoire.
   detect(prev, snap) est pur : il compare deux instantanés du moteur (remplis par l'adaptateur de L1.13) :
     { phase:      REAL.phase ('JUMP' | 'WARP' | 'WARPOUT' | 'ORBIT' | autre ; null/undefined ok),
       legName:    nom de l'étape en cours (REAL.leg.name) ou null,
       missionTarget: nom de la cible de mission (REAL.mission.target.name) ou null,
       active:     mission acceptée { id, dest, reward } ou null (MISSIONS.state.active),
       doneCount:  nombre de missions livrées (MISSIONS.state.done.length),
       jump:       booléen, saut quantique classique en cours (jumpState),
       nearPort:   faux, vrai, ou nom du port (isNearPortService),
       fuelRatio:  fuel / FUEL_CAPACITY (0..1),
       fuelWarn, fuelCrit: seuils FUEL_WARN_RATIO / FUEL_CRIT_RATIO (défauts 0.25 / 0.10) }
   Codes : msn.accept (a = destination, b = prime), msn.done (imp), jump (a = étape), arrive (a = étape),
   orbit (a = cible, sur front → 'ORBIT'), dock (a = port), fuel.low (imp, b = %), fuel.crit (imp, b = %).
   ------------------------------------------------------------------------- */
const JOURNAL = (function(){
  const RING_MAX = 300;                     // entrées conservées, toutes rubriques (les plus anciennes sont écartées)
  const IMPORTANT = { 'msn.done': 1, 'fuel.low': 1, 'fuel.crit': 1 };
  let ring = [];
  let seq = 0;                              // dernier numéro attribué
  let readSeq = 0;                          // dernier numéro lu (markRead)
  let freeClock = 0;                        // horloge de la Partie libre (pas de GAME.state)
  const listeners = Object.create(null);

  function warn(msg, err){ if(typeof console !== 'undefined') console.error(msg, err); }

  /* ---- événements : même contrat que GAME.on / GAME.emit ---- */
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
  function emit(evt, data){
    const l = listeners[evt];
    if(!l) return;
    l.slice().forEach(function(e){
      if(e.off) return;
      try{ e.fn(data); }catch(err){ warn('[JOURNAL] écouteur « ' + evt + ' » :', err); }
    });
  }

  /* ---- horloge ---- */
  function now(){ return GAME.state ? GAME.state.clock : freeClock; }
  function tickFree(dt){
    if(typeof dt !== 'number' || !(dt > 0) || !isFinite(dt)) return freeClock;
    freeClock = Math.round((freeClock + dt) * 1000) / 1000;
    return freeClock;
  }

  /* ---- collecte ---- */
  /* add(e) : e = { kind, ... } (t facultatif : now()) ; renvoie l'entrée. En campagne une « fin » n'est pas stockée
     (state.ledger fait foi) mais l'entrée est rendue et l'événement émis. */
  function add(e){
    if(!e || typeof e !== 'object') throw new TypeError('entree_invalide');
    if(e.kind !== 'radio' && e.kind !== 'fin' && e.kind !== 'evt') throw new Error('kind_invalide');
    const entry = Object.assign({}, e, { seq: ++seq, t: (typeof e.t === 'number' && isFinite(e.t)) ? e.t : now() });
    if(entry.kind === 'evt' && entry.imp === undefined) entry.imp = !!IMPORTANT[entry.code];
    if(!(entry.kind === 'fin' && GAME.state)){
      ring.push(entry);
      if(ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX);
    }
    emit('add', entry);
    return entry;
  }

  /* Grand livre de la campagne : [{ t, kind:'fin', reason, delta, bal }] chronologique, bal recalculé à rebours depuis st.credits */
  function ledgerRows(st){
    if(!st || !Array.isArray(st.ledger)) return [];
    const rows = new Array(st.ledger.length);
    let bal = typeof st.credits === 'number' ? st.credits : 0;
    for(let i = st.ledger.length - 1; i >= 0; i--){
      const l = st.ledger[i];
      rows[i] = { t: l[0], kind: 'fin', reason: l[1], delta: l[2], bal: bal };
      bal -= l[2];
    }
    return rows;
  }

  /* list({ kinds, limit }) : plus récent d'abord ; en campagne, anneau fusionné avec ledgerRows (tri stable par t) */
  function list(o){
    const opt = o || {};
    const kinds = Array.isArray(opt.kinds) && opt.kinds.length ? opt.kinds : null;
    const ok = r => !kinds || kinds.indexOf(r.kind) >= 0;
    let out = ring.filter(ok).reverse();
    if(GAME.state){
      const fin = kinds && kinds.indexOf('fin') < 0 ? [] : ledgerRows(GAME.state).reverse();
      out = out.concat(fin).sort((x, y) => y.t - x.t);
    }
    if(typeof opt.limit === 'number' && opt.limit >= 0) out = out.slice(0, opt.limit);
    return out;
  }

  function unread(){
    let n = 0;
    for(let i = 0; i < ring.length; i++) if(ring[i].seq > readSeq && ring[i].kind === 'evt' && ring[i].imp) n++;
    return n;
  }
  function markRead(){ readSeq = seq; }

  /* restore(arr) : remplace l'anneau par les événements sauvegardés [t, code, a, b] (undefined accepté = journal vide) ;
     les entrées restaurées sont considérées comme lues. */
  function restore(arr){
    ring = []; seq = 0; readSeq = 0;
    (Array.isArray(arr) ? arr : []).forEach(function(r){
      if(!Array.isArray(r) || typeof r[1] !== 'string') return;
      ring.push({ seq: ++seq, t: typeof r[0] === 'number' ? r[0] : 0, kind: 'evt', code: r[1], a: r[2], b: r[3], imp: !!IMPORTANT[r[1]] });
    });
    if(ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX);
    readSeq = seq;
    emit('restore', null);
  }

  /* ---- détection : pure, sans état ; prev null (premier instantané ou reprise) -> aucun événement ---- */
  const LEAP = { JUMP: 1, WARP: 1 };
  function detect(prev, snap){
    const out = [];
    if(!prev || !snap) return out;
    const evt = (code, a, b) => out.push({ kind: 'evt', code: code, a: a === undefined ? null : a, b: b === undefined ? null : b, imp: !!IMPORTANT[code] });
    const leg = snap.legName || prev.legName || null;
    const pa = prev.active, sa = snap.active;
    if(sa && (!pa || pa.id !== sa.id)) evt('msn.accept', sa.dest, sa.reward);
    if((snap.doneCount | 0) > (prev.doneCount | 0)){
      const m = pa || sa;
      evt('msn.done', m ? m.dest : null, m ? m.reward : null);
    }
    if((LEAP[snap.phase] && !LEAP[prev.phase]) || (snap.jump && !prev.jump)) evt('jump', leg);
    if((snap.phase === 'WARPOUT' && prev.phase !== 'WARPOUT') || (prev.jump && !snap.jump)) evt('arrive', leg);
    if(snap.phase === 'ORBIT' && prev.phase !== 'ORBIT') evt('orbit', snap.missionTarget || leg);
    if(snap.nearPort && !prev.nearPort) evt('dock', typeof snap.nearPort === 'string' ? snap.nearPort : null);
    const warnR = typeof snap.fuelWarn === 'number' ? snap.fuelWarn : 0.25;
    const critR = typeof snap.fuelCrit === 'number' ? snap.fuelCrit : 0.10;
    const pf = prev.fuelRatio, sf = snap.fuelRatio;
    if(typeof pf === 'number' && typeof sf === 'number'){
      const pct = Math.round(sf * 100);
      if(sf <= critR && pf > critR) evt('fuel.crit', null, pct);
      else if(sf <= warnR && sf > critR && pf > warnR) evt('fuel.low', null, pct);
    }
    return out;
  }

  function _reset(){
    ring = []; seq = 0; readSeq = 0; freeClock = 0;
    Object.keys(listeners).forEach(k => { delete listeners[k]; });
  }

  return {
    RING_MAX: RING_MAX,
    add: add, list: list, ledgerRows: ledgerRows, unread: unread, markRead: markRead,
    on: on, now: now, tickFree: tickFree, detect: detect, restore: restore, _reset: _reset
  };
})();
