/* =========================================================================
   3bis. SHADER DE SURFACE STELLAIRE
   Photosphère avec assombrissement centre-bord (approximation d'Eddington :
   I(μ)/I(1) = 1 - u(1-μ), u≈0.6) + granulation convective et taches.
   ========================================================================= */
const STAR_VERT = `
  varying vec3 vNormal;
  varying vec3 vPos;
  varying vec3 vWorldPos;
  void main(){
    vNormal = normalize(normalMatrix * normal);
    vPos = position;
    /* modelMatrix n'est PAS auto-déclaré dans le fragment shader par
       Three.js (seul le vertex shader le reçoit) : on calcule donc la
       position monde ICI et on la transmet en varying, plutôt que de
       refaire la multiplication côté fragment — ce qui ne compilait pas. */
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const STAR_FRAG = `
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vPos;
  varying vec3 vWorldPos;
  uniform vec3 baseColor;
  uniform float limbU;
  uniform float time;
  uniform float granulation;
  uniform float seed;

  float hash(vec3 p){
    p = fract(p*0.3183099 + vec3(0.1,0.2,0.3));
    p *= 17.0;
    return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
  }
  float noise(vec3 x){
    vec3 i = floor(x); vec3 f = fract(x);
    f = f*f*(3.0-2.0*f);
    return mix(
      mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),
          mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x), f.y),
      mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
          mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x), f.y), f.z);
  }
  float fbm(vec3 p){
    float v=0.0, a=0.5;
    for(int i=0;i<3;i++){ v += a*noise(p); p *= 2.1; a *= 0.5; }
    return v;
  }
  void main(){
    /* mu = cosinus de l'angle entre la normale et la ligne de visée */
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float mu = clamp(dot(normalize(vNormal), normalize(viewDir)), 0.0, 1.0);

    /* assombrissement centre-bord : le bord du disque est plus froid/sombre
       car on y voit des couches plus hautes de la photosphère */
    float limb = 1.0 - limbU*(1.0 - mu);

    /* granulation convective : cellules qui se renouvellent lentement */
    vec3 gp = normalize(vPos)*7.0 + vec3(seed);
    float gran = fbm(gp + vec3(0.0, 0.0, time*0.08));
    float cells = mix(1.0, 0.80 + 0.40*gran, granulation);

    /* taches stellaires (zones magnétiques plus froides) */
    float spot = smoothstep(0.62, 0.78, fbm(gp*0.45 + vec3(seed*1.7)));
    cells *= mix(1.0, 0.55, spot*granulation);

    /* le bord paraît plus rouge : les couches hautes rayonnent plus froid */
    vec3 col = baseColor * limb * cells;
    col = mix(col, col*vec3(1.15, 0.80, 0.58), (1.0-mu)*0.55);

    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ---------- étiquettes DOM des étoiles connues (projetées à l'écran) ---------- */
const labelContainer = document.getElementById('starLabels');
function createStarLabel(text){
  const el = document.createElement('div');
  el.className = 'star-label';
  /* cercle de désignation autour de l'astre + flèche vers le nom, plutôt
     qu'un simple texte flottant — reprend le vocabulaire des balises de
     ciblage déjà utilisé ailleurs dans le HUD (cercles, liaisons fines) */
  el.innerHTML =
    '<span class="star-ring"></span>' +
    '<span class="star-arrow"></span>' +
    '<span class="star-text"></span>';
  el.querySelector('.star-text').textContent = text;
  labelContainer.appendChild(el);
  return el;
}

/* ---------- étiquettes de planètes et de lunes : pool réutilisé ----------
   Contrairement aux étoiles (une par cellule visitée, créées/détruites au
   fil du streaming), les planètes/lunes affichées à un instant donné sont
   toujours celles des systèmes RÉELLEMENT construits (l'étape en cours et
   la suivante, cf. ensureSystemsBuilt) — un petit nombre, changeant peu.
   Un pool évite d'avoir à créer/détruire des nœuds DOM en synchronisation
   avec ce cycle de construction. */
function createPoolLabel(kind){
  const el = document.createElement('div');
  el.className = 'star-label ' + kind + '-label';
  el.innerHTML =
    '<span class="star-ring"></span>' +
    '<span class="star-arrow"></span>' +
    '<span class="star-text"></span>';
  labelContainer.appendChild(el);
  return el;
}
const PLANET_LABEL_POOL = [];
const MOON_LABEL_POOL = [];
for(let i=0;i<10;i++) PLANET_LABEL_POOL.push(createPoolLabel('planet'));
for(let i=0;i<10;i++) MOON_LABEL_POOL.push(createPoolLabel('moon'));

/* ---------- étiquettes de vaisseaux (cargo + navettes), amélioration
   demandée ---------- */
const SHIP_LABEL_POOL = [];
for(let i=0;i<6;i++) SHIP_LABEL_POOL.push(createPoolLabel('ship'));
const SHIP_LABEL_MIN_DIST = 18;   /* trop près, l'anneau engloutirait l'écran */
function projectShipLabel(pool, idx, worldPos, worldRadius, text){
  if(idx >= pool.length) return idx+1;
  const el = pool[idx];
  const toObj = _lblNdc.copy(worldPos).sub(camera.position);
  const dist = toObj.length();
  const camF = _pfForward.set(0,0,-1).applyQuaternion(camera.quaternion);
  if(toObj.dot(camF) <= 0 || dist < SHIP_LABEL_MIN_DIST){ el.style.display = 'none'; return idx+1; }
  _lblNdc.copy(worldPos).project(camera);
  const sx = (_lblNdc.x*0.5+0.5)*window.innerWidth;
  const sy = (1-(_lblNdc.y*0.5+0.5))*window.innerHeight;
  const margin = 100;
  if(sx < -margin || sx > window.innerWidth+margin || sy < -margin || sy > window.innerHeight+margin){
    el.style.display = 'none';
    return idx+1;
  }
  /* taille de l'anneau = taille apparente réelle de l'objet à l'écran
     (projection d'un rayon à cette distance, via le champ de vision
     vertical de la caméra) — c'est ce qui fait que le cercle « entoure »
     le vaisseau plutôt que d'être une simple pastille fixe. */
  const vFOV = camera.fov * Math.PI/180;
  const pxPerUnit = (window.innerHeight/2) / (dist*Math.tan(vFOV/2));
  const ringSize = THREE.MathUtils.clamp(worldRadius*2.3*pxPerUnit, 16, 260);
  const ringR = ringSize/2;
  el.style.display = 'block';
  el.style.left = sx+'px';
  el.style.top = sy+'px';
  el.className = 'star-label ship-label';
  const ring = el.querySelector('.star-ring');
  ring.style.width = ringSize+'px';
  ring.style.height = ringSize+'px';
  const arrow = el.querySelector('.star-arrow');
  arrow.style.top = (-ringR)+'px';
  const txt = el.querySelector('.star-text');
  txt.style.top = (-ringR-13)+'px';
  txt.textContent = text;
  return idx+1;
}
function updateShipLabels(){
  let idx = 0;
  idx = projectShipLabel(SHIP_LABEL_POOL, idx, shipRig.position, SHIP_LABEL_RADIUS, SHIP_REGISTRY);
  orbitState.shuttles.forEach(function(s){
    idx = projectShipLabel(SHIP_LABEL_POOL, idx, s.group.position, SHUTTLE_LABEL_RADIUS, t('shuttleLabelGeneric'));
  });
  for(;idx<SHIP_LABEL_POOL.length;idx++) SHIP_LABEL_POOL[idx].style.display = 'none';
}

const PLANET_LABEL_RANGE = 3400;   /* au-delà, la planète n'est pas encore « connue » */
const PORT_LABEL_RANGE = 1400;     /* distance à partir de laquelle le nom du port remplace celui de la planète */
const MOON_LABEL_RANGE = 1300;
const _lblNdc = new THREE.Vector3();

function projectLabel(pool, idx, worldPos, text, shipPos, extraClass){
  if(idx >= pool.length) return idx+1;
  const el = pool[idx];
  const toObj = _lblNdc.copy(worldPos).sub(camera.position);
  const camF = _pfForward.set(0,0,-1).applyQuaternion(camera.quaternion);
  if(toObj.dot(camF) <= 0){ el.style.display = 'none'; return idx+1; }
  _lblNdc.copy(worldPos).project(camera);
  const sx = (_lblNdc.x*0.5+0.5)*window.innerWidth;
  const sy = (1-(_lblNdc.y*0.5+0.5))*window.innerHeight;
  const margin = 60;
  if(sx < -margin || sx > window.innerWidth+margin || sy < -margin || sy > window.innerHeight+margin){
    el.style.display = 'none';
    return idx+1;
  }
  el.style.display = 'block';
  el.style.left = sx+'px';
  el.style.top = sy+'px';
  el.className = 'star-label ' + (extraClass || '');
  el.querySelector('.star-text').textContent = text;
  return idx+1;
}
const _pfForward = new THREE.Vector3();

function updateCelestialLabels(){
  let pIdx = 0, mIdx = 0;
  const shipPos = shipRig.position;
  ROUTE.builtSystems.forEach(function(grp, legIndex){
    const leg = ROUTE.legs[legIndex];
    if(!leg || !leg.system) return;
    leg.system.planets.forEach(function(p){
      if(!p.mesh) return;
      const d = shipPos.distanceTo(p.position);
      if(d <= PLANET_LABEL_RANGE){
        const isPort = p.isHabitable && d <= PORT_LABEL_RANGE;
        const label = isPort ? p.portName : p.properName;
        pIdx = projectLabel(PLANET_LABEL_POOL, pIdx, p.position, label, shipPos,
          'planet-label' + (isPort ? ' is-port' : ''));
      }
      (p.moonPivots||[]).forEach(function(pivot, mi){
        if(!pivot.userData.moonName) return;
        const moon = pivot.children[0];
        if(!moon) return;
        const wp = moon.getWorldPosition(new THREE.Vector3());
        const d = shipPos.distanceTo(wp);
        if(d <= MOON_LABEL_RANGE){
          mIdx = projectLabel(MOON_LABEL_POOL, mIdx, wp, pivot.userData.moonName, shipPos, 'moon-label');
        }
      });
    });
  });
  for(let i=pIdx;i<PLANET_LABEL_POOL.length;i++) PLANET_LABEL_POOL[i].style.display = 'none';
  for(let i=mIdx;i<MOON_LABEL_POOL.length;i++) MOON_LABEL_POOL[i].style.display = 'none';
}

