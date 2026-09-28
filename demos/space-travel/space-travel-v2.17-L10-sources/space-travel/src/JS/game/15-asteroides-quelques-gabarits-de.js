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