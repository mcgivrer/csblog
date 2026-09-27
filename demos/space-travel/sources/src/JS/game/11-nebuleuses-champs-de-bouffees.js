/* =========================================================================
   6. NÉBULEUSES — CHAMPS DE BOUFFÉES DE GAZ INSTANCIÉES
   Approche reprise de nebula.vert / nebula.frag (demo001-arm64) : au lieu
   d'un unique volume raymarché, une nébuleuse est un AMAS de dizaines de
   « bouffées » (puffs) — des quads billboardés, chacun portant une couleur
   de cœur et une couleur de bord, et échantillonnant un champ de bruit
   pré-calculé. Le coût par fragment tombe d'une quarantaine d'itérations
   de fBm à UNE lecture de texture, ce qui permet d'en afficher beaucoup
   plus — d'où un fond d'espace réellement décoré.
   Points clés du shader de référence conservés :
     · atténuation radiale au CARRÉ (a = alpha·t²) → bords vaporeux
     · dégradé cœur→bord via mix(colIn, colOut, d²)
     · alpha PRÉ-MULTIPLIÉ, mélange (ONE, ONE_MINUS_SRC_ALPHA)
     · sélecteur de canal R/G/B/A pour 4 champs de bruit décorrélés
   ========================================================================= */
const NEBULA_VERT = `
  attribute vec3  iPos;      // position de la bouffée (espace local de l'amas)
  attribute float iSize;     // rayon monde
  attribute float iAlpha;    // opacité de base
  attribute vec3  iColIn;    // couleur de cœur
  attribute vec3  iColOut;   // couleur de bord
  attribute vec4  iNoise;    // xy = décalage uv, z = échelle uv, w = canal

  uniform float uTime;
  uniform float uFade;       // fondu global de l'amas

  varying vec2  vCorner;
  varying vec3  vColIn;
  varying vec3  vColOut;
  varying float vAlpha;
  varying vec2  vNoiseUv;
  varying vec4  vMask;

  void main(){
    /* l'attribut position porte le coin du quad unitaire (-1..1) : Three.js
       le déclare déjà et exige sa présence pour émettre l'appel de rendu */
    vec2 corner = position.xy;

    /* dérive lente et respiration : le gaz n'est jamais tout à fait figé */
    float ph = iNoise.x * 6.2831853;
    vec3 drift = vec3(
      sin(uTime*0.05 + ph),
      cos(uTime*0.04 + ph*1.7),
      sin(uTime*0.035 + ph*2.3)
    ) * iSize * 0.10;
    float breathe = 1.0 + 0.10*sin(uTime*0.07 + ph*3.1);

    /* billboard : on décale dans le plan de la caméra (espace vue) */
    vec4 mv = modelViewMatrix * vec4(iPos + drift, 1.0);
    mv.xy += corner * iSize * breathe;
    gl_Position = projectionMatrix * mv;

    vCorner  = corner;
    vColIn   = iColIn;
    vColOut  = iColOut;
    vAlpha   = iAlpha * uFade;
    /* uv calculée ici pour que le fragment ne fasse qu'UNE lecture */
    vNoiseUv = iNoise.xy + (corner*0.5 + 0.5) * iNoise.z;
    /* sélecteur de canal : un des 4 champs de bruit indépendants */
    vMask = vec4(
      float(iNoise.w < 0.5),
      float(iNoise.w >= 0.5 && iNoise.w < 1.5),
      float(iNoise.w >= 1.5 && iNoise.w < 2.5),
      float(iNoise.w >= 2.5)
    );
  }
`;
const NEBULA_FRAG = `
  precision highp float;

  varying vec2  vCorner;
  varying vec3  vColIn;
  varying vec3  vColOut;
  varying float vAlpha;
  varying vec2  vNoiseUv;
  varying vec4  vMask;

  uniform sampler2D uNoise;

  void main(){
    float d2 = dot(vCorner, vCorner);
    if(d2 > 1.0) discard;

    float falloff = 1.0 - d2;                        // 1 au centre, 0 au bord
    float n = dot(texture2D(uNoise, vNoiseUv), vMask);
    float t = falloff * (0.35 + 0.75*n);
    float a = vAlpha * t * t;                        // courbe au carré : bords vaporeux
    if(a < 0.002) discard;

    vec3 tint = mix(vColIn, vColOut, d2);
    gl_FragColor = vec4(tint * a, a);                // alpha PRÉ-MULTIPLIÉ
  }
`;

/* géométrie de base partagée : un quad unitaire (2 triangles), instancié par
   bouffée. Nommé `position` car Three.js abandonne le rendu d'une géométrie
   dépourvue de cet attribut. */
const PUFF_CORNERS = new Float32Array([
  -1,-1,0,  1,-1,0,  1,1,0,
  -1,-1,0,  1,1,0,  -1,1,0
]);

/* Construit un amas de bouffées formant une nébuleuse.
   La forme est un ellipsoïde aplati aléatoirement, avec des bouffées plus
   grosses et plus opaques au cœur, plus fines et diffuses en périphérie. */
function buildNebulaCluster(typeDef, rng, opts){
  opts = opts || {};
  const puffCount = opts.puffCount || (55 + Math.floor(rng()*55));
  const radius = opts.radius || (420 + rng()*380);

  const iPos    = new Float32Array(puffCount*3);
  const iSize   = new Float32Array(puffCount);
  const iAlpha  = new Float32Array(puffCount);
  const iColIn  = new Float32Array(puffCount*3);
  const iColOut = new Float32Array(puffCount*3);
  const iNoise  = new Float32Array(puffCount*4);

  /* axes de l'ellipsoïde : les nébuleuses réelles sont rarement sphériques */
  const ax = 0.6 + rng()*0.9, ay = 0.45 + rng()*0.8, az = 0.6 + rng()*0.9;
  const colIn  = new THREE.Color(typeDef.colorA);
  const colOut = new THREE.Color(typeDef.colorB);
  const cTmp = new THREE.Color();

  for(let i=0;i<puffCount;i++){
    /* distribution vers le centre (racine cubique biaisée) : cœur dense */
    const u = Math.pow(rng(), 0.62);
    const theta = rng()*Math.PI*2;
    const phi = Math.acos(2*rng()-1);
    const r = u*radius;
    iPos[i*3]   = r*Math.sin(phi)*Math.cos(theta)*ax;
    iPos[i*3+1] = r*Math.sin(phi)*Math.sin(theta)*ay;
    iPos[i*3+2] = r*Math.cos(phi)*az;

    /* les bouffées du cœur sont plus grosses et plus denses */
    const coreness = 1.0 - u;
    iSize[i]  = radius * (0.28 + rng()*0.42) * (0.55 + coreness*0.75);
    iAlpha[i] = (0.10 + rng()*0.16) * (0.4 + coreness*0.9);

    /* variation chromatique par bouffée autour des 2 teintes du type */
    cTmp.copy(colIn).lerp(colOut, rng()*0.45);
    cTmp.offsetHSL((rng()-0.5)*0.05, (rng()-0.5)*0.15, (rng()-0.5)*0.12);
    iColIn[i*3] = cTmp.r; iColIn[i*3+1] = cTmp.g; iColIn[i*3+2] = cTmp.b;
    cTmp.copy(colOut).offsetHSL((rng()-0.5)*0.06, 0, (rng()-0.5)*0.10);
    iColOut[i*3] = cTmp.r; iColOut[i*3+1] = cTmp.g; iColOut[i*3+2] = cTmp.b;

    /* fenêtre de bruit : décalage + échelle + canal */
    iNoise[i*4]   = rng();
    iNoise[i*4+1] = rng();
    iNoise[i*4+2] = 0.35 + rng()*0.75;
    iNoise[i*4+3] = Math.floor(rng()*4);
  }

  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(PUFF_CORNERS, 3));
  geo.setAttribute('iPos',    new THREE.InstancedBufferAttribute(iPos, 3));
  geo.setAttribute('iSize',   new THREE.InstancedBufferAttribute(iSize, 1));
  geo.setAttribute('iAlpha',  new THREE.InstancedBufferAttribute(iAlpha, 1));
  geo.setAttribute('iColIn',  new THREE.InstancedBufferAttribute(iColIn, 3));
  geo.setAttribute('iColOut', new THREE.InstancedBufferAttribute(iColOut, 3));
  geo.setAttribute('iNoise',  new THREE.InstancedBufferAttribute(iNoise, 4));
  geo.instanceCount = puffCount;
  /* borne explicite : évite tout calcul de sphère englobante sur un quad
     unitaire qui ne reflète pas l'étendue réelle de l'amas */
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0,0,0), radius*2.2);

  const mat = new THREE.ShaderMaterial({
    vertexShader: NEBULA_VERT,
    fragmentShader: NEBULA_FRAG,
    uniforms:{
      uNoise:{value: noiseTex},
      uTime:{value: 0},
      uFade:{value: opts.fade!==undefined ? opts.fade : 1.0}
    },
    transparent:true,
    depthWrite:false,
    depthTest: opts.depthTest!==undefined ? opts.depthTest : true,
    /* alpha pré-multiplié, exactement comme le shader de référence */
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendEquation: THREE.AddEquation
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = opts.renderOrder || 0;
  return mesh;
}

/* ---------- nébuleuses de fond lointain ----------
   Rattachées au groupe `backdrop`, qui suit le vaisseau : elles décorent
   l'arrière-plan en permanence, quelle que soit la distance parcourue.
   Rendues AVANT les étoiles (renderOrder négatif) et sans écriture de
   profondeur, pour former une toile de fond que le champ stellaire vient
   ponctuer. */
(function buildBackdropNebulae(){
  const rng = rngFor(SEED+':backdrop-neb');
  const COUNT = 9;
  for(let i=0;i<COUNT;i++){
    const type = NEBULA_TYPES[Math.floor(rng()*NEBULA_TYPES.length)];
    const neb = buildNebulaCluster(type, rng, {
      radius: 900 + rng()*1100,
      puffCount: 45 + Math.floor(rng()*45),
      fade: 0.30 + rng()*0.30,     /* discrètes : elles habillent sans écraser */
      depthTest: false,
      renderOrder: -10
    });
    /* réparties sur une sphère lointaine autour du vaisseau */
    const r = 3000 + rng()*1400;
    const theta = rng()*Math.PI*2;
    const phi = Math.acos(2*rng()-1);
    neb.position.set(
      r*Math.sin(phi)*Math.cos(theta),
      r*Math.sin(phi)*Math.sin(theta),
      r*Math.cos(phi)
    );
    backdrop.add(neb);
  }
})();
