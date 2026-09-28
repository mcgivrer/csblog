/* Copie de la démo « Observation des étoiles » v7.2.2 (src/postfx.js), inchangée — profondeur de champ des gros plans, réglée par 20h-gros-plans.js (lot L10). */
/* =====================================================================
   PROFONDEUR DE CHAMP (lot 3, v6.9) — window.__POSTFX
   Flou optique selon la profondeur, réservé aux gros plans (le réalisateur règle ouverture et mise au point) :
   1. la scène (rendu en tranches de cine.js) va dans une cible hors écran avec texture profondeur + stencil (portails des baies) ;
      après la dernière tranche, le tampon de profondeur ne contient que le premier plan : tout le reste est « à l'infini » ;
   2. demi-résolution : couleur (échantillons 2×2) et cercle de confusion (CoC) calculé depuis la profondeur linéaire ;
   3. flou séparable (2 passes de 13 prises), mélange en lumière linéaire, chaque prise pondérée par son propre CoC :
      un sujet net ne bave pas sur le fond flou ;
   4. composition pleine résolution : net ou flou selon le CoC du pixel ; FXAA sur la partie nette
      (la cible hors écran n'a pas l'anticrénelage matériel de l'écran).
   Coût : 4 passes plein écran (2 à demi-résolution) ; rien quand le flou est coupé.
   ===================================================================== */
(function(){
  if(!window.THREE) return;
  const P = window.__POSTFX = {};
  let ok = null, rtScene = null, rtA = null, rtB = null, rtOut = null;
  const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), qScene = new THREE.Scene(), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false; qScene.add(quad);
  const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const COMMON = `
    uniform float uNear, uFar, uScale, uFocus, uK;
    vec3 dec(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }
    vec3 enc(vec3 c){ return pow(max(c, 0.0), vec3(1.0/2.2)); }
    float linDepth(float z){ if(z >= 0.99999) return 1e20; float n = z*2.0 - 1.0; return 2.0*uNear*uFar/(uFar + uNear - n*(uFar - uNear))*uScale; }
    float coc(sampler2D tD, vec2 uv){ float d = linDepth(texture2D(tD, uv).x), c = 1.0 - uFocus/d; return (c < 0.0 ? min(-c, 0.75) : min(c, 1.0))*uK; }   /* premier plan plafonné : le sujet reste lisible */`;
  const U = () => ({ uNear: { value: 1 }, uFar: { value: 400 }, uScale: { value: 1 }, uFocus: { value: 50 }, uK: { value: 1 } });
  // 1) demi-résolution : couleur + CoC (le plus grand des 4 : la zone floue déborde d'un texel, pas de liseré)
  const matDown = new THREE.ShaderMaterial({ vertexShader: VERT, depthTest: false, depthWrite: false,
    uniforms: Object.assign(U(), { tColor: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2() } }),
    fragmentShader: 'precision highp float; varying vec2 vUv; uniform sampler2D tColor, tDepth; uniform vec2 uTexel;' + COMMON + `
    void main(){
      vec2 o = uTexel*0.5;
      vec3 c = dec(texture2D(tColor, vUv + vec2(-o.x, -o.y)).rgb) + dec(texture2D(tColor, vUv + vec2(o.x, -o.y)).rgb) + dec(texture2D(tColor, vUv + vec2(-o.x, o.y)).rgb) + dec(texture2D(tColor, vUv + vec2(o.x, o.y)).rgb);
      float k = max(max(coc(tDepth, vUv + vec2(-o.x, -o.y)), coc(tDepth, vUv + vec2(o.x, -o.y))), max(coc(tDepth, vUv + vec2(-o.x, o.y)), coc(tDepth, vUv + vec2(o.x, o.y))));
      gl_FragColor = vec4(enc(c*0.25), k);
    }` });
  // 2) flou séparable à rayon variable, prises pondérées par leur propre CoC
  const matBlur = new THREE.ShaderMaterial({ vertexShader: VERT, depthTest: false, depthWrite: false,
    uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() }, uMaxR: { value: 8 } },
    fragmentShader: `precision highp float; varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uDir; uniform float uMaxR;
    vec3 dec(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }
    vec3 enc(vec3 c){ return pow(max(c, 0.0), vec3(1.0/2.2)); }
    void main(){
      vec4 c0 = texture2D(tSrc, vUv); float r0 = c0.a*uMaxR;
      if(r0 < 0.35){ gl_FragColor = c0; return; }
      vec3 acc = dec(c0.rgb); float ws = 1.0;
      for(int i = 1; i <= 6; i++){
        float t = float(i)/6.0, off = t*r0, g = exp(-2.2*t*t);
        vec4 a = texture2D(tSrc, vUv + uDir*off), b = texture2D(tSrc, vUv - uDir*off);
        float wa = g*clamp(a.a*uMaxR - off + 1.0, 0.0, 1.0), wb = g*clamp(b.a*uMaxR - off + 1.0, 0.0, 1.0);
        acc += dec(a.rgb)*wa + dec(b.rgb)*wb; ws += wa + wb;
      }
      gl_FragColor = vec4(enc(acc/ws), c0.a);
    }` });
  // 3) composition : net (FXAA) ou flou selon le CoC pleine résolution
  const matComp = new THREE.ShaderMaterial({ vertexShader: VERT, depthTest: false, depthWrite: false,
    uniforms: Object.assign(U(), { tColor: { value: null }, tDepth: { value: null }, tBlur: { value: null }, uTexel: { value: new THREE.Vector2() }, uMaxR: { value: 8 } }),
    fragmentShader: 'precision highp float; varying vec2 vUv; uniform sampler2D tColor, tDepth, tBlur; uniform vec2 uTexel; uniform float uMaxR;' + COMMON + `
    vec3 fxaa(vec2 uv){                                   // FXAA (version console de T. Lottes)
      vec3 nw = texture2D(tColor, uv + vec2(-1.0, -1.0)*uTexel).rgb, ne = texture2D(tColor, uv + vec2(1.0, -1.0)*uTexel).rgb;
      vec3 sw = texture2D(tColor, uv + vec2(-1.0, 1.0)*uTexel).rgb, se = texture2D(tColor, uv + vec2(1.0, 1.0)*uTexel).rgb, m = texture2D(tColor, uv).rgb;
      vec3 L = vec3(0.299, 0.587, 0.114); float lNW = dot(nw, L), lNE = dot(ne, L), lSW = dot(sw, L), lSE = dot(se, L), lM = dot(m, L);
      float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
      if(lMax - lMin < 0.04) return m;
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
      float red = max((lNW + lNE + lSW + lSE)*(0.25/8.0), 1.0/128.0), rcp = 1.0/(min(abs(dir.x), abs(dir.y)) + red);
      dir = clamp(dir*rcp, vec2(-8.0), vec2(8.0))*uTexel;
      vec3 a = 0.5*(texture2D(tColor, uv + dir*(1.0/3.0 - 0.5)).rgb + texture2D(tColor, uv + dir*(2.0/3.0 - 0.5)).rgb);
      vec3 b = a*0.5 + 0.25*(texture2D(tColor, uv - dir*0.5).rgb + texture2D(tColor, uv + dir*0.5).rgb);
      float lb = dot(b, L); return (lb < lMin || lb > lMax) ? a : b;
    }
    void main(){
      float rpx = coc(tDepth, vUv)*uMaxR;                   // rayon de flou du pixel, en pixels pleine résolution
      float m = smoothstep(0.6, 2.2, rpx);
      vec3 sharp = m < 0.999 ? fxaa(vUv) : vec3(0.0);
      vec3 blur = m > 0.001 ? texture2D(tBlur, vUv).rgb : vec3(0.0);
      gl_FragColor = vec4(mix(sharp, blur, m), 1.0);
    }` });

  function makeTarget(w, h, depth, enc){
    const t = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: !!depth, stencilBuffer: !!depth });
    if(depth){ t.depthTexture = new THREE.DepthTexture(w, h); t.depthTexture.format = THREE.DepthStencilFormat; t.depthTexture.type = THREE.UnsignedInt248Type; }
    if(enc) t.texture.encoding = enc;
    return t;
  }
  P.available = r => { if(ok === null) ok = !!(r.capabilities.isWebGL2 || r.extensions.get('WEBGL_depth_texture')); return ok; };
  /* cible de la scène (profondeur + stencil), réallouée si la taille du tampon change */
  P.begin = function(r, w, h){
    if(!rtScene || rtScene.width !== w || rtScene.height !== h){
      [rtScene, rtA, rtB, rtOut].forEach(t => t && t.dispose());
      rtScene = makeTarget(w, h, true, r.outputEncoding); rtOut = makeTarget(w, h, false, r.outputEncoding);
      const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1); rtA = makeTarget(hw, hh, false); rtB = makeTarget(hw, hh, false);
    }
    r.setRenderTarget(rtScene);
    return rtScene;
  };
  function pass(r, mat, out){ quad.material = mat; r.setRenderTarget(out); r.render(qScene, qCam); }
  /* o : { near, far, scale } de la dernière tranche rendue, focus (m), k (0–1), maxR (px pleine résolution), toTexture */
  P.finish = function(r, o){
    const w = rtScene.width, h = rtScene.height, auto = r.autoClear; r.autoClear = true;
    [matDown, matComp].forEach(m => { const u = m.uniforms; u.uNear.value = o.near; u.uFar.value = o.far; u.uScale.value = o.scale; u.uFocus.value = o.focus; u.uK.value = o.k; });
    matDown.uniforms.tColor.value = rtScene.texture; matDown.uniforms.tDepth.value = rtScene.depthTexture; matDown.uniforms.uTexel.value.set(1/w, 1/h);
    pass(r, matDown, rtA);
    matBlur.uniforms.uMaxR.value = o.maxR*.5;
    matBlur.uniforms.tSrc.value = rtA.texture; matBlur.uniforms.uDir.value.set(1/rtA.width, 0); pass(r, matBlur, rtB);
    matBlur.uniforms.tSrc.value = rtB.texture; matBlur.uniforms.uDir.value.set(0, 1/rtA.height); pass(r, matBlur, rtA);
    const u = matComp.uniforms; u.tColor.value = rtScene.texture; u.tDepth.value = rtScene.depthTexture; u.tBlur.value = rtA.texture; u.uTexel.value.set(1/w, 1/h); u.uMaxR.value = o.maxR;
    pass(r, matComp, o.toTexture ? rtOut : null);
    r.autoClear = auto;
    return o.toTexture ? rtOut.texture : null;
  };
  P.info = () => ({ ok, size: rtScene ? [rtScene.width, rtScene.height] : null });
})();
