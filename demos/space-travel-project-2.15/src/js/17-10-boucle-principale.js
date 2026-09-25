/* =========================================================================
   10. BOUCLE PRINCIPALE
   ========================================================================= */
const clock = new THREE.Clock();
let chunkAccum = 0;
/* =========================================================================
   ANIMATION DES SYSTÈMES PLANÉTAIRES CONSTRUITS
   Spin, éclairage propre à l'étoile hôte (et non l'étoile dominante du
   vaisseau — chaque planète est éclairée par SON soleil), dérive des
   nuages (via uTime), orbite des satellites.
   ========================================================================= */
const _planetLightDir = new THREE.Vector3();
function updatePlanetSystems(dt, elapsed){
  ROUTE.builtSystems.forEach(function(grp, legIndex){
    const leg = ROUTE.legs[legIndex];
    if(!leg || !leg.system) return;
    leg.system.planets.forEach(function(p){
      if(!p.mesh) return;
      p.mesh.rotation.y += p.spinSpeed*dt;
      const u = p.mesh.material.uniforms;
      u.uTime.value = elapsed;
      _planetLightDir.copy(leg.starPosition).sub(p.position).normalize();
      u.uLightDir.value.copy(_planetLightDir);
      u.uLightColor.value.setRGB(leg.star.color.r, leg.star.color.g, leg.star.color.b);
      (p.moonPivots||[]).forEach(function(pivot){
        pivot.rotation.y += pivot.userData.speed*dt;
      });
    });
  });
}

function animate(){
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.getElapsedTime();

  /* travelling de fond de l'écran-titre (demande utilisateur) : tant que
     la partie n'a pas commencé, on ne fait tourner qu'une caméra
     cinématique et un minimum d'entretien visuel (scintillement des
     étoiles, dérive des nébuleuses) — jamais le pilotage, jamais le HUD
     (déjà masqués par CSS, cf. body.title-active), jamais les étiquettes
     de ciblage. worldReadyForCinematic protège contre un premier appel
     avant que finish() n'ait eu la main (cf. générique). */
  if(!gameStarted){
    if(worldReadyForCinematic){
      updateTitleCinematic(dt);
      /* bug remonté en jeu (étoiles de décoration trop rapides / passant
         devant d'autres objets) : le fond d'étoiles lointaines (skybox,
         dust, accent…) n'est normalement recentré que sur la position du
         VAISSEAU (plus bas dans cette fonction, animate() en vol normal)
         — jamais mis à jour ici, puisque le vaisseau ne bouge pas pendant
         l'écran-titre. La caméra cinématique, elle, parcourt plusieurs
         centaines/milliers d'unités : le fond, resté figé près de
         l'origine, se faisait donc traverser plutôt que rester à distance
         infinie perçue, d'où une vitesse apparente excessive et le risque
         de passer devant les étoiles/planètes/nébuleuses réelles du plan
         en cours. Recentré ici sur la CAMÉRA plutôt que sur le vaisseau. */
      backdrop.position.copy(camera.position);
      /* les étoiles sont modélisées à une échelle physique minuscule
         (quelques dixièmes d'unité, cf. buildStarCell) : leur taille
         APPARENTE ne vient que du calcul d'angle ci-dessous (repris tel
         quel de la boucle de jeu normale, plus bas dans cette fonction),
         normalement recalculé chaque image en vol. Sans lui, une étoile
         reste un point sub-pixel à toute distance de caméra un tant soit
         peu réaliste — cause du fond resté noir en test malgré une caméra
         correctement positionnée : la scène ÉTAIT bien cadrée, mais rien
         dedans n'était assez grand pour être vu. */
      const camPosNow = camera.position;
      starField.forEach(function(o){
        if(!o) return;
        const d = o.mesh.position.distanceTo(camPosNow);
        const angular = THREE.MathUtils.clamp(o.baseCore*26/Math.max(d,1), 0.3, 9.0);
        o.core.scale.setScalar(angular);
        o.core.material.uniforms.time.value = elapsed;
        const distPc = Math.max(d/38, 1e-3);
        const mag = apparentMagnitude(o.star.lum, distPc);
        const flux = Math.pow(10, -0.4*(mag-4.0));
        const perceived = THREE.MathUtils.clamp(Math.pow(flux, 0.25), 0.0, 6.0);
        o.halo.scale.setScalar(o.baseHalo*(0.55+perceived*0.55));
        o.halo.material.opacity = THREE.MathUtils.clamp(0.25+perceived*0.35, 0.15, 1.0);
      });
      nebulaField.forEach(function(o){
        if(!o) return;
        o.mesh.material.uniforms.uTime.value = elapsed;
        const ud = o.mesh.userData;
        if(ud && ud.currentFade < ud.targetFade - 0.001){
          ud.currentFade += (ud.targetFade - ud.currentFade)*Math.min(1, dt*0.5);
          o.mesh.material.uniforms.uFade.value = ud.currentFade;
        }
      });
    }
    renderMain();
    return;
  }

  /* mode Pause (§11) : on continue d'appeler clock.getDelta() ci-dessus à
     CHAQUE image (y compris en pause) pour absorber le temps écoulé —
     sans quoi la reprise verrait un dt géant d'un coup, faisant sauter le
     vaisseau, les navettes et tous les chronos en même temps. En dessous,
     en revanche, plus rien n'avance : image figée, tout le reste de cette
     fonction est sauté. */
  if(gamePaused){
    if(starMapOpen && mapScene && mapCamera){
      mapCamera.aspect = window.innerWidth/window.innerHeight;
      mapCamera.updateProjectionMatrix();
      /* rotation automatique après inactivité (demande utilisateur) :
         très lente, uniquement si la souris n'a pas bougé sur la carte
         depuis MAP_AUTOROTATE_DELAY — jamais pendant un glisser en cours
         (mapDragging), pour ne jamais lutter contre la main du joueur. */
      mapIdleTimer += dt;
      if(mapIdleTimer > MAP_AUTOROTATE_DELAY && !mapDragging){
        mapCamYaw += dt*MAP_AUTOROTATE_SPEED;
        updateMapCameraFromSpherical();
      }
      /* scintillement discret des cœurs d'étoiles (même uniform "time" que
         dans le jeu principal) + repositionnement des étiquettes HTML,
         nécessaire ici : la caméra de la carte peut bouger (glisser/zoom)
         alors que le reste de la boucle de jeu est à l'arrêt (gamePaused). */
      const t = clock.getElapsedTime();
      starMapCandidates.forEach(function(c){ if(c.coreMat) c.coreMat.uniforms.time.value = t; });
      updateStarMapLabels();
      renderer.render(mapScene, mapCamera);
    } else {
      renderMain();
    }
    return;
  }

  updateFlight(dt, elapsed);

  chunkAccum += dt;
  if(chunkAccum > 0.5){
    chunkAccum = 0;
    refreshField(STAR_CELL, STAR_RADIUS, starField, buildStarCell);
    refreshField(NEBULA_CELL, NEBULA_RADIUS, nebulaField, buildNebulaCell);
  }

  /* nébuleuses : apparition progressive (fondu exponentiel) + dérive du temps.
     Sans ce fondu, une nébuleuse entrant dans le rayon suivi apparaîtrait
     d'un coup, pleinement opaque — un vrai « pop » visuel en plein vol. */
  nebulaField.forEach(function(obj){
    if(!obj) return;
    obj.mesh.material.uniforms.uTime.value = elapsed;
    const ud = obj.mesh.userData;
    if(ud && ud.currentFade < ud.targetFade - 0.001){
      ud.currentFade += (ud.targetFade - ud.currentFade) * Math.min(1, dt*0.5);
      obj.mesh.material.uniforms.uFade.value = ud.currentFade;
    }
  });
  backdrop.children.forEach(function(child){
    if(child.material && child.material.uniforms && child.material.uniforms.uTime){
      child.material.uniforms.uTime.value = elapsed;
    }
  });

  /* l'étoile dominante éclaire la coque, en fondu d'une étoile à l'autre */
  updateStarLighting(dt);

  /* systèmes planétaires actifs : spin, éclairage propre à chaque étoile
     hôte, dérive des nuages, orbite des satellites */
  updatePlanetSystems(dt, elapsed);
  updateCelestialLabels();
  updateShipLabels();

  /* navettes de livraison : indépendantes de la phase de vol, pour qu'une
     navette encore en approche termine son trajet même si le vaisseau
     principal a déjà repris sa route */
  updateShuttles(dt*arrivalTimeScale, elapsed);

  /* portiques : la luminosité est recalculée dans le shader à partir de la
     position et du cap du vaisseau — un seul envoi d'uniformes par image */
  if(ROUTE.gates){
    const m = ROUTE.gates.userData.material;
    m.uniforms.uShipPos.value.copy(shipRig.position);
    m.uniforms.uShipFwd.value.set(0,0,-1).applyQuaternion(shipRig.quaternion);
  }

  /* étoiles : éclat régi par la loi en carré inverse (flux ∝ L/d²),
     restitué en échelle de magnitudes + étiquette de nom projetée à l'écran */
  const shipPos = shipRig.position;
  const camForward = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
  const LABEL_RANGE = STAR_PROXIMITY_RANGE * 1.5;
  const winW = window.innerWidth, winH = window.innerHeight;
  const margin = 60;
  starField.forEach(function(obj){
    if(!obj) return;
    const d = obj.mesh.position.distanceTo(shipPos);
    const distPc = Math.max(d/38, 1e-3);

    /* magnitude apparente réelle, puis conversion en éclat perçu.
       L'œil et les capteurs répondent de façon logarithmique : on garde
       cette compression plutôt que le flux brut, qui saturerait aussitôt. */
    const mag = apparentMagnitude(obj.star.lum, distPc);
    obj.mag = mag;
    const flux = Math.pow(10, -0.4*(mag - 4.0));
    const perceived = THREE.MathUtils.clamp(Math.pow(flux, 0.25), 0.0, 6.0);

    /* le disque stellaire grandit selon son diamètre ANGULAIRE (∝ R/d) */
    const angular = THREE.MathUtils.clamp(obj.baseCore*26/Math.max(d, 1), 0.3, 9.0);
    obj.core.scale.setScalar(angular);
    obj.core.material.uniforms.time.value = elapsed;

    /* le halo grossit avec l'éclat perçu : c'est le "bloom" des étoiles
       brillantes, effet de diffusion dans l'optique comme dans l'œil */
    obj.halo.scale.setScalar(obj.baseHalo * (0.55 + perceived*0.55));
    obj.halo.material.opacity = THREE.MathUtils.clamp(0.25 + perceived*0.35, 0.15, 1.0);

    /* n'étiqueter que les étoiles effectivement détectables (mag < 9) */
    if(d > LABEL_RANGE || mag > 9){ obj.label.style.display = 'none'; return; }
    const toStar = obj.mesh.position.clone().sub(camera.position);
    if(toStar.dot(camForward) <= 0){ obj.label.style.display = 'none'; return; }
    const ndc = obj.mesh.position.clone().project(camera);
    const sx = (ndc.x*0.5+0.5)*winW;
    const sy = (1-(ndc.y*0.5+0.5))*winH;
    if(sx < -margin || sx > winW+margin || sy < -margin || sy > winH+margin){
      obj.label.style.display = 'none';
      return;
    }
    obj.label.style.display = 'block';
    obj.label.style.left = sx+'px';
    obj.label.style.top = sy+'px';
    obj.label.style.opacity = String(THREE.MathUtils.clamp(1.05 - mag/10, 0.28, 1));
  });

  /* le décor d'étoiles lointaines suit le vaisseau pour rester toujours dense */
  backdrop.position.copy(shipPos);

  updateHud(performance.now());
  renderMain();
}

