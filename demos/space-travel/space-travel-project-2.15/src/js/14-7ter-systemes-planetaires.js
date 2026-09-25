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
/* =========================================================================
   ASTÉROÏDES — quelques gabarits de forme générés une seule fois au
   chargement (pas un par astéroïde placé), puis dupliqués massivement par
   instance. Les astronomes réels observent effectivement quelques grandes
   familles de formes (patatoïdes allongés, blocs anguleux, corps presque
   sphériques pour les plus gros — l'auto-gravité les arrondit) plutôt
   qu'une infinité de silhouettes uniques.
   ========================================================================= */
const ASTEROID_TEMPLATES = (function(){
  const templates = [];
  const N = 5;
  for(let t=0; t<N; t++){
    const rng = rngFor('asteroid-template-'+t);
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const pos = geo.attributes.position;
    /* quelques coefficients de bruit directionnel, tirés une fois : une
       vraie fBm serait superflue pour une forme vue de loin la plupart
       du temps, mais on combine trois fréquences pour éviter l'aspect
       trop régulier d'un simple icosaèdre déformé par un seul sinus */
    const kx=1+rng()*2.4, ky=1+rng()*2.4, kz=1+rng()*2.4;
    const px=rng()*10, py=rng()*10, pz=rng()*10;
    const stretch = new THREE.Vector3(0.75+rng()*0.5, 0.75+rng()*0.5, 0.75+rng()*0.5);
    for(let v=0; v<pos.count; v++){
      const x=pos.getX(v), y=pos.getY(v), z=pos.getZ(v);
      const len = Math.hypot(x,y,z) || 1;
      const nx=x/len, ny=y/len, nz=z/len;
      const n = Math.sin(nx*kx+px)*Math.cos(ny*ky+py) + 0.5*Math.sin(nz*kz+pz);
      const r = THREE.MathUtils.clamp(0.78 + n*0.22, 0.5, 1.18);
      pos.setXYZ(v, nx*r*stretch.x, ny*r*stretch.y, nz*r*stretch.z);
    }
    geo.computeVertexNormals();
    templates.push(geo);
  }
  return templates;
})();
const ASTEROID_MAT = new THREE.MeshStandardMaterial({ color:0x8c8378, roughness:0.96, metalness:0.04 });

/* Place une ceinture entre deux orbites (dans le VIDE laissé entre deux
   planètes, comme la ceinture principale entre Mars et Jupiter) — jamais
   sur l'orbite d'une planète elle-même. Tailles réparties en loi de
   puissance (rng()*rng() biaise fortement vers le petit) : l'écrasante
   majorité des astéroïdes réels sont de petits corps, les gros étant rares. */
function buildAsteroidBelt(leg, innerR, outerR, count){
  const rng = rngFor(SEED+':asteroids:'+leg.cell);
  const group = new THREE.Group();
  const perTemplate = Math.max(1, Math.ceil(count/ASTEROID_TEMPLATES.length));
  const dummy = new THREE.Object3D();
  ASTEROID_TEMPLATES.forEach(function(geo){
    const inst = new THREE.InstancedMesh(geo, ASTEROID_MAT, perTemplate);
    for(let i=0;i<perTemplate;i++){
      const angle = rng()*Math.PI*2;
      const r = innerR + rng()*(outerR-innerR);
      /* ceinture aplatie : faible dispersion hors du plan, comme dans la réalité */
      const height = (rng()-0.5)*(outerR-innerR)*0.05;
      dummy.position.set(Math.cos(angle)*r, height, Math.sin(angle)*r);
      const size = 1.1 + rng()*rng()*26;
      dummy.scale.setScalar(size);
      dummy.rotation.set(rng()*Math.PI*2, rng()*Math.PI*2, rng()*Math.PI*2);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  });
  return group;
}

function buildRingGeometry(innerR, outerR, segments){
  const geo = new THREE.BufferGeometry();
  const positions = [], uvs = [], indices = [];
  for(let i=0;i<=segments;i++){
    const theta = (i/segments)*Math.PI*2;
    const cos = Math.cos(theta), sin = Math.sin(theta);
    positions.push(cos*innerR, sin*innerR, 0);
    uvs.push(i/segments, 0);
    positions.push(cos*outerR, sin*outerR, 0);
    uvs.push(i/segments, 1);
  }
  for(let i=0;i<segments;i++){
    const a=i*2, b=i*2+1, c=i*2+2, d=i*2+3;
    indices.push(a,b,c, b,d,c);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs,2));
  geo.setIndex(indices);
  return geo;
}
/* profil radial en bandes, déterministe (seed de la planète) — pas de
   bruit par pixel non maîtrisé : quelques paramètres tirés une fois,
   ensuite une fonction lisse (sinus) donne des bandes nettes plutôt
   qu'un grain aléatoire par ligne. */
/* =========================================================================
   TEXTURES DE COQUE — panneaux, joints, greebles et bandes de danger,
   générées par canvas (aucune image externe, cohérent avec le reste du
   fichier). Inspirées de vaisseaux de type Homeworld : grands panneaux
   plats à peine désaccordés en teinte, joints marqués, quelques détails
   utilitaires (bouches d'aération, capots), bandes jaune/noir ponctuelles.
   Un même canevas, quatre teintes de base : la variété visuelle du
   vaisseau vient presque entièrement de cette seule fonction. */
function shadeHex(hex, amt){
  const r = Math.max(0, Math.min(255, ((hex>>16)&255) + amt));
  const g = Math.max(0, Math.min(255, ((hex>>8)&255) + amt));
  const b = Math.max(0, Math.min(255, (hex&255) + amt));
  return 'rgb('+(r|0)+','+(g|0)+','+(b|0)+')';
}
function buildHullPanelTexture(seedStr, baseHex, opts){
  opts = opts || {};
  const rng = rngFor(seedStr);
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = shadeHex(baseHex, 0);
  ctx.fillRect(0, 0, size, size);

  /* grille de panneaux, tailles irrégulières plutôt qu'une trame parfaite */
  const cols = 4 + Math.floor(rng()*3), rows = 3 + Math.floor(rng()*3);
  const cw = size/cols, rh = size/rows;
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      ctx.fillStyle = shadeHex(baseHex, (rng()-0.5)*26);
      ctx.fillRect(c*cw+1, r*rh+1, cw-2, rh-2);
    }
  }
  /* joints, plus sombres que le panneau le plus sombre */
  ctx.strokeStyle = shadeHex(baseHex, -70);
  ctx.lineWidth = 1.4;
  for(let c=0;c<=cols;c++){ ctx.beginPath(); ctx.moveTo(c*cw,0); ctx.lineTo(c*cw,size); ctx.stroke(); }
  for(let r=0;r<=rows;r++){ ctx.beginPath(); ctx.moveTo(0,r*rh); ctx.lineTo(size,r*rh); ctx.stroke(); }

  /* greebles épars : petits capots et ouïes, jamais sur toute la surface */
  const greebleCount = Math.floor(cols*rows*0.55);
  for(let i=0;i<greebleCount;i++){
    const c = Math.floor(rng()*cols), r = Math.floor(rng()*rows);
    const gx = c*cw + rng()*(cw*0.55) + cw*0.1, gy = r*rh + rng()*(rh*0.55) + rh*0.1;
    ctx.fillStyle = shadeHex(baseHex, -45-rng()*25);
    if(rng() < 0.55){
      ctx.fillRect(gx, gy, 5+rng()*11, 3+rng()*6);
    } else {
      ctx.beginPath(); ctx.arc(gx, gy, 2+rng()*2.6, 0, Math.PI*2); ctx.fill();
    }
  }

  /* bande de danger jaune/noir : rare, un seul panneau au plus */
  if(opts.hazard !== false && rng() < 0.5){
    const c = Math.floor(rng()*cols), r = Math.floor(rng()*rows);
    const bx=c*cw+2, by=r*rh+rh*0.38, bw=cw-4, bh=rh*0.24;
    ctx.save();
    ctx.beginPath(); ctx.rect(bx,by,bw,bh); ctx.clip();
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(bx,by,bw,bh);
    ctx.fillStyle = '#e8b93a';
    const stripe = 7;
    for(let x=-bh; x<bw+bh; x+=stripe*2){
      ctx.beginPath();
      ctx.moveTo(bx+x, by+bh); ctx.lineTo(bx+x+stripe, by+bh);
      ctx.lineTo(bx+x+stripe+bh, by); ctx.lineTo(bx+x+bh, by);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  /* accent clair, façon liseré vitré (cf. références) : une fine bande
     plus lumineuse, jamais sur un bord (pour ne pas trancher au raccord
     de répétition de la texture) */
  if(opts.accent){
    ctx.fillStyle = shadeHex(baseHex, 90);
    const ay = rh*(1+Math.floor(rng()*(rows-2)));
    ctx.fillRect(4, ay-1.5, size-8, 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function buildRingTexture(seed){
  const rng = rngFor(seed);
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = 1; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(1, h);
  const bands = 5 + Math.floor(rng()*6);
  const phase = rng()*Math.PI*2;
  const grain = 0.10 + rng()*0.10;
  const tone = rng();
  const baseColor = tone < 0.5
    ? [214, 198, 168]   /* poussière/roche, teinte chaude */
    : [206, 214, 222];  /* glace, teinte froide */
  for(let y=0; y<h; y++){
    const t = y/(h-1);
    let v = 0.5 + 0.30*Math.sin(t*bands*Math.PI*2 + phase);
    v += Math.sin(t*97.0 + phase*3.0) * grain * 0.4;
    v = Math.max(0, Math.min(1, v));
    const edgeFade = Math.min(t/0.05, (1-t)/0.05, 1);
    const alpha = Math.max(0, v*edgeFade);
    const idx = y*4;
    imgData.data[idx]   = baseColor[0];
    imgData.data[idx+1] = baseColor[1];
    imgData.data[idx+2] = baseColor[2];
    imgData.data[idx+3] = Math.round(alpha*255);
  }
  ctx.putImageData(imgData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function buildPlanetSystemMeshes(leg){
  const group = new THREE.Group();
  const sys = leg.system;

  sys.planets.forEach(function(p){
    const pg = new THREE.Group();
    pg.position.copy(p.position);
    pg.rotation.z = p.tilt;

    const mat = new THREE.ShaderMaterial({
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
      uniforms:{
        uLightDir:{value:new THREE.Vector3(1,0,0)},
        uLightColor:{value:new THREE.Color(0xffffff)},
        uOceanFrac:{value:p.oceanFrac},
        uSeed:{value:p.seedNoise},
        uHue:{value:p.hueShift},
        uTime:{value:0},
        uGas:{value:p.kind.gas?1:0},
        uIcy:{value:p.kind.icy?1:0},
        uVolcanic:{value:p.kind.volcanic?1:0}
      }
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(p.radius, 40, 28), mat);
    mesh.rotation.y = p.spinAngle;
    pg.add(mesh);
    p.mesh = mesh;

    if(p.hasAtmosphere){
      const atmoColor = p.kind.gas ? new THREE.Color(0xe8caa0)
        : p.kind.icy ? new THREE.Color(0xbfe3ff)
        : new THREE.Color(0x8fc4ff);
      const atmoMat = new THREE.ShaderMaterial({
        vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG,
        uniforms:{ uColor:{value:atmoColor} },
        transparent:true, depthWrite:false, side:THREE.BackSide,
        blending:THREE.AdditiveBlending
      });
      const atmo = new THREE.Mesh(new THREE.SphereGeometry(p.radius*1.07, 32, 24), atmoMat);
      pg.add(atmo);
    }

    /* anneaux : uniquement les géantes gazeuses tirées favorables (§ génération).
       Le disque est construit dans le plan équatorial local (perpendiculaire
       à l'axe de spin, avant l'inclinaison du groupe pg) : il hérite donc
       naturellement de l'inclinaison de la planète, comme dans la réalité. */
    if(p.hasRings){
      const ringInner = p.radius*1.5;
      const ringOuter = p.radius*(2.25 + (p.ringSeed%100)/100*0.85);
      const ringGeo = buildRingGeometry(ringInner, ringOuter, 72);
      const ringTex = buildRingTexture(SEED+':ring:'+leg.cell+':'+p.seedNoise);
      const ringMat = new THREE.MeshBasicMaterial({
        map: ringTex, transparent:true, side:THREE.DoubleSide,
        depthWrite:false, opacity:0.88
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI/2;
      ring.rotation.y = ((p.ringSeed%137)/137 - 0.5) * 0.5;
      pg.add(ring);
    }

    /* balise du port spatial : sprite parenté au maillage qui tourne — sa
       position suit donc la rotation de la planète sans recalcul par image */
    if(p.isHabitable){
      const beaconMat = new THREE.SpriteMaterial({
        map: glowTex, color:0xffb454, transparent:true, depthWrite:false,
        blending:THREE.AdditiveBlending
      });
      const beacon = new THREE.Sprite(beaconMat);
      beacon.scale.setScalar(p.radius*0.09);
      beacon.position.copy(p.portLocal).multiplyScalar(p.radius*1.03);
      mesh.add(beacon);
      p.beaconSprite = beacon;
    }

    /* satellites : orbite locale simple, portée par un pivot */
    p.moonPivots = [];
    const moonRng = rngFor(SEED+':moons:'+leg.cell+':'+p.seedNoise);
    for(let m=0;m<p.moonCount;m++){
      const pivot = new THREE.Object3D();
      pivot.rotation.x = (moonRng()-0.5)*0.8;
      pivot.rotation.z = moonRng()*Math.PI*2;
      const moonR = p.radius*(0.18+moonRng()*0.12);
      const orbitR = p.radius*(2.2+moonRng()*1.8+m*1.4);
      const moonMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.08, 0.12, 0.45+moonRng()*0.2),
        roughness:0.9, metalness:0.05
      });
      const moon = new THREE.Mesh(new THREE.SphereGeometry(moonR, 12, 10), moonMat);
      moon.position.set(orbitR, 0, 0);
      pivot.add(moon);
      pivot.userData.speed = (0.15+moonRng()*0.2) * (moonRng()<0.5?1:-1);
      pivot.userData.moonName = p.properName + ' ' + String.fromCharCode(97+m);  /* a, b, c… à la façon des lunes réelles */
      pg.add(pivot);
      p.moonPivots.push(pivot);
    }

    group.add(pg);
    p.group = pg;
  });

  if(sys.asteroidBelt){
    const belt = buildAsteroidBelt(leg, sys.asteroidBelt.inner, sys.asteroidBelt.outer, sys.asteroidBelt.count);
    belt.position.copy(leg.starPosition);
    group.add(belt);
  }

  return group;
}

function disposePlanetGroup(grp){
  grp.traverse(function(obj){
    if(obj.geometry) obj.geometry.dispose();
    if(obj.material){
      if(Array.isArray(obj.material)) obj.material.forEach(function(m){ m.dispose(); });
      else obj.material.dispose();
    }
  });
}

/* ---------- streaming : seuls les systèmes de l'étape en cours + la
   suivante existent réellement en scène — c'est ce qui absorbe le coût
   d'un rendu temps réel sur un shader relativement riche. ---------- */
function ensureSystemsBuilt(){
  const keep = new Set();
  /* Fenêtre élargie (était [index, index+1] seulement) : un système déjà
     dépassé (index-1) ou encore à deux étapes (index+2) reste construit —
     bug remonté en jeu, des planètes listées au plan de vol restaient
     purement et simplement absentes de la scène (aucun maillage) tant
     qu'on n'était pas rendu à l'étape immédiatement précédente. */
  [ROUTE.index-1, ROUTE.index, ROUTE.index+1, ROUTE.index+2].forEach(function(i){
    if(i>=0 && i<ROUTE.legs.length) keep.add(i);
  });
  keep.forEach(function(i){
    if(!ROUTE.builtSystems.has(i) && ROUTE.legs[i] && ROUTE.legs[i].system){
      const grp = buildPlanetSystemMeshes(ROUTE.legs[i]);
      scene.add(grp);
      ROUTE.builtSystems.set(i, grp);
    }
  });
  ROUTE.builtSystems.forEach(function(grp, i){
    if(!keep.has(i)){
      scene.remove(grp);
      disposePlanetGroup(grp);
      ROUTE.builtSystems.delete(i);
    }
  });
}

const HOP_MIN = 700, HOP_MAX = 1500;   /* longueur d'un saut entre étapes */

/* Cherche la meilleure étoile suivante depuis `from`, en privilégiant
   celles alignées sur `heading` et à bonne distance de saut. */
function findNextWaypoint(from, heading, visited, minAlign){
  const searchR = Math.ceil(HOP_MAX/STAR_CELL);
  const ALIGN = (minAlign !== undefined) ? minAlign : 0.35;
  const c = {
    x: Math.round(from.x/STAR_CELL),
    y: Math.round(from.y/STAR_CELL),
    z: Math.round(from.z/STAR_CELL)
  };
  let best = null, bestScore = -Infinity;
  const v = new THREE.Vector3();

  for(let dx=-searchR; dx<=searchR; dx++){
    for(let dy=-searchR; dy<=searchR; dy++){
      for(let dz=-searchR; dz<=searchR; dz++){
        const data = starDataForCell(c.x+dx, c.y+dy, c.z+dz);
        if(!data || visited.has(data.cell)) continue;
        v.copy(data.position).sub(from);
        const d = v.length();
        if(d < HOP_MIN || d > HOP_MAX) continue;
        v.divideScalar(d);
        const align = v.dot(heading);
        if(align < ALIGN) continue;          /* on ne fait pas demi-tour */
        /* on préfère : bien aligné, à mi-portée, et brillant (repère sûr) */
        const distScore = 1 - Math.abs(d - (HOP_MIN+HOP_MAX)/2)/((HOP_MAX-HOP_MIN)/2);
        const lumScore = Math.min(Math.log10(1 + data.star.lum)/3, 1);
        const score = align*2.2 + distScore*0.9 + lumScore*0.8;
        if(score > bestScore){ bestScore = score; best = {data:data, dir:v.clone(), dist:d}; }
      }
    }
  }
  return best;
}

function planRoute(origin, initialHeading, legCount){
  const visited = new Set();
  const legs = [];
  let from = origin.clone();
  let heading = initialHeading.clone().normalize();

  for(let i=0;i<legCount;i++){
    /* repli progressif : si aucune étoile n'est bien alignée, on accepte un
       virage plus marqué plutôt que d'interrompre la route */
    let next = findNextWaypoint(from, heading, visited, 0.35);
    if(!next) next = findNextWaypoint(from, heading, visited, 0.0);
    if(!next) next = findNextWaypoint(from, heading, visited, -0.6);
    if(!next) break;
    visited.add(next.data.cell);
    legs.push({
      name: next.data.name,
      designation: next.data.star.designation,
      position: next.data.position.clone(),
      starPosition: next.data.position.clone(),
      cell: next.data.cell,
      dist: next.dist,
      star: next.data.star
    });
    from = next.data.position.clone();
    /* le cap suivant part de l'étape atteinte, légèrement infléchi pour
       que la route serpente au lieu d'être une ligne droite */
    const jitter = rngFor(SEED+':route:'+i);
    heading = next.dir.clone();
    heading.x += (jitter()-0.5)*0.55;
    heading.y += (jitter()-0.5)*0.40;
    heading.z += (jitter()-0.5)*0.55;
    heading.normalize();
  }
  return legs;
}

/* ---------- matérialisation de la route : COURBE + portiques ----------
   La trajectoire est une spline de Catmull-Rom passant par l'origine puis
   par chaque étoile-étape. Choix volontaire face à une B-spline : une
   B-spline ne passe PAS par ses points de contrôle, or la route doit
   effectivement atteindre chaque étoile. Le paramétrage « centripète »
   évite les boucles et dépassements dans les virages serrés, défaut
   classique du Catmull-Rom uniforme.

   Les portiques sont ensuite échantillonnés le long de cette courbe, avec
   un repère propagé de proche en proche (transport parallèle) : reconstruire
   un repère à partir d'un « haut » fixe ferait brusquement pivoter les
   carrés quand la trajectoire passe près de la verticale. */
const GATE_SPACING = 320;      /* espacement le long de la courbe */
const GATE_HALF = 34;          /* demi-côté du carré */

function buildRouteCurve(legs, origin){
  const pts = [origin.clone()];
  legs.forEach(function(l){ pts.push(l.position.clone()); });
  if(pts.length < 3){
    /* Catmull-Rom exige au moins 3 points : on prolonge dans l'axe */
    const last = pts[pts.length-1], prev = pts[pts.length-2] || origin;
    pts.push(last.clone().add(last.clone().sub(prev)));
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  curve.arcLengthDivisions = 2000;
  return curve;
}

function buildRouteGates(curve){
  const totalLen = curve.getLength();
  const count = Math.max(2, Math.floor(totalLen/GATE_SPACING));

  const positions = [];
  const cols = [];
  const dists = [];
  const isCorner = [];
  /* vert pour le cadre (pointillé), ambre de la charte pour les deux
     coins soulignés — reprend le même vocabulaire que les coins des
     panneaux HUD (.panel::before/::after), juste transposé en 3D */
  const GREEN = new THREE.Color(0x3ddc84);
  const CORNER_COLOR = new THREE.Color(0xffb454);

  function pushSeg(a, b, color, cornerFlag){
    positions.push(a.x,a.y,a.z, b.x,b.y,b.z);
    const segLen = a.distanceTo(b);
    for(let n=0;n<2;n++){ cols.push(color.r,color.g,color.b); isCorner.push(cornerFlag); }
    dists.push(0, segLen);
  }

  /* transport parallèle du repère le long de la courbe */
  let up = new THREE.Vector3(0,1,0);
  const tan = new THREE.Vector3(), right = new THREE.Vector3(), realUp = new THREE.Vector3();
  const p = new THREE.Vector3();

  for(let i=0;i<=count;i++){
    const u = i/count;
    curve.getPointAt(u, p);
    curve.getTangentAt(u, tan).normalize();

    /* on projette le « haut » précédent hors de la tangente : le repère
       tourne le moins possible d'un portique au suivant */
    realUp.copy(up).addScaledVector(tan, -up.dot(tan));
    if(realUp.lengthSq() < 1e-6){
      realUp.set(0,0,1).addScaledVector(tan, -tan.z);
      if(realUp.lengthSq() < 1e-6) realUp.set(1,0,0);
    }
    realUp.normalize();
    right.crossVectors(tan, realUp).normalize();
    up.copy(realUp);

    const half = GATE_HALF;
    const corners = [
      [ half,  half], [ half, -half], [-half, -half], [-half,  half]
    ].map(function(c){
      return new THREE.Vector3().copy(p)
        .addScaledVector(right, c[0])
        .addScaledVector(realUp, c[1]);
    });

    /* cadre vert en pointillés */
    for(let k=0;k<4;k++){
      pushSeg(corners[k], corners[(k+1)%4], GREEN, 0);
    }

    /* deux angles opposés soulignés en ambre, en trait plein — un rappel
       discret des coins des panneaux d'interface */
    const bracket = GATE_HALF * 0.42;
    [0, 2].forEach(function(ci){
      const corner = corners[ci];
      const prev = corners[(ci+3)%4];
      const next = corners[(ci+1)%4];
      const toPrev = prev.clone().sub(corner).normalize().multiplyScalar(bracket);
      const toNext = next.clone().sub(corner).normalize().multiplyScalar(bracket);
      pushSeg(corner, corner.clone().add(toPrev), CORNER_COLOR, 1);
      pushSeg(corner, corner.clone().add(toNext), CORNER_COLOR, 1);
    });
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(cols), 3));
  geo.setAttribute('aDist', new THREE.BufferAttribute(new Float32Array(dists), 1));
  geo.setAttribute('aCorner', new THREE.BufferAttribute(new Float32Array(isCorner), 1));

  /* La luminosité est calculée PAR IMAGE dans le shader, à partir de la
     position du vaisseau : un portique proche est vif, il s'éteint
     progressivement à mesure qu'il s'éloigne en amont, et disparaît une
     fois dépassé. Faire cela sur le CPU imposerait de réécrire le tampon
     de couleurs à chaque image. Le pointillé du cadre vert est calculé de
     la même façon, à partir de la distance cumulée le long de chaque côté. */
  const mat = new THREE.ShaderMaterial({
    uniforms:{
      uShipPos:{value:new THREE.Vector3()},
      uShipFwd:{value:new THREE.Vector3(0,0,-1)},
      uNear:{value:250},
      uFar:{value:2600},
      uOpacity:{value:0.9}
    },
    vertexShader:`
      attribute vec3 aCol;
      attribute float aDist;
      attribute float aCorner;
      uniform vec3 uShipPos;
      uniform vec3 uShipFwd;
      uniform float uNear;
      uniform float uFar;
      varying vec3 vCol;
      varying float vFade;
      varying float vDist;
      varying float vCorner;
      void main(){
        vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
        vec3 rel = wp - uShipPos;
        float d = length(rel);
        /* décroissance avec la distance en amont */
        float fade = 1.0 - smoothstep(uNear, uFar, d);
        /* extinction de ce qui est derrière le vaisseau */
        float ahead = dot(normalize(rel + vec3(1e-5)), uShipFwd);
        fade *= smoothstep(-0.25, 0.25, ahead);
        vCol = aCol;
        vFade = fade;
        vDist = aDist;
        vCorner = aCorner;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
    `,
    fragmentShader:`
      precision highp float;
      uniform float uOpacity;
      varying vec3 vCol;
      varying float vFade;
      varying float vDist;
      varying float vCorner;
      void main(){
        if(vFade < 0.01) discard;
        /* le cadre (pas les coins ambre) est tracé en pointillés */
        if(vCorner < 0.5){
          float d = mod(vDist, 11.0);
          if(d > 5.5) discard;
        }
        gl_FragColor = vec4(vCol, vFade * uOpacity);
      }
    `,
    transparent:true,
    depthWrite:false,
    blending:THREE.AdditiveBlending,
    fog:false
  });

  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.renderOrder = 5;
  const group = new THREE.Group();
  group.add(lines);
  group.userData.material = mat;
  return group;
}


/* ---------- rendu du panneau de plan de vol ----------
   Appelé au calcul de la route puis à chaque franchissement d'étape : on
   ne reconstruit pas le DOM à chaque image. */
function refreshRoutePanel(){
  const list = document.getElementById('routeList');
  const prog = document.getElementById('routeProgress');
  if(!list) return;
  if(!ROUTE.legs.length){
    list.innerHTML = '<div class="route-leg todo"><span class="nm">'+t('noRoute')+'</span></div>';
    if(prog) prog.textContent = '';
    return;
  }
  prog.textContent = (ROUTE.index+1) + '/' + ROUTE.legs.length;

  /* fenêtre glissante : l'étape courante reste visible sans faire déborder
     le panneau quand la route est longue */
  const WINDOW = 7;
  let start = Math.max(0, Math.min(ROUTE.index-2, ROUTE.legs.length-WINDOW));
  const slice = ROUTE.legs.slice(start, start+WINDOW);

  list.innerHTML = slice.map(function(leg, i){
    const idx = start+i;
    const cls = idx < ROUTE.index ? 'done' : (idx === ROUTE.index ? 'next' : 'todo');
    /* la destination affichée est le PORT SPATIAL réellement ciblé — le
       nom de l'étoile passe en second, comme repère de navigation */
    const dest = leg.portName || leg.name;
    const sub = leg.portName ? (leg.name+' · '+leg.designation) : leg.designation;
    return '<div class="route-leg '+cls+'">' +
             '<span class="num">'+String(idx+1).padStart(2,'0')+'</span>' +
             '<span class="nm">'+dest+'</span>' +
             '<span class="dd">'+sub+'</span>' +
           '</div>';
  }).join('');
}

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

