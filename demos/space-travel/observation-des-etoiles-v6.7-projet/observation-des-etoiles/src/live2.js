/* Lancement de la démo « Observation des étoiles » : attente du monde, prise de contrôle du moteur, boucle infinie */
(function(){
  var CREDIT = '(c) 2026 Frédéric Delorme & claude.ai - Music by ScoreStudio - Observation des étoiles';
  var css = document.createElement('style');
  css.textContent =
    "body > *:not(#scene):not(.atmo):not(#jumpFlash):not(#jumpVignette):not(#sttTitle):not(#sttCap):not(#sttCredit):not(#sttStart):not(#sttPause):not(#shipSelect):not(.demo-ui){display:none!important}" +
    ".atmo{background:radial-gradient(ellipse at center,transparent 52%,rgba(2,5,12,.5) 100%)!important}" +
    "#sttTitle{position:fixed;left:3vw;top:4.5vh;z-index:9;pointer-events:none;opacity:0;transition:opacity 2s}" +
    "#sttTitle .eb,#sttStart .eb{font-family:'JetBrains Mono',monospace;font-size:max(9px,1.48vh);letter-spacing:.18em;color:#8ea0c4;margin-bottom:.9vh;text-shadow:0 1px 4px rgba(0,0,0,.9)}" +
    "#sttTitle .mn{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:max(18px,3.7vh);letter-spacing:.03em;color:#e8edf5;text-shadow:0 2px 8px rgba(0,0,0,.9)}" +
    ".amber{color:#ffb454}" +
    "#sttCap{position:fixed;left:0;padding:1.2vh 4vw 1.2vh 3vw;background:linear-gradient(90deg,rgba(3,6,12,.62),rgba(3,6,12,.35) 70%,transparent);bottom:6vh;z-index:9;pointer-events:none;max-width:70vw;font-family:'JetBrains Mono',monospace;font-size:max(11px,1.7vh);letter-spacing:.04em;color:#e8edf5;text-shadow:0 1px 5px rgba(0,0,0,.95);opacity:0;transition:opacity .45s}" +
    "#sttCap .ty{color:#8ea0c4}#sttCap .nm{color:#e8edf5;font-weight:700}#sttCap .sep{color:#ffb454}#sttCap .loc{color:#5eead4}#sttCap .tl{color:#ffb454;margin-left:.9em;white-space:nowrap}#sttCap .tl:empty{display:none}" +
    "#sttCap::before{content:'';display:block;width:3.2vh;height:2px;background:#ffb454;margin-bottom:1vh}" +
    "#sttCredit{position:fixed;left:0;right:0;bottom:2vh;z-index:9;pointer-events:none;text-align:center;font-family:'JetBrains Mono',monospace;font-size:max(9px,1.25vh);letter-spacing:.03em;color:rgba(232,237,245,.62);text-shadow:0 1px 3px rgba(0,0,0,.9)}" +
    "#sttPause{position:fixed;inset:0;z-index:10;display:none;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-size:13px;letter-spacing:.2em;color:#ffb454;background:rgba(2,5,12,.35);pointer-events:none}" +
    "#sttStart{position:fixed;inset:0;z-index:20;background:#05080f;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;transition:opacity .8s}" +
    "#sttStart .mn{font-weight:700;font-size:34px;letter-spacing:.03em;color:#e8edf5;margin-bottom:10px;text-align:center}" +
    "#sttStart .sub{font-size:13px;color:#8ea0c4;letter-spacing:.08em;margin-bottom:34px}" +
    "#sttStart .go{font-size:13px;letter-spacing:.14em;color:#5eead4;padding:12px 22px;border:1px solid #25375c}" +
    "#sttStart .keys{margin-top:22px;font-size:11px;color:#5d6f92;letter-spacing:.06em}" +
    "#sttStart.ready{cursor:pointer}#sttStart.ready .go{border-color:#ffb454;color:#ffb454}#sttStart.hide{opacity:0;pointer-events:none}" +
    "#sttStart .cr{position:absolute;bottom:16px;left:0;right:0;text-align:center;font-size:10.5px;color:rgba(232,237,245,.6)}" +
    /* sélecteur de vaisseaux (lot 1) : bouton d'accueil, bouton discret en démo, mode Auto/Suivre, message — charte McGivrer */
    "#sttPick{margin-top:14px;font-size:12px;letter-spacing:.14em;color:#5d6f92;padding:10px 18px;border:1px solid #25375c;cursor:default;user-select:none}" +
    "#sttStart.ready #sttPick{color:#5eead4;cursor:pointer}#sttStart.ready #sttPick:hover,#sttPick:focus-visible{border-color:#5eead4;outline:0}" +
    "#sttPick .ch{color:#ffb454}" +
    "#sttUi{position:fixed;top:3.2vh;right:2.4vw;z-index:11;display:flex;gap:8px;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.12em;opacity:0;transition:opacity .5s;pointer-events:none}" +
    "#sttUi.on{opacity:1;pointer-events:auto}" +
    "#sttUi button{font:inherit;letter-spacing:inherit;color:#e8edf5;background:rgba(11,18,32,.82);border:1px solid #25375c;padding:7px 11px;cursor:pointer;border-radius:0}" +
    "#sttUi button:hover,#sttUi button:focus-visible{border-color:#ffb454;color:#ffb454;outline:0}#sttUi .k{color:#5d6f92;margin-left:6px}" +
    "#sttUi button.lock{color:#ffb454;border-color:#a97a3d}" +
    "#sttToast{position:fixed;left:50%;bottom:14vh;transform:translateX(-50%);z-index:11;font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.08em;color:#e8edf5;background:rgba(11,18,32,.9);border:1px solid #25375c;border-left:2px solid #ffb454;padding:10px 16px;opacity:0;transition:opacity .4s;pointer-events:none;max-width:80vw;text-align:center}" +
    "#sttToast.on{opacity:1}#sttToast .a{color:#ffb454}#sttToast .c{color:#5eead4}" +
    "@media (prefers-reduced-motion: reduce){#sttUi,#sttToast{transition:none}}";
  document.head.appendChild(css);
  function el(id, html){ var d = document.createElement('div'); d.id = id; d.innerHTML = html; return d; }
  var start = el('sttStart', '<div class="eb">// PROCEDURAL SPACE SIMULATION</div><div class="mn">SPACE TRAVEL <span class="amber">&amp;</span> TRANSPORT</div><div class="sub">Observation des étoiles — endless cinematic mode</div><div class="go" id="sttGo">GENERATING UNIVERSE…</div><div id="sttPick" role="button" tabindex="0">CHOOSE A SHIP <span class="ch">· RANDOM</span></div><div class="keys">SPACE pause · F fullscreen · V ship · L follow</div><div class="cr"></div>');
  var title = el('sttTitle', '<div class="eb">// PROCEDURAL SPACE SIMULATION</div><div class="mn">SPACE TRAVEL <span class="amber">&amp;</span> TRANSPORT</div>');
  var cap = el('sttCap', '<span class="ship"><span class="ty"></span> / <span class="nm"></span> <span class="sep">--</span> </span><span class="loc"></span><span class="tl"></span>');
  var credit = el('sttCredit', ''); credit.textContent = CREDIT;
  var pause = el('sttPause', 'PAUSE');
  var ui = el('sttUi', '<button type="button" id="sttShipBtn">SHIP<span class="k">V</span></button><button type="button" id="sttLockBtn">AUTO<span class="k">L</span></button>'); ui.className = 'demo-ui';
  var toast = el('sttToast', ''); toast.className = 'demo-ui';
  function mount(){ [start, title, cap, credit, pause, ui, toast].forEach(function(e){ document.body.appendChild(e); }); start.querySelector('.cr').textContent = CREDIT; }
  if(document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

  var running = false, paused = false, last = 0, capKey = '', tlTxt = null, ready = false, selOpen = false, selCancel = false, uiTimer = 0, toastTimer = 0;
  /* ---------- sélecteur de vaisseaux : celui du jeu (openShipSelect), réutilisé tel quel ---------- */
  function showToast(html){ toast.innerHTML = html; toast.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(function(){ toast.classList.remove('on'); }, 3600); }
  function esc(t){ return String(t).replace(/[&<>]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]; }); }
  function modelName(id){ var m = SHIPGEN.MODELS.filter(function(x){ return x.id === id; })[0]; return m ? m.name : id; }
  function refreshLock(){ var b = document.getElementById('sttLockBtn'); if(!b || !window.__CINE) return; var f = __CINE.followHero; b.firstChild.textContent = f ? 'FOLLOW' : 'AUTO'; b.classList.toggle('lock', f); }
  function setPaused(p, silent){ paused = p; pause.style.display = p && !silent ? 'flex' : 'none'; try { p ? musicAudio.pause() : (running && __CINE.OPT.music && musicAudio.play()); } catch(_){} }
  var wasPaused = false;
  function openSelector(){
    if(selOpen || !ready || typeof openShipSelect !== 'function') return;
    selOpen = true; selCancel = false; wasPaused = paused; if(running) setPaused(true, true);
    window.__uiOpen = '#shipSelect';
    openShipSelect(function(id, opts){
      window.__uiOpen = null; selOpen = false;
      if(running) setPaused(wasPaused);
      if(selCancel) return;
      var r = __CINE.setHero(id, opts);
      var nm = esc(modelName(id));
      if(!running){ document.querySelector('#sttPick .ch').textContent = '· ' + modelName(id).toUpperCase(); return; }
      showToast(r === 'now' ? '<span class="a">RELAY</span> · ' + nm + ' <span class="c">joins the orbit — camera follows it now</span>'
                            : '<span class="a">RELAY</span> · ' + nm + ' <span class="c">takes over at the next system</span>');
    });
  }
  function cancelSelector(){ if(!selOpen) return; selCancel = true; var b = document.getElementById('ssConfirm'); b && b.click(); }
  function toggleFollow(){ if(!window.__CINE) return; var f = __CINE.setFollow(!__CINE.followHero); refreshLock();
    var h = __CINE.heroInfo(); showToast(f ? '<span class="a">FOLLOW</span> · ' + esc(h.type) + ' / ' + esc(h.name) + ' <span class="c">stays the hero</span>' : '<span class="a">AUTO</span> <span class="c">· relays between ships resume</span>'); }
  function pokeUi(){ if(!running) return; ui.classList.add('on'); clearTimeout(uiTimer); uiTimer = setTimeout(function(){ ui.classList.remove('on'); }, 2600); }
  window.addEventListener('mousemove', pokeUi, { passive: true });
  ui.addEventListener('click', function(e){ var b = e.target.closest('button'); if(!b) return; if(b.id === 'sttShipBtn') openSelector(); else if(b.id === 'sttLockBtn') toggleFollow(); pokeUi(); });
  /* facteur d'accélération du temps (⏱ ×N) : mis à jour en continu, sans refaire le fondu de la légende */
  function setTimeLapse(c){ var t = c && c.tl ? '\u23f1 ' + c.tl : ''; if(t !== tlTxt){ tlTxt = t; cap.querySelector('.tl').textContent = t; } }
  function setCaption(c){
    var k = c ? (c.vista ? 'V' + c.star + c.place : c.type + c.name + c.star + c.planet) : '';
    if(k === capKey) return; capKey = k;
    cap.style.transition = 'none'; cap.style.opacity = '0';
    if(!c) return;
    cap.querySelector('.ship').style.display = c.vista ? 'none' : '';
    if(!c.vista){ cap.querySelector('.ty').textContent = c.type; cap.querySelector('.nm').textContent = c.name; }
    cap.querySelector('.loc').textContent = c.star + ' . ' + c.cls + (c.vista ? (c.place ? ' . ' + c.place : '') : ' . ' + c.planet);
    void cap.offsetWidth; cap.style.transition = 'opacity .45s'; cap.style.opacity = '1';
  }
  /* résolution dynamique : garde un débit fluide sur les gros plans planétaires (shaders procéduraux coûteux) */
  var Q = new URLSearchParams(location.search).get('quality');
  var prMax = Math.min(window.devicePixelRatio || 1, Q === 'high' ? 2 : 1.5) * (Q === 'low' ? .6 : 1), pr = prMax, ema = 16.7, lastAdj = 0;
  function adaptResolution(now, frameMs){
    ema = ema*0.92 + Math.min(frameMs, 100)*0.08;
    if(now - lastAdj < 700) return;
    var old = pr;
    if(ema > 23 && pr > .45) pr = Math.max(.45, pr - .1);
    else if(ema < 18.5 && pr < prMax) pr = Math.min(prMax, pr + .05);
    if(pr !== old){ renderer.setPixelRatio(pr); renderer.setSize(window.innerWidth, window.innerHeight); lastAdj = now; }
  }
  function loop(now){
    var frameMs = now - last;
    var dt = Math.min(.05, Math.max(0, frameMs/1000)); last = now;
    if(running && !paused) adaptResolution(now, frameMs);
    if(!selOpen) try {                                   // sélecteur ouvert : la démo se fige (un seul rendu WebGL actif)
      __CINE.step(paused ? 0 : dt);
      setCaption(__CINE.caption()); setTimeLapse(__CINE.caption());
    } catch(e){ console.error(e); }
    window.__raf(loop);
  }
  function go(){
    if(running) return; running = true;
    start.classList.add('hide'); title.style.opacity = '1';
    if(__CINE.OPT.music){ try { musicAudio.loop = true; musicAudio.currentTime = 0; musicAudio.volume = .5; musicAudio.play().catch(function(){}); } catch(e){} }
    last = performance.now(); window.__raf(loop);
  }
  window.__onKey = function(e){
    if(selOpen){ if(e.key === 'Escape') cancelSelector(); return; }
    if(e.key === 'v' || e.key === 'V'){ openSelector(); return; }
    if(!running){ if(e.key === 'Enter' || e.key === ' ') go(); return; }
    if(e.key === 'l' || e.key === 'L'){ toggleFollow(); return; }
    if(e.key === ' '){ setPaused(!paused); }
    if(e.key === 'f' || e.key === 'F'){ var d = document.documentElement; document.fullscreenElement ? document.exitFullscreen() : (d.requestFullscreen && d.requestFullscreen()); }
  };
  var wait = setInterval(function(){
    if(typeof worldReadyForCinematic === 'undefined' || !worldReadyForCinematic || !window.__CINE) return;
    clearInterval(wait);
    window.__takeover = true;
    try { musicAudio.pause(); } catch(e){}
    renderer.setPixelRatio(prMax); renderer.setSize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', function(){ renderer.setSize(window.innerWidth, window.innerHeight); });   // les caméras de la démo prennent le rapport d'aspect du tampon à chaque image
    var info = __CINE.init();
    console.log('[cine] ready', info);
    __CINE.step(0.001, true);
    document.getElementById('sttGo').textContent = '▶  CLICK TO LAUNCH';
    ready = true; refreshLock();
    var pick = document.getElementById('sttPick');
    pick.addEventListener('click', function(e){ e.stopPropagation(); openSelector(); });
    pick.addEventListener('keydown', function(e){ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); e.stopPropagation(); openSelector(); } });
    start.classList.add('ready'); start.addEventListener('click', function(e){ if(!selOpen) go(); });
  }, 200);
})();
