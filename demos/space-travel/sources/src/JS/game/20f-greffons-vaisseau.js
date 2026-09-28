/* =========================================================================
   L5 + L6 — GREFFONS VAISSEAU DE LA DÉMO v7.2.2, PILOTÉS PAR LE JEU
   Les modules de la démo (src/JS/demo : shipdrive, shipglass, warpring, shipwear, hitex)
   enveloppent SHIPGEN.build et ajoutent au vaisseau ses ensembles moteur, ses anneaux, son
   usure. Dans la démo, cine.js les anime à chaque image ; ici, ce module le fait pour le
   vaisseau du joueur, à partir de l'état du vol réel (REAL) :
   - L6 · tuyères : poussée (profil de vol réel), chauffe du col en ~1 s et refroidissement
     en ~5 s (inertie thermique), cardans qui suivent la vitesse de rotation du vaisseau
     (retournements compris) avec une vibration fine pendant la poussée ;
   - L6 · anneaux de distorsion : rotation lente au repos (un tour en 50 s), pré-charge sur
     l'erre avant une distorsion (un tour en 6 s), 1,2 tour/s en distorsion, décroissance
     τ = 2 s ; halo et émetteurs allumés par le champ ; lueur des anneaux sur la coque ;
   - L6 · usure progressive : chaque vaisseau neuf sort de chantier (âge 0,04) et s'use à
     chaque escale (+0,012 : « usé » après une cinquantaine d'escales) — uniforme uAge du
     module d'usure, sans reconstruire le vaisseau ; livrée tirée par graine à l'achat ;
   - L6 · tremblement de caméra (formule de la démo) : allumage des moteurs, poussée, charge,
     repli et éclair du saut, engagement de la distorsion ; seulement caméra proche du
     vaisseau ; désactivé par ?shake=0 ou « réduire les animations » du système ;
   - L5 · géode du cœur de saut : rotation lente (un tour en 40 s), battements pendant la
     charge (0,8 s → 0,07 s, comme la démo), accélération jusqu'à ~3 tours/s au repli puis
     retour (τ = 1,2 s), étincelle violette ;
   - L5 · départ en distorsion (v7.2.1) : plan extérieur — le vaisseau s'éloigne en
     accélérant sur 2,2 s en laissant une traînée violette, disparaît dans une gerbe de
     particules ; la caméra reste 1,3 s sur la gerbe puis rejoint le vaisseau pour la
     traversée. Formes calculées dans les shaders (buildDepFX reprise telle quelle de cine.js).
   ========================================================================= */
const SHIPFX = (function(){
const V3 = THREE.Vector3, Q = THREE.Quaternion;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = x => { x = clamp(x, 0, 1); return x*x*(3 - 2*x); };
const rr = (a, b) => a + (b - a)*Math.random();
const REDUCED = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
const SHAKE_ON = new URLSearchParams(location.search).get('shake') !== '0';
const WEAR = { NEW: .04, PER_ESCALE: .012, MAX: .95 };
const RING = { W0: 2*Math.PI/50, W1: 2*Math.PI/6, WM: 2*Math.PI*1.2 };
const GEO = { W0: 2*Math.PI/40, WMAX: 6*Math.PI, TAU: 1.2 };
const GIMBAL = .065, GIMBAL_REF = .4;

/* ---------- départ en distorsion : repris tel quel de cine.js (v7.2.1) ---------- */
const DEPFX = { NB: 1500, NT: 900, LIFE: 6 };
function buildDepFX(){
  const G = new THREE.Group(); G.visible = false; G.userData.center = new V3(); G.userData.r = 1;
  // particules : gerbe (sphère + anneau de choc perpendiculaire à la route) puis égrenage de la traînée
  const N = DEPFX.NB + DEPFX.NT, P = new Float32Array(N*4), Qa = new Float32Array(N*4), pos = new Float32Array(N*3);
  for(let i = 0; i < N; i++){
    const u = Math.random()*2 - 1, a = Math.random()*Math.PI*2, r = Math.sqrt(1 - u*u), burst = i < DEPFX.NB;
    const sp = burst ? (Math.random() < .12 ? rr(1.4, 2.4) : .15 + 1.15*Math.pow(Math.random(), .7)) : .02 + .14*Math.random();
    P.set([r*Math.cos(a), r*Math.sin(a), u, sp], i*4);
    Qa.set([burst ? (i < DEPFX.NB*.62 ? -1 : -2) : Math.random(), 0, burst ? rr(2.8, 5.5) : rr(2.4, 4.6), Math.random()], i*4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aP', new THREE.BufferAttribute(P, 4)); g.setAttribute('aQ', new THREE.BufferAttribute(Qa, 4));
  const U = { uT: { value: 0 }, uL: { value: 100 }, uW: { value: new V3(0, 0, 1) }, uDE: { value: 1 }, uTc: { value: 2.2 }, uPx: { value: 600 }, uHead: { value: 0 }, uWid: { value: 10 }, uFade: { value: 1 } };
  const pm = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute vec4 aP; attribute vec4 aQ;
      uniform float uT, uL, uDE, uTc, uPx; uniform vec3 uW;
      varying float vA; varying vec3 vC;
      void main(){
        float t0 = aQ.x < 0.0 ? uTc : aQ.y, t = uT - t0;                       /* gerbe : à la disparition ; traînée : au passage du vaisseau */
        if(t < 0.0 || t > aQ.z){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; vC = vec3(0.0); return; }
        vec3 d = aP.xyz;
        if(aQ.x < -1.5 || aQ.x >= 0.0) d = normalize(d - uW*dot(d, uW) + 1e-4);  /* anneau de choc, dérive latérale de la traînée */
        float tau = aQ.x < 0.0 ? 1.1 : 1.8, r = aP.w*uL*tau*(1.0 - exp(-t/tau));
        vec3 p = aQ.x < 0.0 ? uW*(uDE + uL*0.35*(1.0 - exp(-t/0.6))) : uW*(aQ.x*uDE);
        p += d*r;
        vec4 mv = modelViewMatrix*vec4(p, 1.0);
        float life = t/aQ.z, fade = (1.0 - life)*(1.0 - life)*smoothstep(0.0, 0.06, t);
        float tw = 0.65 + 0.35*sin(uT*(9.0 + aQ.w*13.0) + aQ.w*40.0);
        vA = fade*tw*(aQ.x < 0.0 ? 1.0 : 0.55);
        float h = fract(aQ.w*7.31);
        vC = h < 0.6 ? vec3(0.62, 0.3, 1.0) : (h < 0.86 ? vec3(0.92, 0.55, 1.0) : vec3(0.55, 0.72, 1.0));
        float sz = uL*(aQ.x < 0.0 ? 0.04 : 0.024)*(0.6 + 0.8*fract(aQ.w*3.7));
        gl_PointSize = clamp(sz*uPx/max(-mv.z, 1e-3), 1.5, 22.0);
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: `precision highp float; varying float vA; varying vec3 vC;
      void main(){ vec2 q = gl_PointCoord*2.0 - 1.0; float d = dot(q, q); if(d > 1.0) discard; gl_FragColor = vec4(vC*vA*exp(-d*3.0)*1.7, 1.0); }` });
  const pts = new THREE.Points(g, pm); pts.frustumCulled = false; pts.renderOrder = 9; G.add(pts);
  // traînée : ruban face caméra le long de la route, étroit au départ, large derrière le vaisseau
  const NS = 48, uv = new Float32Array((NS + 1)*2*2), rp = new Float32Array((NS + 1)*2*3), idx = [];
  for(let i = 0; i <= NS; i++){ uv.set([i/NS, -1, i/NS, 1], i*4); if(i < NS){ const k = i*2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3)); rg.setAttribute('aUV', new THREE.BufferAttribute(uv, 2)); rg.setIndex(idx);
  const rm = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `
      attribute vec2 aUV; uniform float uHead, uWid; uniform vec3 uW; varying vec2 vUV;
      void main(){
        vec4 mv = modelViewMatrix*vec4(uW*(aUV.x*uHead), 1.0);
        vec3 dv = normalize(mat3(modelViewMatrix)*uW), sd = cross(dv, normalize(mv.xyz));
        sd = length(sd) > 1e-4 ? normalize(sd) : vec3(1.0, 0.0, 0.0);
        mv.xyz += sd*aUV.y*uWid*(0.3 + 0.7*smoothstep(0.0, 0.85, aUV.x));
        vUV = aUV; gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: `precision highp float; uniform float uFade, uT, uHead, uL; varying vec2 vUV;
      void main(){
        float across = exp(-vUV.y*vUV.y*3.2), along = pow(vUV.x, 1.3);
        float ripple = 0.75 + 0.25*sin(vUV.x*uHead/(uL*0.35) - uT*14.0);
        float k = across*along*ripple*uFade*smoothstep(0.0, uL*0.3, uHead);
        vec3 col = mix(vec3(0.5, 0.24, 1.0), vec3(0.95, 0.82, 1.0), across*across*along*0.6);
        gl_FragColor = vec4(col*k*1.2, 1.0);
      }` });
  const rib = new THREE.Mesh(rg, rm); rib.frustumCulled = false; rib.renderOrder = 9; G.add(rib);
  G.userData.U = U; G.userData.pts = g; LAYERS.shipWorld.add(G);
  return G;
}

const S = { build: null, heat: 0, gim: { x: 0, y: 0, idle: false }, ringA: 0, ringW: RING.W0, geo: null, geoA: 0, geoW: GEO.W0,
  qPrev: new Q(), w: new V3(), shake: { ev: [], lastThr: 0, applied: null, base: null, T: 0 }, dep: null };

/* géode (cœur de saut) : cœur, halo et cadre filaire partagent l'uniforme de charge du générateur */
function findGeode(group){
  const ch = SHIPGEN.JUMP_U && SHIPGEN.JUMP_U.uCharge; if(!ch) return null;
  let core = null, halo = null, wire = null;
  group.traverse(o => { const m = o.material; if(o.isMesh && m && m.isShaderMaterial && m.uniforms && m.uniforms.uCharge === ch){ if(m.transparent) halo = o; else core = o; } });
  if(!core) return null;
  group.traverse(o => { if(o.isLineSegments && o.position.distanceTo(core.position) < 1e-3) wire = o; });
  core.geometry.computeBoundingSphere(); const r = core.geometry.boundingSphere.radius;
  const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xcdb8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  spark.position.copy(core.position); spark.visible = false; spark.renderOrder = 12; spark.userData.noFrame = true; core.parent.add(spark);
  return { core, halo, wire, spark, r, wireCol: wire ? wire.material.color.clone() : null, q0: wire ? wire.quaternion.clone() : null };
}
/* battements de la géode (enveloppe de la démo), u = temps depuis le début de la charge */
function geodePulse(u, charge){
  let t = .15, I = .8, p = 0;
  while(t < charge && t <= u){ const a = u - t; p = Math.max(p, smooth(a/.035)*Math.exp(-a/(.32*I))); t += I; I = Math.max(.07, I*.74); }
  return p;
}
function setGeode(G, p, ch){
  if(G.wire){ G.wire.scale.setScalar(1 + .16*p + .08*ch); G.wire.material.color.copy(G.wireCol).multiplyScalar(1 + 2.6*p + .8*ch); }
  G.core.scale.setScalar(1 + .12*p); if(G.halo) G.halo.scale.setScalar(1 + .25*p + .1*ch);
  G.spark.visible = p + ch > .02; G.spark.material.opacity = Math.min(1, .95*p + .2*ch); G.spark.scale.setScalar(G.r*(3.2 + 6*p + 2*ch));
}
function onNewHull(b){
  S.build = b; S.geo = findGeode(b.group); S.heat = 0; S.gim = { x: 0, y: 0, idle: false };
  S.qPrev.copy(shipRig.quaternion);
  if(b.wear) b.wear.uAge.value = SHIP_WEAR.age;
}

/* ---------- départ en distorsion ---------- */
function warpDepartStart(P, M){
  if(!S.dep) S.dep = buildDepFX();
  const G = S.dep, U = G.userData.U, L = SHIP_GAME_LEN, T1 = REAL.FLIGHT.WARP_SPOOL;
  P.dE = L*40; P.P0 = shipRig.position.clone(); P.dirW = M.dir.clone();
  /* plan de trois quarts : à côté et un peu en arrière du point d'engagement, cadré sur le premier tiers de la route —
     dans l'axe, la traînée s'écraserait en un point */
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(shipRig.quaternion);
  let side = new THREE.Vector3().crossVectors(P.dirW, up); if(side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
  P.camHold = { pos: P.P0.clone().addScaledVector(side, L*7).addScaledVector(up, L*2.2).addScaledVector(P.dirW, -L*4),
                look: P.P0.clone().addScaledVector(P.dirW, P.dE*.42) };
  const Qa = G.userData.pts.attributes.aQ;                /* passage du vaisseau à la distance d : dist(t) = dE (t/T1)² */
  for(let i = DEPFX.NB; i < DEPFX.NB + DEPFX.NT; i++) Qa.setY(i, T1*Math.sqrt(Math.max(0, Qa.getX(i))) + .05);
  Qa.needsUpdate = true;
  G.position.copy(P.P0); G.updateMatrixWorld();
  U.uL.value = L; U.uW.value.copy(P.dirW); U.uDE.value = P.dE; U.uTc.value = T1; U.uWid.value = .14*L; U.uFade.value = 1;
  G.visible = true;
}
function updateDepFX(P){
  const G = S.dep; if(!G || !G.visible || !P || !P.P0) return;
  const U = G.userData.U, T1 = REAL.FLIGHT.WARP_SPOOL, t = P.t;
  U.uT.value = t;
  U.uHead.value = Math.max(0, Math.min(P.dE*Math.pow(Math.min(t, T1)/T1, 2), P.dE) - .45*U.uL.value);
  U.uFade.value = t < T1 ? 1 : Math.exp(-(t - T1)/1.5);
  const sz = renderer.getDrawingBufferSize(_v2); U.uPx.value = sz.y/(2*Math.tan(camera.fov*Math.PI/360));
  if(t > T1 + DEPFX.LIFE) G.visible = false;
}
const _v2 = new THREE.Vector2();

/* ---------- tremblement de caméra (démo) ---------- */
const shakeNoise = (t, s) => Math.sin(t*11.3 + s)*.5 + Math.sin(t*17.9 + s*2.1)*.3 + Math.sin(t*27.1 + s*3.7)*.2;
function shakeIntensity(thr, T){
  const K = S.shake, L = SHIP_GAME_LEN || 50, d = camera.position.distanceTo(shipRig.position)/L;
  const att = clamp(1 - (d - .6)/2.4, 0, 1);
  if(thr > .08 && K.lastThr <= .08) K.ev.push({ t0: T, a: .55, tau: .32 });            /* allumage */
  K.lastThr = thr;
  if(K.ev.length && T - K.ev[0].t0 > 2.5) K.ev.shift();
  let e = .07*thr; K.ev.forEach(x => e += x.a*Math.exp(-(T - x.t0)/x.tau));
  let I = att*e;
  if(jumpState){ const u = jumpState.t, c = WARP_T.charge, f = WARP_T.fold;
    if(jumpState.phase === 'charge') I += att*(.1*(u/c) + .42*geodePulse(u, c));
    else if(jumpState.phase === 'fold') I += att*.6*smooth(u/f);
    else I += att*Math.exp(-u/.35); }
  const P = REAL.mission && REAL.mission.pass;
  if(REAL.phase === 'WARP' && P && P.t < REAL.FLIGHT.WARP_SPOOL) I += att*.18*smooth(P.t/REAL.FLIGHT.WARP_SPOOL);
  return Math.min(1, I);
}
function applyShake(thr, T){
  const K = S.shake;
  /* le tremblement précédent est retiré si la caméra n'a pas été recalculée entre-temps (caméra fixe du saut) */
  if(K.applied && camera.quaternion.equals(K.applied)) camera.quaternion.copy(K.base);
  K.applied = null;
  if(!SHAKE_ON || (REDUCED && REDUCED.matches)) return 0;
  const I = shakeIntensity(thr, T); if(I < .003) return I;
  K.base = camera.quaternion.clone();
  const a = .011*I*clamp(camera.fov/50, .5, 1.3);
  camera.rotateX(a*shakeNoise(T, 1.3)); camera.rotateY(a*shakeNoise(T, 4.1)); camera.rotateZ(.6*a*shakeNoise(T, 7.7));
  K.applied = camera.quaternion.clone();
  return I;
}

/* ---------- mise à jour par image (appelée en fin de REAL.update, caméra déjà placée) ---------- */
const _qd = new Q();
function update(dt, T){
  const b = SHIP_BUILD; if(!b) return;
  if(b !== S.build) onNewHull(b);
  const thr = (typeof WARP_THR === 'number' && WARP_THR !== null) ? WARP_THR : (REAL.throttle || 0);
  /* vitesse de rotation du vaisseau dans son propre repère (retournements compris) */
  _qd.copy(S.qPrev).invert().multiply(shipRig.quaternion); S.qPrev.copy(shipRig.quaternion);
  const ang = 2*Math.acos(clamp(Math.abs(_qd.w), -1, 1)), s = Math.sqrt(Math.max(1e-12, 1 - _qd.w*_qd.w));
  S.w.set(_qd.x/s, _qd.y/s, _qd.z/s).multiplyScalar(dt > 0 && ang > 1e-6 ? Math.sign(_qd.w || 1)*ang/dt : 0);
  /* tuyères : poussée, inertie thermique, cardans */
  if(b.drive){
    b.drive.uThr.value = thr;
    S.heat += (thr - S.heat)*(thr > S.heat ? 1 - Math.exp(-dt*.9) : 1 - Math.exp(-dt*.2)); b.drive.uHeat.value = S.heat;
    if(b.drive.units && window.__SHIPDRIVE){
      const g = S.gim, kk = 1 - Math.exp(-dt*5);
      const tx = -clamp(S.w.x/GIMBAL_REF, -1, 1)*GIMBAL, ty = -clamp(S.w.y/GIMBAL_REF, -1, 1)*GIMBAL;
      g.x += (tx - g.x)*kk; g.y += (ty - g.y)*kk;
      const idle = Math.abs(g.x) + Math.abs(g.y) < 1e-4 && thr < .01;
      if(!(idle && g.idle)) window.__SHIPDRIVE.gimbal(b.drive, g.x, g.y, thr*.0035, T);
      g.idle = idle;
    }
  }
  /* anneaux : rotation selon la phase du passage, champ, halo, émetteurs, lueur sur la coque */
  if(b.rings){
    const pre = REAL.phase === 'COAST' && SHIP_WARP && !hasQuantumJump, warp = REAL.phase === 'WARP';
    const target = warp ? RING.WM : (pre ? RING.W1 : RING.W0), tau = target > S.ringW ? (warp ? .9 : 1.2) : 2;
    S.ringW += (target - S.ringW)*(1 - Math.exp(-dt/tau)); S.ringA = (S.ringA + S.ringW*dt) % (2*Math.PI);
    const f = SHIPGEN.FTL_U.uField.value;
    b.rings.list.forEach(r => { r.pivot.rotation.z = r.dir*S.ringA; if(r.halo) r.halo.visible = f > .01; });
    b.rings.padMesh().forEach(m => { if(m.material) m.material.emissiveIntensity = .06 + 1.8*f; });
    if(b.wear && b.wear.uRingI) b.wear.uRingI.value = Math.max(.15, f);
  }
  /* géode : rotation, battements et étincelle pendant la charge du saut */
  const G = S.geo;
  if(G){
    let p = 0, ch = SHIPGEN.JUMP_U.uCharge.value, target = GEO.W0, tau = GEO.TAU;
    if(jumpState){
      if(jumpState.phase === 'charge'){ p = geodePulse(jumpState.t, WARP_T.charge); target = GEO.W0 + (GEO.WMAX - GEO.W0)*Math.pow(jumpState.t/WARP_T.charge, 1.6); tau = .15; }
      else if(jumpState.phase === 'fold'){ target = GEO.WMAX; tau = .15; }
    }
    S.geoW += (target - S.geoW)*(1 - Math.exp(-dt/tau)); S.geoA = (S.geoA + S.geoW*dt) % (2*Math.PI);
    if(G.wire && G.q0) G.wire.quaternion.setFromAxisAngle(new V3(0, 1, 0), S.geoA).multiply(G.q0);
    setGeode(G, p, ch);
  }
  if(b.wear) b.wear.uAge.value = SHIP_WEAR.age;
  /* départ en distorsion */
  const P = REAL.mission && REAL.mission.pass;
  if(S.dep && S.dep.visible) updateDepFX(P && P.P0 ? P : null);
  S.shake.T = T;
  S.lastShake = applyShake(thr, T);
}
function onEscale(){ SHIP_WEAR.age = Math.min(WEAR.MAX, SHIP_WEAR.age + WEAR.PER_ESCALE); }
function hideDep(){ if(S.dep) S.dep.visible = false; }
return { update, onEscale, warpDepartStart, hideDep, WEAR, state: S };
})();
