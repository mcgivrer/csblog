/* =========================================================================
   INERTIE DE ROTATION
   Le vaisseau ne tourne plus instantanément : les commandes appliquent un
   COUPLE, qui fait évoluer une vitesse angulaire, laquelle intègre
   l'orientation. Un cargo de plusieurs centaines de tonnes met plusieurs
   secondes à établir puis à annuler sa rotation — c'est ce retard qui donne
   la sensation de masse.
   L'amortissement représente les tuyères de stabilisation : sans lui, en
   l'absence de frottement, le vaisseau tournerait indéfiniment.
   ========================================================================= */
const angVel = new THREE.Vector3();      /* rad/s autour des axes LOCAUX X,Y,Z */
const TORQUE   = {pitch:0.30, yaw:0.26, roll:0.42};  /* accélération angulaire (rad/s²) */
const ANG_MAX  = {pitch:0.42, yaw:0.38, roll:0.72};  /* vitesse angulaire plafond */
const ANG_DAMP = 0.55;                   /* stabilisation quand la commande est relâchée */
const _qDelta = new THREE.Quaternion();
const _eTmp = new THREE.Euler();
/* vecteurs de travail réutilisés par l'autopilote (évite d'allouer
   plusieurs Vector3 par image, dans une boucle appelée 60 fois/s) */
const _routeTmpA = new THREE.Vector3();
const _routeTmpB = new THREE.Vector3();
const _routeTmpC = new THREE.Vector3();
const _routeTmpD = new THREE.Vector3();
const _routeTmpE = new THREE.Vector3();
const _routeTmpF = new THREE.Vector3();
const _qInv = new THREE.Quaternion();

function applyAngular(dt){
  /* intégration de l'orientation à partir de la vitesse angulaire */
  if(angVel.lengthSq() > 1e-12){
    _eTmp.set(angVel.x*dt, angVel.y*dt, angVel.z*dt, 'XYZ');
    _qDelta.setFromEuler(_eTmp);
    shipRig.quaternion.multiply(_qDelta);
    shipRig.quaternion.normalize();
  }
}

function updateFlight(dt, elapsed){
  /* séquence de saut quantique (§23.5) en cours : non interruptible, prend
     entièrement la main sur cette fonction — ni pilotage, ni caméra (qui
     reste fixe, cf. commentaire de updateJumpSequence) tant qu'elle dure. */
  if(jumpState){ updateJumpSequence(dt); return; }
  const paused = (flightPhase === 'ARRIVAL_PAUSE');

  /* sollicitation d'attitude de l'image, remise à zéro à chaque tour */
  rcsDemand.yaw = 0; rcsDemand.pitch = 0; rcsDemand.roll = 0;

  const pitchInput = ((keys['ArrowUp']||keys['KeyZ']||keys['KeyW'])?1:0) - ((keys['ArrowDown']||keys['KeyS'])?1:0);
  const yawInput   = ((keys['ArrowLeft']||keys['KeyQ']||keys['KeyA'])?1:0) - ((keys['ArrowRight']||keys['KeyD'])?1:0);
  const rollKey    = (keys['KeyE']?1:0) - (keys['KeyR']?1:0);

  const hasManualInput = pitchInput!==0 || yawInput!==0 || rollKey!==0 || dragYaw!==0 || dragPitch!==0;
  if(hasManualInput) lastInputTime = performance.now();
  manual = !paused && (performance.now() - lastInputTime) < IDLE_MS;

  /* --- couples demandés, exprimés dans le repère local du vaisseau ---
     Signes : un tangage « cabrer » (pitchInput +1) correspond à un couple
     NÉGATIF autour de X, et un roulis (rollKey +1) à un couple négatif
     autour de Z. Les tuyères RCS lisent exactement les mêmes valeurs, ce
     qui garantit qu'elles soufflent du bon côté. */
  let tx = 0, ty = 0, tz = 0;

  if(paused){
    /* pause d'arrivée : aucune commande, aucun pilotage — la vitesse
       angulaire s'éteint par le seul amortissement, plus bas dans cette
       fonction, exactement comme un axe relâché en vol normal. */
  } else {
    /* v2.17 : suivi de la spline d'itinéraire et arrivée (unités de jeu) retirés — REAL.flight pilote le vol.
       Reste le pilotage manuel : son couple agit sur l'attitude (approche, orbite) comme avant. */
    if(manual){
      tx += -pitchInput * TORQUE.pitch;
      ty +=  yawInput   * TORQUE.yaw;
      tz += -rollKey    * TORQUE.roll;

      /* la souris agit comme un manche : impulsion proportionnelle au geste */
      if(dragYaw || dragPitch){
        ty += dragYaw   * TORQUE.yaw   * 55;
        tx += dragPitch * TORQUE.pitch * 55;
        dragYaw = 0; dragPitch = 0;
      }
    }
  }

  /* --- intégration : couple -> vitesse angulaire --- */
  angVel.x += tx*dt;
  angVel.y += ty*dt;
  angVel.z += tz*dt;

  /* amortissement actif sur les axes sans commande (tuyères de maintien) */
  const damp = Math.exp(-ANG_DAMP*dt);
  if(Math.abs(tx) < 1e-4) angVel.x *= damp;
  if(Math.abs(ty) < 1e-4) angVel.y *= damp;
  if(Math.abs(tz) < 1e-4) angVel.z *= damp;

  angVel.x = THREE.MathUtils.clamp(angVel.x, -ANG_MAX.pitch, ANG_MAX.pitch);
  angVel.y = THREE.MathUtils.clamp(angVel.y, -ANG_MAX.yaw,   ANG_MAX.yaw);
  angVel.z = THREE.MathUtils.clamp(angVel.z, -ANG_MAX.roll,  ANG_MAX.roll);

  applyAngular(dt);

  /* --- les tuyères soufflent selon le COUPLE réellement appliqué ---
     Seuil : une correction infime ne doit pas déclencher un jet visible. */
  const TQ_TH = 0.02;
  if(Math.abs(tx) > TQ_TH) rcsDemand.pitch = Math.sign(tx);
  if(Math.abs(ty) > TQ_TH) rcsDemand.yaw   = Math.sign(ty);
  if(Math.abs(tz) > TQ_TH) rcsDemand.roll  = Math.sign(tz);

  const boosting = !paused && !!(keys['ShiftLeft']||keys['ShiftRight']||keys['Space']);
  let forward;
  if(paused){
    /* position et orientation pilotées par la mécanique orbitale, pas par
       l'intégration couple/vitesse habituelle */
    forward = updateOrbitDelivery(dt);
  } else {
    /* v2.17 : vitesse, translation et consommation au km de l'ancien vol retirées — REAL.flight fixe la
       position, la vitesse physique et le carburant (Δv). Le niveau de distorsion suit le passage (L2.4). */
    WARP_LEVEL += (REAL.warpTarget - WARP_LEVEL)*Math.min(1, dt*(REAL.warpTarget > WARP_LEVEL ? 1.0 : 1.6));
    forward = new THREE.Vector3(0,0,-1).applyQuaternion(shipRig.quaternion);
  }

  const speedlines = document.getElementById('speedlines');
  speedlines.style.opacity = boosting && WARP_LEVEL < 0.2 ? '0.5' : '0';   /* v2.16 : en supraluminique, traînées 3D (updateWarpStreaks) */

  /* réacteurs : le cœur et le panache réagissent à la poussée.
     Scintillement volontairement faible (±2 %) et lent : un moteur de
     croisière doit paraître stable, pas clignotant. */
  const glowScale = boosting ? 4.4 : 3.0;
  /* puissance affichée = ratio de la vitesse de consigne réellement établie
     sur la vitesse maximale ; c'est la même grandeur physique qui pilote
     déjà le déplacement, donc jauges et mouvement ne peuvent pas diverger */
  /* v2.17 : poussée du profil de vol réel (1 en accélération/freinage, 0 sur l'erre et pendant les retournements) —
     l'ancienne formule (vitesse / vitesse de croisière) saturait à 1 en permanence en mètres par seconde */
  const enginePowerBase = THREE.MathUtils.clamp(REAL.throttle || 0, 0, 1);
  const mainPowers = [];
  (window.__engineGlows||[]).forEach(function(g, i){
    g.scale.set(glowScale,glowScale,1);
    const flicker = 0.98 + 0.02*Math.sin(elapsed*3.2 + g.position.x*3.1);
    mainPowers[i] = THREE.MathUtils.clamp(enginePowerBase*flicker, 0, 1);
  });
  if(!jumpState) SHIPGEN.FTL_U.uField.value = 0.45*WARP_LEVEL;   /* bulle de distorsion pendant la croisière supraluminique */
  updateWarpStreaks(dt);                                          /* v2.16 : traînées d'étoiles */
  SHIPGEN.tick(elapsed, dt, jumpState ? WARP_SPIN : 1 + 5*WARP_LEVEL);
  SHIPGEN.setDrive({ throttle: WARP_THR !== null ? WARP_THR : 0.12 + 0.88*enginePowerBase });
  (window.__engineCones||[]).forEach(function(c){
    /* le panache s'allonge et s'intensifie en propulsion
       (facteur borné : au-delà, la pointe viendrait traverser la caméra) */
    const stretch = boosting ? 1.45 : 1.0;
    const flicker = 0.98 + 0.02*Math.sin(elapsed*3.2 + c.position.x*3.1);
    c.scale.set(1, stretch*flicker, 1);
    c.material.opacity = (boosting ? 0.42 : 0.26) * flicker;
  });
  (window.__navLights||[]).forEach(function(m){ m.opacity = 0.4+0.6*Math.abs(Math.sin(elapsed*3 + (m===window.__navLights[1]?Math.PI:0))); });

  /* ---------- tuyères d'attitude ----------
     Montée rapide à l'allumage, extinction plus lente : c'est cette
     asymétrie qui donne la sensation d'une bouffée de gaz qui se dissipe
     plutôt que d'un interrupteur. */
  const rise = 1 - Math.exp(-dt*22);
  const fall = 1 - Math.exp(-dt*6);
  function ramp(cur, target){
    return cur + (target - cur) * (target > cur ? rise : fall);
  }
  rcsLevel.yawP   = ramp(rcsLevel.yawP,   rcsDemand.yaw   > 0.05 ? 1 : 0);
  rcsLevel.yawN   = ramp(rcsLevel.yawN,   rcsDemand.yaw   < -0.05 ? 1 : 0);
  rcsLevel.pitchP = ramp(rcsLevel.pitchP, rcsDemand.pitch > 0.05 ? 1 : 0);
  rcsLevel.pitchN = ramp(rcsLevel.pitchN, rcsDemand.pitch < -0.05 ? 1 : 0);
  rcsLevel.rollP  = ramp(rcsLevel.rollP,  rcsDemand.roll  > 0.05 ? 1 : 0);
  rcsLevel.rollN  = ramp(rcsLevel.rollN,  rcsDemand.roll  < -0.05 ? 1 : 0);

  (window.__rcs||[]).forEach(function(t){
    const key = t.axis + (t.sign > 0 ? 'P' : 'N');
    const lvl = rcsLevel[key] || 0;
    t.currentLevel = lvl;   /* lu par le panneau de jauges et la télémétrie */
    if(lvl < 0.01){ t.jet.material.opacity = 0; t.jet.visible = false; return; }
    /* crépitement rapide propre à chaque tuyère : jet de gaz sous pression */
    const sput = 0.75 + 0.25*Math.sin(elapsed*38 + t.jet.position.x*7.7 + t.jet.position.y*4.3);
    t.jet.visible = true;
    t.jet.material.opacity = lvl * 0.75 * sput;
    /* la trainée s'allonge dans SON axe (Y local du cône = axe d'éjection) :
       facteur 2 sur la longueur, l'épaisseur restant contenue */
    const w = t.base * (0.65 + lvl*0.45) * (0.85 + 0.15*sput);
    const l = t.base * (0.8 + lvl*1.6) * (0.80 + 0.20*sput) * 2.0;
    t.jet.scale.set(w, l, w);
  });

  /* ---------- panneau de jauges : lecture directe des grandeurs ci-dessus ---------- */
  (window.__gaugeEls.main||[]).forEach(function(g, i){
    const pct = Math.round((mainPowers[i]||0)*100);
    if(g.fill) g.fill.style.height = pct+'%';
    if(g.pct)  g.pct.textContent = pct+'%';
  });
  (window.__gaugeEls.rcs||[]).forEach(function(g){
    if(g.fill) g.fill.style.height = Math.round((g.thruster.currentLevel||0)*100)+'%';
  });

  /* jauge carburant (§22.4) : classe warn/crit sous les seuils plutôt qu'une
     couleur recalculée en JS à chaque image (cf. règles CSS .gauge.fuel). */
  const fuelPctEl = document.getElementById('fuelPct');
  const fuelFillEl = document.getElementById('fuelFill');
  const fuelGaugeEl = document.getElementById('fuelGauge');
  if(fuelFillEl){
    const fuelRatio = fuel / FUEL_CAPACITY;
    fuelFillEl.style.height = Math.round(fuelRatio*100)+'%';
    if(fuelPctEl) fuelPctEl.textContent = Math.round(fuelRatio*100)+'%';
    if(fuelGaugeEl){
      fuelGaugeEl.classList.toggle('crit', fuelRatio < FUEL_CRIT_RATIO);
      fuelGaugeEl.classList.toggle('warn', fuelRatio >= FUEL_CRIT_RATIO && fuelRatio < FUEL_WARN_RATIO);
    }
  }

  /* ---------- dialogue de télémétrie : commandes envoyées aux moteurs ---------- */
  updateTelemetryPanel(mainPowers, boosting);
  updateEngineTemps(mainPowers, dt);

  /* ---------- balises clignotantes de la nacelle ----------
     Chaque balise suit son propre cycle : phase et période distinctes,
     avec un rapport cyclique court (éclat bref) et un fondu en sortie. */
  (window.__beacons||[]).forEach(function(b){
    const t = ((elapsed + b.phase) % b.period) / b.period;
    let v = 0;
    if(t < b.duty){
      /* éclat : montée quasi instantanée puis décroissance */
      v = Math.pow(1 - t/b.duty, 1.6);
    }
    b.mat.opacity = v * b.peak;
  });

  /* ---------- respiration douce de la baie du dock ----------
     Contrairement aux balises (éclat bref, cyclique), la baie reste
     allumée en permanence — seule son intensité varie légèrement, pour
     donner une impression de système actif plutôt qu'un néon statique. */
  const dockPulse = 0.85 + 0.15*Math.sin(elapsed*0.6);
  if(window.__dockGlow) window.__dockGlow.mat.emissiveIntensity = window.__dockGlow.baseIntensity * dockPulse;
  if(window.__dockHalos) window.__dockHalos.forEach(function(h){ h.material.opacity = h.userData.baseOpacity !== undefined ? h.userData.baseOpacity*dockPulse : h.material.opacity; });
  if(window.__dockLight) window.__dockLight.intensity = 1.4 * dockPulse;

  /* caméra : poursuite normale, ou plan cinématique orbitant la PLANÈTE
     pendant la mise en orbite/livraison — pour garder le vaisseau ET la
     planète dans le cadre. Les deux branches écrivent dans les MÊMES
     variables partagées (camPos/camLook) : la transition reste amortie par
     le lerp, jamais de saut brutal au changement d'état. */
  if(paused){
    arrivalTimeScale = arrivalSkip ? ARRIVAL_FF_SCALE : 1;
    pauseTimer += dt*arrivalTimeScale;
    const os = orbitState;

    if(os.cutawayUntil > pauseTimer){
      /* ---------- mise en scène du largage : gros plan sur le dock, puis
         suivi selon la séquence tirée au hasard pour CETTE navette
         (catalogue de 4, §15 de la spec) ----------
         « travelling » excepté, les trois autres séquences comportent une
         COUPURE FRANCHE (pas un fondu) entre le gros plan et le suivi —
         cutawayCut n'autorise ce saut qu'une fois par largage.

         Correctif (bugs remontés en jeu) : le suivi utilisait les axes
         PROPRES du vaisseau (shipRight/shipUp/shipFwd), recalculés à
         chaque image depuis son orientation réelle — or le vaisseau
         tourne en continu pendant toute la mise en orbite (son nez doit
         suivre la tangente de la trajectoire circulaire). La caméra de
         suivi héritait donc de ce balayage permanent, ce qui donnait une
         image mal centrée et instable (« tremblement »). Le suivi
         s'ancre maintenant sur le repère STABLE de l'orbite (os.U/V/N,
         fixé une fois pour toute l'escale) plutôt que sur des axes qui
         tournent sous la caméra. Les distances ont aussi été resserrées :
         la navette, trop petite à l'écran, restait à peine identifiable. */
      const shuttle = os.shuttles.find(function(s){ return s.id === os.cutawayShuttleId; });
      const dockPos = new THREE.Vector3();
      if(window.shipDockAnchor) window.shipDockAnchor.getWorldPosition(dockPos);
      else dockPos.copy(shipRig.position);
      const shipUp = new THREE.Vector3(0,1,0).applyQuaternion(shipRig.quaternion);
      const shipRight = new THREE.Vector3(1,0,0).applyQuaternion(shipRig.quaternion);
      const shipFwd = new THREE.Vector3(0,0,-1).applyQuaternion(shipRig.quaternion);
      /* repère stable de l'orbite (ne tourne pas avec le vaisseau) —
         orienté de façon cohérente avec shipRight/shipUp au moment du
         largage, pour que la séquence tirée garde le même « sens » visuel
         qu'avant ce correctif.
         Correctif (bug remonté en jeu) : le PLAN RAPPROCHÉ de chargement
         (closeUpPos, juste en dessous) utilisait encore shipRight/shipUp/
         shipFwd — vivants, recalculés à chaque image depuis l'orientation
         RÉELLE du vaisseau — alors que celui-ci tourne en continu pendant
         toute la manœuvre d'orbite. Le cadrage du gros plan balayait donc
         un angle totalement différent d'une image à l'autre (vérifié :
         coque à t=0.2s, tuyères à t=1.5s, coque sous un autre angle à
         t=3.3s, pour une seule et même prise) — perçu comme un tremblement
         du vaisseau, et empêchait de voir clairement le dock ou la navette
         en sortir. Le correctif précédent n'avait stabilisé que le plan de
         SUIVI (après la coupure) ; le plan RAPPROCHÉ, juste avant, avait le
         même défaut et n'avait pas été couvert. Un troisième axe stable
         (stableFwd) complète stableRight/stableUp ci-dessous, sur le même
         principe. */
      const stableRight = os.U.clone().multiplyScalar(os.U.dot(shipRight) >= 0 ? 1 : -1);
      const stableUp    = os.N.clone().multiplyScalar(os.N.dot(shipUp)    >= 0 ? 1 : -1);
      const stableFwd   = os.V.clone().multiplyScalar(os.V.dot(shipFwd)   >= 0 ? 1 : -1);
      const shuttlePos = shuttle ? shuttle.group.position : dockPos;
      const seq = os.cutawaySeq || 'lateral';

      const p = Math.max(0, pauseTimer - os.cutawayStart);
      const closeT = Math.min(1, p / SHUTTLE_CLOSEUP_DURATION);

      /* cadrage du gros plan de chargement : ni le dock seul, ni le stock
         seul — un point de vue reculé qui cadre les deux à la fois, pour
         que le geste du bras (qui va de l'un à l'autre) reste lisible
         d'un bout à l'autre, plutôt qu'un cadrage centré sur le seul
         dock qui coupait le stock hors champ. */
      const stagePos = new THREE.Vector3();
      if(window.shipCargoStageAnchor) window.shipCargoStageAnchor.getWorldPosition(stagePos);
      else stagePos.copy(dockPos);
      const loadMidpoint = dockPos.clone().lerp(stagePos, 0.5);
      const closeUpPos = loadMidpoint.clone()
        .addScaledVector(stableRight, 9).addScaledVector(stableUp, -1.5).addScaledVector(stableFwd, 5);
      const closeUpLook = loadMidpoint;

      let desiredPos, desiredLook, lerpRate, lookLerpRate;

      if(seq === 'travelling'){
        /* pas de coupure : un seul mouvement continu du gros plan au suivi
           rapproché — distance divisée par plus de 2 par rapport à avant */
        const farPos = dockPos.clone().addScaledVector(stableRight, 38).addScaledVector(stableUp, 15);
        const t = Math.min(1, p / CUTAWAY_DURATION);
        const ease = t*t*(3-2*t);
        desiredPos = closeUpPos.clone().lerp(farPos, ease);
        desiredLook = closeUpLook.clone().lerp(shuttlePos, ease);
        lerpRate = 3.2; lookLerpRate = 3.2;
        /* évitement d'obstacles seulement une fois assez éloigné du cargo
           (ease > 0.5) : en tout début de mouvement, la caméra EST tout
           près de la coque par construction (départ sur closeUpPos, cf.
           bug du plan rapproché plus haut) — l'exclure dès l'obstacle
           entier ferait sursauter la caméra dès la première image. */
        if(ease > 0.5){
          const camObstacles = [{ center: shipRig.position, radius: SHIP_HULL_RADIUS }];
          if(orbitState.planet) camObstacles.push({ center: orbitState.planet.position, radius: orbitState.planet.radius });
          clearCameraObstacles(desiredPos, desiredLook, camObstacles);
        }
      } else if(closeT < 1){
        /* phase de gros plan, commune aux trois séquences à coupure */
        desiredPos = closeUpPos;
        desiredLook = closeUpLook;   /* même cadrage de chargement quelle que soit la séquence tirée */
        lerpRate = 7; lookLerpRate = 7;
      } else {
        /* phase de suivi, propre à chaque séquence — ancrée sur le repère
           stable de l'orbite, pas sur les axes rotatifs du vaisseau. La
           coupure elle-même (saut instantané) est appliquée juste après
           ce bloc. */
        if(seq === 'face'){
          /* suivi latéral large : le port de destination entre progressivement dans le cadre */
          desiredPos = dockPos.clone().addScaledVector(stableRight, 42).addScaledVector(stableUp, 6);
          const target = orbitState.planet ? orbitState.planet.position : shuttlePos;
          desiredLook = shuttlePos.clone().lerp(target, 0.3);
        } else if(seq === 'shoulder'){
          /* plan fixe SOLIDAIRE DE L'ORBITE (plus du vaisseau) : la navette s'éloigne dans le cadre */
          desiredPos = dockPos.clone()
            .addScaledVector(stableRight, 15).addScaledVector(stableUp, 6).addScaledVector(stableFwd, 4);
          desiredLook = shuttlePos;
        } else {
          /* « lateral » : suivi à distance rapprochée, légèrement en hauteur-arrière */
          desiredPos = shuttlePos.clone().addScaledVector(stableRight, 26).addScaledVector(stableUp, 17);
          desiredLook = shuttlePos;
        }
        /* suivi plus réactif qu'avant (2.0 → 4.5) : la navette, en pleine
           accélération sur son arc, sortait du cadre le temps que la
           caméra la rattrape — d'où l'impression de cadrage décentré. */
        lerpRate = 4.5; lookLerpRate = 6;

        /* évitement d'obstacles (bug remonté en jeu) : la cible de ces trois
           séquences est la NAVETTE, pas le cargo — qui reste pourtant un
           obstacle massif tout proche du point de départ. Repéré très
           concrètement en testant chaque séquence : « shoulder » plaçait la
           caméra à ~17 unités du point d'ancrage, à l'intérieur même de la
           coque (rayon mesuré ~20). Le cargo est donc traité ici comme un
           obstacle à contourner, jamais comme la cible — cf. clearCameraObstacles
           plus haut. La planète cible s'ajoute quand elle existe, même logique. */
        const camObstacles = [{ center: shipRig.position, radius: SHIP_HULL_RADIUS }];
        if(orbitState.planet) camObstacles.push({ center: orbitState.planet.position, radius: orbitState.planet.radius });
        clearCameraObstacles(desiredPos, desiredLook, camObstacles);
      }

      /* coupure franche : au premier passage en phase de suivi, on saute
         directement à la nouvelle position plutôt que d'y glisser */
      if(seq !== 'travelling' && closeT >= 1 && !os.cutawayCut){
        camPos.copy(desiredPos);
        camLook.copy(desiredLook);
        os.cutawayCut = true;
      }

      camPos.lerp(desiredPos, Math.min(1, dt*lerpRate));
      camera.position.copy(camPos);
      camLook.lerp(desiredLook, Math.min(1, dt*lookLerpRate));
      camera.up.set(0,1,0);
      camera.lookAt(camLook);
    } else {
      /* ---------- plan d'ensemble : orbite autour de la planète ----------
         Le regard libre (Ctrl+souris) décale l'angle et la hauteur de ce
         plan, pour regarder autour de soi sans interrompre la manœuvre.
         Rotation et amortissement volontairement lents : un travelling
         posé, pas un survol précipité. */
      const camAngle = pauseTimer*0.09 + os.camPhase0 + camOrbitYaw;
      const camDist = os.radius*1.9;
      const camHeight = os.radius*0.55 + Math.sin(pauseTimer*0.18)*os.radius*0.08 + camOrbitPitch*os.radius*0.6;
      const desired = REAL.active ? REAL.orbitCam(camAngle, camOrbitPitch).pos : os.center.clone()
        .addScaledVector(os.U, Math.cos(camAngle)*camDist)
        .addScaledVector(os.V, Math.sin(camAngle)*camDist)
        .addScaledVector(os.N, camHeight);
      camPos.lerp(desired, Math.min(1, dt*0.9));
      camera.position.copy(camPos);
      /* on regarde un point entre le vaisseau et la planète, pondéré vers la
         planète, pour que l'orbite entière (et les navettes) reste lisible */
      const lookTarget = REAL.active ? REAL.orbitCam(camAngle, camOrbitPitch).look : os.center.clone().lerp(shipRig.position, 0.35);
      camLook.lerp(lookTarget, Math.min(1, dt*0.9));
      if(REAL.active) camera.up.copy(REAL.radialUp()); else camera.up.set(0,1,0);   /* L2.3 : horizon de la planète en bas de l'image */
      camera.lookAt(camLook);
    }

    /* fin de la manœuvre : la durée minimale, la fin complète du dialogue
       radio (dernier message affiché, sa lecture terminée) ET l'atterrissage
       de toutes les navettes déjà larguées sont nécessaires — sans ces
       conditions, une voix lente, des messages nombreux ou des navettes
       ralenties pourraient se faire couper avant la fin par le simple
       minuteur. */
    const radioDone = os.radioIdx >= os.radioScript.length && !radioSpeaking;
    const shuttlesDone = os.spawned.every(Boolean) && os.shuttles.length === 0 && !os.loading;
    /* plafond défensif : si quelque chose empêchait radioDone/shuttlesDone
       de devenir vrais (cas non prévu), la manœuvre se termine quand même
       plutôt que de bloquer indéfiniment le vol. */
    /* lot N2 : la navette de baie manœuvre lentement près du vaisseau (≈ 100 s avant de partir, ≈ 170 s aller-retour) —
       le plafond de 90 s terminait l'escale navette encore dehors : le vaisseau repartait et la navette le poursuivait
       à des milliards de km (rotations aberrantes, plus de plan de suivi). Plafond prolongé pour les vaisseaux à baie. */
    const hardCap = pauseTimer >= ARRIVAL_PAUSE_DURATION*2.5 + ((typeof CARGO !== 'undefined' && CARGO.hasBay()) ? 360 : 0);
    /* M1 : escale sans livraison (départ, ou port sans mission à livrer) : terminée dès qu'une mission est acceptée */
    const missionGo = !!os.missionGo && shuttlesDone;
    if((pauseTimer >= ARRIVAL_PAUSE_DURATION && radioDone && shuttlesDone) || hardCap || missionGo){
      flightPhase = 'CRUISE';
      pauseTimer = 0;
      orbitState.active = false;
      arrivalSkip = false;
      arrivalTimeScale = 1;
      const radioPanel = document.getElementById('radioPanel');
      if(radioPanel) radioPanel.classList.remove('visible');
      /* le panneau services portuaires n'est plus lié au cycle de vie de
         l'escale (cf. startOrbitDelivery) — on ne le referme plus ici,
         le joueur garde la main via son icône dédiée. */
      const arrivalHint = document.getElementById('arrivalHint');
      if(arrivalHint) arrivalHint.style.display = 'none';
      if(window.speechSynthesis) window.speechSynthesis.cancel();
    }
  } else {
    arrivalTimeScale = 1;
    if(CAMERA_MODES[cameraMode] === 'sequence'){
      /* ---------- plan-séquence : orbite continue autour du vaisseau ----------
         Un plan filmé façon drone qui tourne lentement autour de l'appareil
         pendant qu'il vole, plutôt qu'une poursuite fixe derrière lui. */
      const seqAngle = elapsed*0.18;
      const fS = SHIP_GAME_LEN/40;   /* L10 : distances à l'échelle du vaisseau (95 m et 26 m pour l'ancien vaisseau de 40 u) */
      const seqRadius = 95*fS;
      const seqHeight = (26 + Math.sin(elapsed*0.25)*10)*fS;
      const shipUp = new THREE.Vector3(0,1,0).applyQuaternion(shipRig.quaternion);
      const shipRight = new THREE.Vector3(1,0,0).applyQuaternion(shipRig.quaternion);
      const shipFwd = new THREE.Vector3(0,0,-1).applyQuaternion(shipRig.quaternion);
      const offset = shipRight.clone().multiplyScalar(Math.cos(seqAngle)*seqRadius)
        .addScaledVector(shipFwd, Math.sin(seqAngle)*seqRadius)
        .addScaledVector(shipUp, seqHeight);
      const desired = shipRig.position.clone().add(offset);
      /* évitement d'obstacles (bug remonté en jeu, portée générale : « lors
         de ses travelling, la caméra traverse parfois vaisseau, planète,
         objet ») : cette orbite tourne à proximité du vaisseau — la cible —
         mais peut, à certains angles, se retrouver du mauvais côté d'une
         planète toute proche pendant l'approche. Seule la planète de
         l'étape en cours entre en jeu ici (le vaisseau LUI-MÊME est la
         cible, jamais un obstacle pour son propre plan). Vérifié bon marché
         : ignoré la plupart du temps, une seule planète candidate, pas de
         parcours de liste. */
      const seqLeg = ROUTE.legs && ROUTE.legs[ROUTE.index];
      if(seqLeg && seqLeg.planet && shipRig.position.distanceTo(seqLeg.planet.position) < seqLeg.planet.radius*6){
        clearCameraObstacles(desired, shipRig.position, [{ center: seqLeg.planet.position, radius: seqLeg.planet.radius }]);
      }
      camPos.lerp(desired, Math.min(1, dt*2.2));
      camera.position.copy(camPos);
      camLook.lerp(shipRig.position, Math.min(1, dt*2.2));
      camera.up.set(0,1,0);
      camera.lookAt(camLook);
    } else if(CAMERA_MODES[cameraMode] === 'distant'){
      /* ---------- plans lointains : coupes franches, décor en fond ---------- */
      if(elapsed > distantShotState.until) pickDistantShot(elapsed);
      camera.position.copy(shipRig.position).add(distantShotState.offset);
      camPos.copy(camera.position);
      camLook.copy(shipRig.position);
      camera.up.set(0,1,0);
      camera.lookAt(camLook);
    } else {
      /* ---------- poursuite standard ----------
         Caméra en poursuite, avec un léger amortissement pour un rendu
         cinématique. Le regard libre (Ctrl+souris) tourne l'offset de
         poursuite AUTOUR du vaisseau, dans son propre repère, avant d'être
         orienté par son cap : on regarde autour de soi sans changer la
         trajectoire suivie. */
      const freeLook = new THREE.Quaternion().setFromEuler(new THREE.Euler(camOrbitPitch, camOrbitYaw, 0, 'YXZ'));
      const camQuat = shipRig.quaternion.clone().multiply(freeLook);
      const desiredCamPos = shipRig.position.clone().add(CAM_OFFSET.clone().applyQuaternion(camQuat));
      camPos.lerp(desiredCamPos, Math.min(1, dt*4.5));
      camera.position.copy(camPos);
      const desiredLook = shipRig.position.clone().add(forward.clone().multiplyScalar(45));
      camLook.lerp(desiredLook, Math.min(1, dt*4.5));
      camera.up.copy(new THREE.Vector3(0,1,0).applyQuaternion(shipRig.quaternion));
      camera.lookAt(camLook);
    }
  }

  const apLive = REAL.active && REAL.started && REAL.phase !== 'ORBIT';   /* échelle réelle : le badge suit le pilote automatique (G), pas l'inactivité des commandes */
  const isManual = apLive ? !REAL.ap.on : manual;
  document.getElementById('modeBadge').textContent =
    paused ? t('badge_orbit') : (isManual ? t('badge_manual') : t('badge_auto'));
  document.getElementById('modeBadge').className =
    'hud-mode mono ' + (paused ? 'auto' : (isManual?'manual':'auto'));
}
