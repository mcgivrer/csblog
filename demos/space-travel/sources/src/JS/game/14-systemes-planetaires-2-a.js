/* =========================================================================
   7ter. SYSTÈMES PLANÉTAIRES — 2 à 3 planètes par étoile de la route
   Une seule planète du système est habitable : c'est elle qui porte la
   ville et le port spatial réellement ciblés par le vaisseau. Les planètes
   NE RÉVOLUTIONNENT PAS autour de leur étoile (seule leur rotation propre,
   le "spin", est animée) : leur centre doit rester exactement là où la
   courbe de vol a été tracée, sous peine de voir le vaisseau arriver dans
   le vide. Seules les données sont ici — la construction des maillages
   (coûteuse : shader + atmosphère + satellites) est différée et limitée à
   l'étape en cours + la suivante (cf. ensureSystemsBuilt), pour absorber
   le coût du rendu temps réel sur plusieurs planètes visibles.
   ========================================================================= */
const PLANET_KINDS = [
  {key:'ocean',      name:'monde océanique',   ocean:0.62, life:true,  atmo:true},
  {key:'continental',name:'monde continental', ocean:0.32, life:true,  atmo:true},
  {key:'desert',     name:'monde désertique',  ocean:0.04, life:false, atmo:true},
  {key:'ice',        name:'monde glacé',       ocean:0.50, life:false, atmo:true,  icy:true},
  {key:'volcanic',   name:'monde volcanique',  ocean:0.00, life:false, atmo:false, volcanic:true},
  {key:'gas',        name:'géante gazeuse',    ocean:0.00, life:false, atmo:true,  gas:true}
];
const HABITABLE_KIND_COUNT = 2;   /* océanique, continental — indices 0,1 */

/* ---------- icône du panneau « objet le plus proche » (amélioration
   demandée) : un canvas 2D léger plutôt qu'un second rendu 3D — bien
   moins coûteux, et amplement suffisant pour reconnaître le TYPE d'objet
   d'un coup d'œil (teinte + ombrage), sans dupliquer tout un pipeline de
   rendu pour une vignette de 52px. Redessiné seulement au rythme de
   rafraîchissement du panneau (throttlé à 350ms dans updateHud). ---------- */
const PLANET_KIND_COLORS = {
  ocean:       ['#123a63', '#5eb8e0'],
  continental: ['#2e4a26', '#c9a86a'],
  desert:      ['#7a4f22', '#e8c088'],
  ice:         ['#7fa8c0', '#f0fbff'],
  volcanic:    ['#3a0f0a', '#ff7a3d'],
  gas:         ['#8a5a28', '#e8c896']
};
function renderNearestIcon(kind, options){
  const el = document.getElementById('nearIcon');
  if(!el) return;
  const ctx = el.getContext('2d');
  const w = el.width, h = el.height;
  ctx.clearRect(0,0,w,h);
  const cx=w/2, cy=h/2, r=w/2-2;
  if(kind === 'planet'){
    const colors = PLANET_KIND_COLORS[options.key] || PLANET_KIND_COLORS.continental;
    const grad = ctx.createRadialGradient(cx-r*0.35, cy-r*0.35, r*0.08, cx, cy, r);
    grad.addColorStop(0, colors[1]);
    grad.addColorStop(1, colors[0]);
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fillStyle=grad; ctx.fill();
    if(options.gas){
      /* bandes horizontales, façon géante gazeuse */
      ctx.save();
      ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.clip();
      ctx.globalAlpha = 0.28;
      for(let i=-2;i<=2;i++){
        ctx.fillStyle = (i%2===0) ? colors[0] : colors[1];
        ctx.fillRect(0, cy+i*r*0.38-r*0.11, w, r*0.2);
      }
      ctx.restore();
    }
    /* terminateur jour/nuit — même esprit que l'éclairage réel des planètes */
    const shadow = ctx.createRadialGradient(cx+r*0.55,cy+r*0.55,0,cx+r*0.55,cy+r*0.55,r*1.5);
    shadow.addColorStop(0,'rgba(0,0,0,0.6)'); shadow.addColorStop(1,'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fillStyle=shadow; ctx.fill();
  } else if(kind === 'star'){
    const c = options.color;
    const hex = 'rgb('+Math.round(c.r*255)+','+Math.round(c.g*255)+','+Math.round(c.b*255)+')';
    const grad = ctx.createRadialGradient(cx,cy,0,cx,cy,r);
    grad.addColorStop(0,'#ffffff'); grad.addColorStop(0.4,hex); grad.addColorStop(1,hex);
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fillStyle=grad; ctx.fill();
  } else {
    /* nébuleuse : dégradé diffus, sans contour net */
    const type = options.type;
    const hexA = '#'+type.colorA.toString(16).padStart(6,'0');
    const hexB = '#'+type.colorB.toString(16).padStart(6,'0');
    const grad = ctx.createRadialGradient(cx,cy,0,cx,cy,r);
    grad.addColorStop(0,hexA); grad.addColorStop(1,hexB);
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fillStyle=grad; ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function generateSystemData(leg){
  const rng = rngFor(SEED+':system:'+leg.cell);
  const count = 2 + Math.floor(rng()*2);        /* 2 ou 3 planètes */
  const habIdx = Math.floor(rng()*count);

  /* plan orbital commun au système, à peine incliné */
  const planeNormal = new THREE.Vector3(rng()-0.5, (rng()-0.5)*0.35, rng()-0.5).normalize();
  const ref = Math.abs(planeNormal.y) < 0.9 ? new THREE.Vector3(0,1,0) : new THREE.Vector3(1,0,0);
  const u = new THREE.Vector3().crossVectors(ref, planeNormal).normalize();
  const v = new THREE.Vector3().crossVectors(planeNormal, u).normalize();

  const planets = [];
  /* Échelle : le vaisseau mesure ~50 unités de long. Une planète doit
     dominer largement la vue à l'approche — jamais paraître comparable au
     vaisseau. Rayons choisis pour un diamètre 5 à 17 fois la longueur du
     vaisseau.
     L'espacement orbital est calculé À PARTIR DES RAYONS RÉELS, et non
     tiré indépendamment d'eux : deux planètes voisines pourraient sinon se
     chevaucher dès que leurs angles orbitaux (indépendants) se rapprochent
     — l'écart entre deux orbites doit donc TOUJOURS excéder la somme de
     leurs deux rayons, plus une marge de sécurité, quel que soit l'angle. */
  const kinds = [];
  for(let i=0;i<count;i++){
    const isHab = (i === habIdx);
    const kind = isHab
      ? PLANET_KINDS[Math.floor(rng()*HABITABLE_KIND_COUNT)]
      : PLANET_KINDS[Math.floor(rng()*PLANET_KINDS.length)];
    const radius = kind.gas ? (200+rng()*120) : (100+rng()*100);
    kinds.push({kind:kind, radius:radius, isHab:isHab});
  }
  /* Marge de sécurité minimale entre deux orbites, PAS l'écart total (les
     deux rayons sont déjà ajoutés séparément ci-dessous). Élargie (bug
     remonté en jeu : planètes perçues comme trop proches) par rapport à
     la version précédente, plus modeste pour ne pas gonfler le temps de
     croisière — CRUISE_SPEED_BASE est augmentée en proportion (cf. plus
     bas) pour compenser l'allongement des systèmes. */
  /* Espacement inspiré des systèmes réels (les orbites s'écartent de façon
     croissante, pas à intervalles fixes) sans viser une échelle réaliste
     littérale — à l'échelle UA réelle, un aller-retour dans un seul système
     prendrait des heures. Le nombre d'étapes de la route (réduit à 6, cf.
     computeRoute) absorbe le coût de cet espacement plus généreux sur le
     temps de trajet total. */
  const GAP_MIN = 400, GAP_RANGE = 480;
  const ORBIT_GROWTH = 1.65;   /* chaque orbite est ~1,65× la précédente, comme dans un vrai système */
  let orbit = 780 + rng()*380;
  for(let i=0;i<count;i++){
    if(i > 0){
      /* deux contraintes combinées : une croissance géométrique (esprit
         Titius-Bode, l'espacement réel des systèmes) ET un plancher
         additif garanti (rayons + marge) qui exclut tout chevauchement
         quel que soit l'angle orbital de chacune — la plus grande des
         deux l'emporte. */
      const geometric = orbit * ORBIT_GROWTH;
      const safeFloor = orbit + kinds[i-1].radius + kinds[i].radius + (GAP_MIN + rng()*GAP_RANGE);
      orbit = Math.max(geometric, safeFloor);
    }
    const isHab = kinds[i].isHab;
    const kind = kinds[i].kind;
    const radius = kinds[i].radius;

    const angle = rng()*Math.PI*2;
    const offset = u.clone().multiplyScalar(Math.cos(angle)*orbit)
                    .addScaledVector(v, Math.sin(angle)*orbit);
    const worldPos = leg.starPosition.clone().add(offset);

    const oceanFrac = kind.gas ? 0 : THREE.MathUtils.clamp(kind.ocean + (rng()-0.5)*0.22, 0, 0.92);

    const planet = {
      kind: kind,
      name: kind.name,
      properName: generateName(rng) + ' ' + toRoman(i+1),
      radius: radius,
      position: worldPos,
      oceanFrac: oceanFrac,
      spinSpeed: (0.05 + rng()*0.10) * (rng()<0.5 ? 1 : -1),
      spinAngle: rng()*Math.PI*2,
      tilt: (rng()-0.5)*0.6,
      moonCount: kind.gas ? Math.floor(rng()*3) : (rng()<0.4 ? 1 : 0),
      seedNoise: rng()*1000,
      hueShift: rng(),
      hasAtmosphere: !!kind.atmo,
      /* anneaux : uniquement les géantes gazeuses, environ une chance sur
         deux — comme Saturne ou Uranus plutôt que Vénus ou la Terre */
      hasRings: kind.gas && rng() < 0.5,
      ringSeed: rng()*1000,
      isHabitable: isHab
    };
    if(isHab){
      planet.cityName = generateName(rng);
      planet.portName = t('portPrefix') + planet.cityName;
      /* point de la surface qui porte le port, en coordonnées OBJET (donc
         solidaire de la rotation de la planète, sans recalcul par image) */
      const lat = (rng()-0.5)*Math.PI*0.65;   /* on évite les pôles */
      const lon = rng()*Math.PI*2;
      planet.portLocal = new THREE.Vector3(
        Math.cos(lat)*Math.cos(lon), Math.sin(lat), Math.cos(lat)*Math.sin(lon)
      );
    }
    planets.push(planet);
  }

  /* champ d'astéroïdes : placé dans le VIDE entre deux orbites planétaires
     consécutives (jamais sur l'orbite d'une planète), comme la ceinture
     principale du Système solaire logée entre Mars et Jupiter — pas une
     dispersion uniforme dans tout le système. Environ deux systèmes sur
     cinq en comptent un. */
  let asteroidBelt = null;
  if(planets.length >= 2 && rng() < 0.4){
    const byDist = planets.map(function(p){
      return {p:p, d:p.position.distanceTo(leg.starPosition)};
    }).sort(function(a,b){ return a.d-b.d; });
    const gapIdx = Math.floor(rng()*(byDist.length-1));
    const inner = byDist[gapIdx].d + byDist[gapIdx].p.radius + 60;
    const outer = byDist[gapIdx+1].d - byDist[gapIdx+1].p.radius - 60;
    if(outer > inner + 150){
      asteroidBelt = { inner: inner, outer: outer, count: 240 + Math.floor(rng()*260) };
    }
  }

  return {planets: planets, habIdx: habIdx, asteroidBelt: asteroidBelt};
}

/* ---------- shader de surface planétaire ----------
   Continents/océans/calottes via bruit fBm échantillonné en espace OBJET
   (le motif reste collé à la surface quand la planète tourne). Nuages et
   éclairage jour/nuit calculés dans le MÊME passage — pas de second maillage
   de nuages, pas de second draw call : c'est ce qui rend un relief animé
   supportable sur plusieurs planètes à la fois. */
const PLANET_VERT = `
  varying vec3 vObjNormal;
  varying vec3 vWorldNormal;
  void main(){
    vObjNormal = normal;
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const PLANET_FRAG = `
  precision highp float;
  varying vec3 vObjNormal;
  varying vec3 vWorldNormal;
  uniform vec3 uLightDir;
  uniform vec3 uLightColor;
  uniform float uOceanFrac;
  uniform float uSeed;
  uniform float uHue;
  uniform float uTime;
  uniform float uGas;
  uniform float uIcy;
  uniform float uVolcanic;

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
    for(int i=0;i<4;i++){ v += a*noise(p); p *= 2.05; a *= 0.5; }
    return v;
  }
  void main(){
    vec3 n = normalize(vObjNormal);
    vec3 seedOff = vec3(uSeed);
    vec3 surface;
    float landMask = 0.0;

    if(uGas > 0.5){
      /* géante gazeuse : bandes latitudinales perturbées par du bruit */
      float bands = sin(n.y*16.0 + fbm(n*2.0+seedOff)*3.2);
      vec3 bandA = vec3(0.55+uHue*0.15, 0.42, 0.30);
      vec3 bandB = vec3(0.88, 0.78-uHue*0.1, 0.58);
      surface = mix(bandA, bandB, smoothstep(-0.3, 0.3, bands));
    } else {
      float h = fbm(n*3.1 + seedOff);
      landMask = step(1.0-uOceanFrac, h);
      vec3 oceanColor = uIcy>0.5 ? vec3(0.72,0.84,0.94) : vec3(0.04,0.16,0.40);
      vec3 landA = mix(vec3(0.16,0.34,0.12), vec3(0.6,0.55,0.35), uHue*0.4);
      vec3 landB = vec3(0.44,0.32,0.15);
      vec3 land = mix(landA, landB, fbm(n*5.2+seedOff+7.0));
      if(uVolcanic > 0.5){
        land = mix(vec3(0.22,0.05,0.03), vec3(0.92,0.38,0.05), smoothstep(0.45,0.78,h));
      }
      surface = mix(oceanColor, land, landMask);
      /* calottes polaires */
      float polar = smoothstep(0.74, 0.92, abs(n.y)) * step(0.5, 1.0-uVolcanic);
      surface = mix(surface, vec3(0.97), polar);
      /* relief : la même hauteur qui sépare terre/mer sert de pseudo-ombrage */
      surface *= 0.86 + 0.28*h;
    }

    /* éclairage jour/nuit, calculé en espace MONDE (correct quelle que soit
       la rotation de spin déjà appliquée à la géométrie) */
    float ndl = clamp(dot(vWorldNormal, uLightDir), 0.0, 1.0);
    vec3 lit = surface * (0.05 + ndl*0.95) * uLightColor;

    if(uGas < 0.5 && uVolcanic < 0.5){
      /* lumières de villes, uniquement sur les terres, côté nuit */
      float night = clamp(-dot(vWorldNormal, uLightDir), 0.0, 1.0);
      float cityN = fbm(n*42.0 + seedOff + 13.0);
      float cityMask = landMask * step(0.83, cityN);
      lit += vec3(1.0,0.82,0.45) * cityMask * night * 1.5;

      /* nuages : bruit décalé dans le temps pour donner une dérive lente,
         mélangés en supplément — pas de second maillage */
      float cloudN = fbm(n*6.0 + seedOff + vec3(uTime*0.02, 0.0, 0.0));
      float cloud = smoothstep(0.56, 0.76, cloudN);
      lit = mix(lit, vec3(1.0)*(0.15+ndl*0.85), cloud*0.55);
    }

    gl_FragColor = vec4(lit, 1.0);
  }
`;

/* ---------- atmosphère : liseré de Fresnel, une sphère de plus, additive --- */
const ATMO_VERT = `
  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  void main(){
    vNormalW = normalize((modelMatrix * vec4(normal,0.0)).xyz);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const ATMO_FRAG = `
  precision highp float;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  uniform vec3 uColor;
  void main(){
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float rim = 1.0 - abs(dot(normalize(vNormalW), viewDir));
    float a = pow(rim, 2.4) * 0.75;
    gl_FragColor = vec4(uColor, a);
  }
`;

/* ---------- construction des maillages d'un système (différée) ---------- */
/* ---------- anneaux planétaires (géantes gazeuses uniquement) ----------
   THREE.RingGeometry mappe ses UV par projection plane (pas radiale), ce
   qui déformerait une texture de bandes concentriques — on construit donc
   une géométrie dédiée où v=0 au rayon interne, v=1 au rayon externe. */