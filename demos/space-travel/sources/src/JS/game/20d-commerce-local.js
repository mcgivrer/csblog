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
  function stationMesh(seedR){
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(38, 5, 8, 20),
      new THREE.MeshStandardMaterial({ color: 0x8a94a6, roughness: .55, metalness: .6 }));
    ring.rotation.x = Math.PI/2; g.add(ring);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 30, 12),
      new THREE.MeshStandardMaterial({ color: 0xb8bfcc, roughness: .5, metalness: .4 }));
    g.add(hub);
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffd28a });
    for(let i = 0; i < 8; i++){
      const a = i/8*Math.PI*2, w = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 3), winMat);
      w.position.set(Math.cos(a)*38, Math.sin(a)*38, 0); w.rotation.x = Math.PI/2; g.add(w);
    }
    for(let i = 0; i < 3; i++){
      const a = i/3*Math.PI*2, spoke = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 30),
        new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: .6 }));
      spoke.position.set(Math.cos(a)*19, Math.sin(a)*19, 0); spoke.lookAt(0, 0, 0); g.add(spoke);
    }
    const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffb454, transparent: true, opacity: .95, depthWrite: false }));
    beacon.scale.setScalar(9); beacon.position.set(0, 0, 22); g.add(beacon);
    g.userData.beacon = beacon; g.userData.spin = .04 + seedR()*.03;
    return g;
  }
  function buildStations(leg){
    leg.stations = [];
    const r = rngFor(SEED + ':stations:' + leg.cell), notable = leg.planets.filter(p => p.isHabitable || p.kind.gas);
    notable.forEach(function(p, i){
      if(r() > .55) return;                                        /* 0 à 2 stations par système, pas systématique */
      const g = stationMesh(r), dist = p.radius*(9 + 5*r()), a = r()*Math.PI*2, incl = (r() - .5)*.6;
      g.position.set(p.position.x + Math.cos(a)*dist, p.position.y + Math.sin(a)*dist*Math.sin(incl), p.position.z + Math.sin(a)*dist*Math.cos(incl));
      g.scale.setScalar(1 + r()*.6);
      LAYERS.sysWorld.add(g);
      leg.stations.push({ position: g.position, radius: 45*g.scale.x, kind: { gas: false }, isStation: true,
        name: STATION_NAMES[Math.floor(r()*STATION_NAMES.length)] + ' ' + String.fromCharCode(945 + i) + '-' + (1 + Math.floor(r()*9)),
        beaconSprite: g.userData.beacon, mesh: g, orbits: p });
    });
  }
  function updateStations(leg, dt){ (leg.stations || []).forEach(function(s){ s.mesh.rotation.z += s.mesh.userData.spin*dt; }); }
  function disposeStations(leg){
    (leg.stations || []).forEach(function(s){
      LAYERS.detach(s.mesh);
      s.mesh.traverse(function(o){ if(o.geometry) o.geometry.dispose(); if(o.material) o.material.dispose(); });
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
    refreshShipyardRow: refreshShipyardRow, openContractBoard: openContractBoard };
})();
function buildStations(leg){ LOCAL.buildStations(leg); }
