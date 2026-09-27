/* =========================================================================
   3. SCÈNE THREE.JS
   ========================================================================= */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0b1220, 0.00026);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth/window.innerHeight, 0.1, 6000);

window.addEventListener('resize', function(){
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  if(typeof repositionAllPanels === 'function') repositionAllPanels();
});

/* lumière d'appoint très faible : l'espace n'a pas d'éclairage ambiant réel,
   mais un minimum reste nécessaire pour que la coque ne soit pas un aplat noir */
scene.add(new THREE.AmbientLight(0x141c2e, 0.55));

/* ---------- éclairage du vaisseau par l'étoile la plus proche ----------
   Une unique lumière directionnelle joue le rôle de « soleil local ». Sa
   direction, sa couleur et son intensité convergent en douceur vers celles
   de l'étoile dominante, de sorte que passer d'une étoile à l'autre se
   traduit par un fondu progressif et non par un saut brutal. */
const starLight = new THREE.DirectionalLight(0xdfe8ff, 1.0);
starLight.position.set(4,6,3);
scene.add(starLight);

const lightState = {
  dir: new THREE.Vector3(0.5,0.8,0.4).normalize(),
  color: new THREE.Color(0xdfe8ff),
  intensity: 0.8
};
const _lightTmpDir = new THREE.Vector3();
const _lightTmpCol = new THREE.Color();

function updateStarLighting(dt){
  if(REAL.active && REAL.started) return;   /* L2.2 : soleil de l'étoile hôte, cf. REAL.update */
  let best = null, bestScore = -Infinity, bestDist = 0;
  starField.forEach(function(obj){
    if(!obj) return;
    const d = Math.max(obj.mesh.position.distanceTo(shipRig.position), 1);
    /* « étoile dominante » = celle dont le flux reçu est le plus fort :
       c'est bien la loi en carré inverse qui départage, pas la seule distance */
    const flux = obj.star.lum/(d*d);
    if(flux > bestScore){ bestScore = flux; best = obj; bestDist = d; }
  });

  if(best){
    _lightTmpDir.copy(best.mesh.position).sub(shipRig.position).normalize();
    _lightTmpCol.setRGB(best.star.color.r, best.star.color.g, best.star.color.b);
    /* éclairement reçu, compressé pour rester dans une plage exploitable */
    const illum = THREE.MathUtils.clamp(
      Math.pow(best.star.lum/(bestDist*bestDist) * 9000, 0.32), 0.12, 2.4
    );
    /* convergence exponentielle : ~1.1 s de fondu, indépendante du framerate */
    const k = 1 - Math.exp(-dt*0.9);
    lightState.dir.lerp(_lightTmpDir, k).normalize();
    lightState.color.lerp(_lightTmpCol, k);
    lightState.intensity += (illum - lightState.intensity)*k;
  } else {
    const k = 1 - Math.exp(-dt*0.9);
    lightState.intensity += (0.15 - lightState.intensity)*k;
  }

  starLight.position.copy(shipRig.position).addScaledVector(lightState.dir, 100);
  starLight.target.position.copy(shipRig.position);
  starLight.target.updateMatrixWorld();
  starLight.color.copy(lightState.color);
  starLight.intensity = lightState.intensity;
}
scene.add(starLight.target);

/* ---------- texture de lueur générée en canvas (pas d'asset externe) ---------- */
function makeGlowTexture(){
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,'rgba(255,255,255,1)');
  g.addColorStop(0.35,'rgba(255,255,255,0.55)');
  g.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0,0,128,128);
  return new THREE.CanvasTexture(c);
}
const glowTex = makeGlowTexture();

/* ---------- texture de bruit fBm à 4 canaux indépendants ----------
   Repris du principe de nebula.frag : le bruit est PRÉ-CALCULÉ dans une
   texture plutôt que recalculé par fragment. Une seule lecture de texture
   remplace une fBm procédurale — c'est ce qui permet d'afficher des
   centaines de bouffées de gaz sans effondrer le framerate.
   Les 4 canaux R/G/B/A portent 4 champs de bruit décorrélés : chaque
   bouffée en choisit un, ce qui évite toute répétition visible. */
function makeNoiseTexture(size){
  const rng = rngFor(SEED+':noise');
  const N = size || 256;

  /* bruit de valeur sur grille, interpolé en douceur */
  function valueNoiseGrid(res){
    const g = new Float32Array(res*res);
    for(let i=0;i<res*res;i++) g[i] = rng();
    return g;
  }
  function sampleGrid(g, res, x, y){
    /* coordonnées enroulées => texture raccordable sans couture */
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x-xi, yf = y-yi;
    const sx = xf*xf*(3-2*xf), sy = yf*yf*(3-2*yf);
    const i0 = ((xi%res)+res)%res, i1 = (i0+1)%res;
    const j0 = ((yi%res)+res)%res, j1 = (j0+1)%res;
    const a = g[j0*res+i0], b = g[j0*res+i1];
    const c = g[j1*res+i0], d = g[j1*res+i1];
    return (a+(b-a)*sx) + ((c+(d-c)*sx) - (a+(b-a)*sx))*sy;
  }
  function fbmChannel(){
    const octaves = [8, 16, 32, 64];
    const grids = octaves.map(function(r){ return {res:r, g:valueNoiseGrid(r)}; });
    const out = new Float32Array(N*N);
    let min = Infinity, max = -Infinity;
    for(let y=0;y<N;y++){
      for(let x=0;x<N;x++){
        let v = 0, amp = 0.5;
        for(const o of grids){
          v += amp * sampleGrid(o.g, o.res, x/N*o.res, y/N*o.res);
          amp *= 0.5;
        }
        out[y*N+x] = v;
        if(v<min) min=v; if(v>max) max=v;
      }
    }
    /* normalisation sur 0..1 pour exploiter toute la dynamique */
    const span = Math.max(max-min, 1e-6);
    for(let i=0;i<out.length;i++) out[i] = (out[i]-min)/span;
    return out;
  }

  const chans = [fbmChannel(), fbmChannel(), fbmChannel(), fbmChannel()];
  const data = new Uint8Array(N*N*4);
  for(let i=0;i<N*N;i++){
    data[i*4]   = chans[0][i]*255;
    data[i*4+1] = chans[1][i]*255;
    data[i*4+2] = chans[2][i]*255;
    data[i*4+3] = chans[3][i]*255;
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipMapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
const noiseTex = makeNoiseTexture(256);
