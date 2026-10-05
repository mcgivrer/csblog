/* =========================================================================
   0. INTERNATIONALISATION — français (existant), anglais, allemand,
   espagnol. Choisie sur l'écran-titre, avant que le jeu ne démarre
   réellement ; LANG reste constante pour toute la session.
   ========================================================================= */
let LANG = 'fr';
const I18N = {
  fr: {
    title_sub: 'Choisissez une langue',
    topBrand: 'NAVIGATION QUANTIQUE', seedLabel: 'SEED', onlineLabel: 'EN LIGNE',
    lblSpeed: 'Vitesse', lblSector: 'Secteur', lblHeading: 'Cap',
    lblFlightPlan: 'Plan de vol', lblNearest: 'OBJET LE PLUS PROCHE',
    lblItinerary: 'ITINÉRAIRE',
    lblEngineTemp: 'TEMPÉRATURE MOTEUR', lblPropulsion: 'PROPULSION', lblEngineCmd: 'COMMANDES MOTEUR',
    lblRadioChannel: 'CANAL RADIO', radioMuteTitle: 'Couper le son du canal radio',
    badge_auto: 'AUTOPILOTE', badge_manual: 'MANUEL', badge_orbit: 'MISE EN ORBITE',
    hint_main: '\u2191\u2193\u2190\u2192 / Z Q S D \u2014 orientation\u00a0 \u00b7 \u00a0E / R \u2014 roulis\u00a0 \u00b7 \u00a0MAJ \u2014 propulsion\u00a0 \u00b7 \u00a0glisser la souris \u2014 viser\u00a0 \u00b7 \u00a0CTRL+souris \u2014 regard libre\u00a0 \u00b7 \u00a0F3 \u2014 cam\u00e9ra\u00a0 \u00b7 \u00a0TAB \u2014 canal radio\u00a0 \u00b7 \u00a0F10 \u2014 voix\u00a0 \u00b7 \u00a0H \u2014 masquer',
    hint_arrival: 'ESPACE \u2014 abr\u00e9ger la man\u0153uvre (travelling acc\u00e9l\u00e9r\u00e9)',
    veille: 'veille', reactors14: 'R\u00c9ACTEURS {r}', rcsLabel: 'RCS',
    rcs_yawP:'LACET +', rcs_yawN:'LACET \u2212', rcs_pitchP:'TANGAGE +', rcs_pitchN:'TANGAGE \u2212', rcs_rollP:'ROULIS +', rcs_rollN:'ROULIS \u2212',
    portPrefix: 'Port de ', cityOf: 'Ville de ', navTarget: ' \u00b7 cible de navigation',
    submerged: '% immerg\u00e9', radiusUnit: 'rayon ', satellite:'satellite', satellites:'satellites',
    survolTitle:'SURVOL DU SYST\u00c8ME', survolHint:'touche ou clic\u00a0: retour au vaisseau', survolOrbit:'orbite',
    localStation:'station', localMoon:'lune', contractsEmpty:'Aucune destination locale pour l\u2019instant.',
    contractAccept:'Accepter', lblShipyardService:'Chantier naval', shipyardEquipped:'\u00c9quip\u00e9',
    shipyardOpenBtn:'Voir les long-courriers', shipyardBuyBtn:'Acheter', tierLabel:'Rang',
    lblShipyardTitle:'CHANTIER NAVAL', lblShipyardSub:'Un vaisseau \u00e9quip\u00e9 de saut ou de distorsion peut franchir les distances interstellaires.',
    lblContractsTitle:'PROCHAINE LIVRAISON \u2014 SYST\u00c8ME LOCAL', lblContractsSub:'Pas de g\u00e9n\u00e9rateur de saut ni d\u2019anneaux de distorsion \u00e0 bord\u00a0: livraisons dans ce syst\u00e8me en attendant.',
    interstellarSpace: 'Espace interstellaire',
    cam_tracking:'POURSUITE STANDARD', cam_sequence:'PLAN-S\u00c9QUENCE', cam_distant:'PLANS LOINTAINS', cam_closeup:'GROS PLANS', cameraLabel:'CAM\u00c9RA \u2014 ',
    planetKind_ocean:'monde oc\u00e9anique', planetKind_continental:'monde continental', planetKind_desert:'monde d\u00e9sertique',
    planetKind_ice:'monde glac\u00e9', planetKind_volcanic:'monde volcanique', planetKind_gas:'g\u00e9ante gazeuse',
    lum_V:'naine (s\u00e9quence principale)', lum_IV:'sous-g\u00e9ante', lum_III:'g\u00e9ante', lum_I:'supergéante', lum_D:'naine blanche',
    nebula_emission:'N\u00e9buleuse en \u00e9mission', nebula_hii:'R\u00e9gion HII', nebula_dark:'N\u00e9buleuse obscure',
    nebula_planetary:'N\u00e9buleuse plan\u00e9taire', nebula_supernova:'R\u00e9manent de supernova', nebula_nursery:'Pouponni\u00e8re stellaire',
    nebula_reflection:'N\u00e9buleuse par r\u00e9flexion', nebula_molecular:'Nuage mol\u00e9culaire', nebula_oiii:'N\u00e9buleuse en \u00e9mission OIII',
    ssImport:'Importer une création…', ssImportOk:'{n} création(s) ajoutée(s) au hangar.', ssImportSt:'{n} station(s) rejoindront les ports orbitaux.', ssImportErr:'Fichier refusé : exporte la composition depuis le chantier naval (bouton « Pour le jeu »).', ssModTip:'Création du chantier naval', ttsLang: 'fr-FR', quitConfirm:'Quitter la partie et revenir à l’écran-titre ? La progression sera perdue.',ssTitle:'Hangar — choisissez votre vaisseau', ssNote:'Sélection provisoire : elle sera remplacée par la boutique du chantier naval.', ssConfirm:'Embarquer', ssPrev:'Vaisseau précédent', ssNext:'Vaisseau suivant', ssHint:'← → vaisseau, ↑ ↓ propulsion, Entrée pour embarquer', ssPropSel:'Système de propulsion', ssOptE:'Epstein +', ssOptJ:'Saut quantique', ssOptW:'Supraluminique', ssWarp:'Supraluminique', ssWarpYes:'×{f} — anneaux de distorsion ×{n}', ssWarpOff:'Non installée', ssOptNote:'Supraluminique et saut quantique réservés aux long-courriers', ssJumpLater:'Non installé — module achetable en escale', ssTier:'Palier', ssReg:'Immatriculation', ssLen:'Longueur', ssWid:'Largeur', ssHei:'Hauteur', ssDry:'Masse à vide', ssLoaded:'Masse en charge', ssCont:'Conteneurs', ssTanks:'Réservoirs de glace', ssPax:'Passagers', ssCrew:'Équipage', ssProp:'Propulsion', ssPropVal:'Epstein, {n} tuyères', ssJump:'Saut quantique', ssJumpYes:'Générateur de saut', ssJumpNo:'Non disponible', ssDef:'Défense', ssDefVal:'Tourelles PDC ×{n}', ssRad:'Radiateurs', portJumpLongHaul:'Réservé aux long-courriers', noRoute: 'Aucune route', creditsLabel: 'CRÉDITS', menuNavPanel: 'Vitesse / cap', pauseTitle: 'PAUSE', pauseSub: 'Simulation suspendue', pauseResumeLbl: 'REPRENDRE', pauseQuitLbl: 'QUITTER \u2014 \u00c9CRAN-TITRE', pauseHint: 'ESPACE / ENTR\u00c9E \u2014 reprendre \u00b7 \u00c9CHAP \u2014 quitter', lblPortServices: 'SERVICES PORTUAIRES', lblSpeedUpgrade: 'Propulseurs', portUpgradeBtn: 'AM\u00c9LIORER', portMaxLevel: 'NIVEAU MAXIMAL', lblFuelService: 'Carburant', portFuelBtn: 'RAVITAILLER', portFuelFull: 'PLEIN', lblFuel: 'CARBURANT', lblJumpService: 'Saut quantique', portJumpBtn: 'ACHETER', portJumpAcquired: 'ACQUIS', lblAudioTitle: 'SON', lblMusicVolume: 'Musique', lblVoiceVolume: 'Voix', lblAudioFoot: 'V \u2014 masquer ce r\u00e9glage', jumpBannerText: 'SAUT QUANTIQUE EN COURS', lblHelpTitle: 'AIDE \u2014 COMMANDES', lblHelpFoot: 'H \u2014 masquer cette aide', hk_move: '\u2191\u2193\u2190\u2192 / ZQSD', hlp_move: 'Orientation (tangage / lacet)', hk_roll: 'E / R', hlp_roll: 'Roulis', hk_thrust: 'MAJ / ESPACE', hlp_thrust: 'Propulsion', hk_aim: 'Glisser la souris', hlp_aim: 'Vis\u00e9e fine', hk_freelook: 'CTRL + glisser', hlp_freelook: 'Regard libre', hlp_voice: 'Coupe/r\u00e9tablit la voix', hlp_skip: 'Abr\u00e8ge la man\u0153uvre / reprend la pause', hlp_pause: 'Met le jeu en pause', hlp_help: 'Affiche/masque cette aide', llmChecking: 'Détection de l\u2019IA embarquée en cours\u2026', llmActive: 'IA embarquée (Gemini Nano) active \u2014 dialogues générés dynamiquement', llmInactive: 'IA embarquée indisponible \u2014 dialogues par gabarits', shuttleLabelGeneric: 'NAVETTE', lblAutopilot: 'Pilote automatique', lblMissions: 'Tableau des missions', hlp_autopilot: 'Pilote automatique : débrayer / engager (arrimage, navette)', hlp_brake: 'Freinage (vol manuel)',
    modeTitle:'MODE DE JEU', modeNew:'Nouvelle campagne', modeNewSub:'Dirigez STT : un cargo Courlis, un capital de départ, une compagnie à bâtir.', modeContinue:'Continuer', modeContinueSub:'Reprendre la sauvegarde de ce navigateur.', modeFree:'Partie libre', modeFreeSub:'Choisir un vaisseau et voyager librement, sans campagne.',
    saveExport:'Exporter la sauvegarde', saveImport:'Importer…', saveDone:'Sauvegarde terminée.', saveError:'Sauvegarde impossible : fichier invalide ou trop récent.',
    modeReplace:'Une campagne existe : la remplacer ?', modeConfirm:'Confirmer', modeCancel:'Annuler', modeExportFirst:'Exporter d\u2019abord',
    conTitle:'Console de bord', conClose:'Fermer la console', conTabNav:'Navigation', conTabMissions:'Missions', conTabPort:'Port', conTabYard:'Chantier naval', conTabHelp:'Aide · Réglages', conEmptyMissions:'Aucune mission à afficher.', hk_console:'TAB', hlp_console:'Ouvre/ferme la console de bord (dernier onglet)', hlp_hudAlt:'Touches 1 à 8 : bascule les éléments du HUD (barre d\u2019icônes, dans l\u2019ordre ; radio sur 7)'
  },
  en: {
    title_sub: 'Choose a language',
    topBrand: 'QUANTUM NAVIGATION', seedLabel: 'SEED', onlineLabel: 'ONLINE',
    lblSpeed: 'Speed', lblSector: 'Sector', lblHeading: 'Heading',
    lblFlightPlan: 'Flight plan', lblNearest: 'NEAREST OBJECT',
    lblItinerary: 'ITINERARY',
    lblEngineTemp: 'ENGINE TEMPERATURE', lblPropulsion: 'PROPULSION', lblEngineCmd: 'ENGINE COMMANDS',
    lblRadioChannel: 'RADIO CHANNEL', radioMuteTitle: 'Mute the radio channel',
    badge_auto: 'AUTOPILOT', badge_manual: 'MANUAL', badge_orbit: 'ORBITAL INSERTION',
    hint_main: '\u2191\u2193\u2190\u2192 / W A S D \u2014 orientation\u00a0 \u00b7 \u00a0E / R \u2014 roll\u00a0 \u00b7 \u00a0SHIFT \u2014 thrust\u00a0 \u00b7 \u00a0drag mouse \u2014 aim\u00a0 \u00b7 \u00a0CTRL+mouse \u2014 free look\u00a0 \u00b7 \u00a0F3 \u2014 camera\u00a0 \u00b7 \u00a0TAB \u2014 radio channel\u00a0 \u00b7 \u00a0F10 \u2014 voice\u00a0 \u00b7 \u00a0H \u2014 hide',
    hint_arrival: 'SPACE \u2014 skip ahead (fast travelling)',
    veille: 'standby', reactors14: 'REACTORS {r}', rcsLabel: 'RCS',
    rcs_yawP:'YAW +', rcs_yawN:'YAW \u2212', rcs_pitchP:'PITCH +', rcs_pitchN:'PITCH \u2212', rcs_rollP:'ROLL +', rcs_rollN:'ROLL \u2212',
    portPrefix: 'Port of ', cityOf: 'City of ', navTarget: ' \u00b7 navigation target',
    submerged: '% submerged', radiusUnit: 'radius ', satellite:'moon', satellites:'moons',
    survolTitle:'SYSTEM FLYOVER', survolHint:'any key or click: back to the ship', survolOrbit:'orbit',
    localStation:'station', localMoon:'moon', contractsEmpty:'No local destination for now.',
    contractAccept:'Accept', lblShipyardService:'Shipyard', shipyardEquipped:'Equipped',
    shipyardOpenBtn:'View long-haulers', shipyardBuyBtn:'Buy', tierLabel:'Tier',
    lblShipyardTitle:'SHIPYARD', lblShipyardSub:'A ship fitted with a jump drive or warp rings can cross interstellar distances.',
    lblContractsTitle:'NEXT DELIVERY \u2014 LOCAL SYSTEM', lblContractsSub:'No jump drive or warp rings aboard: local deliveries in this system in the meantime.',
    interstellarSpace: 'Interstellar space',
    cam_tracking:'STANDARD TRACKING', cam_sequence:'ORBIT SHOT', cam_distant:'DISTANT SHOTS', cam_closeup:'CLOSE-UPS', cameraLabel:'CAMERA \u2014 ',
    planetKind_ocean:'ocean world', planetKind_continental:'continental world', planetKind_desert:'desert world',
    planetKind_ice:'ice world', planetKind_volcanic:'volcanic world', planetKind_gas:'gas giant',
    lum_V:'dwarf (main sequence)', lum_IV:'subgiant', lum_III:'giant', lum_I:'supergiant', lum_D:'white dwarf',
    nebula_emission:'Emission nebula', nebula_hii:'HII region', nebula_dark:'Dark nebula',
    nebula_planetary:'Planetary nebula', nebula_supernova:'Supernova remnant', nebula_nursery:'Stellar nursery',
    nebula_reflection:'Reflection nebula', nebula_molecular:'Molecular cloud', nebula_oiii:'OIII emission nebula',
    ssImport:'Import a design…', ssImportOk:'{n} design(s) added to the hangar.', ssImportSt:'{n} station(s) will join the orbital ports.', ssImportErr:'File rejected: export the composition from the shipyard editor (“For the game” button).', ssModTip:'Shipyard design', ttsLang: 'en-US', quitConfirm:'Quit the game and return to the title screen? Progress will be lost.',ssTitle:'Hangar — choose your ship', ssNote:'Temporary selection: it will be replaced by the shipyard store.', ssConfirm:'Board', ssPrev:'Previous ship', ssNext:'Next ship', ssHint:'← → ship, ↑ ↓ propulsion, Enter to board', ssPropSel:'Propulsion system', ssOptE:'Epstein +', ssOptJ:'Quantum jump', ssOptW:'FTL cruise', ssWarp:'FTL cruise', ssWarpYes:'×{f} — warp rings ×{n}', ssWarpOff:'Not fitted', ssOptNote:'FTL cruise and quantum jump reserved for long-haul ships', ssJumpLater:'Not fitted — module available in port', ssTier:'Tier', ssReg:'Registration', ssLen:'Length', ssWid:'Width', ssHei:'Height', ssDry:'Dry mass', ssLoaded:'Loaded mass', ssCont:'Containers', ssTanks:'Ice tanks', ssPax:'Passengers', ssCrew:'Crew', ssProp:'Propulsion', ssPropVal:'Epstein, {n} nozzles', ssJump:'Quantum jump', ssJumpYes:'Jump generator', ssJumpNo:'Not available', ssDef:'Defense', ssDefVal:'PDC turrets ×{n}', ssRad:'Radiators', portJumpLongHaul:'Long-haul ships only', noRoute: 'No route', creditsLabel: 'CREDITS', menuNavPanel: 'Speed / heading', pauseTitle: 'PAUSED', pauseSub: 'Simulation suspended', pauseResumeLbl: 'RESUME', pauseQuitLbl: 'QUIT \u2014 TITLE SCREEN', pauseHint: 'SPACE / ENTER \u2014 resume \u00b7 ESC \u2014 quit', lblPortServices: 'PORT SERVICES', lblSpeedUpgrade: 'Thrusters', portUpgradeBtn: 'UPGRADE', portMaxLevel: 'MAX LEVEL', lblFuelService: 'Fuel', portFuelBtn: 'REFUEL', portFuelFull: 'FULL', lblFuel: 'FUEL', lblJumpService: 'Quantum jump', portJumpBtn: 'BUY', portJumpAcquired: 'ACQUIRED', lblAudioTitle: 'AUDIO', lblMusicVolume: 'Music', lblVoiceVolume: 'Voice', lblAudioFoot: 'V \u2014 hide this setting', jumpBannerText: 'QUANTUM JUMP IN PROGRESS', lblHelpTitle: 'HELP \u2014 CONTROLS', lblHelpFoot: 'H \u2014 hide this help', hk_move: '\u2191\u2193\u2190\u2192 / WASD', hlp_move: 'Orientation (pitch / yaw)', hk_roll: 'E / R', hlp_roll: 'Roll', hk_thrust: 'SHIFT / SPACE', hlp_thrust: 'Thrust', hk_aim: 'Drag mouse', hlp_aim: 'Fine aim', hk_freelook: 'CTRL + drag', hlp_freelook: 'Free look', hlp_voice: 'Mute/unmute voice', hlp_skip: 'Skip maneuver / resume from pause', hlp_pause: 'Pause the game', hlp_help: 'Show/hide this help', llmChecking: 'Detecting on-device AI\u2026', llmActive: 'On-device AI (Gemini Nano) active \u2014 dialogue generated dynamically', llmInactive: 'On-device AI unavailable \u2014 template dialogue', shuttleLabelGeneric: 'SHUTTLE', lblAutopilot: 'Autopilot', lblMissions: 'Mission board', hlp_autopilot: 'Autopilot: disengage / engage (docking, shuttle)', hlp_brake: 'Brake (manual flight)',
    modeTitle:'GAME MODE', modeNew:'New campaign', modeNewSub:'Run STT: a Courlis freighter, starting capital, a company to build.', modeContinue:'Continue', modeContinueSub:'Resume the save stored in this browser.', modeFree:'Free play', modeFreeSub:'Pick a ship and fly freely, no campaign.',
    saveExport:'Export save', saveImport:'Import…', saveDone:'Save complete.', saveError:'Save failed: invalid or too recent a file.',
    modeReplace:'A campaign exists: replace it?', modeConfirm:'Confirm', modeCancel:'Cancel', modeExportFirst:'Export first',
    conTitle:'Ship console', conClose:'Close console', conTabNav:'Navigation', conTabMissions:'Missions', conTabPort:'Port', conTabYard:'Shipyard', conTabHelp:'Help · Settings', conEmptyMissions:'No mission to display.', hk_console:'TAB', hlp_console:'Open/close the ship console (last tab)', hlp_hudAlt:'Keys 1 to 8: toggle HUD elements (icon bar, in order; radio on 7)'
  },
  de: {
    title_sub: 'Sprache wählen',
    topBrand: 'QUANTENNAVIGATION', seedLabel: 'SEED', onlineLabel: 'ONLINE',
    lblSpeed: 'Geschwindigkeit', lblSector: 'Sektor', lblHeading: 'Kurs',
    lblFlightPlan: 'Flugplan', lblNearest: 'N\u00c4CHSTES OBJEKT',
    lblItinerary: 'ROUTE',
    lblEngineTemp: 'TRIEBWERKSTEMPERATUR', lblPropulsion: 'ANTRIEB', lblEngineCmd: 'TRIEBWERKSSTEUERUNG',
    lblRadioChannel: 'FUNKKANAL', radioMuteTitle: 'Funkkanal stummschalten',
    badge_auto: 'AUTOPILOT', badge_manual: 'MANUELL', badge_orbit: 'ORBITEINSCHUSS',
    hint_main: '\u2191\u2193\u2190\u2192 / W A S D \u2014 Ausrichtung\u00a0 \u00b7 \u00a0E / R \u2014 Rollen\u00a0 \u00b7 \u00a0SHIFT \u2014 Schub\u00a0 \u00b7 \u00a0Maus ziehen \u2014 Zielen\u00a0 \u00b7 \u00a0STRG+Maus \u2014 freie Sicht\u00a0 \u00b7 \u00a0F3 \u2014 Kamera\u00a0 \u00b7 \u00a0TAB \u2014 Funkkanal\u00a0 \u00b7 \u00a0F10 \u2014 Stimme\u00a0 \u00b7 \u00a0H \u2014 ausblenden',
    hint_arrival: 'LEERTASTE \u2014 Man\u00f6ver abk\u00fcrzen (schneller Kameraflug)',
    veille: 'Standby', reactors14: 'TRIEBWERKE {r}', rcsLabel: 'RCS',
    rcs_yawP:'GIEREN +', rcs_yawN:'GIEREN \u2212', rcs_pitchP:'NICKEN +', rcs_pitchN:'NICKEN \u2212', rcs_rollP:'ROLLEN +', rcs_rollN:'ROLLEN \u2212',
    portPrefix: 'Hafen von ', cityOf: 'Stadt ', navTarget: ' \u00b7 Navigationsziel',
    submerged: '% \u00fcberflutet', radiusUnit: 'Radius ', satellite:'Mond', satellites:'Monde',
    survolTitle:'SYSTEMRUNDFLUG', survolHint:'Taste oder Klick: zur\u00fcck zum Schiff', survolOrbit:'Umlaufbahn',
    localStation:'Station', localMoon:'Mond', contractsEmpty:'Momentan kein lokales Ziel.',
    contractAccept:'Annehmen', lblShipyardService:'Werft', shipyardEquipped:'Ausgestattet',
    shipyardOpenBtn:'Langstreckenschiffe ansehen', shipyardBuyBtn:'Kaufen', tierLabel:'Stufe',
    lblShipyardTitle:'WERFT', lblShipyardSub:'Ein Schiff mit Sprungantrieb oder Warpringen kann interstellare Entfernungen \u00fcberbr\u00fccken.',
    lblContractsTitle:'N\u00c4CHSTE LIEFERUNG \u2014 LOKALES SYSTEM', lblContractsSub:'Kein Sprungantrieb, keine Warpringe an Bord\u00a0: bis dahin lokale Lieferungen in diesem System.',
    interstellarSpace: 'Interstellarer Raum',
    cam_tracking:'STANDARDVERFOLGUNG', cam_sequence:'KREISFLUG', cam_distant:'FERNAUFNAHMEN', cam_closeup:'NAHAUFNAHMEN', cameraLabel:'KAMERA \u2014 ',
    planetKind_ocean:'Ozeanwelt', planetKind_continental:'Kontinentalwelt', planetKind_desert:'W\u00fcstenwelt',
    planetKind_ice:'Eiswelt', planetKind_volcanic:'Vulkanwelt', planetKind_gas:'Gasriese',
    lum_V:'Zwerg (Hauptreihe)', lum_IV:'Unterriese', lum_III:'Riese', lum_I:'\u00dcberriese', lum_D:'Wei\u00dfer Zwerg',
    nebula_emission:'Emissionsnebel', nebula_hii:'HII-Region', nebula_dark:'Dunkelnebel',
    nebula_planetary:'Planetarischer Nebel', nebula_supernova:'Supernova-\u00dcberrest', nebula_nursery:'Sternentstehungsgebiet',
    nebula_reflection:'Reflexionsnebel', nebula_molecular:'Molek\u00fcelwolke', nebula_oiii:'OIII-Emissionsnebel',
    ssImport:'Entwurf importieren…', ssImportOk:'{n} Entwurf/Entwürfe zum Hangar hinzugefügt.', ssImportSt:'{n} Station(en) werden zu Orbitalhäfen.', ssImportErr:'Datei abgelehnt: Komposition in der Werft exportieren („Für das Spiel“).', ssModTip:'Entwurf aus der Werft', ttsLang: 'de-DE', quitConfirm:'Spiel beenden und zum Titelbildschirm zurückkehren? Der Fortschritt geht verloren.',ssTitle:'Hangar — wähle dein Schiff', ssNote:'Vorläufige Auswahl: wird durch den Werftladen ersetzt.', ssConfirm:'An Bord gehen', ssPrev:'Vorheriges Schiff', ssNext:'Nächstes Schiff', ssHint:'← → Schiff, ↑ ↓ Antrieb, Eingabe zum Einsteigen', ssPropSel:'Antriebssystem', ssOptE:'Epstein +', ssOptJ:'Quantensprung', ssOptW:'Überlicht', ssWarp:'Überlichtflug', ssWarpYes:'×{f} — Warpringe ×{n}', ssWarpOff:'Nicht eingebaut', ssOptNote:'Überlichtflug und Quantensprung nur für Langstreckenschiffe', ssJumpLater:'Nicht eingebaut — Modul im Hafen erhältlich', ssTier:'Stufe', ssReg:'Kennung', ssLen:'Länge', ssWid:'Breite', ssHei:'Höhe', ssDry:'Leermasse', ssLoaded:'Beladene Masse', ssCont:'Container', ssTanks:'Eistanks', ssPax:'Passagiere', ssCrew:'Besatzung', ssProp:'Antrieb', ssPropVal:'Epstein, {n} Düsen', ssJump:'Quantensprung', ssJumpYes:'Sprunggenerator', ssJumpNo:'Nicht verfügbar', ssDef:'Verteidigung', ssDefVal:'PDC-Türme ×{n}', ssRad:'Radiatoren', portJumpLongHaul:'Nur für Langstreckenschiffe', noRoute: 'Keine Route', creditsLabel: 'GUTHABEN', menuNavPanel: 'Geschwindigkeit / Kurs', pauseTitle: 'PAUSE', pauseSub: 'Simulation angehalten', pauseResumeLbl: 'FORTSETZEN', pauseQuitLbl: 'BEENDEN \u2014 TITELBILDSCHIRM', pauseHint: 'LEERTASTE / EINGABE \u2014 fortsetzen \u00b7 ESC \u2014 beenden', lblPortServices: 'HAFENDIENSTE', lblSpeedUpgrade: 'Triebwerke', portUpgradeBtn: 'AUFR\u00dcSTEN', portMaxLevel: 'MAXIMALSTUFE', lblFuelService: 'Treibstoff', portFuelBtn: 'AUFTANKEN', portFuelFull: 'VOLL', lblFuel: 'TREIBSTOFF', lblJumpService: 'Quantensprung', portJumpBtn: 'KAUFEN', portJumpAcquired: 'ERWORBEN', lblAudioTitle: 'TON', lblMusicVolume: 'Musik', lblVoiceVolume: 'Stimme', lblAudioFoot: 'V \u2014 diese Einstellung ausblenden', jumpBannerText: 'QUANTENSPRUNG L\u00c4UFT', lblHelpTitle: 'HILFE \u2014 STEUERUNG', lblHelpFoot: 'H \u2014 Hilfe ausblenden', hk_move: '\u2191\u2193\u2190\u2192 / WASD', hlp_move: 'Ausrichtung (Nicken / Gieren)', hk_roll: 'E / R', hlp_roll: 'Rollen', hk_thrust: 'SHIFT / LEERTASTE', hlp_thrust: 'Schub', hk_aim: 'Maus ziehen', hlp_aim: 'Feinzielen', hk_freelook: 'STRG + ziehen', hlp_freelook: 'Freie Sicht', hlp_voice: 'Stimme stumm-/freischalten', hlp_skip: 'Man\u00f6ver abk\u00fcrzen / Pause fortsetzen', hlp_pause: 'Spiel pausieren', hlp_help: 'Diese Hilfe ein-/ausblenden', llmChecking: 'Geräteinterne KI wird erkannt\u2026', llmActive: 'Geräteinterne KI (Gemini Nano) aktiv \u2014 Dialoge dynamisch erzeugt', llmInactive: 'Geräteinterne KI nicht verfügbar \u2014 Dialoge aus Vorlagen', shuttleLabelGeneric: 'FÄHRE', lblAutopilot: 'Autopilot', lblMissions: 'Auftragstafel', hlp_autopilot: 'Autopilot: aus-/einschalten (Andocken, Fähre)', hlp_brake: 'Bremse (manueller Flug)',
    modeTitle:'SPIELMODUS', modeNew:'Neue Kampagne', modeNewSub:'Führen Sie STT: ein Frachter Courlis, Startkapital, eine Firma zum Aufbauen.', modeContinue:'Fortsetzen', modeContinueSub:'Den in diesem Browser gespeicherten Spielstand laden.', modeFree:'Freies Spiel', modeFreeSub:'Ein Schiff wählen und frei fliegen, ohne Kampagne.',
    saveExport:'Spielstand exportieren', saveImport:'Importieren…', saveDone:'Speichern abgeschlossen.', saveError:'Speichern fehlgeschlagen: ungültige oder zu neue Datei.',
    modeReplace:'Es gibt bereits eine Kampagne: ersetzen?', modeConfirm:'Bestätigen', modeCancel:'Abbrechen', modeExportFirst:'Zuerst exportieren',
    conTitle:'Bordkonsole', conClose:'Konsole schließen', conTabNav:'Navigation', conTabMissions:'Aufträge', conTabPort:'Hafen', conTabYard:'Werft', conTabHelp:'Hilfe · Einstellungen', conEmptyMissions:'Keine Aufträge anzuzeigen.', hk_console:'TAB', hlp_console:'Bordkonsole öffnen/schließen (letzter Reiter)', hlp_hudAlt:'Tasten 1 bis 8: HUD-Elemente umschalten (Symbolleiste, in Reihenfolge; Funk auf 7)'
  },
  es: {
    title_sub: 'Elige un idioma',
    topBrand: 'NAVEGACI\u00d3N CU\u00c1NTICA', seedLabel: 'SEED', onlineLabel: 'EN L\u00cdNEA',
    lblSpeed: 'Velocidad', lblSector: 'Sector', lblHeading: 'Rumbo',
    lblFlightPlan: 'Plan de vuelo', lblNearest: 'OBJETO M\u00c1S CERCANO',
    lblItinerary: 'ITINERARIO',
    lblEngineTemp: 'TEMPERATURA DE MOTORES', lblPropulsion: 'PROPULSI\u00d3N', lblEngineCmd: 'CONTROL DE MOTORES',
    lblRadioChannel: 'CANAL DE RADIO', radioMuteTitle: 'Silenciar el canal de radio',
    badge_auto: 'PILOTO AUTOM\u00c1TICO', badge_manual: 'MANUAL', badge_orbit: 'INSERCI\u00d3N ORBITAL',
    hint_main: '\u2191\u2193\u2190\u2192 / W A S D \u2014 orientaci\u00f3n\u00a0 \u00b7 \u00a0E / R \u2014 alabeo\u00a0 \u00b7 \u00a0MAY\u00daS \u2014 propulsi\u00f3n\u00a0 \u00b7 \u00a0arrastrar rat\u00f3n \u2014 apuntar\u00a0 \u00b7 \u00a0CTRL+rat\u00f3n \u2014 vista libre\u00a0 \u00b7 \u00a0F3 \u2014 c\u00e1mara\u00a0 \u00b7 \u00a0TAB \u2014 canal de radio\u00a0 \u00b7 \u00a0F10 \u2014 voz\u00a0 \u00b7 \u00a0H \u2014 ocultar',
    hint_arrival: 'ESPACIO \u2014 abreviar la maniobra (travelling acelerado)',
    veille: 'reposo', reactors14: 'REACTORES {r}', rcsLabel: 'RCS',
    rcs_yawP:'GUI\u00d1ADA +', rcs_yawN:'GUI\u00d1ADA \u2212', rcs_pitchP:'CABECEO +', rcs_pitchN:'CABECEO \u2212', rcs_rollP:'ALABEO +', rcs_rollN:'ALABEO \u2212',
    portPrefix: 'Puerto de ', cityOf: 'Ciudad de ', navTarget: ' \u00b7 destino de navegaci\u00f3n',
    submerged: '% sumergido', radiusUnit: 'radio ', satellite:'sat\u00e9lite', satellites:'sat\u00e9lites',
    survolTitle:'SOBREVUELO DEL SISTEMA', survolHint:'tecla o clic: volver a la nave', survolOrbit:'\u00f3rbita',
    localStation:'estaci\u00f3n', localMoon:'luna', contractsEmpty:'Sin destino local por ahora.',
    contractAccept:'Aceptar', lblShipyardService:'Astillero', shipyardEquipped:'Equipado',
    shipyardOpenBtn:'Ver de largo alcance', shipyardBuyBtn:'Comprar', tierLabel:'Rango',
    lblShipyardTitle:'ASTILLERO', lblShipyardSub:'Una nave equipada con salto o anillos de distorsi\u00f3n puede cruzar distancias interestelares.',
    lblContractsTitle:'PR\u00d3XIMA ENTREGA \u2014 SISTEMA LOCAL', lblContractsSub:'Sin generador de salto ni anillos de distorsi\u00f3n a bordo\u00a0: entregas locales en este sistema mientras tanto.',
    interstellarSpace: 'Espacio interestelar',
    cam_tracking:'SEGUIMIENTO EST\u00c1NDAR', cam_sequence:'PLANO ORBITAL', cam_distant:'PLANOS LEJANOS', cam_closeup:'PRIMEROS PLANOS', cameraLabel:'C\u00c1MARA \u2014 ',
    planetKind_ocean:'mundo oce\u00e1nico', planetKind_continental:'mundo continental', planetKind_desert:'mundo desértico',
    planetKind_ice:'mundo helado', planetKind_volcanic:'mundo volc\u00e1nico', planetKind_gas:'gigante gaseoso',
    lum_V:'enana (secuencia principal)', lum_IV:'subgigante', lum_III:'gigante', lum_I:'supergigante', lum_D:'enana blanca',
    nebula_emission:'Nebulosa de emisi\u00f3n', nebula_hii:'Regi\u00f3n HII', nebula_dark:'Nebulosa oscura',
    nebula_planetary:'Nebulosa planetaria', nebula_supernova:'Remanente de supernova', nebula_nursery:'Vivero estelar',
    nebula_reflection:'Nebulosa de reflexi\u00f3n', nebula_molecular:'Nube molecular', nebula_oiii:'Nebulosa de emisi\u00f3n OIII',
    ssImport:'Importar un diseño…', ssImportOk:'{n} diseño(s) añadido(s) al hangar.', ssImportSt:'{n} estación(es) se unirán a los puertos orbitales.', ssImportErr:'Archivo rechazado: exporta la composición desde el astillero («Para el juego»).', ssModTip:'Diseño del astillero', ttsLang: 'es-ES', quitConfirm:'Salir de la partida y volver a la pantalla de título? Se perderá el progreso.',ssTitle:'Hangar — elige tu nave', ssNote:'Selección provisional: será sustituida por la tienda del astillero.', ssConfirm:'Embarcar', ssPrev:'Nave anterior', ssNext:'Nave siguiente', ssHint:'← → nave, ↑ ↓ propulsión, Intro para embarcar', ssPropSel:'Sistema de propulsión', ssOptE:'Epstein +', ssOptJ:'Salto cuántico', ssOptW:'Superlumínica', ssWarp:'Velocidad superlumínica', ssWarpYes:'×{f} — anillos de distorsión ×{n}', ssWarpOff:'No instalada', ssOptNote:'Superlumínica y salto cuántico reservados a naves de largo recorrido', ssJumpLater:'No instalado — módulo disponible en puerto', ssTier:'Nivel', ssReg:'Matrícula', ssLen:'Longitud', ssWid:'Anchura', ssHei:'Altura', ssDry:'Masa en vacío', ssLoaded:'Masa cargada', ssCont:'Contenedores', ssTanks:'Tanques de hielo', ssPax:'Pasajeros', ssCrew:'Tripulación', ssProp:'Propulsión', ssPropVal:'Epstein, {n} toberas', ssJump:'Salto cuántico', ssJumpYes:'Generador de salto', ssJumpNo:'No disponible', ssDef:'Defensa', ssDefVal:'Torretas PDC ×{n}', ssRad:'Radiadores', portJumpLongHaul:'Solo naves de largo recorrido', noRoute: 'Sin ruta', creditsLabel: 'CRÉDITOS', menuNavPanel: 'Velocidad / rumbo', pauseTitle: 'PAUSA', pauseSub: 'Simulaci\u00f3n suspendida', pauseResumeLbl: 'REANUDAR', pauseQuitLbl: 'SALIR \u2014 PANTALLA DE INICIO', pauseHint: 'ESPACIO / INTRO \u2014 reanudar \u00b7 ESC \u2014 salir', lblPortServices: 'SERVICIOS PORTUARIOS', lblSpeedUpgrade: 'Propulsores', portUpgradeBtn: 'MEJORAR', portMaxLevel: 'NIVEL M\u00c1XIMO', lblFuelService: 'Combustible', portFuelBtn: 'REPOSTAR', portFuelFull: 'LLENO', lblFuel: 'COMBUSTIBLE', lblJumpService: 'Salto cu\u00e1ntico', portJumpBtn: 'COMPRAR', portJumpAcquired: 'ADQUIRIDO', lblAudioTitle: 'SONIDO', lblMusicVolume: 'M\u00fasica', lblVoiceVolume: 'Voz', lblAudioFoot: 'V \u2014 ocultar este ajuste', jumpBannerText: 'SALTO CU\u00c1NTICO EN CURSO', lblHelpTitle: 'AYUDA \u2014 CONTROLES', lblHelpFoot: 'H \u2014 ocultar esta ayuda', hk_move: '\u2191\u2193\u2190\u2192 / WASD', hlp_move: 'Orientaci\u00f3n (cabeceo / gui\u00f1ada)', hk_roll: 'E / R', hlp_roll: 'Alabeo', hk_thrust: 'MAY\u00daS / ESPACIO', hlp_thrust: 'Propulsi\u00f3n', hk_aim: 'Arrastrar rat\u00f3n', hlp_aim: 'Punter\u00eda fina', hk_freelook: 'CTRL + arrastrar', hlp_freelook: 'Vista libre', hlp_voice: 'Silencia/activa la voz', hlp_skip: 'Abreviar maniobra / reanudar pausa', hlp_pause: 'Pausa el juego', hlp_help: 'Muestra/oculta esta ayuda', llmChecking: 'Detectando IA integrada\u2026', llmActive: 'IA integrada (Gemini Nano) activa \u2014 diálogos generados dinámicamente', llmInactive: 'IA integrada no disponible \u2014 diálogos por plantilla', shuttleLabelGeneric: 'NAVE', lblAutopilot: 'Piloto automático', lblMissions: 'Tablón de misiones', hlp_autopilot: 'Piloto automático: desactivar / activar (atraque, lanzadera)', hlp_brake: 'Freno (vuelo manual)',
    modeTitle:'MODO DE JUEGO', modeNew:'Nueva campaña', modeNewSub:'Dirige STT: un carguero Courlis, capital inicial, una compañía por construir.', modeContinue:'Continuar', modeContinueSub:'Retomar la partida guardada en este navegador.', modeFree:'Partida libre', modeFreeSub:'Elegir una nave y volar libremente, sin campaña.',
    saveExport:'Exportar partida', saveImport:'Importar…', saveDone:'Guardado completado.', saveError:'Error al guardar: archivo inválido o demasiado reciente.',
    modeReplace:'Ya existe una campaña: ¿reemplazarla?', modeConfirm:'Confirmar', modeCancel:'Cancelar', modeExportFirst:'Exportar primero',
    conTitle:'Consola de a bordo', conClose:'Cerrar la consola', conTabNav:'Navegación', conTabMissions:'Misiones', conTabPort:'Puerto', conTabYard:'Astillero', conTabHelp:'Ayuda · Ajustes', conEmptyMissions:'Ninguna misión que mostrar.', hk_console:'TAB', hlp_console:'Abre/cierra la consola de a bordo (última pestaña)', hlp_hudAlt:'Teclas 1 a 8: alterna elementos del HUD (barra de iconos, en orden; radio en 7)'
  }
};
function t(key){
  const dict = I18N[LANG] || I18N.fr;
  if(key in dict) return dict[key];
  return (I18N.fr[key] !== undefined) ? I18N.fr[key] : key;
}

/* Dialogue radio : gabarits par langue, sous forme de fonctions (pas de
   simples chaînes) pour permettre l'interpolation des noms — équipage,
   tour de contrôle, ville, navette, nombre de conteneurs. */
const RADIO_TEMPLATES = {
  fr: {
    towerName: function(city){ return 'Contrôle ' + city; },
    shuttleLabel: function(i){ return 'Navette ' + i; },
    hail: function(tower,ship){ return [
      tower+', ici '+ship+', cargo en approche, demande autorisation de mise en orbite.',
      tower+', '+ship+' en finale, requête d\u2019autorisation d\u2019approche.'
    ]; },
    hailReply: function(tower,ship,city){ return [
      ship+', autorisation accordée, orbite standard confirmée. Bienvenue à '+city+'.',
      'Autorisation accordée, '+ship+'. Trajectoire propre, poursuivez.'
    ]; },
    dropoff: function(tower,ship,label,n){ return [
      tower+', largage de '+label+', '+n+' conteneur'+(n>1?'s':'')+' à bord, cap sur le port.',
      tower+', '+label+' détachée, cargaison confirmée pour livraison.'
    ]; },
    dropoffReply: function(label){ return [
      'Bien reçu, piste de réception dégagée pour '+label+'.',
      label+' identifiée, vous êtes autorisés à descendre.'
    ]; },
    techQuery: function(ship){ return [
      ship+', confirmez le blindage thermique de vos navettes avant rentrée.',
      ship+', état de propulsion de vos navettes ?'
    ]; },
    techReply: function(){ return [
      'Blindage nominal, navettes certifiées pour l\u2019entrée atmosphérique.',
      'Propulsion nominale, autonomie suffisante pour le retour à bord.'
    ]; },
    thanks: function(tower,ship){ return [
      'Cargaison réceptionnée, merci pour la livraison '+ship+'. Bon vol.',
      'Transfert terminé, merci de votre passage. '+tower+' termine.'
    ]; },
    thanksReply: function(tower,ship){ return [
      'Merci '+tower+', à la prochaine rotation.',
      'Bien reçu, merci pour l\u2019accueil. '+ship+' reprend sa route.'
    ]; },
    /* message de bienvenue du capitaine, joué une seule fois au tout
       début de la partie (amélioration demandée) — pas de tour de
       contrôle impliquée, juste l'équipage qui prend l'air. */
    welcome: function(ship){ return [
      'Ici le capitaine. Tous les systèmes du '+ship+' répondent, équipage au complet. On appareille.',
      'Poste de pilotage à l\u2019équipage : '+ship+' parée, cap sur la première étape.'
    ]; }
  },
  en: {
    towerName: function(city){ return city + ' Control'; },
    shuttleLabel: function(i){ return 'Shuttle ' + i; },
    hail: function(tower,ship){ return [
      tower+', this is '+ship+', cargo inbound, requesting orbital insertion clearance.'
    ]; },
    hailReply: function(tower,ship,city){ return [
      ship+', clearance granted, standard orbit confirmed. Welcome to '+city+'.'
    ]; },
    dropoff: function(tower,ship,label,n){ return [
      tower+', releasing '+label+', '+n+' container'+(n>1?'s':'')+' aboard, heading to the port.'
    ]; },
    dropoffReply: function(label){ return [
      'Copy that, landing pad clear for '+label+'.'
    ]; },
    techQuery: function(ship){ return [
      ship+', confirm thermal shielding on your shuttles before re-entry.'
    ]; },
    techReply: function(){ return [
      'Shielding nominal, shuttles certified for atmospheric entry.'
    ]; },
    thanks: function(tower,ship){ return [
      'Cargo received, thanks for the delivery '+ship+'. Safe travels.'
    ]; },
    thanksReply: function(tower,ship){ return [
      'Thanks '+tower+', see you next rotation.'
    ]; },
    welcome: function(ship){ return [
      'This is the captain speaking. All systems on the '+ship+' are green, full crew aboard. Let\u2019s get underway.'
    ]; }
  },
  de: {
    towerName: function(city){ return city + ' Kontrolle'; },
    shuttleLabel: function(i){ return 'Fähre ' + i; },
    hail: function(tower,ship){ return [
      tower+', hier '+ship+', Fracht im Anflug, bitte um Freigabe zum Orbiteinschuss.'
    ]; },
    hailReply: function(tower,ship,city){ return [
      ship+', Freigabe erteilt, Standardorbit bestätigt. Willkommen in '+city+'.'
    ]; },
    dropoff: function(tower,ship,label,n){ return [
      tower+', '+label+' wird ausgeklinkt, '+n+' Container an Bord, Kurs auf den Hafen.'
    ]; },
    dropoffReply: function(label){ return [
      'Verstanden, Landeplatz frei für '+label+'.'
    ]; },
    techQuery: function(ship){ return [
      ship+', bestätigen Sie den Hitzeschild Ihrer Fähren vor dem Wiedereintritt.'
    ]; },
    techReply: function(){ return [
      'Hitzeschild nominal, Fähren für den Wiedereintritt zertifiziert.'
    ]; },
    thanks: function(tower,ship){ return [
      'Fracht erhalten, danke für die Lieferung '+ship+'. Gute Reise.'
    ]; },
    thanksReply: function(tower,ship){ return [
      'Danke '+tower+', bis zur nächsten Rotation.'
    ]; },
    welcome: function(ship){ return [
      'Hier spricht der Kapitän. Alle Systeme der '+ship+' funktionieren einwandfrei, volle Besatzung an Bord. Los geht\u2019s.'
    ]; }
  },
  es: {
    towerName: function(city){ return 'Control ' + city; },
    shuttleLabel: function(i){ return 'Nave ' + i; },
    hail: function(tower,ship){ return [
      tower+', aquí '+ship+', carga en aproximación, solicito autorización de inserción orbital.'
    ]; },
    hailReply: function(tower,ship,city){ return [
      ship+', autorización concedida, órbita estándar confirmada. Bienvenido a '+city+'.'
    ]; },
    dropoff: function(tower,ship,label,n){ return [
      tower+', liberando '+label+', '+n+' contenedor'+(n>1?'es':'')+' a bordo, rumbo al puerto.'
    ]; },
    dropoffReply: function(label){ return [
      'Recibido, plataforma de aterrizaje libre para '+label+'.'
    ]; },
    techQuery: function(ship){ return [
      ship+', confirme el escudo térmico de sus naves antes de la reentrada.'
    ]; },
    techReply: function(){ return [
      'Escudo nominal, naves certificadas para la reentrada atmosférica.'
    ]; },
    thanks: function(tower,ship){ return [
      'Carga recibida, gracias por la entrega '+ship+'. Buen viaje.'
    ]; },
    thanksReply: function(tower,ship){ return [
      'Gracias '+tower+', hasta la próxima rotación.'
    ]; },
    welcome: function(ship){ return [
      'Habla el capitán. Todos los sistemas del '+ship+' en verde, tripulación al completo. Zarpamos.'
    ]; }
  }
};

/* applique la langue choisie à tous les libellés STATIQUES du HUD — les
   textes générés dynamiquement (jauges, panneau le plus proche, radio…)
   appellent t()/RADIO_TEMPLATES directement à chaque mise à jour. */
function applyLanguage(){
  const map = {
    topBrand:'topBrand', seedLabel:'seedLabel', onlineLabel:'onlineLabel',
    lblSpeed:'lblSpeed', lblSector:'lblSector', lblHeading:'lblHeading',
    lblFlightPlan:'lblFlightPlan', lblNearest:'lblNearest',
    lblItinerary:'lblItinerary',
    lblEngineTemp:'lblEngineTemp', lblPropulsion:'lblPropulsion', lblEngineCmd:'lblEngineCmd',
    lblRadioChannel:'lblRadioChannel', creditsLabel:'creditsLabel',
    lblPortServices:'lblPortServices', lblSpeedUpgrade:'lblSpeedUpgrade', lblFuelService:'lblFuelService', lblFuel:'lblFuel',
    lblJumpService:'lblJumpService',
    lblAudioTitle:'lblAudioTitle', lblMusicVolume:'lblMusicVolume', lblVoiceVolume:'lblVoiceVolume', lblAudioFoot:'lblAudioFoot',
    lblShipyardService:'lblShipyardService', lblShipyardTitle:'lblShipyardTitle', lblShipyardSub:'lblShipyardSub',
    lblContractsTitle:'lblContractsTitle', lblContractsSub:'lblContractsSub'
  };
  Object.keys(map).forEach(function(id){
    const el = document.getElementById(id);
    if(el) el.textContent = t(map[id]);
  });
  if(typeof buildHelpGrid === 'function') buildHelpGrid();
  updateLLMIndicator();
  const pauseMap = { pauseTitle:'pauseTitle', pauseSub:'pauseSub', pauseResumeLbl:'pauseResumeLbl', pauseQuitLbl:'pauseQuitLbl', pauseHint:'pauseHint' };
  Object.keys(pauseMap).forEach(function(id){
    const el = document.getElementById(id);
    if(el) el.textContent = t(pauseMap[id]);
  });
  if(typeof refreshPortPanel === 'function') refreshPortPanel();
  const arrivalHint = document.getElementById('arrivalHint');
  if(arrivalHint) arrivalHint.textContent = t('hint_arrival');
  const muteBtn = document.getElementById('radioMuteBtn');
  if(muteBtn) muteBtn.title = t('radioMuteTitle');
  document.documentElement.lang = LANG;
}

