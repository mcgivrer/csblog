/* Lancement de la démo « Observation des étoiles » : attente du monde, prise de contrôle du moteur, boucle infinie */
(function(){
  var VERSION = 'v7.19';                                              // version affichée dans la ligne de crédits (mise à jour à chaque livraison)
  var CREDIT = '(c) 2026 Frédéric Delorme & claude.ai - Music by ScoreStudio - Observation des étoiles ' + VERSION;
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
    /* barre de progression de la génération (lot 5) : transform animé par le compositeur, fluide même quand le script calcule */
    "#sttStart .pb{position:relative;width:min(300px,70vw);height:2px;background:#25375c;margin:18px 0 9px}" +
    "#sttStart .pb::before,#sttStart .pb::after{content:'';position:absolute;top:-4px;width:1px;height:10px;background:#5d6f92}#sttStart .pb::before{left:-1px}#sttStart .pb::after{right:-1px}" +
    "#sttStart .pb i{position:absolute;inset:0;background:#ffb454;transform-origin:0 50%;transform:scaleX(0);transition:transform .45s ease-out;box-shadow:0 0 8px rgba(255,180,84,.5)}" +
    "#sttStart .pl{font-size:10.5px;letter-spacing:.14em;color:#8ea0c4;min-height:14px}#sttStart .pl b{color:#ffb454;font-weight:400;margin-left:10px}" +
    "#sttStart.ready .pb i{background:#5eead4;box-shadow:0 0 8px rgba(94,234,212,.45)}#sttStart.ready .pl b{color:#5eead4}" +
    "@media (prefers-reduced-motion: reduce){#sttStart .pb i{transition:none!important}}" +
    /* sélecteur de vaisseaux (lot 1) : bouton d'accueil, bouton discret en démo, mode Auto/Suivre, message — charte McGivrer */
    "#sttPick{margin-top:14px;font-size:12px;letter-spacing:.14em;color:#5d6f92;padding:10px 18px;border:1px solid #25375c;cursor:default;user-select:none}" +
    "#sttStart.ready #sttPick{color:#5eead4;cursor:pointer}#sttStart.ready #sttPick:hover,#sttPick:focus-visible{border-color:#5eead4;outline:0}" +
    "#sttPick .ch{color:#ffb454}" +
    "#sttUi{position:fixed;top:3.2vh;right:2.4vw;z-index:11;display:flex;gap:8px;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.12em;opacity:0;transition:opacity .5s;pointer-events:none}" +
    "#sttUi.on{opacity:1;pointer-events:auto}" +
    "#sttUi button{font:inherit;letter-spacing:inherit;color:#e8edf5;background:rgba(11,18,32,.82);border:1px solid #25375c;padding:7px 11px;cursor:pointer;border-radius:0}" +
    "#sttUi button:hover,#sttUi button:focus-visible{border-color:#ffb454;color:#ffb454;outline:0}#sttUi .k{color:#5d6f92;margin-left:6px}" +
    "#sttUi button.lock{color:#ffb454;border-color:#a97a3d}#sttUi button.off{color:#5d6f92}" +
    "#sttToast{position:fixed;left:50%;bottom:14vh;transform:translateX(-50%);z-index:13;font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.08em;color:#e8edf5;background:rgba(11,18,32,.9);border:1px solid #25375c;border-left:2px solid #ffb454;padding:10px 16px;opacity:0;transition:opacity .4s;pointer-events:none;max-width:80vw;text-align:center}" +
    "#sttToast.on{opacity:1}#sttToast .a{color:#ffb454}#sttToast .c{color:#5eead4}" +
    "#sttFleet{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:14;display:none;width:min(440px,92vw);max-height:92vh;overflow:auto;font-family:'JetBrains Mono',monospace;background:rgba(11,18,32,.96);border:1px solid #25375c;border-left:2px solid #ff6b5e;padding:16px 16px 12px}" +
    "#sttFleet.on{display:block}#sttFleet .hd{font-size:11px;letter-spacing:.14em;color:#ff6b5e;margin-bottom:10px}#sttFleet .hd2{color:#5eead4;margin-top:6px}#sttFleet .hd3{color:#ff9a3c;margin-top:6px}" +
    "#sttFleet button{display:block;width:100%;text-align:left;margin:0 0 8px;padding:10px 12px;background:#0f1a30;border:1px solid #25375c;color:#e8edf5;font:inherit;cursor:pointer}" +
    "#sttFleet button b{display:block;font-size:12px;letter-spacing:.1em;color:#ffb454}#sttFleet button span{font-size:11px;color:#8ea0c4}" +
    "#sttFleet button:hover,#sttFleet button:focus-visible{border-color:#ffb454;outline:none}#sttFleet button.x{text-align:center;color:#8ea0c4;margin:4px 0 0}" +
    "#sttHelp{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:20;display:none;width:min(720px,94vw);max-height:92vh;overflow:auto;font-family:'JetBrains Mono',monospace;background:rgba(11,18,32,.97);border:1px solid #25375c;border-left:2px solid #5eead4;padding:16px 18px 14px}" +
    "#sttHelp.on{display:block}#sttHelp .hd{display:flex;justify-content:space-between;align-items:center;font-size:11px;letter-spacing:.14em;color:#5eead4;margin-bottom:10px}" +
    "#sttHelp .hd button{font:inherit;letter-spacing:inherit;background:#0f1a30;border:1px solid #25375c;color:#8ea0c4;padding:4px 10px;cursor:pointer}#sttHelp .hd button:hover,#sttHelp .hd button:focus-visible{border-color:#ffb454;color:#ffb454;outline:0}" +
    "#sttHelp .cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:4px 22px}#sttHelp h3{margin:10px 0 4px;font-size:10.5px;font-weight:400;letter-spacing:.14em;color:#ffb454}" +
    "#sttHelp .r{display:flex;gap:10px;align-items:baseline;font-size:11px;line-height:1.55;color:#c9d4ea}#sttHelp .r .ky{flex:0 0 160px;text-align:right;white-space:nowrap}" +
    "#sttHelp kbd{display:inline-block;min-width:18px;padding:0 5px;margin-left:3px;text-align:center;font:inherit;font-size:10.5px;color:#e8edf5;background:#0f1a30;border:1px solid #25375c;border-bottom-width:2px}" +
    "#sttHelp .ft{margin-top:10px;font-size:10px;letter-spacing:.08em;color:#5d6f92}" +
    "@media (prefers-reduced-motion: reduce){#sttUi,#sttToast{transition:none}}";
  document.head.appendChild(css);
  function el(id, html){ var d = document.createElement('div'); d.id = id; d.innerHTML = html; return d; }
  var start = el('sttStart', '<div class="eb">// PROCEDURAL SPACE SIMULATION</div><div class="mn">SPACE TRAVEL <span class="amber">&amp;</span> TRANSPORT</div><div class="sub">Observation des étoiles — endless cinematic mode</div><div class="go" id="sttGo">GENERATING UNIVERSE…</div><div class="pb" id="sttPb" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Universe generation"><i></i></div><div class="pl" id="sttPl">BOOTING ENGINE<b>0 %</b></div><div id="sttPick" role="button" tabindex="0">CHOOSE A SHIP <span class="ch">· RANDOM</span></div><div class="keys">SPACE pause · F fullscreen · V ship · L follow · M map · R radar · H data</div><div class="cr"></div>');
  var title = el('sttTitle', '<div class="eb">// PROCEDURAL SPACE SIMULATION</div><div class="mn">SPACE TRAVEL <span class="amber">&amp;</span> TRANSPORT</div>');
  var cap = el('sttCap', '<span class="ship"><span class="ty"></span> / <span class="nm"></span> <span class="sep">--</span> </span><span class="loc"></span><span class="tl"></span>');
  var credit = el('sttCredit', ''); credit.textContent = CREDIT;
  var pause = el('sttPause', 'PAUSE');
  var ui = el('sttUi', '<button type="button" id="sttMapBtn">MAP<span class="k">M</span></button><button type="button" id="sttRadarBtn">RADAR<span class="k">R</span></button><button type="button" id="sttShipBtn">SHIP<span class="k">C</span></button><button type="button" id="sttFleetBtn">FLEET<span class="k">G</span></button><button type="button" id="sttDataBtn">DATA<span class="k">D</span></button><button type="button" id="sttLockBtn">AUTO<span class="k">L</span></button><button type="button" id="sttHelpBtn">HELP<span class="k">H</span></button>'); ui.className = 'demo-ui';
  var toast = el('sttToast', ''); toast.className = 'demo-ui';
  /* v7.5 : panneau FLEET — suivre une formation militaire dans le système courant (ou au suivant si le départ est engagé) */
  var fleet = el('sttFleet', '<div class="hd">// MILITARY FLEET</div>' +
    '<button type="button" data-k="patrol"><b>FIGHTER PATROL</b><span>3 or 4 fighters in formation, low orbit</span></button>' +
    '<button type="button" data-k="station"><b>DESTROYER ON STATION</b><span>Destroyer, escort pair, launches and gunnery drills</span></button>' +
    '<button type="button" data-k="escort"><b>CORVETTE ESCORT</b><span>Corvette flying alongside a freighter</span></button>' +
    '<div class="hd hd2">// SHIP CARRIER</div>' +
    '<button type="button" data-k="carrier"><b>SHIP CARRIER</b><span>640 m through-dock carrier, a freighter berthed aboard</span></button>' +
    '<div class="hd hd3">// COMBAT</div>' +
    '<button type="button" data-k="combat-skirmish"><b>FIGHTER SKIRMISH</b><span>Two patrols of 3 fighters, dogfights and missiles</span></button>' +
    '<button type="button" data-k="combat-duel"><b>LINE DUEL</b><span>Two destroyers exchanging railgun fire and missile salvos</span></button>' +
    '<button type="button" data-k="combat-convoy"><b>CONVOY ATTACK</b><span>Raiders strafe three freighters, corvette and fighters escort</span></button>' +
    '<button type="button" data-k="combat-raid"><b>PIRATE RAID</b><span>Pirates on a lone freighter until a patrol jumps in</span></button>' +
    '<button type="button" data-k="combat-assault"><b>CARRIER ASSAULT</b><span>Destroyer and fighters against a fleet carrier\'s defences</span></button>' +
    '<button type="button" data-k="close" class="x">CLOSE · Esc</button>');
  fleet.className = 'demo-ui'; fleet.setAttribute('role', 'dialog'); fleet.setAttribute('aria-label', 'Military fleet');
  /* aide (touche H, bouton HELP) : toutes les touches et actions de la démo */
  function K(){ return Array.prototype.map.call(arguments, function(k){ return '<kbd>' + k + '</kbd>'; }).join(' '); }
  function row(keys, what){ return '<div class="r"><span class="ky">' + keys + '</span><span>' + what + '</span></div>'; }
  var help = el('sttHelp',
    '<div class="hd"><span>// KEYS &amp; ACTIONS</span><button type="button" data-k="close" aria-label="Close help">CLOSE <kbd>Esc</kbd></button></div>' +
    '<div class="cols"><div>' +
    '<h3>DEMO</h3>' +
    row(K('Space'), 'Pause / resume (music included)') +
    row(K('F'), 'Fullscreen') +
    row(K('L'), 'AUTO (relays between ships) / FOLLOW (the filmed ship stays the hero)') +
    row(K('D'), 'DATA: ship labels and gauges on / off (remembered)') +
    row(K('R'), 'Radar on / off') +
    row(K('H'), 'This help (<kbd>H</kbd> or <kbd>Esc</kbd> closes it)') +
    '<h3>PANELS</h3>' +
    row(K('M'), 'Universe map (<kbd>M</kbd> or <kbd>Esc</kbd> closes)') +
    row(K('G'), 'FLEET: military patrols, ship carrier, combat engagements') +
    row(K('V'), 'Ship selector: choose the hero ship') +
    row(K('C'), 'Shipyard: all ship types, 3D preview, age and wear sliders') +
    '<h3>START SCREEN</h3>' +
    row(K('Enter') + ' ' + K('Space'), 'Launch the demo') +
    row(K('V') + ' ' + K('C'), 'Choose a ship / open the shipyard first') +
    '</div><div>' +
    '<h3>MAP</h3>' +
    row('Wheel, ' + K('+') + ' ' + K('−'), 'Zoom') +
    row('Drag, ' + K('←') + K('↑') + K('↓') + K('→'), 'Pan') +
    row(K('Backspace'), 'Up one level (sector, system…)') +
    row(K('C') + ' ' + K('Home'), 'Back to the current system') +
    row(K('Enter'), 'Act on the selected target (follow, jump…)') +
    row('Touch', 'Drag, pinch to zoom, double-tap to act') +
    row(K('Space') + ' ' + K('F') + ' ' + K('R'), 'Still work while the map is open') +
    '<h3>SHIP SELECTOR</h3>' +
    row(K('←') + ' ' + K('→'), 'Previous / next ship') +
    row(K('↑') + ' ' + K('↓'), 'Propulsion') +
    row(K('Enter'), 'Board the ship') +
    row(K('Esc'), 'Cancel') +
    '<h3>SHIPYARD &amp; FLEET</h3>' +
    row(K('←') + K('↑') + K('↓') + K('→'), 'Move through the shipyard list') +
    row(K('Esc'), 'Close the shipyard or the fleet panel') +
    '<h3>MOUSE</h3>' +
    row('Move', 'Shows the buttons: MAP, RADAR, SHIP, FLEET, DATA, AUTO, HELP') +
    '</div></div>' +
    '<div class="ft">All other keys and mouse input are disabled: the demo runs on its own.</div>');
  help.className = 'demo-ui'; help.setAttribute('role', 'dialog'); help.setAttribute('aria-label', 'Keys and actions');
  function mount(){ [start, title, cap, credit, pause, ui, toast, fleet, help].forEach(function(e){ document.body.appendChild(e); }); start.querySelector('.cr').textContent = CREDIT; }
  if(document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

  var running = false, paused = false, last = 0, capKey = '', tlTxt = null, ready = false, selOpen = false, selCancel = false, uiTimer = 0, toastTimer = 0;
  /* ---------- sélecteur de vaisseaux : celui du jeu (openShipSelect), réutilisé tel quel ---------- */
  function showToast(html){ toast.innerHTML = html; toast.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(function(){ toast.classList.remove('on'); }, 3600); }
  function esc(t){ return String(t).replace(/[&<>]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]; }); }
  function modelName(id){ var m = SHIPGEN.MODELS.filter(function(x){ return x.id === id; })[0]; return m ? m.name : id; }
  function refreshLock(){ var b = document.getElementById('sttLockBtn'); if(!b || !window.__CINE) return; var f = __CINE.followHero; b.firstChild.textContent = f ? 'FOLLOW' : 'AUTO'; b.classList.toggle('lock', f); }
  function setPaused(p, silent){ paused = p; pause.style.display = p && !silent ? 'flex' : 'none'; try { p ? musicAudio.pause() : (running && __CINE.OPT.music && musicAudio.play()); } catch(_){} }
  var wasPaused = false, yardOpen = false;
  function openYard(){                                                          // v7.18 : chantier — tous les vaisseaux, âge et usure
    if(!running || selOpen || yardOpen || !window.__YARD) return;
    if(window.__STARMAP && __STARMAP.isOpen()) __STARMAP.close(); if(fleetOpen) closeFleet();
    yardOpen = __YARD.open(function(res){
      yardOpen = false; last = performance.now(); if(!res) return;
      var r = __CINE.useShip(res.id, res.look), nm = esc(res.name), aw = ' <span class="c">age ' + Math.round(res.look.age*100) + ' % · wear ' + Math.round(res.look.wear*100) + ' %</span>';
      if(r === 'invalid') return;
      showToast(r === 'trip' ? '<span class="a">CARRIER</span> · ' + nm + ' <span class="c">boards a ship carrier — the journey continues aboard</span>'
              : r === 'now' ? '<span class="a">SHIPYARD</span> · ' + nm + ' <span class="c">joins the orbit — camera follows it now</span> ·' + aw
                            : '<span class="a">SHIPYARD</span> · ' + nm + ' <span class="c">at the next system</span> ·' + aw);
    });
  }
  function openSelector(){
    if(selOpen || !ready || typeof openShipSelect !== 'function') return;
    if(window.__STARMAP && __STARMAP.isOpen()) __STARMAP.close();
    if(document.activeElement && document.activeElement.blur) document.activeElement.blur();
    selOpen = true; selCancel = false; wasPaused = paused; if(running) setPaused(true, true);
    window.__uiOpen = '#shipSelect';
    openShipSelect(function(id, opts){
      window.__uiOpen = null; selOpen = false;
      if(running) setPaused(wasPaused);
      if(selCancel) return;
      var r = __CINE.setHero(id, opts);
      var nm = esc(modelName(id));
      if(!running){ document.querySelector('#sttPick .ch').textContent = '· ' + modelName(id).toUpperCase(); return; }
      showToast(r === 'trip' ? '<span class="a">CARRIER</span> · ' + nm + ' <span class="c">boards a ship carrier — the journey continues aboard</span>'   // v7.11
              : r === 'now' ? '<span class="a">RELAY</span> · ' + nm + ' <span class="c">joins the orbit — camera follows it now</span>'
                            : '<span class="a">RELAY</span> · ' + nm + ' <span class="c">takes over at the next system</span>');
    });
  }
  var helpOpen = false;
  function openHelp(){ if(selOpen || yardOpen) return; helpOpen = true; help.classList.add('on'); var b = help.querySelector('button'); b && b.focus(); }
  function closeHelp(){ helpOpen = false; help.classList.remove('on'); if(document.activeElement && document.activeElement.blur) document.activeElement.blur(); }
  help.addEventListener('click', function(e){ if(e.target.closest('button')) closeHelp(); });
  var fleetOpen = false;
  function openFleet(){ if(!running || selOpen) return; if(window.__STARMAP && __STARMAP.isOpen()) __STARMAP.close(); fleetOpen = true; fleet.classList.add('on'); var b = fleet.querySelector('button'); b && b.focus(); }
  function closeFleet(){ fleetOpen = false; fleet.classList.remove('on'); }
  var FLEET_NAMES = { patrol: 'Fighter patrol', station: 'Destroyer on station', escort: 'Corvette escort', carrier: 'Ship carrier' };
  fleet.addEventListener('click', function(e){ var b = e.target.closest('button'); if(!b) return; var k = b.getAttribute('data-k'); closeFleet(); if(k === 'close' || !window.__CINE) return;
    if(k.indexOf('combat-') === 0){ var ck = k.slice(7), cr = __CINE.startCombat ? __CINE.startCombat(ck) : 'invalid'; if(cr === 'invalid') return;   // v7.14 : engagement
      var CKN = { skirmish: 'Fighter skirmish', duel: 'Line duel', convoy: 'Convoy attack', raid: 'Pirate raid', assault: 'Carrier assault' }; ck = (cr === 'now' && __CINE.lastCombatKind) || ck;
      showToast('<span class="a">COMBAT</span> · ' + (CKN[ck] || 'Engagement') + ' <span class="c">' + (cr === 'now' ? '— starting now' : cr === 'busy' ? '— an engagement is already under way' : '— at the next system') + '</span>'); return; }
    var r = k === 'carrier' ? (__CINE.showCarrier ? __CINE.showCarrier() : 'invalid') : __CINE.showMilitary(k); if(r === 'invalid') return;   // v7.6 : porte-vaisseaux
    var nm = FLEET_NAMES[k]; if(k === 'carrier' && __CINE.carrierDbg){ var cd = __CINE.carrierDbg(); if(cd && cd.type) nm = cd.type; }
    showToast('<span class="a">FLEET</span> · ' + nm + ' <span class="c">' + (r === 'now' ? '— camera follows it now' : '— at the next system') + '</span>'); });
  function cancelSelector(){ if(!selOpen) return; selCancel = true; var b = document.getElementById('ssConfirm'); b && b.click(); }
  function toggleFollow(){ if(!window.__CINE) return; var f = __CINE.setFollow(!__CINE.followHero); refreshLock();
    var h = __CINE.heroInfo(); showToast(f ? '<span class="a">FOLLOW</span> · ' + esc(h.type) + ' / ' + esc(h.name) + ' <span class="c">stays the hero</span>' : '<span class="a">AUTO</span> <span class="c">· relays between ships resume</span>'); }
  /* carte (starmap.js) et radar (radar.js) */
  function openMap(){ if(!running || selOpen || !window.__STARMAP) return; __STARMAP.open(); }
  function refreshRadar(){ var b = document.getElementById('sttRadarBtn'); if(b && window.__RADAR) b.classList.toggle('off', !__RADAR.isOn()); }
  function refreshData(){ var b = document.getElementById('sttDataBtn'); if(b && window.__LABELS) b.classList.toggle('off', !__LABELS.isOn()); }   // v7.13 : étiquettes et jauges
  function toggleData(){ if(!window.__LABELS) return; var on = __LABELS.toggle(); refreshData(); showToast('<span class="a">DATA</span> <span class="c">· ship labels and gauges ' + (on ? 'on' : 'off') + '</span>'); }
  function toggleRadar(){ if(!window.__RADAR) return; var on = __RADAR.toggle(); refreshRadar(); showToast('<span class="a">RADAR</span> <span class="c">· ' + (on ? 'on' : 'off') + '</span>'); }
  window.__DEMO = { toast: function(h){ showToast(h); }, running: function(){ return running; }, openYard: function(){ openYard(); return yardOpen; }, yardOpen: function(){ return yardOpen; } };
  function pokeUi(){ if(!running) return; ui.classList.add('on'); clearTimeout(uiTimer); uiTimer = setTimeout(function(){ ui.classList.remove('on'); }, 2600); }
  window.addEventListener('mousemove', pokeUi, { passive: true });
  ui.addEventListener('click', function(e){ var b = e.target.closest('button'); if(!b) return; b.blur();
    if(b.id === 'sttShipBtn') openYard(); else if(b.id === 'sttFleetBtn') openFleet(); else if(b.id === 'sttLockBtn') toggleFollow(); else if(b.id === 'sttMapBtn') openMap(); else if(b.id === 'sttRadarBtn') toggleRadar(); else if(b.id === 'sttDataBtn') toggleData(); else if(b.id === 'sttHelpBtn') openHelp(); pokeUi(); });
  ui.addEventListener('keydown', function(e){ if(e.key === 'Enter' || e.key === ' ') e.stopPropagation(); });
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
    if(Q === 'high') return;                                            // ?quality=high : résolution imposée, aucune adaptation
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
    if(yardOpen && window.__YARD) try { __YARD.frame(now); } catch(e){ console.error(e); }   // v7.18 : chantier ouvert — démo figée, aperçu seul
    if(!selOpen && !yardOpen && !window.__DEMO_NOLOOP) try {          // sélecteur ouvert : la démo se fige (un seul rendu WebGL actif) ; __DEMO_NOLOOP : tests pas à pas
      __CINE.step(paused ? 0 : dt);
      setCaption(__CINE.caption()); setTimeLapse(__CINE.caption());
    } catch(e){ console.error(e); }
    try {
      var mapOpen = !!(window.__STARMAP && __STARMAP.isOpen());
      if(mapOpen) __STARMAP.frame(now);
      if(window.__RADAR) __RADAR.frame(now, running && !selOpen && !yardOpen && !mapOpen);
      if(window.__LABELS) __LABELS.frame(now, running && !selOpen && !yardOpen && !mapOpen && !fleetOpen);
    } catch(e){ console.error(e); }
    window.__raf(loop);
  }
  function go(){
    if(running) return; running = true;
    start.classList.add('hide'); title.style.opacity = '1';
    if(__CINE.OPT.music){ try { musicAudio.loop = true; musicAudio.currentTime = 0; musicAudio.volume = .5; musicAudio.play().catch(function(){}); } catch(e){} }
    last = performance.now(); window.__raf(loop);
  }
  function fullscreen(){ var d = document.documentElement; document.fullscreenElement ? document.exitFullscreen() : (d.requestFullscreen && d.requestFullscreen()); }
  window.__onKey = function(e){
    if(selOpen){ if(e.key === 'Escape') cancelSelector(); return; }
    if(yardOpen){ if(e.key === 'Escape' && window.__YARD) __YARD.close(null); return; }
    if(helpOpen){ if(e.key === 'Escape' || e.key === 'h' || e.key === 'H') closeHelp(); return; }
    if(e.key === 'h' || e.key === 'H'){ openHelp(); return; }
    if(fleetOpen){ if(e.key === 'Escape' || e.key === 'g' || e.key === 'G') closeFleet(); return; }
    if(window.__STARMAP && __STARMAP.isOpen()){                         // carte ouverte : ses raccourcis, plus pause et plein écran
      if(e.key === ' '){ setPaused(!paused); return; }
      if(e.key === 'f' || e.key === 'F'){ fullscreen(); return; }
      if(e.key === 'r' || e.key === 'R'){ toggleRadar(); return; }
      if(__STARMAP.key(e) && e.preventDefault) e.preventDefault();
      return;
    }
    if(e.key === 'v' || e.key === 'V'){ openSelector(); return; }
    if(e.key === 'c' || e.key === 'C'){ openYard(); return; }
    if(!running){ if(e.key === 'Enter' || e.key === ' ') go(); return; }
    if(e.key === 'm' || e.key === 'M'){ openMap(); return; }
    if(e.key === 'g' || e.key === 'G'){ openFleet(); return; }
    if(e.key === 'r' || e.key === 'R'){ toggleRadar(); return; }
    if(e.key === 'd' || e.key === 'D'){ toggleData(); return; }
    if(e.key === 'l' || e.key === 'L'){ toggleFollow(); return; }
    if(e.key === ' '){ setPaused(!paused); }
    if(e.key === 'f' || e.key === 'F') fullscreen();
  };
  /* ---------- génération : barre de progression par jalons (lot 5) ----------
     moteur (terminal de démarrage du jeu, 6 lignes) → univers local (itinéraire, champs d'étoiles) → textures d'astéroïdes
     → premier système et vaisseaux → compilation des shaders (premier rendu, derrière l'écran d'accueil) */
  var prog = 0;
  function setProgress(p, label, dur){
    p = Math.max(prog, Math.min(1, p)); prog = p;
    var bar = document.querySelector('#sttPb i'), pl = document.getElementById('sttPl'), pb = document.getElementById('sttPb'); if(!bar) return;
    bar.style.transitionDuration = (dur || .45) + 's'; bar.style.transform = 'scaleX(' + p.toFixed(3) + ')';
    if(label) pl.innerHTML = label + '<b>' + Math.round(p*100) + ' %</b>';
    pb.setAttribute('aria-valuenow', String(Math.round(p*100)));
  }
  function nextPaint(fn){ window.__raf(function(){ window.__raf(function(){ setTimeout(fn, 0); }); }); }   // la barre est peinte avant chaque étape bloquante
  var PROG = [];                                                            // jalons mesurés (tests, réglage des poids)
  function mark(name){ PROG.push([name, Math.round(performance.now())]); }
  window.__loadProgress = function(){ return { p: prog, marks: PROG.slice() }; };
  var bootLines = -1;
  var wait = setInterval(function(){
    var term = document.getElementById('bootTerm'), n = term ? term.children.length : 0;
    if(n !== bootLines && !(typeof worldReadyForCinematic !== 'undefined' && worldReadyForCinematic)){
      bootLines = n;
      if(n < 6) setProgress(.04 + .3*n/6, 'BOOTING ENGINE', .35);
      else { setProgress(.34, 'GENERATING LOCAL UNIVERSE'); setProgress(.52, null, 1.6); mark('boot'); }
    }
    if(typeof worldReadyForCinematic === 'undefined' || !worldReadyForCinematic || !window.__CINE) return;
    clearInterval(wait); mark('world');
    window.__takeover = true;
    try { musicAudio.pause(); } catch(e){}
    renderer.setPixelRatio(prMax); renderer.setSize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', function(){ renderer.setSize(window.innerWidth, window.innerHeight); });   // les caméras de la démo prennent le rapport d'aspect du tampon à chaque image
    setProgress(.54, 'TEXTURING ASTEROIDS'); setProgress(.64, null, 1.2);
    nextPaint(function(){
      __CINE.initA(); mark('asteroids');
      setProgress(.66, 'BUILDING FIRST SYSTEM & SHIPS'); setProgress(.86, null, 1.8);
      nextPaint(function(){
        var info = __CINE.initB(); mark('system');
        console.log('[cine] ready', info);
        setProgress(.88, 'COMPILING SHADERS'); setProgress(.98, null, 1);
        nextPaint(function(){
          try { __CINE.prewarm && __CINE.prewarm(); } catch(e){ console.error(e); }   // v7.6 : porte-vaisseaux et flotte militaire
          __CINE.step(0.001);                                               // premier rendu caché : shaders compilés avant le lancement
          mark('shaders');
          setProgress(1, 'UNIVERSE READY');
          document.getElementById('sttGo').textContent = '▶  CLICK TO LAUNCH';
          ready = true; refreshLock(); refreshRadar(); refreshData();
          var pick = document.getElementById('sttPick');
          pick.addEventListener('click', function(e){ e.stopPropagation(); openSelector(); });
          pick.addEventListener('keydown', function(e){ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); e.stopPropagation(); openSelector(); } });
          start.classList.add('ready'); start.addEventListener('click', function(e){ if(!selOpen) go(); });
        });
      });
    });
  }, 100);
})();
