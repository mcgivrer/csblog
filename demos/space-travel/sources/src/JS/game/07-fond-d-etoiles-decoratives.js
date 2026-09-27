/* =========================================================================
   4. FOND D'ÉTOILES DÉCORATIVES — plusieurs couches, recentrées sur le
      vaisseau à chaque image pour rester "infinies" et toujours denses
   ========================================================================= */
const backdrop = new THREE.Group();
scene.add(backdrop);
window.__backdrop = backdrop;

/* Les étoiles de fond suivent la même population que les étoiles nommées :
   couleur de corps noir issue de leur température, taille du point pilotée
   par la magnitude apparente (loi en carré inverse) — d'où un ciel très
   majoritairement composé de points rouges/orangés faibles, ponctué de
   rares étoiles blanc-bleu éclatantes, comme le ciel réel.

   Optimisation : générer intégralement 200 000+ étoiles coûterait près
   d'une seconde de blocage au démarrage. On tire donc UN ÉCHANTILLON de la
   population (quelques milliers d'étoiles complètes), puis chaque point du
   fond pioche dedans. La distribution statistique reste rigoureusement
   celle du modèle — seule la diversité des valeurs exactes est finie, ce
   qui est invisible sur des points de quelques pixels. */
const STAR_SAMPLE = (function(){
  const rng = rngFor(SEED+':starsample');
  const N = 3000;
  const sample = new Array(N);
  for(let i=0;i<N;i++){
    const s = generateStar(rng);
    sample[i] = {r:s.color.r, g:s.color.g, b:s.color.b, lum:s.lum};
  }
  return sample;
})();

function buildStarLayer(tag, count, rMin, rMax, sizeScale, opts){
  opts = opts || {};
  const rng = rngFor(SEED+':'+tag);
  const positions = new Float32Array(count*3);
  const colors = new Float32Array(count*3);
  const sizes = new Float32Array(count);
  for(let i=0;i<count;i++){
    const r = rMin + rng()*(rMax-rMin);
    const theta = rng()*Math.PI*2;
    const phi = Math.acos(2*rng()-1);
    positions[i*3]   = r*Math.sin(phi)*Math.cos(theta);
    positions[i*3+1] = r*Math.sin(phi)*Math.sin(theta);
    positions[i*3+2] = r*Math.cos(phi);

    const star = STAR_SAMPLE[(rng()*STAR_SAMPLE.length)|0];
    colors[i*3] = star.r; colors[i*3+1] = star.g; colors[i*3+2] = star.b;

    /* magnitude apparente → taille perçue. L'échelle des magnitudes est
       logarithmique : 5 magnitudes = facteur 100 en flux. */
    const distPc = r / 38;
    const mag = apparentMagnitude(star.lum, distPc);
    const brightness = Math.pow(10, -0.4*(mag - 6.0));  // normalisé sur mag 6 (limite œil nu)
    sizes[i] = sizeScale * THREE.MathUtils.clamp(Math.pow(brightness, 0.22), 0.35, 4.5);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions,3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors,3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes,1));

  const mat = new THREE.ShaderMaterial({
    uniforms:{
      map:{value:glowTex},
      uOpacity:{value: opts.opacity!==undefined?opts.opacity:1},
      /* Échelle de taille à l'écran, réglée PAR COUCHE.
         L'ancienne constante unique (300) donnait, aux distances réelles de
         ces couches (700 à 3300 unités), des points de 0,05 à 0,25 pixel :
         très en dessous du pixel. Le pilote les ramenait tous de force à 1 px,
         ce qui échantillonnait la texture de halo au hasard (d'où leur
         faiblesse) et, surtout, écrasait TOUTE la variation de luminosité —
         même les étoiles les plus brillantes restaient sous le pixel, donc
         indiscernables des plus faibles. */
      uPxScale:{value: opts.pxScale!==undefined?opts.pxScale:6000}
    },
    vertexShader:`
      attribute float aSize;
      uniform float uPxScale;
      varying vec3 vColor;
      void main(){
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        /* plancher à 1 px : en dessous, le halo n'est plus échantillonné
           correctement et l'étoile disparaît au lieu de s'atténuer */
        gl_PointSize = max(aSize * (uPxScale / max(-mv.z, 1.0)), 1.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader:`
      precision highp float;
      uniform sampler2D map;
      uniform float uOpacity;
      varying vec3 vColor;
      void main(){
        vec4 t = texture2D(map, gl_PointCoord);
        gl_FragColor = vec4(vColor * t.a, t.a * uOpacity);
      }
    `,
    transparent:true,
    depthWrite:false,
    vertexColors:true,
    blending:THREE.AdditiveBlending,
    fog:false
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  /* garantit ce fond TOUJOURS derrière le reste (demande utilisateur) —
     un ordre de rendu très bas plutôt que de ne compter que sur le tri
     par profondeur des objets transparents (fiable en temps normal, mais
     un filet de sécurité explicite coûte rien et couvre aussi le cas où
     la caméra cinématique de l'écran-titre s'approche par inadvertance
     de ce fond, cf. correctif backdrop.position dans animate()). */
  points.renderOrder = -1000;
  backdrop.add(points);
  return points;
}

/* couche lointaine très dense, étoiles faibles (le gros du ciel réel) */
buildStarLayer('skybox', 95000, 2400, 4200, 1.45, {opacity:0.70, pxScale:6500});
/* seconde couche lointaine décalée : renforce la granularité du fond */
buildStarLayer('skybox2', 70000, 1900, 3600, 1.20, {opacity:0.62, pxScale:6500});
/* troisième couche : comble les vides, donne l'impression de voie lactée */
buildStarLayer('skybox3', 52000, 1500, 3100, 1.00, {opacity:0.55, pxScale:6200});
/* couche intermédiaire — donne de la profondeur en volant */
buildStarLayer('dust', 58000, 700, 2300, 1.10, {opacity:0.62, pxScale:3800});
/* couche proche supplémentaire : parallaxe marquée au passage */
buildStarLayer('dust2', 24000, 380, 1100, 0.95, {opacity:0.55, pxScale:2100});
/* étoiles décoratives proches, statistiquement les plus brillantes du champ */
buildStarLayer('accent', 900, 500, 2600, 3.0, {opacity:0.95, pxScale:3600});
