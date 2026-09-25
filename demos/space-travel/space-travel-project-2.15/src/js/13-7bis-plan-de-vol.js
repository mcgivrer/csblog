/* =========================================================================
   7bis. PLAN DE VOL — route jalonnée d'étoiles, calculée en amont
   La route est établie au démarrage, avant le premier rendu : on cherche
   de proche en proche l'étoile suivante dans un cône vers l'avant, à une
   distance de saut plausible. Comme `starDataForCell` est purement
   déterministe, la route ne dépend que du seed — deux exécutions avec la
   même graine donnent exactement le même itinéraire.
   ========================================================================= */
const ROUTE = {
  legs: [],        /* étoiles-étapes, dans l'ordre */
  index: 0,        /* étape visée */
  gates: null,     /* portiques rectangulaires matérialisant la route */
  curve: null,     /* spline de Catmull-Rom passant par les étapes */
  length: 0,       /* longueur d'arc totale */
  s: 0,            /* abscisse curviligne du vaisseau sur la courbe */
  legS: [],        /* abscisse curviligne de chaque étape */
  builtSystems: new Map()  /* legIndex -> Group ; seules l'étape en cours et
                               la suivante ont des maillages réellement en scène */
};

