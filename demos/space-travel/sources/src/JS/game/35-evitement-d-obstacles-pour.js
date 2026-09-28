/* =========================================================================
   ÉVITEMENT D'OBSTACLES POUR LA CAMÉRA (bug remonté en jeu)
   ========================================================================= */
/* Repousse une position de caméra candidate hors de sphères d'exclusion
   (coque du cargo, planète cible...) plutôt que de laisser le plan
   traverser leur géométrie. Deux passes, indépendantes :
   1) si la position elle-même tombe DANS une sphère, la repousse
      radialement depuis le centre de cette sphère jusqu'à sa surface ;
   2) si le SEGMENT caméra→cible croise une sphère qui n'est pas la cible
      elle-même, décale la caméra perpendiculairement à ce segment pour
      dégager la ligne de mire, sans changer la distance de suivi voulue.
   Volontairement générique (liste d'obstacles en paramètre, pas figée sur
   le cargo) : sert à la fois aux séquences de largage de navette et,
   plus généralement, à tout plan « travelling » qui suit un vaisseau
   (cargo ou navette) à proximité d'une planète ou d'un autre corps. */
function clearCameraObstacles(pos, lookAt, obstacles){
  obstacles.forEach(function(ob){
    const toPos = pos.clone().sub(ob.center);
    const d = toPos.length();
    if(d < ob.radius){
      if(d < 1e-4) toPos.set(0, 1, 0.0001);
      pos.copy(ob.center).addScaledVector(toPos.normalize(), ob.radius);
    }
  });
  const toLook = lookAt.clone().sub(pos);
  const segLen = toLook.length();
  if(segLen < 1e-4) return pos;
  const dir = toLook.clone().normalize();
  obstacles.forEach(function(ob){
    const toObs = ob.center.clone().sub(pos);
    const proj = toObs.dot(dir);
    if(proj <= 0 || proj >= segLen) return;   /* obstacle pas entre caméra et cible */
    const closest = pos.clone().addScaledVector(dir, proj);
    const dist = closest.distanceTo(ob.center);
    if(dist < ob.radius){
      const lateral = pos.clone().sub(closest);
      if(lateral.lengthSq() < 1e-6){
        lateral.copy(dir).cross(new THREE.Vector3(0,1,0));
        if(lateral.lengthSq() < 1e-6) lateral.set(1,0,0);
      }
      lateral.normalize();
      pos.addScaledVector(lateral, (ob.radius - dist) + 2);
    }
  });
  return pos;
}
/* Rayon d'exclusion englobant la coque du cargo (corps arrière + caisson
   avant + porte-à-faux) — mesuré large plutôt qu'au plus juste, une marge
   généreuse coûte moins cher qu'un plan qui re-traverse la coque de justesse. */
let SHIP_HULL_RADIUS = 20;

function updateShuttleLoading(dt){
  const L = orbitState.loading;
  if(!L) return;
  L.t += dt;

  /* le dock et le stock sont solidaires du vaisseau, qui continue
     d'orbiter pendant le chargement : on les réaligne à chaque image
     plutôt que de figer une position prise au départ. */
  const dockPos = new THREE.Vector3();
  if(window.shipDockAnchor) window.shipDockAnchor.getWorldPosition(dockPos);
  else dockPos.copy(shipRig.position);
  L.shuttle.group.position.copy(L.rest ? CARGO.shipPoint(L.rest) : dockPos);   /* lot N : sous le point de dépose de la pince */
  L.shuttle.group.quaternion.copy(shipRig.quaternion);
  if(!L.grabbed){
    const stagePos = new THREE.Vector3();
    if(L.stage) stagePos.copy(CARGO.shipPoint(L.stage));                   /* exactement là où la pince saisit */
    else if(window.shipCargoStageAnchor) window.shipCargoStageAnchor.getWorldPosition(stagePos);
    else stagePos.copy(dockPos);
    L.container.position.copy(stagePos);
    L.container.quaternion.copy(shipRig.quaternion);
  }

  if(L.t < LOAD_T_REACH){
    applyArmPose(lerpArmPose(ARM_POSE_REST, ARM_POSE_REACH, THREE.MathUtils.clamp(L.t/LOAD_T_REACH, 0, 1)));
  } else if(L.t < LOAD_T_GRAB){
    applyArmPose(ARM_POSE_REACH);
    if(!L.grabbed && window.shipArm){
      L.grabbed = true;
      /* préhension : le conteneur passe dans le référentiel de la pince
         du bras, il suit désormais son mouvement automatiquement */
      LAYERS.detach(L.container);
      window.shipArm.gripper.add(L.container);
      L.container.position.set(0, 0, 0.25);
      L.container.rotation.set(0, 0, 0);
      L.container.scale.setScalar(1/CARGO.DOCK_SCALE);   /* lot N : conteneur en mètres, pince à l'échelle du module d'amarrage */
    }
  } else if(L.t < LOAD_T_PLACE){
    applyArmPose(lerpArmPose(ARM_POSE_REACH, ARM_POSE_PLACE, THREE.MathUtils.clamp((L.t-LOAD_T_GRAB)/(LOAD_T_PLACE-LOAD_T_GRAB), 0, 1)));
  } else if(L.t < LOAD_T_RELEASE){
    applyArmPose(ARM_POSE_PLACE);
    if(!L.released && window.shipArm){
      L.released = true;
      /* dépose : le conteneur passe de la pince du bras à celle de la
         navette, qui l'emporte au lancement */
      window.shipArm.gripper.remove(L.container);
      L.shuttle.clampGroup.add(L.container);
      L.container.scale.setScalar(1);   /* le berceau de la navette porte déjà l'échelle : sinon f² */
      L.container.position.set(0, 0, 0);
      L.container.rotation.set(0, 0, 0);
      L.shuttle.hasCargo = true;
    }
  } else {
    applyArmPose(lerpArmPose(ARM_POSE_PLACE, ARM_POSE_REST, THREE.MathUtils.clamp((L.t-LOAD_T_RELEASE)/(L.duration-LOAD_T_RELEASE), 0, 1)));
  }

  if(L.t >= L.duration){
    launchLoadedShuttle(L.shuttle, L.id, dockPos, L.camSeq);
    orbitState.loading = null;
  }
}

/* La navette, déjà chargée, part réellement vers la planète — reprend le
   rôle de l'ancienne spawnShuttle(), mais sans reconstruire le modèle. */
function launchLoadedShuttle(sh, id, dockPos, camSeq){
  if(sh.craft && sh.craft.thr) sh.craft.thr.value = .9;   /* lot N : tuyères de la navette-cargo allumées en vol */
  const arcOffset = new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5)
    .normalize().multiplyScalar((50 + Math.random()*70)*REAL.shipScale());   /* échelle du vaisseau */
  orbitState.shuttles.push({
    id:id, group:sh.group, glow:sh.glow, navLights:sh.navLights,
    trail:sh.trail, trailHistory:[],
    startPos:dockPos.clone(), t:0, duration:11+Math.random()*3, arcOffset:arcOffset,
    camSeq:camSeq, phase:'outbound', rest:sh.rest || null, engineBack:sh.engineBack || 1.95, craft:sh.craft || null
  });
}

/* chorégraphie du départ (amélioration demandée) : plutôt qu'un simple
   lerp direct vers la cible dès l'instant zéro, le départ suit trois temps
   bien identifiés — chute hors de la baie (repère du VAISSEAU, qui bouge
   pendant toute la manœuvre d'orbite), éloignement progressif, puis seulement
   alors mise en cap vers le port cible. */
const OUTBOUND_DROP_FRAC = 0.12;    /* fraction du trajet : chute hors baie */
const OUTBOUND_CLEAR_FRAC = 0.32;   /* fraction du trajet : fin d'éloignement */
const OUTBOUND_DROP_DIST = 14;      /* unités parcourues à la verticale du dock */
const OUTBOUND_CLEAR_DIST = 55;     /* éloignement supplémentaire avant le cap */
const _shipDown = new THREE.Vector3();
const _dockPosNow = new THREE.Vector3();
const _clearPos = new THREE.Vector3();

const _shuttleTarget = new THREE.Vector3();
/* orientation d'une navette : nez (−Z) selon dir, « haut » = verticale de la planète ; si la route est presque
   verticale (descente vers le port), le haut de secours est l'avant du vaisseau — plus de repère dégénéré */
const _shM = new THREE.Matrix4(), _shZero = new THREE.Vector3();
function shuttleAttitude(dir, pos){
  const d = dir.clone().normalize(), up = pos.clone().sub(orbitState.center || _shZero).normalize();
  let u = up; if(Math.abs(d.dot(u)) > .96) u = new THREE.Vector3(0, 0, -1).applyQuaternion(shipRig.quaternion);
  _shM.lookAt(_shZero, d, u); return new THREE.Quaternion().setFromRotationMatrix(_shM);
}
function updateShuttles(dt, elapsed){
  updateShuttleLoading(dt);
  /* distances de la sortie de soute à l'échelle du vaisseau (unités de l'ancien vaisseau de 40 u sinon) */
  const fS = REAL.shipScale(), DROP_D = OUTBOUND_DROP_DIST*fS, CLEAR_D = OUTBOUND_CLEAR_DIST*fS;
  /* traînées dans le repère du vaisseau : en orbite, tout avance à ~8 km/s — des positions absolues
     s'étireraient en une ligne de plusieurs centaines de mètres le long de l'orbite */
  if(!orbitState._lastShip) orbitState._lastShip = shipRig.position.clone();
  const _shipDelta = shipRig.position.clone().sub(orbitState._lastShip); orbitState._lastShip.copy(shipRig.position);
  if(_shipDelta.lengthSq() > 1e12) _shipDelta.set(0, 0, 0);   /* changement de système : pas de report */
  for(let i=orbitState.shuttles.length-1; i>=0; i--){
    const s = orbitState.shuttles[i];
    s.t += dt;
    const f = Math.min(1, s.t/s.duration);
    const ease = f*f*(3-2*f);

    /* cible : la planète à l'aller, le dock du vaisseau (mobile, en
       orbite) au retour */
    if(s.phase === 'outbound'){
      if(orbitState.planet && orbitState.planet.beaconSprite){
        orbitState.planet.beaconSprite.getWorldPosition(_shuttleTarget);
      } else if(orbitState.planet){
        _shuttleTarget.copy(orbitState.planet.position);
      }
    } else if(window.shipDockAnchor){
      if(s.rest) _shuttleTarget.copy(CARGO.shipPoint(s.rest)); else window.shipDockAnchor.getWorldPosition(_shuttleTarget);
    } else {
      _shuttleTarget.copy(shipRig.position);
    }

    let pos, lookDir, targetQ = null, snap = false;
    if(s.phase === 'outbound'){
      /* repère du vaisseau réévalué CHAQUE image : le cargo est en train
         de manœuvrer en orbite pendant tout ce temps, la chute et
         l'éloignement doivent rester solidaires de sa position/orientation
         RÉELLE au moment présent, pas d'un instantané figé au largage. */
      _shipDown.set(0,-1,0).applyQuaternion(shipRig.quaternion);
      if(s.rest) _dockPosNow.copy(CARGO.shipPoint(s.rest));                  /* lot N : point de repos sous la pince */
      else if(window.shipDockAnchor) window.shipDockAnchor.getWorldPosition(_dockPosNow);
      else _dockPosNow.copy(shipRig.position);

      if(f < OUTBOUND_DROP_FRAC){
        /* phase 1 : translation verticale pure, part du centre du dock */
        const t2 = f/OUTBOUND_DROP_FRAC, e2 = t2*t2*(3-2*t2);
        pos = _dockPosNow.clone().addScaledVector(_shipDown, DROP_D*e2);
        lookDir = _shipDown;
        targetQ = shipRig.quaternion.clone(); snap = true;   /* sortie de soute : attitude du vaisseau */
      } else if(f < OUTBOUND_CLEAR_FRAC){
        /* phase 2 : poursuite du même axe, la navette s'éloigne encore du cargo */
        const t2 = (f-OUTBOUND_DROP_FRAC)/(OUTBOUND_CLEAR_FRAC-OUTBOUND_DROP_FRAC), e2 = t2*t2*(3-2*t2);
        pos = _dockPosNow.clone().addScaledVector(_shipDown, DROP_D + CLEAR_D*e2);
        lookDir = _shipDown;
        targetQ = shipRig.quaternion.clone().slerp(shuttleAttitude(_shuttleTarget.clone().sub(pos), pos), e2);   /* pivote vers sa route */
      } else {
        /* phase 3 : dégagée du cargo, la navette amorce enfin sa descente
           vers le port — même lerp+arc qu'avant, mais reparti du point de
           dégagement plutôt que du dock lui-même */
        _clearPos.copy(_dockPosNow).addScaledVector(_shipDown, DROP_D + CLEAR_D);
        const t2 = (f-OUTBOUND_CLEAR_FRAC)/(1-OUTBOUND_CLEAR_FRAC), e2 = t2*t2*(3-2*t2);
        pos = _clearPos.clone().lerp(_shuttleTarget, e2);
        pos.addScaledVector(s.arcOffset, Math.sin(Math.PI*t2));
        lookDir = _shuttleTarget.clone().sub(pos);
        targetQ = shuttleAttitude(lookDir, pos);
      }
    } else {
      /* retour au dock : trajet inchangé, un simple lerp+arc suffit —
         la chorégraphie de départ ne concerne que la SORTIE de la baie */
      pos = s.startPos.clone().lerp(_shuttleTarget, ease);
      pos.addScaledVector(s.arcOffset, Math.sin(Math.PI*f));
      lookDir = _shuttleTarget.clone().sub(pos);
      targetQ = shuttleAttitude(lookDir, pos);
      if(f > .8){ const b = (f - .8)/.2; targetQ.slerp(shipRig.quaternion, b*b*(3 - 2*b)); }   /* réalignement pour l'arrimage */
    }
    s.group.position.copy(pos);

    if(targetQ){
      if(snap) s.group.quaternion.copy(targetQ);
      else s.group.quaternion.slerp(targetQ, 1 - Math.exp(-dt*4));   /* rotations lissées */
    }
    /* rétrécissement + fondu en fin de trajectoire : simulation d'un
       atterrissage — à la livraison comme à l'amerrissage au dock */
    const shrink = f > 0.82 ? THREE.MathUtils.mapLinear(f, 0.82, 1, 1, 0.12) : 1;
    s.group.scale.setScalar(REAL.active ? 1 : shrink);   /* L10 : à l'échelle réelle, la distance suffit (et les plans de suivi cadrent la navette de près) */
    s.glow.material.opacity = shrink;

    /* traînée du propulseur — historique de positions MONDE du moteur,
       le plus récent en tête ; la géométrie se met à jour en place
       plutôt que d'être reconstruite (un seul Float32Array, réécrit).
       Bug corrigé : le point moteur était décalé selon l'orientation DU
       NEZ (s.group.quaternion), qui vise la cible en ligne droite pendant
       la phase 3 — alors que la trajectoire réelle suit un arc (sinus).
       Les deux axes divergent nettement au sommet de l'arc, donnant une
       traînée visiblement désaxée par rapport au déplacement effectif.
       Calculé maintenant à partir du DÉPLACEMENT RÉEL d'une image à
       l'autre (position actuelle − position précédente), qui coïncide
       par construction avec l'axe de déplacement, quelle que soit
       l'orientation du modèle. */
    if(s.trail){
      let engineWorld;
      if(s.lastTrailPos){
        const vel = pos.clone().sub(s.lastTrailPos);
        if(vel.lengthSq() > 1e-6){
          engineWorld = pos.clone().addScaledVector(vel.normalize(), -(s.engineBack || 1.95)*shrink);
        }
      }
      /* première image, ou vaisseau ponctuellement immobile (dt≈0) :
         retombe sur l'orientation du modèle, faute de mieux */
      if(!engineWorld){
        engineWorld = pos.clone().addScaledVector(
          new THREE.Vector3(0,0,1).applyQuaternion(s.group.quaternion), (s.engineBack || 1.95)*shrink
        );
      }
      s.lastTrailPos = pos.clone();
      s.trailHistory.forEach(function(p){ p.add(_shipDelta); });   /* repère du vaisseau */
      s.trailHistory.unshift(engineWorld);
      if(s.trailHistory.length > SHUTTLE_TRAIL_LEN) s.trailHistory.length = SHUTTLE_TRAIL_LEN;
      /* longueur plafonnée à ~3 longueurs de navette : à ~30 km/s, neuf images d'historique donnaient une ligne de
         10 à 15 km ; dans l'ancien jeu, la traînée faisait une demi-navette — c'est un panache, pas une trajectoire */
      const _tMax = 24*REAL.shipScale(), _tLen = s.trailHistory[0].distanceTo(s.trailHistory[s.trailHistory.length - 1]);
      if(_tLen > _tMax){ const k = _tMax/_tLen, h = s.trailHistory[0]; for(let j = 1; j < s.trailHistory.length; j++) s.trailHistory[j].sub(h).multiplyScalar(k).add(h); }
      const posAttr = s.trail.geometry.attributes.position;
      const colAttr = s.trail.geometry.attributes.color;
      for(let k=0;k<SHUTTLE_TRAIL_LEN;k++){
        const p = s.trailHistory[k] || engineWorld;
        posAttr.array[k*3]=p.x; posAttr.array[k*3+1]=p.y; posAttr.array[k*3+2]=p.z;
        const fade = (1 - k/(SHUTTLE_TRAIL_LEN-1)) * shrink;
        const c = fade*fade;
        colAttr.array[k*3]=0.30*c; colAttr.array[k*3+1]=0.68*c; colAttr.array[k*3+2]=0.82*c;
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    }

    /* feux de navigation : cycle propre, indépendant du reste */
    (s.navLights||[]).forEach(function(nl){
      const tt = ((elapsed + nl.phase) % nl.period) / nl.period;
      const v = tt < nl.duty ? Math.pow(1 - tt/nl.duty, 1.6) : 0;
      nl.mat.opacity = v * nl.peak;
    });

    if(f >= 1){
      if(s.phase === 'outbound'){
        /* livraison effectuée : crédité ici (au dépôt du dernier
           conteneur), puis la navette repart aussitôt vers le dock —
           elle ne disparaît qu'après avoir rejoint le vaisseau, cf.
           shuttlesDone qui conditionne la reprise de croisière. */
        orbitState.deliveredCount = (orbitState.deliveredCount||0) + 1;
        if(!orbitState.creditsPaid && orbitState.spawned.every(Boolean)
           && orbitState.deliveredCount >= orbitState.spawnFractions.length){
          const total = orbitState.cargoSplit.reduce(function(a,b){ return a+b; }, 0);
          addCredits(total * orbitState.unitPrice);
          orbitState.creditsPaid = true;
        }
        s.phase = 'returning';
        s.t = 0;
        s.startPos = pos.clone();
        s.arcOffset = new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5)
          .normalize().multiplyScalar((50 + Math.random()*70)*REAL.shipScale());   /* échelle du vaisseau */
        s.duration = 9 + Math.random()*2;
        s.group.scale.setScalar(1);
        s.glow.material.opacity = 1;
      } else {
        /* retour terminé : amerrissage au dock */
        LAYERS.detach(s.group);
        disposePlanetGroup(s.group);
        if(s.trail){ LAYERS.detach(s.trail); s.trail.geometry.dispose(); s.trail.material.dispose(); }
        orbitState.shuttles.splice(i,1);
      }
    }
  }
}

/* ---------- position/orientation du vaisseau sur le cercle d'orbite ---------- */
function updateOrbitDelivery(dt){
  const os = orbitState;
  const angularSpeed = REAL.active ? Math.sqrt(os.planet.GM/Math.pow(os.radius, 3)) : (Math.PI*2)/ARRIVAL_PAUSE_DURATION;   /* L2.3 : arc en temps réel */
  const _prevShip = REAL.active ? shipRig.position.clone() : null;
  const angle = pauseTimer*angularSpeed;
  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  const parametricPos = os.center.clone()
    .addScaledVector(os.U, cosA*os.radius)
    .addScaledVector(os.V, sinA*os.radius);
  const tangent = os.U.clone().multiplyScalar(-sinA).addScaledVector(os.V, cosA).normalize();
  const m4 = new THREE.Matrix4().lookAt(new THREE.Vector3(0,0,0), tangent, REAL.active ? parametricPos.clone().sub(os.center).normalize() : os.N);   /* planète sous le vaisseau */
  const targetQuat = new THREE.Quaternion().setFromRotationMatrix(m4);

  /* capture douce : on part de la position/orientation réelles du vaisseau
     à l'instant du déclenchement plutôt que de le téléporter sur le cercle */
  const capT = REAL.active ? 1 : Math.min(1, pauseTimer/ORBIT_CAPTURE_TIME);   /* déjà sur l'orbite en fin de couloir */
  const blend = capT*capT*(3-2*capT);
  shipRig.position.copy(os.startPos).lerp(parametricPos, blend);
  shipRig.quaternion.copy(os.startQuat).slerp(targetQuat, blend);
  if(_prevShip){ const dd = shipRig.position.clone().sub(_prevShip); camPos.add(dd); camLook.add(dd); REAL.orbitTangent = tangent.clone(); }

  /* déclenchement des navettes, réparties sur le tour d'orbite */
  const frac = pauseTimer/ARRIVAL_PAUSE_DURATION;
  os.spawnFractions.forEach(function(sf, i){
    if(!os.spawned[i] && frac >= sf){
      os.spawned[i] = true;
      /* mise en scène du chargement puis du largage — sautée en mode
         abrégé, où l'on privilégie le travelling continu à une
         succession de plans (le chargement lui-même reste joué, mais en
         accéléré comme le reste, via arrivalTimeScale). */
      startShuttleLoading(!arrivalSkip && !REAL.active);
    }
  });

  /* canal radio : les messages du script sont déjà triés par instant de
     déclenchement, MAIS on n'affiche jamais le suivant tant que la voix
     est encore en train de lire le précédent — sans cette garde, un
     message pouvait apparaître (et sa lecture démarrer, mise en file par
     le navigateur) alors que le message précédent n'avait pas fini d'être
     dicté, et le texte affiché prenait de l'avance sur la voix. */
  if(!radioSpeaking && os.radioIdx < os.radioScript.length && os.radioScript[os.radioIdx].t <= frac){
    appendRadioLine(os.radioScript[os.radioIdx]);
    os.radioIdx++;
  }

  currentSpeed = os.radius*angularSpeed;
  return tangent;
}
