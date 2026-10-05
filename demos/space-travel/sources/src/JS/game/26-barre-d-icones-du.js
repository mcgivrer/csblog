/* =========================================================================
   BARRE D'ICÔNES DU HUD — §12 de la spec v2.1. Un mécanisme UNIQUE pour le
   bureau ET le tactile (fusionnée avec l'ancien menu ☰ tactile, qui
   dupliquait la même idée avec un rendu différent) : 7 bascules de
   panneaux + 1 bouton caméra (double de F9), tous générés depuis la même
   liste, avec les mêmes icônes SVG et la même fonction d'activation —
   seule la POSITION change entre bureau (bas-gauche, fixe) et tactile
   (haut, le bas étant occupé par le joystick et les commandes de vol).
   ========================================================================= */
const HUD_ICONS = {
  speed:  '<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l3.5-5.5" stroke-linecap="round"/><circle cx="12" cy="18" r="1.4" fill="currentColor" stroke="none"/>',
  route:  '<path d="M4 19c4-9 8 3 16-14" stroke-dasharray="2.5 3"/><circle cx="4" cy="19" r="1.6" fill="currentColor" stroke="none"/><circle cx="20" cy="5" r="1.6" fill="currentColor" stroke="none"/>',
  target: '<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
  temp:   '<path d="M13 4a1.6 1.6 0 0 0-3.2 0v8.7a3.6 3.6 0 1 0 3.2 0V4z"/><circle cx="11.4" cy="17.5" r="1.5" fill="currentColor" stroke="none"/>',
  flame:  '<path d="M12 3c1.8 3.4-2.4 4.6-2.4 8a2.4 2.4 0 0 0 4.8 0c0-1.6-.8-2.4-.8-4 1.6.9 2.6 3.2 2.6 5a4.2 4.2 0 0 1-8.4 0C7.8 8 12 6.5 12 3z"/>',
  sliders:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="1.7" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="10" cy="18" r="1.7" fill="currentColor" stroke="none"/>',
  radio:  '<path d="M12 21v-9M8.5 21h7"/><circle cx="12" cy="8.2" r="2.2"/><path d="M8.6 10a5.4 5.4 0 0 1 6.8 0M5.8 6.6a9.4 9.4 0 0 1 12.4 0" stroke-linecap="round"/>',
  port:   '<path d="M4 20h16M6 20V10l6-5 6 5v10"/><path d="M9.5 20v-6h5v6"/>',
  /* caméra : trois symboles distincts, un par mode (§ amélioration —
     l'icône reflète le mode ACTIF plutôt qu'un pictogramme générique) */
  cam_tracking: '<rect x="3" y="7.5" width="18" height="12" rx="2"/><path d="M8.5 7.5l1.6-2.5h3.8l1.6 2.5"/><circle cx="12" cy="13.5" r="3.2"/>',
  cam_sequence: '<circle cx="12" cy="12" r="7" stroke-dasharray="2.4 2.6"/><circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none"/><path d="M12 12l4 2.3" stroke-linecap="round"/>',
  cam_distant:  '<path d="M3 17l6-8 4 5 3-4 5 6"/><circle cx="12" cy="12" r="9"/>',
  cam_closeup:  '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/><circle cx="10.5" cy="10.5" r="2.2"/>',
  /* itinéraire (§ amélioration v2.4) : un repère de position sur un tracé
     pointillé — distinct de « route » (juste un trait entre deux points),
     pour ne pas confondre le plan de vol textuel et ce mini-suivi visuel. */
  itinerary: '<path d="M3 15h5.5M15.5 15H21" stroke-dasharray="2.5 3"/><circle cx="12" cy="15" r="1.8" fill="currentColor" stroke="none"/><path d="M12 3.5a4 4 0 0 1 4 4c0 3-4 7.5-4 7.5s-4-4.5-4-7.5a4 4 0 0 1 4-4z"/><circle cx="12" cy="7.3" r="1.3" fill="currentColor" stroke="none"/>',
  /* point de Lagrange : boussole (cadran + aiguille) plutôt qu'un pictogramme
     orbital littéral — c'est l'ORIENTATION relative qui est montrée, pas la
     géométrie à N corps elle-même */
  lagrange: '<circle cx="12" cy="12" r="8.5"/><path d="M12 5L14 12L12 19L10 12Z" fill="currentColor" stroke="none"/>',
  /* carte stellaire (§23) : trois points reliés par des traits fins,
     évoquant une petite constellation — distinct de « route » (un seul
     trait) et de « itinerary » (repère + trajet pointillé) déjà utilisés
     par ailleurs dans cette même barre. */
  starmap: '<circle cx="6" cy="17" r="1.6" fill="currentColor" stroke="none"/><circle cx="13" cy="6" r="1.6" fill="currentColor" stroke="none"/><circle cx="18" cy="14" r="1.6" fill="currentColor" stroke="none"/><path d="M6 17L13 6M13 6L18 14M6 17L18 14" stroke-dasharray="2 2"/>',
  /* réglage des volumes (demande utilisateur) : haut-parleur simple, sans
     ondes barrées (ce n'est pas un bouton muet comme F10/radio, juste
     l'accès au réglage) */
  audio: '<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16 9.5c1 1 1 4 0 5"/>',
  /* pilote automatique (flèche de cap dans un cercle) et tableau des missions (bloc-notes) */
  autopilot: '<circle cx="12" cy="12" r="8.5"/><path d="M12 6.5l4.2 9.5L12 14l-4.2 2z" fill="currentColor" stroke="none"/>',
  missions: '<rect x="6" y="4.5" width="12" height="16" rx="1.5"/><path d="M9.5 4.5v-1.2h5v1.2M9 10h6M9 13.5h6M9 17h3.5" stroke-linecap="round"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.3 9.2a2.7 2.7 0 1 1 3.8 2.4c-.7.35-1.1.9-1.1 1.7v.4" stroke-linecap="round"/><circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none"/>'
};
const HUD_BAR_ITEMS = [
  { cls:'hud-left',      icon:'speed',   labelKey:'menuNavPanel',    kind:'panel'  },
  { cls:'hud-route',     icon:'route',   labelKey:'lblFlightPlan',   kind:'panel'  },
  { cls:'hud-right',     icon:'target',  labelKey:'lblNearest',      kind:'panel'  },
  { cls:'hud-temp',      icon:'temp',    labelKey:'lblEngineTemp',   kind:'panel'  },
  { cls:'hud-engines',   icon:'flame',   labelKey:'lblPropulsion',   kind:'panel'  },
  { cls:'hud-telemetry', icon:'sliders', labelKey:'lblEngineCmd',    kind:'panel'  },
  { cls:null,            icon:'radio',   labelKey:'lblRadioChannel', kind:'radio'  },
  { cls:null,            icon:'port',    labelKey:'lblPortServices', kind:'port'   },
  { cls:null,            icon:'camera',  labelKey:null,              kind:'camera' },
  /* itinéraire et point de Lagrange (§ amélioration v2.4) : deux nouveaux
     panneaux, ajoutés APRÈS camera plutôt qu'entremêlés aux six premiers
     panneaux d'info — F1-F9 sont affectés par POSITION dans ce tableau
     (cf. le gestionnaire keydown plus bas, indexé sur e.code), donc tout
     insertion avant radio/port/camera aurait décalé leurs raccourcis F7-F9.
     Comme l'aide (H), ceux-ci prennent une touche FIXE plutôt qu'un F-slot. */
  { cls:'hud-itinerary', icon:'itinerary', labelKey:'lblItinerary',  kind:'panel', hotkey:'I' },
  { cls:'hud-lagrange',  icon:'lagrange',  labelKey:'lblLagrange',   kind:'panel', hotkey:'L' },
  /* carte stellaire (§23) : même principe (touche fixe, ajoutée après les
     six premiers panneaux pour ne pas décaler F7-F9) — indispensable au
     clavier ET au tactile, faute de quoi le module resterait totalement
     hors d'atteinte sur mobile/tablette (pas de touche M sur un écran
     tactile). kind:'starmap', pas 'panel' : n'affiche/masque pas une
     classe CSS mais ouvre/ferme l'overlay dédié, cf. activateHudBarItem. */
  { cls:null,            icon:'starmap', labelKey:'lblStarMapTitle', kind:'starmap', hotkey:'M' },
  /* réglage des volumes (demande utilisateur) : même principe, touche fixe
     ajoutée après les six premiers panneaux pour ne pas décaler F7-F9. */
  { cls:null,            icon:'audio',   labelKey:'lblAudioTitle', kind:'audio', hotkey:'V' },
  /* aide (amélioration demandée) : ajoutée dans la MÊME barre plutôt qu'un
     bouton séparé, pour une seule et unique zone de contrôle — mais avec
     un raccourci FIXE ('H', déjà établi) plutôt que le F-suivant
     automatique (F10), qui entrerait en conflit avec la coupure de voix
     déjà affectée à F10. */
  { cls:null,            icon:'help',    labelKey:'lblHelpTitle',    kind:'help', hotkey:'H' },
  /* pilote automatique (T) et tableau des missions (J) : touches fixes, ajoutées APRÈS l'aide pour ne pas décaler F1-F9 */
  { cls:null,            icon:'autopilot', labelKey:'lblAutopilot',  kind:'autopilot', hotkey:'T' },
  { cls:null,            icon:'missions',  labelKey:'lblMissions',   kind:'missions',  hotkey:'J' }
];
/* #9 (bug remonté en jeu) : le panneau services portuaires n'est
   activable que près d'une planète-port ou pendant une livraison en
   cours — sinon l'icône reste visible mais inerte, plutôt que de
   proposer un service sans objet. */
function isNearPortService(){
  if(orbitState.active) return true;
  let near = false;
  ROUTE.builtSystems.forEach(function(grp, i){
    const leg = ROUTE.legs[i];
    if(leg && leg.planet && shipRig.position.distanceTo(leg.planet.position) < leg.planet.radius*4){
      near = true;
    }
  });
  return near;
}
/* action déclenchée par un bouton de la barre — factorisée pour être
   réutilisée à l'identique par les raccourcis F1-F9 (amélioration). */
function activateHudBarItem(item){
  if(item.kind === 'panel'){
    const el = document.querySelector('.'+item.cls);
    if(el) el.classList.toggle('panel-hidden');
    repositionAllPanels();
  } else if(item.kind === 'radio'){
    toggleRadioPanel();
  } else if(item.kind === 'port'){
    if(!isNearPortService()) return;   /* icône inerte hors zone/livraison */
    const el = document.getElementById('portPanel');
    if(el){ el.classList.toggle('visible'); if(el.classList.contains('visible')) refreshPortPanel(); }
  } else if(item.kind === 'camera'){
    nextCameraMode();
  } else if(item.kind === 'help'){
    if(typeof CONSOLE !== 'undefined'){ CONSOLE.toggle('help'); }
    else {
      const el = document.getElementById('helpOverlay');
      if(el) el.classList.toggle('visible');
    }
  } else if(item.kind === 'starmap'){
    if(typeof CONSOLE !== 'undefined'){ CONSOLE.toggle('nav'); }
    else if(isStarMapOpen()) closeStarMap(); else openStarMap();
  } else if(item.kind === 'audio'){
    if(typeof CONSOLE !== 'undefined' && CONSOLE.help) CONSOLE.help.toggleAudio();
    else toggleAudioPanel();
  } else if(item.kind === 'autopilot'){
    if(REAL.active && REAL.started) REAL.apToggle();
  } else if(item.kind === 'missions'){
    if(typeof CONSOLE !== 'undefined'){ CONSOLE.toggle('missions'); }
    else if(typeof MISSIONS !== 'undefined' && MISSIONS.enabled()) MISSIONS.toggleBoard();
  }
  refreshHudIconBar();
}
function refreshHudIconBar(){
  HUD_BAR_ITEMS.forEach(function(item){
    if(!item.el) return;
    let active = false, disabled = false;
    if(item.kind === 'panel'){
      const el = document.querySelector('.'+item.cls);
      active = !!(el && !el.classList.contains('panel-hidden'));
    } else if(item.kind === 'radio'){
      const el = document.getElementById('radioPanel');
      active = !!(el && el.classList.contains('visible'));
    } else if(item.kind === 'port'){
      const el = document.getElementById('portPanel');
      active = !!(el && el.classList.contains('visible'));
      disabled = !isNearPortService();
      if(disabled && active){
        /* la fenêtre d'activation s'est refermée (le vaisseau s'est
           éloigné) pendant que le panneau était ouvert : on le referme
           plutôt que de laisser un service inaccessible affiché */
        el.classList.remove('visible'); active = false;
      }
    } else if(item.kind === 'camera'){
      item.el.querySelector('svg').innerHTML = HUD_ICONS['cam_'+CAMERA_MODES[cameraMode]];
    } else if(item.kind === 'help'){
      if(typeof CONSOLE !== 'undefined') active = CONSOLE.isOpen('help');
      else {
        const el = document.getElementById('helpOverlay');
        active = !!(el && el.classList.contains('visible'));
      }
    } else if(item.kind === 'starmap'){
      active = (typeof CONSOLE !== 'undefined') ? CONSOLE.isOpen('nav') : isStarMapOpen();
    } else if(item.kind === 'audio'){
      const el = document.getElementById('audioOverlay');
      active = !!(el && el.classList.contains('visible'));
    } else if(item.kind === 'autopilot'){
      const live = REAL.active && REAL.started;
      active = live && REAL.ap.on; disabled = !live;
    } else if(item.kind === 'missions'){
      const on = typeof MISSIONS !== 'undefined' && MISSIONS.enabled();
      active = (typeof CONSOLE !== 'undefined') ? CONSOLE.isOpen('missions') : (on && MISSIONS.boardOpen());
      disabled = !on;
    }
    item.el.classList.toggle('active', active);
    item.el.classList.toggle('disabled', disabled);
    const label = item.kind === 'camera'
      ? t('cameraLabel') + t('cam_'+CAMERA_MODES[cameraMode])
      : (item.labelKey ? t(item.labelKey) : '');
    item.el.title = label + (item.hotkey ? '  [' + item.hotkey + ']' : '');
  });
}
/* aide clavier (§ amélioration) — construite dynamiquement à partir de
   HUD_BAR_ITEMS pour les touches F1-F9, plutôt que dupliquée en dur :
   toujours synchronisée avec la barre d'icônes, même si son contenu
   change plus tard (paliers suivants). */
function buildHelpGrid(){
  const grid = document.getElementById('helpGrid');
  if(!grid) return;
  const rows = [
    [t('hk_move'), t('hlp_move')],
    [t('hk_roll'), t('hlp_roll')],
    [t('hk_thrust'), t('hlp_thrust')],
    [t('hk_aim'), t('hlp_aim')],
    [t('hk_freelook'), t('hlp_freelook')]
  ];
  HUD_BAR_ITEMS.forEach(function(item){
    /* l'aide se décrit elle-même juste en dessous (« Affiche/masque cette
       aide ») — l'inclure ici aussi ferait doublon sur la touche H, comme
       repéré sur une capture d'écran de la spec (§17.3). */
    if(item.kind === 'help') return;
    const label = item.kind === 'camera' ? t('cameraLabel').replace(/[\s\u2014]+$/,'') : (item.labelKey ? t(item.labelKey) : '');
    rows.push([item.hotkey, label]);
  });
  rows.push(['X', t('hlp_brake')]);
  rows.push(['F10', t('hlp_voice')]);
  rows.push(['ESPACE / ENTR\u00c9E', t('hlp_skip')]);
  rows.push(['\u00c9CHAP / P', t('hlp_pause')]);
  rows.push(['H', t('hlp_help')]);
  grid.innerHTML = rows.map(function(r){
    return '<div class="help-row"><div class="hk">'+r[0]+'</div><div class="hv">'+r[1]+'</div></div>';
  }).join('');
}
/* croix de fermeture — un seul gestionnaire délégué pour tous les
   panneaux (amélioration) plutôt qu'un écouteur par panneau : chaque
   bouton porte juste sa cible dans data-panel-cls, y compris les cas
   spéciaux (radio/services/aide) qui n'utilisent pas .panel-hidden. */
document.addEventListener('click', function(e){
  const btn = e.target.closest('.panel-close-btn');
  if(!btn) return;
  e.stopPropagation();
  const cls = btn.dataset.panelCls;
  if(cls === '__radio__'){
    toggleRadioPanel();
  } else if(cls === '__port__'){
    const el = document.getElementById('portPanel');
    if(el) el.classList.remove('visible');
    if(typeof refreshHudIconBar === 'function') refreshHudIconBar();
  } else if(cls === '__help__'){
    const el = document.getElementById('helpOverlay');
    if(el) el.classList.remove('visible');
    if(typeof refreshHudIconBar === 'function') refreshHudIconBar();
  } else if(cls === '__audio__'){
    toggleAudioPanel();
  } else if(cls === '__missions__'){
    if(typeof MISSIONS !== 'undefined') MISSIONS.closeBoard(true);
    if(typeof refreshHudIconBar === 'function') refreshHudIconBar();
  } else {
    const el = document.querySelector('.'+cls);
    if(el) el.classList.add('panel-hidden');
    if(typeof repositionAllPanels === 'function') repositionAllPanels();
    if(typeof refreshHudIconBar === 'function') refreshHudIconBar();
  }
});

(function initHudIconBar(){
  const bar = document.getElementById('hudIconBar');
  if(!bar) return;
  HUD_BAR_ITEMS.forEach(function(item, idx){
    if(!item.hotkey) item.hotkey = 'F' + (idx+1);   /* F1..F9, dans l'ordre — l'aide fixe déjà la sienne à 'H' */
    const btn = document.createElement('button');
    btn.className = 'hud-icon-btn';
    btn.innerHTML = '<svg viewBox="0 0 24 24">'+HUD_ICONS[item.icon]+'</svg>';
    btn.addEventListener('pointerdown', function(e){
      e.preventDefault();
      activateHudBarItem(item);
    });
    bar.appendChild(btn);
    item.el = btn;
  });
  /* pas d'appel à refreshHudIconBar() ici : orbitState/ROUTE (lus par
     isNearPortService) ne sont déclarés que plus bas dans le script — ce
     premier rafraîchissement est fait depuis startGame(), une fois tout
     le script chargé. */
})();


(function initTouchControls(){
  const isTouchCapable = window.matchMedia('(pointer: coarse)').matches;
  if(!isTouchCapable) return;
  document.body.classList.add('touch-mode');

  function applyOrientation(){
    const portrait = window.innerHeight >= window.innerWidth;
    document.body.classList.toggle('portrait-touch', portrait);
    document.body.classList.toggle('landscape-touch', !portrait);
  }
  applyOrientation();
  window.addEventListener('resize', applyOrientation);
  if(window.screen && window.screen.orientation){
    window.screen.orientation.addEventListener('change', applyOrientation);
  }

  /* ---------- joystick virtuel : pitch/lacet, mappé sur les mêmes codes
     que les flèches — pas de valeur analogique, updateFlight() ne lit de
     toute façon que des booléens (-1/0/+1), inutile d'en inventer une. */
  const base = document.getElementById('touchJoyBase');
  const nub = document.getElementById('touchJoyNub');
  let joyPointerId = null;
  const DEADZONE = 0.32;
  function resetJoyKeys(){
    keys['ArrowUp'] = keys['ArrowDown'] = keys['ArrowLeft'] = keys['ArrowRight'] = false;
    nub.style.transform = 'translate(-50%,-50%)';
  }
  function updateJoyFromEvent(e){
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
    const r = rect.width/2;
    let nx = (e.clientX - cx) / r, ny = (e.clientY - cy) / r;
    const mag = Math.hypot(nx, ny);
    if(mag > 1){ nx /= mag; ny /= mag; }
    nub.style.transform = 'translate(calc(-50% + ' + (nx*r*0.55) + 'px), calc(-50% + ' + (ny*r*0.55) + 'px))';
    keys['ArrowUp']    = ny < -DEADZONE;
    keys['ArrowDown']  = ny >  DEADZONE;
    keys['ArrowLeft']  = nx < -DEADZONE;
    keys['ArrowRight'] = nx >  DEADZONE;
    lastInputTime = performance.now();
  }
  base.addEventListener('pointerdown', function(e){
    e.preventDefault();
    joyPointerId = e.pointerId;
    base.setPointerCapture(e.pointerId);
    updateJoyFromEvent(e);
  });
  base.addEventListener('pointermove', function(e){
    if(e.pointerId !== joyPointerId) return;
    updateJoyFromEvent(e);
  });
  function endJoy(e){
    if(joyPointerId !== null && e.pointerId !== joyPointerId) return;
    joyPointerId = null;
    resetJoyKeys();
  }
  base.addEventListener('pointerup', endJoy);
  base.addEventListener('pointercancel', endJoy);

  /* ---------- boutons maintenus : roulis (E/R) et boost (ESPACE) ---------- */
  function bindHoldButton(id, code){
    const btn = document.getElementById(id);
    if(!btn) return;
    btn.addEventListener('pointerdown', function(e){
      e.preventDefault();
      /* try/catch défensif : setPointerCapture peut lever si l'id de
         pointeur n'est plus actif (relâchement très rapide, multi-doigts) —
         une exception ici ne doit jamais empêcher la mise à jour de l'état
         qui suit. */
      try{ btn.setPointerCapture(e.pointerId); }catch(err){}
      keys[code] = true;
      btn.classList.add('active');
      lastInputTime = performance.now();
    });
    function release(e){
      keys[code] = false;
      btn.classList.remove('active');
    }
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
  }
  bindHoldButton('touchRollMinus', 'KeyR');
  bindHoldButton('touchRollPlus', 'KeyE');
  bindHoldButton('touchBoostBtn', 'Space');

  /* bouton de regard libre — pas un keys[code] comme les précédents (rien
     à voir avec le clavier), juste un booléen lu par le gestionnaire de
     glisser du canevas. */
  (function bindLookButton(){
    const btn = document.getElementById('touchLookBtn');
    if(!btn) return;
    btn.addEventListener('pointerdown', function(e){
      e.preventDefault();
      try{ btn.setPointerCapture(e.pointerId); }catch(err){}
      touchLookHeld = true;
      btn.classList.add('active');
    });
    function release(){ touchLookHeld = false; btn.classList.remove('active'); }
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
  })();

  /* les 7 panneaux d'info sont maintenant pilotés par la barre d'icônes
     unifiée du HUD (§12, cf. initHudIconBar plus bas) — plus de menu
     déroulant ni de boutons dédiés séparés ici. En portrait seulement, on
     pré-ferme les 6 panneaux (hors canal radio, qui garde sa propre
     bascule automatique) : pas la place de les garder tous ouverts en
     continu sur un écran de smartphone. */
  if(document.body.classList.contains('portrait-touch')){
    ['hud-left','hud-route','hud-right','hud-temp','hud-engines','hud-telemetry','hud-itinerary','hud-lagrange'].forEach(function(cls){
      const el = document.querySelector('.'+cls);
      if(el) el.classList.add('panel-hidden');
    });
    /* pas de refreshHudIconBar() ici non plus, même raison que dans
       initHudIconBar juste au-dessus — le premier rafraîchissement aura
       lieu depuis startGame(). */
  }
})();

let manual = false;
let lastInputTime = 0;
/* sollicitation d'attitude de l'image courante, lue par les RCS */
const rcsDemand = {yaw:0, pitch:0, roll:0};
/* niveau d'allumage lissé de chaque tuyère (montée vive, extinction douce) */
const rcsLevel = {yawP:0, yawN:0, pitchP:0, pitchN:0, rollP:0, rollN:0};
const IDLE_MS = 3200;
const CRUISE_SPEED_BASE = 56, BOOST_MULT = 3.1;   /* 42→56 (+33%) : compense
   l'allongement des systèmes planétaires (bug #1) pour garder un temps de
   croisière comparable — sans quoi l'espacement plus généreux à lui seul
   aurait rallongé chaque trajet d'autant. */
let currentSpeed = CRUISE_SPEED_BASE;
/* amélioration « Propulseurs » — services portuaires (#9, palier 1) :
   chaque niveau augmente durablement la vitesse de croisière effective.
   Autonome vis-à-vis du palier 2 (dégâts/réparations, pas encore
   implémenté) : un vrai gain de gameplay dès maintenant, pas une coquille
   qui attend un système inexistant. */
let speedUpgradeLevel = 0;
const SPEED_UPGRADE_STEP = 0.09;   /* +9% de vitesse de croisière par niveau */
const SPEED_UPGRADE_MAX = 4;
function effectiveCruiseSpeed(){
  return CRUISE_SPEED_BASE * (1 + speedUpgradeLevel*SPEED_UPGRADE_STEP);
}
function speedUpgradeCost(level){
  return Math.round(3200 * Math.pow(1.55, level));
}
