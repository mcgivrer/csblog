/* =====================================================================
   ANNEAUX DE DISTORSION (v7.2) — window.__WARPRING
   Les 4 modèles supraluminiques du jeu portent 1 ou 2 anneaux autour du réacteur : un tore de structure, un tore lumineux
   intérieur (impulsions qui courent le long de l'anneau) et 4 colliers fixés au réacteur par des bras. Sans toucher au moteur :
   - chaque anneau (tore + tore lumineux) passe sur un pivot qui tourne autour de l'axe du vaisseau ; colliers et bras restent
     fixes (l'anneau tourne dans ses paliers) ;
   - 12 émetteurs sont posés sur la jante extérieure (au-delà des colliers : aucune collision) : ils rendent la rotation
     visible et s'allument avec le champ ;
   - un halo additif dans le plan de l'anneau (anneau de lumière + voile intérieur quand le champ monte) ;
   - la lueur bleue sur la coque est calculée par le shader d'usure (shipwear.js) à partir de la position des anneaux.
   La démo (cine.js) règle la rotation (angle calculé depuis le temps) et le champ. Désactivable : { ringFx: false }.
   ===================================================================== */
(function(){
'use strict';
if(typeof SHIPGEN === 'undefined' || !window.THREE) return;
const WR = window.__WARPRING = {};
const HALO_V = 'varying vec2 vQ; varying vec3 vN; varying vec3 vV; void main(){ vQ = position.xy; vec4 mv = modelViewMatrix*vec4(position, 1.0); vN = normalize(normalMatrix*vec3(0.0, 0.0, 1.0)); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }';
const HALO_F = `precision highp float;
uniform float uField; uniform float uPhase; uniform float uTime; uniform float uR; uniform float uW;
varying vec2 vQ; varying vec3 vN; varying vec3 vV;
void main(){
  float rho = length(vQ), ang = atan(vQ.y, vQ.x)/6.2831853;
  float p = pow(fract(ang*6.0 - uPhase), 10.0) + 0.5*pow(fract(ang*6.0 - uPhase + 0.5), 10.0);      /* mêmes impulsions que le tore */
  float ring = exp(-pow((rho - uR)/uW, 2.0))*(0.35 + 1.1*p);
  float veil = smoothstep(uR, uR*0.35, rho)*smoothstep(0.0, uR*0.25, rho)*0.22*(0.7 + 0.3*sin(rho*0.9 - uTime*6.0));
  float f = max(uField - 0.15, 0.0);
  float view = pow(abs(dot(vN, vV)), 0.45);                                                    /* de profil : fondu */
  vec3 col = vec3(0.3, 0.55, 1.0)*(ring*f*0.8 + veil*f*f*0.7)*view;
  gl_FragColor = vec4(col, 1.0);
}`;
/* relevé des anneaux : tore lumineux (matériau à impulsions du jeu) + tore de structure au même endroit */
function survey(group){
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert(), glow = [], cands = [];
  group.traverse(o => {
    if(!o.isMesh) return;
    const m = o.material;
    if(m && m.isShaderMaterial && m.uniforms && m.uniforms.uPhase && o.geometry.type === 'TorusGeometry') glow.push(o);
    else if(Math.abs(o.position.x) < 1e-3 && Math.abs(o.position.y) < 1e-3) cands.push(o);
  });
  return glow.map(g => {
    const Rin = g.geometry.parameters.radius, z = g.position.z;
    const outer = cands.find(o => o.parent === g.parent && Math.abs(o.position.z - z) < 1e-3 && (o.geometry.boundingSphere || (o.geometry.computeBoundingSphere(), o.geometry.boundingSphere)).radius > Rin + 2 && o.geometry.boundingSphere.radius < Rin + 8);
    if(!outer) return null;
    const bs = outer.geometry.boundingSphere.radius, s = Rin + 2.166, rt = bs - s;
    const M = new THREE.Matrix4().multiplyMatrices(inv, g.matrixWorld), c = new THREE.Vector3().setFromMatrixPosition(M);
    return { glow: g, outer, Rin, s, rt, c };
  }).filter(Boolean);
}
WR.apply = function(group){
  const rings = survey(group); if(!rings.length) return null;
  const padMat = new THREE.MeshStandardMaterial({ color: 0x2c3138, metalness: .6, roughness: .45, emissive: 0x4a8cff, emissiveIntensity: .15, flatShading: true });
  padMat.userData.wearKind = 2; padMat.userData.lin = true; padMat.color.convertSRGBToLinear(); padMat.emissive.convertSRGBToLinear();
  const out = { list: [], pads: [] };
  rings.forEach((r, k) => {
    const par = r.glow.parent, pivot = new THREE.Group();
    pivot.position.set(0, 0, r.glow.position.z); par.add(pivot);
    [r.outer, r.glow].forEach(o => { par.remove(o); o.position.set(0, 0, 0); pivot.add(o); });
    // émetteurs : 12 plots sur la jante extérieure, décalés de 15° par rapport aux colliers
    const n = 12, geo = new THREE.BoxGeometry(.5, 3.2, Math.min(3.2, 1.3*r.rt)), rad = r.s + r.rt + .35;
    const pads = new THREE.Group(); pivot.add(pads);
    for(let i = 0; i < n; i++){
      const a = (i + .5)*2*Math.PI/n + Math.PI/12, m = new THREE.Mesh(geo, padMat);
      m.position.set(Math.cos(a)*rad, Math.sin(a)*rad, 0); m.rotation.z = a; pads.add(m);
    }
    // halo additif dans le plan de l'anneau (uniformes du jeu : la démo les remplace par ceux du vaisseau, comme pour le tore)
    const FU = SHIPGEN.FTL_U, w = Math.max(1.6, .9*r.rt), outerR = r.Rin + 4*w;
    const halo = new THREE.Mesh(new THREE.RingGeometry(.02*r.Rin, outerR, 96, 1), new THREE.ShaderMaterial({
      uniforms: { uField: FU.uField, uPhase: FU.uPhase, uTime: FU.uTime, uR: { value: r.Rin }, uW: { value: w } },
      vertexShader: HALO_V, fragmentShader: HALO_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    halo.userData.noFrame = true; halo.renderOrder = 11; pivot.add(halo);
    halo.visible = false;                                                        // allumé par la démo quand le champ monte
    out.list.push({ pivot, halo, z: r.c.z, R: r.s + r.rt, Rin: r.Rin, dir: k % 2 ? -1 : 1 });
    out.pads.push(pads);
  });
  out.padMesh = () => out.pads.map(p => p.children[0]).filter(Boolean);        // matériau lu au moment voulu (l'usure le copie)
  return out;
};
const build0 = SHIPGEN.build;
SHIPGEN.build = function(model, opts){
  const b = build0.call(SHIPGEN, model, opts);
  if(!(opts && opts.ringFx === false)) b.rings = WR.apply(b.group);
  return b;
};
})();
