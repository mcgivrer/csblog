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
  /* v2.16 : ressources partagées (roches, aurores) détachées, définitions des planètes libérées */
  window.__AST.detachShared(grp); window.__PLANETS.release(grp);
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
  if(REAL.active) return;   /* L2.2 : le système visité est construit en mètres par REAL.enterSystem */
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
      LAYERS.sysWorld.add(grp);
      enhanceSystem(ROUTE.legs[i], grp);   /* v2.16 : surfaces, nuages, atmosphère, aurores, roches (§31) */
      ROUTE.builtSystems.set(i, grp);
    }
  });
  ROUTE.builtSystems.forEach(function(grp, i){
    if(!keep.has(i)){
      LAYERS.detach(grp);
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
