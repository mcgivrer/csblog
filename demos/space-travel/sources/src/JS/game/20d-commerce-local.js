/* =========================================================================
   L3 — COMMERCE LOCAL (lot 3, fusion de la démo v7.2.2)
   Pour les 6 modèles sans générateur de saut ni anneaux de distorsion :
   après l'arrivée sur la planète-port du système (comme avant, décomptée
   dans l'itinéraire interstellaire), le vaisseau enchaîne des livraisons
   LOCALES — autres planètes, lunes, stations orbitales — jusqu'à ce que le
   joueur achète un long-courrier au chantier naval. Un vaisseau déjà équipé
   garde exactement le comportement de L2.3/L2.4 (rien ne change pour lui).

   - STATIONS : petites structures artificielles en orbite haute d'une
     planète notable (habitable ou géante), position fixe (calculée une
     fois à la construction du système, pas de pivot animé — à cette
     échelle de temps de jeu, l'économie de calcul n'a aucun sens à
     retrouver, la simplicité prime). Pas de GM propre : `R.plan` bascule
     alors sur une vitesse d'approche fixe (FLIGHT.DOCK_SPEED) plutôt
     qu'orbitale, et l'escale (§35) sur la durée fixe de la v2.16 plutôt
     que sur une vitesse képlérienne — cf. les deux replis déjà en place.
   - TABLEAU DE CONTRATS : liste les corps du système non desservis à la
     dernière escale (renouvelée à chaque ouverture — pas un stock qui
     s'épuise, pour ne jamais bloquer une partie sans long-courrier). Le
     calcul du fret et du prix reste celui de la v2.16 (startOrbitDelivery/
     updateOrbitDelivery, §33/§35) : le tableau ne fait que choisir LA
     CIBLE, il ne réinvente pas l'économie de la livraison.
   - CHANTIER NAVAL : les 4 long-courriers du catalogue, prix étagé sur le
     niveau (tier) du modèle, dans la continuité du prix du module de saut
     existant (18 000 CR). Achat = changement de coque immédiat
     (installShip), sans reprise de l'ancien vaisseau.
   ========================================================================= */
const LOCAL = (function(){
  const SHIPYARD_PRICE = { 'II': 22000, 'III': 34000, 'IV': 50000 };
  const STATION_NAMES = ['Relais', 'Comptoir', 'Plateforme', 'Dépôt', 'Poste'];

  /* ---------- stations orbitales ---------- */
  /* Lot P1 : les stations deviennent des PORTS ORBITAUX (20n-ports-orbitaux.js) — mêmes planètes, angles et noms
     (même suite de tirages : le tirage de l'ancienne échelle choisit désormais l'archétype) ; altitude de la spec (§B.4) ;
     une géante gazeuse destination de l'étape a toujours son port. Interface inchangée pour le commerce local. */
  function addPort(leg, p, r, u, a, incl, archU, name, key){
    const arch = PORTS.archetypeFor(p, archU), P = PORTS.build(arch, leg.cell + ':' + key), dist = PORTS.orbitRadius(p, u), g = P.group;
    g.position.set(p.position.x + Math.cos(a)*dist, p.position.y + Math.sin(a)*dist*Math.sin(incl), p.position.z + Math.sin(a)*dist*Math.cos(incl));
    PORTS.orient(g, g.position, p.position);
    LAYERS.sysWorld.add(g);
    leg.stations.push({ position: g.position, radius: P.radius, kind: { gas: false }, isStation: true, name: name,
      beaconSprite: P.beacon, mesh: g, orbits: p, port: P });
  }
  function buildStations(leg){
    leg.stations = [];
    const r = rngFor(SEED + ':stations:' + leg.cell), notable = leg.planets.filter(p => p.isHabitable || p.kind.gas);
    notable.forEach(function(p, i){
      if(r() > .55) return;                                        /* 0 à 2 ports par système, pas systématique */
      r();                                                         /* (ancien tirage de rotation, conservé pour la suite) */
      const u = r(), a = r()*Math.PI*2, incl = (r() - .5)*.6, archU = r();
      const name = STATION_NAMES[Math.floor(r()*STATION_NAMES.length)] + ' ' + String.fromCharCode(945 + i) + '-' + (1 + Math.floor(r()*9));
      addPort(leg, p, r, u, a, incl, archU, name, i);
    });
    /* toute géante gazeuse reçoit un port (tour d'amarrage) : sans sol, son port orbital est le seul port possible —
       et une géante peut être la destination d'un contrat local (la destination d'une étape, elle, est toujours
       une planète habitable : la règle « géante destination de l'étape » ne s'appliquait jamais) */
    leg.planets.forEach(function(p, i){
      if(!(p.kind && p.kind.gas) || leg.stations.some(s => s.orbits === p)) return;
      const r2 = rngFor(SEED + ':port-geante:' + leg.cell + ':' + i);
      addPort(leg, p, r2, r2(), r2()*Math.PI*2, (r2() - .5)*.6, 0, STATION_NAMES[Math.floor(r2()*STATION_NAMES.length)] + ' Ω-' + (1 + Math.floor(r2()*9)), 'g' + i);
    });
  }
  function updateStations(leg, dt){
    const blink = (performance.now()/1000) % 1.6 < .18;             /* balise : éclat bref toutes les 1,6 s */
    (leg.stations || []).forEach(function(s){ if(s.port && s.port.spin) s.port.spin.rotation.y += s.port.spinRate*dt;
      if(s.beaconSprite) s.beaconSprite.material.opacity = blink ? 1 : .22; });
  }
  function disposeStations(leg){
    const shared = new Set(Object.values(PORTS.mats()));            /* matériaux partagés entre tous les ports : conservés */
    (leg.stations || []).forEach(function(s){
      LAYERS.detach(s.mesh);
      const kept = x => typeof MODSHIP !== 'undefined' && MODSHIP.keeps(x);   /* stations modulaires : prototypes partagés (09c) */
      s.mesh.traverse(function(o){ if(o.geometry && !kept(o.geometry)) o.geometry.dispose(); if(o.material && !shared.has(o.material) && !kept(o.material)) o.material.dispose(); });
    });
  }

  /* ---------- cibles de commerce local ---------- */
  function moonCandidates(leg){
    const out = [];
    leg.planets.forEach(function(p){
      (p.moonPivots || []).forEach(function(pv){
        const m = pv.children[0]; if(!m) return;
        /* AST_R.apply() remplace la sphère d'origine par une géométrie de roche partagée et code le
           rayon dans l'échelle (cf. §20 : m.scale.setScalar(rad)) — plus de m.geometry.parameters ici. */
        out.push({ position: m.getWorldPosition(new THREE.Vector3()), radius: m.scale.x,
          kind: { gas: false }, isMoon: true, name: pv.userData.moonName });
      });
    });
    return out;
  }
  function localCandidates(leg, exclude){
    const planets = leg.planets.filter(function(p){ return p !== exclude; });
    return planets.concat(moonCandidates(leg), leg.stations || []);
  }
  function kindLabel(c){ return c.isStation ? t('localStation') : c.isMoon ? t('localMoon') : t('planetKind_' + c.kind.key); }

  /* ---------- tableau de contrats ---------- */
  const CONTRACT_COUNT = 4;
  let contracts = [];
  function openContractBoard(){
    closeShipyard();   /* jamais les deux panneaux à la fois */
    const leg = REAL.leg; if(!leg) return;
    const pool = localCandidates(leg, REAL.mission && REAL.mission.target);
    contracts = [];
    const r = rngFor(SEED + ':contrats:' + leg.cell + ':' + (REAL.hops || 0) + ':' + Math.floor(performance.now()));
    const shuffled = pool.map(function(c){ return [r(), c]; }).sort(function(a, b){ return a[0] - b[0]; }).map(function(e){ return e[1]; });
    contracts = shuffled.slice(0, Math.min(CONTRACT_COUNT, shuffled.length));
    const list = document.getElementById('contractList');
    list.innerHTML = '';
    if(!contracts.length){
      const d = document.createElement('div'); d.className = 'board-empty'; d.id = 'lblContractsEmpty';
      d.textContent = t('contractsEmpty'); list.appendChild(d);
    }
    contracts.forEach(function(c, i){
      const dist = c.position.distanceTo(shipRig.position);
      const row = document.createElement('div'); row.className = 'board-row';
      /* les planètes portent un nom propre (§14) distinct de leur description de type ; lunes et
         stations n'ont qu'un nom (déjà distinctif) — pas de doublon dans ce cas. */
      row.innerHTML = '<div class="board-row-info"><div class="board-row-name">' + (c.properName || c.name) + '</div>' +
        '<div class="board-row-meta">' + kindLabel(c) + ' · ' + REAL.fmt.dist(dist) + '</div></div>' +
        '<button class="board-row-btn" data-i="' + i + '">' + t('contractAccept') + '</button>';
      list.appendChild(row);
    });
    document.getElementById('contractBoardOverlay').classList.add('visible');
  }
  function closeContractBoard(){ document.getElementById('contractBoardOverlay').classList.remove('visible'); }
  function acceptContract(i){
    const c = contracts[i]; if(!c) return;
    closeContractBoard();
    REAL.plan(REAL.leg, c, true);
  }
  document.getElementById('contractList').addEventListener('click', function(e){
    const b = e.target.closest('.board-row-btn'); if(b) acceptContract(+b.dataset.i);
  });

  /* ---------- chantier naval ---------- */
  function longHaulers(){ return SHIPGEN.MODELS.filter(function(m){ return m.ftl; }); }
  function refreshShipyardRow(){
    const row = document.getElementById('shipyardPortRow'), btn = document.getElementById('shipyardOpenBtn');
    if(!row || !btn) return;
    btn.classList.remove('port-disabled', 'port-maxed');
    if(SHIP_CAN_JUMP || SHIP_WARP){
      document.getElementById('shipyardPortStatus').textContent = '●';
      btn.textContent = t('shipyardEquipped'); btn.classList.add('port-maxed');
    } else {
      document.getElementById('shipyardPortStatus').textContent = '○';
      btn.textContent = t('shipyardOpenBtn');
    }
  }
  function openShipyard(){
    closeContractBoard();   /* jamais les deux panneaux à la fois */
    const list = document.getElementById('shipyardList'); list.innerHTML = '';
    longHaulers().forEach(function(m){
      const price = SHIPYARD_PRICE[m.tier] || 30000, afford = credits >= price;
      const row = document.createElement('div'); row.className = 'board-row';
      row.innerHTML = '<div class="board-row-info"><div class="board-row-name">' + m.name + ' — ' + m.arch + '</div>' +
        '<div class="board-row-meta">' + t('tierLabel') + ' ' + m.tier + ' · ' + formatCredits(price) + ' CR</div></div>' +
        '<button class="board-row-btn' + (afford ? '' : ' port-disabled') + '" data-id="' + m.id + '" data-price="' + price + '">' + t('shipyardBuyBtn') + '</button>';
      list.appendChild(row);
    });
    document.getElementById('shipyardOverlay').classList.add('visible');
  }
  function closeShipyard(){ document.getElementById('shipyardOverlay').classList.remove('visible'); }
  document.getElementById('shipyardList').addEventListener('click', function(e){
    const b = e.target.closest('.board-row-btn'); if(!b || b.classList.contains('port-disabled')) return;
    const price = +b.dataset.price; if(credits < price) return;
    addCredits(-price);
    installShip(b.dataset.id, {});
    closeShipyard(); refreshShipyardRow(); refreshPortPanel();
  });
  document.getElementById('shipyardOpenBtn').addEventListener('click', function(){
    if(SHIP_CAN_JUMP || SHIP_WARP) return; openShipyard();
  });
  document.querySelectorAll('[data-panel-cls="__shipyard__"]').forEach(function(b){ b.addEventListener('click', closeShipyard); });
  document.querySelectorAll('[data-panel-cls="__contracts__"]').forEach(function(b){ b.addEventListener('click', closeContractBoard); });

  return { buildStations: buildStations, updateStations: updateStations, disposeStations: disposeStations,
    refreshShipyardRow: refreshShipyardRow, openContractBoard: openContractBoard, closeContractBoard: closeContractBoard };
})();
function buildStations(leg){ LOCAL.buildStations(leg); }
