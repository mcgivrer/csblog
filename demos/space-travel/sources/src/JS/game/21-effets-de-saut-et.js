/* =========================================================================
   7quinquies. EFFETS DE SAUT ET DE SUPRALUMINIQUE (v2.16)
   Repris de la démo « Observation des étoiles » (v4) :
   - quadrillage d'espace-temps sous le vaisseau pendant le saut quantique :
     le puits se creuse et s'enroule, le vaisseau y glisse ; à l'arrivée, un
     nouveau puits se referme en ondulant ;
   - traînées d'étoiles en 3D pendant la croisière supraluminique (elles
     remplacent les traits en surimpression, gardés pour le boost).
   La passe de lentille que la démo ajoute aussi en croisière n'est pas
   reprise : elle coûterait une passe plein écran pendant toute la croisière.
   ========================================================================= */
function buildWellGrid(){
  const N = 46, M = 96, pos = [];
  for(let i=0;i<=N;i++){
    const c = -1 + 2*i/N;
    for(let j=0;j<M;j++){
      const a = -1 + 2*j/M, b = -1 + 2*(j+1)/M;
      pos.push(c,0,a, c,0,b);   // lignes parallèles à Z
      pos.push(a,0,c, b,0,c);   // lignes parallèles à X
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uDepth:{value:0}, uSigma:{value:.16}, uTwist:{value:0}, uRip:{value:0}, uRipAmp:{value:0}, uOpacity:{value:0}, uTime:{value:0},
      uColA:{value:new THREE.Color(0x3f86c0)}, uColB:{value:new THREE.Color(0xc2a8ff)}, uColC:{value:new THREE.Color(0x5eead4)} },
    vertexShader: `
      uniform float uDepth; uniform float uSigma; uniform float uTwist; uniform float uRip; uniform float uRipAmp; uniform float uTime;
      varying float vFade; varying float vDeep; varying float vWave;
      void main(){
        vec2 p = position.xz;
        float r = length(p);
        /* torsion : le tissu s'enroule autour du puits */
        float ang = uTwist * exp(-r/(uSigma*2.2));
        float c = cos(ang), s = sin(ang);
        p = vec2(c*p.x - s*p.y, s*p.x + c*p.y);
        /* puits : profil lorentzien (entonnoir de type gravitationnel) */
        float well = uDepth / (1.0 + (r*r)/(uSigma*uSigma));
        /* onde de choc qui se propage après l'éclair */
        float dr = r - uRip;
        float wave = uRipAmp * sin(dr*34.0) * exp(-dr*dr*26.0);
        /* légère respiration du tissu */
        float breath = 0.004 * sin(r*18.0 - uTime*3.0) * step(0.001, uDepth);
        float y = -well + wave + breath;
        vDeep = uDepth > 0.001 ? clamp(well/uDepth, 0.0, 1.0) : 0.0;
        vWave = uRipAmp > 0.0001 ? clamp(abs(wave)/uRipAmp, 0.0, 1.0) : 0.0;
        vFade = 1.0 - smoothstep(0.52, 1.0, r);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p.x, y, p.y, 1.0);
      }`,
    fragmentShader: `
      precision highp float;
      uniform float uOpacity; uniform vec3 uColA; uniform vec3 uColB; uniform vec3 uColC;
      varying float vFade; varying float vDeep; varying float vWave;
      void main(){
        vec3 col = mix(uColA, uColB, clamp(vDeep*1.25, 0.0, 1.0));
        col = mix(col, uColC, vWave*0.7);
        float a = uOpacity * vFade * (0.38 + 0.9*vDeep + 0.6*vWave);
        gl_FragColor = vec4(col * a, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  const mesh = new THREE.LineSegments(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 9; mesh.visible = false;
  LAYERS.shipWorld.add(mesh);
  return mesh;
}
function buildWarpStreaks(){
  const N = 900, pos = new Float32Array(N*2*3), base = new Float32Array(N*2*3), seg = new Float32Array(N*2), col = new Float32Array(N*2*3);
  for(let i=0;i<N;i++){
    const ax = Math.random(), rad = 12 + Math.pow(Math.random(), .6)*520, ang = Math.random()*Math.PI*2, hue = Math.random();
    for(let k=0;k<2;k++){ base.set([ax, rad, ang], (i*2+k)*3); seg[i*2+k] = k;
      col.set(hue < .2 ? [1, .82, .7] : (hue < .6 ? [.72, .84, 1] : [.9, .94, 1]), (i*2+k)*3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aBase', new THREE.BufferAttribute(base, 3));
  g.setAttribute('aSeg', new THREE.BufferAttribute(seg, 1)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  const m = new THREE.ShaderMaterial({
    uniforms: { uCenter:{value:new THREE.Vector3()}, uDir:{value:new THREE.Vector3(0,0,1)}, uU:{value:new THREE.Vector3(1,0,0)}, uW:{value:new THREE.Vector3(0,1,0)}, uOff:{value:0}, uLen:{value:1}, uAlpha:{value:0}, uSpan:{value:1400} },
    vertexShader: `
      attribute vec3 aBase; attribute float aSeg; attribute vec3 aCol;
      uniform vec3 uCenter; uniform vec3 uDir; uniform vec3 uU; uniform vec3 uW; uniform float uOff; uniform float uLen; uniform float uSpan;
      varying vec3 vCol; varying float vA;
      void main(){
        float ax = mod(aBase.x*uSpan - uOff, uSpan) - uSpan*0.5;          /* position le long de l'axe, bouclée */
        vec3 p = uCenter + uDir*(ax + aSeg*uLen) + (uU*cos(aBase.z) + uW*sin(aBase.z))*aBase.y;
        vCol = aCol; vA = (1.0 - smoothstep(0.32, 0.5, abs(ax)/uSpan)) * mix(1.0, 0.25, aSeg);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `precision highp float; uniform float uAlpha; varying vec3 vCol; varying float vA; void main(){ float a = uAlpha*vA; gl_FragColor = vec4(vCol*a, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  const mesh = new THREE.LineSegments(g, m); mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 8; LAYERS.shipWorld.add(mesh);
  return mesh;
}
let JUMP_GRID = null, WARP_STREAKS = null, WARP_STREAK_OFF = 0;
const _jgUp = new THREE.Vector3(), _wsFwd = new THREE.Vector3(), _wsU = new THREE.Vector3(), _wsY = new THREE.Vector3(0, 1, 0);
/* quadrillage placé sous le vaisseau (à 0,55 longueur), étendu à 6,5 longueurs */
function setJumpGrid(depth, twist, op, rip, ripA, time){
  if(!JUMP_GRID) JUMP_GRID = buildWellGrid();
  const g = JUMP_GRID, u = g.material.uniforms;
  _jgUp.set(0, 1, 0).applyQuaternion(shipRig.quaternion);
  g.position.copy(shipRig.position).addScaledVector(_jgUp, -SHIP_GAME_LEN*0.55);
  g.quaternion.copy(shipRig.quaternion); g.scale.setScalar(SHIP_GAME_LEN*6.5);
  u.uDepth.value = depth; u.uTwist.value = twist; u.uOpacity.value = op; u.uRip.value = rip; u.uRipAmp.value = ripA; u.uTime.value = time;
  g.visible = op > 0.005;
}
function hideJumpGrid(){ if(JUMP_GRID) JUMP_GRID.visible = false; }
/* traînées : axe = cap du vaisseau, défilement = distance parcourue, longueur ∝ vitesse */
function updateWarpStreaks(dt){
  const L = jumpState ? 0 : WARP_LEVEL;
  if(L < 0.01){ if(WARP_STREAKS) WARP_STREAKS.visible = false; return; }
  if(!WARP_STREAKS) WARP_STREAKS = buildWarpStreaks();
  const u = WARP_STREAKS.material.uniforms;
  _wsFwd.set(0, 0, -1).applyQuaternion(shipRig.quaternion);
  _wsU.copy(_wsY).addScaledVector(_wsFwd, -_wsY.dot(_wsFwd)).normalize();
  u.uCenter.value.copy(shipRig.position).sub(camera.position);   /* shader sans modelMatrix : centre relatif à la caméra (origine flottante) */ u.uDir.value.copy(_wsFwd); u.uU.value.copy(_wsU); u.uW.value.crossVectors(_wsFwd, _wsU);
  WARP_STREAK_OFF = (WARP_STREAK_OFF + currentSpeed*dt) % u.uSpan.value;
  u.uOff.value = WARP_STREAK_OFF; u.uLen.value = -Math.min(currentSpeed*0.09, 170) - 2;
  u.uAlpha.value = 0.9*warpSmooth((L - 0.15)/0.85);
  WARP_STREAKS.visible = u.uAlpha.value > 0.01;
}