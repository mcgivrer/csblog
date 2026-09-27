/* =========================================================================
   MUSIQUE DE FOND ET RÉGLAGE DES VOLUMES (demande utilisateur)
   ========================================================================= */
/* Fichier livré à part (pas embarqué en base64 dans le HTML — un simple
   fichier audio libre de droit, aucune raison d'alourdir le fichier
   principal) : chargé depuis un dossier `musics/` à côté du HTML, comme
   convenu. `Audio()` plutôt qu'un <audio> HTML : rien à afficher, juste à
   piloter par JS (lecture, boucle, volume). */
const MUSIC_PATH = 'musics/observation-des-etoiles_by_scorestudio_from_envato.m4a';
let musicVolume = 0.4, voiceVolume = 0.85;
const musicAudio = new Audio(MUSIC_PATH);
musicAudio.loop = true;
musicAudio.volume = musicVolume;
/* la lecture ne peut démarrer que sur un geste utilisateur (politique
   autoplay des navigateurs) — le clic qui referme le générique (§11, déjà
   un vrai geste) sert aussi de déclencheur ici, cf. plus bas dans ce
   fichier (bootEl.addEventListener). .catch() : un blocage éventuel du
   navigateur ne doit jamais faire remonter d'erreur bruyante, la musique
   est un agrément, pas une fonction critique. */
function setMusicVolume(v){
  musicVolume = THREE.MathUtils.clamp(v, 0, 1);
  musicAudio.volume = musicVolume;
}
function setVoiceVolume(v){
  voiceVolume = THREE.MathUtils.clamp(v, 0, 1);
}
let radioSpeaking = false;  /* false, ou l'utterance en cours de lecture */
let audioCtx = null;
function getAudioCtx(){
  if(!audioCtx){
    try{ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }
    catch(e){ audioCtx = null; }
  }
  return audioCtx;
}
function playRadioBlip(from){
  if(radioMuted) return;
  const ctx = getAudioCtx();
  if(!ctx) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  const baseFreq = from === 'tower' ? 920 : 640;
  osc.frequency.setValueAtTime(baseFreq, t0);
  osc.frequency.exponentialRampToValueAtTime(baseFreq*0.7, t0+0.09);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.05, t0+0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0+0.13);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0+0.15);
}

let ttsVoices = [];
function refreshVoices(){ if(window.speechSynthesis) ttsVoices = window.speechSynthesis.getVoices(); }
if(window.speechSynthesis){
  refreshVoices();
  window.speechSynthesis.onvoiceschanged = refreshVoices;
}
function pickVoice(from){
  if(!ttsVoices.length) return null;
  const langPrefix = t('ttsLang').slice(0,2);
  const langMatch = ttsVoices.filter(function(v){ return v.lang && v.lang.slice(0,2).toLowerCase() === langPrefix; });
  const pool = langMatch.length ? langMatch : ttsVoices;
  if(pool.length < 2) return pool[0] || null;
  /* le genre de chaque interlocuteur est tiré aléatoirement à chaque
     échange (cf. startOrbitDelivery) plutôt que fixé par rôle : parfois
     la tour est une voix masculine, parfois féminine, indépendamment de
     l'équipage — pour ne pas toujours entendre la même association.
     Les indices de nom couvrent plusieurs langues (les voix installées
     varient selon le navigateur/système, cf. §12.3 de la documentation). */
  const gender = orbitState.voiceGender[from];
  const pattern = gender === 'female'
    ? /female|femme|frau|mujer|amélie|amelie|marie|julie|samantha|karen|anna|maria|petra/i
    : /male|homme|mann|hombre|thomas|nicolas|paul|daniel|david|stefan|carlos|jorge/i;
  return pool.find(function(v){ return pattern.test(v.name); }) || pool[Math.floor(Math.random()*pool.length)];
}
function speakRadioLine(entry){
  if(radioMuted || !window.speechSynthesis){ return; }
  const u = new SpeechSynthesisUtterance(entry.text);
  const v = pickVoice(entry.from);
  if(v) u.voice = v;
  u.lang = (v && v.lang) || t('ttsLang');
  u.rate = entry.from === 'tower' ? 0.98 : 1.05;
  /* le ton suit le GENRE tiré pour cet interlocuteur, pas son rôle : la
     tour et l'équipage sonnent différemment selon le tirage du jour. */
  u.pitch = orbitState.voiceGender[entry.from] === 'female' ? 1.15 : 0.85;
  u.volume = voiceVolume;
  /* on bloque le message suivant tant que celui-ci n'est pas terminé —
     et on ne bloque JAMAIS indéfiniment : onend/onerror lèvent tous les
     deux la garde, et un filet de sécurité la lève aussi après un délai
     large (estimation très généreuse), au cas où l'évènement ne se
     déclencherait pas sur un navigateur particulier. */
  radioSpeaking = true;
  const release = function(){
    if(radioSpeaking === u) radioSpeaking = false;
  };
  u.onend = release;
  u.onerror = release;
  radioSpeaking = u;
  window.speechSynthesis.speak(u);
  setTimeout(function(){ if(radioSpeaking === u) radioSpeaking = false; }, 16000);
}
(function initRadioMuteButton(){
  const btn = document.getElementById('radioMuteBtn');
  if(!btn) return;
  btn.addEventListener('click', function(e){
    e.stopPropagation();
    toggleVoiceMute();
  });
})();
(function initPauseButtons(){
  const resumeBtn = document.getElementById('pauseResumeBtn');
  const quitBtn = document.getElementById('pauseQuitBtn');
  if(resumeBtn) resumeBtn.addEventListener('click', function(e){ e.stopPropagation(); resumeGame(); });
  if(quitBtn) quitBtn.addEventListener('click', function(e){ e.stopPropagation(); quitToTitle(); });
})();
