/* =========================================================================
   ITINÉRAIRE + POINT DE LAGRANGE (§ amélioration v2.4)
   ========================================================================= */

/* Pastilles de la piste — régénérées seulement quand ROUTE.index change
   (fenêtre glissante, comme le plan de vol) : pas la peine de reconstruire
   tout le DOM à chaque image alors que seul le point-vaisseau bouge en
   continu entre deux régénérations. */
const ITIN_WINDOW = 6;
function refreshItineraryDots(){
  const track = document.getElementById('itinTrack');
  if(!track) return;
  track.querySelectorAll('.itin-step').forEach(function(el){ el.remove(); });
  if(!ROUTE.legs.length) return;
  const start = Math.max(0, Math.min(ROUTE.index-2, ROUTE.legs.length-ITIN_WINDOW));
  const count = Math.min(ITIN_WINDOW, ROUTE.legs.length-start);
  for(let i=0;i<count;i++){
    const idx = start+i;
    const dot = document.createElement('div');
    dot.className = 'itin-step' + (idx < ROUTE.index ? ' done' : (idx === ROUTE.index ? ' current' : ''));
    dot.style.left = (count>1 ? (i/(count-1))*100 : 0)+'%';
    dot.title = ROUTE.legs[idx].portName || ROUTE.legs[idx].name;
    track.appendChild(dot);
  }
  track.dataset.start = start;
  track.dataset.count = count;
}
/* Point-vaisseau : appelé à chaque image (pas throttlé comme le reste de
   updateHud) pour un déplacement fluide, interpolé entre l'étape en cours
   et la suivante via l'abscisse curviligne ROUTE.s déjà maintenue par le
   suivi de route (§ pilotage automatique) — aucun nouveau calcul de fond,
   juste sa lecture. */
function updateItineraryShip(){
  const panel = document.querySelector('.hud-itinerary');
  const ship = document.getElementById('itinShip');
  const track = document.getElementById('itinTrack');
  if(!panel || !ship || !track || panel.classList.contains('panel-hidden')) return;
  if(!ROUTE.legs.length || !ROUTE.legS.length){ ship.style.left = '0%'; return; }
  const start = Number(track.dataset.start||0);
  const count = Number(track.dataset.count||1);
  const idx = Math.min(ROUTE.index, ROUTE.legs.length-1);
  const startS = idx>0 ? ROUTE.legS[idx-1] : 0;
  const endS = ROUTE.legS[idx] !== undefined ? ROUTE.legS[idx] : ROUTE.length;
  const legFrac = endS>startS ? THREE.MathUtils.clamp((ROUTE.s-startS)/(endS-startS), 0, 1) : 0;
  const localIdx = THREE.MathUtils.clamp(idx-start, 0, count-1);
  const frac = count>1 ? (localIdx+legFrac)/(count-1) : 0;
  ship.style.left = (THREE.MathUtils.clamp(frac,0,1)*100)+'%';
}

/* Point de Lagrange approximatif (L1) de l'étape en cours : sur l'axe
   étoile→planète cible, à 92% de la distance en partant de l'étoile — une
   approximation assumée (cf. commentaire CSS de .hud-lagrange), pas un
   calcul à N corps : les planètes générées n'ont pas de masse simulée dont
   tirer un vrai point de libration. */
const LAGRANGE_FRACTION = 0.92;
function computeLagrangePoint(leg){
  if(!leg || !leg.planet || !leg.starPosition) return null;
  const dir = leg.planet.position.clone().sub(leg.starPosition);
  const dist = dir.length();
  if(dist < 1) return leg.planet.position.clone();
  dir.normalize();
  return leg.starPosition.clone().addScaledVector(dir, dist*LAGRANGE_FRACTION);
}
const _lagTmp = new THREE.Vector3();
function updateLagrangePanel(){
  const panel = document.querySelector('.hud-lagrange');
  if(!panel || panel.classList.contains('panel-hidden')) return;
  const distEl = document.getElementById('lagrangeDist');
  const nameEl = document.getElementById('lagrangeName');
  const needle = document.getElementById('lagrangeNeedle');
  if(!distEl || !nameEl || !needle) return;
  const leg = ROUTE.legs[ROUTE.index];
  const lp = computeLagrangePoint(leg);
  if(!lp){
    distEl.textContent = '—';
    nameEl.textContent = t('noRoute');
    return;
  }
  const forward = new THREE.Vector3(0,0,-1).applyQuaternion(shipRig.quaternion);
  const heading = ((Math.atan2(forward.x, -forward.z)*180/Math.PI)+360)%360;
  _lagTmp.copy(lp).sub(shipRig.position);
  const dist = _lagTmp.length();
  const targetHeading = ((Math.atan2(_lagTmp.x, -_lagTmp.z)*180/Math.PI)+360)%360;
  const relBearing = (targetHeading-heading+360)%360;
  needle.style.transform = 'rotate('+relBearing.toFixed(1)+'deg)';
  distEl.textContent = Math.round(dist)+' u';
  nameEl.textContent = 'L1 · '+leg.name;
}
