/* =========================================================================
   CAMPAGNE 1. CONSOLE DE BORD — vue : cadre #sttConsole, CSS, hébergement des overlays, clavier minimal (L1)
   Le modèle (CONSOLE, 50-console.js) décide ; ce fichier dessine et relaie les touches.
   Seul le membre CONSOLE.view est ajouté : aucune globale nouvelle.
   ========================================================================= */
/* @provides CONSOLE.view @requires CONSOLE @requires-engine t, gameStarted, gamePaused, activateHudBarItem, HUD_BAR_ITEMS */
(function(){
  const CSS = [
    '#sttConsole{ position:fixed; inset:0; z-index:6; display:flex; align-items:center; justify-content:center; box-sizing:border-box; padding:var(--hud-top) 0 var(--hud-bottom); pointer-events:none; font-family:"JetBrains Mono",monospace; }',
    '#sttConsole[hidden]{ display:none; }',
    '#sttConsole .con-frame{ position:relative; pointer-events:auto; display:flex; flex-direction:column; box-sizing:border-box; width:var(--con-max-w);',
    '  height:min(var(--con-max-h), calc(100vh - var(--hud-top) - var(--hud-bottom))); border:1px solid var(--line);',
    '  background:linear-gradient(180deg, rgba(94,234,212,0.05), transparent 60%), rgba(11,18,32,0.96); backdrop-filter:blur(2px); color:var(--ink); }',
    '#sttConsole .con-frame::before, #sttConsole .con-frame::after{ content:""; position:absolute; width:14px; height:14px; border:1.5px solid var(--amber); pointer-events:none; }',
    '#sttConsole .con-frame::before{ top:-1px; left:-1px; border-right:none; border-bottom:none; }',
    '#sttConsole .con-frame::after{ bottom:-1px; right:-1px; border-left:none; border-top:none; }',
    '#sttConsole .con-head{ flex:none; display:flex; align-items:center; gap:14px; padding:8px 12px; border-bottom:1px solid var(--line); }',
    '#sttConsole .con-title{ font-weight:700; font-size:13px; letter-spacing:0.14em; text-transform:uppercase; color:var(--amber); white-space:nowrap; }',
    '#sttConsoleTabs{ display:flex; gap:4px; flex:1; min-width:0; overflow-x:auto; }',
    '#sttConsoleTabs button{ position:relative; flex:none; padding:5px 12px; background:none; border:1px solid transparent; color:var(--muted); font:inherit; font-size:12px;',
    '  letter-spacing:0.08em; text-transform:uppercase; cursor:pointer; }',
    '#sttConsoleTabs button:hover{ color:var(--ink); border-color:var(--line); }',
    '#sttConsoleTabs button.on{ color:var(--amber); border-color:var(--amber-dim); }',
    '#sttConsoleTabs button[hidden]{ display:none; }',
    '#sttConsole .con-badge{ display:inline-block; min-width:14px; margin-left:6px; padding:0 4px; border-radius:7px; background:var(--amber); color:var(--bg); font-size:10px; line-height:14px; text-align:center; }',
    '#sttConsole .con-badge[hidden]{ display:none; }',
    '#sttConsole .con-close{ flex:none; width:24px; height:24px; padding:0; background:none; border:none; color:var(--muted-2); font:inherit; font-size:16px; line-height:1; cursor:pointer; }',
    '#sttConsole .con-close:hover{ color:#ff6b57; }',
    /* un seul défileur par onglet : le panneau ; le corps ne défile jamais */
    '#sttConsole .con-body{ position:relative; flex:1 1 auto; display:flex; flex-direction:column; min-height:0; overflow:hidden; }',
    '#sttConsole .con-panel{ flex:1 1 auto; min-height:0; overflow:auto; overflow-x:hidden; padding:var(--con-pad-y) var(--con-pad-x); }',
    '#sttConsole .con-panel[hidden]{ display:none; }',
    /* neutralisation des overlays hébergés : plus de plein écran, de voile ni de position propre */
    '#sttConsole .con-hosted{ position:static !important; inset:auto !important; top:auto !important; left:auto !important; right:auto !important; bottom:auto !important;',
    '  transform:none !important; z-index:auto !important; width:auto !important; max-width:none !important; height:auto !important; max-height:none !important; margin:0 !important;',
    '  background:none !important; backdrop-filter:none !important; box-shadow:none !important; opacity:1 !important; pointer-events:auto !important; transition:none !important; }',
    '#sttConsole .con-hosted:not([data-con-shown]){ display:none !important; }',
    '#sttConsole .con-hosted .help-panel{ flex:1 1 auto; width:auto; max-width:none; max-height:none; border:none; background:none; padding:0; }',
    /* U1.3 : tout panneau hébergé est neutralisé (largeur, hauteur, bordure, coins, croix) ; les mêmes panneaux hors console gardent leur aspect */
    '#sttConsole .con-hosted .board-panel, #sttConsole .con-hosted .audio-panel, #sttConsole .con-hosted .help-panel, #sttConsole .con-hosted.panel, #sttConsole #portPanel{',
    '  --stt-corners:none; width:auto; max-width:none; max-height:none; overflow:visible; border:none; }',
    '#sttConsole .con-hosted .board-panel::before, #sttConsole .con-hosted .board-panel::after, #sttConsole .con-hosted .audio-panel::before, #sttConsole .con-hosted .audio-panel::after,',
    '  #sttConsole .con-hosted .help-panel::before, #sttConsole .con-hosted .help-panel::after, #sttConsole #portPanel::before, #sttConsole #portPanel::after{ content:none; display:none; }',
    '#sttConsole .con-hosted .board-panel{ width:100%; }',   /* l'hôte est un conteneur flex centré : width:auto réduirait le tableau à son contenu */
    '#sttConsole .con-hosted .panel-close-btn{ display:none; }',
    /* ≤ 900 px de large : titre masqué, onglets compacts, la barre tient sans ascenseur horizontal */
    '@media (max-width:900px){',
    '  #sttConsole .con-head{ gap:8px; padding:6px 8px; }',
    '  #sttConsole .con-title{ display:none; }',
    '  #sttConsoleTabs{ gap:2px; }',
    '  #sttConsoleTabs button{ padding:5px 7px; letter-spacing:0.02em; }',
    '}',
    /* Tactile et écran étroit : ≤760px de large ou pointeur tactile */
    '@media (max-width:760px), (pointer:coarse){',
    '  #sttConsole{ position:fixed; inset:0; width:100%; height:100%; max-width:100%; max-height:100%; padding:0;',
    '    inset:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }',
    '  #sttConsole .con-frame{ width:100%; height:100%; border:none; border-radius:0;',
    '    padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }',
    '  #sttConsole .con-frame::before, #sttConsole .con-frame::after{ display:none; }',
    '  #sttConsoleTabs{ overflow-x:auto; white-space:nowrap; -webkit-overflow-scrolling:touch; flex-wrap:nowrap; }',
    '  #sttConsoleTabs button{ min-height:44px; flex-shrink:0; }',
    '  #sttConsole .con-close{ min-width:44px; min-height:44px; width:44px; height:44px; }',
    '  #sttConsole .con-panel{ -webkit-overflow-scrolling:touch; }',
    '  #sttConsole .con-hosted{ box-sizing:border-box; max-width:100%; }',
    '  #helpOverlay{ max-width:100%; box-sizing:border-box; }',
    '  #audioOverlay{ max-width:100%; box-sizing:border-box; }',
    '  #stmMap{ max-width:100%; box-sizing:border-box; }',
    '  #missionBoardOverlay{ max-width:100%; box-sizing:border-box; }',
    '  #contractBoardOverlay{ max-width:100%; box-sizing:border-box; }',
    '  #portPanel{ max-width:100%; box-sizing:border-box; }',
    '  #shipyardOverlay{ max-width:100%; box-sizing:border-box; }',
    '}'
  ].join('\n');

  const hosts = [];          // { id, node, shown }
  let root = null, tabsEl = null, titleEl = null, closeEl = null, bodyEl = null;
  let escHeld = false;       // Échap vient de fermer la console : la répétition ne doit pas déclencher la pause

  function label(tab){
    const k = tab.labelKey;
    return k ? t(k) : tab.id;
  }

  function panelFor(id){
    if(!bodyEl) return null;
    let p = bodyEl.querySelector('.con-panel[data-tab="' + id + '"]');
    if(!p){
      p = document.createElement('div');
      p.className = 'con-panel';
      p.setAttribute('data-tab', id);
      p.setAttribute('role', 'tabpanel');
      p.hidden = true;
      bodyEl.appendChild(p);
    }
    return p;
  }

  function buttonFor(id){
    let b = tabsEl.querySelector('button[data-tab="' + id + '"]');
    if(!b){
      b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('data-tab', id);
      b.tabIndex = -1;                     // jamais de focus clavier : les touches restent au jeu
      b.appendChild(document.createElement('span')).className = 'con-lbl';
      const bd = b.appendChild(document.createElement('span'));
      bd.className = 'con-badge'; bd.hidden = true;
      tabsEl.appendChild(b);
    }
    return b;
  }

  /* Synchronise boutons, panneaux, libellés, pastilles et visibilité avec le modèle */
  function render(){
    if(!root) return;
    titleEl.textContent = t('conTitle');
    closeEl.setAttribute('aria-label', t('conClose'));
    closeEl.title = t('conClose');
    root.setAttribute('aria-label', t('conTitle'));
    const cur = CONSOLE.current(), badges = CONSOLE.badges();
    CONSOLE.tabs().forEach(function(tab){
      if(!tab.panel) tab.panel = panelFor(tab.id);
      const b = buttonFor(tab.id), p = panelFor(tab.id);
      tabsEl.appendChild(b);               // respecte l'ordre du modèle (tabs() est trié)
      const vis = CONSOLE.visibleTabs().indexOf(tab) >= 0;
      b.hidden = !vis;
      b.firstChild.textContent = label(tab);
      b.classList.toggle('on', cur === tab.id);
      b.setAttribute('aria-selected', cur === tab.id ? 'true' : 'false');
      const n = badges[tab.id];
      b.lastChild.hidden = !n; b.lastChild.textContent = n ? String(n) : '';
      p.hidden = !(vis && cur === tab.id);
    });
    root.hidden = cur === null;
  }

  function ensure(){
    if(root) return true;
    if(typeof document === 'undefined' || !document.body) return false;
    const st = document.createElement('style');
    st.id = 'sttConsoleCss';
    st.textContent = CSS;
    document.head.appendChild(st);
    root = document.createElement('div');
    root.id = 'sttConsole';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'false');
    root.hidden = true;
    root.innerHTML = '<div class="con-frame"><div class="con-head"><span class="con-title" id="sttConsoleTitle"></span>' +
      '<div id="sttConsoleTabs" role="tablist"></div><button type="button" class="con-close" tabindex="-1">×</button></div>' +
      '<div class="con-body"></div></div>';
    document.body.appendChild(root);
    titleEl = root.querySelector('.con-title');
    tabsEl = root.querySelector('#sttConsoleTabs');
    closeEl = root.querySelector('.con-close');
    bodyEl = root.querySelector('.con-body');
    closeEl.addEventListener('click', function(){ CONSOLE.close('user'); });
    tabsEl.addEventListener('click', function(e){
      const b = e.target.closest ? e.target.closest('button[data-tab]') : null;
      if(b){ CONSOLE.open(b.getAttribute('data-tab')); b.blur(); }
    });
    hosts.forEach(attach);
    return true;
  }

  /* ---- hébergement des overlays existants ------------------------------ */
  function sync(h){
    let on = false;
    try{ on = !!h.shown(h.node); }catch(err){ on = false; }
    if(on) h.node.setAttribute('data-con-shown', ''); else h.node.removeAttribute('data-con-shown');
    return on;
  }

  function onMutation(h){
    const on = sync(h);
    if(on){
      if(CONSOLE.current() !== h.id) CONSOLE.open(h.id);
    }else if(CONSOLE.current() === h.id){
      const encore = hosts.some(function(o){ return o.id === h.id && o !== h && o.node.hasAttribute('data-con-shown'); });
      if(!encore) CONSOLE.close('legacy');
    }
  }

  function attach(h){
    if(h.mo || !bodyEl) return;
    const p = panelFor(h.id);
    h.node.classList.add('con-hosted');
    p.appendChild(h.node);
    sync(h);
    h.mo = new MutationObserver(function(){ onMutation(h); });
    h.mo.observe(h.node, { attributes: true, attributeFilter: ['class', 'style'] });
  }

  function host(id, node, shown){
    if(typeof node === 'string') node = document.getElementById(node);
    if(!node || typeof shown !== 'function') return false;
    const h = { id: id, node: node, shown: shown, mo: null };
    hosts.push(h);
    if(ensure()) attach(h);
    return true;
  }

  /* ---- clavier ----------------------------------------------------------- */
  const TEXT_INPUT = /^(text|number|search|email|url|password|tel|)$/i;
  function typing(el){
    if(!el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    if(tag === 'TEXTAREA') return true;
    if(tag === 'INPUT') return TEXT_INPUT.test(el.getAttribute('type') || '');
    return !!el.isContentEditable;
  }

  function eat(e){ e.preventDefault(); e.stopImmediatePropagation(); }

  function onKeyDown(e){
    if(e.code === 'Escape' && e.repeat && escHeld){ eat(e); return; }
    const a = CONSOLE.keyAction(
      { code: e.code, altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, repeat: e.repeat },
      { started: gameStarted, paused: gamePaused, typing: typing(e.target) || typing(document.activeElement) });
    if(!a) return;
    switch(a.act){
      case 'toggle': CONSOLE.toggle(a.tab); break;
      case 'last':   CONSOLE.open(); break;
      case 'close':  CONSOLE.close('user'); if(e.code === 'Escape') escHeld = true; break;
      case 'tabkey': { const tb = CONSOLE.tabs().filter(function(x){ return x.id === a.tab; })[0]; if(tb && typeof tb.onKey === 'function'){ try{ tb.onKey(a.code); }catch(err){ console.error('[CONSOLE] onKey « ' + a.tab + ' » :', err); } } break; }
      case 'hud':    if(HUD_BAR_ITEMS[a.index]) activateHudBarItem(HUD_BAR_ITEMS[a.index]); break;
      default: break;   /* swallow, reserved : sans effet */
    }
    eat(e);   /* toute action non nulle : le jeu (23) ne voit plus la touche, même si open/toggle a refusé */
  }

  function onKeyUp(e){ if(e.code === 'Escape') escHeld = false; }

  /* ---- branchement -------------------------------------------------------- */
  CONSOLE.on('tabs', function(){ if(ensure()) render(); });
  ['open', 'close', 'tab', 'badge'].forEach(function(evt){ CONSOLE.on(evt, render); });
  if(typeof window !== 'undefined'){
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    setInterval(function(){ if(gameStarted) CONSOLE.refresh(); }, 250);
    if(typeof document !== 'undefined' && !document.body){
      document.addEventListener('DOMContentLoaded', function(){ if(ensure()) render(); });
    }else ensure();
  }

  CONSOLE.view = { host: host, render: render };
})();
