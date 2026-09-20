/* screenshots.js — pilote de scènes pour screenshots.sh.
   Jamais chargé par le jeu : le script est injecté dans une COPIE temporaire
   de space-travel.html, après le script du jeu, si l'URL porte ?shot=NOM.
   Il en reprend les variables globales (renderer, scene, camera, ROUTE…).

   Principe : le temps est figé et rejoué à la main. requestAnimationFrame est
   remplacé par une file d'un seul rappel que pump() déclenche N fois avec un
   dt fixe ; le rendu WebGL n'est fait que sur la dernière image. On peut ainsi
   simuler des dizaines de secondes de jeu en un instant, de façon
   reproductible. Les tirages Math.random (choix de plans du travelling de
   l'écran-titre, etc.) sont amorcés par la graine.

   Paramètres d'URL : shot=NOM  lang=fr|en|de|es
   Publie dans #shot-rect le rectangle (x,y,w,h) des éléments demandés par
   la scène via crop(), que screenshots.sh utilise pour recadrer. */
(function(){
  const P = new URLSearchParams(location.search);
  const SHOT = P.get('shot');
  if(!SHOT) return;
  const LANGSEL = P.get('lang') || 'fr';

  const sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  const key = function(code, extra){
    window.dispatchEvent(new KeyboardEvent('keydown', Object.assign({code: code, key: code, bubbles: true}, extra || {})));
    window.dispatchEvent(new KeyboardEvent('keyup', Object.assign({code: code, key: code, bubbles: true}, extra || {})));
  };

  /* ---------- temps figé ---------- */
  Math.random = rngFor(SEED + ':screenshots');
  const realRAF = window.requestAnimationFrame.bind(window);
  let rafCb = null, fakeElapsed = 0, fakeDt = 1/30, draw = false;
  let lastScene = null, lastCamera = null;
  window.requestAnimationFrame = function(cb){ rafCb = cb; return 1; };
  const origRender = renderer.render.bind(renderer);
  let camOverride = null;     /* cadrage manuel : appliqué juste avant chaque rendu dessiné */
  renderer.render = function(s, c){
    lastScene = s; lastCamera = c;
    if(draw){
      if(camOverride) camOverride(c);
      origRender(s, c);
    }
  };
  clock.getDelta = function(){ return fakeDt; };
  clock.getElapsedTime = function(){ return fakeElapsed; };

  /* n images de dt secondes ; la dernière seule est dessinée, sauf si
     nodraw (simulation pure, bien plus rapide) */
  function pump(n, dt, nodraw){
    fakeDt = dt || 1/30;
    for(let i = 0; i < n; i++){
      fakeElapsed += fakeDt;
      draw = !nodraw && (i === n - 1);
      const cb = rafCb; rafCb = null;
      if(!cb) break;
      cb(performance.now());
    }
    draw = false;
  }
  const step = function(n, dt){ pump(n, dt, true); };
  /* avance image par image, sans rendu, jusqu'à ce que cond() soit vraie
     (ou max images) ; renvoie le nombre d'images jouées */
  function until(cond, max, dt){
    let n = 0;
    while(!cond() && n < (max || 3000)){ pump(1, dt, true); n++; }
    return n;
  }
  const debug = [];
  const dbg = function(){ debug.push(Array.prototype.join.call(arguments, ' ')); };
  /* quelques rendus de l'état figé, pour que la capture trouve une image
     valide dans le tampon WebGL, puis on s'arrête (un rendu continu
     coûterait tout le budget de temps virtuel) */
  function hold(){
    let k = 0;
    (function again(){
      if(lastScene && lastCamera) origRender(lastScene, lastCamera);
      if(++k < 4) realRAF(again);
    })();
  }

  /* ---------- aides de mise en scène ---------- */
  const $ = function(sel){ return document.querySelector(sel); };
  /* les éléments à recadrer sont mesurés à la fin, une fois la mise en page du
     HUD stabilisée (repositionnement par minuteries) */
  const cropSel = [];
  function crop(sel){ cropSel.push(sel); }
  function publishRect(){
    const rects = [];
    cropSel.forEach(function(sel){
      const el = $(sel);
      if(!el) return;
      const r = el.getBoundingClientRect();
      rects.push([r.left, r.top, r.right, r.bottom]);
    });
    if(!rects.length) return;
    const x0 = Math.min.apply(null, rects.map(function(r){ return r[0]; }));
    const y0 = Math.min.apply(null, rects.map(function(r){ return r[1]; }));
    const x1 = Math.max.apply(null, rects.map(function(r){ return r[2]; }));
    const y1 = Math.max.apply(null, rects.map(function(r){ return r[3]; }));
    const pre = document.createElement('pre');
    pre.id = 'shot-rect';
    pre.style.display = 'none';
    /* 5e valeur : hauteur de la zone d'affichage, pour que screenshots.sh vérifie
       que la mesure a été faite dans la même fenêtre que la capture */
    pre.textContent = [x0, y0, x1 - x0, y1 - y0, innerHeight].map(Math.round).join(',');
    document.body.appendChild(pre);
  }
  function panel(sel, visible){
    const el = $(sel);
    if(!el) return;
    el.classList.toggle('panel-hidden', !visible);
    if(visible) el.classList.add('visible');
  }
  /* masque les étiquettes 3D (cercles de ciblage) : elles chevauchent les
     titres de panneaux dans les recadrages du HUD */
  function hideLabels(){ labelContainer.style.visibility = 'hidden'; }
  function refreshFields(){
    refreshField(STAR_CELL, STAR_RADIUS, starField, buildStarCell);
    refreshField(NEBULA_CELL, NEBULA_RADIUS, nebulaField, buildNebulaCell);
  }
  /* place le vaisseau sur la courbe de route à l'abscisse s, cap tangent ; la
     caméra de poursuite met ensuite un instant à se resserrer : prévoir de
     rejouer au moins 60 images avant de dessiner */
  function teleportOnRoute(s, nextDelivery){
    const L = ROUTE.length;
    const p = ROUTE.curve.getPointAt(Math.min(Math.max(s, 0), L) / L);
    const q = ROUTE.curve.getPointAt(Math.min(s + 4, L) / L);
    const dir = q.clone().sub(p).normalize();
    shipRig.position.copy(p);
    shipRig.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), dir, new THREE.Vector3(0, 1, 0)));
    ROUTE.s = s;
    /* prochaine livraison : par défaut la première étape encore devant le
       vaisseau, sans quoi l'arrivée se déclencherait pour une étape déjà
       dépassée */
    ROUTE.nextDelivery = (nextDelivery !== undefined) ? nextDelivery
      : Math.max(0, ROUTE.legS.findIndex(function(x){ return x - 180 > s; }));
    angVel.set(0, 0, 0);
    refreshFields();
  }
  /* à 1280×800, les panneaux itinéraire (I) et Lagrange (L) chevauchent « objet
     le plus proche » quand la radio et les services portuaires sont ouverts :
     on les ferme pour les scènes d'arrivée */
  function tidyForArrival(){
    ['.hud-itinerary', '.hud-lagrange'].forEach(function(sel){
      const el = $(sel);
      if(el && !el.classList.contains('panel-hidden')) key(sel === '.hud-itinerary' ? 'KeyI' : 'KeyL');
    });
  }
  function setCamera(mode){ cameraMode = mode; if(typeof refreshHudIconBar === 'function') refreshHudIconBar(); }

  /* ---------- démarrage ---------- */
  async function bootToTitle(){
    await sleep(3400);                        /* six lignes à 340 ms, puis START */
    $('#bootStartBtn').click();
    await sleep(1600);                        /* fondu, calcul de la route, écran-titre */
  }
  function chooseLang(){
    const btn = $('.lang-btn[data-lang="' + LANGSEL + '"]');
    btn.click();                              /* selectLanguageAndStart */
  }
  async function startGameScene(){
    await bootToTitle();
    pump(20);
    chooseLang();
    await sleep(900);
  }

  /* ---------- scènes ---------- */
  const SCENES = {
    /* sondage (scène « _probe », ignorée par défaut) : les systèmes de la
       route de la graine, pour choisir une graine de démonstration */
    _probe: async function(){
      await bootToTitle();
      dbg('systèmes (B ceinture, R anneaux, M lunes) :', ROUTE.legs.map(function(l, i){
        const sy = l.system;
        return i + ':' + (sy.asteroidBelt ? 'B' : '-') + (sy.planets.some(function(p){ return p.hasRings; }) ? 'R' : '-') + (sy.planets.some(function(p){ return p.moonCount > 0; }) ? 'M' : '-');
      }).join(' '));
    },

    /* écran de démarrage : séquence terminée, bouton START prêt */
    boot: async function(){
      await sleep(3600);
    },

    /* écran-titre : aperçu de la langue choisie, travelling de fond */
    title: async function(){
      await bootToTitle();
      pump(240);
      $('.lang-btn[data-lang="' + LANGSEL + '"]').dispatchEvent(new Event('focus'));
      pump(2);
    },

    /* croisière : HUD complet, caméra de poursuite */
    cruise: async function(){
      await startGameScene();
      pump(150);
    },

    pause: async function(){
      await startGameScene();
      pump(120);
      key('Escape');
      await sleep(400);
      pump(2);
    },

    help: async function(){
      await startGameScene();
      pump(120);
      key('KeyH');
      await sleep(400);
      pump(2);
    },

    volume: async function(){
      await startGameScene();
      pump(120);
      key('KeyV');
      await sleep(400);
      pump(2);
    },

    /* plan de vol, recadré sur le panneau */
    flightplan: async function(){
      await startGameScene();
      pump(150);
      hideLabels();
      crop('.hud-route');
    },

    /* jauges du bas : température, propulsion (avec carburant), commandes */
    gauges: async function(){
      await startGameScene();
      pump(150);
      hideLabels();
      crop('.hud-temp'); crop('.hud-engines'); crop('.hud-telemetry');
    },

    /* itinéraire (bas droite) et point de Lagrange (bas gauche), 3e étape */
    itinerary: async function(){
      await startGameScene();
      pump(20);
      teleportOnRoute(ROUTE.legS[1] + 300, 2);
      step(90);
      pump(2);
    },

    /* portiques de la route, à mi-chemin de la première étape */
    gates: async function(){
      await startGameScene();
      pump(20);
      teleportOnRoute(ROUTE.legS[0] * 0.35);
      step(90);
      pump(2);
    },

    /* croisière à proximité d'une nébuleuse : la plus proche de la route */
    nebula: async function(){
      await startGameScene();
      pump(30);
      let best = null, bs = 0, bd = Infinity;
      for(let s = 0; s < ROUTE.legS[0] - 450; s += 25){
        const p = ROUTE.curve.getPointAt(s / ROUTE.length);
        nebulaField.forEach(function(o){
          if(!o) return;
          const d = o.mesh.position.distanceTo(p);
          if(d < bd){ bd = d; best = o; bs = s; }
        });
      }
      dbg('nébuleuse', best && best.name, 'à', Math.round(bd), 'u de la route, s =', bs);
      teleportOnRoute(Math.max(0, bs - 140), 99);   /* 99 : aucune livraison pendant l'attente */
      /* vaisseau à 900 u de la nébuleuse, cap sur elle, en pilotage manuel pour
         que l'autopilote ne le ramène pas vers la route pendant l'attente */
      const c = best.mesh.position.clone();
      const from = shipRig.position.clone().sub(c).normalize();
      const toward = from.clone().negate();
      shipRig.position.copy(c).addScaledVector(from, 900);
      shipRig.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), toward, new THREE.Vector3(0, 1, 0)));
      lastInputTime = performance.now() + 600000;
      refreshFields();
      step(200);                      /* fondu d'apparition de la nébuleuse */
      pump(2);
    },

    /* système planétaire avec ceinture d'astéroïdes (et anneaux si possible) :
       cadrage manuel près d'une planète voisine de la ceinture, vue de côté
       pour qu'elle soit à moitié éclairée et que la ceinture passe derrière.
       ?ring=0 (viser la ceinture plutôt que la géante à anneaux)
       ?az= (degrés depuis la direction de l'étoile) ?dist= (rayons de planète)
       ?elev= (rayons au-dessus du plan orbital) ?bias= (visée vers la ceinture) */
    system: async function(){
      await startGameScene();
      pump(20);
      const has = function(l, f){ return l.system && f(l.system); };
      let idx = ROUTE.legs.findIndex(function(l){ return has(l, function(s){ return s.asteroidBelt && s.planets.some(function(p){ return p.hasRings; }); }); });
      if(idx < 0) idx = ROUTE.legs.findIndex(function(l){ return has(l, function(s){ return s.asteroidBelt; }); });
      if(idx < 0) idx = 0;
      if(P.get('leg')) idx = parseInt(P.get('leg'), 10);
      dbg('systèmes (B ceinture, R anneaux, M lunes) :', ROUTE.legs.map(function(l, i){
        const sy = l.system;
        return i + ':' + (sy.asteroidBelt ? 'B' : '-') + (sy.planets.some(function(p){ return p.hasRings; }) ? 'R' : '-') + (sy.planets.some(function(p){ return p.moonCount > 0; }) ? 'M' : '-');
      }).join(' '));
      const leg = ROUTE.legs[idx], sys = leg.system;
      dbg('système', idx, 'ceinture', !!sys.asteroidBelt, 'anneaux', sys.planets.some(function(p){ return p.hasRings; }));
      teleportOnRoute(Math.max(0, ROUTE.legS[idx] - 1300), idx);        /* fait construire le système */
      step(60);
      const S = leg.starPosition.clone();
      const bel = sys.asteroidBelt;
      const rb = bel ? (bel.inner + bel.outer) / 2 : 0;
      let pl = sys.planets[0], bd = Infinity;
      sys.planets.forEach(function(p){
        const d = (P.get('ring') !== '0' && sys.planets.some(function(q){ return q.hasRings; })) ? (p.hasRings ? -1e6 : -p.radius) : (bel ? Math.abs(p.position.distanceTo(S) - rb) : -p.radius);
        if(d < bd){ bd = d; pl = p; }
      });
      const R = pl.radius;
      const uOut = pl.position.clone().sub(S).normalize();
      /* normale du plan orbital : produit vectoriel de deux planètes */
      let n = new THREE.Vector3(0, 1, 0);
      if(sys.planets.length > 1){
        n = sys.planets[0].position.clone().sub(S).cross(sys.planets[1].position.clone().sub(S)).normalize();
        if(n.y < 0) n.negate();
      }
      const tang = n.clone().cross(uOut).normalize();
      const az = parseFloat(P.get('az') || '50') * Math.PI / 180;
      const dist = parseFloat(P.get('dist') || '8'), elev = parseFloat(P.get('elev') || '2.2'), bias = parseFloat(P.get('bias') || '0');
      const toBelt = (bel && pl.position.distanceTo(S) > rb) ? uOut.clone().negate() : uOut.clone();
      const camPos = pl.position.clone()
        .addScaledVector(uOut, -Math.cos(az) * R * dist)
        .addScaledVector(tang, Math.sin(az) * R * dist)
        .addScaledVector(n, elev * R);
      const target = pl.position.clone().addScaledVector(toBelt, bias * R);
      camOverride = function(c){ c.position.copy(camPos); c.up.set(0, 1, 0); c.lookAt(target); };
      hideLabels();
      pump(2);
    },

    /* carte stellaire (§23), module de saut acheté, une étoile sélectionnée */
    map: async function(){
      await startGameScene();
      pump(60);
      hasQuantumJump = true;                 /* état après l'achat en escale */
      key('KeyM');
      await sleep(300);
      pump(2);
      const c = starMapCandidates[Math.min(3, starMapCandidates.length - 1)];
      dbg('carte :', starMapCandidates.length, 'candidates, sélection', c && c.name);
      if(c) selectStarMapCandidate(c.key);
      pump(2);
    },

    /* smartphone en portrait : contrôles tactiles en surimpression */
    phone: async function(){
      await startGameScene();
      pump(150);
    },

    /* tablette en paysage : panneaux complets et contrôles tactiles */
    tablet: async function(){
      await startGameScene();
      pump(150);
    },

    /* approche d'une planète, avant la mise en orbite */
    approach: async function(){
      await startGameScene();
      pump(20);
      /* l'endroit de la route, avant l'arrivée, d'où la planète cible est le
         plus droit devant (entre 450 et 1000 u) */
      const pl = ROUTE.legs[0].planet;
      let bs = ROUTE.legS[0] - 700, bc = -2;
      for(let s = ROUTE.legS[0] - 1500; s < ROUTE.legS[0] - 320; s += 20){
        const p = ROUTE.curve.getPointAt(s / ROUTE.length);
        const q = ROUTE.curve.getPointAt((s + 4) / ROUTE.length);
        const v = pl.position.clone().sub(p);
        const d = v.length();
        if(d < 450 || d > 1000) continue;
        const c = q.clone().sub(p).normalize().dot(v.normalize());
        if(c > bc){ bc = c; bs = s; }
      }
      dbg('approche : s =', Math.round(bs), 'cos =', bc.toFixed(2), 'planète R =', Math.round(pl.radius));
      teleportOnRoute(bs);
      step(100);
      pump(2);
    },

    /* mise en orbite : une navette en vol, services portuaires ouverts */
    orbit: async function(){
      await startGameScene();
      pump(20);
      teleportOnRoute(ROUTE.legS[0] - 215);
      until(function(){ return flightPhase === 'ARRIVAL_PAUSE'; }, 900);
      key('F8');
      tidyForArrival();
      until(function(){ return orbitState.shuttles.length > 0; }, 1500);
      step(50);
      pump(2);
    },

    /* coque texturée et dock, pendant le chargement d'une navette : plan « sur l'épaule » */
    hull: async function(){
      await startGameScene();
      pump(20);
      /* ?seq=lateral|face|travelling|shoulder  ?at=images après le début du plan */
      SHUTTLE_CAMERA_SEQUENCES.splice(0, SHUTTLE_CAMERA_SEQUENCES.length, P.get('seq') || 'shoulder');
      teleportOnRoute(ROUTE.legS[0] - 215);
      tidyForArrival();
      until(function(){ return orbitState.cutawaySeq; }, 1500);
      step(parseInt(P.get('at') || '70', 10));
      pump(2);
    },

    /* canal radio en cours d'échange, à mi-orbite */
    radio: async function(){
      await startGameScene();
      pump(20);
      teleportOnRoute(ROUTE.legS[0] - 215);
      until(function(){ return flightPhase === 'ARRIVAL_PAUSE'; }, 900);
      key('F8');
      tidyForArrival();
      until(function(){ return pauseTimer > 28; }, 3000);
      pump(2);
    },

    /* empilement objet proche, services portuaires, canal radio (recadrage) */
    stack: async function(){
      await startGameScene();
      pump(20);
      teleportOnRoute(ROUTE.legS[0] - 215);
      until(function(){ return flightPhase === 'ARRIVAL_PAUSE'; }, 900);
      key('F8');
      tidyForArrival();
      until(function(){ return pauseTimer > 28; }, 3000);
      pump(2);
      hideLabels();
      crop('.hud-right'); crop('#portPanel'); crop('#radioPanel');
    }
  };

  const run = SCENES[SHOT];
  if(!run){
    document.title = 'scène inconnue : ' + SHOT;
    return;
  }
  /* le pilote démarre une fois le script du jeu entièrement exécuté */
  window.addEventListener('load', function(){
    /* la synthèse vocale de Chrome sans écran ne signale jamais la fin d'un
       énoncé : sans cette neutralisation, le canal radio resterait bloqué
       sur la première réplique (radioSpeaking ne se lèverait pas) */
    window.speakRadioLine = function(){};
    run().then(function(){
      return sleep(2500);                 /* laisse les minuteries du HUD se dérouler */
    }).then(function(){
      dbg('zone d\'affichage', innerWidth + 'x' + innerHeight, 'échelle', devicePixelRatio);
      publishRect();
      if(debug.length){
        const d = document.createElement('pre');
        d.id = 'shot-debug';
        d.style.display = 'none';
        d.textContent = debug.join('\n');
        document.body.appendChild(d);
      }
      hold();
      document.title = 'shot-ready';
    }).catch(function(e){
      const pre = document.createElement('pre');
      pre.id = 'shot-error';
      pre.textContent = String(e && e.stack || e);
      document.body.appendChild(pre);
    });
  });
})();
