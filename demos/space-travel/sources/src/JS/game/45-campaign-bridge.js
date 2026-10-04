/* =========================================================================
   CAMPAGNE 5. PONT — BRIDGE : choix du mode, reprise, synchro crédits / horloge, sauvegarde automatique, menu pause
   Seule couche de la campagne qui touche au DOM et au moteur historique ; GAME, SAVE et DATA restent purs.
   Partie libre : rien n'est posé (ni enveloppe, ni minuterie, ni bouton) tant qu'une campagne n'est pas lancée.
   ========================================================================= */
/* @provides BRIDGE @requires GAME, SAVE, DATA @requires-engine addCredits, credits, refreshCreditsDisplay, MODSHIP, MISSIONS, SHIPGEN, SEED, LANG, t, gameStarted, gamePaused, jumpState */
const BRIDGE = (function(){
  const KINDS = ['new', 'continue', 'free'];                 // ordre d'affichage et de navigation
  const LABELS = { new: ['modeNew', 'modeNewSub'], 'continue': ['modeContinue', 'modeContinueSub'], free: ['modeFree', 'modeFreeSub'] };
  const RESUME_FLAG = 'stt.resume';                          // sessionStorage : « reprendre la campagne sans fenêtre » après rechargement
  let box = null, opts = {}, ui = {};                        // fenêtre du choix de mode (créée au premier appel)
  let open = false, busy = false, confirming = false, onFree = null;
  let linked = false;                                        // liens avec le moteur posés (une seule fois par page)
  let lastSaveClock = 0, lastDone = 0, pendingSave = false;  // sauvegarde automatique
  let pauseMsg = null;

  function el(tag, cls, text){
    const e = document.createElement(tag);
    if(cls) e.className = cls;
    if(text != null) e.textContent = text;
    return e;
  }

  /* lecture d'un fichier choisi par le joueur : texte -> état (SAVE.parse refuse l'invalide et le trop récent) */
  function readSaveFile(file, then, onError){
    file.text().then(function(txt){ then(SAVE.parse(txt)); }).catch(onError);
  }

  /* ---------- fenêtre du choix de mode ---------- */
  function build(){
    box = el('div'); box.id = 'modeSelect';
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'msTitle');
    const panel = el('div', 'ms-panel');
    ['tl', 'tr', 'bl', 'br'].forEach(function(c){ panel.appendChild(el('span', 'ss-c ' + c)); });   // angles ambrés des overlays existants
    const h = el('h2', 'ms-title'); h.id = 'msTitle';
    panel.appendChild(h);
    const list = el('div', 'ms-list');
    KINDS.forEach(function(k){
      const b = el('button', 'ms-opt'); b.type = 'button'; b.setAttribute('data-mode', k);
      b.appendChild(el('span', 'ms-lbl')); b.appendChild(el('small', 'ms-sub'));
      b.addEventListener('click', function(){ choose(k); });
      list.appendChild(b); opts[k] = b;
    });
    panel.appendChild(list);
    /* remplacement d'une campagne existante : Confirmer / Annuler + export de la sauvegarde avant */
    const ask2 = el('div', 'ms-row ms-confirm');
    ui.confirm = el('button', 'ms-btn ms-go'); ui.cancel = el('button', 'ms-btn'); ui.exportFirst = el('button', 'ms-link');
    ui.confirm.setAttribute('data-act', 'confirm'); ui.cancel.setAttribute('data-act', 'cancel'); ui.exportFirst.setAttribute('data-act', 'export');
    [ui.confirm, ui.cancel, ui.exportFirst].forEach(function(b){ b.type = 'button'; ask2.appendChild(b); });
    ui.confirm.addEventListener('click', function(){ if(open && !busy) startNew(); });
    ui.cancel.addEventListener('click', function(){ if(open && !busy) ask(false, true); });
    ui.exportFirst.addEventListener('click', function(){ if(open && !busy) say(exportStored() ? 'saveDone' : 'saveError'); });
    panel.appendChild(ask2);
    /* import d'une sauvegarde depuis l'écran-titre */
    const foot = el('div', 'ms-row ms-foot');
    ui.import = el('button', 'ms-link'); ui.import.type = 'button'; ui.import.setAttribute('data-act', 'import');
    ui.file = el('input'); ui.file.type = 'file'; ui.file.id = 'msImportFile'; ui.file.accept = '.json,application/json'; ui.file.hidden = true;
    ui.import.addEventListener('click', function(){ if(!open || busy) return; ui.file.value = ''; ui.file.click(); });
    ui.file.addEventListener('change', function(){
      const f = ui.file.files && ui.file.files[0]; if(!f || !open || busy) return;
      readSaveFile(f, function(s){ busy = true; if(!resume(s)) fail(); }, function(){ fail(); });
    });
    foot.appendChild(ui.import); foot.appendChild(ui.file);
    panel.appendChild(foot);
    ui.msg = el('div', 'ms-msg'); ui.msg.setAttribute('aria-live', 'polite');
    panel.appendChild(ui.msg);
    box.appendChild(panel);
    document.body.appendChild(box);
  }

  function say(key){ ui.msg.textContent = t(key); }

  /* boutons actifs et visibles de la fenêtre, dans l'ordre du DOM (navigation au clavier) */
  function focusables(){
    return Array.prototype.filter.call(box.querySelectorAll('button'), function(b){ return !b.disabled && b.tabIndex >= 0 && b.offsetParent !== null; });
  }

  function focusOpt(k){ if(opts[k]) opts[k].focus(); }

  /* demande de confirmation avant de remplacer la campagne (deux temps) */
  function ask(on, refocus){
    confirming = on;
    box.classList.toggle('confirming', on);
    opts['new'].firstChild.textContent = t(on ? 'modeReplace' : 'modeNew');
    opts['new'].tabIndex = on ? -1 : 0;
    if(refocus) (on ? ui.cancel : opts['new']).focus();       // Annuler par défaut : une touche malheureuse ne détruit rien
  }

  /* la fenêtre du choix de mode ; une reprise demandée avant un rechargement la saute (cf. resume) */
  function chooseMode(freeCb){
    if(open) return;
    if(!box) build();
    onFree = typeof freeCb === 'function' ? freeCb : null;
    document.getElementById('msTitle').textContent = t('modeTitle');
    KINDS.forEach(function(k){
      opts[k].firstChild.textContent = t(LABELS[k][0]);
      opts[k].lastChild.textContent = t(LABELS[k][1]);
    });
    ui.confirm.textContent = t('modeConfirm'); ui.cancel.textContent = t('modeCancel'); ui.exportFirst.textContent = t('modeExportFirst'); ui.import.textContent = t('saveImport');
    opts['continue'].disabled = !SAVE.has();
    ui.msg.textContent = '';
    ask(false, false);
    busy = false; open = true;
    if(takeResumeFlag()){
      const s = SAVE.read();
      if(s){ busy = true; GAME.load(s); launch(); return; }   // fenêtre jamais affichée (fail() la montre si le démarrage échoue)
    }
    reveal();
  }

  function reveal(){
    box.classList.add('open');
    if(document.activeElement && document.activeElement.blur) document.activeElement.blur();
    focusOpt(opts['continue'].disabled ? 'new' : 'continue');
  }

  function close(){ open = false; if(box) box.classList.remove('open'); }

  function fail(){
    busy = false; GAME.reset();
    ask(false, false); reveal(); say('saveError');
  }

  function choose(k){
    if(!open || busy) return;
    if(k === 'free'){
      close(); GAME.reset();
      const f = onFree; onFree = null;
      if(f) f();
      return;
    }
    if(k === 'continue'){
      const s = SAVE.read();
      if(!s){ fail(); return; }
      busy = true;
      if(!resume(s)) fail();
      return;
    }
    if(SAVE.has() && !confirming){ ask(true, true); return; }
    startNew();
  }

  function startNew(){
    busy = true; ask(false, false);
    const eco = DATA.get('economy');
    GAME.newCampaign({ seed: SEED, startCredits: eco.startCredits, starter: eco.starter });
    launch();
  }

  /* télécharge la sauvegarde stockée (exportFile écrit GAME.state : on la charge le temps de l'export) */
  function exportStored(){
    const s = SAVE.read();
    if(!s) return false;
    const prev = GAME.state;
    GAME.load(s);
    const ok = SAVE.exportFile();
    if(prev) GAME.load(prev); else GAME.reset();
    return ok;
  }

  /* ---------- reprise d'une campagne (Continuer, import) : même univers que la sauvegarde ---------- */
  function takeResumeFlag(){
    try{
      if(sessionStorage.getItem(RESUME_FLAG) !== '1') return false;
      sessionStorage.removeItem(RESUME_FLAG);
      return true;
    }catch(e){ return false; }
  }

  /* Écrit l'état dans le slot auto. Si l'univers de la page n'est pas le sien (graine) ou si une partie tourne déjà,
     recharge la page avec ?seed=<graine> (autres paramètres conservés) et pose le drapeau que chooseMode consommera ;
     sinon démarre directement. Faux si le rechargement est nécessaire mais que l'écriture a échoué (état précédent conservé). */
  function resume(state){
    const prev = GAME.state, reload = gameStarted || String(state.seed) !== SEED;
    GAME.load(state);
    const written = SAVE.write();
    if(!reload){ launch(); return true; }
    if(!written){ if(prev) GAME.load(prev); else GAME.reset(); return false; }
    try{ sessionStorage.setItem(RESUME_FLAG, '1'); }catch(e){}
    const u = new URL(location.href);
    u.searchParams.set('seed', String(state.seed));
    if(u.href === location.href) location.reload(); else location.assign(u.href);
    return true;
  }

  /* démarre la partie avec le vaisseau amiral de l'état courant (le pack modulaire doit être décodé) */
  function launch(){
    const st = GAME.state;
    const flag = (st.ships || []).find(function(s){ return s.id === st.flagship; }) || (st.ships || [])[0];
    const id = 'mod_' + (flag ? flag.comp : '');
    MODSHIP.whenReady(function(ok){
      if(!ok || !flag || !SHIPGEN.MODELS.some(function(m){ return m.id === id; })){ fail(); return; }
      credits = st.credits;
      st.flags = st.flags || {}; st.flags.lang = LANG;        // langue de la partie (lecture seule pour l'instant)
      close();
      link();
      window.__sttQuickStart(id, { missions: true });
      lastSaveClock = st.clock; lastDone = MISSIONS.state.done.length; pendingSave = false;
    });
  }

  /* clavier de la fenêtre (capture : l'écran-titre et le jeu ne voient rien tant qu'elle est ouverte) */
  function onKey(e){
    if(!open) return;
    e.stopImmediatePropagation();
    if(busy || !box.classList.contains('open')) return;
    const c = e.code, en = focusables(), cur = en.indexOf(document.activeElement);
    if(!en.length) return;
    if(c === 'ArrowDown' || c === 'ArrowRight' || (c === 'Tab' && !e.shiftKey)){
      e.preventDefault(); en[(cur + 1) % en.length].focus();
    } else if(c === 'ArrowUp' || c === 'ArrowLeft' || (c === 'Tab' && e.shiftKey)){
      e.preventDefault(); en[(cur - 1 + en.length) % en.length].focus();
    } else if(c === 'Enter' || c === 'NumpadEnter' || c === 'Space'){
      e.preventDefault();
      if(!e.repeat) (cur >= 0 ? en[cur] : en[0]).click();   // pas de répétition : la touche qui a ouvert la fenêtre ne valide rien
    } else if(c === 'Escape'){
      e.preventDefault();
      if(confirming) ask(false, true); else choose('free');
    }
  }
  window.addEventListener('keydown', onKey, true);

  /* ---------- liens avec le moteur, posés au lancement d'une campagne ---------- */
  function link(){
    if(linked) return;
    linked = true;
    /* crédits : addCredits reste l'unique point d'écriture du moteur ; GAME.state suit */
    const addCredits0 = addCredits;
    addCredits = function(amount){
      addCredits0(amount);
      const st = GAME.state;
      if(!st || st.credits === credits) return;
      try{ GAME.cmd('credits.set', { credits: credits, reason: 'jeu' }); }catch(err){ console.error('[BRIDGE] crédits :', err); }
    };
    /* horloge : secondes de jeu actif (ni avant le départ, ni en pause) */
    setInterval(function(){ if(GAME.state && gameStarted && !gamePaused) GAME.tick(1); }, 1000);
    GAME.on('tick', onTick);
    /* état chargé en cours de partie (reprise, restauration après échec) : le moteur reprend les crédits */
    GAME.on('loaded', function(st){
      if(!gameStarted) return;
      credits = st.credits; refreshCreditsDisplay(false);
      if(typeof refreshPortPanel === 'function') refreshPortPanel();
      lastSaveClock = st.clock; lastDone = MISSIONS.state.done.length; pendingSave = false;
    });
    pausePanel();
  }

  /* sauvegarde automatique : toutes les autosaveSeconds de clock et à chaque mission livrée, jamais pendant un saut */
  function onTick(ev){
    if(!GAME.state) return;
    const every = DATA.get('economy').autosaveSeconds || 120, done = MISSIONS.state.done.length;
    if(done > lastDone) pendingSave = true;
    lastDone = done;
    if(ev.clock < lastSaveClock) lastSaveClock = ev.clock;
    if(!pendingSave && ev.clock - lastSaveClock < every) return;
    if(jumpState) return;                                     // reporté au tick suivant
    SAVE.write();
    lastSaveClock = ev.clock; pendingSave = false;
  }

  /* ---------- menu pause : export / import de la sauvegarde (campagne seulement : créés au lancement) ---------- */
  function pauseSay(key){ if(pauseMsg) pauseMsg.textContent = t(key); }

  function pausePanel(){
    const panel = document.querySelector('#pauseOverlay .pause-panel'), quit = document.getElementById('pauseQuitBtn');
    if(!panel) return;
    const bExp = el('button', 'pause-btn', t('saveExport')), bImp = el('button', 'pause-btn', t('saveImport'));
    bExp.id = 'pauseSaveExportBtn'; bImp.id = 'pauseSaveImportBtn'; bExp.type = bImp.type = 'button';
    const file = el('input'); file.type = 'file'; file.id = 'pauseSaveFile'; file.accept = '.json,application/json'; file.hidden = true;
    pauseMsg = el('div', 'pause-hint pause-save-msg'); pauseMsg.id = 'pauseSaveMsg'; pauseMsg.setAttribute('aria-live', 'polite');
    [bExp, bImp].forEach(function(b){
      /* Entrée / Espace sur un bouton ne doivent pas reprendre la partie (touches de reprise de la pause) */
      b.addEventListener('keydown', function(e){ if(e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') e.stopPropagation(); });
    });
    bExp.addEventListener('click', function(e){ e.stopPropagation(); pauseSay(SAVE.exportFile() ? 'saveDone' : 'saveError'); });
    bImp.addEventListener('click', function(e){ e.stopPropagation(); file.value = ''; file.click(); });
    /* l'import recharge la page (partie en cours) : le jeu repart de la sauvegarde importée, vaisseau compris */
    file.addEventListener('change', function(){
      const f = file.files && file.files[0]; if(!f) return;
      readSaveFile(f, function(s){ pauseSay(resume(s) ? 'saveDone' : 'saveError'); }, function(){ pauseSay('saveError'); });
    });
    [bExp, bImp, file, pauseMsg].forEach(function(n){ panel.insertBefore(n, quit); });
  }

  return { chooseMode: chooseMode, resume: resume };
})();
