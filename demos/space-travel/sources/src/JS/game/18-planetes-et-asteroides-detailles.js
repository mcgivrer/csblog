/* =========================================================================
   7quater. PLANÈTES ET ASTÉROÏDES DÉTAILLÉS (v2.16)
   Repris de la démo « Observation des étoiles » (v4), qui pilotait le moteur
   v2.15 sans le modifier. Deux modules autonomes, raccordés au jeu par :
     ensureSystemsBuilt()  → enhanceSystem()        (construction d'un système)
     disposePlanetGroup()  → detachShared / release  (avant sa destruction)
     updatePlanetSystems() → setPixelAngle, update, lod (à chaque image)
   Ajout propre au jeu : détail géométrique selon la taille à l'écran (PL.lod).
   ========================================================================= */