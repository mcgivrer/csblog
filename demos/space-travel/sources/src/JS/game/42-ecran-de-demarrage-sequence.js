/* =========================================================================
   11. ÉCRAN DE DÉMARRAGE — séquence terminal façon McGivrer
   ========================================================================= */
(function boot(){
  const lines = [
    '> INITIALISATION DE LA NAVIGATION QUANTIQUE...',
    '> CHARGEMENT DE LA GRAINE : ' + SEED,
    "> GÉNÉRATION DE L'UNIVERS LOCAL...",
    '> CALIBRAGE DES CAPTEURS STELLAIRES : OK',
    '> SYSTÈMES DE VOL : OK',
    '> BASCULEMENT SUR AUTOPILOTE'
  ];
  const term = document.getElementById('bootTerm');
  const bootEl = document.getElementById('boot');
  const titleEl = document.getElementById('titleScreen');
  const langBtns = Array.prototype.slice.call(document.querySelectorAll('.lang-btn'));
  let li = 0;
  function nextLine(){
    if(li >= lines.length){
      setTimeout(finish, 500);
      return;
    }
    const span = document.createElement('div');
    span.textContent = lines[li];
    if(li===1 || li===lines.length-1) span.className='amber';
    term.appendChild(span);
    li++;
    setTimeout(nextLine, 340);
  }
  /* navigation clavier de l'écran-titre (demande utilisateur) : curseur
     gauche/droite (et haut/bas, par tolérance) pour déplacer le focus
     entre les langues, ENTRÉE ou ESPACE pour valider — en plus du clic/
     tactile déjà en place, jamais à la place. titleFocusIndex vit ici
     plutôt qu'en variable globale : rien en dehors de cet écran n'en a
     besoin. */
  let titleFocusIndex = 0;
  function updateTitleFocusVisual(){
    langBtns.forEach(function(b, i){ b.classList.toggle('focused', i === titleFocusIndex); });
  }
  /* point d'entrée des captures automatisées (src/test/captures.js) : mêmes étapes
     que le bouton « Embarquer », sans l'écran de sélection — dont l'aperçu 3D est
     très lent en rendu logiciel. Les tests de la sélection, eux, passent par le vrai dialogue. */
  window.__sttQuickStart = function(id, opts){
    applyLanguage(); refreshCreditsDisplay(false);
    titleEl.classList.add('hidden'); titleEl.style.display = 'none';
    installShip(id, opts || {});
    window.__sttMissions = !!(opts && opts.missions);   /* M1 : tests existants sur l'itinéraire, sauf option */
    document.body.classList.remove('title-active');
    shipRig.visible = true;
    if(ROUTE.gates) ROUTE.gates.visible = true;
    startGame();
  };
  function selectLanguageAndStart(btn){
    if(SHIP_SELECT_OPEN) return;
    LANG = btn.getAttribute('data-lang');
    applyLanguage();
    refreshCreditsDisplay(false);
    titleEl.classList.add('hidden');
    setTimeout(function(){ titleEl.style.display = 'none'; }, 650);
    /* v2.13 : sélection du vaisseau entre l'écran-titre et la partie. Le
       travelling de fond continue derrière le dialogue ; vaisseau et HUD
       restent masqués jusqu'au choix. */
    openShipSelect(function(id, opts){
      installShip(id, opts);
      document.body.classList.remove('title-active');
      shipRig.visible = true;
      if(ROUTE.gates) ROUTE.gates.visible = true;
      startGame();
    });
  }
  langBtns.forEach(function(btn, i){
    btn.addEventListener('click', function(){ selectLanguageAndStart(btn); });
    /* le focus clavier natif (Tab) doit aussi mettre à jour le repère
       visuel et l'index suivi, pour rester cohérent si le joueur mélange
       Tab et curseurs plutôt que de n'utiliser que l'un des deux. */
    btn.addEventListener('focus', function(){ titleFocusIndex = i; updateTitleFocusVisual(); });
  });
  window.addEventListener('keydown', function(e){
    if(titleEl.style.display !== 'flex') return;
    if(e.code === 'ArrowRight' || e.code === 'ArrowDown'){
      e.preventDefault();
      titleFocusIndex = (titleFocusIndex+1) % langBtns.length;
      updateTitleFocusVisual();
      langBtns[titleFocusIndex].focus();
    } else if(e.code === 'ArrowLeft' || e.code === 'ArrowUp'){
      e.preventDefault();
      titleFocusIndex = (titleFocusIndex-1+langBtns.length) % langBtns.length;
      updateTitleFocusVisual();
      langBtns[titleFocusIndex].focus();
    } else if(e.code === 'Enter' || e.code === 'Space'){
      e.preventDefault();
      selectLanguageAndStart(langBtns[titleFocusIndex]);
    }
  });

  /* la séquence terminal ne fait plus démarrer le jeu directement : elle
     cède la place à l'écran-titre, où le choix de la langue déclenche
     réellement le calcul de la route et le lancement de la boucle
     d'animation (cf. startGame ci-dessous). */
  /* v2.15 : garde contre le double appel. finish() est déclenchée au clic sur le
     générique ET à la fin de son défilement automatique : sans garde, un joueur
     qui passait le générique d'un clic puis lançait vite sa partie voyait
     l'écran-titre revenir par-dessus quelques secondes plus tard (HUD masqué,
     musique relancée). Défaut révélé par l'automatisation des captures. */
  let bootFinished = false;
  function finish(){
    if(bootFinished) return;
    bootFinished = true;
    bootEl.classList.add('hidden');
    setTimeout(function(){
      bootEl.style.display = 'none';
      titleEl.style.display = 'flex';
      document.body.classList.add('title-active');
      /* musique dès l'affichage de l'écran-titre (demande utilisateur),
         pas seulement sur le clic qui l'a amené ici — le générique finit
         aussi tout seul (setTimeout ci-dessous, sans clic) et doit
         déclencher la musique de la même façon. Politique autoplay des
         navigateurs : ne joue effectivement que si un geste utilisateur a
         déjà eu lieu quelque part avant cet instant (le clic, quand il a
         eu lieu) — sinon .play() est silencieusement refusée par le
         navigateur (.catch()), sans quoi ce ne serait plus un agrément
         mais une erreur bruyante à chaque partie où le joueur n'a pas
         cliqué pour passer le générique. */
      musicAudio.play().catch(function(){});
      updateTitleFocusVisual();
      langBtns[titleFocusIndex].focus();
      /* travelling de fond (demande utilisateur) : le monde doit déjà
         exister pour qu'il y ait quelque chose à survoler. computeRoute()
         ne dépend d'aucun choix de langue (juste de la position/cap de
         départ du vaisseau, fixes) — avancé ici plutôt que dans
         startGame() où il vivait avant, sans changer son résultat (pur/
         déterministe pour une position de départ inchangée). Son appel
         construit aussi le premier système planétaire en chemin
         (ensureSystemsBuilt, en fin de fonction) : sans ce déplacement,
         aucune planète n'existerait encore pour le travelling. */
      computeRoute(shipRig.position, new THREE.Vector3(0,0,-1), true);
      refreshField(STAR_CELL, STAR_RADIUS, starField, buildStarCell);
      refreshField(NEBULA_CELL, NEBULA_RADIUS, nebulaField, buildNebulaCell);
      /* vaisseau et trajectoire hors champ (demande utilisateur) : le
         travelling doit montrer l'univers généré, pas le cargo ni le
         tracé de sa route — repéré avec une capture montrant clairement
         les portiques en pointillés de ROUTE.gates dans le décor. .visible
         ne touche qu'au rendu (pas à la position/aux calculs), donc sans
         incidence sur le calcul de route lui-même ni sur son affichage une
         fois la partie réellement démarrée (remis à true dans
         selectLanguageAndStart, juste en dessous dans ce même fichier). */
      shipRig.visible = false;
      if(ROUTE.gates) ROUTE.gates.visible = false;
      worldReadyForCinematic = true;
      animate();
    }, 900);
  }
  bootEl.addEventListener('click', finish);
  nextLine();

  function startGame(){
    gameStarted = true;
    if(typeof TITLE !== 'undefined') TITLE.stop();   /* fin de la séquence de titre (distorsion, système affiché) */
    if(REAL.active) REAL.enterSystem(ROUTE.legs[0]);   /* L2.2 : vaisseau posé au point d'arrivée de la première étape */
    if(REAL.active && typeof MISSIONS !== 'undefined'){ MISSIONS.setEnabled(window.__sttMissions !== false); if(MISSIONS.enabled()) MISSIONS.start(); }   /* M1 : départ en orbite, tableau des missions */
    /* premier rafraîchissement de la barre d'icônes — différé jusqu'ici
       (cf. commentaires dans initHudIconBar/initTouchControls) car il
       dépend d'orbitState et ROUTE, tous deux déclarés après ces IIFE. */
    if(typeof refreshHudIconBar === 'function') refreshHudIconBar();
    if(typeof repositionAllPanels === 'function') repositionAllPanels();
    showWelcomeMessage();
    /* animate() tourne déjà depuis la fin du générique (cf. finish()) —
       il ne reste rien à (re)lancer ici, seulement à laisser gameStarted
       faire basculer son comportement au prochain passage. */
  }
})();

/* ---------- v2.13 : sélection du vaisseau (dialogue provisoire, futur emplacement de la boutique) ---------- */
const SS_ARCH = {
  fr:{ e18:'Cargo-entrepôt', e140:'Cargo-entrepôt (vraquier)', p10:'Cargo-poutre', p44:'Cargo-poutre long', g1:'Citernier à glace', tS:'Pousseur léger', tM:'Pousseur moyen', tL:'Pousseur lourd', l20:'Paquebot', x1:'Cargo léger rapide' },
  en:{ e18:'Warehouse freighter', e140:'Warehouse bulk carrier', p10:'Spine freighter', p44:'Long spine freighter', g1:'Ice tanker', tS:'Light tug', tM:'Medium tug', tL:'Heavy tug', l20:'Liner', x1:'Fast light freighter' },
  de:{ e18:'Lagerfrachter', e140:'Lager-Massengutfrachter', p10:'Trägerfrachter', p44:'Langer Trägerfrachter', g1:'Eistanker', tS:'Leichter Schubschlepper', tM:'Mittlerer Schubschlepper', tL:'Schwerer Schubschlepper', l20:'Linienschiff', x1:'Schneller Leichtfrachter' },
  es:{ e18:'Carguero almacén', e140:'Granelero almacén', p10:'Carguero de viga', p44:'Carguero de viga largo', g1:'Cisterna de hielo', tS:'Empujador ligero', tM:'Empujador medio', tL:'Empujador pesado', l20:'Transatlántico', x1:'Carguero ligero rápido' }
};
const SS_CREW = { I:2, II:4, III:6, IV:10 };
let SHIP_CATALOG = null, SHIP_SELECT_OPEN = false;
/* masses (ordres de grandeur) et facteur supraluminique, partagés par la fiche et l'installation */
function shipSpecs(b){
  const h = b.hullDims, st = b.stats, pax = st.cabins*2;
  const base = 0.35*h.z*Math.sqrt(h.x*h.y);                                   /* masse à vide de la coque seule (t) */
  const dry = Math.round(base*(1 + 0.06*st.rings + 0.04*st.jumpCore));       /* +6 % par anneau, +4 % pour le générateur */
  const cargo = st.containers*24 + st.tanks*2048 + pax*0.1;                   /* conteneur 24 t, réservoir de glace ~2 000 t */
  /* ×5 à ×10 : plus le vaisseau est lourd en charge, plus sa bulle est lente.
     Calculé hors options, pour ne pas dépendre de l'équipement choisi. */
  const warpFactor = Math.max(5, Math.min(10, Math.round(12 - 1.4*Math.log2((base + cargo)/1000))));
  return { dry:dry, loaded:Math.round(dry + cargo), pax:pax, warpFactor:warpFactor };
}
function shipCatalogInfo(b){
  const sp = shipSpecs(b);
  return { id:b.M.id, M:b.M, len:b.dims.z, wid:b.dims.x, hei:b.dims.y, dry:sp.dry, loaded:sp.loaded, st:b.stats, pax:sp.pax,
           crew:SS_CREW[b.M.tier] || 3, warpFactor:sp.warpFactor };
}
function openShipSelect(onConfirm){
  const el = document.getElementById('shipSelect');
  if(!el || typeof SHIPGEN === 'undefined'){ onConfirm(SHIP_DEFAULT_ID); return; }
  SHIP_SELECT_OPEN = true;
  if(!SHIP_CATALOG){
    SHIP_CATALOG = SHIPGEN.MODELS.map(function(M){ const b = SHIPGEN.build(M.id); const inf = shipCatalogInfo(b); SHIPGEN.dispose(b.group); return inf; })
      .sort(function(a, b){ return a.len - b.len; });
  }
  const loc = (I18N[LANG] && I18N[LANG].ttsLang) || 'fr-FR';
  const fmt = function(v){ return Math.round(v).toLocaleString(loc); };
  document.getElementById('ssTitle').textContent = t('ssTitle');
  document.getElementById('ssNote').textContent = t('ssNote');
  document.getElementById('ssConfirm').textContent = t('ssConfirm');
  document.getElementById('ssHint').textContent = t('ssHint');
  document.getElementById('ssPrev').setAttribute('aria-label', t('ssPrev'));
  document.getElementById('ssNext').setAttribute('aria-label', t('ssNext'));
  document.getElementById('ssPropLbl').textContent = t('ssPropSel');
  document.getElementById('ssOptE').textContent = t('ssOptE');
  document.getElementById('ssOptJ').textContent = t('ssOptJ');
  /* libellé de ssOptW posé dans show() : il porte le facteur du vaisseau présenté */
  const strip = document.getElementById('ssStrip'); strip.innerHTML = '';
  SHIP_CATALOG.forEach(function(inf, i){
    const b = document.createElement('button'); b.type = 'button';
    b.innerHTML = '<span></span><small></small>';
    b.firstChild.textContent = inf.M.name; b.lastChild.textContent = fmt(inf.len) + ' m';
    b.addEventListener('click', function(){ show(i); });
    strip.appendChild(b);
  });
  /* aperçu 3D : moteur de rendu dédié, mêmes réglages que le jeu (sRGB + ACES) */
  const canvas = document.getElementById('ssCanvas');
  const r = new THREE.WebGLRenderer({ canvas:canvas, antialias:true });
  r.outputEncoding = THREE.sRGBEncoding; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.15;
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0x05070c);
  sc.add(new THREE.HemisphereLight(0xcfe0ff, 0x1a1f2a, 0.7));
  const key = new THREE.DirectionalLight(0xfff1dc, 1.5); key.position.set(120, 160, -90); sc.add(key);
  const rim = new THREE.DirectionalLight(0x7fb0ff, 0.6); rim.position.set(-140, -40, 120); sc.add(rim);
  const cam = new THREE.PerspectiveCamera(38, 1, 0.5, 20000);
  const pivot = new THREE.Group(); sc.add(pivot);
  let idx = 0, model = null, radius = 100, running = true, prev = performance.now();
  const ftlChoice = {};                    /* choix de propulsion par modèle (anneaux par défaut) */
  function choiceOf(id){ return ftlChoice[id] || (ftlChoice[id] = { warp:true, jump:true }); }
  function setOpt(key){ const base = SHIP_CATALOG[idx]; if(!base.M.ftl) return; const ch = choiceOf(base.id); ch[key] = !ch[key]; show(idx); }
  function cycleOpt(dir){      /* ↑ ↓ : Epstein seul → + supraluminique → + saut → les deux */
    const base = SHIP_CATALOG[idx]; if(!base.M.ftl) return;
    const combos = [[false, false], [true, false], [false, true], [true, true]], ch = choiceOf(base.id);
    const i = combos.findIndex(function(c){ return c[0] === ch.warp && c[1] === ch.jump; });
    const nx = combos[(i + dir + 4) % 4]; ch.warp = nx[0]; ch.jump = nx[1]; show(idx);
  }
  function row(k, v, cls){ return '<dt>' + k + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + v + '</dd>'; }
  function show(i){
    const n = SHIP_CATALOG.length; idx = ((i % n) + n) % n;
    const base = SHIP_CATALOG[idx], eligible = !!base.M.ftl, ch = eligible ? choiceOf(base.id) : { warp:false, jump:false };
    const warp = eligible && ch.warp, jump = eligible && ch.jump;
    if(model){ pivot.remove(model); SHIPGEN.dispose(model); }
    const b = SHIPGEN.build(base.id, { warp:warp, jump:jump }); model = b.group;
    const inf = shipCatalogInfo(b), st = inf.st;          /* fiche recalculée selon la propulsion choisie */
    const c = b.box.getCenter(new THREE.Vector3()); model.position.set(-c.x, -c.y, -c.z);
    pivot.add(model); pivot.rotation.y = 0;
    radius = Math.max(b.dims.x, b.dims.y, b.dims.z);
    SHIPGEN.setDrive({ throttle:0.7, diamonds:7 });
    document.getElementById('ssName').textContent = inf.M.name;
    document.getElementById('ssType').textContent = ((SS_ARCH[LANG] || SS_ARCH.fr)[inf.id] || inf.M.arch) + ', ' + t('ssTier') + ' ' + inf.M.tier;
    document.getElementById('ssCount').textContent = (idx + 1) + ' / ' + n;
    let h = row(t('ssReg'), inf.M.reg) + row(t('ssLen'), fmt(inf.len) + ' m') + row(t('ssWid'), fmt(inf.wid) + ' m') + row(t('ssHei'), fmt(inf.hei) + ' m')
      + row(t('ssDry'), fmt(inf.dry) + ' t') + row(t('ssLoaded'), fmt(inf.loaded) + ' t');
    h += st.tanks ? row(t('ssTanks'), st.tanks) : row(t('ssCont'), st.containers || '—', st.containers ? '' : 'no');
    h += row(t('ssPax'), inf.pax || '—', inf.pax ? '' : 'no') + row(t('ssCrew'), inf.crew)
      + row(t('ssProp'), t('ssPropVal').replace('{n}', st.engines))
      + row(t('ssWarp'), warp ? t('ssWarpYes').replace('{f}', inf.warpFactor).replace('{n}', st.rings) : (eligible ? t('ssWarpOff') : t('ssJumpNo')), warp ? 'yes' : 'no')
      + row(t('ssJump'), jump ? t('ssJumpYes') : (eligible ? t('ssJumpLater') : t('ssJumpNo')), jump ? 'yes' : 'no')
      + row(t('ssDef'), t('ssDefVal').replace('{n}', st.pdc)) + row(t('ssRad'), st.radiators);
    document.getElementById('ssKv').innerHTML = h;
    Array.prototype.forEach.call(strip.children, function(bt, j){ bt.setAttribute('aria-current', String(j === idx)); });
    const oW = document.getElementById('ssOptW'), oJ = document.getElementById('ssOptJ');
    oW.textContent = t('ssOptW') + ' \u00d7' + inf.warpFactor;
    oW.setAttribute('aria-pressed', String(warp)); oJ.setAttribute('aria-pressed', String(jump)); oW.disabled = oJ.disabled = !eligible;
    document.getElementById('ssPropNote').textContent = eligible ? '' : t('ssOptNote');
    const cur = strip.children[idx]; if(cur && cur.scrollIntoView) cur.scrollIntoView({ block:'nearest', inline:'nearest' });
  }
  function loop(now){
    if(!running) return;
    const dt = Math.min(0.05, (now - prev)/1000); prev = now;
    const w = canvas.clientWidth, hgt = canvas.clientHeight;
    if(w && hgt && (canvas.width !== Math.round(w*r.getPixelRatio()) || canvas.height !== Math.round(hgt*r.getPixelRatio()))){ r.setSize(w, hgt, false); cam.aspect = w/hgt; cam.updateProjectionMatrix(); }
    pivot.rotation.y += dt*0.22;
    const fit = Math.max(1, 1.5/Math.max(0.3, cam.aspect)), d = radius*1.05*fit;
    cam.position.set(d*0.78, d*0.34, -d*0.62); cam.lookAt(0, 0, 0);
    SHIPGEN.tick(now*0.001, dt, 1);
    r.render(sc, cam);
    requestAnimationFrame(loop);
  }
  function onKey(e){
    const ae = document.activeElement, onOtherBtn = ae && el.contains(ae) && ae.tagName === 'BUTTON' && ae.id !== 'ssConfirm';
    if(e.code === 'ArrowRight'){ e.preventDefault(); e.stopPropagation(); show(idx + 1); }
    else if(e.code === 'ArrowLeft'){ e.preventDefault(); e.stopPropagation(); show(idx - 1); }
    else if(e.code === 'ArrowUp' || e.code === 'ArrowDown'){ e.preventDefault(); e.stopPropagation(); cycleOpt(e.code === 'ArrowDown' ? 1 : -1); }
    else if(e.code === 'Enter' && !onOtherBtn){ e.preventDefault(); e.stopPropagation(); confirm(); }
    else if(e.code === 'Enter' || e.code === 'Space'){ e.stopPropagation(); }
  }
  function confirm(){
    running = false; window.removeEventListener('keydown', onKey, true);
    if(model){ pivot.remove(model); SHIPGEN.dispose(model); model = null; }
    r.dispose(); el.classList.remove('open'); SHIP_SELECT_OPEN = false;
    const base = SHIP_CATALOG[idx];
    const ch = base.M.ftl ? choiceOf(base.id) : { warp:false, jump:false };
    onConfirm(base.id, { warp:ch.warp, jump:ch.jump });
  }
  document.getElementById('ssPrev').onclick = function(){ show(idx - 1); };
  document.getElementById('ssNext').onclick = function(){ show(idx + 1); };
  document.getElementById('ssConfirm').onclick = confirm;
  document.getElementById('ssOptW').onclick = function(){ setOpt('warp'); };
  document.getElementById('ssOptJ').onclick = function(){ setOpt('jump'); };
  window.addEventListener('keydown', onKey, true);
  if(document.activeElement && !el.contains(document.activeElement)) document.activeElement.blur();
  el.classList.add('open');
  show(0);
  requestAnimationFrame(loop);
  setTimeout(function(){ document.getElementById('ssConfirm').focus(); }, 60);
}

installShip(SHIP_DEFAULT_ID);