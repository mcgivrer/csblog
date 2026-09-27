/* =========================================================================
   SON ET VOIX DU CANAL RADIO
   Le bip est synthétisé (Web Audio), pas un fichier audio à charger.
   Pour la voix : il n'existe pas d'API internet gratuite et sans clé qui
   fasse de la synthèse vocale multi-voix depuis une page statique — la
   seule option réellement gratuite, sans inscription ni clé, est l'API
   navigateur SpeechSynthesis (locale : elle utilise les voix déjà
   installées par le système/navigateur, pas un service distant). C'est
   ce qu'on utilise ici ; le nombre et la qualité des voix disponibles
   varient selon le navigateur et l'OS de la personne qui joue.
   ========================================================================= */
let radioMuted = false;