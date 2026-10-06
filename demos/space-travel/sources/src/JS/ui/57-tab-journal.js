/* =========================================================================
   CAMPAGNE 1b. CONSOLE DE BORD — onglet Journal (touche L) : radio, finances, événements de bord (L1.14)
   Rendu dans le panneau de l'onglet (pas de nœud hôte). Le texte radio est TOUJOURS posé par textContent : jamais de HTML.
   ========================================================================= */
/* @provides CONSOLE.journal @requires CONSOLE, CONSOLE.view, JOURNAL @requires-engine t, formatCredits */
(function(){
  'use strict';

  const CSS = [
    '#sttConsole .jrn-bar{ position:sticky; top:-10px; z-index:2; display:flex; flex-wrap:wrap; gap:6px; margin:-10px -14px 8px; padding:10px 14px 8px; background:rgba(11,18,32,0.98); border-bottom:1px solid var(--line); }',
    '#sttConsole .jrn-chip{ min-height:36px; padding:4px 14px; background:none; border:1px solid var(--line); color:var(--muted); font:inherit; font-size:12px; letter-spacing:0.06em; text-transform:uppercase; cursor:pointer; }',
    '#sttConsole .jrn-chip:hover{ color:var(--ink); }',
    '#sttConsole .jrn-chip[aria-pressed="true"]{ color:var(--amber); border-color:var(--amber); background:rgba(255,180,84,0.08); }',
    '#sttConsole .jrn-note{ margin:0 0 8px; padding:6px 10px; border-left:2px solid var(--amber-dim); color:var(--muted); font-size:12px; }',
    '#sttConsole .jrn-empty{ padding:18px; text-align:center; color:var(--muted-2); }',
    '#sttConsole .jrn-list{ list-style:none; margin:0; padding:0; }',
    '#sttConsole .jrn-row{ display:flex; flex-wrap:wrap; align-items:center; gap:2px 10px; min-height:36px; padding:6px 8px; border-bottom:1px dashed var(--line); font-size:12.5px; cursor:pointer; scroll-margin-top:56px; }',
    '#sttConsole .jrn-row:hover{ background:rgba(94,234,212,0.05); }',
    '#sttConsole .jrn-row.cur{ background:rgba(255,180,84,0.10); box-shadow:inset 2px 0 0 var(--amber); }',
    '#sttConsole .jrn-t{ flex:none; color:var(--muted-2); font-size:11px; letter-spacing:0.04em; }',
    '#sttConsole .jrn-ic{ flex:none; width:16px; text-align:center; color:var(--cyan); }',
    '#sttConsole .jrn-row[data-kind="fin"] .jrn-ic{ color:var(--amber); }',
    '#sttConsole .jrn-row[data-kind="evt"] .jrn-ic{ color:var(--nav-done); }',
    '#sttConsole .jrn-row.imp .jrn-ic{ color:#ff6b57; }',
    '#sttConsole .jrn-x{ flex:1 1 0; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }',
    '#sttConsole .jrn-row.open .jrn-x{ flex-basis:100%; white-space:normal; overflow:visible; overflow-wrap:anywhere; order:5; padding-left:2px; }',
    '#sttConsole .jrn-who{ color:var(--muted); }',
    '#sttConsole .jrn-amt{ flex:none; font-weight:700; }',
    '#sttConsole .jrn-amt.pos{ color:var(--nav-upcoming); }',
    '#sttConsole .jrn-amt.neg{ color:#ff6b57; }',
    '#sttConsole .jrn-bal{ flex:none; color:var(--muted-2); font-size:11px; }',
    '@media (max-width:760px), (pointer:coarse){',
    '  #sttConsole .jrn-chip{ min-height:44px; flex:1 1 auto; padding:4px 10px; }',
    '  #sttConsole .jrn-row{ min-height:44px; }',
    '  #sttConsole .jrn-bal{ display:none; }',
    '  #sttConsole .jrn-row.open .jrn-bal{ display:inline; }',
    '}'
  ].join('\n');

  const FILTERS = [
    { id: 'all',   key: 'jrnAll',   kinds: null },
    { id: 'radio', key: 'jrnRadio', kinds: ['radio'] },
    { id: 'fin',   key: 'jrnFin',   kinds: ['fin'] },
    { id: 'evt',   key: 'jrnEvt',   kinds: ['evt'] }
  ];
  const ICONS = { radio: '≋', fin: '¤', evt: '◆' };
  const EVT_KEY = { 'msn.accept': 'jrnE_msnAccept', 'msn.done': 'jrnE_msnDone', 'jump': 'jrnE_jump', 'arrive': 'jrnE_arrive',
    'orbit': 'jrnE_orbit', 'dock': 'jrnE_dock', 'fuel.low': 'jrnE_fuelLow', 'fuel.crit': 'jrnE_fuelCrit', 'incident': 'jrnE_incident' };
  const MAX_LINES = 300;

  const st = document.createElement('style');
  st.id = 'sttJournalCss';
  st.textContent = CSS;
  document.head.appendChild(st);

  let filter = 'all';          // gardé en mémoire pour la session
  let cursor = -1;             // ligne-curseur (clavier), -1 = aucune
  let root = null, barEl = null, noteEl = null, listEl = null, emptyEl = null;

  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function stamp(sec){
    const s = Math.max(0, Math.floor(typeof sec === 'number' && isFinite(sec) ? sec : 0));
    return 'T+' + pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s % 3600 / 60)) + ':' + pad(s % 60);
  }
  function has(key){ return t(key) !== key; }

  function reasonLabel(r){
    const k = 'jrnR_' + r;
    return has(k) ? t(k) : String(r == null ? t('jrnR_jeu') : r);
  }

  /* Gabarits {a} / {b} remplacés ici : t() n'interpole pas. Les primes sont des crédits. */
  function eventText(e){
    const k = EVT_KEY[e.code];
    if(!k) return String(e.code);
    const money = e.code === 'msn.accept' || e.code === 'msn.done';
    const a = e.a == null ? '—' : String(e.a);
    const b = e.b == null ? '—' : (money && typeof e.b === 'number' ? formatCredits(e.b) : String(e.b));
    let tpl = t(k);
    if(e.a == null) tpl = tpl.replace(/\s*:?\s*\{a\}/g, '');   // pas de « Arrimage : — »
    return tpl.replace(/\{a\}/g, function(){ return a; }).replace(/\{b\}/g, function(){ return b; });
  }

  function span(cls, text){
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = text;          // textContent exclusivement
    return s;
  }

  function rowFor(e){
    const li = document.createElement('li');
    li.className = 'jrn-row' + (e.kind === 'evt' && e.imp ? ' imp' : '');
    li.setAttribute('data-kind', e.kind);
    li.appendChild(span('jrn-t', stamp(e.t)));
    li.appendChild(span('jrn-ic', ICONS[e.kind] || '?'));
    let full;
    if(e.kind === 'radio'){
      const x = span('jrn-x', '');
      if(e.who){ x.appendChild(span('jrn-who', String(e.who) + ' — ')); }
      x.appendChild(document.createTextNode(String(e.text == null ? '' : e.text)));
      full = (e.who ? String(e.who) + ' — ' : '') + String(e.text == null ? '' : e.text);
      li.appendChild(x);
    }else if(e.kind === 'fin'){
      full = reasonLabel(e.reason);
      li.appendChild(span('jrn-x', full));
      const d = typeof e.delta === 'number' ? e.delta : 0;
      li.appendChild(span('jrn-amt ' + (d < 0 ? 'neg' : 'pos'), (d < 0 ? '−' : '+') + formatCredits(Math.abs(d))));
      const bal = typeof e.bal === 'number' ? t('jrnBalance') + ' ' + formatCredits(e.bal) : '';
      if(bal){ li.appendChild(span('jrn-bal', bal)); full += ' ' + (d < 0 ? '−' : '+') + formatCredits(Math.abs(d)) + ' · ' + bal; }
    }else{
      full = eventText(e);
      li.appendChild(span('jrn-x', full));
    }
    li.title = full;
    return li;
  }

  function ensureRoot(panel){
    const p = panel || document.querySelector('#sttConsole .con-panel[data-tab="journal"]');
    if(!p) return false;
    if(root && root.parentNode === p) return true;
    root = document.createElement('div');
    root.className = 'jrn-root';
    barEl = document.createElement('div');
    barEl.className = 'jrn-bar';
    barEl.setAttribute('role', 'group');
    FILTERS.forEach(function(f){
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'jrn-chip';
      b.tabIndex = -1;                       // jamais de focus clavier : les touches restent à la console
      b.setAttribute('data-f', f.id);
      b.addEventListener('click', function(){ setFilter(f.id); b.blur(); });
      barEl.appendChild(b);
    });
    noteEl = document.createElement('p');
    noteEl.className = 'jrn-note';
    emptyEl = document.createElement('div');
    emptyEl.className = 'jrn-empty';
    listEl = document.createElement('ol');
    listEl.className = 'jrn-list';
    listEl.addEventListener('click', function(ev){
      const li = ev.target.closest ? ev.target.closest('.jrn-row') : null;
      if(!li) return;
      const i = Array.prototype.indexOf.call(listEl.children, li);
      if(i === cursor){ cursor = -1; li.classList.remove('cur', 'open'); }
      else li.classList.toggle('open');
    });
    root.appendChild(barEl); root.appendChild(noteEl); root.appendChild(emptyEl); root.appendChild(listEl);
    p.textContent = '';
    p.appendChild(root);
    return true;
  }

  function render(){
    if(!root) return;
    FILTERS.forEach(function(f, i){
      const b = barEl.children[i];
      b.textContent = t(f.key);
      b.setAttribute('aria-pressed', f.id === filter ? 'true' : 'false');
    });
    const f = FILTERS.filter(function(x){ return x.id === filter; })[0];
    const showNote = filter === 'fin' && !GAME.state;
    noteEl.hidden = !showNote;
    noteEl.textContent = showNote ? t('jrnFreeNote') : '';
    let rows = [];
    try{ rows = JOURNAL.list({ kinds: f.kinds, limit: MAX_LINES }); }catch(err){ console.error('[JOURNAL] liste :', err); }
    listEl.textContent = '';
    rows.forEach(function(e){ listEl.appendChild(rowFor(e)); });
    emptyEl.hidden = rows.length > 0;
    emptyEl.textContent = rows.length ? '' : t('jrnEmpty');
    if(cursor >= rows.length) cursor = rows.length - 1;
    markCursor(false);
  }

  function markCursor(scroll){
    const kids = listEl ? listEl.children : [];
    for(let i = 0; i < kids.length; i++){
      const on = i === cursor, was = kids[i].classList.contains('cur');
      if(on) kids[i].classList.add('cur', 'open');
      else if(was) kids[i].classList.remove('cur', 'open');   // l'ancienne ligne-curseur se replie
    }
    if(scroll && cursor >= 0 && kids[cursor] && kids[cursor].scrollIntoView) kids[cursor].scrollIntoView({ block: 'nearest' });
  }

  function setFilter(id){
    if(id === filter) return;
    filter = id;
    cursor = -1;
    render();
  }

  function scroller(){ return root ? root.parentNode.parentNode : null; }   // .con-body

  function onKey(code){
    if(!root) return;
    const n = listEl.children.length;
    const ix = FILTERS.map(function(f){ return f.id; }).indexOf(filter);
    switch(code){
      case 'ArrowLeft':  setFilter(FILTERS[(ix + FILTERS.length - 1) % FILTERS.length].id); break;
      case 'ArrowRight': setFilter(FILTERS[(ix + 1) % FILTERS.length].id); break;
      case 'ArrowDown':  if(n){ cursor = Math.min(n - 1, cursor + 1); markCursor(true); } break;
      case 'ArrowUp':    if(n){ cursor = Math.max(0, cursor - 1); markCursor(true); } break;
      case 'PageDown': case 'PageUp': {
        const s = scroller();
        if(s) s.scrollTop += (code === 'PageDown' ? 1 : -1) * Math.max(40, s.clientHeight * 0.85);
        break;
      }
      case 'Home': { const s = scroller(); if(s) s.scrollTop = 0; if(cursor >= 0 && n){ cursor = 0; markCursor(false); } break; }
      case 'End':  { const s = scroller(); if(s) s.scrollTop = s.scrollHeight; if(cursor >= 0 && n){ cursor = n - 1; markCursor(false); } break; }
      default: break;
    }
  }

  function isCurrent(){ return CONSOLE.current() === 'journal'; }
  function syncBadge(){
    if(isCurrent()){ JOURNAL.markRead(); CONSOLE.badge('journal', null); }
    else CONSOLE.badge('journal', JOURNAL.unread());
  }

  JOURNAL.on('add', function(){
    if(isCurrent()) render();
    syncBadge();
  });
  JOURNAL.on('restore', function(){
    cursor = -1;
    if(isCurrent()) render();
    syncBadge();
  });

  CONSOLE.register({
    id: 'journal',
    order: 80,
    labelKey: 'conTabJournal',
    fkey: null,
    keys: ['KeyL'],
    visible: function(){ return true; },
    onShow: function(panel){
      if(!ensureRoot(panel)) return;
      cursor = -1;
      render();
      JOURNAL.markRead();
      CONSOLE.badge('journal', null);
    },
    onHide: function(){ },
    onKey: onKey
  });
})();
