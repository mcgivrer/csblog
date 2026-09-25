/* =========================================================================
   7. CHAMPS PROCÉDURAUX — étoiles et nébuleuses en cellules déterministes
      (même seed + mêmes coordonnées de cellule => même contenu, toujours)
   ========================================================================= */
const STAR_CELL = 190, STAR_RADIUS = 3;       // 7x7x7 cellules suivies — champ dense
const NEBULA_CELL = 1600, NEBULA_RADIUS = 1;  // 3x3x3 cellules suivies (coût GPU maîtrisé)
const STAR_PROXIMITY_RANGE = STAR_CELL * STAR_RADIUS; // distance à partir de laquelle une étoile grossit/brille

const starField = new Map();
const nebulaField = new Map();

/* --- Données d'une cellule stellaire, SANS créer de géométrie.
   Cette fonction est l'unique source de vérité : le rendu comme le
   planificateur de route l'utilisent. Les faire tirer chacun dans le PRNG
   de leur côté ferait diverger les deux séquences, et la route viserait
   des étoiles qui ne sont pas là où on les dessine. --- */
const _starDataCache = new Map();
function starDataForCell(ix,iy,iz){
  const key = ix+','+iy+','+iz;
  if(_starDataCache.has(key)) return _starDataCache.get(key);

  const rng = rngFor(SEED+':star:'+ix+':'+iy+':'+iz);
  let data = null;
  if(rng() <= 0.5){
    const ox = (rng()-0.5)*STAR_CELL*0.85;
    const oy = (rng()-0.5)*STAR_CELL*0.85;
    const oz = (rng()-0.5)*STAR_CELL*0.85;
    const star = generateStar(rng);
    const name = generateName(rng);
    const seedNoise = rng()*100;
    data = {
      position: new THREE.Vector3(ix*STAR_CELL+ox, iy*STAR_CELL+oy, iz*STAR_CELL+oz),
      star: star, name: name, seedNoise: seedNoise, cell: key
    };
  }
  /* le cache évite de rejouer le PRNG à chaque interrogation du planificateur */
  if(_starDataCache.size > 20000) _starDataCache.clear();
  _starDataCache.set(key, data);
  return data;
}

function buildStarCell(ix,iy,iz){
  const data = starDataForCell(ix,iy,iz);
  if(!data) return null;
  const star = data.star, name = data.name, seedNoise = data.seedNoise;

  const group = new THREE.Group();
  group.position.copy(data.position);

  /* Échelle de rendu : les rayons stellaires réels sont ~10⁻⁸ fois les
     distances interstellaires — impossibles à rendre à l'échelle. On
     compresse donc logarithmiquement le rayon physique, ce qui conserve
     l'ORDRE et les rapports perçus (une supergéante reste écrasante face à
     une naine M) tout en restant visible à l'écran. */
  const baseCore = 1.4 * Math.pow(star.radius, 0.42);
  const color = new THREE.Color(star.color.r, star.color.g, star.color.b);

  const coreMat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    uniforms:{
      baseColor:{value: color},
      limbU:{value: 0.45 + 0.3*Math.exp(-star.temp/9000)}, /* les étoiles froides s'assombrissent plus au bord */
      time:{value:0},
      granulation:{value: star.temp < 7000 ? 1.0 : 0.25},   /* convection de surface : marquée chez les froides */
      seed:{value: seedNoise}
    }
  });
  const core = new THREE.Mesh(new THREE.SphereGeometry(baseCore, 24, 24), coreMat);
  group.add(core);

  /* halo : la couronne/diffusion. Sa taille suit la racine de la luminosité
     (rapport flux/surface), sa teinte reste celle du corps noir. */
  const baseHalo = baseCore * (3.0 + 1.6*Math.log10(1 + star.lum));
  const haloMat = new THREE.SpriteMaterial({map:glowTex, color:color, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending});
  const halo = new THREE.Sprite(haloMat);
  halo.scale.setScalar(baseHalo);
  group.add(halo);

  scene.add(group);
  const label = createStarLabel(name);
  return {
    mesh:group, core:core, halo:halo, baseCore:baseCore, baseHalo:baseHalo,
    name:name, star:star, type:star.designation, label:label,
    dispose:function(){ label.remove(); }
  };
}
function buildNebulaCell(ix,iy,iz){
  const rng = rngFor(SEED+':nebula:'+ix+':'+iy+':'+iz);
  if(rng() > 0.42) return null;   /* bien plus fréquentes qu'avant : le fond doit être habité */
  const offset = new THREE.Vector3(
    (rng()-0.5)*NEBULA_CELL*0.7,
    (rng()-0.5)*NEBULA_CELL*0.7,
    (rng()-0.5)*NEBULA_CELL*0.7
  );
  const typeIdx = Math.floor(rng()*NEBULA_TYPES.length);
  const type = NEBULA_TYPES[typeIdx];
  const name = generateName(rng);

  const worldCenter = new THREE.Vector3(ix*NEBULA_CELL + offset.x, iy*NEBULA_CELL + offset.y, iz*NEBULA_CELL + offset.z);
  const mesh = buildNebulaCluster(type, rng, {
    radius: 420 + rng()*480,
    puffCount: 55 + Math.floor(rng()*60),
    fade: 0   /* apparition progressive : on démarre invisible, cf. animate() */
  });
  mesh.position.copy(worldCenter);
  mesh.userData.targetFade = 1.0;
  mesh.userData.currentFade = 0;
  scene.add(mesh);
  return {mesh:mesh, name:name, type:type.name, typeIdx:typeIdx, isNebula:true};
}

function refreshField(cellSize, radius, map, buildFn){
  const p = shipRig.position;
  const cx = Math.round(p.x/cellSize), cy = Math.round(p.y/cellSize), cz = Math.round(p.z/cellSize);
  const active = new Set();
  for(let dx=-radius; dx<=radius; dx++){
    for(let dy=-radius; dy<=radius; dy++){
      for(let dz=-radius; dz<=radius; dz++){
        const ix=cx+dx, iy=cy+dy, iz=cz+dz;
        const key = ix+','+iy+','+iz;
        active.add(key);
        if(!map.has(key)){
          map.set(key, buildFn(ix,iy,iz));
        }
      }
    }
  }
  map.forEach(function(obj, key){
    if(!active.has(key)){
      if(obj && obj.mesh) scene.remove(obj.mesh);
      if(obj && obj.dispose) obj.dispose();
      map.delete(key);
    }
  });
}

