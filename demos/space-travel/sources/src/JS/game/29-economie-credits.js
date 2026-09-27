/* =========================================================================
   ÉCONOMIE — crédits
   Chaque escale livre 1 à 5 conteneurs, répartis entre les navettes
   réellement larguées. Point important de cohérence : c'est CETTE
   répartition qui alimente à la fois le dialogue radio (qui annonce un
   nombre de conteneurs par navette) et le gain de crédits — un second
   tirage indépendant ferait dire à l'équipage des chiffres sans rapport
   avec ce qui est effectivement crédité.
   ========================================================================= */
let credits = 10000;
let creditsFlashTimer = null;
function formatCredits(n){
  try { return Math.round(n).toLocaleString(t('ttsLang') || 'fr-FR'); }
  catch(e){ return String(Math.round(n)); }
}
function refreshCreditsDisplay(flash){
  const el = document.getElementById('creditsVal');
  if(!el) return;
  el.textContent = formatCredits(credits);
  if(flash){
    el.style.color = 'var(--amber)';
    if(creditsFlashTimer) clearTimeout(creditsFlashTimer);
    creditsFlashTimer = setTimeout(function(){ el.style.color = ''; }, 1500);
  }
}
function addCredits(amount){
  credits = Math.max(0, credits + amount);
  refreshCreditsDisplay(amount > 0);
  if(typeof refreshPortPanel === 'function') refreshPortPanel();
}

const orbitState = {
  active:false, planet:null, center:new THREE.Vector3(),
  radius:0, U:new THREE.Vector3(), V:new THREE.Vector3(), N:new THREE.Vector3(),
  startPos:new THREE.Vector3(), startQuat:new THREE.Quaternion(),
  camPhase0:0, shuttles:[], spawned:[false,false,false],
  spawnFractions:[0.08,0.30,0.52],
  radioScript:[], radioIdx:0,
  voiceGender:{ship:'male', tower:'female'},
  /* répartition des conteneurs par navette + prix unitaire de l'escale */
  cargoSplit:[], unitPrice:0, creditsPaid:false,
  cutawayUntil:-1,  /* valeur de pauseTimer jusqu'à laquelle le plan large reste actif */
  cutawaySeq:null,  /* séquence de plans en cours ('lateral'|'face'|'travelling'|'shoulder') */
  cutawayStart:0,   /* pauseTimer au déclenchement, pour interpoler la progression de la séquence */
  cutawayShuttleId:-1,  /* identifie la navette suivie, pour ne pas en changer en cours de plan */
  cutawayCut:false  /* la coupure franche gros-plan -> suivi n'a lieu qu'une fois par séquence */
};
