/* =========================================================================
   9. HUD — objet le plus proche, secteur, vitesse (rafraîchi périodiquement)
   ========================================================================= */
let lastHudUpdate = 0;
/* =========================================================================
   DIALOGUE DE TÉLÉMÉTRIE — commandes d'allumage/puissance envoyées aux
   moteurs. Panneau fixe du HUD (rangée basse), à côté de la propulsion —
   il était auparavant projeté en 3D juste à côté du vaisseau ; l'ancrage
   fixe est plus lisible et ne bouge plus avec la caméra.
   ========================================================================= */
let lastTmUpdate = 0;
function updateTelemetryPanel(mainPowers, boosting){
  /* le texte n'a pas besoin d'être réécrit à 60 Hz : ~6 fois/s suffit à
     donner l'impression d'un flux temps réel sans agiter le lecteur */
  const now = performance.now();
  if(now - lastTmUpdate < 160) return;
  lastTmUpdate = now;

  const body = document.getElementById('telemetryBody');
  if(!body) return;
  const avgMain = mainPowers.reduce(function(a,b){return a+b;},0)/Math.max(mainPowers.length,1);
  let html = '<div class="tm-line'+(boosting?' tm-amber':'')+'">' +
    '<span>'+t('reactors14').replace('{r}', mainPowers.length > 1 ? '1-' + mainPowers.length : '1')+'</span><span>'+(avgMain>0.02?Math.round(avgMain*100)+'%':t('veille').toUpperCase())+'</span></div>';

  const groups = [
    ['yaw','P','rcs_yawP'], ['yaw','N','rcs_yawN'],
    ['pitch','P','rcs_pitchP'], ['pitch','N','rcs_pitchN'],
    ['roll','P','rcs_rollP'], ['roll','N','rcs_rollN']
  ];
  let anyRcs = false;
  groups.forEach(function(g){
    const lvl = rcsLevel[g[0]+g[1]] || 0;
    if(lvl > 0.02){
      anyRcs = true;
      html += '<div class="tm-line"><span>'+t('rcsLabel')+' '+t(g[2])+'</span><span>'+Math.round(lvl*100)+'%</span></div>';
    }
  });
  if(!anyRcs) html += '<div class="tm-line tm-off"><span>'+t('rcsLabel')+'</span><span>'+t('veille')+'</span></div>';

  body.innerHTML = html;
}

/* =========================================================================
   TEMPÉRATURE MOTEUR — simulation simple : chaque réacteur chauffe avec sa
   puissance effective et refroidit plus lentement qu'il ne chauffe (inertie
   thermique). Affichée dans son propre panneau, à gauche de PROPULSION.
   ========================================================================= */
let engineTemps = [43, 41, 44, 40];  /* légère dissymétrie de départ, moins synthétique que 4 valeurs identiques */
let lastTempUpdate = 0;
function updateEngineTemps(mainPowers, dt){
  for(let i=0;i<engineTemps.length;i++){
    const target = 42 + (mainPowers[i]||0) * 268;  /* ~42°C au repos, jusqu'à ~310°C à pleine puissance */
    /* monte nettement plus vite qu'elle ne redescend : un réacteur chauffe
       vite sous charge, mais met du temps à se refroidir une fois coupé */
    const rate = target > engineTemps[i] ? 0.35 : 0.12;
    engineTemps[i] += (target - engineTemps[i]) * Math.min(1, dt*rate);
  }

  const now = performance.now();
  if(now - lastTempUpdate < 160) return;
  lastTempUpdate = now;
  const body = document.getElementById('tempBody');
  if(!body) return;
  let html = '';
  engineTemps.forEach(function(t, i){
    const cls = t > 220 ? 'tm-hot' : (t > 120 ? 'tm-warm' : 'tm-normal');
    html += '<div class="tm-line"><span>M'+(i+1)+'</span><span class="'+cls+'">'+Math.round(t)+' °C</span></div>';
  });
  body.innerHTML = html;
}

function updateHud(now){
  document.getElementById('speedVal').textContent = Math.round(currentSpeed) + ' u/s' + (WARP_LEVEL > 0.5 ? '  \u00d7' + WARP_FACTOR : '');
  const p = shipRig.position;
  document.getElementById('sectorVal').textContent =
    Math.round(p.x/STAR_CELL)+' · '+Math.round(p.y/STAR_CELL)+' · '+Math.round(p.z/STAR_CELL);
  const forward = new THREE.Vector3(0,0,-1).applyQuaternion(shipRig.quaternion);
  const heading = ((Math.atan2(forward.x, -forward.z)*180/Math.PI)+360)%360;
  document.getElementById('headingVal').textContent = String(Math.round(heading)).padStart(3,'0')+'°';
  /* itinéraire (point-vaisseau) et point de Lagrange (§ v2.4) : hors du
     throttle ci-dessous comme vitesse/secteur/cap juste au-dessus — un
     point qui saute par paliers de 350ms serait visiblement saccadé,
     contrairement à un texte qui change peu d'une image à l'autre. Chaque
     fonction sort tout de suite si son panneau est masqué. */
  updateItineraryShip();
  updateLagrangePanel();

  if(now - lastHudUpdate < 350) return;
  lastHudUpdate = now;

  let nearest = null, nearestDist = Infinity;
  function scan(map){
    map.forEach(function(obj){
      if(!obj) return;
      const d = obj.mesh.position.distanceTo(p);
      if(d < nearestDist){ nearestDist = d; nearest = obj; }
    });
  }
  scan(starField); scan(nebulaField);

  /* systèmes planétaires réellement construits (étape en cours + suivante) */
  ROUTE.builtSystems.forEach(function(grp, legIndex){
    const leg = ROUTE.legs[legIndex];
    if(!leg || !leg.system) return;
    leg.system.planets.forEach(function(pl){
      if(!pl.mesh) return;
      const d = pl.position.distanceTo(p);
      if(d < nearestDist){
        nearestDist = d;
        nearest = {isPlanet:true, planet:pl, leg:leg, mesh:{position:pl.position}};
      }
    });
  });

  if(nearest && nearest.isPlanet){
    const pl = nearest.planet, leg = nearest.leg;
    const kindLabel = t('planetKind_'+pl.kind.key);
    const label = pl.isHabitable ? pl.portName
      : (kindLabel.charAt(0).toUpperCase()+kindLabel.slice(1));
    document.getElementById('nearName').textContent = label;
    let meta = pl.isHabitable ? (t('cityOf')+pl.cityName+t('navTarget')+'<br>') : '';
    meta += leg.name + ' · ' + kindLabel;
    if(!pl.kind.gas) meta += ' · '+Math.round(pl.oceanFrac*100)+t('submerged');
    meta += '<br>'+t('radiusUnit')+pl.radius.toFixed(1)+' u';
    if(pl.moonCount) meta += ' · '+pl.moonCount+' '+(pl.moonCount>1?t('satellites'):t('satellite'));
    meta += '<br>'+(nearestDist).toFixed(0)+' u';
    document.getElementById('nearMeta').innerHTML = meta;
    renderNearestIcon('planet', {key:pl.kind.key, gas:pl.kind.gas});
  } else if(nearest){
    document.getElementById('nearName').textContent = nearest.name;
    const distPc = (nearestDist/38).toFixed(2);
    if(nearest.star){
      const s = nearest.star;
      const mag = apparentMagnitude(s.lum, Math.max(nearestDist/38, 1e-3));
      document.getElementById('nearMeta').innerHTML =
        s.designation + ' · ' + t('lum_'+s.lumClass) + '<br>' +
        'T<sub>eff</sub> ' + Math.round(s.temp).toLocaleString('fr-FR') + ' K · ' +
        Math.round(s.temp - 273).toLocaleString('fr-FR') + ' °C<br>' +
        'M ' + s.mass.toFixed(2) + ' M☉ · R ' + s.radius.toFixed(2) + ' R☉<br>' +
        'L ' + (s.lum < 0.01 ? s.lum.toExponential(1) : s.lum.toFixed(2)) + ' L☉ · ' +
        'm<sub>v</sub> ' + mag.toFixed(1) + '<br>' +
        distPc + ' pc';
      renderNearestIcon('star', {color:s.color});
    } else {
      const typeIdx = nearest.typeIdx!==undefined ? nearest.typeIdx : 0;
      document.getElementById('nearMeta').innerHTML = t('nebula_'+NEBULA_TYPES[typeIdx].key) + ' · ' + distPc + ' pc';
      renderNearestIcon('nebula', {type:NEBULA_TYPES[typeIdx]});
    }
  } else {
    document.getElementById('nearName').textContent = '—';
    document.getElementById('nearMeta').textContent = t('interstellarSpace');
    const el = document.getElementById('nearIcon');
    if(el) el.getContext('2d').clearRect(0,0,el.width,el.height);
  }
  /* icône « services portuaires » : sa disponibilité dépend de la
     position du vaisseau, réévaluée en continu (bug #9 : elle doit se
     désactiver dès qu'on s'éloigne, pas seulement s'activer). */
  if(typeof refreshHudIconBar === 'function') refreshHudIconBar();
  /* bug remonté en jeu : les panneaux se chevauchaient « par moment » —
     leur contenu (donc leur hauteur réelle) change au fil du temps
     (texte de l'objet le plus proche, longueur du plan de vol…) sans que
     leur empilement ne soit jamais recalculé après le premier affichage.
     Rafraîchi ici au même rythme que le reste du panneau (throttle
     350ms ci-dessus) plutôt qu'uniquement sur les événements ponctuels
     (ouverture, redimensionnement, bascule d'un panneau). */
  if(typeof repositionAllPanels === 'function') repositionAllPanels();
}

