/* =========================================================================
   3ter. RENDU EN DEUX COUCHES (lot L2.1 — fusion de la démo v7.2.2)
   Repris de cine.js (renderLayers), adapté au jeu :
   1) couche GALACTIQUE : la scène d'origine (`scene`) — champ d'étoiles,
      nébuleuses, décor — rendue avec la caméra du jeu, en unités du jeu
      (1 u = 1/38 pc, le facteur d'apparentMagnitude) ;
   2) couche SYSTÈME : `LAYERS.sysScene` — vaisseau, planètes, lunes,
      navettes, portiques, effets de saut — en ORIGINE FLOTTANTE (la caméra
      de rendu reste à l'origine, le monde est décalé de −caméra au moment
      du rendu puis remis en place) et en TRANCHES DE PROFONDEUR (loin →
      proche, tampon de profondeur vidé entre deux tranches).
   Les objets gardent leurs coordonnées absolues pour toute la logique du
   jeu : le décalage n'existe que le temps du rendu.
   Étape L2.1 : le système est encore en unités du jeu, avec deux tranches
   qui recouvrent exactement la plage d'origine (0,1 → 6 000) — même image
   que la v2.16, aux occultations entre couches près (une nébuleuse ou
   l'étoile hôte ne passent plus devant une planète). L2.2 passe le système
   en mètres avec les 6 tranches de la démo (0,2 m → 1,3·10¹⁹ m).
   ========================================================================= */
const LAYERS = (function(){
  const sysScene = new THREE.Scene();
  sysScene.fog = scene.fog;                              /* même brouillard, calculé en profondeur de vue : invariant */
  const sysWorld = new THREE.Group(); sysWorld.name = 'sysWorld';   /* corps célestes, portiques */
  const shipWorld = new THREE.Group(); shipWorld.name = 'shipWorld'; /* vaisseau, navettes, effets : tranches proches (échelle 1) */
  sysScene.add(sysWorld); sysScene.add(shipWorld);
  sysScene.add(new THREE.AmbientLight(0x141c2e, 0.55));  /* même lumière d'appoint que la scène d'origine */
  sysScene.add(starLight); sysScene.add(starLight.target);   /* « soleil local » : éclaire vaisseau et astéroïdes */
  const rcam = new THREE.PerspectiveCamera();            /* caméra de rendu : toujours à l'origine */

  /* bornes des tranches (unités de la couche système) et réduction du monde
     par tranche (1 = aucune) ; L2.2 : SLB = [.2, 400, 8e5, 1.6e9, 3.2e12, 6.4e15, 1.3e19],
     SLS = [1, 1, 800, 1.6e6, 3.2e9, 6.4e12] */
  const cfg = { SLB: [0.1, 400, 6000], SLS: [1, 1] };
  const stats = { calls: 0, triangles: 0, slices: 0 };

  function detach(obj){ if(obj && obj.parent) obj.parent.remove(obj); }

  function render(){
    const Rn = renderer, autoClear = Rn.autoClear;
    Rn.autoClear = false; Rn.clear(true, true, true);
    let calls = 0, tris = 0;
    /* 1) couche galactique : caméra du jeu en v2.16 ; à l'échelle réelle (L2.2), caméra galactique
       placée à la position galactique du vaisseau et orientée comme la caméra du jeu */
    const real = (typeof REAL !== 'undefined') && REAL.active;
    Rn.render(scene, (real && REAL.started) ? REAL.galCam : camera);
    calls += Rn.info.render.calls; tris += Rn.info.render.triangles;
    if(real && !REAL.started){ Rn.autoClear = autoClear; stats.calls = calls; stats.triangles = tris; stats.slices = 0; return; }
    /* 2) couche système, de la tranche la plus lointaine à la plus proche */
    const cp = camera.position;
    rcam.position.set(0, 0, 0); rcam.quaternion.copy(camera.quaternion);
    rcam.fov = camera.fov; rcam.aspect = camera.aspect; rcam.zoom = camera.zoom;
    let curS = -1, shipsReady = false, n = 0;
    /* tranches occupées (sliceUnits de cine.js) : sans fournisseur, toutes */
    const units = LAYERS.units ? LAYERS.units() : null;
    let used = ~0;
    if(units){ used = 0; units.forEach(function(u){ const dd = u[0].distanceTo(cp), lo = Math.max(dd - u[1], cfg.SLB[0]), hi = dd + u[1];
      for(let i = 0; i < cfg.SLB.length - 1; i++) if(hi > cfg.SLB[i] && lo < cfg.SLB[i+1]) used |= 1 << i; }); }
    stats.used = used;
    for(let i = cfg.SLB.length - 2; i >= 0; i--){
      if(!(used & (1 << i))) continue;
      const s = cfg.SLS[i];
      if(s !== curS){ curS = s; sysWorld.scale.setScalar(1/s); sysWorld.position.copy(cp).multiplyScalar(-1/s); sysWorld.updateMatrixWorld(); }
      shipWorld.visible = s === 1;
      if(s === 1 && !shipsReady){ shipsReady = true; shipWorld.position.copy(cp).negate(); shipWorld.updateMatrixWorld(); }
      rcam.near = cfg.SLB[i]/s; rcam.far = cfg.SLB[i+1]*1.00002/s; rcam.updateProjectionMatrix();
      Rn.clearDepth(); Rn.render(sysScene, rcam);
      calls += Rn.info.render.calls; tris += Rn.info.render.triangles; n++;
    }
    /* retour aux coordonnées absolues pour la logique du jeu */
    sysWorld.scale.setScalar(1); sysWorld.position.set(0, 0, 0); sysWorld.updateMatrixWorld();
    shipWorld.visible = true; shipWorld.position.set(0, 0, 0); shipWorld.updateMatrixWorld();
    Rn.autoClear = autoClear;
    stats.calls = calls; stats.triangles = tris; stats.slices = n;
  }

  return { sysScene: sysScene, sysWorld: sysWorld, shipWorld: shipWorld, rcam: rcam,
           cfg: cfg, stats: stats, render: render, detach: detach };
})();
