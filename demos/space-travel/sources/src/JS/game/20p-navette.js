/* =========================================================================
   NAVETTE-CARGO ET CONTENEUR ISO 20' (lot N — refonte de la navette, choix P2)
   - Conteneur ISO 20' réel : 6,058 × 2,438 × 2,591 m ; tôle ondulée, rails, pièces de coin, portes à
     barres de verrouillage, code propriétaire (texture générée, une par combinaison couleur/code) ;
     couleur d'armateur tirée par graine. Un seul maillage (6 faces texturées).
   - Navette-cargo : corps de la navette de transport de la démo (smallcraft.js, 17,5 m : cockpit,
     hublots, ailerons radiateurs, 2 tuyères à torche, RCS, feux, usure) + BERCEAU DORSAL à 4 pinces.
     Dorsal et non ventral (rendu de principe) : pendant le chargement, la navette attend sous le module
     d'amarrage et le bras descend le conteneur depuis la soute — il le pose donc sur son dos.
   - Même interface que l'ancienne navette (group, glow, clampGroup, navLights, trail, hasCargo) : le
     chargement, le vol et les plans de caméra existants s'en servent sans autre changement.
   - Module d'amarrage dimensionné pour le conteneur ISO (DOCK_SCALE m par unité d'origine) au lieu de la
     taille du vaisseau : le conteneur passe la porte de la soute quel que soit le modèle.
   ========================================================================= */
const CARGO = (function(){
const V3 = THREE.Vector3;
const ISO = { L: 6.058, W: 2.438, H: 2.591 };
const DOCK_SCALE = ISO.L/1.2;                                  /* le module d'origine était dessiné pour un conteneur de 1,2 u */
const COLORS = ['#9c3b2a', '#2f5d8c', '#3f7a4a', '#d9822b', '#7d8691', '#d8d6cc', '#5b3f7a', '#b8a032'];
const OWNERS = ['STTU', 'MCGU', 'VYGU', 'ORNU', 'KSLU', 'ASTU'];
const cache = {};
function rng(seed){ let s = (seed >>> 0) || 1; return () => { s = (s*16807) % 2147483647; return s/2147483647; }; }
function shade(hex, k){ const n = parseInt(hex.slice(1), 16), c = [n >> 16, n >> 8 & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v*k)))); return 'rgb(' + c.join(',') + ')'; }
function tex(key, w, h, draw){ if(cache[key]) return cache[key]; const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.anisotropy = 4; if(renderer && renderer.outputEncoding !== undefined) t.encoding = THREE.sRGBEncoding; cache[key] = t; return t; }
/* flanc : ondulations verticales, rails haut/bas, pièces de coin, salissures, code propriétaire */
function sideTex(col, code, big, r){
  return tex('s' + col + code + big, 1024, 448, (g, w, h) => {
    g.fillStyle = col; g.fillRect(0, 0, w, h);
    for(let x = 0; x < w; x += 16){ g.fillStyle = shade(col, 1.14); g.fillRect(x, 0, 6, h); g.fillStyle = shade(col, .8); g.fillRect(x + 9, 0, 5, h); }
    g.fillStyle = shade(col, .62); g.fillRect(0, 0, w, 22); g.fillRect(0, h - 26, w, 26);
    g.fillStyle = '#2b2b2b'; [[0, 0], [w - 44, 0], [0, h - 44], [w - 44, h - 44]].forEach(([x, y]) => g.fillRect(x, y, 44, 44));
    for(let i = 0; i < 26; i++){ g.fillStyle = 'rgba(70,40,20,' + (.05 + .12*r()) + ')'; const x = r()*w, y = r()*h; g.fillRect(x, y, 6 + 40*r(), 2 + 90*r()); }
    if(big){ g.fillStyle = 'rgba(255,255,255,.88)'; g.font = 'bold 54px JetBrains Mono, monospace'; g.fillText(big, 70, 120); }
    g.fillStyle = 'rgba(255,255,255,.85)'; g.font = 'bold 26px JetBrains Mono, monospace'; g.fillText(code, w - 320, 76);
    g.font = '18px JetBrains Mono, monospace'; g.fillText('22G1 · MAX 30 480 KG', w - 320, 104);
  });
}
function endTex(col, door){
  return tex('e' + col + door, 256, 272, (g, w, h) => {
    g.fillStyle = col; g.fillRect(0, 0, w, h);
    g.fillStyle = shade(col, .62); g.fillRect(0, 0, w, 18); g.fillRect(0, h - 18, w, 18); g.fillRect(0, 0, 16, h); g.fillRect(w - 16, 0, 16, h);
    g.fillStyle = '#2b2b2b'; [[0, 0], [w - 30, 0], [0, h - 30], [w - 30, h - 30]].forEach(([x, y]) => g.fillRect(x, y, 30, 30));
    if(door){ g.fillStyle = shade(col, .5); g.fillRect(w/2 - 2, 18, 4, h - 36);
      [.16, .36, .64, .84].forEach(k => { g.fillStyle = '#c8c8c0'; g.fillRect(k*w - 4, 22, 8, h - 44); g.fillStyle = '#6b6b66'; g.fillRect(k*w - 10, h*.5 - 6, 20, 12); }); }
  });
}
function topTex(col){ return tex('t' + col, 256, 512, (g, w, h) => { g.fillStyle = shade(col, .9); g.fillRect(0, 0, w, h); for(let y = 0; y < h; y += 24){ g.fillStyle = shade(col, .78); g.fillRect(0, y, w, 8); } }); }
function buildIsoContainer(seed){
  const r = rng(seed || 7), col = COLORS[Math.floor(r()*COLORS.length)], own = OWNERS[Math.floor(r()*OWNERS.length)];
  const num = String(Math.floor(r()*900000) + 100000), code = own + ' ' + num + ' ' + Math.floor(r()*10), big = r() < .5 ? own.slice(0, 3) : '';
  const std = (map) => new THREE.MeshStandardMaterial({ map: map, metalness: .35, roughness: .62 });
  const side = std(sideTex(col, code, big, r));
  const mats = [side, side, std(topTex(col)), std(topTex(col)), std(endTex(col, true)), std(endTex(col, false))];   /* +x −x +y −y +z(portes) −z */
  const m = new THREE.Mesh(new THREE.BoxGeometry(ISO.W, ISO.H, ISO.L), mats);
  const g = new THREE.Group(); g.add(m); g.userData.iso = true; g.userData.code = code;
  return g;
}
/* traînée (identique à l'ancienne navette : polyligne en coordonnées monde, fondu par assombrissement) */
function buildTrail(){
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SHUTTLE_TRAIL_LEN*3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SHUTTLE_TRAIL_LEN*3), 3));
  const tr = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: .85 }));
  tr.frustumCulled = false; return tr;
}
function buildCargoShuttle(seed){
  const c = window.__CRAFT.build('crew', { age: typeof SHIP_WEAR !== 'undefined' ? SHIP_WEAR.age : .1, seed: seed || 1 });
  if(c.thr) c.thr.value = .15;
  const g = new THREE.Group(); g.add(c.group);
  const b = c.box.clone(), top = b.max.y, zc = (b.min.z + b.max.z)/2 + .4;
  /* berceau dorsal : deux rails et quatre pinces */
  const mDark = new THREE.MeshStandardMaterial({ color: 0x3b4252, metalness: .6, roughness: .45 });
  const mAmb = new THREE.MeshStandardMaterial({ color: 0x2a1c08, emissive: 0xffb454, emissiveIntensity: .8 });
  [-1, 1].forEach(sx => { const rail = new THREE.Mesh(new THREE.BoxGeometry(.28, .3, ISO.L + .6), mDark); rail.position.set(sx*(ISO.W/2 - .3), top + .15, zc); g.add(rail);
    [-1, 1].forEach(sz => { const cl = new THREE.Mesh(new THREE.BoxGeometry(.34, .75, .34), mDark); cl.position.set(sx*(ISO.W/2 + .12), top + .45, zc + sz*(ISO.L/2 - .35)); g.add(cl);
      const led = new THREE.Mesh(new THREE.BoxGeometry(.12, .12, .12), mAmb); led.position.set(sx*(ISO.W/2 + .12), top + .86, zc + sz*(ISO.L/2 - .35)); g.add(led); }); });
  const clampGroup = new THREE.Group(); clampGroup.position.set(0, top + .3 + ISO.H/2, zc); g.add(clampGroup);
  /* lueur de propulsion à l'arrière (utilisée par le vol : fondu à l'arrivée) */
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x9fd4ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 1 }));
  glow.position.set(0, (b.min.y + b.max.y)/2, b.max.z + .8); glow.scale.setScalar(3.2); g.add(glow);
  return { group: g, glow: glow, clampGroup: clampGroup, navLights: c.nav || [], hasCargo: false, trail: buildTrail(), craft: c,
           engineBack: b.max.z + .8, len: b.max.z - b.min.z };
}
/* points de saisie et de dépose de la pince, dans le repère du vaisseau (une fois par chargement) :
   le conteneur attend EXACTEMENT où la pince le saisit, la navette se place EXACTEMENT où elle le dépose */
const _q = new THREE.Quaternion();
function armPoints(){
  if(!window.shipArm) return null;
  const grip = () => { shipRig.updateMatrixWorld(true); return window.shipArm.gripper.localToWorld(new V3(0, 0, .25)); };
  applyArmPose(ARM_POSE_REACH); const pR = grip(); applyArmPose(ARM_POSE_PLACE); const pP = grip(); applyArmPose(ARM_POSE_REST); shipRig.updateMatrixWorld(true);
  _q.copy(shipRig.quaternion).invert();
  return { stage: pR.sub(shipRig.position).applyQuaternion(_q), place: pP.sub(shipRig.position).applyQuaternion(_q) };
}
function shipPoint(local){ return local.clone().applyQuaternion(shipRig.quaternion).add(shipRig.position); }
return { ISO, DOCK_SCALE, buildIsoContainer, buildCargoShuttle, armPoints, shipPoint };
})();
