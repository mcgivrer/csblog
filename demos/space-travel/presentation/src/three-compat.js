/* =====================================================================
   COMPATIBILITÉ THREE.JS (lot P8) — la présentation embarque three r186 ; le jeu et les modules partagés
   (planets.js, asteroids.js, stars.js) ont été écrits pour three r128. Ce module, chargé avant tous les autres,
   rend à l'image l'aspect de r128 :
   - gestion des couleurs désactivée (couleurs hexadécimales et HSL prises telles quelles, comme en r128) ;
   - matériaux de three rendus dans une cible : r186 ne leur applique plus ni ACES ni sRGB (seulement à l'écran) ;
     la direction photo compose « en espace d'affichage » : ACES (exposition 1,15, celle du lecteur) puis sRGB sont
     appliqués partout, comme en r128 ;
   - lumières : r186 n'a plus le mode « historique » qui multipliait l'éclairement par π (W.lightK, voir cosmos.js).
   Voir docs/SPEC-P8-three.md.
   ===================================================================== */
(function(){
'use strict';
const R = parseInt(THREE.REVISION, 10);
window.__THREE_COMPAT = { revision: R, lightK: R >= 155 ? Math.PI : 1 };
if(R < 152) return;
THREE.ColorManagement.enabled = false;
/* ACES « filmic » (approximation de Stephen Hill, identique en r128 et r186), exposition 1,15 / 0,6, puis sRGB */
THREE.ShaderChunk.tonemapping_fragment = [
  '{ vec3 c_ = gl_FragColor.rgb*(1.15/0.6);',
  '  c_ = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777))*c_;',
  '  c_ = (c_*(c_ + 0.0245786) - 0.000090537)/(c_*(0.983729*c_ + 0.4329510) + 0.238081);',
  '  c_ = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602))*c_;',
  '  gl_FragColor.rgb = clamp(c_, 0.0, 1.0); }'].join('\n');
THREE.ShaderChunk.colorspace_fragment = 'gl_FragColor = sRGBTransferOETF(gl_FragColor);';
})();
