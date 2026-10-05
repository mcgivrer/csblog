/* =========================================================================
   CANAL RADIO — échanges équipage / contrôle du port pendant l'approche
   Un script de messages horodatés (fraction de la durée de l'orbite),
   généré depuis le seed de la planète : demande d'autorisation, coordination
   des transferts de conteneurs (calée sur les largages de navettes),
   échange technique sur les navettes, puis remerciements de clôture.
   ========================================================================= */
/* message de bienvenue du capitaine — amélioration demandée : joué une
   seule fois, juste après le premier calcul de route (startGame), avant
   toute escale. Réutilise le même panneau/la même voix que le reste du
   canal radio plutôt qu'un mécanisme séparé. */
function showWelcomeMessage(){
  const R = RADIO_TEMPLATES[LANG] || RADIO_TEMPLATES.fr;
  if(!R.welcome) return;
  const rng = rngFor(SEED+':welcome');
  const text = R.welcome(SHIP_REGISTRY)[Math.floor(rng()*R.welcome(SHIP_REGISTRY).length)];
  const radioLog = document.getElementById('radioLog');
  if(radioLog) radioLog.innerHTML = '';
  const radioPanel = document.getElementById('radioPanel');
  if(radioPanel) radioPanel.classList.add('visible');
  repositionRadioPanel();
  if(typeof refreshHudIconBar === 'function') refreshHudIconBar();
  appendRadioLine({ from:'ship', label:SHIP_REGISTRY, text:text });
}
function buildRadioScript(planet){
  const rng = rngFor(SEED+':radio:'+(planet.seedNoise !== undefined ? planet.seedNoise : planet.name));
  const city = planet.cityName || planet.properName || planet.name || '';   /* cibles de mission : station, lune, planète sans port */
  function pick(arr){ return arr[Math.floor(rng()*arr.length)]; }
  const R = RADIO_TEMPLATES[LANG] || RADIO_TEMPLATES.fr;
  const tower = R.towerName(city);
  const ship = SHIP_REGISTRY;
  const msgs = [];

  /* 1. demande d'autorisation d'approche */
  msgs.push({t:0.02, from:'ship', label:ship, text: pick(R.hail(tower,ship))});
  msgs.push({t:0.08, from:'tower', label:tower, text: pick(R.hailReply(tower,ship,city))});

  /* 2. coordination des transferts de conteneurs, calée sur les navettes */
  orbitState.spawnFractions.forEach(function(f, i){
    const label = R.shuttleLabel(i+1);
    /* le nombre annoncé est celui RÉELLEMENT attribué à cette navette */
    const n = orbitState.cargoSplit[i] || 0;
    if(n <= 0) return;   /* navette sans fret : pas d'annonce de largage */
    msgs.push({t:f+0.015, from:'ship', label:ship, text: pick(R.dropoff(tower,ship,label,n))});
    msgs.push({t:f+0.06, from:'tower', label:tower, text: pick(R.dropoffReply(label))});
  });

  /* 3. échange technique lié aux mini-vaisseaux (navettes) */
  msgs.push({t:0.50, from:'tower', label:tower, text: pick(R.techQuery(ship))});
  msgs.push({t:0.55, from:'ship', label:ship, text: pick(R.techReply())});

  /* 4. remerciements de clôture */
  msgs.push({t:0.90, from:'tower', label:tower, text: pick(R.thanks(tower,ship))});
  msgs.push({t:0.95, from:'ship', label:ship, text: pick(R.thanksReply(tower,ship))});

  msgs.sort(function(a,b){ return a.t-b.t; });
  return msgs;
}
function repositionRadioPanel(){
  const panel = document.getElementById('radioPanel');
  const port = document.getElementById('portPanel');
  const nearest = document.getElementById('nearestPanel');
  if(!panel) return;
  /* le canal radio s'empile maintenant SOUS les services portuaires (ordre
     inversé, demande explicite) quand ce dernier est affiché ; sinon il
     reprend sa place historique sous « objet le plus proche ». Calculé
     dynamiquement contre le bas RÉEL de l'ancre (sa hauteur varie avec le
     contenu) plutôt qu'un décalage fixe, qui finissait par chevaucher. */
  const anchor = (port && getComputedStyle(port).display !== 'none') ? port : nearest;
  if(!anchor) return;
  const rect = anchor.getBoundingClientRect();
  panel.style.top = Math.round(rect.bottom + 14) + 'px';
}
function repositionPortPanel(){
  const panel = document.getElementById('portPanel');
  const nearest = document.getElementById('nearestPanel');
  if(!panel || !nearest) return;
  /* services portuaires EN PREMIER, juste sous « objet le plus proche »
     (ordre inversé par rapport à avant — demande explicite) ; le canal
     radio se recale ensuite à sa suite, cf. repositionRadioPanel. Bug
     corrigé au passage : les deux panneaux n'étaient repositionnés QUE
     lors de l'ouverture, jamais quand le contenu de l'un des deux
     grandissait ensuite (le journal radio, notamment) — d'où le
     chevauchement remonté en jeu. Chaque fonction redéclenche maintenant
     l'autre. */
  const rect = nearest.getBoundingClientRect();
  panel.style.top = Math.round(rect.bottom + 14) + 'px';
  repositionRadioPanel();
}
/* bug remonté en jeu : « le positionnement des panneaux se chevauche par
   moment » — la colonne de gauche (hud-left → hud-route) avait, elle, un
   décalage FIXE en CSS (top:210px), jamais recalculé quand hud-left change
   de hauteur réelle (retour à la ligne sur petit écran, panneau masqué via
   la barre du HUD, changement de langue…). Même patron que la colonne de
   droite : mesurer le bas RÉEL de l'ancre plutôt que deviner une valeur
   fixe. Un seul point d'entrée regroupe désormais TOUT le repositionnement
   de la pile de panneaux, pour être sûr qu'aucune combinaison de panneaux
   affichés/masqués ne puisse laisser une ancienne position obsolète. */
function repositionRoutePanel(){
  const left = document.querySelector('.hud-left');
  const route = document.getElementById('routePanel');
  if(!route) return;
  if(left && getComputedStyle(left).display !== 'none'){
    route.style.top = Math.round(left.getBoundingClientRect().bottom + 14) + 'px';
  } else {
    route.style.top = '64px';   /* hud-left masquée : reprend sa position d'origine */
  }
}
function repositionAllPanels(){
  repositionRoutePanel();
  repositionPortPanel();   /* enchaîne déjà repositionRadioPanel() */
  repositionCornerBottomPanels();
}
/* évite le chevauchement entre le panneau bas-coin (itinéraire,
   §21) et la rangée basse CENTRÉE (température/propulsion/
   commandes, §8) — repéré sur une capture d'écran de documentation à
   1100px de large : la rangée centrée peut s'étendre assez pour mordre
   sur son emplacement habituel, alors qu'à 1280px il semblait avoir assez
   de marge. On le remonte au-dessus d'elle plutôt que de le laisser se
   chevaucher. Repositionnement dynamique (mesuré), pas un simple seuil
   de largeur fixe : la largeur de la rangée centrée dépend aussi de QUELS
   panneaux elle contient à l'instant.

   Bug remonté en jeu (v2.6, ajout du carburant §22) : le panneau ITINÉRAIRE
   peut AUSSI chevaucher la pile de droite (objet proche → services
   portuaires → canal radio) sur une fenêtre basse — la pile s'est allongée
   avec la ligne carburant. Un premier correctif calculait le rehaussement
   nécessaire pour CHAQUE obstacle indépendamment puis gardait le plus
   grand des deux (Math.max) : ça suffit tant que « rehausser assez pour
   dégager le plus haut des deux obstacles » dégage AUSSI l'autre — faux ici,
   puisque la pile de droite est elle-même haute sur l'écran (elle part du
   HUD tout en haut) : un rehaussement dicté par la rangée du bas peut
   remonter l'itinéraire pile AU MILIEU de cette pile plutôt que
   d'en sortir. D'où une boucle courte qui revérifie la position réelle
   après chaque ajustement, contre les DEUX obstacles à chaque passage,
   plutôt qu'un calcul unique supposé valable d'un coup. */
function repositionCornerBottomPanels(){
  const row = document.querySelector('.hud-bottom-row');
  const itin = document.querySelector('.hud-itinerary');
  const MARGIN = 14;

  if(!itin || itin.classList.contains('panel-hidden')) return;
  itin.style.bottom = '';
  for(let pass=0; pass<3; pass++){
    let moved = false;
    if(row){
      const rowRect = row.getBoundingClientRect();
      const itinRect = itin.getBoundingClientRect();
      const overlapsRow = itinRect.left < rowRect.right + MARGIN && itinRect.bottom > rowRect.top - MARGIN;
      if(overlapsRow){
        itin.style.bottom = ((window.innerHeight - rowRect.top) + MARGIN)+'px';
        moved = true;
      }
    }
    let stackBottom = 0, stackTop = Infinity;
    ['nearestPanel','portPanel','radioPanel'].forEach(function(id){
      const el = document.getElementById(id);
      if(!el || el.classList.contains('panel-hidden')) return;
      if(getComputedStyle(el).display === 'none') return;
      const r = el.getBoundingClientRect();
      if(r.bottom > stackBottom) stackBottom = r.bottom;
      if(r.top < stackTop) stackTop = r.top;
    });
    if(stackBottom > 0){
      const itinRect = itin.getBoundingClientRect();
      const overlapsStack = itinRect.top < stackBottom + MARGIN && itinRect.bottom > stackTop - MARGIN;
      if(overlapsStack){
        /* déjà sous le bas de la pile (cas courant) → juste dégager son bas ;
           déjà remonté AU-DESSUS de son haut (poussé là par la rangée du
           bas, cas rare mais celui qui a motivé cette boucle) → dégager
           son haut à la place, pas son bas, sans quoi on repousserait
           l'itinéraire droit dans la pile plutôt que hors d'elle. */
        const clearBelow = window.innerHeight - stackBottom - MARGIN - itinRect.height;
        const clearAbove = window.innerHeight - stackTop + MARGIN;
        const current = parseFloat(itin.style.bottom) || 0;
        let next = current < clearBelow ? clearBelow : clearAbove;
        /* garde-fou (fenêtre extrêmement basse, plusieurs panneaux ouverts
           à la fois) : ne jamais pousser le panneau au point de dépasser le
           HAUT de l'écran — un résidu de chevauchement, panneau entièrement
           visible, reste préférable à un panneau à moitié hors champ. Pas
           de solution parfaite dans ce cas extrême, un compromis assumé. */
        const minBottom = window.innerHeight - itinRect.height - 60;
        if(next > minBottom) next = minBottom;
        itin.style.bottom = next+'px';
        moved = true;
      }
    }
    if(!moved) break;
  }
}
function refreshPortPanel(){
  const dots = document.getElementById('portLevelDots');
  const btn = document.getElementById('portBuyBtn');
  if(!dots || !btn) return;
  let dotsStr = '';
  for(let i=0;i<SPEED_UPGRADE_MAX;i++){ dotsStr += (i < speedUpgradeLevel ? '\u25CF' : '\u25CB') + ' '; }
  dots.textContent = dotsStr.trim();
  btn.classList.remove('port-disabled', 'port-maxed');
  if(speedUpgradeLevel >= SPEED_UPGRADE_MAX){
    btn.textContent = t('portMaxLevel');
    btn.classList.add('port-maxed');
  } else {
    const cost = speedUpgradeCost(speedUpgradeLevel);
    btn.textContent = t('portUpgradeBtn') + ' \u2014 ' + formatCredits(cost) + ' CR';
    if(credits < cost) btn.classList.add('port-disabled');
  }
  refreshFuelPortRow();
  refreshJumpPortRow();
  if(typeof LOCAL !== 'undefined') LOCAL.refreshShipyardRow();
  repositionPortPanel();
}
/* ravitaillement (§22.3) : même panneau, même mécanisme d'activation que
   le reste des services portuaires (isNearPortService) — pas de condition
   séparée à maintenir. Facturé uniquement sur le volume manquant. */
function refreshFuelPortRow(){
  const pctEl = document.getElementById('fuelPortPct');
  const btn = document.getElementById('fuelBuyBtn');
  if(!pctEl || !btn) return;
  const ratio = fuel / FUEL_CAPACITY;
  pctEl.textContent = Math.round(ratio*100)+'%';
  btn.classList.remove('port-disabled', 'port-maxed');
  if(fuel >= FUEL_CAPACITY - 0.5){
    btn.textContent = t('portFuelFull');
    btn.classList.add('port-maxed');
  } else {
    const cost = fuelRefuelCost();
    btn.textContent = t('portFuelBtn') + ' \u2014 ' + formatCredits(cost) + ' CR';
    if(credits < cost) btn.classList.add('port-disabled');
  }
}
/* module de saut quantique (§23.1) : achat UNIQUE, pas de paliers — la
   ligne bascule définitivement sur « ACQUIS » une fois payée, jamais de
   retour en arrière (sauf nouvelle partie, §11). */
function refreshJumpPortRow(){
  const statusEl = document.getElementById('jumpPortStatus');
  const btn = document.getElementById('jumpBuyBtn');
  if(!statusEl || !btn) return;
  btn.classList.remove('port-disabled', 'port-maxed');
  if(!SHIP_CAN_JUMP){ statusEl.textContent = '\u2014'; btn.textContent = t('portJumpLongHaul'); btn.classList.add('port-disabled'); return; }
  if(hasQuantumJump){
    statusEl.textContent = '\u25CF';
    btn.textContent = t('portJumpAcquired');
    btn.classList.add('port-maxed');
  } else {
    statusEl.textContent = '\u25CB';
    btn.textContent = t('portJumpBtn') + ' \u2014 ' + formatCredits(QUANTUM_JUMP_PRICE) + ' CR';
    if(credits < QUANTUM_JUMP_PRICE) btn.classList.add('port-disabled');
  }
}
function buySpeedUpgrade(){
  if(speedUpgradeLevel >= SPEED_UPGRADE_MAX) return;
  const cost = speedUpgradeCost(speedUpgradeLevel);
  if(credits < cost) return;
  addCredits(-cost);
  speedUpgradeLevel++;
  refreshPortPanel();
}
function buyFuel(){
  if(fuel >= FUEL_CAPACITY - 0.5) return;
  const cost = fuelRefuelCost();
  if(credits < cost) return;
  addCredits(-cost);
  fuel = FUEL_CAPACITY;
  refreshPortPanel();
}
function buyQuantumJump(){
  if(hasQuantumJump || !SHIP_CAN_JUMP) return;
  if(credits < QUANTUM_JUMP_PRICE) return;
  addCredits(-QUANTUM_JUMP_PRICE);
  hasQuantumJump = true;
  refitJumpCore();
  refreshPortPanel();
}
(function initPortPanel(){
  const btn = document.getElementById('portBuyBtn');
  if(btn) btn.addEventListener('click', function(e){ e.stopPropagation(); buySpeedUpgrade(); });
  const fuelBtn = document.getElementById('fuelBuyBtn');
  if(fuelBtn) fuelBtn.addEventListener('click', function(e){ e.stopPropagation(); buyFuel(); });
  const jumpBtn = document.getElementById('jumpBuyBtn');
  if(jumpBtn) jumpBtn.addEventListener('click', function(e){ e.stopPropagation(); buyQuantumJump(); });
})();
const RADIO_AVATARS = {
  /* silhouette de capitaine (ambre) et d'antenne de tour (cyan) —
     amélioration demandée : identifier l'interlocuteur d'un coup d'œil,
     même vocabulaire de trait que les icônes de la barre du HUD. */
  ship:  '<circle cx="12" cy="8" r="4.2"/><path d="M4.5 20.5c0-4.4 3.3-7 7.5-7s7.5 2.6 7.5 7"/>',
  tower: '<path d="M9 21V10.5l3-7.5 3 7.5V21"/><path d="M5.5 21h13"/><circle cx="12" cy="5.5" r="1.3" fill="currentColor" stroke="none"/>'
};
function appendRadioLine(entry){
  const log = document.getElementById('radioLog');
  if(!log) return;
  const div = document.createElement('div');
  div.className = 'radio-line ' + entry.from;
  const avatarSvg = RADIO_AVATARS[entry.from] || RADIO_AVATARS.ship;
  div.innerHTML = '<svg class="radio-avatar" viewBox="0 0 24 24">'+avatarSvg+'</svg>'
    + '<span class="who">['+entry.label+']</span><span class="txt">'+entry.text+'</span>';
  log.appendChild(div);
  while(log.children.length > 6) log.removeChild(log.firstChild);
  repositionRadioPanel();
  playRadioBlip(entry.from);
  /* en mode abrégé, les lignes défilent trop vite pour être lues à voix
     haute sans se chevaucher — on garde le bip, on saute la voix (et donc
     la garde radioSpeaking, puisqu'aucune lecture n'est en cours) */
  if(!arrivalSkip) speakRadioLine(entry);
}
