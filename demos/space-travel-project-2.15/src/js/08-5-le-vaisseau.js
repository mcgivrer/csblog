/* =========================================================================
   5. LE VAISSEAU — support commun : le rig (position et orientation pilotées
   par le vol), le groupe visuel (cloné par la carte stellaire) et
   l'immatriculation. La coque elle-même vient du générateur ci-dessous
   (v2.13+). Le nez pointe vers -Z.
   ========================================================================= */
const shipRig = new THREE.Object3D();
scene.add(shipRig);

const shipMesh = new THREE.Group();
shipRig.add(shipMesh);

/* immatriculation dérivée du seed — peinte sur le flanc du bloc arrière */
let SHIP_REGISTRY = (function(){
  const rng = rngFor(SEED+':registry');
  const prefixes = ['MIR','KAI','VEGA','ORIN','TALA','NOVA','SUR','HELI'];
  return prefixes[Math.floor(rng()*prefixes.length)] + '-' +
         String(Math.floor(rng()*89)+10);
})();
/* rayons approximatifs utilisés UNIQUEMENT pour dimensionner l'anneau des
   étiquettes de vaisseau (amélioration) — pas des rayons de collision,
   juste de quoi entourer visuellement chaque silhouette. */
let SHIP_LABEL_RADIUS = 22;
const SHUTTLE_LABEL_RADIUS = 2.2;

