/* =========================================================================
   CAMPAGNE 1. CONSOLE DE BORD — CONSOLE : modèle des onglets, événements, table des touches (L1)
   Couche pure : ni THREE ni DOM. La vue (51-console-view.js) et les onglets s'y inscrivent.
   ========================================================================= */
/* @provides CONSOLE */
const CONSOLE = (function(){
  const tabs = [];                          // onglets inscrits, triés par order
  const listeners = Object.create(null);    // événement -> [{ fn, off }]
  const badgeMap = Object.create(null);     // id -> n (> 0 ; absent = pas de pastille)
  let current = null;                       // id de l'onglet affiché, null = console fermée
  let last = null;                          // dernier onglet affiché (survit à la fermeture)
  let visibleIds = '';                      // signature des onglets visibles à la dernière évaluation

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
      try{ e.fn(data); }catch(err){ warn('[CONSOLE] écouteur « ' + evt + ' » :', err); }
    });
  }

  /* ---- onglets --------------------------------------------------------- */
  function find(id){
    for(let i = 0; i < tabs.length; i++) if(tabs[i].id === id) return tabs[i];
    return null;
  }

  /* Une exception dans visible() vaut « invisible » */
  function isVisible(t){
    if(typeof t.visible !== 'function') return true;
    try{ return !!t.visible(); }catch(err){ warn('[CONSOLE] visible() de « ' + t.id + ' » :', err); return false; }
  }

  function visibleTabs(){ return tabs.filter(isVisible); }
  function signature(){ return visibleTabs().map(function(t){ return t.id; }).join(','); }
  function ids(sig){ return sig ? sig.split(',') : []; }

  /* def : { id, order, labelKey, fkey, keys, visible, onShow, onHide } ; doublon d'id -> Error('onglet_double') */
  function register(def){
    if(!def || typeof def.id !== 'string' || !def.id) throw new TypeError('onglet_invalide');
    if(find(def.id)) throw new Error('onglet_double');
    const t = {
      id: def.id,
      order: typeof def.order === 'number' ? def.order : 100,
      labelKey: def.labelKey || null,
      fkey: def.fkey || null,
      keys: Array.isArray(def.keys) ? def.keys.slice() : [],
      visible: def.visible,
      onShow: def.onShow,
      onHide: def.onHide,
      panel: null                           // renseigné par la vue : élément passé à onShow
    };
    tabs.push(t);
    tabs.sort(function(a, b){ return a.order - b.order; });   // tri stable : à égalité, ordre d'inscription
    visibleIds = signature();
    emit('tabs', { ids: ids(visibleIds) });
    return t;
  }

  function call(t, fn, arg){
    if(typeof fn !== 'function') return;
    try{ fn.call(t, arg); }catch(err){ warn('[CONSOLE] onglet « ' + t.id + ' » :', err); }
  }

  /* ---- ouverture / fermeture ------------------------------------------- */
  /* Sans id : dernier onglet visible, sinon premier visible. Refuse un onglet inconnu ou invisible. */
  function open(id){
    let t;
    if(id == null){
      t = last ? find(last) : null;
      if(!t || !isVisible(t)) t = visibleTabs()[0] || null;
    }else{
      t = find(id);
      if(t && !isVisible(t)) t = null;
    }
    if(!t) return false;
    if(current === t.id) return true;
    const from = current;
    if(from){ const p = find(from); call(p, p.onHide, 'switch'); }
    current = last = t.id;
    call(t, t.onShow, t.panel);
    if(from) emit('tab', { from: from, to: t.id });
    else emit('open', { id: t.id });
    return true;
  }

  function close(reason){
    if(!current) return false;
    const r = reason === undefined ? 'user' : reason;
    const id = current, t = find(id);
    current = null;
    call(t, t.onHide, r);
    emit('close', { id: id, reason: r });
    return true;
  }

  /* Ouvert sur id -> ferme ; sinon ouvre id */
  function toggle(id){
    if(current === id){ close('user'); return true; }
    return open(id);
  }

  /* Réévalue les visible() ; vrai si l'ensemble visible a changé ou si l'onglet courant a été fermé */
  function refresh(){
    let changed = false;
    const sig = signature();
    if(sig !== visibleIds){
      visibleIds = sig;
      changed = true;
      emit('tabs', { ids: ids(sig) });
    }
    if(current){
      const t = find(current);
      if(!t || !isVisible(t)){ close('hidden'); changed = true; }
    }
    return changed;
  }

  /* ---- pastilles (API seule, alimentée à partir de L2) ------------------ */
  function badge(id, n){
    const v = (typeof n === 'number' && isFinite(n) && n > 0) ? Math.floor(n) : null;
    if(v === null){
      if(!(id in badgeMap)) return;
      delete badgeMap[id];
    }else{
      if(badgeMap[id] === v) return;
      badgeMap[id] = v;
    }
    emit('badge', { id: id, n: v });
  }
  function badges(){ return Object.assign({}, badgeMap); }

  /* ---- touches ----------------------------------------------------------
     Pure : décide seulement. k = { code, altKey, ctrlKey, metaKey, shiftKey, repeat }, ctx = { started, paused, typing }.
     Renvoie { act:'toggle', tab } | { act:'last' } | { act:'close' } | { act:'hud', index }
           | { act:'swallow' } | { act:'reserved' } | null (touche non traitée : le jeu la garde). */
  function keyAction(k, ctx){
    if(!k || !ctx || !ctx.started || ctx.paused || ctx.typing) return null;
    if(k.ctrlKey || k.metaKey) return null;                    // raccourcis du navigateur : jamais touchés
    const code = k.code, isOpen = current !== null;

    /* touches 1 à 8 SANS modificateur (décision du mainteneur 06/10 : le navigateur capte Alt+n) : panneaux du HUD,
       console ouverte comprise. Avec Alt ou Maj : rien (Alt+n, Maj+n restent au navigateur / au jeu). */
    const dig = /^Digit([1-8])$/.exec(code);
    if(dig) return (k.altKey || k.shiftKey) ? null : { act: 'hud', index: Number(dig[1]) - 1 };

    if(isOpen){
      if(code === 'KeyP' || code === 'Pause' || code === 'F9' || code === 'F10') return null;
      if(k.altKey) return { act: 'swallow' };
    }else if(k.altKey) return null;

    if(code === 'Escape') return isOpen ? { act: 'close' } : null;   // fermée : la pause garde Échap
    if(k.repeat) return isOpen ? { act: 'swallow' } : null;

    if(code === 'Tab') return isOpen ? { act: 'close' } : { act: 'last' };

    if(/^F[1-8]$/.test(code)){
      const f = tabs.filter(function(x){ return x.fkey === code; })[0];
      return f ? { act: 'toggle', tab: f.id } : { act: 'reserved' };
    }

    if(code === 'Space' || code === 'Enter' || code === 'NumpadEnter'){
      return isOpen ? (current === 'nav' ? { act: 'close' } : { act: 'swallow' }) : null;
    }

    const t = tabs.filter(function(x){ return x.keys.indexOf(code) >= 0; })[0];
    if(t) return { act: 'toggle', tab: t.id };

    return isOpen ? { act: 'swallow' } : null;
  }

  /* Remise à zéro (tests) */
  function _reset(){
    tabs.length = 0;
    Object.keys(listeners).forEach(function(k){ delete listeners[k]; });
    Object.keys(badgeMap).forEach(function(k){ delete badgeMap[k]; });
    current = null; last = null; visibleIds = '';
  }

  return {
    register: register,
    tabs: function(){ return tabs.slice(); },
    visibleTabs: visibleTabs,
    current: function(){ return current; },
    last: function(){ return last; },
    isOpen: function(id){ return id === undefined ? current !== null : current === id; },
    open: open, close: close, toggle: toggle, refresh: refresh,
    badge: badge, badges: badges,
    on: on, keyAction: keyAction,
    _reset: _reset
  };
})();
