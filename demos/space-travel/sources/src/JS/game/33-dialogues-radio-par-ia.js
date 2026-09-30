/* =========================================================================
   DIALOGUES RADIO PAR IA EMBARQUÉE (Gemini Nano) — §14 de la spec v2.1.
   Principe : le script par gabarits ci-dessus (buildRadioScript) reste la
   SEULE source de vérité affichée par défaut — c'est aussi, sans code
   supplémentaire, le repli automatique si Gemini Nano est absent,
   indisponible, ou trop lent. Cette IA ne fait qu'essayer de RÉÉCRIRE
   chaque réplique déjà présente, en tâche de fond, sans jamais bloquer
   ni retarder l'affichage : un dépassement de délai (2 s) ou une erreur
   laisse simplement le texte du gabarit en place, silencieusement.
   Aucun appel réseau : l'inférence tourne en local dans le navigateur,
   même principe que SpeechSynthesis déjà utilisée pour la voix (§12.3). */
let llmAvailability = 'unchecked';   /* 'unchecked' | 'available' | 'unavailable' */
async function checkLLMAvailability(){
  try{
    if(!('LanguageModel' in self)){ llmAvailability = 'unavailable'; return; }
    const a = await LanguageModel.availability();
    /* couvre l'ancien ET le nouveau nommage de l'API — encore instable
       d'une version de Chrome à l'autre au moment d'écrire ce code */
    llmAvailability = (a === 'available' || a === 'readily') ? 'available' : 'unavailable';
  }catch(e){
    llmAvailability = 'unavailable';
  }finally{
    updateLLMIndicator();
  }
}
checkLLMAvailability();

/* icône cerveau du panneau radio : active (pleine, lumineuse) quand l'IA
   embarquée est détectée et effectivement utilisée pour les dialogues,
   barrée (grisée, biffée) sinon — seul indicateur visible de la voie
   employée, sans quoi le joueur ne peut pas savoir laquelle est active. */
function updateLLMIndicator(){
  const el = document.getElementById('llmIndicator');
  if(!el) return;
  const active = llmAvailability === 'available';
  el.classList.toggle('active', active);
  el.classList.toggle('inactive', !active);
  el.title = llmAvailability === 'unchecked' ? t('llmChecking') : (active ? t('llmActive') : t('llmInactive'));
}

/* une identité par interlocuteur (§14.2) : ton et vocabulaire distincts,
   fournis en instruction système à sa PROPRE session — plutôt qu'un seul
   modèle générique appelé plusieurs fois, qui produirait des répliques
   interchangeables entre équipage et tour de contrôle. */
const LLM_PERSONAS = {
  ship: {
    fr: "Tu es le capitaine d'un cargo spatial. Ton direct, professionnel, phrases courtes. Réponds par une seule phrase courte, sans guillemets ni mise en forme.",
    en: 'You are the captain of a cargo starship. Direct, professional tone, short sentences. Reply with a single short sentence, no quotes or formatting.',
    de: 'Du bist der Kapitän eines Frachtraumschiffs. Direkt, professionell, kurze Sätze. Antworte mit einem einzigen kurzen Satz, ohne Anführungszeichen oder Formatierung.',
    es: 'Eres el capitán de un carguero espacial. Tono directo y profesional, frases cortas. Responde con una sola frase corta, sin comillas ni formato.'
  },
  tower: {
    fr: 'Tu es un contrôleur du trafic d\u2019un port spatial. Ton protocolaire, débit posé, formules consacrées. Réponds par une seule phrase courte, sans guillemets ni mise en forme.',
    en: 'You are a starport traffic controller. Formal, measured tone, standard phrasing. Reply with a single short sentence, no quotes or formatting.',
    de: 'Du bist ein Fluglotse eines Raumhafens. Förmlich, ruhiger Tonfall, feste Formulierungen. Antworte mit einem einzigen kurzen Satz, ohne Anführungszeichen oder Formatierung.',
    es: 'Eres un controlador de tráfico de un puerto espacial. Tono protocolario, ritmo pausado, fórmulas habituales. Responde con una sola frase corta, sin comillas ni formato.'
  }
};
const llmSessions = {};
async function getLLMSession(persona){
  if(llmSessions[persona]) return llmSessions[persona];
  const dict = LLM_PERSONAS[persona] || LLM_PERSONAS.ship;
  const sysPrompt = dict[LANG] || dict.fr;
  const session = await LanguageModel.create({ initialPrompts: [{role:'system', content: sysPrompt}] });
  llmSessions[persona] = session;
  return session;
}
function llmPromptFor(entry, planet){
  return 'Contexte : ' + entry.label + ' vient de dire, pendant l\u2019approche du port de '
    + planet.cityName + ' : "' + entry.text + '". Reformule ce message dans ton propre style, '
    + 'en gardant le même sens et les mêmes informations concrètes (nombres, noms).';
}
/* lance la réécriture de chaque réplique en arrière-plan, dès la
   construction du script — bien avant l'affichage du premier message
   (§14.5) — et abandonne silencieusement toute réponse qui arriverait
   après que CE message précis a déjà été affiché avec son texte de repli. */
function enhanceRadioScriptWithLLM(script, planet, gen){
  if(llmAvailability !== 'available') return;
  script.forEach(function(entry, idx){
    (async function(){
      try{
        const session = await getLLMSession(entry.from);
        const prompt = llmPromptFor(entry, planet);
        const timeout = new Promise(function(_, reject){ setTimeout(function(){ reject(new Error('timeout')); }, 2000); });
        const text = await Promise.race([session.prompt(prompt), timeout]);
        if(orbitState.radioGen !== gen) return;      /* nouvelle escale entre-temps */
        if(orbitState.radioIdx > idx) return;         /* déjà affiché avec le repli */
        const cleaned = String(text).trim().replace(/^["\u201c\u201d]|["\u201c\u201d]$/g, '');
        if(cleaned) entry.text = cleaned;
      }catch(e){
        /* silencieux : le texte du gabarit déjà en place reste affiché,
           c'est tout l'intérêt de ne jamais l'effacer avant d'avoir un
           remplacement confirmé */
      }
    })();
  });
}

function startOrbitDelivery(planet){
  /* nettoyage défensif d'un éventuel reliquat de navettes non arrivées */
  orbitState.shuttles.forEach(function(s){
    LAYERS.detach(s.group); disposePlanetGroup(s.group);
    if(s.trail){ LAYERS.detach(s.trail); s.trail.geometry.dispose(); s.trail.material.dispose(); }
  });
  orbitState.shuttles.length = 0;
  /* lot N2 : porte-conteneurs — une seule navette de baie (toute la cargaison de l'escale) ; ailleurs, trois navettes */
  orbitState.spawnFractions = CARGO.hasBay() ? [0.04] : [0.08, 0.30, 0.52];   /* lot N2 : une navette de baie par escale (manœuvres lentes) ; sans baie : trois transferts directs */
  orbitState.spawned = orbitState.spawnFractions.map(function(){ return false; });   /* taille réelle : sinon le paiement attend des navettes jamais lancées */

  const center = planet.position.clone();
  const toShip = shipRig.position.clone().sub(center);
  const dist = Math.max(toShip.length(), 1);
  const U = toShip.clone().divideScalar(dist);
  const fwd = new THREE.Vector3(0,0,-1).applyQuaternion(shipRig.quaternion);
  let N = new THREE.Vector3().crossVectors(U, fwd);
  if(N.lengthSq() < 1e-6){
    N = new THREE.Vector3().crossVectors(U, new THREE.Vector3(0,1,0));
    if(N.lengthSq() < 1e-6) N = new THREE.Vector3().crossVectors(U, new THREE.Vector3(1,0,0));
  }
  N.normalize();
  let V = new THREE.Vector3().crossVectors(N, U).normalize();
  if(V.dot(fwd) < 0){ V.negate(); N.negate(); }  /* aligne le sens de parcours sur le cap actuel */

  orbitState.active = true;
  orbitState.planet = planet;
  orbitState.center = center;
  orbitState.radius = REAL.active ? dist : planet.radius*2.3;   /* L2.3 : orbite basse atteinte au bout du couloir */
  orbitState.U = U; orbitState.V = V; orbitState.N = N;
  /* garde-fou anti-collision : si le vaisseau se retrouve anormalement
     proche de la planète au moment du déclenchement (léger dépassement du
     seuil d'arrivée, etc.), on démarre la capture depuis un point sûr sur
     le même axe plutôt que depuis sa position réelle — sans quoi le
     fondu vers le cercle d'orbite pourrait couper à travers la surface. */
  const safeDist = REAL.active ? dist : Math.max(dist, planet.radius*1.7);
  orbitState.startPos.copy(center).addScaledVector(U, safeDist);
  orbitState.startQuat.copy(shipRig.quaternion);
  orbitState.camPhase0 = Math.random()*Math.PI*2;

  /* canal radio : script généré depuis le seed de la planète, panneau vidé et affiché.
     Le genre de chaque voix est tiré au hasard à chaque échange — équipage
     et tour peuvent être masculins, féminins, ou l'un de chaque, sans
     schéma fixe d'un appel à l'autre. */
  /* cargaison de l'escale : 1 à 5 conteneurs au total, répartis sur les
     navettes larguées (ex. 5 sur 3 navettes -> 2/2/1). Tiré AVANT
     buildRadioScript, qui lit cette répartition pour ses annonces. */
  const nShuttles = orbitState.spawnFractions.length;
  const totalCargo = 1 + Math.floor(Math.random()*5);
  const split = new Array(nShuttles).fill(0);
  for(let c=0;c<totalCargo;c++) split[c % nShuttles]++;
  orbitState.cargoSplit = split;
  orbitState.unitPrice = 180 + Math.floor(Math.random()*241);  /* 180 à 420 crédits */
  orbitState.creditsPaid = false;
  if(typeof MISSIONS !== 'undefined') MISSIONS.setupEscale(orbitState);   /* M1 : cargaison et prime de la mission */
  orbitState.deliveredCount = 0;
  orbitState.loading = null;

  orbitState.voiceGender = {
    ship:  Math.random() < 0.5 ? 'male' : 'female',
    tower: Math.random() < 0.5 ? 'male' : 'female'
  };
  orbitState.radioScript = buildRadioScript(planet);
  orbitState.radioIdx = 0;
  /* réécriture IA en tâche de fond (§14) : orbitState.radioGen identifie
     cette escale précise, pour que toute réponse tardive d'une escale
     précédente (dépassée ou abandonnée) ne vienne jamais écraser le script
     de la nouvelle. */
  orbitState.radioGen = (orbitState.radioGen||0) + 1;
  enhanceRadioScriptWithLLM(orbitState.radioScript, planet, orbitState.radioGen);
  const radioLog = document.getElementById('radioLog');
  if(radioLog) radioLog.innerHTML = '';
  const radioPanel = document.getElementById('radioPanel');
  if(radioPanel) radioPanel.classList.add('visible');
  if(typeof refreshHudIconBar === 'function') refreshHudIconBar();
  /* services portuaires (#9, palier 1) : n'est plus auto-affiché avec la
     radio — le panneau est désormais piloté UNIQUEMENT par sa propre
     icône dans la barre du HUD (§12), activable dès qu'on est en
     livraison OU à proximité d'une planète-port (cf. isNearPortService).
     On rafraîchit son contenu quand même ici, au cas où il serait déjà
     ouvert (le coût du trajet peut changer avec le niveau atteint). */
  if(typeof refreshPortPanel === 'function') refreshPortPanel();
  repositionRadioPanel();
  repositionPortPanel();
  const arrivalHint = document.getElementById('arrivalHint');
  if(arrivalHint) arrivalHint.style.display = 'block';
}

/* ---------- navettes de livraison ----------
   De petits vaisseaux transfèrent quelques conteneurs vers le port spatial
   pendant que le vaisseau principal reste en orbite. */
/* textures des navettes : générées UNE FOIS (buildShuttle est appelée à
   chaque largage, il ne faut pas refabriquer un canvas à chaque fois) */
const SHUTTLE_HULL_TEX = buildHullPanelTexture(SEED+':shuttle:hull', 0x8f3026, {hazard:true});
SHUTTLE_HULL_TEX.repeat.set(1.5, 1);
const SHUTTLE_CONT_TEX = buildHullPanelTexture(SEED+':shuttle:cont', 0xb0b0b0, {hazard:false});
SHUTTLE_CONT_TEX.repeat.set(1, 1);
const CONTAINER_PALETTE = [0xd9a12c, 0x2d5f9e, 0xa33a2e, 0x2f7a72];

/* Construit un conteneur seul (réutilisé à la fois par le stock près du
   bras de chargement et par l'attache avant de la navette une fois posé). */
function buildContainerMesh(){
  const mat = new THREE.MeshStandardMaterial({
    color: CONTAINER_PALETTE[Math.floor(Math.random()*CONTAINER_PALETTE.length)],
    map: SHUTTLE_CONT_TEX, metalness:0.3, roughness:0.78
  });
  return new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.8, 1.2), mat);
}
