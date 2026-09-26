/* Lancement de la démo « Observation des étoiles » : attente du monde, prise de contrôle du moteur, boucle infinie */
(function(){
  var CREDIT = '(c) 2026 Frédéric Delorme & claude.ai - Music by ScoreStudio - Observation des étoiles';
  var css = document.createElement('style');
  css.textContent =
    "body > *:not(#scene):not(.atmo):not(#jumpFlash):not(#jumpVignette):not(#sttTitle):not(#sttCap):not(#sttCredit):not(#sttStart):not(#sttPause){display:none!important}" +
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
    "#sttStart .cr{position:absolute;bottom:16px;left:0;right:0;text-align:center;font-size:10.5px;color:rgba(232,237,245,.6)}";
  document.head.appendChild(css);
  function el(id, html){ var d = document.createElement('div'); d.id = id; d.innerHTML = html; return d; }
  var start = el('sttStart', '<div class="eb">// PROCEDURAL SPACE SIMULATION</div><div class="mn">SPACE TRAVEL <span class="amber">&amp;</span> TRANSPORT</div><div class="sub">Observation des étoiles — endless cinematic mode</div><div class="go" id="sttGo">GENERATING UNIVERSE…</div><div class="keys">SPACE pause · F fullscreen</div><div class="cr"></div>');
  var title = el('sttTitle', '<div class="eb">// PROCEDURAL SPACE SIMULATION</div><div class="mn">SPACE TRAVEL <span class="amber">&amp;</span> TRANSPORT</div>');
  var cap = el('sttCap', '<span class="ship"><span class="ty"></span> / <span class="nm"></span> <span class="sep">--</span> </span><span class="loc"></span><span class="tl"></span>');
  var credit = el('sttCredit', ''); credit.textContent = CREDIT;
  var pause = el('sttPause', 'PAUSE');
  function mount(){ [start, title, cap, credit, pause].forEach(function(e){ document.body.appendChild(e); }); start.querySelector('.cr').textContent = CREDIT; }
  if(document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

  var running = false, paused = false, last = 0, capKey = '', tlTxt = null;
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
    try {
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
    if(!running){ if(e.key === 'Enter' || e.key === ' ') go(); return; }
    if(e.key === ' '){ paused = !paused; pause.style.display = paused ? 'flex' : 'none'; try { paused ? musicAudio.pause() : (__CINE.OPT.music && musicAudio.play()); } catch(_){} }
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
    start.classList.add('ready'); start.addEventListener('click', go);
  }, 200);
})();
